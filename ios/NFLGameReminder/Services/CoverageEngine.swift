import Foundation

/// Which CBS/FOX Sunday-afternoon game does a market receive? Same rule order as the server:
/// override -> local team -> single candidate -> affinity team -> national game -> unknown.
enum CoverageEngine {
    struct WindowPick { let game: Game?; let confidence: Confidence; let reason: String }

    static func windowGame(games: [Game], week: Int, marketKey: String?, network: String, window: String, catalog: Catalog = .shared) -> WindowPick {
        let market = marketKey.flatMap { catalog.markets[$0] }
        let candidates = games.filter { $0.week == week && $0.window == window && $0.networks.contains(network) }
        guard !candidates.isEmpty else { return .init(game: nil, confidence: .unknown, reason: "No \(network) game in this window.") }
        if let mk = marketKey, let id = catalog.overrides[String(week)]?[mk]?[network]?[window], let g = games.first(where: { $0.id == id }) {
            return .init(game: g, confidence: .confirmed, reason: "Published coverage map")
        }
        if let m = market {
            for t in m.teams { if let g = candidates.first(where: { $0.home == t || $0.away == t }) { return .init(game: g, confidence: .confirmed, reason: "\(Teams.short(t)) game always airs in \(m.name)") } }
        }
        if candidates.count == 1 { return .init(game: candidates[0], confidence: .confirmed, reason: "Only \(network) game in this window") }
        if let m = market {
            for t in m.affinity { if let g = candidates.first(where: { $0.home == t || $0.away == t }) { return .init(game: g, confidence: .likely, reason: "\(m.name) usually receives \(Teams.short(t)) games") } }
        }
        if let g = candidates.first(where: { $0.national }) { return .init(game: g, confidence: .likely, reason: "\(network)'s national game this window") }
        return .init(game: candidates[0], confidence: .unknown, reason: "Regional assignment not published yet; check local listings")
    }

    static func gameInMarket(_ game: Game, marketKey: String?, all: [Game], catalog: Catalog = .shared) -> MarketResult {
        guard marketKey != nil else { return .init(airs: nil, confidence: .unknown, reason: "Set your ZIP to see whether this game airs in your market.", instead: nil) }
        guard game.isRegional else {
            return .init(airs: true, confidence: .confirmed, reason: game.exclusive.map { "\($0) exclusive, available everywhere" } ?? "National broadcast", instead: nil)
        }
        let network = game.networks.first { ["CBS", "FOX"].contains($0) } ?? "CBS"
        let pick = windowGame(games: all, week: game.week, marketKey: marketKey, network: network, window: game.window, catalog: catalog)
        guard let g = pick.game else { return .init(airs: nil, confidence: .unknown, reason: pick.reason, instead: nil) }
        if g.id == game.id { return .init(airs: true, confidence: pick.confidence, reason: pick.reason, instead: nil) }
        return .init(airs: false, confidence: pick.confidence, reason: "\(network) in your market is showing \(g.title) in this window (\(pick.reason.lowercased()))", instead: g)
    }
}
