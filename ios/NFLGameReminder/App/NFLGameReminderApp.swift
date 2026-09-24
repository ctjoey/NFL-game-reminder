import SwiftUI
import UserNotifications

@main
struct NFLGameReminderApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var state = AppState()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .onAppear { delegate.state = state; BackgroundRefresh.register(appState: state) }
                .onOpenURL { url in
                    switch DeepLink.parse(url) {
                    case .week(let n): state.selectedWeek = n; state.deepLinkTab = 0
                    case .game(let id): state.deepLinkGameId = id; state.deepLinkTab = 0
                    case .alerts: state.deepLinkTab = 1
                    case nil: break
                    }
                }
        }
        .onChange(of: phase) { _, p in
            if p == .active { Task { await state.notifications.refreshStatus(); await state.syncAndReplan() } }
            if p == .background { BackgroundRefresh.schedule() }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var state: AppState?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
    // Show alerts even when the app is in the foreground.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        if let key = notification.request.content.userInfo["key"] as? String { await MainActor.run { NotificationManager.shared.markDelivered(key: key) } }
        return [.banner, .sound, .list]
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        if let key = info["key"] as? String { await MainActor.run { NotificationManager.shared.markDelivered(key: key) } }
        if let id = info["gameId"] as? String, !id.isEmpty { await MainActor.run { state?.deepLinkGameId = id } }
    }
}

struct RootView: View {
    @EnvironmentObject var state: AppState
    @State private var tab = 0

    var body: some View {
        if state.user.onboarded {
            TabView(selection: $tab) {
                WeekView().tabItem { Label("This week", systemImage: "calendar") }.tag(0)
                AlertsView().tabItem { Label("Alerts", systemImage: "bell.badge") }.tag(1)
                SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }.tag(2)
            }
            .tint(Theme.accent)
            .preferredColorScheme(.dark)
            .onAppear(perform: applyScreenshotMode)
            .onChange(of: state.deepLinkTab) { _, t in
                if let t { tab = t; state.deepLinkTab = nil }
            }
        } else {
            OnboardingView().tint(Theme.accent).preferredColorScheme(.dark)
        }
    }

    /// Store-listing capture: open straight to the screen being photographed.
    private func applyScreenshotMode() {
        guard let screen = ScreenshotMode.screen else { return }
        state.selectedWeek = ScreenshotMode.showcaseWeek
        // The layout lives in UserDefaults, so the capture sets it the same way a person would.
        UserDefaults.standard.set(screen == .weeklist, forKey: WeekView.compactLayoutKey)
        switch screen {
        case .alerts: tab = 1
        case .settings: tab = 2
        case .detail: state.deepLinkGameId = state.screenshotDetailGameId
        case .weekall, .weeklist: state.showAllGames = true
        case .week: break
        }
        // Explicitly, rather than leaning on the scene-phase change: on a cold launch that can fire
        // before the observer is attached, and the capture would photograph the bundled sample.
        Task { await state.syncAndReplan() }
    }
}
