import Foundation

enum TimeFormat {
    static let eastern = TimeZone(identifier: "America/New_York")!
    private static func f(_ tz: TimeZone, _ fmt: String) -> DateFormatter {
        let d = DateFormatter(); d.locale = Locale(identifier: "en_US_POSIX"); d.timeZone = tz; d.dateFormat = fmt; return d
    }
    /// "1:00 pm EDT"
    static func time(_ date: Date, tz: TimeZone, zone: Bool = true) -> String {
        let s = f(tz, "h:mm a").string(from: date).lowercased()
        return zone ? "\(s) \(abbr(tz, at: date))" : s
    }
    static func et(_ date: Date) -> String { time(date, tz: eastern, zone: false) + " ET" }
    static func day(_ date: Date, tz: TimeZone) -> String { f(tz, "EEE MMM d").string(from: date) }
    static func dayTime(_ date: Date, tz: TimeZone) -> String { "\(day(date, tz: tz)), \(time(date, tz: tz))" }
    static func abbr(_ tz: TimeZone, at date: Date) -> String {
        tz.abbreviation(for: date) ?? tz.identifier
    }
    static func lead(_ minutes: Int) -> String {
        if minutes % 1440 == 0 { return "\(minutes / 1440) day" + (minutes / 1440 == 1 ? "" : "s") }
        if minutes % 60 == 0 { return "\(minutes / 60) hour" + (minutes / 60 == 1 ? "" : "s") }
        return "\(minutes) min"
    }
    static func dayKey(_ date: Date, tz: TimeZone) -> String { f(tz, "yyyy-MM-dd").string(from: date) }
    static func inQuietHours(_ date: Date, tz: TimeZone, quiet: QuietHours?) -> Bool {
        guard let q = quiet, q.start != q.end else { return false }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = tz
        let cur = cal.component(.hour, from: date) * 60 + cal.component(.minute, from: date)
        return q.start < q.end ? (cur >= q.start && cur < q.end) : (cur >= q.start || cur < q.end)
    }
}
