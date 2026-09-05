import Foundation
import UserNotifications

/// Local notifications: iOS lets an app keep 64 pending requests, so we schedule the next 60
/// planned alerts and re-plan whenever the app foregrounds, settings change, or background
/// refresh runs. Quiet hours shift non-critical alerts to the end of the quiet window; a daily
/// cap trims the rest. A sent-log keyed by alert key makes re-planning idempotent.
@MainActor
final class NotificationManager: ObservableObject {
    static let shared = NotificationManager()
    @Published var authorized = false
    @Published private(set) var pendingCount = 0
    private let center = UNUserNotificationCenter.current()
    private let sentKey = "sentAlertKeys"
    private var sent: Set<String> { get { Set(UserDefaults.standard.stringArray(forKey: sentKey) ?? []) } set { UserDefaults.standard.set(Array(newValue.suffix(2000)), forKey: sentKey) } }

    func requestAuthorization() async {
        do { authorized = try await center.requestAuthorization(options: [.alert, .sound, .badge]) } catch { authorized = false }
    }
    func refreshStatus() async {
        let s = await center.notificationSettings()
        authorized = s.authorizationStatus == .authorized || s.authorizationStatus == .provisional
        pendingCount = await center.pendingNotificationRequests().count
    }

    /// Replace all pending game alerts with the current plan.
    func schedule(plan: [PlannedAlert], user: UserProfile, now: Date = Date()) async {
        let tz = user.timeZone
        let existing = await center.pendingNotificationRequests().map(\.identifier).filter { $0.hasPrefix("alert|") }
        center.removePendingNotificationRequests(withIdentifiers: existing)
        var perDay: [String: Int] = [:]
        var scheduled = 0
        for item in plan where !sent.contains(item.key) {
            var fireAt = item.fireAt
            if !item.critical, TimeFormat.inQuietHours(fireAt, tz: tz, quiet: user.quiet), let q = user.quiet {
                var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
                var comps = cal.dateComponents([.year, .month, .day], from: fireAt)
                comps.hour = q.end / 60; comps.minute = q.end % 60
                var end = cal.date(from: comps) ?? fireAt
                if end < fireAt { end = cal.date(byAdding: .day, value: 1, to: end) ?? end }
                fireAt = end
            }
            if fireAt <= now { continue }
            let dk = TimeFormat.dayKey(fireAt, tz: tz)
            if perDay[dk, default: 0] >= user.maxPerDay { continue }
            perDay[dk, default: 0] += 1
            let content = UNMutableNotificationContent()
            content.title = item.title; content.body = item.body; content.sound = .default
            content.threadIdentifier = item.gameId ?? "weekly"
            content.userInfo = ["gameId": item.gameId ?? "", "key": item.key, "kind": item.kind.rawValue]
            content.interruptionLevel = item.critical ? .timeSensitive : .active
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, fireAt.timeIntervalSince(now)), repeats: false)
            try? await center.add(UNNotificationRequest(identifier: "alert|\(item.key)", content: content, trigger: trigger))
            scheduled += 1
            if scheduled >= 60 { break }
        }
        pendingCount = scheduled
    }

    /// Fire a change alert right now (once per key).
    func deliverNow(_ items: [PlannedAlert]) async {
        var s = sent
        for item in items where !s.contains(item.key) {
            let content = UNMutableNotificationContent()
            content.title = item.title; content.body = item.body; content.sound = .default
            content.interruptionLevel = .timeSensitive
            content.userInfo = ["gameId": item.gameId ?? "", "key": item.key, "kind": item.kind.rawValue]
            try? await center.add(UNNotificationRequest(identifier: "now|\(item.key)", content: content, trigger: nil))
            s.insert(item.key)
        }
        sent = s
    }

    func markDelivered(key: String) { var s = sent; s.insert(key); sent = s }

    func sendTest(user: UserProfile) async {
        let content = UNMutableNotificationContent()
        content.title = "Game Time Reminder is set up"
        // A banner shows about two lines. Put the answer first so a truncated one still works.
        content.body = "Notifications work. Times show in \(TimeFormat.abbr(user.timeZone, at: Date())). Only the games you follow."
        content.sound = .default
        try? await center.add(UNNotificationRequest(identifier: "test", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 2, repeats: false)))
    }
}
