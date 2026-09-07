import SwiftUI
import UIKit

/// Lets a viewer correct our channel data, or fill in a number we never had.
///
/// Two jobs in one control. Station call signs and over-the-air numbers we ship, but they go
/// stale — CBS moved off six stations in August 2026 and our data was wrong in three markets for
/// five weeks. Cable numbers we never have at all, because lineups are per-headend rather than
/// per-provider. Both are fixed by the same person: someone sitting in that market, looking at
/// that channel.
///
/// Reports arrive as ordinary mail and get folded into the next release, so this needs no server
/// and nothing leaves the device unless the sender presses send.
enum ChannelReport {
    static let address = "capozzacontracting@gmail.com"

    /// True when we are showing a number that could be wrong rather than admitting we do not know.
    static func isCorrection(_ ch: ChannelInfo) -> Bool { ch.number != nil }

    static func prompt(_ ch: ChannelInfo) -> String {
        isCorrection(ch) ? "Wrong channel? Tell us" : "Know the channel? Tell us"
    }

    static func mailURL(_ ch: ChannelInfo, user: UserProfile, catalog: Catalog = .shared) -> URL? {
        let market = user.market.flatMap { catalog.markets[$0] }
        let marketName = market.map { "\($0.name), \($0.state)" } ?? "unknown market"
        let provider = user.provider.flatMap { catalog.providers[$0]?.name } ?? "not set"

        let subject = "\(ch.network) in \(marketName)"
        var body = """
        What the app shows

        Network:   \(ch.network)
        Market:    \(marketName)\(user.zip.isEmpty ? "" : " (ZIP \(user.zip))")
        Provider:  \(provider)
        Station:   \(ch.stationCall ?? "—")
        Channel:   \(ch.number ?? "not known")


        """
        body += isCorrection(ch)
            ? """
              What it should be

              Station:   
              Channel:   


              Anything else worth knowing:

              """
            : """
              What channel is it on your \(provider)?

              Channel:   


              Anything else worth knowing:

              """
        body += "\n\n— sent from Game Time Reminder"

        var c = URLComponents()
        c.scheme = "mailto"
        c.path = address
        c.queryItems = [URLQueryItem(name: "subject", value: subject),
                        URLQueryItem(name: "body", value: body)]
        return c.url
    }
}

/// A quiet link under a channel row. Deliberately understated — it should be findable by someone
/// who spotted a mistake, not compete with the answer itself.
struct ChannelReportLink: View {
    @EnvironmentObject var state: AppState
    let channel: ChannelInfo
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            if let url = ChannelReport.mailURL(channel, user: state.user, catalog: state.catalog) {
                openURL(url)
            }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: ChannelReport.isCorrection(channel) ? "exclamationmark.bubble" : "plus.bubble")
                Text(ChannelReport.prompt(channel))
            }
            .font(.caption2)
            .foregroundStyle(Theme.textDim)
        }
        .buttonStyle(.plain)
    }
}
