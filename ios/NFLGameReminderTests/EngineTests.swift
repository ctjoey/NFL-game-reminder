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
    func testESPNNormalization() throws {
        let json = """
        {"events":[{"id":"401","date":"2026-09-15T00:15Z","name":"Denver Broncos at Kansas City Chiefs","week":{"number":1},"status":{"type":{"state":"pre"}},"competitions":[{"competitors":[{"homeAway":"home","team":{"abbreviation":"KC"}},{"homeAway":"away","team":{"abbreviation":"DEN"}}],"broadcasts":[{"names":["ESPN","ABC"]}],"geoBroadcasts":[{"market":{"type":"National"},"media":{"shortName":"ESPN+"}}],"venue":{"fullName":"GEHA Field at Arrowhead Stadium","address":{"city":"Kansas City"}}}]}]}
        """
        let sb = try JSONDecoder().decode(ESPNAdapter.Scoreboard.self, from: Data(json.utf8))
        let g = ESPNAdapter.normalize(sb.events[0], season: 2026)!
        XCTAssertEqual(g.id, "2026-W01-DEN-KC"); XCTAssertEqual(Set(g.networks), ["ESPN", "ABC"]); XCTAssertEqual(g.streams, ["ESPN+"]); XCTAssertEqual(g.window, "MNF"); XCTAssertTrue(g.national)
    }
}
