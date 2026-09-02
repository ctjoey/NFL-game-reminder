import WidgetKit
import SwiftUI

/// Home/Lock Screen widget: the next followed game with coverage, kickoff and channel.
/// Reads the same persisted schedule and profile as the app (App Group in Tier 2).
struct NextGameEntry: TimelineEntry {
    let date: Date
    let title: String
    let coverage: String
    let kickoff: String
    let watch: String
    let day: String
}

struct NextGameProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextGameEntry { .init(date: Date(), title: "Falcons at Steelers", coverage: "Coverage 11:00 am", kickoff: "Kickoff 1:00 pm EDT", watch: "WPGH (FOX) ch. 53", day: "Sun Sep 13") }
    func getSnapshot(in context: Context, completion: @escaping (NextGameEntry) -> Void) { completion(placeholder(in: context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<NextGameEntry>) -> Void) {
        Task { @MainActor in
            let entry = Self.nextGameEntry() ?? NextGameEntry(date: Date(), title: "No upcoming games", coverage: "", kickoff: "", watch: "Open the app to follow a team", day: "")
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(1800))))
        }
    }
    @MainActor static func nextGameEntry() -> NextGameEntry? {
        guard let data = UserDefaults.standard.data(forKey: "userProfile.v1"), let user = try? JSONDecoder().decode(UserProfile.self, from: data) else { return nil }
        let store = ScheduleStore()
        let now = Date()
        guard let g = AlertPlanner.followed(store.games, user: user).filter({ $0.kickoff.addingTimeInterval(3.5 * 3600) > now }).min(by: { $0.kickoff < $1.kickoff }) else { return nil }
        let card = CardBuilder.build(g, user: user, all: store.games)
        let tz = user.timeZone
        return .init(date: now, title: g.title, coverage: "Coverage \(TimeFormat.time(card.coverage.start, tz: tz, zone: false))", kickoff: "Kickoff \(TimeFormat.time(g.kickoff, tz: tz))", watch: card.watchLine, day: TimeFormat.day(g.kickoff, tz: tz))
    }
}

struct NextGameWidgetView: View {
    var entry: NextGameEntry
    @Environment(\.widgetFamily) var family
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(entry.day).font(.caption2).foregroundStyle(.secondary)
            Text(entry.title).font(.headline).lineLimit(1)
            Text(entry.kickoff).font(.subheadline.bold())
            if family != .systemSmall { Text(entry.coverage).font(.caption) }
            Text(entry.watch).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading).containerBackground(.fill.tertiary, for: .widget)
    }
}

@main
struct NextGameWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NextGameWidget", provider: NextGameProvider()) { NextGameWidgetView(entry: $0) }
            .configurationDisplayName("Next game")
            .description("Coverage, kickoff and your channel for the next game you follow.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}
