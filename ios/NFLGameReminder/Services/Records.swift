import Foundation

/// A won-lost record, derived rather than fetched.
///
/// Every completed game already carries its final score, so the standings are arithmetic on data
/// we hold. That beats reading ESPN's own record field: a derived record can never disagree with
/// the scores the app is showing, because it is computed from them.
struct TeamRecord: Equatable {
    var wins = 0
    var losses = 0
    var ties = 0

    var played: Bool { wins > 0 || losses > 0 || ties > 0 }

    /// "1-0", or "9-7-1" when there is a tie to report. Ties are rare enough that always printing
    /// the third number would be noise, and common enough that dropping it would be wrong.
    var summary: String { ties > 0 ? "\(wins)-\(losses)-\(ties)" : "\(wins)-\(losses)" }
}

enum Records {
    /// Every team's record from games finished before `instant`.
    ///
    /// The record a team *brings into* a game, not its record today. On an upcoming game those are
    /// the same thing. On a game from three weeks ago they are not, and a card reading
    /// "Steelers (1-0)" for week 2 should still read 1-0 in December.
    static func before(_ instant: Date, in games: [Game]) -> [String: TeamRecord] {
        var out: [String: TeamRecord] = [:]
        for g in games {
            guard let f = g.finalScore, g.kickoff < instant else { continue }
            var away = out[g.away] ?? TeamRecord()
            var home = out[g.home] ?? TeamRecord()
            if f.away == f.home { away.ties += 1; home.ties += 1 }
            else if f.away > f.home { away.wins += 1; home.losses += 1 }
            else { home.wins += 1; away.losses += 1 }
            out[g.away] = away
            out[g.home] = home
        }
        return out
    }

    /// The two records a matchup needs. Nil for a team yet to play - "(0-0)" on every card in
    /// week 1 is clutter that tells nobody anything.
    static func matchup(_ game: Game, in games: [Game]) -> (away: String?, home: String?) {
        let table = before(game.kickoff, in: games)
        let fmt: (String) -> String? = { table[$0]?.played == true ? table[$0]?.summary : nil }
        return (fmt(game.away), fmt(game.home))
    }
}
