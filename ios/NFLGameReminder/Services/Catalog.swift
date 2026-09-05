import Foundation

/// Markets, affiliates, providers and streaming services, loaded from the bundled JSON that the
/// web version also uses. ZIP -> market -> station -> channel number on the user's provider.
final class Catalog {
    static let shared = Catalog()
    let markets: [String: Market]
    let zipPrefixes: [String: String]
    let providers: [String: Provider]
    let services: [String: StreamingService]
    let networkLabels: [String: String]
    let overrides: [String: [String: [String: [String: String]]]]

    static let linearNetworks: Set<String> = ["CBS", "FOX", "NBC", "ABC", "ESPN", "ESPN2", "NFLN"]
    static let localNetworks: Set<String> = ["CBS", "FOX", "NBC", "ABC"]

    init(bundle: Bundle = .main) {
        func load<T: Decodable>(_ name: String, as: T.Type) -> T? {
            guard let url = bundle.url(forResource: name, withExtension: "json"), let data = try? Data(contentsOf: url) else { return nil }
            return try? JSONDecoder().decode(T.self, from: data)
        }
        let m = load("markets", as: MarketsFile.self)
        var mk: [String: Market] = [:]
        for (k, var v) in m?.markets ?? [:] { v.id = k; mk[k] = v }
        markets = mk
        zipPrefixes = m?.zipPrefixes ?? [:]
        let p = load("providers", as: ProvidersFile.self)
        var pv: [String: Provider] = [:]
        for (k, var v) in p?.providers ?? [:] { v.id = k; pv[k] = v }
        providers = pv
        var sv: [String: StreamingService] = [:]
        for (k, var v) in p?.services ?? [:] { v.id = k; sv[k] = v }
        services = sv
        networkLabels = p?.networkLabels ?? [:]
        overrides = load("overrides-2026", as: OverridesFile.self)?.overrides ?? [:]
    }

    var marketList: [Market] { markets.values.sorted { $0.name < $1.name } }
    var providerList: [Provider] { providers.values.sorted { $0.name < $1.name } }
    var serviceList: [StreamingService] { services.values.sorted { $0.name < $1.name } }
    func label(_ network: String) -> String { networkLabels[network] ?? network }

    func market(forZip zip: String) -> Market? {
        let digits = zip.filter(\.isNumber)
        guard digits.count >= 3, let key = zipPrefixes[String(digits.prefix(3))] else { return nil }
        return markets[key]
    }

    // MARK: channel resolution
    func channel(for network: String, user: UserProfile) -> ChannelInfo {
        let market = user.activeMarket.flatMap { markets[$0] }
        let provider = user.provider.flatMap { providers[$0] }
        var out = ChannelInfo(network: network, label: label(network), stationCall: nil, stationOta: nil, number: nil, source: nil, confidence: .unknown, hint: nil)
        if Catalog.localNetworks.contains(network) {
            let aff = market?.affiliates[network]
            out.stationCall = aff?.call; out.stationOta = aff?.ota
            if let o = user.channelOverrides[network], !o.isEmpty {
                out.number = o; out.source = "you set this"; out.confidence = .confirmed
            } else if provider?.kind == "ota", let a = aff {
                out.number = String(a.ota); out.source = "over-the-air channel"; out.confidence = .confirmed
            } else if provider?.localsMatchOta == true, let a = aff {
                out.number = String(a.ota); out.source = "\(provider!.name) carries locals on their over-the-air number"; out.confidence = .likely
            } else if provider?.kind == "stream" {
                out.confidence = .na; out.source = provider?.name
                out.hint = aff.map { "Search \"\($0.call)\" or \"\(network)\" in the \(provider!.name) guide." } ?? provider?.guideHint
            } else if let p = provider {
                out.confidence = .unknown; out.source = p.name; out.hint = p.guideHint ?? "Set your channel number once in Settings."
            } else if let a = aff { out.hint = "Over the air: channel \(a.ota)." }
        } else {
            if let o = user.channelOverrides[network], !o.isEmpty {
                out.number = o; out.source = "you set this"; out.confidence = .confirmed
            } else if let n = provider?.national[network] {
                out.number = String(n); out.source = "\(provider!.name) standard lineup"; out.confidence = .confirmed
            } else if provider?.kind == "stream" {
                out.confidence = .na; out.source = provider?.name; out.hint = "Search \"\(label(network))\" in the \(provider!.name) guide."
            } else if let p = provider {
                out.confidence = .unknown; out.source = p.name; out.hint = p.guideHint ?? "Set your channel number once in Settings."
            }
        }
        return out
    }

    // MARK: access check (Gap 5)
    func access(for game: Game, user: UserProfile) -> AccessResult {
        let provider = user.provider.flatMap { providers[$0] }
        let owned = Set(user.services)
        var ways: [WayToWatch] = []
        var missing: [MissingOption] = []
        var notes: [String] = []
        for n in game.networks {
            let ch = channel(for: n, user: user)
            if provider?.carries.contains(n) == true {
                ways.append(.init(kind: "tv", network: n, label: label(n), channel: ch))
            } else if Catalog.localNetworks.contains(n), user.hasAntenna {
                var u = user; u.provider = "ota"; u.channelOverrides = [:]
                ways.append(.init(kind: "ota", network: n, label: "\(label(n)) over the air", channel: channel(for: n, user: u)))
            } else {
                missing.append(.init(network: n, label: label(n), cost: nil, hint: Catalog.localNetworks.contains(n) ? "Free with an antenna" : nil))
            }
        }
        for s in game.streams {
            let svc = services[s] ?? services.values.first(where: { $0.carries.contains(s) })
            let have = owned.contains(s) || owned.contains(where: { services[$0]?.carries.contains(s) == true })
            if have { ways.append(.init(kind: "stream", network: s, label: label(s), channel: nil)) }
            else { missing.append(.init(network: s, label: label(s), cost: svc?.cost, hint: svc?.note)) }
        }
        for have in owned {
            guard let svc = services[have] else { continue }
            for n in game.networks where svc.carries.contains(n) && !ways.contains(where: { $0.network == have }) {
                ways.append(.init(kind: "stream", network: have, label: "\(svc.name) (streams \(label(n)))", channel: nil))
            }
        }
        let local = [game.home, game.away].contains { Teams.market($0) == user.activeMarket }
        if owned.contains("SundayTicket"), ["SUN_EARLY", "SUN_LATE"].contains(game.window) {
            if local { notes.append("Sunday Ticket does not carry your local game. Use your CBS/FOX station.") }
            else { ways.append(.init(kind: "stream", network: "SundayTicket", label: "NFL Sunday Ticket (out-of-market)", channel: nil)) }
        }
        if owned.contains("NFL+") {
            let primetime = ["SNF", "MNF", "TNF", "KICKOFF", "HOLIDAY"].contains(game.window)
            if primetime || local { ways.append(.init(kind: "stream", network: "NFL+", label: "NFL+ (phone/tablet only)", channel: nil)); notes.append("NFL+ streams this on phone and tablet only, not on a TV.") }
        }
        if let p = provider, let cn = p.carriageNotes, game.networks.contains(where: { !p.carries.contains($0) }) { notes.append(cn) }
        return AccessResult(ok: !ways.isEmpty, ways: ways, missing: missing, notes: notes, exclusive: game.exclusive)
    }
}
