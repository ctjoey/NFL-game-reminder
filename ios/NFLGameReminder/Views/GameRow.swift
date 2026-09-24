import SwiftUI

/// One game as a single dense row: the list layout for a week.
///
/// The card answers "tell me everything about this game". This answers "show me the whole Sunday
/// at once" - about eight games on screen where the cards fit three. It is the same information a
/// printed TV listing carries, in the same order the eye wants it: when, who, where to find it.
///
/// The channel sits on the right where the column lines up down the page, because that column is
/// the reason to use this app rather than any schedule on the web. Every other listing stops at
/// "FOX". This one says which FOX.
struct GameRowView: View {
    @EnvironmentObject var state: AppState
    let card: GameCard
    let onToggleFollow: () -> Void

    private var tz: TimeZone { state.user.timeZone }
    private var showScores: Bool { state.user.showScores }
    private var records: (away: String?, home: String?) { Records.matchup(card.game, in: state.schedule.games) }
    private var liveIsFresh: Bool {
        guard let synced = state.schedule.lastSync else { return false }
        return Date().timeIntervalSince(synced) < ScheduleStore.liveFreshness
    }

    var body: some View {
        HStack(spacing: 10) {
            Theme.matchupEdge(away: card.game.away, home: card.game.home)
                .frame(width: 4, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 2))

            time

            VStack(alignment: .leading, spacing: 2) {
                matchup
                if let second = secondLine { second }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            channel

            Button(action: onToggleFollow) {
                Image(systemName: card.followed ? "bell.fill" : "bell")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(card.followed ? Theme.accent : Theme.textDim)
                    .frame(width: 30, height: 30)
                    .background(card.followed ? Theme.accent.opacity(0.15) : Color.clear, in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(card.followed ? "Stop reminding me" : "Remind me")
        }
        .padding(.leading, 10).padding(.trailing, 8).padding(.vertical, 8)
        .opacity(card.followed ? 1 : 0.78)
    }

    /// Kickoff, not a countdown. A row is read against the other rows around it, so the same shape
    /// has to appear on every line - "IN 2 HR" next to "1:00" makes the column unscannable.
    private var time: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(TimeFormat.time(card.game.kickoff, tz: tz, zone: false))
                .font(.system(size: 14, weight: .heavy, design: .rounded))
                .foregroundStyle(Theme.text)
            Text(TimeFormat.abbr(tz, at: card.game.kickoff))
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(Theme.textDim)
        }
        .frame(width: 52, alignment: .leading)
        .lineLimit(1).minimumScaleFactor(0.8)
    }

    private var matchup: some View {
        HStack(spacing: 4) {
            team(card.game.away, records.away)
            Text("at").font(.system(size: 10)).foregroundStyle(Theme.textDim)
            team(card.game.home, records.home)
            Spacer(minLength: 0)
        }
        .lineLimit(1).minimumScaleFactor(0.7)
    }

    private func team(_ id: String, _ record: String?) -> some View {
        HStack(spacing: 3) {
            Text(Teams.short(id))
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(Theme.text)
            if showScores, let record {
                Text("(\(record))")
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundStyle(Theme.textDim)
            }
        }
    }

    /// One line under the matchup, and only when there is something worth the height: the score,
    /// or the warning that the local station is showing a different game. Never both - a game you
    /// cannot watch has no score worth reading, and the warning is the thing to act on.
    @ViewBuilder private var secondLine: some View {
        if card.inMarket.airs == false {
            Label(card.inMarket.instead.map { "Your station has \($0.title)" } ?? "Not on your local station",
                  systemImage: "exclamationmark.triangle.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Theme.warn)
                .lineLimit(1)
        } else if showScores, let f = card.game.finalScore {
            Text("Final · \(Teams.short(card.game.away)) \(f.away), \(Teams.short(card.game.home)) \(f.home)")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Theme.textDim)
                .lineLimit(1)
        } else if showScores, liveIsFresh, let l = card.game.liveScore {
            Text("\(Teams.short(card.game.away)) \(l.away), \(Teams.short(card.game.home)) \(l.home)"
                 + (l.situation.map { " · \($0)" } ?? ""))
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(Theme.accent)
                .lineLimit(1)
        }
    }

    /// Network over station, right-aligned so the column reads straight down the page. A stream
    /// with no channel number says the service instead, which is the same answer to the same
    /// question: where do I go to watch this.
    @ViewBuilder private var channel: some View {
        VStack(alignment: .trailing, spacing: 1) {
            if let ch = card.channels.first {
                HStack(spacing: 3) {
                    Text(ch.label)
                        .font(.system(size: 12, weight: .heavy, design: .rounded))
                        .foregroundStyle(Theme.network(ch.network))
                    if let n = ch.number {
                        Text(n)
                            .font(.system(size: 12, weight: .heavy, design: .rounded))
                            .foregroundStyle(Theme.text)
                    }
                }
                if let call = ch.stationCall {
                    Text(call).font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.textDim)
                }
            } else if let ex = card.game.exclusive {
                Text(ex)
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.network(ex))
                Text("streaming").font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.textDim)
            } else if let s = card.game.streams.first {
                Text(state.catalog.label(s))
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .foregroundStyle(Theme.network(s))
            } else {
                Text("TBD").font(.system(size: 11, weight: .bold)).foregroundStyle(Theme.textDim)
            }
        }
        .frame(width: 66, alignment: .trailing)
        .lineLimit(1).minimumScaleFactor(0.75)
    }
}
