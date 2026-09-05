import XCTest
@testable import NFLGameReminder

final class EngineTests: XCTestCase {
    var games: [Game] = []
    var catalog: Catalog!
    override func setUp() {
        games = ScheduleStore.loadSeed(season: 2026, bundle: Bundle.main)
        catalog = Catalog(bundle: Bundle.main)
        XCTAssertFalse(games.isEmpty, "seed should load from the app bundle")
    }
    func game(_ id: String) -> Game { games.first { $0.id == id }! }
    var pitUser: UserProfile { var u = UserProfile(); u.tz = "America/New_York"; u.market = "pittsburgh"; u.provider = "directv"; u.services = ["Prime"]; u.follow.teams = ["PIT"]; return u }

    func testLocalTeamGameIsConfirmedInItsMarket() {
        let r = CoverageEngine.gameInMarket(game("2026-W01-ATL-PIT"), marketKey: "pittsburgh", all: games, catalog: catalog)
        XCTAssertEqual(r.airs, true); XCTAssertEqual(r.confidence, .confirmed)
    }
    func testOtherRegionalGameDoesNotAirWhereLocalTeamPlays() {
        let r = CoverageEngine.gameInMarket(game("2026-W01-CHI-CAR"), marketKey: "pittsburgh", all: games, catalog: catalog)
        XCTAssertEqual(r.airs, false); XCTAssertEqual(r.instead?.id, "2026-W01-ATL-PIT")
    }
    func testNationalGamesAirEverywhere() {
        XCTAssertEqual(CoverageEngine.gameInMarket(game("2026-W01-DAL-NYG"), marketKey: "denver", all: games, catalog: catalog).airs, true)
    }
    func testOverrideWins() {
        let r = CoverageEngine.windowGame(games: games, week: 1, marketKey: "milwaukee", network: "CBS", window: "SUN_LATE", catalog: catalog)
        XCTAssertEqual(r.game?.id, "2026-W01-GB-MIN"); XCTAssertEqual(r.confidence, .confirmed)
    }
    func testZipAndChannelResolution() {
        XCTAssertEqual(catalog.market(forZip: "15201")?.id, "pittsburgh")
        let ch = catalog.channel(for: "CBS", user: pitUser)
        XCTAssertEqual(ch.stationCall, "KDKA"); XCTAssertEqual(ch.number, "2"); XCTAssertEqual(ch.confidence, .likely)
        var u = pitUser; u.provider = "xfinity"; u.channelOverrides = ["CBS": "1002"]
        XCTAssertEqual(catalog.channel(for: "CBS", user: u).number, "1002")
        var yt = pitUser; yt.provider = "youtubetv"
        XCTAssertNil(catalog.channel(for: "FOX", user: yt).number); XCTAssertTrue(catalog.channel(for: "FOX", user: yt).hint?.contains("WPGH") == true)
    }
    func testAccessCheckNetflixExclusive() {
        XCTAssertFalse(catalog.access(for: game("2026-W01-SF-LAR"), user: pitUser).ok)
        var u = pitUser; u.services = ["Netflix"]
        XCTAssertTrue(catalog.access(for: game("2026-W01-SF-LAR"), user: u).ok)
    }
    func testSundayTicketLocalBlackoutNote() {
        var u = pitUser; u.provider = "youtubetv"; u.services = ["SundayTicket"]
        XCTAssertTrue(catalog.access(for: game("2026-W01-ATL-PIT"), user: u).notes.contains { $0.contains("Sunday Ticket does not carry your local game") })
    }
    func testCoverageRules() {
        let snf = BroadcastWindows.coverage(for: game("2026-W01-DAL-NYG"))
        XCTAssertEqual(snf.minutesBefore, 80); XCTAssertTrue(snf.show.contains("Football Night"))
        XCTAssertEqual(BroadcastWindows.infer(kickoff: DateParsing.parse("2026-09-13T20:25:00Z")!), "SUN_LATE")
    }
    func testPlannerAndCardClocks() {
        var u = pitUser; u.tz = "America/Los_Angeles"; u.alerts.kickoffNow = true; u.alerts.weekly = false
        let plan = AlertPlanner.plan(user: u, games: games, now: DateParsing.parse("2026-09-01T00:00:00Z")!, catalog: catalog)
        let pit = plan.filter { $0.gameId == "2026-W01-ATL-PIT" }.map(\.kind)
        XCTAssertEqual(Set(pit), [.coverage, .kickoffLead, .kickoffNow])   // access is silent when there is no catch
        XCTAssertFalse(plan.contains { $0.gameId == "2026-W01-CHI-CAR" })
        let card = CardBuilder.build(game("2026-W01-ATL-PIT"), user: u, all: games, catalog: catalog)
        XCTAssertEqual(TimeFormat.time(card.game.kickoff, tz: u.timeZone), "10:00 am PDT")
        XCTAssertEqual(TimeFormat.et(card.game.kickoff), "1:00 pm ET")
        XCTAssertTrue(card.watchLine.contains("WPGH (FOX) ch. 53"))
        XCTAssertTrue(plan.first { $0.kind == .kickoffLead && $0.gameId == "2026-W01-ATL-PIT" }!.body.contains("WPGH (FOX) ch. 53"))
    }
    func testDiffAndChangeAlertCoalesce() {
        let before = games
        var moved = games
        let i = moved.firstIndex { $0.id == "2026-W01-ATL-PIT" }!
        moved[i].kickoff = DateParsing.parse("2026-09-14T00:20:00Z")!; moved[i].networks = ["NBC"]; moved[i].streams = ["Peacock"]; moved[i].window = "SNF"
        let delta = ScheduleStore.diff(old: before, new: moved)
        XCTAssertEqual(Set(delta.map(\.kind)), [.time, .network])
        let alerts = AlertPlanner.changeAlerts(delta, previous: before, current: moved, user: pitUser, catalog: catalog)
        XCTAssertEqual(alerts.count, 1)
        XCTAssertTrue(alerts[0].body.contains("WPXI (NBC) ch. 11"))
        XCTAssertTrue(alerts[0].body.contains("Was: Sun Sep 13, 1:00 pm EDT on FOX/FOX One"))
    }
    func testTravelMarketOverridesHomeForChannelsAndCoverage() {
        var u = pitUser                       // home: Pittsburgh
        u.travelMarket = "westpalm"           // watching from West Palm Beach
        XCTAssertTrue(u.isTraveling)
        XCTAssertEqual(u.activeMarket, "westpalm")
        let ch = catalog.channel(for: "CBS", user: u)
        XCTAssertEqual(ch.stationCall, "WPEC")
        // Pittsburgh's own game is no longer the guaranteed local one.
        let r = CoverageEngine.gameInMarket(game("2026-W01-ATL-PIT"), marketKey: u.activeMarket, all: games, catalog: catalog)
        XCTAssertNotEqual(r.reason, "Steelers game always airs in Pittsburgh")
        u.travelMarket = nil
        XCTAssertFalse(u.isTraveling)
        XCTAssertEqual(catalog.channel(for: "CBS", user: u).stationCall, "KDKA")
    }

    func testSeedToLiveUpgradeIsNotAScheduleChange() async {
        let store = await ScheduleStore(season: 2026, directory: FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString))
        var moved = await store.games
        guard let i = moved.firstIndex(where: { $0.id == "2026-W01-ATL-PIT" }) else { return XCTFail("seed game missing") }
        moved[i].networks = ["NBC"]
        // First application comes from the live feed while the store still holds the seed.
        let delta = await store.apply(moved, source: "espn")
        XCTAssertTrue(delta.isEmpty, "a seed-to-live upgrade must not report schedule changes")
        let loggedChanges = await store.changes
        XCTAssertTrue(loggedChanges.isEmpty)
        // A later live-to-live difference is a real change.
        moved[i].networks = ["FOX"]
        let second = await store.apply(moved, source: "espn")
        XCTAssertTrue(second.contains { $0.kind == .network })
    }

    func testStaleChangeLogFromAnOlderBuildIsDiscarded() async {
        // Builds before the fix wrote a bare array and recorded the first live sync as a move.
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let stale = [ScheduleChange(at: Date(), kind: .network, field: "networks",
                                    gameId: "2026-W01-ATL-PIT", oldValue: "Peacock", newValue: "")]
        try? JSONEncoder().encode(stale).write(to: dir.appendingPathComponent("changes-2026.json"))
        let store = await ScheduleStore(season: 2026, directory: dir)
        let loaded = await store.changes
        XCTAssertTrue(loaded.isEmpty, "history written by a build with the bug must not be shown")
    }

    func testAListingDisappearingIsNotRecordedAsAChange() async {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = await ScheduleStore(season: 2026, directory: dir)
        var games = await store.games
        guard let i = games.firstIndex(where: { $0.id == "2026-W01-ATL-PIT" }) else { return XCTFail("seed game missing") }
        games[i].networks = ["NBC"]
        _ = await store.apply(games, source: "espn")     // seed to live, nothing recorded
        games[i].networks = []
        _ = await store.apply(games, source: "espn")     // the feed stopped listing a network
        let recorded = await store.changes
        XCTAssertTrue(recorded.isEmpty, "a missing listing is a gap in the data, not a schedule change")
    }

    func testChangeHeadlinesReadAsSentences() {
        let et = TimeFormat.eastern
        let moved = ScheduleChange(at: Date(), kind: .date, field: "kickoff", gameId: "g",
                                   oldValue: "2026-09-13T17:00:00Z", newValue: "2026-09-14T00:20:00Z")
        XCTAssertTrue(moved.headline(tz: et).hasPrefix("Moved to Sun Sep 13"), moved.headline(tz: et))
        let net = ScheduleChange(at: Date(), kind: .network, field: "networks", gameId: "g",
                                 oldValue: "FOX", newValue: "NBC")
        XCTAssertEqual(net.headline(tz: et), "Now on NBC.")
        let old = ScheduleChange(at: Date().addingTimeInterval(-20 * 24 * 3600), kind: .network,
                                 field: "networks", gameId: "g", oldValue: "FOX", newValue: "NBC")
        XCTAssertFalse(old.isRecent(), "a three-week-old change should stop showing on the card")
    }

    func testESPNNormalization() throws {
        let json = """
        {"events":[{"id":"401","date":"2026-09-15T00:15Z","name":"Denver Broncos at Kansas City Chiefs","week":{"number":1},"status":{"type":{"state":"pre"}},"competitions":[{"competitors":[{"homeAway":"home","team":{"abbreviation":"KC"}},{"homeAway":"away","team":{"abbreviation":"DEN"}}],"broadcasts":[{"names":["ESPN","ABC"]}],"geoBroadcasts":[{"market":{"type":"National"},"media":{"shortName":"ESPN+"}}],"venue":{"fullName":"GEHA Field at Arrowhead Stadium","address":{"city":"Kansas City"}}}]}]}
        """
        let sb = try JSONDecoder().decode(ESPNAdapter.Scoreboard.self, from: Data(json.utf8))
        let g = ESPNAdapter.normalize(sb.events[0], season: 2026)!
        XCTAssertEqual(g.id, "2026-W01-DEN-KC"); XCTAssertEqual(Set(g.networks), ["ESPN", "ABC"]); XCTAssertEqual(g.streams, ["ESPN+"]); XCTAssertEqual(g.window, "MNF"); XCTAssertTrue(g.national)
    }
}
