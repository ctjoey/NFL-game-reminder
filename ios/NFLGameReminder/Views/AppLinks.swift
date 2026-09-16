import Foundation

/// Where the app lives publicly. Kept in one place so a link in Settings, a share sheet and any
/// future landing page can never drift apart.
enum AppLinks {
    /// The id-only form on purpose: the slug in an App Store URL is decorative, Apple redirects
    /// it, and a slug baked into the binary goes stale the next time the app is renamed.
    static let appStore = URL(string: "https://apps.apple.com/app/id6808454832")!

    /// What rides along with the link. Says what the app answers rather than what it is called -
    /// the person receiving this has not heard of it, and "what channel is the game on" is the
    /// question they already have.
    static let shareMessage = "\(AppInfo.name) — what NFL game is on, when coverage starts, and which channel it's on where you are."
}
