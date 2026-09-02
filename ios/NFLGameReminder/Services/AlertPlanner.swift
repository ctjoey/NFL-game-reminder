import Foundation

/// Derives every alert from the schedule (never from live scores), with the same content the
/// web version sends: coverage start, kickoff, carrier and the channel in the user's market.
enum AlertPlanner {
    static func followed(_ games: [Game], user: UserProfile) -> [Game] { games.filter { CardBuilder.isFollowed($0, user: user).0 } }

    private static func chan(_ c: GameCard, catalog: Catalog) -> String {
        if let ch = c.channels.first { return ch.display }
        if let ex = c.game.exclusive { return "\(ex) only" }
        let s = c.game.streams.map { catalog.label($0) }.joined(separator: "/")
        return s.isEmpty ? "carrier TBD" : s
    }
    private static func marketWarning(_ c: GameCard) -> String {
        if c.inMarket.airs == false, let g = c.inMarket.instead, let n = c.channels.first?.label { return " Note: your local \(n) shows \(g.title) instead." }
        return ""
    }

    static func weeklyFireDate(user: UserProfile, weekGames: [Game]) -> Date? {
        guard let first = weekGames.map(\.kickoff).min() else { return nil }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = user.timeZone
        for back in 0..<8 {
            let d = cal.date(byAdding: .day, value: -back, to: first)!
            if cal.component(.weekday, from: d) == user.alerts.weeklyDay {
                var comps = cal.dateComponents([.year, .month, .day], from: d)
                comps.hour = user.alerts.weeklyHour; comps.minute = 0
                return cal.date(from: comps)
            }
        }
        return nil
    }

    static func plan(user: UserProfile, games: [Game], now: Date = Date(), lateWindowMinutes: Int = 45, catalog: Catalog = .shared) -> [PlannedAlert] {
        let a = user.alerts
        let tz = user.timeZone
        var out: [PlannedAlert] = []
        let mine = followed(games, user: user)
        for g in mine {
            let card = CardBuilder.build(g, user: user, all: games, catalog: catalog)
            let ver = Int(g.kickoff.timeIntervalSince1970)
            let ko = "\(TimeFormat.time(g.kickoff, tz: tz)) (\(TimeFormat.et(g.kickoff)))"
            let ch = chan(card, catalog: catalog)
            let cov = TimeFormat.time(card.coverage.start, tz: tz)
            if a.coverage {
                out.append(.init(key: "\(g.id)|coverage|\(ver)", kind: .coverage, gameId: g.id, week: g.week, minutes: nil, fireAt: card.coverage.start, critical: true,
                                 title: "Coverage starting: \(g.title)", body: "\(card.coverage.show) on \(ch) from \(cov). Kickoff \(ko).\(marketWarning(card))"))
            }
            for m in a.kickoffLeads {
                out.append(.init(key: "\(g.id)|kickoff_\(m)|\(ver)", kind: .kickoffLead, gameId: g.id, week: g.week, minutes: m, fireAt: g.kickoff.addingTimeInterval(TimeInterval(-m * 60)), critical: true,
                                 title: "Kickoff in \(TimeFormat.lead(m)): \(g.title)", body: "\(ko) on \(ch). Coverage already on since \(cov).\(marketWarning(card))"))
            }
            if a.kickoffNow {
                out.append(.init(key: "\(g.id)|kickoff_0|\(ver)", kind: .kickoffNow, gameId: g.id, week: g.week, minutes: 0, fireAt: g.kickoff, critical: true,
                                 title: "Kickoff now: \(g.title)", body: "\(ch) · \(ko).\(marketWarning(card))"))
            }
            if a.access, let body = accessBody(card, tz: tz, catalog: catalog) {
                out.append(.init(key: "\(g.id)|access|\(ver)", kind: .access, gameId: g.id, week: g.week, minutes: nil, fireAt: g.kickoff.addingTimeInterval(-24 * 3600), critical: false,
                                 title: card.access.ok ? "Where to watch \(g.title)" : "Heads up: you may not be able to watch \(g.title)", body: body))
            }
        }
        if a.weekly {
            for w in Set(mine.map(\.week)).sorted() {
                let wg = mine.filter { $0.week == w }
                guard let at = weeklyFireDate(user: user, weekGames: wg) else { continue }
                let lines = wg.sorted { $0.kickoff < $1.kickoff }.map { g -> String in
                    let c = CardBuilder.build(g, user: user, all: games, catalog: catalog)
                    let day = TimeFormat.day(g.kickoff, tz: tz).split(separator: " ").first.map(String.init) ?? ""
                    return "\(day) \(TimeFormat.time(g.kickoff, tz: tz, zone: false)) \(g.title) · \(chan(c, catalog: catalog))\(c.access.ok ? "" : " ⚠︎ not in your services")"
                }
                let ver = wg.map { String(Int($0.kickoff.timeIntervalSince1970)) }.joined(separator: ",")
                out.append(.init(key: "week\(w)|weekly|\(ver)", kind: .weekly, gameId: nil, week: w, minutes: nil, fireAt: at, critical: false,
                                 title: "Week \(w): \(wg.count) game\(wg.count == 1 ? "" : "s") you follow", body: lines.joined(separator: "\n")))
            }
        }
        let cutoff = now.addingTimeInterval(TimeInterval(-lateWindowMinutes * 60))
        return out.filter { $0.fireAt > cutoff }.sorted { $0.fireAt < $1.fireAt }
    }

    /// Only speaks when there is a catch: not in the user's services, a blackout note, or a market mismatch.
    static func accessBody(_ card: GameCard, tz: TimeZone, catalog: Catalog) -> String? {
        let when = "\(TimeFormat.day(card.game.kickoff, tz: tz)) \(TimeFormat.time(card.game.kickoff, tz: tz))"
        let notes = card.access.notes.joined(separator: " ")
        if !card.access.ok {
            let missing = card.access.missing.map { $0.label + ($0.cost.map { " (\($0))" } ?? "") }.joined(separator: ", ")
            return "\(when). It is on \(chan(card, catalog: catalog))\(card.game.exclusive.map { " (\($0) exclusive)" } ?? ""). Not in your services. Options: \(missing.isEmpty ? "see game details" : missing). \(notes)".trimmingCharacters(in: .whitespaces)
        }
        if card.access.notes.isEmpty && card.inMarket.airs != false { return nil }
        var s = "\(when) on \(chan(card, catalog: catalog)). You can watch via \(card.access.ways.map(\.label).joined(separator: ", ")). \(notes)"
        if card.inMarket.airs == false { s += " Also: \(card.inMarket.reason)." }
        return s.trimmingCharacters(in: .whitespaces)
    }

    /// One change alert per game per sync, however many fields moved.
    static func changeAlerts(_ delta: [ScheduleChange], previous: [Game], current: [Game], user: UserProfile, catalog: Catalog = .shared) -> [PlannedAlert] {
        guard user.alerts.changes else { return [] }
        let tz = user.timeZone
        var out: [PlannedAlert] = []
        let grouped = Dictionary(grouping: delta.filter { [.time, .date, .network].contains($0.kind) }, by: \.gameId)
        for (gameId, list) in grouped {
            guard let g = current.first(where: { $0.id == gameId }), CardBuilder.isFollowed(g, user: user).0 else { continue }
            let card = CardBuilder.build(g, user: user, all: current, catalog: catalog)
            let prev = previous.first { $0.matchKey == g.matchKey }
            let kinds = Set(list.map(\.kind))
            var was: [String] = []
            if kinds.contains(.date) || kinds.contains(.time), let p = prev { was.append(TimeFormat.dayTime(p.kickoff, tz: tz)) }
            if kinds.contains(.network), let p = prev { was.append((p.networks + p.streams).joined(separator: "/")) }
            let what = kinds.contains(.date) ? "moved to a new day" : kinds.contains(.time) ? "new kickoff time" : "new network"
            let body = "Now \(TimeFormat.day(g.kickoff, tz: tz)) \(TimeFormat.time(g.kickoff, tz: tz)) (\(TimeFormat.et(g.kickoff))) on \(card.watchLine), coverage from \(TimeFormat.time(card.coverage.start, tz: tz)). Was: \(was.joined(separator: " on ")). Your reminders were updated automatically."
            out.append(.init(key: "\(g.id)|change|\(Int(g.kickoff.timeIntervalSince1970))|\((g.networks + g.streams).joined(separator: "/"))", kind: .change, gameId: g.id, week: g.week, minutes: nil, fireAt: Date(), critical: true,
                             title: "Schedule change: \(g.title) (\(what))", body: body))
        }
        return out
    }
}
