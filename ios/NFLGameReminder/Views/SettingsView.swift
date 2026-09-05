import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var state: AppState
    @State private var draft = UserProfile()
    @State private var marketHint = ""
    @State private var message: String?
    private let calendar = CalendarService()

    var body: some View {
        NavigationStack {
            Form {
                LocationSection(draft: $draft, marketHint: $marketHint)
                TravelSection(draft: $draft)
                ChannelOverridesSection(draft: $draft)
                FollowSection(draft: $draft)
                AlertsSection(draft: $draft)
                Section("Delivery") {
                    HStack { Text("Notifications"); Spacer(); Text(state.notifications.authorized ? "Allowed" : "Not allowed").foregroundStyle(state.notifications.authorized ? .green : .red) }
                    if !state.notifications.authorized { Button("Allow notifications") { Task { await state.notifications.requestAuthorization(); await state.replan() } } }
                    Button("Send test alert") { Task { await state.notifications.sendTest(user: state.user); message = "Test alert arrives in 2 seconds." } }
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
                    Button("Save changes") { draft.onboarded = true; state.user = draft; message = "Saved." }.bold()
                    Button("Delete my data", role: .destructive) { state.user = UserProfile() }
                }
                Section("About") {
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
            .onAppear { draft = state.user }
            .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) { Button("OK") {} }
        }
    }
}

struct ChannelOverridesSection: View {
    @EnvironmentObject var state: AppState
    @Binding var draft: UserProfile
    private let nets = ["CBS", "FOX", "NBC", "ABC", "ESPN", "NFLN"]
    var body: some View {
        Section("Channel numbers on \(draft.provider.flatMap { state.catalog.providers[$0]?.name } ?? "your provider")") {
            let isStream = draft.provider.flatMap { state.catalog.providers[$0]?.kind } == "stream"
            Text(isStream ? "Streaming guides have no numbers; nothing to set." : "Defaults are the over-the-air numbers (exact for antenna, DirecTV, DISH). If your box uses different numbers, set them once here.").font(.caption).foregroundStyle(.secondary)
            if !isStream {
                ForEach(nets, id: \.self) { n in
                    HStack { Text(n).frame(width: 60, alignment: .leading)
                        TextField("channel #", text: Binding(get: { draft.channelOverrides[n] ?? "" }, set: { draft.channelOverrides[n] = $0.trimmingCharacters(in: .whitespaces) })).keyboardType(.numbersAndPunctuation) }
                }
            }
        }
    }
}


/// Away from home? Point the app at whatever market you are actually in. The home market is
/// remembered, so coming back is one tap.
struct TravelSection: View {
    @EnvironmentObject var state: AppState
    @Binding var draft: UserProfile
    var body: some View {
        Section("Traveling") {
            Text("In another city? Switch markets and the app shows that city's stations, channel numbers and regional games. Your home market is kept.")
                .font(.caption).foregroundStyle(.secondary)
            WidePicker(title: "Watching from", selection: $draft.travelMarket) {
                Text("Home\(draft.market.flatMap { state.catalog.markets[$0]?.name }.map { " (\($0))" } ?? "")")
                    .tag(String?.none)
                ForEach(state.catalog.marketList) { m in
                    Text("\(m.name), \(m.state)").tag(String?.some(m.id))
                }
            }
            if draft.travelMarket != nil, draft.travelMarket != draft.market {
                Button("Back to my home market") { draft.travelMarket = nil }
            }
        }
    }
}
