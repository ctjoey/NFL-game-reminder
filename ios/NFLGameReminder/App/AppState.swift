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
    let schedule: ScheduleStore
    let notifications = NotificationManager.shared
    let catalog: Catalog

    private static let userKey = "userProfile.v1"

    init(schedule: ScheduleStore? = nil, catalog: Catalog = .shared) {
        self.catalog = catalog
        let s = schedule ?? ScheduleStore()
        self.schedule = s
        if let data = UserDefaults.standard.data(forKey: Self.userKey), let u = try? JSONDecoder().decode(UserProfile.self, from: data) { user = u } else { user = UserProfile() }
        selectedWeek = s.currentWeek()
    }

    private func persistUser() { if let d = try? JSONEncoder().encode(user) { UserDefaults.standard.set(d, forKey: Self.userKey) } }

    func cards(week: Int) -> [GameCard] {
        schedule.week(week).map { CardBuilder.build($0, user: user, all: schedule.games, changes: schedule.changes, planned: plan, catalog: catalog) }
    }
    func card(_ id: String) -> GameCard? {
        schedule.game(id).map { CardBuilder.build($0, user: user, all: schedule.games, changes: schedule.changes, planned: plan, catalog: catalog) }
    }

    /// The alerts for one week. A season-wide count reads as an avalanche when what a person
    /// actually wants to know is what is coming this Sunday.
    func weekPlan(_ week: Int) -> [PlannedAlert] {
        plan.filter { a in
            if let w = a.week { return w == week }
            return a.gameId.flatMap { schedule.game($0)?.week } == week
        }
    }

    func replan() async {
        plan = AlertPlanner.plan(user: user, games: schedule.games, catalog: catalog)
        if user.onboarded { await notifications.schedule(plan: plan, user: user) }
    }

    /// Live sync, change alerts for followed games, then re-plan. Called on foreground and by background refresh.
    func syncAndReplan() async {
        let before = schedule.games
        let delta = await schedule.sync()
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
