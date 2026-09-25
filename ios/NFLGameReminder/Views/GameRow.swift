import SwiftUI

/// One game as a single dense row: the list layout for a week.
///
/// The card answers "tell me everything about this game". This answers "show me the whole Sunday
/// at once" - about eight games on screen where the cards fit three. It is the same information a
/// printed TV listing carries, in the same order the eye wants it: when, who, where to find it.
///
/// The network sits on the right where the column lines up down the page. Which FOX - the number
/// and the call sign - is what this app knows that no other listing does, but it belongs on the
/// card, one tap away. Putting it here would widen every line by two facts nobody is scanning for.
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

            VStack(alignment: .leading, spacing: 3) {
                matchup
                secondLine
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

    /// The score, big enough to read at arm's length, because a quick look at the scores is now
    /// one of the two reasons to open this app on a Sunday. It is set larger than the team names
    /// above it on purpose: when there is a score on a row, the score is what you came for.
    ///
    /// Team abbreviations rather than the nicknames used on line one - "LAC 17 · BUF 24" fits at
    /// this size where "Chargers 17 · Bills 24" would have to shrink to about eleven points, which
    /// is the opposite of the point. Still named rather than a bare "17-24": a pair of numbers
    /// alone makes the reader work out which way round it goes.
    ///
    /// A score outranks the not-on-your-station warning, which is a change of mind. The warning is
    /// what matters before kickoff, when there is no score to show anyway; once a game is being
    /// played, not being able to watch it is exactly when you most want the number.
    @ViewBuilder private var secondLine: some View {
        if showScores, let f = card.game.finalScore {
            scoreLine("FINAL", "\(card.game.away) \(f.away) · \(card.game.home) \(f.home)", Theme.textDim)
        } else if showScores, liveIsFresh, let l = card.game.liveScore {
            scoreLine(l.situation ?? "LIVE", "\(card.game.away) \(l.away) · \(card.game.home) \(l.home)", Theme.accent)
        } else if card.inMarket.airs == false {
            Label(card.inMarket.instead.map { "Your station has \($0.title)" } ?? "Not on your local station",
                  systemImage: "exclamationmark.triangle.fill")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Theme.warn)
                .lineLimit(1)
        }
    }

    private func scoreLine(_ status: String, _ score: String, _ tint: Color) -> some View {
        HStack(spacing: 6) {
            Text(status)
                .font(.system(size: 9, weight: .heavy, design: .rounded)).tracking(0.6)
                .foregroundStyle(tint)
                .padding(.horizontal, 5).padding(.vertical, 1)
                .background(tint.opacity(0.16), in: Capsule())
            Text(score)
                .font(.system(size: 16, weight: .heavy, design: .rounded))
                .foregroundStyle(tint == Theme.accent ? Theme.accent : Theme.text)
        }
        .lineLimit(1).minimumScaleFactor(0.75)
    }

    /// The network only - CBS, FOX, Prime - not the local channel number.
    ///
    /// The number is the better answer to "where do I point the remote", and it is still one tap
    /// away on the card. It is the wrong answer here. A list is read by running down a column, and
    /// a column of "FOX 8 WJW" next to "CBS 4 WFOR" is three facts wide where the eye wants one.
    /// Scanning and looking up are different jobs; this screen is the first one.
    @ViewBuilder private var channel: some View {
        Group {
            if let ch = card.channels.first {
                Text(ch.label).foregroundStyle(Theme.network(ch.network))
            } else if let ex = card.game.exclusive {
                Text(ex).foregroundStyle(Theme.network(ex))
            } else if let s = card.game.streams.first {
                Text(state.catalog.label(s)).foregroundStyle(Theme.network(s))
            } else {
                Text("TBD").foregroundStyle(Theme.textDim)
            }
        }
        .font(.system(size: 13, weight: .heavy, design: .rounded))
        .frame(width: 62, alignment: .trailing)
        .lineLimit(1).minimumScaleFactor(0.7)
    }
}
