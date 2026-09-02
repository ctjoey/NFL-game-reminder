import Foundation
import EventKit

/// Writes followed games to the user's calendar with both clocks, carrier and channel in the
/// notes, plus alarms at the user's lead times. Events are tagged so re-runs update in place.
final class CalendarService {
    private let store = EKEventStore()
    private let tag = "[nfl-game-reminder]"

    func requestAccess() async -> Bool {
        if #available(iOS 17, *) { return (try? await store.requestFullAccessToEvents()) ?? false }
        return (try? await store.requestAccess(to: .event)) ?? false
    }

    @discardableResult
    func sync(cards: [GameCard], user: UserProfile) throws -> Int {
        guard let calendar = store.defaultCalendarForNewEvents else { return 0 }
        let tz = user.timeZone
        var count = 0
        for c in cards where c.followed {
            let start = c.game.kickoff, end = start.addingTimeInterval(3.5 * 3600)
            let predicate = store.predicateForEvents(withStart: start.addingTimeInterval(-86400), end: end.addingTimeInterval(86400), calendars: [calendar])
            let existing = store.events(matching: predicate).first { ($0.notes ?? "").contains("\(tag) \(c.game.id)") }
            let ev = existing ?? EKEvent(eventStore: store)
            ev.calendar = calendar
            ev.title = "\(c.game.title) — \(c.watchLine)"
            ev.startDate = start; ev.endDate = end
            ev.location = c.game.venue
            ev.notes = [
                "Coverage begins: \(TimeFormat.time(c.coverage.start, tz: tz)) (\(TimeFormat.et(c.coverage.start))) — \(c.coverage.show)",
                "Kickoff: \(TimeFormat.time(start, tz: tz)) (\(TimeFormat.et(start)))",
                "Watch: \(c.watchLine)",
                c.inMarket.airs == false ? "Market note: \(c.inMarket.reason)" : nil,
                c.access.ok ? "You can watch via: \(c.access.ways.map(\.label).joined(separator: ", "))" : "Not in your services. Options: \(c.access.missing.map(\.label).joined(separator: ", "))",
                "\(tag) \(c.game.id)",
            ].compactMap { $0 }.joined(separator: "\n")
            ev.alarms = []
            if user.alerts.coverage { ev.addAlarm(EKAlarm(relativeOffset: TimeInterval(-c.coverage.minutesBefore * 60))) }
            for m in user.alerts.kickoffLeads { ev.addAlarm(EKAlarm(relativeOffset: TimeInterval(-m * 60))) }
            try store.save(ev, span: .thisEvent, commit: false)
            count += 1
        }
        try store.commit()
        return count
    }
}
