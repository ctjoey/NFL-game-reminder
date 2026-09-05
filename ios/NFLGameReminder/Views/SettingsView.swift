import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var state: AppState
    @State private var draft = UserProfile()
    @State private var marketHint = ""
    @State private var message: String?
    @State private var saveTask: Task<Void, Never>?
    private let calendar = CalendarService()

    var body: some View {
        NavigationStack {
            Form {
                LocationSection(draft: $draft, marketHint: $marketHint)
                ChannelNumbersSection(draft: $draft)
                FollowSection(draft: $draft)
                AlertsSection(draft: $draft)
                Section("Delivery") {
                    HStack { Text("Notifications"); Spacer(); Text(state.notifications.authorized ? "Allowed" : "Not allowed").foregroundStyle(state.notifications.authorized ? .green : .red) }
                    if !state.notifications.authorized { Button("Allow notifications") { Task { await state.notifications.requestAuthorization(); await state.replan() } } }
                    Button("Send test alert") { Task { await state.notifications.sendTest(user: state.user); message = "Test alert arrives in 2 seconds." } }
                    Text("A banner only stays a few seconds — that is iOS, not the app. Pull down on one to read it in full, or find it later in Notification Center. To make banners wait for you, open iOS Settings → Notifications → Game Time Reminder and set Banner Style to Persistent.")
                        .font(.caption).foregroundStyle(.secondary)
                    Button("Add my games to Calendar") {
                        Task {
                            guard await calendar.requestAccess() else { message = "Calendar access was not granted."; return }
                            let cards = state.schedule.weeks.flatMap { state.cards(week: $0) }
                            do { let n = try calendar.sync(cards: cards, user: state.user); message = "Added or updated \(n) calendar events." } catch { message = error.localizedDescription }
                        }
                    }
                    Button("Sync schedule now") { Task { await state.syncAndReplan(); message = state.schedule.lastError ?? "Synced \(state.schedule.games.count) games from \(state.schedule.source)." } }
                }
                Section {
                    Button("Delete my data", role: .destructive) { draft = UserProfile(); commit() }
                }
                Section("About") {
                    Text("Whether you're home or on the road, you can find out what games are showing and where to find them in your area.")
                        .font(.subheadline)
                    VStack(alignment: .leading, spacing: 6) {
                        step(1, "Select your market and your TV provider.")
                        step(2, "Pick the teams you want to follow.")
                        step(3, "Set alerts to remind you when pregame coverage or kickoff starts.")
                    }
                    .padding(.vertical, 2)
                    Text("Changes save as you make them.").font(.caption).foregroundStyle(.secondary)
                    Text("Schedule: \(state.schedule.games.count) games from \(state.schedule.source)\(state.schedule.lastSync.map { ", synced \($0.formatted(date: .abbreviated, time: .shortened))" } ?? "")").font(.caption)
                    if let e = state.schedule.lastError { Text("Last sync error: \(e)").font(.caption).foregroundStyle(.orange) }
                    Text("No ads. No account. Data stays on this device.").font(.caption).foregroundStyle(.secondary)
                }
            }
            .dismissableKeyboard()
            .scrollContentBackground(.hidden)
            .background { Theme.background.ignoresSafeArea() }
            .navigationTitle("Settings")
            .toolbarBackground(Theme.bgTop, for: .navigationBar)
            // Re-read on every visit, not just the first: following a game from the week screen
            // changes the profile while this screen is off-screen and not receiving updates, and
            // a stale draft would write that pick straight back out.
            .onAppear { if saveTask == nil { draft = state.user } }
            .onChange(of: draft) { _, _ in scheduleSave() }
            // Something else changed the profile (following a game from the week screen);
            // take it, as long as an edit of ours is not still in flight.
            .onChange(of: state.user) { _, new in if saveTask == nil, new != draft { draft = new } }
            .onDisappear { commit() }
            .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) { Button("OK") {} }
        }
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Text("\(n)")
                .font(.system(size: 12, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.bgTop)
                .frame(width: 20, height: 20)
                .background(Theme.accent, in: Circle())
            Text(text).font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }

    /// Settings has no Save button: edits are the user's intent, and a draft that only commits on
    /// a button press loses everything the moment you switch tabs. Typing is coalesced so a ZIP
    /// code costs one save rather than five.
    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            commit()
        }
    }

    private func commit() {
        saveTask?.cancel()
        saveTask = nil
        // `onboarded` rides along untouched, so "Delete my data" resets to a fresh profile and
        // lands back on setup instead of being forced past it.
        if draft != state.user { state.user = draft }
    }
}

/// What channel each network is on, worked out from the market and provider rather than asked for.
/// A number is only requested where it genuinely cannot be known: cable headends renumber locals
/// city by city, so there is no table that would get it right.
struct ChannelNumbersSection: View {
    @EnvironmentObject var state: AppState
    @Binding var draft: UserProfile
    private let nets = ["CBS", "FOX", "NBC", "ABC", "ESPN", "NFLN"]

    private var provider: Provider? { draft.provider.flatMap { state.catalog.providers[$0] } }

    var body: some View {
        if let provider, provider.kind != "stream" {
            let place = draft.market.flatMap { state.catalog.markets[$0]?.name }
            Section(place.map { "\(provider.name) channels in \($0)" } ?? "Channel numbers on \(provider.name)") {
                // Only what this provider actually carries: an antenna has no ESPN to number.
                let carried = provider.carries.isEmpty ? nets : nets.filter { provider.carries.contains($0) }
                let rows = carried.map { state.catalog.channel(for: $0, user: draft) }
                let unknown = rows.filter { $0.number == nil }
                Text(unknown.isEmpty
                     ? "Filled in from your market and provider."
                     : "Filled in where we can be sure. \(provider.name) renumbers channels city by city, so the rest are yours to fill in. Numbers are kept per market, so changing markets never shows you the wrong ones.")
                    .font(.caption).foregroundStyle(.secondary)
                ForEach(rows, id: \.network) { row in
                    HStack(spacing: 10) {
                        Text(row.network)
                            .frame(width: 58, alignment: .leading)
                            .lineLimit(1).minimumScaleFactor(0.7)
                        if let n = row.number {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(row.stationCall.map { "\($0) · channel \(n)" } ?? "Channel \(n)")
                                if let s = row.source { Text(s).font(.caption2).foregroundStyle(.secondary) }
                            }
                        } else {
                            TextField("channel #", text: Binding(
                                get: { draft.channelOverride(row.network) ?? "" },
                                set: { draft.setChannelOverride(row.network, $0.trimmingCharacters(in: .whitespaces)) }))
                                .keyboardType(.numbersAndPunctuation)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }
}
