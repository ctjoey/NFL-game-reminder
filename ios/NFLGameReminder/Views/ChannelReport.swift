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
    static let address = "wrongchannel@yahoo.com"

    /// What there is to correct here. A streaming service has no channel numbers to be wrong
    /// about, but the station it carries for this market certainly can be - and asking a YouTube
    /// TV viewer for a channel number would be nonsense, which is why the ask differs.
    enum Ask { case wrongNumber, missingNumber, wrongStation }

    static func ask(_ ch: ChannelInfo, user: UserProfile, catalog: Catalog = .shared) -> Ask {
        if ch.number != nil { return .wrongNumber }
        let streaming = user.provider.flatMap { catalog.providers[$0]?.kind } == "stream"
        return streaming ? .wrongStation : .missingNumber
    }

    static func prompt(_ ask: Ask) -> String {
        switch ask {
        case .wrongNumber: return "Wrong channel? Tell us"
        case .missingNumber: return "Know the channel? Tell us"
        case .wrongStation: return "Wrong station? Tell us"
        }
    }

    static func icon(_ ask: Ask) -> String {
        ask == .missingNumber ? "plus.bubble" : "exclamationmark.bubble"
    }

    static func mailURL(_ ch: ChannelInfo, user: UserProfile, catalog: Catalog = .shared) -> URL? {
        let market = user.market.flatMap { catalog.markets[$0] }
        let marketName = market.map { "\($0.name), \($0.state)" } ?? "unknown market"
        let provider = user.provider.flatMap { catalog.providers[$0]?.name } ?? "not set"

        let what = ask(ch, user: user, catalog: catalog)
        let subject = "\(ch.network) in \(marketName)"
        var body = """
        What the app shows

        Network:   \(ch.network)
        Market:    \(marketName)\(user.zip.isEmpty ? "" : " (ZIP \(user.zip))")
        Provider:  \(provider)
        Station:   \(ch.stationCall ?? "—")
        Channel:   \(ch.number ?? "not known")


        """
        switch what {
        case .wrongNumber:
            body += """
            What it should be

            Station:   
            Channel:   


            Anything else worth knowing:

            """
        case .missingNumber:
            body += """
            What channel is it on your \(provider)?

            Channel:   


            Anything else worth knowing:

            """
        case .wrongStation:
            body += """
            \(provider) has no channel numbers, but the station can still be wrong.
            Which station carries \(ch.network) where you are?

            Station:   


            Anything else worth knowing:

            """
        }
        body += "\n\n— sent from GameDial"

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
            let what = ChannelReport.ask(channel, user: state.user, catalog: state.catalog)
            HStack(spacing: 4) {
                Image(systemName: ChannelReport.icon(what))
                Text(ChannelReport.prompt(what))
            }
            .font(.caption2)
            // Full-strength text, not the dim grey. It sat below the answer and read as chrome;
            // a viewer who has spotted a mistake has to be able to see the way to say so.
            .foregroundStyle(Theme.text)
        }
        .buttonStyle(.plain)
    }
}
