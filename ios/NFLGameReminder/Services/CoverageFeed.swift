import Foundation

/// One week of the published regional-coverage map: market -> network -> window -> game id.
struct CoverageWeek: Codable, Equatable, Sendable {
    var source: String
    var publishedAt: String?
    var markets: [String: [String: [String: String]]]
}

struct CoverageMap: Codable, Equatable, Sendable {
    var version: Int
    var season: Int
    var generatedAt: String?
    var weeks: [String: CoverageWeek]
}

/// The published regional-coverage map: which CBS/FOX game each market actually receives.
///
/// The rule engine can only guess at a regional window. This is where a known answer lives, and
/// it is fetched over the network rather than baked into the binary - coverage maps are published
/// midweek, every week, and an App Store release per week is not a plan. The bundled copy is the
/// floor: it ships with whatever was known at build time and is used until a fetch succeeds.
///
/// Nothing here is ever inferred. An entry exists only if someone read it off a published map, so
/// the engine is entitled to report it as confirmed. A market with no entry stays unresolved,
/// which is the honest answer and the one the app now gives.
@MainActor
final class CoverageFeed: ObservableObject {
    static let shared = CoverageFeed()
    static let version = 1
    static let feedURL = URL(string: "https://ctjoey.github.io/NFL-game-reminder/coverage-2026.json")!
    /// Long enough that a Sunday morning launch costs one request, short enough that a Wednesday
    /// map is picked up before kickoff.
    static let maxAge: TimeInterval = 6 * 3600

    @Published private(set) var weeks: [String: CoverageWeek] = [:]
    @Published private(set) var lastFetch: Date?
    @Published private(set) var lastError: String?

    private let season: Int
    private let url: URL
    private let session: URLSession
    private let cacheURL: URL

    init(season: Int = 2026, url: URL = CoverageFeed.feedURL, session: URLSession = .shared, bundle: Bundle = .main, directory: URL? = nil) {
        self.season = season
        self.url = url
        self.session = session
        let dir = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        cacheURL = dir.appendingPathComponent("coverage-\(season).json")
        weeks = Self.decode(try? Data(contentsOf: cacheURL), season: season)
            ?? Self.decode(bundle.url(forResource: "coverage-\(season)", withExtension: "json").flatMap { try? Data(contentsOf: $0) }, season: season)
            ?? [:]
    }

    nonisolated static func decode(_ data: Data?, season: Int) -> [String: CoverageWeek]? {
        guard let data, let f = try? JSONDecoder().decode(CoverageMap.self, from: data) else { return nil }
        // A feed in a newer format, or for another season, is not ours to interpret.
        guard f.version == version, f.season == season else { return nil }
        return f.weeks
    }

    func source(week: Int) -> String? { weeks[String(week)]?.source }

    var isStale: Bool { lastFetch.map { Date().timeIntervalSince($0) > Self.maxAge } ?? true }

    /// Refresh from the network. A failure is not an error the user needs to see: the previous map
    /// stays in place, and an uncovered window degrades to a guess rather than to a wrong answer.
    func refresh(force: Bool = false) async {
        guard force || isStale else { return }
        do {
            var req = URLRequest(url: url)
            req.cachePolicy = .reloadRevalidatingCacheData
            req.timeoutInterval = 15
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else { throw URLError(.badServerResponse) }
            guard let fresh = Self.decode(data, season: season) else { throw URLError(.cannotParseResponse) }
            weeks = fresh
            lastFetch = Date()
            lastError = nil
            try? data.write(to: cacheURL, options: .atomic)
        } catch {
            lastError = error.localizedDescription
        }
    }
}

extension Dictionary where Key == String, Value == CoverageWeek {
    /// The published pick for one slot, or nil when the map does not cover it.
    func publishedGame(week: Int, market: String, network: String, window: String) -> String? {
        self[String(week)]?.markets[market]?[network]?[window]
    }
}
