import Foundation
import SwiftUI

/// Single source of truth for the UI. Owns the user profile, the schedule store and the
/// notification plan, and re-plans whenever any of them change.
@MainActor
final class AppState: ObservableObject {
    @Published var user: UserProfile { didSet { persistUser(); Task { await replan() } } }
    @Published private(set) var plan: [PlannedAlert] = []
    @Published var selectedWeek: Int
    @Published var showAllGames = false
    @Published var deepLinkGameId: String?
    /// Set by an incoming link; RootView consumes it to switch tabs, then clears it.
    @Published var deepLinkTab: Int?
    let schedule: ScheduleStore
    let notifications = NotificationManager.shared
    let catalog: Catalog
    let coverage: CoverageFeed

    private static let userKey = "userProfile.v1"

    init(schedule: ScheduleStore? = nil, catalog: Catalog = .shared, coverage: CoverageFeed = .shared) {
        self.catalog = catalog
        self.coverage = coverage
        let s = schedule ?? ScheduleStore()
        self.schedule = s
        if ScreenshotMode.isActive {
            user = ScreenshotMode.demoProfile
            // A staged season, and a sync stamp to match: the live-score line hides itself unless
            // the data behind it is minutes old, which is the correct behaviour and would
            // otherwise blank the very thing the screenshot is there to show. This is the seed, so
            // it is thin; syncAndReplan replaces it with the real season a moment later, and it is
            // what the capture falls back to if the network is down.
            s.overrideGames(ScreenshotMode.stage(ScheduleStore.loadSeed(season: s.season)), lastSync: Date())
        } else if let data = UserDefaults.standard.data(forKey: Self.userKey), var u = try? JSONDecoder().decode(UserProfile.self, from: data) {
            u.migrateRetiredProvider()
            user = u
        } else {
            user = UserProfile()
        }
        selectedWeek = s.currentWeek()
    }

    private func persistUser() {
        guard !ScreenshotMode.isActive else { return }
        if let d = try? JSONEncoder().encode(user) { UserDefaults.standard.set(d, forKey: Self.userKey) }
    }

    func cards(week: Int) -> [GameCard] {
        schedule.week(week).map { CardBuilder.build($0, user: user, all: schedule.games, changes: schedule.changes, planned: plan, catalog: catalog, published: coverage.weeks) }
    }
    func card(_ id: String) -> GameCard? {
        schedule.game(id).map { CardBuilder.build($0, user: user, all: schedule.games, changes: schedule.changes, planned: plan, catalog: catalog, published: coverage.weeks) }
    }

    /// The alerts for one week. A season-wide count reads as an avalanche when what a person
    /// actually wants to know is what is coming this Sunday.
    func weekPlan(_ week: Int) -> [PlannedAlert] {
        plan.filter { a in
            if let w = a.week { return w == week }
            return a.gameId.flatMap { schedule.game($0)?.week } == week
        }
    }

    /// The game the store-listing capture opens for its detail shot: one that is being played, and
    /// one of the demo profile's own teams, so the card is followed and the coverage rows are full.
    var screenshotDetailGameId: String? {
        let week = schedule.week(ScreenshotMode.showcaseWeek)
        let mine = Set(user.follow.teams)
        return (week.first { $0.liveScore != nil && (mine.contains($0.away) || mine.contains($0.home)) }
                ?? week.first { $0.liveScore != nil }
                ?? week.first)?.id
    }

    func replan() async {
        plan = AlertPlanner.plan(user: user, games: schedule.games, catalog: catalog)
        if user.onboarded { await notifications.schedule(plan: plan, user: user) }
    }

    /// Live sync, change alerts for followed games, then re-plan. Called on foreground and by background refresh.
    /// The coverage map is refreshed alongside the schedule: a map published on Wednesday is worth
    /// nothing if the app only reads the copy it shipped with.
    func syncAndReplan() async {
        await coverage.refresh()
        // Store-listing capture. The bundled seed is a sample - seven games in a week, and teams
        // whose first appearance is the week being photographed, so half the cards would carry a
        // record on one side only. Pull the real season, then stage that: a full Sunday, and every
        // team with two games behind it. A plain refresh would not do, because init already stamped
        // lastSync to keep the live-score line alive, and refresh reads that as "recent enough".
        if ScreenshotMode.isActive {
            // Back to the pristine seed first, so running this twice shifts the season once: what
            // the live feed does not cover is kept as-is by `apply`, and staged times kept from a
            // previous pass would be shifted a second time.
            schedule.overrideGames(ScheduleStore.loadSeed(season: schedule.season), lastSync: nil)
            _ = await schedule.sync()
            schedule.overrideGames(ScreenshotMode.stage(schedule.games), lastSync: Date())
            await replan()
            return
        }
        let before = schedule.games
        let delta = await schedule.refresh()
        if !delta.isEmpty {
            let alerts = AlertPlanner.changeAlerts(delta, previous: before, current: schedule.games, user: user, catalog: catalog)
            await notifications.deliverNow(alerts)
        }
        await replan()
    }

    func toggleFollow(_ card: GameCard) {
        var f = user.follow
        if card.followed { f.games.removeAll { $0 == card.id }; if !f.excludeGames.contains(card.id) { f.excludeGames.append(card.id) } }
        else { f.excludeGames.removeAll { $0 == card.id }; if !f.games.contains(card.id) { f.games.append(card.id) } }
        user.follow = f
    }

    /// Dev: mirror the server's simulate-change endpoint so reviewers can see the flex flow.
    func simulateFlex(gameId: String) async {
        guard let g = schedule.game(gameId) else { return }
        let before = schedule.games
        var cal = Calendar(identifier: .gregorian); cal.timeZone = BroadcastWindows.eastern
        var comps = cal.dateComponents([.year, .month, .day], from: g.kickoff); comps.hour = 20; comps.minute = 20
        let delta = schedule.simulateFlex(gameId: gameId, kickoff: cal.date(from: comps), networks: ["NBC"], streams: ["Peacock"], window: "SNF")
        let alerts = AlertPlanner.changeAlerts(delta, previous: before, current: schedule.games, user: user, catalog: catalog)
        await notifications.deliverNow(alerts)
        await replan()
    }
}
