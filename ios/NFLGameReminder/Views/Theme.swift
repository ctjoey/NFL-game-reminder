import SwiftUI

extension Color {
    /// "RRGGBB" or "#RRGGBB".
    init(hex: String) {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        self.init(.sRGB,
                  red: Double((v >> 16) & 0xFF) / 255,
                  green: Double((v >> 8) & 0xFF) / 255,
                  blue: Double(v & 0xFF) / 255,
                  opacity: 1)
    }
}

enum Theme {
    // Deep navy rather than pure black: it matches the app icon and lets team colors read warmly.
    static let bgTop = Color(hex: "0D1526")
    static let bgBottom = Color(hex: "070B14")
    static let surface = Color(hex: "161F33")
    static let surfaceRaised = Color(hex: "1E2942")
    static let hairline = Color(hex: "2A3852")
    static let accent = Color(hex: "FFB74D")
    static let text = Color(hex: "F2F5FA")
    static let textDim = Color(hex: "94A6C4")
    static let ok = Color(hex: "4ED88A")
    static let warn = Color(hex: "FFB020")
    static let bad = Color(hex: "FF5C6E")

    static var background: LinearGradient {
        LinearGradient(colors: [bgTop, bgBottom], startPoint: .top, endPoint: .bottom)
    }

    /// Brand-ish colors so a carrier is recognisable at a glance.
    private static let networkColors: [String: String] = [
        "CBS": "0B7FD4", "FOX": "4B6BE8", "NBC": "F37021", "ABC": "C9D2DE",
        "ESPN": "E01B24", "ESPN2": "E01B24", "NFLN": "2E6FD0",
        "Prime": "00A8E1", "Netflix": "E50914", "Peacock": "F0B323",
        "Paramount+": "2E7BFF", "FOX One": "4B6BE8", "ESPN+": "E01B24",
        "Disney+": "3B5BE0", "NFL+": "2E6FD0", "YouTube": "FF3B30", "SundayTicket": "FF3B30",
    ]
    static func network(_ key: String) -> Color { Color(hex: networkColors[key] ?? "8FA3C4") }

    static func team(_ id: String) -> Color { Color(hex: Teams.accentHex(id)) }

    /// A soft two-team wash used behind a game card's header.
    static func matchupGradient(away: String, home: String) -> LinearGradient {
        LinearGradient(colors: [team(away).opacity(0.30), team(home).opacity(0.30)],
                       startPoint: .leading, endPoint: .trailing)
    }
}

/// How soon a game is, expressed the way a fan thinks about it.
struct Countdown {
    let label: String
    let color: Color
    let urgent: Bool

    init(to date: Date, now: Date = Date(), tz: TimeZone) {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        let mins = Int(date.timeIntervalSince(now) / 60)
        if mins < -240 { label = "FINAL"; color = Theme.textDim; urgent = false }
        else if mins < 0 { label = "ON NOW"; color = Theme.bad; urgent = true }
        else if mins < 60 { label = "IN \(max(1, mins)) MIN"; color = Theme.bad; urgent = true }
        else if mins < 60 * 12 { label = "IN \(mins / 60) HR"; color = Theme.warn; urgent = true }
        else if cal.isDateInToday(date) { label = "TODAY"; color = Theme.warn; urgent = true }
        else if cal.isDateInTomorrow(date) { label = "TOMORROW"; color = Theme.warn; urgent = false }
        else {
            let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: date)).day ?? 0
            label = days <= 7 ? "IN \(days) DAYS" : cal.weekdaySymbols[cal.component(.weekday, from: date) - 1].uppercased()
            color = Theme.textDim; urgent = false
        }
    }
}

/// Small uppercase pill used for status, confidence and carrier chips.
struct Pill: View {
    let text: String
    var color: Color = Theme.textDim
    var filled: Bool = false
    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .heavy, design: .rounded))
            .tracking(0.6)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(filled ? color : color.opacity(0.16), in: Capsule())
            .foregroundStyle(filled ? Color(hex: "0B1220") : color)
    }
}
