import SwiftUI

struct GameDetailView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss
    let cardId: String
    private var tz: TimeZone { state.user.timeZone }

    var body: some View {
        NavigationStack {
            ScrollView {
                if let card = state.card(cardId) {
                    VStack(alignment: .leading, spacing: 14) {
                        GameCardView(card: card, showsDetailChevron: false) { state.toggleFollow(card) }
                        section("Where to watch") { carriers(card) }
                        section("Can you watch it?") { access(card) }
                        section("Planned alerts") { alerts(card) }
                        if !card.changes.isEmpty { section("Change log") { changes(card) } }
                        #if DEBUG
                        Button("Simulate a flex to Sunday night on NBC") {
                            Task { await state.simulateFlex(gameId: card.id) }
                        }
                        .font(.footnote).foregroundStyle(Theme.accent)
                        #endif
                        Color.clear.frame(height: 20)
                    }
                    .padding(.horizontal, 14).padding(.top, 8)
                } else {
                    Text("Game not found").foregroundStyle(Theme.textDim).padding()
                }
            }
            .background { Theme.background.ignoresSafeArea() }
            .scrollContentBackground(.hidden)
            .navigationTitle("Game details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Theme.bgTop, for: .navigationBar)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .heavy, design: .rounded)).tracking(1.0)
                .foregroundStyle(Theme.textDim)
            content()
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: 14))
        }
    }

    private func carriers(_ card: GameCard) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(card.channels, id: \.network) { ch in
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Pill(text: ch.label, color: Theme.network(ch.network), filled: true)
                        if let call = ch.stationCall {
                            Text(call).font(.subheadline.weight(.bold)).foregroundStyle(Theme.text)
                        }
                        if let n = ch.number {
                            Text("ch. \(n)").font(.subheadline).foregroundStyle(Theme.text)
                        }
                    }
                    if let ota = ch.stationOta {
                        Text("Over the air: channel \(ota)").font(.caption).foregroundStyle(Theme.textDim)
                    }
                    if let src = ch.source, ch.number != nil {
                        Text(src).font(.caption).foregroundStyle(Theme.textDim)
                    }
                    if let hint = ch.hint {
                        Text(hint).font(.caption).foregroundStyle(Theme.textDim)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            if !card.game.streams.isEmpty {
                HStack(spacing: 5) {
                    ForEach(card.game.streams, id: \.self) { s in
                        Pill(text: state.catalog.label(s), color: Theme.network(s))
                    }
                }
            }
            Text("\(card.coverage.show) starts \(card.coverage.minutesBefore) min before kickoff (\(card.coverage.confidence.rawValue)).")
                .font(.caption).foregroundStyle(Theme.textDim)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func access(_ card: GameCard) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                Image(systemName: card.access.ok ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundStyle(card.access.ok ? Theme.ok : Theme.bad)
                Text(card.access.ok
                     ? card.access.ways.map { $0.label + ($0.channel?.number.map { " ch. \($0)" } ?? "") }.joined(separator: ", ")
                     : "Nothing in your services.")
                    .font(.subheadline).foregroundStyle(Theme.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !card.access.missing.isEmpty {
                Text("Would also need: " + card.access.missing.map { $0.label + ($0.cost.map { " (\($0))" } ?? "") }.joined(separator: ", "))
                    .font(.caption).foregroundStyle(Theme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(alignment: .top, spacing: 7) {
                ConfidenceBadge(confidence: card.inMarket.confidence)
                Text(card.inMarket.airs == nil ? card.inMarket.reason
                     : (card.inMarket.airs! ? "Airs in your market. " : "Not in your market. ") + card.inMarket.reason)
                    .font(.caption).foregroundStyle(Theme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func alerts(_ card: GameCard) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            if card.plannedAlerts.isEmpty {
                Text(card.followed ? "No alerts planned." : "Tap the bell to plan alerts for this game.")
                    .font(.subheadline).foregroundStyle(Theme.textDim)
            }
            ForEach(card.plannedAlerts) { a in
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: AlertStyle.icon(a.kind))
                        .font(.caption).foregroundStyle(AlertStyle.color(a.kind))
                        .frame(width: 20)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(a.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
                        Text(TimeFormat.dayTime(a.fireAt, tz: tz)).font(.caption).foregroundStyle(Theme.textDim)
                    }
                }
            }
        }
    }

    private func changes(_ card: GameCard) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(card.changes) { c in
                let from = (c.oldValue?.isEmpty == false) ? c.oldValue! : "none"
                let to = (c.newValue?.isEmpty == false) ? c.newValue! : "none"
                Text("\(c.at.formatted(date: .abbreviated, time: .shortened)): \(c.kind.rawValue) \(from) → \(to)")
                    .font(.caption).foregroundStyle(Theme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// Shared icon + colour language for the six alert kinds.
enum AlertStyle {
    static func icon(_ k: PlannedAlert.Kind) -> String {
        switch k {
        case .coverage: return "tv.fill"
        case .kickoffLead: return "clock.fill"
        case .kickoffNow: return "sportscourt.fill"
        case .access: return "lock.fill"
        case .weekly: return "calendar"
        case .change: return "arrow.triangle.2.circlepath"
        }
    }
    static func color(_ k: PlannedAlert.Kind) -> Color {
        switch k {
        case .coverage: return Theme.ok
        case .kickoffLead, .kickoffNow: return Theme.accent
        case .access: return Theme.bad
        case .weekly: return Theme.network("CBS")
        case .change: return Theme.warn
        }
    }
}
