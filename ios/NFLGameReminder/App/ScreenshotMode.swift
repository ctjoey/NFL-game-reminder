import Foundation

/// Store-listing capture mode. CI launches the app with `-screenshot <screen>` so each App Store
/// screenshot is a real render of the shipping UI in a known state, rather than an empty first-run
/// screen. The flag can only arrive as a launch argument, so nothing here can reach a real user.
enum ScreenshotMode {
    enum Screen: String { case week, weekall, weeklist, detail, alerts, settings }

    static var screen: Screen? {
        // simctl forwards SIMCTL_CHILD_SCREENSHOT to the app as SCREENSHOT. That path is
        // documented and reliable; a leading-dash launch argument is not always passed through.
        if let v = ProcessInfo.processInfo.environment["SCREENSHOT"], let s = Screen(rawValue: v) { return s }
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-screenshot"), i + 1 < args.count { return Screen(rawValue: args[i + 1]) }
        return nil
    }

    static var isActive: Bool { screen != nil }

    /// A believable, fully set-up profile: a real market with real stations, a handful of teams,
    /// and every alert type on so the Alerts screen has something to show.
    static var demoProfile: UserProfile {
        var u = UserProfile()
        u.onboarded = true
        u.tz = "America/New_York"
        u.zip = "44077"
        u.market = "cleveland"
        u.provider = "spectrum"
        u.hasAntenna = true
        u.services = ["Prime", "Peacock", "Netflix"]
        u.follow.mode = .teams
        u.follow.teams = ["CLE", "PIT", "DAL", "KC", "PHI", "BUF"]
        u.alerts.coverage = true
        u.alerts.kickoffLeads = [30]
        u.alerts.kickoffNow = false
        u.alerts.weekly = true
        u.alerts.weeklyDay = 6
        u.alerts.weeklyHour = 11
        u.setChannelOverride("CBS", "19", market: "cleveland")
        u.setChannelOverride("FOX", "8", market: "cleveland")
        return u
    }
}

// MARK: - Staging the season for a capture
//
// The store screenshots have to show scores, and scores only exist while a game is being played or
// after it has ended. CI runs whenever it runs - a Tuesday morning, the off-season - so capturing
// "whatever is happening right now" gives a different, usually empty, picture every time.
//
// Rather than freeze the clock (which would mean threading a fake `now` through every view), this
// slides the whole season by one constant offset so that the showcase week's Sunday-afternoon
// kickoff sits 100 minutes in the past. One shift, applied to every game, so the shape of a week -
// Thursday night, Sunday early and late, Sunday night, Monday - survives intact. The capture then
// lands mid-afternoon on a Sunday: Thursday's game is final, the 1pm games are live, the late
// games are still to come, and the two previous weeks are complete, which is where the records
// come from.
//
// The scores themselves are invented, and they are the only invented thing here. Everything else -
// matchups, networks, coverage, the relative times - is the real schedule.
extension ScreenshotMode {
    /// A full slate with a settled picture behind it: two finished weeks means every team has a
    /// record to show.
    static let showcaseWeek = 3

    /// How far into the early window the capture pretends to be. Long enough to be in the third
    /// quarter, short enough that nothing has ended yet.
    private static let intoTheWindow: TimeInterval = 100 * 60

    static func stage(_ games: [Game], now: Date = Date()) -> [Game] {
        guard let anchor = anchor(games) else { return games }
        let delta = now.addingTimeInterval(-intoTheWindow).timeIntervalSince(anchor)
        return games.map { g in
            var g = g
            g.kickoff = g.kickoff.addingTimeInterval(delta)
            let elapsed = now.timeIntervalSince(g.kickoff)
            // Four hours matches the threshold the countdown pill already uses for "FINAL", so the
            // pill and the score line can never disagree about whether a game is over.
            if elapsed >= 4 * 3600 {
                g.finalScore = finalScore(g); g.liveScore = nil
            } else if elapsed >= 0 {
                g.liveScore = liveScore(g, elapsed: elapsed); g.finalScore = nil
            } else {
                g.finalScore = nil; g.liveScore = nil
            }
            return g
        }
    }

    /// The first Sunday-afternoon kickoff of the showcase week, falling back to its first game.
    private static func anchor(_ games: [Game]) -> Date? {
        let week = games.filter { $0.week == showcaseWeek }
        guard !week.isEmpty else { return nil }
        return week.filter { $0.window == "SUN_EARLY" }.map(\.kickoff).min() ?? week.map(\.kickoff).min()
    }

    /// Stable across runs, unlike `hashValue`, which is seeded per process: two captures of the
    /// same build have to produce the same scoreboard or the screenshots contradict each other.
    private static func seed(_ s: String) -> UInt64 {
        var h: UInt64 = 0xcbf29ce484222325
        for b in s.utf8 { h = (h ^ UInt64(b)) &* 0x100000001b3 }
        return h
    }

    private static let finals: [(Int, Int)] = [
        (24, 17), (31, 28), (20, 13), (27, 24), (34, 20), (23, 20),
        (17, 14), (30, 27), (21, 19), (26, 23), (38, 31), (16, 13),
    ]

    private static func finalScore(_ g: Game) -> FinalScore {
        let h = seed(g.id)
        let (a, b) = finals[Int(h % UInt64(finals.count))]
        // The home team wins about 55% of the time, and a screenshot where the road team always
        // wins reads as fake even when nobody can say why.
        return h & 8 == 0 ? FinalScore(away: b, home: a) : FinalScore(away: a, home: b)
    }

    private static let inProgress: [(Int, Int)] = [
        (14, 10), (17, 13), (10, 7), (21, 17), (13, 13), (20, 14), (7, 3), (24, 21),
    ]

    private static func liveScore(_ g: Game, elapsed: TimeInterval) -> LiveScore {
        let h = seed(g.id)
        let (a, b) = inProgress[Int(h % UInt64(inProgress.count))]
        // A quarter of football takes about 45 minutes of wall clock once stoppages and ads are in.
        let period = min(4, Int(elapsed / (45 * 60)) + 1)
        return h & 8 == 0 ? LiveScore(away: b, home: a, period: period)
                          : LiveScore(away: a, home: b, period: period)
    }
}
