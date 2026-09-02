import SwiftUI

struct AlertsView: View {
    @EnvironmentObject var state: AppState
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("This is the complete list. Nothing outside it will ever be sent. Times are in your zone.").font(.caption).foregroundStyle(.secondary)
                    Text("iOS keeps the next \(min(60, state.plan.count)) scheduled; the rest are added as the app refreshes. Pending on device: \(state.notifications.pendingCount).").font(.caption2).foregroundStyle(.secondary)
                }
                Section("Coming up: \(state.plan.count) alert\(state.plan.count == 1 ? "" : "s")") {
                    if state.plan.isEmpty { Text("Nothing planned. Follow a game or turn on an alert type in Settings.").foregroundStyle(.secondary) }
                    ForEach(state.plan) { a in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(TimeFormat.dayTime(a.fireAt, tz: state.user.timeZone)).font(.caption).foregroundStyle(.secondary)
                            Text(a.title).font(.subheadline.bold())
                            Text(a.body).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                            if !a.critical { Text("held during quiet hours").font(.caption2).foregroundStyle(.tertiary) }
                        }
                    }
                }
            }
            .navigationTitle("Alerts")
            .task { await state.notifications.refreshStatus() }
        }
    }
}
