# Roadmap

**Last updated: 7 September 2026**

## Where we are

**V1.0 is submitted and awaiting App Store review.** Build 49, from commit
`a42ae78`. Everything below is future work — nothing here has been built.

What shipped in V1.0:

- 272-game NFL schedule, live-synced from ESPN's public endpoint with a bundled
  fallback
- 94 TV markets with station call signs, over-the-air channel numbers, and 24
  providers' carriage
- Regional coverage inference — which CBS/FOX game your local station is
  actually showing, and a warning when your market gets a different one
- Coverage-start, kickoff-lead, kickoff, access-warning, schedule-change and
  weekly-rundown alerts, scheduled locally on the device
- No account, no server, no ads, no tracking. Everything stays on the phone.

## The direction

V1 was built alert-first: the pitch was reminders, and the schedule was how you
picked what to be reminded about. That undersells what actually gets built.

The notification scheduler is about a hundred lines of standard iOS code. The
thing that took real work — and is genuinely hard to copy — is the market
engine: 94 markets × affiliate call signs × OTA channel numbers × 24 providers'
carriage × regional coverage inference × broadcast window logic. That is data
curation and domain knowledge, not code, and it is the moat.

**So the app turns around to face the schedule.** Alerts stay, and stay good,
but they become a feature rather than the pitch. The app's job is to be the
fastest, most trustworthy answer to: *what game is on, at what time, on what
channel, where I am right now.*

Why this is the right way round:

- **Alerts retain; a schedule acquires.** An alert only matters to someone who
  already installed and configured. A schedule answers a question someone has
  this minute — which means search traffic, and a reason to open the app on day
  one without setting anything up.
- **The intent is real and unserved.** "What channel is the Browns game on" is a
  thing people type every Sunday. 506 Sports has the best data behind a website
  from 2009; the league app says "on CBS" but not "channel 19"; provider guides
  are walled gardens; TV-listing apps don't understand sports markets at all.
- **The engine is sport-agnostic.** Market, affiliate and carriage resolution
  works for any league. That is what makes a second and third sport cheap, and
  what makes the paid tier worth buying.

**The real competitor is Google's answer box**, not another app. Google
increasingly answers "what channel is X on" directly. The answer to that is the
part Google can't do: it doesn't know your provider, your channel number, or
when coverage starts, and it can't remind you. That is a real answer — and it
means channel-number precision is the whole ballgame.

## Decided

- **Reposition around the TV schedule.** Alerts become a feature.
- **Name changes in V2.** Preferred name is *Game Time TV Guide*. Open concern:
  "TV Guide" is a registered trademark of a media brand in this exact category,
  a more direct Guideline 5.2.1 collision than the NFL question was.
  *Game Time TV Schedule* or *Game Time TV* carry the same meaning without the
  fight. Final call still to make.
- **Cards, not a grid.** A grid on a phone is hard to read and the card list
  already answers the question fast. "TV guide" is a mental model, not a layout.
- **No scores, no news.** Different app, crowded space, and it breaks the
  no-noise promise that currently differentiates us. People who want that have
  the major sports sites.
- **No accounts, no backend.** On-device is a genuine selling point and keeps
  running costs at zero.
- **Freemium: NFL free, Pro unlocks every league.** NFL is the acquisition
  engine and stays free with the best data. Price to be set.
- **More leagues after NFL is nailed down** — NCAA, NBA, MLB, NHL and beyond.
- **Sequencing: ship V1, learn, small tweaks in V1.1, reposition in V2.**

## Open decisions

1. **The name.** *Game Time TV Guide* as preferred, versus *Game Time TV
   Schedule* / *Game Time TV* to avoid the trademark collision.
2. **Pro pricing shape.** One-time purchase or annual subscription. Leagues run
   on seasons and the market data needs yearly upkeep, which argues for a
   subscription; one-time is friendlier for a utility and easier to sell.
3. **Schedule-first onboarding.** Whether to open to the schedule instead of the
   setup wizard (see V2 below), or keep the current flow.

## The work

### Ongoing — starts now, blocks the repositioning

**Verify all 94 markets' affiliates and channel numbers.** About 40 of the 94
markets' call signs and OTA channel numbers were compiled from knowledge rather
than a verified source. Under alert-first positioning a wrong channel was an
annoyance; under "the go-to for what channel" it is fatal to trust. Chattanooga
(WTVC shared across FOX and ABC) is a known one to check. Every future version
depends on this being right.

Related: real weekly regional coverage data rather than inference. Right now the
app infers which CBS/FOX game airs in which market; 506 Sports publishes actual
weekly maps. Inference gets you "probably"; real data gets you "definitely."
That gap is the difference between a useful app and the authoritative one.

### V1.1 — small tweaks after approval

- **Search.** Type "Browns", "44077" or "Sunday 1pm" and get the answer, across
  all weeks rather than just the selected one. Table stakes for a reference app
  and the biggest single gap.
- **Share a game as text.** One tap to send "Cowboys at Giants · Sun 8:20 PM ·
  NBC (WKYC ch. 3)". Word of mouth built into the core action, carrying the
  thing the app is best at into someone else's hands.
- **Trip planning: a future week in another city.** "I'm in Orlando for Week 6 —
  what's on locally and where?" The engine already does this; the week picker
  spans all 18 weeks and the market picker re-resolves every channel. What's
  missing is the framing that makes it discoverable. UI work only.
- **"This channel is wrong" one-tap report.** A prefilled email from any channel
  row. Cheap, needs no backend, and feeds the verification work above by
  crowdsourcing corrections from the people who would actually know.

### V2 — the reposition

- **Rename and rewrite the App Store listing** around finding what's on in your
  market, with alerts as a feature. Keep the existing icon and bundle ID for
  continuity; the name change ships with a version submission.
- **Schedule-first onboarding** *(needs sign-off)*. Guess the market from
  location, show today's games with times and networks immediately, ask for
  provider only when someone taps for a channel number and for teams only when
  they want alerts. Today the app demands ZIP, provider, teams and alert
  preferences before showing anything, which is the biggest structural blocker
  to schedule-first. Card layout stays either way.
- **Pro tier.** StoreKit IAP gating leagues beyond NFL. Works with no backend —
  StoreKit 2 checks entitlements locally, so the on-device architecture stays
  intact. Requires the Paid Apps Agreement (bank and tax info), which is the
  same paperwork as the tip jar, so it gets done once for both.

### V2+ — expansion

- **NCAA football as the first Pro league.** Chosen over the RSN leagues for the
  opener: same audience as NFL, same weekend rhythm, best cross-sell — and the
  pain is arguably worse, with 100+ games a Saturday across a dozen networks
  plus regional syndication. NBA, MLB and NHL have the nastier blackout problem
  and are worth more eventually, but the audience overlaps less, so they follow.
  Reuses the whole market engine; the per-league work is schedule data and
  network mapping.

### Parking lot — not ranked

- **Widget and Siri/Spotlight lookup.** "Hey Siri, what channel is the Browns
  game on" answered without opening the app, plus a home-screen widget showing
  the next game and its channel. Strong fit for the search-intent behavior the
  repositioning targets, and the widget target already exists in the project.
- **Tip jar** ("buy me a beer"). A consumable StoreKit purchase at the bottom of
  About. Needs the same Paid Apps Agreement as the Pro tier. Deferred until the
  app has real users.

## What to watch in V1

The question V1 answers, better than any amount of speculation: **do people
configure alerts, or do they open the app, look, and leave?** That is the whole
schedule-first thesis, and real usage settles it before we spend V2 on it.
