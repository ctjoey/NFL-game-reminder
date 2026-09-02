import Foundation

struct TeamInfo { let name: String; let short: String; let market: String; let tz: String }

enum Teams {
    static let all: [String: TeamInfo] = [
        "ARI": .init(name: "Arizona Cardinals", short: "Cardinals", market: "phoenix", tz: "America/Phoenix"),
        "ATL": .init(name: "Atlanta Falcons", short: "Falcons", market: "atlanta", tz: "America/New_York"),
        "BAL": .init(name: "Baltimore Ravens", short: "Ravens", market: "baltimore", tz: "America/New_York"),
        "BUF": .init(name: "Buffalo Bills", short: "Bills", market: "buffalo", tz: "America/New_York"),
        "CAR": .init(name: "Carolina Panthers", short: "Panthers", market: "charlotte", tz: "America/New_York"),
        "CHI": .init(name: "Chicago Bears", short: "Bears", market: "chicago", tz: "America/Chicago"),
        "CIN": .init(name: "Cincinnati Bengals", short: "Bengals", market: "cincinnati", tz: "America/New_York"),
        "CLE": .init(name: "Cleveland Browns", short: "Browns", market: "cleveland", tz: "America/New_York"),
        "DAL": .init(name: "Dallas Cowboys", short: "Cowboys", market: "dallas", tz: "America/Chicago"),
        "DEN": .init(name: "Denver Broncos", short: "Broncos", market: "denver", tz: "America/Denver"),
        "DET": .init(name: "Detroit Lions", short: "Lions", market: "detroit", tz: "America/Detroit"),
        "GB":  .init(name: "Green Bay Packers", short: "Packers", market: "greenbay", tz: "America/Chicago"),
        "HOU": .init(name: "Houston Texans", short: "Texans", market: "houston", tz: "America/Chicago"),
        "IND": .init(name: "Indianapolis Colts", short: "Colts", market: "indianapolis", tz: "America/Indiana/Indianapolis"),
        "JAX": .init(name: "Jacksonville Jaguars", short: "Jaguars", market: "jacksonville", tz: "America/New_York"),
        "KC":  .init(name: "Kansas City Chiefs", short: "Chiefs", market: "kansascity", tz: "America/Chicago"),
        "LV":  .init(name: "Las Vegas Raiders", short: "Raiders", market: "lasvegas", tz: "America/Los_Angeles"),
        "LAC": .init(name: "Los Angeles Chargers", short: "Chargers", market: "losangeles", tz: "America/Los_Angeles"),
        "LAR": .init(name: "Los Angeles Rams", short: "Rams", market: "losangeles", tz: "America/Los_Angeles"),
        "MIA": .init(name: "Miami Dolphins", short: "Dolphins", market: "miami", tz: "America/New_York"),
        "MIN": .init(name: "Minnesota Vikings", short: "Vikings", market: "minneapolis", tz: "America/Chicago"),
        "NE":  .init(name: "New England Patriots", short: "Patriots", market: "boston", tz: "America/New_York"),
        "NO":  .init(name: "New Orleans Saints", short: "Saints", market: "neworleans", tz: "America/Chicago"),
        "NYG": .init(name: "New York Giants", short: "Giants", market: "newyork", tz: "America/New_York"),
        "NYJ": .init(name: "New York Jets", short: "Jets", market: "newyork", tz: "America/New_York"),
        "PHI": .init(name: "Philadelphia Eagles", short: "Eagles", market: "philadelphia", tz: "America/New_York"),
        "PIT": .init(name: "Pittsburgh Steelers", short: "Steelers", market: "pittsburgh", tz: "America/New_York"),
        "SF":  .init(name: "San Francisco 49ers", short: "49ers", market: "sanfrancisco", tz: "America/Los_Angeles"),
        "SEA": .init(name: "Seattle Seahawks", short: "Seahawks", market: "seattle", tz: "America/Los_Angeles"),
        "TB":  .init(name: "Tampa Bay Buccaneers", short: "Buccaneers", market: "tampa", tz: "America/New_York"),
        "TEN": .init(name: "Tennessee Titans", short: "Titans", market: "nashville", tz: "America/Chicago"),
        "WAS": .init(name: "Washington Commanders", short: "Commanders", market: "washington", tz: "America/New_York"),
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
}
