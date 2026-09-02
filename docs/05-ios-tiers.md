# iOS — full-scale build plan, by tier

Each tier is shippable on its own. "Done" means testable on a device by a reviewer.
Estimates assume one iOS engineer; the Node service already exists for server-side tiers.

## Tier 0 — Engine + core screens (in this repo, `ios/`) · done, needs first Xcode build

| Item | Status |
|---|---|
| SwiftUI app: onboarding, This week, game detail, Alerts, Settings | written |
| Engine port: ZIP→market→station→channel, regional coverage, access check, pregame rules, two clocks | written, mirrors tested Node code |
| Alert planner + local notifications (next 60, quiet hours, daily cap, sent-log dedupe) | written |
| ESPN live sync + field-level diff + change notifications; bundled 2026 seed | written |
| Background App Refresh (`BGAppRefreshTask`) | written |
| EventKit "Add my games to Calendar" with alarms | written |
| Next-game widget (home + lock screen) | written |
| XCTest suite (10 tests) | written |
| **To do on a Mac:** `xcodegen generate`, first build, fix compiler nits, run tests in Simulator | 0.5–1 day |

## Tier 1 — Ship-ready MVP (TestFlight) · ~2 weeks

1. App icon set, launch screen, accent color, dark/light polish, Dynamic Type audit.
2. App Group + shared container so the widget reads the app's schedule/profile (replace the
   `UserDefaults.standard` bridge in `NextGameWidget`).
3. Notification categories with actions: "Open game", "Snooze 10 min", "Stop reminders for this game".
4. Onboarding permission flow: explain-then-ask for notifications and time-sensitive alerts.
5. Market picker with search; ZIP table expanded to all 210 DMAs (data task, see Tier 4).
6. Empty/edge states: no network, TBD kickoff, bye weeks, playoffs (seasontype 3), Pro Bowl skip.
7. Accessibility: VoiceOver labels on clocks/badges, reduce-motion, minimum tap targets.
8. Privacy manifest (`PrivacyInfo.xcprivacy`), no tracking, App Privacy "Data Not Collected".
9. TestFlight build, crash reporting (MetricKit, no third-party SDK), internal test round.

## Tier 2 — Daily-use features · ~2 weeks

1. Lock Screen + StandBy widgets with countdown to coverage/kickoff; Smart Stack relevance.
2. App Intents / Siri Shortcuts: "When is the Steelers game?", "What channel is the game on?", "Remind me about tonight's game".
3. Interactive widget button: "Remind me" for the next game.
4. Apple Watch companion: next game glance + complications, mirrored notifications.
5. Share sheet: "Where to watch" card as text/image for group chats.
6. Team schedule import to Calendar as a subscribed feed (uses the Node server's `.ics` URL) in addition to EventKit.
7. Multiple markets (home + "watching from" travel mode) with a one-tap switch.

## Tier 3 — Server-backed real-time · ~3 weeks

1. APNs push from the Node server for flex/time/network changes (instant, not waiting for background refresh). Device token registration endpoint; server keeps the schedule diff loop.
2. Live Activity on game day: coverage → kickoff countdown → "on now" with channel, on Lock Screen and Dynamic Island.
3. Weekly coverage-map ingestion (506 Sports / network releases) into `overrides` on the server, synced to devices; "confirmed" replaces "likely" every Wednesday automatically.
4. Provider lineup data for cable systems (per-headend channel numbers) behind a lookup API; user overrides still win.
5. Deep links into carrier apps: Prime Video, Netflix, Peacock, ESPN, Paramount+, FOX One, YouTube TV (universal links / URL schemes) from the game card.
6. StoreKit 2: free tier (one team) and Pro (all teams, widgets, Live Activities, calendar sync). No ads at either tier.

## Tier 4 — Data, quality, and release · ~2 weeks + ongoing

1. Licensed or scraped-with-permission schedule feed with SLA (replace the unofficial ESPN endpoint); keep ESPN as fallback.
2. All 210 DMAs with affiliates, all 32 team home markets plus secondary-market affinities reviewed against the NFL's market list.
3. Preseason, playoffs, Super Bowl, international games (Germany, UK, Spain, Australia, Brazil, Mexico) with venue local time and morning-ET windows.
4. Unit + UI test coverage: planner idempotency across re-plans, quiet-hour boundaries, DST transitions (early November flex week), 64-notification cap rotation.
5. App Store assets: screenshots (6.7", 6.1", iPad), description that leads with the two-clock promise, review notes explaining the DEBUG flex simulator is not in release builds.
6. Release checklist: crash-free rate, notification delivery audit (planned vs delivered log), season-start data freeze on the Tuesday before Week 1.

## Sequencing summary

| Tier | Outcome | Effort |
|---|---|---|
| 0 | Runs in Simulator; core promise works offline | done here + 1 day on a Mac |
| 1 | TestFlight-ready, App Store compliant | ~2 weeks |
| 2 | Widgets, Siri, Watch, sharing | ~2 weeks |
| 3 | Instant push, Live Activities, Pro tier | ~3 weeks |
| 4 | Licensed data, full DMA coverage, release | ~2 weeks + seasonal upkeep |
