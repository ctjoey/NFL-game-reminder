import SwiftUI

struct WeekView: View {
    @EnvironmentObject var state: AppState
    @State private var detail: GameCard?

    private var tz: TimeZone { state.user.timeZone }

    var body: some View {
        NavigationStack {
            let cards = state.cards(week: state.selectedWeek)
            let shown = cards.filter { state.showAllGames || $0.followed }
            let groups = Dictionary(grouping: shown) { TimeFormat.dayKey($0.game.kickoff, tz: tz) }
                .sorted { $0.key < $1.key }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14, pinnedViews: []) {
                    if state.user.isTraveling, let m = state.user.travelMarket,
                       let name = state.catalog.markets[m]?.name {
                        travelBanner(name)
                    }
                    controlBar(cards: cards)

                    if state.schedule.source == "seed" {
                        banner("Showing the built-in schedule. The full slate loads when the live feed is reachable.", Theme.warn)
                    }
                    if shown.isEmpty {
                        banner(state.showAllGames
                               ? "No games loaded for this week yet."
                               : "None of your games this week. Switch to All games to add one.", Theme.textDim)
                    }

                    ForEach(groups, id: \.key) { _, dayCards in
                        if let first = dayCards.first {
                            dayHeader(first.game.kickoff)
                        }
                        ForEach(dayCards) { card in
                            GameCardView(card: card) { state.toggleFollow(card) }
                                .onTapGesture { detail = card }
                        }
                    }
                    Color.clear.frame(height: 12)
                }
                .padding(.horizontal, 14)
                .padding(.top, 4)
            }
            .background { Theme.background.ignoresSafeArea() }
            .scrollContentBackground(.hidden)
            .navigationTitle("This Week")
            .toolbarBackground(Theme.bgTop, for: .navigationBar)
            .refreshable { await state.syncAndReplan() }
            .sheet(item: $detail) { c in GameDetailView(cardId: c.id) }
            .onChange(of: state.deepLinkGameId) { _, id in
                if let id, let c = state.card(id) { state.selectedWeek = c.game.week; detail = c; state.deepLinkGameId = nil }
            }
        }
    }

    private func controlBar(cards: [GameCard]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
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
                Picker("", selection: $state.showAllGames) {
                    Text("Mine").tag(false)
                    Text("All").tag(true)
                }
                .pickerStyle(.segmented)
                .frame(width: 130)
            }
            HStack(spacing: 6) {
                statChip("\(cards.filter(\.followed).count)", "following", Theme.accent)
                statChip("\(state.plan.count)", "alerts set", Theme.ok)
                Spacer(minLength: 0)
            }
        }
        .padding(.bottom, 2)
    }

    private func travelBanner(_ name: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: "airplane.departure").font(.footnote.weight(.bold)).foregroundStyle(Theme.bgTop)
            VStack(alignment: .leading, spacing: 1) {
                Text("Watching from \(name)").font(.caption.weight(.heavy)).foregroundStyle(Theme.bgTop)
                Text("Channels and regional games are for this market")
                    .font(.caption2).foregroundStyle(Theme.bgTop.opacity(0.75))
            }
            Spacer(minLength: 0)
            Button("Back home") { state.user.travelMarket = nil }
                .font(.caption.weight(.bold))
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Theme.bgTop.opacity(0.18), in: Capsule())
                .foregroundStyle(Theme.bgTop)
                .buttonStyle(.plain)
        }
        .padding(11)
        .background(Theme.accent, in: RoundedRectangle(cornerRadius: 13))
    }

    private func statChip(_ value: String, _ label: String, _ color: Color) -> some View {
        HStack(spacing: 5) {
            Text(value).font(.system(size: 15, weight: .heavy, design: .rounded)).foregroundStyle(color)
            Text(label).font(.caption).foregroundStyle(Theme.textDim)
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Theme.surface, in: Capsule())
    }

    private func dayHeader(_ date: Date) -> some View {
        HStack(spacing: 8) {
            Text(TimeFormat.day(date, tz: tz).uppercased())
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .tracking(1.0)
                .foregroundStyle(Theme.textDim)
            Rectangle().fill(Theme.hairline).frame(height: 1)
        }
        .padding(.top, 6)
    }

    private func banner(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(Theme.textDim)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay(alignment: .leading) { Rectangle().fill(color).frame(width: 3) }
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Badges

struct ConfidenceBadge: View {
    let confidence: Confidence
    var text: String? = nil
    var body: some View { Pill(text: (text ?? confidence.rawValue).uppercased(), color: color) }
    private var color: Color {
        switch confidence {
        case .confirmed, .stable: return Theme.ok
        case .likely, .typical: return Theme.warn
        default: return Theme.textDim
        }
    }
}

// MARK: - Game card

struct GameCardView: View {
    @EnvironmentObject var state: AppState
    let card: GameCard
    /// False inside the detail sheet, where a "Details" affordance would point at itself.
    var showsDetailChevron: Bool = true
    let onToggleFollow: () -> Void
    private var tz: TimeZone { state.user.timeZone }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider().overlay(Theme.hairline)
            clocks
            watchRow
            notes
            footer
        }
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(card.followed ? Theme.team(card.game.home).opacity(0.55) : Theme.hairline,
                        lineWidth: card.followed ? 1.5 : 1)
        )
        .opacity(card.followed ? 1 : 0.82)
    }

    private var countdown: Countdown { Countdown(to: card.game.kickoff, tz: tz) }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Pill(text: countdown.label, color: countdown.color, filled: countdown.urgent)
                Text(BroadcastWindows.labels[card.game.window] ?? card.game.window)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(Theme.textDim)
                Spacer(minLength: 0)
                Button(action: onToggleFollow) {
                    Image(systemName: card.followed ? "bell.fill" : "bell")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(card.followed ? Theme.accent : Theme.textDim)
                        .frame(width: 34, height: 34)
                        .background(card.followed ? Theme.accent.opacity(0.15) : Theme.surfaceRaised, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(card.followed ? "Stop reminding me" : "Remind me")
            }
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                teamName(Teams.short(card.game.away), card.game.away)
                Text("at").font(.caption).foregroundStyle(Theme.textDim)
                teamName(Teams.short(card.game.home), card.game.home)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.65)
            if let label = card.game.label {
                Text(label).font(.caption2.weight(.semibold)).foregroundStyle(Theme.accent)
            }
        }
        .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.matchupGradient(away: card.game.away, home: card.game.home))
    }

    private func teamName(_ name: String, _ id: String) -> some View {
        Text(name)
            .font(.system(size: 21, weight: .heavy, design: .rounded))
            .foregroundStyle(Theme.text)
            .shadow(color: Theme.team(id).opacity(0.7), radius: 0, x: 0, y: 2)
    }

    private var clocks: some View {
        HStack(spacing: 0) {
            clock("COVERAGE", card.coverage.start, sub: card.coverage.show, tint: Theme.ok)
            Rectangle().fill(Theme.hairline).frame(width: 1, height: 44)
            clock("KICKOFF", card.game.kickoff, sub: etSuffix, tint: Theme.accent)
        }
        .padding(.vertical, 12)
    }

    /// Only show Eastern alongside when it actually differs from the user's zone.
    private var etSuffix: String {
        let local = TimeFormat.time(card.game.kickoff, tz: tz, zone: false)
        let et = TimeFormat.time(card.game.kickoff, tz: TimeFormat.eastern, zone: false)
        return local == et ? "" : "\(et) ET"
    }

    private func clock(_ title: String, _ date: Date, sub: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 10, weight: .heavy, design: .rounded)).tracking(0.8)
                .foregroundStyle(tint)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(TimeFormat.time(date, tz: tz, zone: false))
                    .font(.system(size: 24, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.text)
                Text(TimeFormat.abbr(tz, at: date))
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.textDim)
            }
            .lineLimit(1).minimumScaleFactor(0.7)
            if !sub.isEmpty {
                Text(sub).font(.caption2).foregroundStyle(Theme.textDim).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
    }

    private var watchRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 7) {
                Image(systemName: "tv.fill").font(.caption).foregroundStyle(Theme.textDim)
                if let ch = card.channels.first {
                    Text(ch.stationCall ?? ch.label)
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.text)
                    Pill(text: ch.label, color: Theme.network(ch.network), filled: true)
                    if let n = ch.number {
                        Text("ch. \(n)").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.text)
                        ConfidenceBadge(confidence: ch.confidence,
                                        text: ch.source == "you set this" ? "yours" : nil)
                    }
                } else if let ex = card.game.exclusive {
                    Pill(text: ex, color: Theme.network(ex), filled: true)
                    Text("exclusive").font(.caption).foregroundStyle(Theme.textDim)
                }
                Spacer(minLength: 0)
            }
            if card.game.exclusive == nil, !card.game.streams.isEmpty {
                HStack(spacing: 5) {
                    ForEach(card.game.streams.prefix(3), id: \.self) { s in
                        Pill(text: state.catalog.label(s), color: Theme.network(s))
                    }
                }
            }
            if let hint = card.channels.first?.hint {
                Text(hint).font(.caption2).foregroundStyle(Theme.textDim).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 14).padding(.bottom, 10)
    }

    @ViewBuilder private var notes: some View {
        VStack(alignment: .leading, spacing: 6) {
            if card.inMarket.airs == false {
                note("Not on your local station. \(card.inMarket.reason).", Theme.warn, "exclamationmark.triangle.fill")
            } else if card.inMarket.airs == true, card.inMarket.confidence != .confirmed, card.game.isRegional {
                note(card.inMarket.reason, Theme.textDim, "map")
            }
            if !card.access.ok {
                note("You may not be able to watch this. Options: "
                     + card.access.missing.map { $0.label + ($0.cost.map { " (\($0))" } ?? "") }.joined(separator: "; "),
                     Theme.bad, "lock.fill")
            }
            ForEach(card.access.notes, id: \.self) { note($0, Theme.warn, "info.circle.fill") }
            if !card.game.verified {
                note(card.game.notes ?? "Some details are not confirmed yet.", Theme.textDim, "questionmark.circle")
            }
            if let ch = card.changes.last {
                note("Moved \(ch.at.formatted(date: .abbreviated, time: .shortened)). Reminders re-armed.",
                     Theme.accent, "arrow.triangle.2.circlepath")
            }
        }
        .padding(.horizontal, 14)
    }

    private func note(_ text: String, _ color: Color, _ icon: String) -> some View {
        HStack(alignment: .top, spacing: 7) {
            Image(systemName: icon).font(.caption2).foregroundStyle(color).padding(.top, 2)
            Text(text).font(.caption).foregroundStyle(Theme.text.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 9))
    }

    @ViewBuilder private var footer: some View {
        if !showsDetailChevron {
            if card.followed, !card.plannedAlerts.isEmpty {
                HStack(spacing: 5) {
                    Image(systemName: "bell.badge.fill").font(.caption2).foregroundStyle(Theme.accent)
                    Text("\(card.plannedAlerts.count) alert\(card.plannedAlerts.count == 1 ? "" : "s") set")
                        .font(.caption2.weight(.semibold)).foregroundStyle(Theme.textDim)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 12)
            } else {
                Color.clear.frame(height: 12)
            }
        } else if card.followed, !card.plannedAlerts.isEmpty {
            HStack(spacing: 5) {
                Image(systemName: "bell.badge.fill").font(.caption2).foregroundStyle(Theme.accent)
                Text("\(card.plannedAlerts.count) alert\(card.plannedAlerts.count == 1 ? "" : "s") set")
                    .font(.caption2.weight(.semibold)).foregroundStyle(Theme.textDim)
                Spacer(minLength: 0)
                Text("Details").font(.caption2.weight(.bold)).foregroundStyle(Theme.accent)
                Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Theme.accent)
            }
            .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 12)
        } else {
            HStack {
                Spacer(minLength: 0)
                Text("Details").font(.caption2.weight(.bold)).foregroundStyle(Theme.accent)
                Image(systemName: "chevron.right").font(.system(size: 9, weight: .bold)).foregroundStyle(Theme.accent)
            }
            .padding(.horizontal, 14).padding(.top, 6).padding(.bottom, 12)
        }
    }
}
