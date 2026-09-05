import SwiftUI

struct AlertsView: View {
    @EnvironmentObject var state: AppState
    private var tz: TimeZone { state.user.timeZone }

    var body: some View {
        NavigationStack {
            let week = state.weekPlan(state.selectedWeek).sorted { $0.fireAt < $1.fireAt }
            let groups = Dictionary(grouping: week) { TimeFormat.dayKey($0.fireAt, tz: tz) }
                .sorted { $0.key < $1.key }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    weekPicker
                    summary(week)
                    if week.isEmpty {
                        Text("Nothing planned for this week. Follow a game, or turn on an alert type in Settings.")
                            .font(.subheadline).foregroundStyle(Theme.textDim)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
                    }
                    ForEach(groups, id: \.key) { _, items in
                        if let first = items.first { dayHeader(first.fireAt) }
                        VStack(spacing: 0) {
                            ForEach(Array(items.enumerated()), id: \.element.id) { idx, a in
                                row(a)
                                if idx < items.count - 1 { Divider().overlay(Theme.hairline).padding(.leading, 46) }
                            }
                        }
                        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
                    }
                    Color.clear.frame(height: 16)
                }
                .padding(.horizontal, 14).padding(.top, 4)
            }
            .background { Theme.background.ignoresSafeArea() }
            .scrollContentBackground(.hidden)
            .navigationTitle("Alerts")
            .toolbarBackground(Theme.bgTop, for: .navigationBar)
            .task { await state.notifications.refreshStatus() }
        }
    }

    /// Scoped to one week on purpose. The season-wide total ran to the hundreds, which reads as
    /// an avalanche rather than "here is your Sunday".
    private func summary(_ week: [PlannedAlert]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(week.count)")
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.accent)
                Text(week.count == 1 ? "alert this week" : "alerts this week").font(.headline).foregroundStyle(Theme.text)
            }
            Text("Only for the games you follow. Nothing else is ever sent.")
                .font(.footnote).foregroundStyle(Theme.textDim)
            if !state.notifications.authorized {
                HStack(spacing: 7) {
                    Image(systemName: "bell.slash.fill").foregroundStyle(Theme.bad)
                    Text("Notifications are off. Turn them on in Settings to actually receive these.")
                        .font(.caption).foregroundStyle(Theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.bad.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16))
    }

    private var weekPicker: some View {
        HStack(spacing: 10) {
            Menu {
                ForEach(state.schedule.weeks, id: \.self) { w in
                    Button("Week \(w)") { state.selectedWeek = w }
                }
            } label: {
                HStack(spacing: 4) {
                    Text("Week \(state.selectedWeek)").font(.headline)
                    Image(systemName: "chevron.up.chevron.down").font(.caption2)
                }
                .foregroundStyle(Theme.text)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Theme.surfaceRaised, in: Capsule())
            }
            Spacer(minLength: 0)
        }
    }

    private func dayHeader(_ date: Date) -> some View {
        HStack(spacing: 8) {
            Text(TimeFormat.day(date, tz: tz).uppercased())
                .font(.system(size: 13, weight: .heavy, design: .rounded)).tracking(1.0)
                .foregroundStyle(Theme.textDim)
            Rectangle().fill(Theme.hairline).frame(height: 1)
        }
        .padding(.top, 6)
    }

    private func row(_ a: PlannedAlert) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: AlertStyle.icon(a.kind))
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(AlertStyle.color(a.kind))
                .frame(width: 28, height: 28)
                .background(AlertStyle.color(a.kind).opacity(0.15), in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(TimeFormat.time(a.fireAt, tz: tz, zone: false))
                        .font(.system(size: 14, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.text)
                    Spacer(minLength: 0)
                }
                Text(a.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                Text(a.body).font(.caption).foregroundStyle(Theme.textDim)
                    .lineLimit(3).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
    }
}
