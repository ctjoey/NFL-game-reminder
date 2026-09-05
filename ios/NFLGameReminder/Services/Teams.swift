import Foundation

/// A team's identity, home market, stadium time zone, and the two colors used to give each game
/// card its own character. `primary` is the team's real primary color; `accent` is a variant
/// guaranteed to stay legible on a dark background (several teams' primaries are near-black).
struct TeamInfo {
    let name: String
    let short: String
    let market: String
    let tz: String
    let primary: String
    let accent: String
}

enum Teams {
    static let all: [String: TeamInfo] = [
        "ARI": .init(name: "Arizona Cardinals", short: "Cardinals", market: "phoenix", tz: "America/Phoenix", primary: "97233F", accent: "E04B6D"),
        "ATL": .init(name: "Atlanta Falcons", short: "Falcons", market: "atlanta", tz: "America/New_York", primary: "A71930", accent: "E8394F"),
        "BAL": .init(name: "Baltimore Ravens", short: "Ravens", market: "baltimore", tz: "America/New_York", primary: "241773", accent: "7C63E8"),
        "BUF": .init(name: "Buffalo Bills", short: "Bills", market: "buffalo", tz: "America/New_York", primary: "00338D", accent: "4A87F5"),
        "CAR": .init(name: "Carolina Panthers", short: "Panthers", market: "charlotte", tz: "America/New_York", primary: "0085CA", accent: "39AEEF"),
        "CHI": .init(name: "Chicago Bears", short: "Bears", market: "chicago", tz: "America/Chicago", primary: "0B162A", accent: "E8642A"),
        "CIN": .init(name: "Cincinnati Bengals", short: "Bengals", market: "cincinnati", tz: "America/New_York", primary: "FB4F14", accent: "FF7A44"),
        "CLE": .init(name: "Cleveland Browns", short: "Browns", market: "cleveland", tz: "America/New_York", primary: "311D00", accent: "FF6A2B"),
        "DAL": .init(name: "Dallas Cowboys", short: "Cowboys", market: "dallas", tz: "America/Chicago", primary: "003594", accent: "7A9BE0"),
        "DEN": .init(name: "Denver Broncos", short: "Broncos", market: "denver", tz: "America/Denver", primary: "FB4F14", accent: "FF8A3D"),
        "DET": .init(name: "Detroit Lions", short: "Lions", market: "detroit", tz: "America/Detroit", primary: "0076B6", accent: "3FA8E8"),
        "GB":  .init(name: "Green Bay Packers", short: "Packers", market: "greenbay", tz: "America/Chicago", primary: "203731", accent: "FFC220"),
        "HOU": .init(name: "Houston Texans", short: "Texans", market: "houston", tz: "America/Chicago", primary: "03202F", accent: "E8394F"),
        "IND": .init(name: "Indianapolis Colts", short: "Colts", market: "indianapolis", tz: "America/Indiana/Indianapolis", primary: "002C5F", accent: "5B9BE0"),
        "JAX": .init(name: "Jacksonville Jaguars", short: "Jaguars", market: "jacksonville", tz: "America/New_York", primary: "101820", accent: "16A5A5"),
        "KC":  .init(name: "Kansas City Chiefs", short: "Chiefs", market: "kansascity", tz: "America/Chicago", primary: "E31837", accent: "FF4D63"),
        "LV":  .init(name: "Las Vegas Raiders", short: "Raiders", market: "lasvegas", tz: "America/Los_Angeles", primary: "101820", accent: "C4CBD2"),
        "LAC": .init(name: "Los Angeles Chargers", short: "Chargers", market: "losangeles", tz: "America/Los_Angeles", primary: "0080C6", accent: "3FB3F0"),
        "LAR": .init(name: "Los Angeles Rams", short: "Rams", market: "losangeles", tz: "America/Los_Angeles", primary: "003594", accent: "FFB338"),
        "MIA": .init(name: "Miami Dolphins", short: "Dolphins", market: "miami", tz: "America/New_York", primary: "008E97", accent: "1FC4CE"),
        "MIN": .init(name: "Minnesota Vikings", short: "Vikings", market: "minneapolis", tz: "America/Chicago", primary: "4F2683", accent: "9B6BD6"),
        "NE":  .init(name: "New England Patriots", short: "Patriots", market: "boston", tz: "America/New_York", primary: "002244", accent: "6E93C4"),
        "NO":  .init(name: "New Orleans Saints", short: "Saints", market: "neworleans", tz: "America/Chicago", primary: "101820", accent: "D3BC8D"),
        "NYG": .init(name: "New York Giants", short: "Giants", market: "newyork", tz: "America/New_York", primary: "0B2265", accent: "6688E0"),
        "NYJ": .init(name: "New York Jets", short: "Jets", market: "newyork", tz: "America/New_York", primary: "125740", accent: "2FA872"),
        "PHI": .init(name: "Philadelphia Eagles", short: "Eagles", market: "philadelphia", tz: "America/New_York", primary: "004C54", accent: "2A9AA5"),
        "PIT": .init(name: "Pittsburgh Steelers", short: "Steelers", market: "pittsburgh", tz: "America/New_York", primary: "101820", accent: "FFB612"),
        "SF":  .init(name: "San Francisco 49ers", short: "49ers", market: "sanfrancisco", tz: "America/Los_Angeles", primary: "AA0000", accent: "E8404A"),
        "SEA": .init(name: "Seattle Seahawks", short: "Seahawks", market: "seattle", tz: "America/Los_Angeles", primary: "002244", accent: "69BE28"),
        "TB":  .init(name: "Tampa Bay Buccaneers", short: "Buccaneers", market: "tampa", tz: "America/New_York", primary: "D50A0A", accent: "FF3B3B"),
        "TEN": .init(name: "Tennessee Titans", short: "Titans", market: "nashville", tz: "America/Chicago", primary: "0C2340", accent: "4B92DB"),
        "WAS": .init(name: "Washington Commanders", short: "Commanders", market: "washington", tz: "America/New_York", primary: "5A1414", accent: "FFB612"),
    ]
    static let ids: [String] = all.keys.sorted()
    private static let aliases = ["WSH": "WAS", "JAC": "JAX", "LA": "LAR", "OAK": "LV", "SD": "LAC", "STL": "LAR"]
    static func normalize(_ abbr: String?) -> String? {
        guard let a = abbr?.uppercased() else { return nil }
        if all[a] != nil { return a }
        return aliases[a]
    }
    static func short(_ id: String) -> String { all[id]?.short ?? id }
    static func name(_ id: String) -> String { all[id]?.name ?? id }
    static func market(_ id: String) -> String? { all[id]?.market }
    static func accentHex(_ id: String) -> String { all[id]?.accent ?? "FFB74D" }
    static func primaryHex(_ id: String) -> String { all[id]?.primary ?? "1B2A44" }
}
