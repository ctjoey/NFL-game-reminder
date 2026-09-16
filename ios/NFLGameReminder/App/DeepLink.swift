import Foundation

/// Where an incoming URL should land.
///
/// App Store In-App Events, share sheets and notifications all need to open the app somewhere
/// specific rather than wherever it happened to be. Parsing lives here, apart from the view, so the
/// grammar can be tested without launching anything - a link that silently lands on the wrong
/// screen is the kind of thing nobody notices until a promotion is already running.
///
///   gamedial://week/3          the week 3 schedule
///   gamedial://game/<id>       one game's details
///   gamedial://alerts          the alerts tab
///   gamedial://?game=<id>      the older query form, still honoured
///
/// `gametime` is accepted everywhere `gamedial` is. It was the scheme before the rename, and a
/// link already written down somewhere does not know that.
enum DeepLink: Equatable {
    case week(Int)
    case game(String)
    case alerts

    /// What new links should use.
    static let scheme = "gamedial"
    /// Everything honoured. Order matters only for documentation; parsing treats them alike.
    static let schemes = ["gamedial", "gametime"]

    static func parse(_ url: URL) -> DeepLink? {
        guard let s = url.scheme?.lowercased(), schemes.contains(s) else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func query(_ name: String) -> String? {
            items.first { $0.name.lowercased() == name }?.value.flatMap { $0.isEmpty ? nil : $0 }
        }

        // gamedial://week/3 parses as host "week", path ["3"]; gamedial:week/3 as path ["week","3"].
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
            // Bare query forms: gamedial://?game=… and gamedial://?week=…
            if let id = query("game") { return .game(id) }
            if let n = query("week").flatMap(Int.init), (1...23).contains(n) { return .week(n) }
            return nil
        }
    }
}
