import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject var state: AppState
    @State private var draft = UserProfile()
    @State private var marketHint = ""
    @State private var showMarketError = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("No account, no ads. Tell us where you are and what you pay for; we do the rest.").font(.subheadline).foregroundStyle(.secondary)
                }
                LocationSection(draft: $draft, marketHint: $marketHint)
                FollowSection(draft: $draft)
                AlertsSection(draft: $draft)
                Section {
                    Button {
                        guard draft.market != nil else { showMarketError = true; return }
                        draft.onboarded = true
                        state.user = draft
                        Task { await state.notifications.requestAuthorization(); await state.replan() }
                    } label: { Text("Show my games").frame(maxWidth: .infinity).bold() }
                    .buttonStyle(.borderedProminent)
                }
            }
            .navigationTitle("Set up in 60 seconds")
            .alert("Pick your TV market", isPresented: $showMarketError) { Button("OK") {} } message: { Text("Enter a ZIP code or choose a market so we can find your channels.") }
        }
    }
}

struct LocationSection: View {
    @EnvironmentObject var state: AppState
    @Binding var draft: UserProfile
    @Binding var marketHint: String
    var body: some View {
        Section("Where you watch") {
            TextField("ZIP code", text: $draft.zip).keyboardType(.numberPad)
                .onChange(of: draft.zip) { _, z in
                    if z.count >= 5, let m = state.catalog.market(forZip: z) {
                        draft.market = m.id
                        marketHint = "\(m.name): CBS \(m.affiliates["CBS"]?.call ?? "") · FOX \(m.affiliates["FOX"]?.call ?? "") · NBC \(m.affiliates["NBC"]?.call ?? "") · ABC \(m.affiliates["ABC"]?.call ?? "")"
                    } else if z.count >= 5 { marketHint = "ZIP not in the built-in table yet. Pick your market below." }
                }
            if !marketHint.isEmpty { Text(marketHint).font(.caption).foregroundStyle(.secondary) }
            Picker("TV market", selection: $draft.market) {
                Text("— pick —").tag(String?.none)
                ForEach(state.catalog.marketList) { m in Text("\(m.name), \(m.state)").tag(String?.some(m.id)) }
            }
            Picker("TV provider", selection: $draft.provider) {
                Text("— how do you watch TV? —").tag(String?.none)
                ForEach(state.catalog.providerList) { p in Text(p.name).tag(String?.some(p.id)) }
            }
            if let p = draft.provider.flatMap({ state.catalog.providers[$0] }) {
                if let h = p.guideHint { Text(h).font(.caption).foregroundStyle(.secondary) }
                if let n = p.carriageNotes { Label(n, systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange) }
            }
            Toggle("I also have an antenna (CBS/FOX/NBC/ABC free over the air)", isOn: $draft.hasAntenna)
            Picker("Time zone", selection: $draft.tz) {
                ForEach(Array(Set([draft.tz, "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"])).sorted(), id: \.self) { Text($0).tag($0) }
            }
        }
        Section("Streaming services you pay for") {
            Text("Used to warn you a day early when a game is somewhere you cannot watch.").font(.caption).foregroundStyle(.secondary)
            ChipGrid(items: state.catalog.serviceList.map { ($0.id, $0.name) }, selected: Set(draft.services)) { id in
                if let i = draft.services.firstIndex(of: id) { draft.services.remove(at: i) } else { draft.services.append(id) }
            }
        }
    }
}

struct FollowSection: View {
    @Binding var draft: UserProfile
    var body: some View {
        Section("Which games") {
            Picker("Follow", selection: $draft.follow.mode) {
                Text("My teams").tag(FollowSettings.Mode.teams)
                Text("Every game").tag(FollowSettings.Mode.all)
                Text("Only games I pick").tag(FollowSettings.Mode.games)
            }.pickerStyle(.segmented)
            if draft.follow.mode != .games {
                ChipGrid(items: Teams.ids.map { ($0, Teams.short($0)) }, selected: Set(draft.follow.teams),
                         colorFor: { Theme.team($0) }) { id in
                    if let i = draft.follow.teams.firstIndex(of: id) { draft.follow.teams.remove(at: i) } else { draft.follow.teams.append(id) }
                }
            } else {
                Text("Pick games with “Remind me” on each game card.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct AlertsSection: View {
    @Binding var draft: UserProfile
    private let leads = [15, 30, 60, 120, 1440]
    var body: some View {
        Section("Alerts") {
            Text("Only these, only for games you follow, never anything else.").font(.caption).foregroundStyle(.secondary)
            Toggle("When network coverage begins (pregame show)", isOn: $draft.alerts.coverage)
            HStack { Text("Before kickoff").foregroundStyle(.secondary)
                ChipGrid(items: leads.map { ($0 == 1440 ? "1 day" : $0 >= 60 ? "\($0 / 60) h" : "\($0) min").pair(String($0)) }, selected: Set(draft.alerts.kickoffLeads.map { String($0) })) { id in
                    let m = Int(id)!; if let i = draft.alerts.kickoffLeads.firstIndex(of: m) { draft.alerts.kickoffLeads.remove(at: i) } else { draft.alerts.kickoffLeads.append(m) }
                } }
            Toggle("At kickoff", isOn: $draft.alerts.kickoffNow)
            Toggle("A day ahead if it is on something you don’t have", isOn: $draft.alerts.access)
            Toggle("When a game is moved or changes network", isOn: $draft.alerts.changes)
            Toggle("Weekly rundown with channels", isOn: $draft.alerts.weekly)
            if draft.alerts.weekly {
                Picker("Rundown day", selection: $draft.alerts.weeklyDay) { ForEach(1...7, id: \.self) { Text(Calendar.current.shortWeekdaySymbols[$0 - 1]).tag($0) } }
                Picker("Rundown hour", selection: $draft.alerts.weeklyHour) { ForEach(0..<24, id: \.self) { h in Text("\((h + 11) % 12 + 1) \(h < 12 ? "am" : "pm")").tag(h) } }
            }
            Stepper("Max alerts per day: \(draft.maxPerDay)", value: $draft.maxPerDay, in: 1...50)
            QuietHoursRow(quiet: $draft.quiet)
            Text("Quiet hours hold the rundown, access warnings and change notices until morning. Coverage and kickoff alerts still fire.").font(.caption).foregroundStyle(.secondary)
        }
    }
}

struct QuietHoursRow: View {
    @Binding var quiet: QuietHours?
    var body: some View {
        Toggle("Quiet hours", isOn: Binding(get: { quiet != nil }, set: { quiet = $0 ? QuietHours() : nil }))
        if quiet != nil {
            HStack {
                Picker("From", selection: Binding(get: { quiet!.start / 60 }, set: { quiet!.start = $0 * 60 })) { ForEach(0..<24, id: \.self) { Text(hour($0)).tag($0) } }
                Picker("Until", selection: Binding(get: { quiet!.end / 60 }, set: { quiet!.end = $0 * 60 })) { ForEach(0..<24, id: \.self) { Text(hour($0)).tag($0) } }
            }
        }
    }
    private func hour(_ h: Int) -> String { "\((h + 11) % 12 + 1) \(h < 12 ? "am" : "pm")" }
}

private extension String { func pair(_ id: String) -> (String, String) { (id, self) } }

struct ChipGrid: View {
    let items: [(String, String)]
    let selected: Set<String>
    var colorFor: ((String) -> Color)? = nil
    let toggle: (String) -> Void
    var body: some View {
        FlowLayout(spacing: 7) {
            ForEach(items, id: \.0) { item in
                let (id, label) = item
                let on = selected.contains(id)
                let tint = colorFor?(id) ?? Theme.accent
                Button { toggle(id) } label: {
                    Text(label)
                        .font(.system(size: 13, weight: on ? .bold : .medium, design: .rounded))
                        .padding(.horizontal, 12).padding(.vertical, 7)
                        .background(on ? tint.opacity(0.26) : Color(.secondarySystemFill), in: Capsule())
                        .overlay(Capsule().stroke(on ? tint : Color.clear, lineWidth: 1.5))
                        .foregroundStyle(on ? tint : Color.primary)
                }.buttonStyle(.plain)
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let w = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x + sz.width > w, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += sz.width + spacing; rowH = max(rowH, sz.height)
        }
        return CGSize(width: w, height: y + rowH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x + sz.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sz))
            x += sz.width + spacing; rowH = max(rowH, sz.height)
        }
    }
}
