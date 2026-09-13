import Foundation

/// Which CBS/FOX Sunday-afternoon game does a market receive? Same rule order as the server:
/// published map -> local team -> single candidate -> affinity team -> predicted.
///
/// `published` is the fetched coverage feed (see CoverageFeed). It is passed in rather than read
/// from a shared instance so the engine stays a pure function of its inputs and the tests can
/// state exactly which map they are reasoning about.
enum CoverageEngine {
    struct WindowPick { let game: Game?; let confidence: Confidence; let reason: String }

    static func windowGame(games: [Game], week: Int, marketKey: String?, network: String, window: String, catalog: Catalog = .shared, published: [String: CoverageWeek] = [:]) -> WindowPick {
        let market = marketKey.flatMap { catalog.markets[$0] }
        let candidates = games.filter { $0.week == week && $0.window == window && $0.networks.contains(network) }
        guard !candidates.isEmpty else { return .init(game: nil, confidence: .unknown, reason: "No \(network) game in this window.") }
        if let mk = marketKey,
           let id = published.publishedGame(week: week, market: mk, network: network, window: window) ?? catalog.overrides[String(week)]?[mk]?[network]?[window],
           let g = games.first(where: { $0.id == id }) {
            return .init(game: g, confidence: .confirmed, reason: "Published coverage map")
        }
        if let m = market {
            for t in m.teams { if let g = candidates.first(where: { $0.home == t || $0.away == t }) { return .init(game: g, confidence: .confirmed, reason: "\(Teams.short(t)) game always airs in \(m.name)") } }
        }
        if candidates.count == 1 { return .init(game: candidates[0], confidence: .confirmed, reason: "Only \(network) game in this window") }
        if let m = market {
            for t in m.affinity { if let g = candidates.first(where: { $0.home == t || $0.away == t }) { return .init(game: g, confidence: .likely, reason: "\(m.name) usually receives \(Teams.short(t)) games") } }
        }
        // Nothing above resolved it, so predict rather than shrug: an app that answers "what game
        // is on" with a blank has not answered. The old rule keyed off ESPN's national flag, which
        // is set on most Sunday games and so amounted to array order. This ranks candidates by the
        // size of the markets the two teams come from - a network sends its biggest matchup to the
        // most of the country - which is a real signal and a repeatable one.
        //
        // It is still a guess, and it is labelled as one. What it must never do is let the app say
        // a game is *not* on the local station; see gameInMarket.
        if let g = predicted(candidates, catalog: catalog) {
            return .init(game: g, confidence: .predicted, reason: "\(network) has not published its regional map for this week; this is the matchup most markets get")
        }
        return .init(game: nil, confidence: .unknown, reason: "No \(network) game to show for this window.")
    }

    /// The candidate a network is most likely to send widely: the one whose teams come from the
    /// biggest markets. Ties break on the second market, then on id so the answer never wanders.
    static func predicted(_ candidates: [Game], catalog: Catalog) -> Game? {
        func ranks(_ g: Game) -> (Int, Int) {
            let r = [g.home, g.away]
                .compactMap { Teams.all[$0]?.market }
                .compactMap { catalog.markets[$0]?.rank }
                .sorted()
            return (r.first ?? 999, r.count > 1 ? r[1] : 999)
        }
        return candidates.min { a, b in
            let (a1, a2) = ranks(a), (b1, b2) = ranks(b)
            if a1 != b1 { return a1 < b1 }
            if a2 != b2 { return a2 < b2 }
            return a.id < b.id
        }
    }

    static func gameInMarket(_ game: Game, marketKey: String?, all: [Game], catalog: Catalog = .shared, published: [String: CoverageWeek] = [:]) -> MarketResult {
        guard marketKey != nil else { return .init(airs: nil, confidence: .unknown, reason: "Set your ZIP to see whether this game airs in your market.", instead: nil) }
        guard game.isRegional else {
            return .init(airs: true, confidence: .confirmed, reason: game.exclusive.map { "\($0) exclusive, available everywhere" } ?? "National broadcast", instead: nil)
        }
        let network = game.networks.first { ["CBS", "FOX"].contains($0) } ?? "CBS"
        let pick = windowGame(games: all, week: game.week, marketKey: marketKey, network: network, window: game.window, catalog: catalog, published: published)
        guard let g = pick.game else { return .init(airs: nil, confidence: .unknown, reason: pick.reason, instead: nil) }
        if g.id == game.id { return .init(airs: true, confidence: pick.confidence, reason: pick.reason, instead: nil) }
        // Only a confirmed pick may say a game is NOT on the local station. Telling someone the
        // wrong thing is on sends them away from the right channel, so a guess stays a guess.
        guard pick.confidence == .confirmed else {
            let lead = pick.confidence == .predicted
                ? "Best guess: your market gets \(g.title) in this window"
                : "Your market usually receives \(g.title) in this window"
            return .init(airs: nil, confidence: pick.confidence,
                         reason: "\(lead), but \(network) regional maps change week to week. Check your local listings.",
                         instead: g)
        }
        return .init(airs: false, confidence: .confirmed, reason: "\(network) in your market is showing \(g.title) in this window (\(pick.reason.lowercased()))", instead: g)
    }
}
