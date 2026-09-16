import SwiftUI

/// The app's own name, for the two places it earns its keep: the first screen a new user sees, and
/// the About section, where an app is expected to say what it is.
///
/// Deliberately *not* in the navigation bars. "This Week's Games" answers the question the user
/// opened the app to ask; replacing it with the app's name would tell them something they already
/// know and cost them the thing they came for.
///
/// It matters at all because of word of mouth. Someone shows the app to a friend in a bar, and
/// until now there was nothing anywhere on screen telling that friend what to go and search for.
struct Wordmark: View {
    /// Split so the second half can carry the accent colour. Tested against AppInfo.name, because
    /// two halves that no longer spell the product's name is a typo nobody would ever notice.
    static let head = "Game"
    static let tail = "Dial"

    var tagline: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            // Dial in the accent colour: the half of the name that says what the app does.
            (Text(Self.head).foregroundStyle(Theme.text) + Text(Self.tail).foregroundStyle(Theme.accent))
                .font(.system(size: 27, weight: .heavy, design: .rounded))
                .tracking(-0.4)
            if let tagline {
                Text(tagline).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
    }
}
