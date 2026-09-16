import Foundation

/// Where an incoming URL should land.
///
/// App Store In-App Events, share sheets and notifications all need to open the app somewhere
/// specific rather than wherever it happened to be. Parsing lives here, apart from the view, so the
/// grammar can be tested without launching anything - a link that silently lands on the wrong
/// screen is the kind of thing nobody notices until a promotion is already running.
///
///   gametime://week/3          the week 3 schedule
///   gametime://game/<id>       one game's details
///   gametime://alerts          the alerts tab
///   gametime://?game=<id>      the older query form, still honoured
enum DeepLink: Equatable {
    case week(Int)
    case game(String)
    case alerts

    static let scheme = "gametime"

    static func parse(_ url: URL) -> DeepLink? {
        guard url.scheme?.lowercased() == scheme else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func query(_ name: String) -> String? {
            items.first { $0.name.lowercased() == name }?.value.flatMap { $0.isEmpty ? nil : $0 }
        }

        // gametime://week/3 parses as host "week", path ["3"]; gametime:week/3 as path ["week","3"].
        // Both shapes get typed by hand at some point, so both work.
        let segments = ([url.host] + parts).compactMap { $0 }.filter { !$0.isEmpty }
        switch segments.first?.lowercased() {
        case "week":
            if let n = segments.dropFirst().first.flatMap(Int.init), (1...23).contains(n) { return .week(n) }
            if let n = query("week").flatMap(Int.init), (1...23).contains(n) { return .week(n) }
            return nil
        case "game":
            if let id = segments.dropFirst().first, !id.isEmpty { return .game(id) }
            return query("game").map { .game($0) }
        case "alerts":
            return .alerts
        default:
            // Bare query forms: gametime://?game=… and gametime://?week=…
            if let id = query("game") { return .game(id) }
            if let n = query("week").flatMap(Int.init), (1...23).contains(n) { return .week(n) }
            return nil
        }
    }
}
