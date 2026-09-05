import Foundation

// MARK: - Schedule

struct Game: Codable, Identifiable, Equatable, Hashable {
    var id: String
    var week: Int
    var kickoff: Date
    var away: String
    var home: String
    var networks: [String]
    var streams: [String]
    var exclusive: String?
    var window: String
    var national: Bool
    var venue: String?
    var label: String?
    var notes: String?
    var verified: Bool
    var timeTbd: Bool
    var source: String

    enum CodingKeys: String, CodingKey { case id, week, kickoff, away, home, networks, streams, exclusive, window, national, venue, label, notes, verified, timeTbd, source }

    init(id: String, week: Int, kickoff: Date, away: String, home: String, networks: [String] = [], streams: [String] = [], exclusive: String? = nil, window: String, national: Bool = false, venue: String? = nil, label: String? = nil, notes: String? = nil, verified: Bool = true, timeTbd: Bool = false, source: String = "seed") {
        self.id = id; self.week = week; self.kickoff = kickoff; self.away = away; self.home = home; self.networks = networks; self.streams = streams; self.exclusive = exclusive; self.window = window; self.national = national; self.venue = venue; self.label = label; self.notes = notes; self.verified = verified; self.timeTbd = timeTbd; self.source = source
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        week = try c.decode(Int.self, forKey: .week)
        let raw = try c.decode(String.self, forKey: .kickoff)
        guard let d = DateParsing.parse(raw) else { throw DecodingError.dataCorruptedError(forKey: .kickoff, in: c, debugDescription: "bad date \(raw)") }
        kickoff = d
        away = try c.decode(String.self, forKey: .away)
        home = try c.decode(String.self, forKey: .home)
        networks = try c.decodeIfPresent([String].self, forKey: .networks) ?? []
        streams = try c.decodeIfPresent([String].self, forKey: .streams) ?? []
        exclusive = try c.decodeIfPresent(String.self, forKey: .exclusive)
        window = try c.decodeIfPresent(String.self, forKey: .window) ?? BroadcastWindows.infer(kickoff: kickoff)
        national = try c.decodeIfPresent(Bool.self, forKey: .national) ?? false
        venue = try c.decodeIfPresent(String.self, forKey: .venue)
        label = try c.decodeIfPresent(String.self, forKey: .label)
        notes = try c.decodeIfPresent(String.self, forKey: .notes)
        verified = try c.decodeIfPresent(Bool.self, forKey: .verified) ?? true
        timeTbd = try c.decodeIfPresent(Bool.self, forKey: .timeTbd) ?? false
        source = try c.decodeIfPresent(String.self, forKey: .source) ?? "seed"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(week, forKey: .week)
        try c.encode(DateParsing.iso.string(from: kickoff), forKey: .kickoff)
        try c.encode(away, forKey: .away); try c.encode(home, forKey: .home)
        try c.encode(networks, forKey: .networks); try c.encode(streams, forKey: .streams)
        try c.encodeIfPresent(exclusive, forKey: .exclusive); try c.encode(window, forKey: .window)
        try c.encode(national, forKey: .national); try c.encodeIfPresent(venue, forKey: .venue)
        try c.encodeIfPresent(label, forKey: .label); try c.encodeIfPresent(notes, forKey: .notes)
        try c.encode(verified, forKey: .verified); try c.encode(timeTbd, forKey: .timeTbd); try c.encode(source, forKey: .source)
    }

    /// Order-independent identity across feeds (a feed may flip home/away for neutral sites).
    var matchKey: String { "\(week):\([away, home].sorted().joined(separator: "-"))" }
    var title: String { "\(Teams.short(away)) at \(Teams.short(home))" }
    var isRegional: Bool { ["SUN_EARLY", "SUN_LATE"].contains(window) && networks.contains { ["CBS", "FOX"].contains($0) } }
}

struct SeedFile: Codable { var season: Int; var games: [Game] }

enum DateParsing {
    static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f }()
    static let isoFrac: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()
    static let noSeconds: DateFormatter = { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "UTC"); f.dateFormat = "yyyy-MM-dd'T'HH:mmX"; return f }()
    static func parse(_ s: String) -> Date? { iso.date(from: s) ?? isoFrac.date(from: s) ?? noSeconds.date(from: s) }
}

// MARK: - Schedule changes

struct ScheduleChange: Codable, Identifiable, Equatable {
    enum Kind: String, Codable { case time, date, network, teams, added, removed }
    var id: String { "\(gameId)|\(kind.rawValue)|\(field ?? "")|\(at.timeIntervalSince1970)" }
    var at: Date
    var kind: Kind
    var field: String?
    var gameId: String
    var oldValue: String?
    var newValue: String?

    /// A change stops being news once it is old. Beyond this the game card goes back to normal
    /// and the history stays on the detail screen for anyone who wants it.
    static let noticeWindow: TimeInterval = 14 * 24 * 3600

    func isRecent(now: Date = Date()) -> Bool { now.timeIntervalSince(at) < Self.noticeWindow }

    /// What changed, in words, rather than "kickoff 2026-09-13T20:20Z → 2026-09-14T00:20Z".
    func headline(tz: TimeZone) -> String {
        switch kind {
        case .time, .date:
            guard let iso = newValue, let d = DateParsing.parse(iso) else { return "Kickoff time changed." }
            return "Moved to \(TimeFormat.dayTime(d, tz: tz))."
        case .network:
            let to = (newValue?.isEmpty == false) ? newValue!.replacingOccurrences(of: "/", with: " and ") : nil
            guard let to else { return field == "streams" ? "No longer listed as streaming." : "No longer has a listed network." }
            return field == "streams" ? "Now streaming on \(to)." : "Now on \(to)."
        case .teams: return "The matchup changed."
        case .added: return "Added to the schedule."
        case .removed: return "Taken off the schedule."
        }
    }
}

// MARK: - Market / provider catalog

struct Affiliate: Codable, Hashable { var call: String; var ota: Int }
struct Market: Codable, Identifiable, Hashable {
    var id: String = ""
    var name: String
    var state: String
    var tz: String
    var teams: [String]
    var affinity: [String]
    var affiliates: [String: Affiliate]
    enum CodingKeys: String, CodingKey { case name, state, tz, teams, affinity, affiliates }
}
struct MarketsFile: Codable { var markets: [String: Market]; var zipPrefixes: [String: String] }

struct Provider: Codable, Identifiable, Hashable {
    var id: String = ""
    var name: String
    var kind: String          // ota | satellite | cable | stream
    var localsMatchOta: Bool
    var national: [String: Int]
    var carries: [String]
    var guideHint: String?
    var carriageNotes: String?
    enum CodingKeys: String, CodingKey { case name, kind, localsMatchOta, national, carries, guideHint, carriageNotes }
}
struct StreamingService: Codable, Identifiable, Hashable {
    var id: String = ""
    var name: String
    var carries: [String]
    var note: String?
    var cost: String?
    enum CodingKeys: String, CodingKey { case name, carries, note, cost }
}
struct ProvidersFile: Codable { var providers: [String: Provider]; var services: [String: StreamingService]; var networkLabels: [String: String] }

struct OverridesFile: Codable { var overrides: [String: [String: [String: [String: String]]]] }

// MARK: - User

struct FollowSettings: Codable, Equatable {
    enum Mode: String, Codable, CaseIterable { case teams, all, games }
    var mode: Mode = .teams
    var teams: [String] = []
    var games: [String] = []
    var excludeGames: [String] = []
}
struct AlertSettings: Codable, Equatable {
    var coverage = true
    var kickoffLeads: [Int] = [30]
    var kickoffNow = false
    var changes = true
    var access = true
    var weekly = true
    var weeklyDay = 4      // 1 = Sunday ... 7 = Saturday (Calendar weekday)
    var weeklyHour = 9
}
struct QuietHours: Codable, Equatable { var start: Int = 23 * 60; var end: Int = 8 * 60 }  // minutes since midnight

struct UserProfile: Codable, Equatable {
    var tz: String = TimeZone.current.identifier
    var zip: String = ""
    /// The one place a market is set. Change it when you travel and every channel, coverage
    /// and access lookup follows.
    var market: String? = nil
    var provider: String? = nil
    var hasAntenna = false
    var services: [String] = []
    var channelOverrides: [String: String] = [:]
    var follow = FollowSettings()
    var alerts = AlertSettings()
    var quiet: QuietHours? = QuietHours()
    var maxPerDay = 12
    var onboarded = false
    var timeZone: TimeZone { TimeZone(identifier: tz) ?? .current }
}

// MARK: - Resolved card (what the UI and notifications render)

enum Confidence: String, Codable { case confirmed, likely, unknown, na = "n/a", stable, typical }

struct ChannelInfo: Equatable {
    var network: String
    var label: String
    var stationCall: String?
    var stationOta: Int?
    var number: String?
    var source: String?
    var confidence: Confidence
    var hint: String?
    var display: String {
        var s = stationCall.map { "\($0) (\(label))" } ?? label
        if let n = number { s += " ch. \(n)" }
        return s
    }
}
struct WayToWatch: Equatable { var kind: String; var network: String; var label: String; var channel: ChannelInfo? }
struct MissingOption: Equatable { var network: String; var label: String; var cost: String?; var hint: String? }
struct AccessResult: Equatable { var ok: Bool; var ways: [WayToWatch]; var missing: [MissingOption]; var notes: [String]; var exclusive: String? }
struct MarketResult: Equatable { var airs: Bool?; var confidence: Confidence; var reason: String; var instead: Game? }
struct CoverageInfo: Equatable { var start: Date; var show: String; var confidence: Confidence; var minutesBefore: Int }

struct GameCard: Identifiable, Equatable {
    var id: String { game.id }
    var game: Game
    var coverage: CoverageInfo
    var channels: [ChannelInfo]
    var inMarket: MarketResult
    var access: AccessResult
    var followed: Bool
    var followReasons: [String]
    var watchLine: String
    var plannedAlerts: [PlannedAlert]
    var changes: [ScheduleChange]
}

struct PlannedAlert: Identifiable, Equatable, Codable {
    enum Kind: String, Codable { case coverage, kickoffLead, kickoffNow, access, weekly, change }
    var id: String { key }
    var key: String
    var kind: Kind
    var gameId: String?
    var week: Int?
    var minutes: Int?
    var fireAt: Date
    var critical: Bool
    var title: String
    var body: String
}
