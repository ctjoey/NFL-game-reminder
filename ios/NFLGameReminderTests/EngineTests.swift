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
    // Regression: reported from Hartford-New Haven on 13 Sep 2026. FOX was showing Falcons at
    // Steelers at 1pm and Commanders at Eagles at 4:25, and the app said neither was on the local
    // station, naming a different game for each window. Hartford has no home team and its affinity
    // list matched nothing, so the pick fell through to a "national game" rule that took whichever
    // candidate carried ESPN's national flag first.
    private func foxWeek2() -> [Game] {
        let k = Date(timeIntervalSince1970: 1_789_000_000)
        func g(_ away: String, _ home: String, _ window: String) -> Game {
            Game(id: "2026-W02-\(away)-\(home)", week: 2, kickoff: k, away: away, home: home,
                 networks: ["FOX"], window: window, national: true)
        }
        return [g("ATL", "PIT", "SUN_EARLY"), g("TB", "CIN", "SUN_EARLY"),
                g("WAS", "PHI", "SUN_LATE"), g("MIA", "LV", "SUN_LATE")]
    }

    func testWindowWithNoLocalTeamOrAffinityMatchStillNamesAGame() {
        let r = CoverageEngine.windowGame(games: foxWeek2(), week: 2, marketKey: "hartford", network: "FOX", window: "SUN_EARLY", catalog: catalog)
        XCTAssertNotNil(r.game, "the app must always name a game rather than shrug")
        XCTAssertEqual(r.confidence, .predicted)
    }

    func testThePredictionPicksTheBiggestMarketsAndDoesNotWander() {
        // Atlanta is rank 10 and Tampa 13, so ATL at PIT outranks TB at CIN. The old rule took
        // whatever came first in the array, which is exactly what the reversed case asserts against.
        let week2 = foxWeek2().filter { $0.window == "SUN_EARLY" }
        XCTAssertEqual(CoverageEngine.predicted(week2, catalog: catalog)?.id, "2026-W02-ATL-PIT")
        XCTAssertEqual(CoverageEngine.predicted(week2.reversed(), catalog: catalog)?.id, "2026-W02-ATL-PIT")
    }

    func testNoConfidenceLevelEverShowsTheWordUnknown() {
        for c in [Confidence.confirmed, .likely, .predicted, .unknown, .na, .stable, .typical] {
            XCTAssertFalse(c.label.lowercased().contains("unknown"), "\(c.rawValue) renders as \(c.label)")
            XCTAssertFalse(c.label.isEmpty)
        }
    }

    /// The guard that matters: a guess may name a game, but it may never deny one. Saying "not on
    /// your local station" about a game that is on it sends someone away from what they wanted.
    func testUnresolvedWindowNeverSaysAGameIsOffTheLocalStation() {
        let week2 = foxWeek2()
        for game in week2 {
            let r = CoverageEngine.gameInMarket(game, marketKey: "hartford", all: week2, catalog: catalog)
            XCTAssertNotEqual(r.airs, false, "\(game.id) was wrongly reported as not airing")
            XCTAssertFalse(r.reason.contains("is showing"))
        }
    }

    func testAffinityGuessIsOfferedAsUncertaintyNotADenial() {
        let k = Date(timeIntervalSince1970: 1_789_000_000)
        var week2 = foxWeek2()
        week2.append(Game(id: "2026-W02-NYJ-TEN", week: 2, kickoff: k, away: "NYJ", home: "TEN", networks: ["FOX"], window: "SUN_EARLY"))
        let pick = CoverageEngine.windowGame(games: week2, week: 2, marketKey: "hartford", network: "FOX", window: "SUN_EARLY", catalog: catalog)
        XCTAssertEqual(pick.game?.id, "2026-W02-NYJ-TEN")
        XCTAssertEqual(pick.confidence, .likely)
        let other = CoverageEngine.gameInMarket(week2[0], marketKey: "hartford", all: week2, catalog: catalog)
        XCTAssertNil(other.airs)
        XCTAssertEqual(other.instead?.id, "2026-W02-NYJ-TEN")
        XCTAssertTrue(other.reason.contains("usually receives"))
    }

    func testConfirmedPickMayStillSayAGameIsNotOnTheLocalStation() {
        let late = foxWeek2().filter { $0.window == "SUN_LATE" }
        let r = CoverageEngine.gameInMarket(late.first { $0.id == "2026-W02-MIA-LV" }!, marketKey: "philadelphia", all: late, catalog: catalog)
        XCTAssertEqual(r.airs, false)
        XCTAssertEqual(r.confidence, .confirmed)
        XCTAssertEqual(r.instead?.id, "2026-W02-WAS-PHI")
    }

    // The published coverage feed. Everything in it is read off a real map, so it is the one
    // source allowed to turn an unresolved window into a confirmed answer.
    private func map(_ market: String, _ network: String, _ window: String, _ gameId: String) -> [String: CoverageWeek] {
        ["2": CoverageWeek(source: "test", publishedAt: nil, markets: [market: [network: [window: gameId]]])]
    }

    func testPublishedMapResolvesAWindowTheRulesCannot() {
        let week2 = foxWeek2()
        let unresolved = CoverageEngine.windowGame(games: week2, week: 2, marketKey: "hartford", network: "FOX", window: "SUN_EARLY", catalog: catalog)
        XCTAssertEqual(unresolved.confidence, .predicted, "without a map this is only a guess")

        let published = map("hartford", "FOX", "SUN_EARLY", "2026-W02-ATL-PIT")
        let r = CoverageEngine.windowGame(games: week2, week: 2, marketKey: "hartford", network: "FOX", window: "SUN_EARLY", catalog: catalog, published: published)
        XCTAssertEqual(r.game?.id, "2026-W02-ATL-PIT")
        XCTAssertEqual(r.confidence, .confirmed)
    }

    func testPublishedMapMakesTheNegativeSafeToState() {
        let week2 = foxWeek2()
        let published = map("hartford", "FOX", "SUN_EARLY", "2026-W02-ATL-PIT")
        let other = CoverageEngine.gameInMarket(week2[1], marketKey: "hartford", all: week2, catalog: catalog, published: published)
        XCTAssertEqual(other.airs, false)
        XCTAssertEqual(other.confidence, .confirmed)
        XCTAssertEqual(other.instead?.id, "2026-W02-ATL-PIT")
    }

    func testPublishedMapOutranksAnAffinityGuess() {
        let k = Date(timeIntervalSince1970: 1_789_000_000)
        var week2 = foxWeek2()
        week2.append(Game(id: "2026-W02-NYJ-TEN", week: 2, kickoff: k, away: "NYJ", home: "TEN", networks: ["FOX"], window: "SUN_EARLY"))
        let guess = CoverageEngine.windowGame(games: week2, week: 2, marketKey: "hartford", network: "FOX", window: "SUN_EARLY", catalog: catalog)
        XCTAssertEqual(guess.game?.id, "2026-W02-NYJ-TEN")
        let r = CoverageEngine.windowGame(games: week2, week: 2, marketKey: "hartford", network: "FOX", window: "SUN_EARLY", catalog: catalog,
                                          published: map("hartford", "FOX", "SUN_EARLY", "2026-W02-ATL-PIT"))
        XCTAssertEqual(r.game?.id, "2026-W02-ATL-PIT")
        XCTAssertEqual(r.confidence, .confirmed)
    }

    func testFeedFromAnotherSeasonOrFormatIsIgnored() {
        func data(version: Int, season: Int) -> Data {
            Data("""
            {"version": \(version), "season": \(season), "weeks": {"2": {"source": "x", "markets": {}}}}
            """.utf8)
        }
        XCTAssertNotNil(CoverageFeed.decode(data(version: 1, season: 2026), season: 2026))
        XCTAssertNil(CoverageFeed.decode(data(version: 2, season: 2026), season: 2026))
        XCTAssertNil(CoverageFeed.decode(data(version: 1, season: 2027), season: 2026))
        XCTAssertNil(CoverageFeed.decode(Data("not json".utf8), season: 2026))
    }

    /// CoverageFeed is @MainActor because it publishes to SwiftUI, so the test that builds one has
    /// to be too. The engine itself takes the map as a plain value and stays actor-free.
    @MainActor
    func testBundledFeedParsesAndIsUsable() {
        let feed = CoverageFeed(season: 2026, directory: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        XCTAssertFalse(feed.weeks.isEmpty, "a coverage-2026.json should ship in the bundle")
        for (_, week) in feed.weeks { XCTAssertFalse(week.source.isEmpty, "every published week must say where it came from") }
    }

    // Reported from the phone: on YouTube TV the "Wrong channel?" link never appeared anywhere.
    // Streaming providers mark every row n/a because they have no channel numbers, and both places
    // that offered the reporter skipped n/a rows - so every cord-cutter lost the one control that
    // lets them correct us. A missing number is not the same as nothing to report.
    func testStreamingViewersAreStillAskedAboutTheStation() {
        var yt = pitUser; yt.provider = "youtubetv"
        let row = catalog.channel(for: "ABC", user: yt)
        XCTAssertNil(row.number, "a streaming service has no channel number to show")
        XCTAssertEqual(row.confidence, .na)

        let what = ChannelReport.ask(row, user: yt, catalog: catalog)
        XCTAssertEqual(what, .wrongStation)
        XCTAssertEqual(ChannelReport.prompt(what), "Wrong station? Tell us")
        let url = ChannelReport.mailURL(row, user: yt, catalog: catalog)
        XCTAssertNotNil(url, "the reporter must produce a mail link for streaming viewers too")
    }

    func testReportsGoToTheAddressWePublish() {
        XCTAssertEqual(ChannelReport.address, "wrongchannel@yahoo.com")
        var yt = pitUser; yt.provider = "youtubetv"
        let url = ChannelReport.mailURL(catalog.channel(for: "ABC", user: yt), user: yt, catalog: catalog)
        XCTAssertEqual(url?.path, ChannelReport.address, "the mail link must target the published address")
    }

    func testTheAskMatchesWhatWeActuallyShow() {
        // A number on screen can be wrong; a cable provider with no number wants one filled in.
        let ota = catalog.channel(for: "CBS", user: { var u = pitUser; u.provider = "ota"; return u }())
        XCTAssertNotNil(ota.number)
        XCTAssertEqual(ChannelReport.ask(ota, user: { var u = pitUser; u.provider = "ota"; return u }(), catalog: catalog), .wrongNumber)

        var cable = pitUser; cable.provider = "xfinity"
        let row = catalog.channel(for: "CBS", user: cable)
        XCTAssertNil(row.number, "cable lineups are per-headend, so we never ship a number")
        XCTAssertEqual(ChannelReport.ask(row, user: cable, catalog: catalog), .missingNumber)
        XCTAssertEqual(ChannelReport.prompt(.missingNumber), "Know the channel? Tell us")
    }

    // Deep links carry App Store In-App Events, share sheets and notifications. A link that lands
    // on the wrong screen is invisible until a promotion is already running, so the grammar is
    // pinned here rather than trusted.
    func testDeepLinkGrammar() {
        func link(_ s: String) -> DeepLink? { DeepLink.parse(URL(string: s)!) }

        // Run the whole grammar against every scheme the app claims to honour. gametime:// was the
        // scheme before the rename to GameDial; anything already written against it - a share, a
        // note, an event set up early - must keep landing in the same place.
        for scheme in DeepLink.schemes {
            XCTAssertEqual(link("\(scheme)://week/3"), .week(3), scheme)
            XCTAssertEqual(link("\(scheme)://Week/18"), .week(18), "hosts arrive lowercased or not depending on who typed them")
            XCTAssertEqual(link("\(scheme):week/3"), .week(3), "the schemeless-slash form is easy to type by hand")
            XCTAssertEqual(link("\(scheme)://?week=3"), .week(3), scheme)
            XCTAssertEqual(link("\(scheme)://game/2026-W01-ATL-PIT"), .game("2026-W01-ATL-PIT"), scheme)
            XCTAssertEqual(link("\(scheme)://?game=2026-W01-ATL-PIT"), .game("2026-W01-ATL-PIT"),
                           "the original query form still works, so old notifications keep opening")
            XCTAssertEqual(link("\(scheme)://alerts"), .alerts, scheme)
        }
        XCTAssertEqual(DeepLink.scheme, "gamedial", "new links should be written with the current name")
        XCTAssertTrue(DeepLink.schemes.contains("gametime"), "dropping the old scheme breaks links already in the wild")
    }

    func testDeepLinkRejectsWhatItCannotHonour() {
        func link(_ s: String) -> DeepLink? { DeepLink.parse(URL(string: s)!) }

        XCTAssertNil(link("https://example.com/week/3"), "another scheme is not ours to open")
        XCTAssertNil(link("gamedail://week/3"), "a typo of our own scheme is still not our scheme")
        for scheme in DeepLink.schemes {
            XCTAssertNil(link("\(scheme)://week/0"), "there is no week 0")
            XCTAssertNil(link("\(scheme)://week/99"), scheme)
            XCTAssertNil(link("\(scheme)://week/three"), scheme)
            XCTAssertNil(link("\(scheme)://week"), "a week with no number cannot land anywhere useful")
            XCTAssertNil(link("\(scheme)://nonsense"), scheme)
            XCTAssertNil(link("\(scheme)://?game="), "an empty id would open a blank detail screen")
        }
    }

    // Every place the app says its own name, agreeing. The rename to GameDial touched five
    // separate strings; the next one should touch one, and this fails if it does not.
    func testTheAppAgreesWithItselfAboutItsName() {
        XCTAssertEqual(Wordmark.head + Wordmark.tail, AppInfo.name, "the wordmark no longer spells the product name")
        XCTAssertTrue(AppLinks.shareMessage.hasPrefix(AppInfo.name), "a share that does not name the app is a recommendation nobody can act on")
        XCTAssertEqual(DeepLink.scheme, AppInfo.name.lowercased(), "the URL scheme should track the name")
        XCTAssertTrue(AppLinks.appStore.absoluteString.hasSuffix("id6808454832"),
                      "the id-only App Store form survives a rename; a slug does not")
    }

    // A single-header week: one network carries a single round of games, so most of the country
    // has nothing on CBS at 4:25. Before this the engine fell through to a prediction and put a
    // game on screen that was on nobody's television.
    func testPublishedNoGameIsAConfirmedAbsence() {
        let week = CoverageWeek(source: "test", publishedAt: nil,
                                markets: ["hartford": ["CBS": ["SUN_LATE": CoverageWeek.noGame]]])
        let published = ["2": week]

        let pick = CoverageEngine.windowGame(games: games, week: 2, marketKey: "hartford",
                                             network: "CBS", window: "SUN_LATE",
                                             catalog: catalog, published: published)
        XCTAssertNil(pick.game)
        XCTAssertEqual(pick.confidence, .confirmed, "nothing being on is an answer, not a shrug")

        if let late = games.first(where: { $0.week == 2 && $0.window == "SUN_LATE" && $0.networks.contains("CBS") }) {
            let r = CoverageEngine.gameInMarket(late, marketKey: "hartford", all: games,
                                                catalog: catalog, published: published)
            XCTAssertEqual(r.airs, false)
            XCTAssertEqual(r.confidence, .confirmed)
        }
    }

    // Scores close the loop on a card that told you when to turn the television on: you open the
    // app on Friday and it says how Thursday finished. They must survive a round trip through the
    // cache, or the answer disappears the moment the app is reopened offline.
    func testFinalScoreSurvivesEncodingAndIsOptional() throws {
        var played = game("2026-W01-ATL-PIT")
        played.finalScore = FinalScore(away: 0, home: 31)     // a shutout is a real score
        let back = try JSONDecoder().decode(Game.self, from: JSONEncoder().encode(played))
        XCTAssertEqual(back.finalScore, FinalScore(away: 0, home: 31))

        // A game not yet played carries no score, and a feed that omits the key must still decode.
        let upcoming = game("2026-W01-SF-LAR")
        XCTAssertNil(upcoming.finalScore)
        let json = #"{"id":"x","week":1,"kickoff":"2026-09-13T17:00:00Z","away":"ATL","home":"PIT","window":"SUN_EARLY"}"#
        XCTAssertNil(try JSONDecoder().decode(Game.self, from: Data(json.utf8)).finalScore,
                     "older cached games have no score key and must not fail to load")
    }

    func testShowScoresDefaultsOnAndCanBeTurnedOff() {
        XCTAssertTrue(UserProfile().showScores, "whoever followed Thursday's game wants to know how it ended")
        var quiet = UserProfile(); quiet.showScores = false
        XCTAssertFalse(quiet.showScores, "and whoever recorded it must be able to come here without being told")
    }

    // Records come out of the finals we already hold rather than a separate field, so the standings
    // can never disagree with the scores on the same screen.
    func testRecordsAreDerivedAsOfEachGame() {
        func g(_ id: String, _ away: String, _ home: String, _ day: Int, _ f: FinalScore?) -> Game {
            Game(id: id, week: day == 13 ? 1 : 2,
                 kickoff: DateParsing.parse("2026-09-\(day)T17:00:00Z")!,
                 away: away, home: home, networks: ["CBS"], window: "SUN_EARLY", finalScore: f)
        }
        let games = [
            g("w1a", "PIT", "NE", 13, FinalScore(away: 24, home: 17)),
            g("w1b", "GB", "CHI", 13, FinalScore(away: 20, home: 20)),   // a tie
            g("w2a", "PIT", "NE", 20, nil),                              // not played
        ]

        let week2 = Records.matchup(games[2], in: games)
        XCTAssertEqual(week2.away, "1-0", "Pittsburgh brings a win into week 2")
        XCTAssertEqual(week2.home, "0-1")

        let table = Records.before(games[2].kickoff, in: games)
        XCTAssertEqual(table["GB"]?.summary, "0-0-1", "a tie prints the third number")
        XCTAssertEqual(table["PIT"]?.summary, "1-0", "and nothing else does")

        // Carried INTO the game, so an old card does not drift as the season runs on.
        let week1 = Records.matchup(games[0], in: games)
        XCTAssertNil(week1.away, "nobody has played before week 1, so no (0-0) on every card")
        XCTAssertNil(week1.home)
    }

    // A live score is a detail on a card that already tells you the channel. It must date itself,
    // survive the cache, and never be mistaken for a result.
    func testLiveScoreCarriesItsClockAndIsNotAResult() throws {
        let live = LiveScore(away: 24, home: 21, period: 3, clock: "4:12")
        XCTAssertEqual(live.situation, "Q3 4:12")
        XCTAssertEqual(LiveScore(away: 24, home: 21, period: 5, clock: "1:30").situation, "OT 1:30")
        XCTAssertNil(LiveScore(away: 24, home: 21, period: nil, clock: nil).situation,
                     "with no clock there is nothing to date the score with, so say nothing")

        var playing = game("2026-W01-ATL-PIT")
        playing.liveScore = live
        let back = try JSONDecoder().decode(Game.self, from: JSONEncoder().encode(playing))
        XCTAssertEqual(back.liveScore, live)
        XCTAssertNil(back.finalScore, "in progress is not finished")

        // Standings move on finals only - a team leading in the third quarter is not 1-0.
        XCTAssertNil(Records.matchup(playing, in: [playing]).away)
    }

    func testOverrideWins() {
        let r = CoverageEngine.windowGame(games: games, week: 1, marketKey: "milwaukee", network: "CBS", window: "SUN_LATE", catalog: catalog)
        XCTAssertEqual(r.game?.id, "2026-W01-GB-MIN"); XCTAssertEqual(r.confidence, .confirmed)
    }
    func testZipAndChannelResolution() {
        XCTAssertEqual(catalog.market(forZip: "15201")?.id, "pittsburgh")
        let ch = catalog.channel(for: "CBS", user: pitUser)
        XCTAssertEqual(ch.stationCall, "KDKA"); XCTAssertEqual(ch.number, "2"); XCTAssertEqual(ch.confidence, .likely)
        var u = pitUser; u.provider = "xfinity"; u.setChannelOverride("CBS", "1002")
        XCTAssertEqual(catalog.channel(for: "CBS", user: u).number, "1002")
        var yt = pitUser; yt.provider = "youtubetv"
        XCTAssertNil(catalog.channel(for: "FOX", user: yt).number); XCTAssertTrue(catalog.channel(for: "FOX", user: yt).hint?.contains("WPGH") == true)
    }
    func testAccessCheckNetflixExclusive() {
        XCTAssertFalse(catalog.access(for: game("2026-W01-SF-LAR"), user: pitUser).ok)
        var u = pitUser; u.services = ["Netflix"]
        XCTAssertTrue(catalog.access(for: game("2026-W01-SF-LAR"), user: u).ok)
    }
    // The Prime Thursday listing reads "Prime Video - also WJBK/FOX Detroit, WKBW/ABC Buffalo".
    // A streaming exclusive is free over the air in the two teams' own markets, and saying
    // otherwise sends someone out to buy a subscription for a game already on their TV.
    func testStreamingExclusiveIsFreeOverTheAirInTheTeamsOwnMarkets() {
        guard let game = games.first(where: { $0.exclusive != nil && $0.window == "TNF" }) else {
            return XCTFail("no streaming-exclusive Thursday game in the seed to reason about")
        }
        let homeMarket = Teams.market(game.home) ?? ""

        var atHome = UserProfile(); atHome.market = homeMarket; atHome.services = []
        let home = catalog.access(for: game, user: atHome)
        XCTAssertTrue(home.ok, "a viewer in the team's own market can watch this for free")
        XCTAssertTrue(home.ways.contains { $0.kind == "ota" }, "the free option must be offered outright")
        XCTAssertTrue(home.notes.contains { $0.contains("simulcast") })

        var elsewhere = UserProfile(); elsewhere.market = "hartford"; elsewhere.services = []
        let away = catalog.access(for: game, user: elsewhere)
        XCTAssertFalse(away.ok, "outside those two markets the exclusive really is exclusive")
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
    // The two "Other" entries are off the menu - they describe the viewer without telling us
    // anything, since we hold no lineup for either. They stay in the catalogue, because ten retired
    // providers were migrated onto them.
    func testTheOtherProvidersAreOffTheMenuButNotGone() {
        let offered = Set(catalog.providerList.map(\.id))
        XCTAssertFalse(offered.contains("other"), "a new viewer should not be asked to pick Other")
        XCTAssertFalse(offered.contains("otherstream"))
        XCTAssertNotNil(catalog.providers["other"], "still in the data; ten retired providers point at it")

        // Someone already on one keeps seeing it, or their picker would render blank and look as
        // though the app had forgotten the setting.
        let asOtherUser = Set(catalog.providerOptions(selected: "other").map(\.id))
        XCTAssertTrue(asOtherUser.contains("other"))
        XCTAssertFalse(Set(catalog.providerOptions(selected: nil).map(\.id)).contains("other"))
        XCTAssertFalse(Set(catalog.providerOptions(selected: "directv").map(\.id)).contains("otherstream"))

        // And the migration target is reachable end to end: retire, then find it in your own list.
        var migrated = pitUser; migrated.provider = "armstrong"
        migrated.migrateRetiredProvider()
        XCTAssertTrue(catalog.providerOptions(selected: migrated.provider).contains { $0.id == migrated.provider })
    }

    /// A provider entry has to earn its place by changing the answer. Ten did not, and anyone
    /// who had picked one should land on a fallback that still works.
    func testRetiredProvidersMigrateToAFallbackThatMatchesTheirKind() {
        var cable = pitUser; cable.provider = "armstrong"
        cable.migrateRetiredProvider()
        XCTAssertEqual(cable.provider, "other")
        XCTAssertEqual(catalog.providers["other"]?.kind, "cable")

        var stream = pitUser; stream.provider = "vidgo"
        stream.migrateRetiredProvider()
        XCTAssertEqual(stream.provider, "otherstream", "a streaming service must not fall back to cable")
        XCTAssertEqual(catalog.channel(for: "CBS", user: stream).confidence, .na,
                       "streaming has no channel numbers, so we should not ask for one")

        var kept = pitUser; kept.provider = "directv"
        kept.migrateRetiredProvider()
        XCTAssertEqual(kept.provider, "directv")
    }

    /// Networks often sit on a subchannel — WTVC 9.2 for FOX, WYFF 4.3 for CBS after the August
    /// 2026 affiliation moves. A whole-number channel would send viewers to the wrong network.
    func testSubchannelAffiliatesSurviveToTheChannelReadout() {
        var u = pitUser
        u.provider = "ota"
        u.market = "chattanooga"
        XCTAssertEqual(catalog.channel(for: "FOX", user: u).number, "9.2")
        XCTAssertEqual(catalog.channel(for: "ABC", user: u).number, "9")
        u.market = "greenvillesc"
        let cbs = catalog.channel(for: "CBS", user: u)
        XCTAssertEqual(cbs.stationCall, "WYFF")
        XCTAssertEqual(cbs.number, "4.3", "CBS moved to a WYFF subchannel on 1 Aug 2026")
        u.market = "albuquerque"
        XCTAssertEqual(catalog.channel(for: "CBS", user: u).stationCall, "KOAT")
        XCTAssertEqual(catalog.channel(for: "FOX", user: u).stationCall, "KRQE")
    }

    /// Cable renumbers city by city, so a number set at home must not follow you somewhere else.
    func testChannelOverridesAreKeptPerMarket() {
        var u = pitUser
        u.provider = "spectrum"
        u.setChannelOverride("CBS", "1201")
        XCTAssertEqual(catalog.channel(for: "CBS", user: u).number, "1201")
        u.market = "westpalm"
        XCTAssertNil(catalog.channel(for: "CBS", user: u).number, "a Pittsburgh number must not show in West Palm Beach")
        u.setChannelOverride("CBS", "12")
        XCTAssertEqual(catalog.channel(for: "CBS", user: u).number, "12")
        u.market = "pittsburgh"
        XCTAssertEqual(catalog.channel(for: "CBS", user: u).number, "1201", "going home restores the number set there")
    }

    /// Changing the market is the whole travel story: one control, and every lookup follows it.
    func testChangingMarketMovesChannelsAndCoverage() {
        var u = pitUser                       // Pittsburgh
        XCTAssertEqual(catalog.channel(for: "CBS", user: u).stationCall, "KDKA")
        u.market = "westpalm"                 // now watching from West Palm Beach
        XCTAssertEqual(catalog.channel(for: "CBS", user: u).stationCall, "WPEC")
        // Pittsburgh's own game is no longer the guaranteed local one.
        let r = CoverageEngine.gameInMarket(game("2026-W01-ATL-PIT"), marketKey: u.market, all: games, catalog: catalog)
        XCTAssertNotEqual(r.reason, "Steelers game always airs in Pittsburgh")
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
