import Foundation

/// Schedule source of truth: bundled seed, then live ESPN sync with field-level diffing so a
/// flexed game becomes a change event (and a notification) instead of silently moving.
@MainActor
final class ScheduleStore: ObservableObject {
    @Published private(set) var games: [Game] = []
    @Published private(set) var changes: [ScheduleChange] = []
    @Published private(set) var source = "seed"
    @Published private(set) var lastSync: Date?
    @Published private(set) var lastError: String?

    let season: Int
    private let fileURL: URL
    private let changesURL: URL
    private let session: URLSession

    struct Snapshot: Codable { var season: Int; var games: [Game]; var source: String; var lastSync: Date? }
    struct ChangeLog: Codable { var version: Int; var changes: [ScheduleChange] }

    /// Bump when a bug leaves stored history untrustworthy. Builds before version 2 recorded the
    /// first seed-to-live sync as though every game had moved, so those files are discarded on
    /// upgrade: no history beats history that says a game moved when it did not.
    static let changeLogVersion = 2

    init(season: Int = 2026, session: URLSession = .shared, directory: URL? = nil) {
        self.season = season
        self.session = session
        let dir = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("schedule-\(season).json")
        changesURL = dir.appendingPathComponent("changes-\(season).json")
        load()
    }

    func load() {
        if let data = try? Data(contentsOf: fileURL), let snap = try? JSONDecoder().decode(Snapshot.self, from: data), !snap.games.isEmpty {
            games = snap.games.sorted { $0.kickoff < $1.kickoff }; source = snap.source; lastSync = snap.lastSync
        } else {
            games = Self.loadSeed(season: season); source = "seed"
        }
        if let data = try? Data(contentsOf: changesURL),
           let log = try? JSONDecoder().decode(ChangeLog.self, from: data),
           log.version >= Self.changeLogVersion {
            changes = log.changes
        } else {
            changes = []
            try? FileManager.default.removeItem(at: changesURL)
        }
    }

    nonisolated static func loadSeed(season: Int, bundle: Bundle = .main) -> [Game] {
        guard let url = bundle.url(forResource: "seed-\(season)", withExtension: "json"), let data = try? Data(contentsOf: url), let seed = try? JSONDecoder().decode(SeedFile.self, from: data) else { return [] }
        return seed.games.sorted { $0.kickoff < $1.kickoff }
    }

    private func persist() {
        if let d = try? JSONEncoder().encode(Snapshot(season: season, games: games, source: source, lastSync: lastSync)) { try? d.write(to: fileURL, options: .atomic) }
        let log = ChangeLog(version: Self.changeLogVersion, changes: changes.suffix(500).map { $0 })
        if let d = try? JSONEncoder().encode(log) { try? d.write(to: changesURL, options: .atomic) }
    }

    var weeks: [Int] { Array(Set(games.map(\.week))).sorted() }
    func week(_ n: Int) -> [Game] { games.filter { $0.week == n }.sorted { $0.kickoff < $1.kickoff } }
    func game(_ id: String) -> Game? { games.first { $0.id == id } }
    func currentWeek(now: Date = Date()) -> Int {
        for w in weeks { if let last = week(w).map(\.kickoff).max(), last.addingTimeInterval(4 * 3600) > now { return w } }
        return weeks.last ?? 1
    }

    // MARK: diff + apply
    nonisolated static func diff(old: [Game], new: [Game], at: Date = Date()) -> [ScheduleChange] {
        var out: [ScheduleChange] = []
        let oldBy = Dictionary(old.map { ($0.matchKey, $0) }, uniquingKeysWith: { a, _ in a })
        let newBy = Dictionary(new.map { ($0.matchKey, $0) }, uniquingKeysWith: { a, _ in a })
        var cal = Calendar(identifier: .gregorian); cal.timeZone = BroadcastWindows.eastern
        for (k, n) in newBy {
            guard let o = oldBy[k] else { out.append(.init(at: at, kind: .added, field: nil, gameId: n.id, oldValue: nil, newValue: nil)); continue }
            if o.kickoff != n.kickoff {
                let sameDay = cal.isDate(o.kickoff, inSameDayAs: n.kickoff)
                out.append(.init(at: at, kind: sameDay ? .time : .date, field: "kickoff", gameId: n.id, oldValue: DateParsing.iso.string(from: o.kickoff), newValue: DateParsing.iso.string(from: n.kickoff)))
            }
            if o.networks != n.networks { out.append(.init(at: at, kind: .network, field: "networks", gameId: n.id, oldValue: o.networks.joined(separator: "/"), newValue: n.networks.joined(separator: "/"))) }
            if o.streams != n.streams { out.append(.init(at: at, kind: .network, field: "streams", gameId: n.id, oldValue: o.streams.joined(separator: "/"), newValue: n.streams.joined(separator: "/"))) }
            if o.home != n.home || o.away != n.away { out.append(.init(at: at, kind: .teams, field: "teams", gameId: n.id, oldValue: "\(o.away)@\(o.home)", newValue: "\(n.away)@\(n.home)")) }
        }
        for (k, o) in oldBy where newBy[k] == nil { out.append(.init(at: at, kind: .removed, field: nil, gameId: o.id, oldValue: nil, newValue: nil)) }
        return out
    }

    @discardableResult
    func apply(_ live: [Game], source: String) -> [ScheduleChange] {
        let previousSource = self.source
        let delta = Self.diff(old: games, new: live)
        let liveKeys = Set(live.map(\.matchKey)), liveWeeks = Set(live.map(\.week))
        let kept = games.filter { !liveKeys.contains($0.matchKey) && !liveWeeks.contains($0.week) }
        games = (live + kept).sorted { $0.kickoff < $1.kickoff }
        self.source = source; lastSync = Date(); lastError = nil
        // Going from the bundled seed to the live feed is a data-source upgrade, not a schedule
        // change; recording it would tell users games "moved" when nothing did.
        let wasSeed = previousSource == "seed" && source != "seed"
        if !wasSeed {
            changes.append(contentsOf: delta.filter {
                guard [.time, .date, .network].contains($0.kind) else { return false }
                // A listing disappearing from the feed is a gap in the data, not a schedule change.
                return $0.kind != .network || $0.newValue?.isEmpty == false
            })
        }
        persist()
        return wasSeed ? [] : delta
    }

    /// Dev helper mirroring the server's simulate-change endpoint.
    func simulateFlex(gameId: String, kickoff: Date? = nil, networks: [String]? = nil, streams: [String]? = nil, window: String? = nil) -> [ScheduleChange] {
        guard var g = game(gameId) else { return [] }
        if let k = kickoff { g.kickoff = k }
        if let n = networks { g.networks = n }
        if let s = streams { g.streams = s }
        if let w = window { g.window = w }
        return apply(games.map { $0.id == gameId ? g : $0 }, source: source + "+simulated")
    }

    // MARK: live sync
    func sync() async -> [ScheduleChange] {
        do {
            let live = try await ESPNAdapter.fetchSeason(season, session: session)
            guard !live.isEmpty else { throw URLError(.zeroByteResource) }
            return apply(live, source: "espn")
        } catch {
            lastError = "\(Date().formatted(date: .abbreviated, time: .shortened)): \(error.localizedDescription)"
            return []
        }
    }
}

// MARK: - ESPN public scoreboard adapter

enum ESPNAdapter {
    static let base = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
    private static let networkMap: [String: String] = [
        "CBS": "CBS", "FOX": "FOX", "NBC": "NBC", "ABC": "ABC", "ESPN": "ESPN", "ESPN2": "ESPN2",
        "NFL NET": "NFLN", "NFL NETWORK": "NFLN", "NFLN": "NFLN",
        "PRIME VIDEO": "Prime", "AMAZON PRIME": "Prime", "AMAZON": "Prime", "PRIME": "Prime",
        "NETFLIX": "Netflix", "PEACOCK": "Peacock", "ESPN+": "ESPN+", "DISNEY+": "Disney+",
        "PARAMOUNT+": "Paramount+", "FOX ONE": "FOX One", "NFL+": "NFL+", "YOUTUBE": "YouTube", "YOUTUBE TV": "YouTube",
    ]
    static func normalizeNetwork(_ raw: String) -> [String] {
        let key = raw.trimmingCharacters(in: .whitespaces).uppercased()
        if let n = networkMap[key] { return [n] }
        if key.contains("/") { return key.split(separator: "/").flatMap { normalizeNetwork(String($0)) } }
        return [raw.trimmingCharacters(in: .whitespaces)]
    }

    struct Scoreboard: Decodable { var events: [Event] }
    struct Event: Decodable {
        var id: String; var date: String; var name: String?
        var week: Week?; var status: Status?; var competitions: [Competition]
        struct Week: Decodable { var number: Int }
        struct Status: Decodable { var type: StatusType?; struct StatusType: Decodable { var state: String? } }
        struct Competition: Decodable {
            var competitors: [Competitor]; var broadcasts: [Broadcast]?; var geoBroadcasts: [GeoBroadcast]?; var venue: Venue?; var timeValid: Bool?
            struct Competitor: Decodable { var homeAway: String; var team: Team; struct Team: Decodable { var abbreviation: String } }
            struct Broadcast: Decodable { var names: [String]? }
            struct GeoBroadcast: Decodable { var market: Market?; var media: Media?; struct Market: Decodable { var type: String? }; struct Media: Decodable { var shortName: String? } }
            struct Venue: Decodable { var fullName: String?; var address: Address?; struct Address: Decodable { var city: String? } }
        }
    }

    static func normalize(_ ev: Event, season: Int) -> Game? {
        guard let comp = ev.competitions.first,
              let home = comp.competitors.first(where: { $0.homeAway == "home" }).flatMap({ Teams.normalize($0.team.abbreviation) }),
              let away = comp.competitors.first(where: { $0.homeAway == "away" }).flatMap({ Teams.normalize($0.team.abbreviation) }),
              let kickoff = DateParsing.parse(ev.date) else { return nil }
        var names: [String] = []
        var national = false
        for b in comp.broadcasts ?? [] { for n in b.names ?? [] { names += normalizeNetwork(n) } }
        for g in comp.geoBroadcasts ?? [] {
            if let s = g.media?.shortName { names += normalizeNetwork(s) }
            if g.market?.type?.lowercased() == "national" { national = true }
        }
        var seen = Set<String>(); names = names.filter { seen.insert($0).inserted }
        let networks = names.filter { Catalog.linearNetworks.contains($0) }
        let streams = names.filter { !Catalog.linearNetworks.contains($0) }
        let week = ev.week?.number ?? 0
        let window = BroadcastWindows.infer(kickoff: kickoff, streams: streams)
        if ["SNF", "MNF", "TNF", "KICKOFF", "HOLIDAY", "SAT", "INTL"].contains(window) { national = true }
        let venue = comp.venue?.fullName.map { v in comp.venue?.address?.city.map { "\(v), \($0)" } ?? v }
        let label = ev.name.flatMap { $0.range(of: "kickoff|christmas|thanksgiving|international", options: [.regularExpression, .caseInsensitive]) != nil ? $0 : nil }
        return Game(id: "\(season)-W\(String(format: "%02d", week))-\(away)-\(home)", week: week, kickoff: kickoff, away: away, home: home, networks: networks, streams: streams,
                    exclusive: networks.isEmpty && streams.count == 1 ? streams[0] : nil, window: window, national: national, venue: venue, label: label, notes: nil, verified: true,
                    timeTbd: comp.timeValid == false, source: "espn")
    }

    static func fetchWeek(_ season: Int, week: Int, session: URLSession = .shared) async throws -> [Game] {
        var req = URLRequest(url: URL(string: "\(base)?dates=\(season)&seasontype=2&week=\(week)")!)
        req.timeoutInterval = 10
        req.setValue("nfl-game-reminder-ios/1.0", forHTTPHeaderField: "User-Agent")
        let (data, resp) = try await session.data(for: req)
        guard (resp as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(Scoreboard.self, from: data).events.compactMap { normalize($0, season: season) }
    }

    static func fetchSeason(_ season: Int, weeks: Int = 18, session: URLSession = .shared) async throws -> [Game] {
        try await withThrowingTaskGroup(of: [Game].self) { group in
            for w in 1...weeks { group.addTask { try await fetchWeek(season, week: w, session: session) } }
            var all: [Game] = []
            for try await g in group { all += g }
            return all.sorted { $0.kickoff < $1.kickoff }
        }
    }
}
