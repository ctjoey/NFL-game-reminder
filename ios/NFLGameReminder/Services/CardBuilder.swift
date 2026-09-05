import Foundation

enum CardBuilder {
    static func isFollowed(_ game: Game, user: UserProfile) -> (Bool, [String]) {
        let f = user.follow
        if f.excludeGames.contains(game.id) { return (false, ["excluded"]) }
        var reasons: [String] = []
        if f.games.contains(game.id) { reasons.append("picked game") }
        if f.mode == .all { reasons.append("all games") }
        if f.mode == .teams || f.mode == .all {
            for t in f.teams where game.home == t || game.away == t { reasons.append("team: \(Teams.short(t))") }
        }
        switch f.mode {
        case .all: return (true, reasons)
        case .teams: return (!reasons.isEmpty, reasons)
        case .games: return (f.games.contains(game.id), reasons)
        }
    }

    static func watchLine(_ game: Game, channels: [ChannelInfo], inMarket: MarketResult, catalog: Catalog) -> String {
        if inMarket.airs == false, let g = inMarket.instead, let n = game.networks.first { return "Not on your local \(n) (they show \(g.title))" }
        var parts = channels.map(\.display)
        parts += game.streams.map { catalog.label($0) }
        return parts.isEmpty ? "Carrier TBD" : parts.joined(separator: " · ")
    }

    static func build(_ game: Game, user: UserProfile, all: [Game], changes: [ScheduleChange] = [], planned: [PlannedAlert] = [], catalog: Catalog = .shared) -> GameCard {
        let channels = game.networks.map { catalog.channel(for: $0, user: user) }
        let inMarket = CoverageEngine.gameInMarket(game, marketKey: user.activeMarket, all: all, catalog: catalog)
        let access = catalog.access(for: game, user: user)
        let (followed, reasons) = isFollowed(game, user: user)
        return GameCard(game: game, coverage: BroadcastWindows.coverage(for: game), channels: channels, inMarket: inMarket, access: access, followed: followed, followReasons: reasons,
                        watchLine: watchLine(game, channels: channels, inMarket: inMarket, catalog: catalog),
                        plannedAlerts: planned.filter { $0.gameId == game.id }, changes: changes.filter { $0.gameId == game.id }.suffix(5).map { $0 })
    }
}
