import SwiftUI

struct WeekView: View {
    @EnvironmentObject var state: AppState
    @State private var detail: GameCard?

    var body: some View {
        NavigationStack {
            let cards = state.cards(week: state.selectedWeek)
            let shown = cards.filter { state.showAllGames || $0.followed }
            List {
                Section {
                    HStack {
                        Picker("Week", selection: $state.selectedWeek) { ForEach(state.schedule.weeks, id: \.self) { Text("Week \($0)").tag($0) } }.labelsHidden()
                        Spacer()
                        Picker("", selection: $state.showAllGames) { Text("My games").tag(false); Text("All games").tag(true) }.pickerStyle(.segmented).frame(width: 190)
                    }
                    Text("\(cards.filter(\.followed).count) games you follow · \(state.plan.filter { p in cards.contains { $0.id == p.gameId } || p.week == state.selectedWeek }.count) alerts planned · schedule: \(state.schedule.source)")
                        .font(.caption).foregroundStyle(.secondary)
                    if state.schedule.source == "seed" {
                        Label("Showing the built-in schedule seed (confirmed games only). The full slate loads when the live feed is reachable.", systemImage: "info.circle").font(.caption).foregroundStyle(.orange)
                    }
                }
                if shown.isEmpty {
                    Text(state.showAllGames ? "No games loaded for this week yet." : "None of your games this week. Switch to “All games” to add one.").foregroundStyle(.secondary)
                }
                ForEach(shown) { card in
                    GameCardView(card: card) { state.toggleFollow(card) }
                        .contentShape(Rectangle())
                        .onTapGesture { detail = card }
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                }
            }
            .listStyle(.plain)
            .navigationTitle("NFL Game Reminder")
            .refreshable { await state.syncAndReplan() }
            .sheet(item: $detail) { c in GameDetailView(cardId: c.id) }
            .onChange(of: state.deepLinkGameId) { _, id in if let id, let c = state.card(id) { state.selectedWeek = c.game.week; detail = c; state.deepLinkGameId = nil } }
        }
    }
}

struct ConfidenceBadge: View {
    let confidence: Confidence
    var text: String? = nil
    var body: some View {
        Text(text ?? confidence.rawValue).font(.caption2.bold()).padding(.horizontal, 6).padding(.vertical, 2)
            .background(color.opacity(0.18), in: RoundedRectangle(cornerRadius: 5)).foregroundStyle(color)
    }
    private var color: Color { switch confidence { case .confirmed, .stable: return .green; case .likely, .typical: return .orange; default: return .secondary } }
}

struct GameCardView: View {
    @EnvironmentObject var state: AppState
    let card: GameCard
    let onToggleFollow: () -> Void
    private var tz: TimeZone { state.user.timeZone }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) { Text(card.game.title).font(.headline); if let l = card.game.label { Text(l).font(.caption).foregroundStyle(.secondary) } }
                    Text("\(TimeFormat.day(card.game.kickoff, tz: tz)) · \(BroadcastWindows.labels[card.game.window] ?? card.game.window)").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button(card.followed ? "✓ Reminding" : "Remind me", action: onToggleFollow)
                    .buttonStyle(.bordered).tint(card.followed ? .secondary : .accentColor).font(.caption.bold())
            }
            HStack(spacing: 10) {
                clock("Coverage begins", TimeFormat.time(card.coverage.start, tz: tz), "\(TimeFormat.et(card.coverage.start)) · \(card.coverage.show)\(card.coverage.confidence == .typical ? " (typical)" : "")")
                clock("Kickoff", TimeFormat.time(card.game.kickoff, tz: tz), TimeFormat.et(card.game.kickoff))
            }
            HStack(spacing: 6) {
                Text("Watch on:").font(.caption).foregroundStyle(.secondary)
                if let ch = card.channels.first {
                    Text(ch.display).font(.subheadline.bold())
                    if ch.number != nil { ConfidenceBadge(confidence: ch.confidence, text: ch.source == "you set this" ? "your number" : nil) }
                    else if let h = ch.hint { Text(h).font(.caption).foregroundStyle(.secondary) }
                } else if let ex = card.game.exclusive {
                    Text(ex).font(.subheadline.bold()); ConfidenceBadge(confidence: .likely, text: "streaming exclusive")
                }
                if card.game.exclusive == nil, !card.game.streams.isEmpty { Text("· streams on \(card.game.streams.map { state.catalog.label($0) }.joined(separator: ", "))").font(.caption).foregroundStyle(.secondary) }
            }.lineLimit(2)
            if card.inMarket.airs == false { note("Not on your local station. \(card.inMarket.reason).", .orange) }
            else if card.inMarket.airs == true, card.inMarket.confidence != .confirmed, card.game.isRegional { note("\(card.inMarket.confidence.rawValue.capitalized): \(card.inMarket.reason). Regional maps publish Wednesdays.", .secondary) }
            if !card.access.ok { note("You may not be able to watch this. Options: \(card.access.missing.map { $0.label + ($0.cost.map { " (\($0))" } ?? "") }.joined(separator: "; ")).", .red) }
            ForEach(card.access.notes, id: \.self) { note($0, .orange) }
            if !card.game.verified { note(card.game.notes ?? "Some details are not confirmed yet.", .secondary) }
            if let ch = card.changes.last { note("Changed \(ch.at.formatted(date: .abbreviated, time: .shortened)): \(ch.kind.rawValue). Reminders re-armed.", .orange) }
            if card.followed { Text("\(card.plannedAlerts.count) alert\(card.plannedAlerts.count == 1 ? "" : "s") planned").font(.caption).foregroundStyle(.secondary) }
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(card.followed ? Color.accentColor.opacity(0.6) : .clear))
        .opacity(card.followed ? 1 : 0.75)
    }
    private func clock(_ k: String, _ v: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(k.uppercased()).font(.caption2).foregroundStyle(.secondary)
            Text(v).font(.title3.bold())
            Text(sub).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(10).background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))
    }
    private func note(_ s: String, _ c: Color) -> some View {
        Text(s).font(.caption).padding(8).frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 8))
            .overlay(alignment: .leading) { Rectangle().fill(c).frame(width: 3) }
    }
}

struct GameDetailView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss
    let cardId: String
    var body: some View {
        NavigationStack {
            if let card = state.card(cardId) {
                List {
                    Section { GameCardView(card: card) { state.toggleFollow(card) }.listRowInsets(EdgeInsets()) .listRowBackground(Color.clear) }
                    Section("Carriers") {
                        ForEach(card.channels, id: \.network) { ch in
                            VStack(alignment: .leading) {
                                Text(ch.label).bold()
                                Text(ch.stationCall.map { "\($0) · over-the-air ch. \(ch.stationOta ?? 0)" } ?? "national channel").font(.caption)
                                if let n = ch.number { Text("\(ch.source ?? ""): ch. \(n)").font(.caption).foregroundStyle(.secondary) } else if let h = ch.hint { Text(h).font(.caption).foregroundStyle(.secondary) }
                            }
                        }
                        ForEach(card.game.streams, id: \.self) { Text(state.catalog.label($0)) }
                    }
                    Section("Can you watch it?") {
                        Text(card.access.ok ? "Yes, via " + card.access.ways.map { $0.label + ($0.channel?.number.map { " ch. \($0)" } ?? "") }.joined(separator: ", ") : "Nothing in your services.")
                        if !card.access.missing.isEmpty { Text("Would also need: " + card.access.missing.map { $0.label + ($0.cost.map { " (\($0))" } ?? "") }.joined(separator: ", ")).foregroundStyle(.secondary) }
                        HStack { ConfidenceBadge(confidence: card.inMarket.confidence); Text(card.inMarket.airs == nil ? card.inMarket.reason : (card.inMarket.airs! ? "Airs in your market. " : "Not in your market. ") + card.inMarket.reason).font(.caption) }
                        Text("\(card.coverage.show) starts \(card.coverage.minutesBefore) min before kickoff (\(card.coverage.confidence.rawValue)).").font(.caption)
                    }
                    Section("Planned alerts") {
                        if card.plannedAlerts.isEmpty { Text(card.followed ? "No alerts planned." : "Turn on “Remind me” to plan alerts.").foregroundStyle(.secondary) }
                        ForEach(card.plannedAlerts) { a in
                            VStack(alignment: .leading) { Text(a.title).font(.subheadline.bold()); Text(TimeFormat.dayTime(a.fireAt, tz: state.user.timeZone)).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    if !card.changes.isEmpty {
                        Section("Change log") { ForEach(card.changes) { c in Text("\(c.at.formatted(date: .abbreviated, time: .shortened)): \(c.kind.rawValue) \(c.oldValue ?? "") → \(c.newValue ?? "")").font(.caption) } }
                    }
                    #if DEBUG
                    Section("Developer") { Button("Simulate a flex to Sunday night on NBC") { Task { await state.simulateFlex(gameId: card.id) } } }
                    #endif
                }
                .navigationTitle(card.game.title).navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            } else { Text("Game not found") }
        }
    }
}
