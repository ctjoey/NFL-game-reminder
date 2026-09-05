import Foundation

/// Store-listing capture mode. CI launches the app with `-screenshot <screen>` so each App Store
/// screenshot is a real render of the shipping UI in a known state, rather than an empty first-run
/// screen. The flag can only arrive as a launch argument, so nothing here can reach a real user.
enum ScreenshotMode {
    enum Screen: String { case week, weekall, detail, alerts, settings }

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
