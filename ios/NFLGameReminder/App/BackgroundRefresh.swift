import Foundation
import BackgroundTasks

/// Periodic schedule sync while the app is backgrounded. iOS decides the actual cadence
/// (typically a few times a day). Server-pushed change alerts (Tier 3) make this instant.
enum BackgroundRefresh {
    static let identifier = "com.yourcompany.NFLGameReminder.refresh"

    static func register(appState: AppState) {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: nil) { task in
            guard let task = task as? BGAppRefreshTask else { return }
            schedule()
            let work = Task { @MainActor in
                await appState.syncAndReplan()
                task.setTaskCompleted(success: true)
            }
            task.expirationHandler = { work.cancel() }
        }
    }

    static func schedule() {
        let req = BGAppRefreshTaskRequest(identifier: identifier)
        req.earliestBeginDate = Date(timeIntervalSinceNow: 4 * 3600)
        try? BGTaskScheduler.shared.submit(req)
    }
}
