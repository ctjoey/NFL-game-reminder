import Foundation

/// Pregame ("coverage begins") rules per network and window, in minutes before kickoff.
/// "stable" = published convention; "typical" = usual pattern, confirm on holiday/special games.
enum BroadcastWindows {
    struct Rule { let minutes: Int; let show: String; let confidence: Confidence }
    static let labels: [String: String] = [
        "KICKOFF": "NFL Kickoff opener", "TNF": "Thursday Night Football", "INTL": "International (morning ET)",
        "SUN_EARLY": "Sunday early window", "SUN_LATE": "Sunday late window", "SNF": "Sunday Night Football",
        "MNF": "Monday Night Football", "SAT": "Saturday", "HOLIDAY": "Holiday / special",
    ]
    private static let rules: [String: [String: Rule]] = [
        "CBS": ["SUN_EARLY": .init(minutes: 60, show: "The NFL Today", confidence: .stable),
                "SUN_LATE": .init(minutes: 5, show: "The NFL Today (station already in coverage)", confidence: .stable),
                "*": .init(minutes: 60, show: "CBS pregame", confidence: .typical)],
        "FOX": ["SUN_EARLY": .init(minutes: 120, show: "FOX NFL Kickoff, then FOX NFL Sunday", confidence: .stable),
                "SUN_LATE": .init(minutes: 5, show: "FOX NFL Sunday (station already in coverage)", confidence: .stable),
                "*": .init(minutes: 60, show: "FOX pregame", confidence: .typical)],
        "NBC": ["SNF": .init(minutes: 80, show: "Football Night in America", confidence: .stable),
                "KICKOFF": .init(minutes: 80, show: "Football Night in America", confidence: .typical),
                "HOLIDAY": .init(minutes: 80, show: "Football Night in America", confidence: .typical),
                "*": .init(minutes: 60, show: "NBC pregame", confidence: .typical)],
        "Peacock": ["*": .init(minutes: 80, show: "Football Night in America", confidence: .typical)],
        "ESPN": ["MNF": .init(minutes: 135, show: "Monday Night Countdown", confidence: .typical),
                 "*": .init(minutes: 60, show: "ESPN pregame", confidence: .typical)],
        "ABC": ["MNF": .init(minutes: 15, show: "ABC joins MNF (Countdown is on ESPN)", confidence: .typical),
                "*": .init(minutes: 60, show: "ABC pregame", confidence: .typical)],
        "Prime": ["TNF": .init(minutes: 75, show: "TNF Tonight", confidence: .stable),
                  "*": .init(minutes: 75, show: "TNF Tonight", confidence: .typical)],
        "Netflix": ["*": .init(minutes: 60, show: "Netflix NFL pregame", confidence: .typical)],
        "NFLN": ["*": .init(minutes: 60, show: "NFL GameDay Kickoff", confidence: .typical)],
        "YouTube": ["*": .init(minutes: 60, show: "YouTube pregame", confidence: .typical)],
        "*": ["*": .init(minutes: 60, show: "Network pregame", confidence: .typical)],
    ]
    static func rule(network: String, window: String) -> Rule {
        let byNet = rules[network] ?? rules["*"]!
        return byNet[window] ?? byNet["*"] ?? rules["*"]!["*"]!
    }
    static func coverage(for game: Game) -> CoverageInfo {
        let primary = game.networks.first ?? game.streams.first ?? "*"
        let r = rule(network: primary, window: game.window)
        return CoverageInfo(start: game.kickoff.addingTimeInterval(TimeInterval(-r.minutes * 60)), show: r.show, confidence: r.confidence, minutesBefore: r.minutes)
    }
    static let eastern = TimeZone(identifier: "America/New_York")!
    static func infer(kickoff: Date, streams: [String] = []) -> String {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = eastern
        let wd = cal.component(.weekday, from: kickoff)
        let hm = cal.component(.hour, from: kickoff) * 60 + cal.component(.minute, from: kickoff)
        switch wd {
        case 1: if hm < 12 * 60 { return "INTL" }; if hm < 15 * 60 + 30 { return "SUN_EARLY" }; if hm < 18 * 60 + 30 { return "SUN_LATE" }; return "SNF"
        case 2: return "MNF"
        case 5: return "TNF"
        case 7: return "SAT"
        case 4: return "KICKOFF"
        default: return "HOLIDAY"
        }
    }
}
