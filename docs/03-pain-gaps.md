# Prompt 3 — Pain gaps no existing product solves well

Ranked by how often the underlying complaint appeared across the eleven products and by how
completely it is unsolved today.

---

## Gap 1 — "Where is my game in *my* market" (network → local station → channel number → do I have it)

1. **Pain gap name:** Market-resolved "where to watch" for a specific game.
2. **Evidence:** ESPN "challenges finding specific games"; NFL+ local games "audio only";
   Sunday Ticket "local games are blacked out … only on the local CBS or Fox station" plus
   Week 3 2025 black screens; DirecTV "tune to channel 212 for NFL Network … switches back
   to Telemundo"; Fubo dropped NBC in Nov 2025; Yahoo Sports 2026: "It shouldn't be this hard to
   figure out which channel is airing an NFL game"; FCC and DOJ opened probes after fan
   complaints; 506 Sports' weekly image maps and weekly "how to stream every game" articles
   exist only because no app answers the question.
3. **Root cause:** Four separate datasets have to be joined and nobody joins them: the league
   schedule (game → network), the network's regional distribution (network → which game in
   which DMA), the affiliate/provider lineup (DMA → call sign → channel number per provider),
   and the user's entitlements (which services they actually pay for). Each is owned by a
   different party (NFL, CBS/FOX, MVPDs, the user).
4. **Why it's missed:** Rights holders build apps to drive their own subscriptions, so they will
   not send you to a competitor's channel. Score apps treat "TV: CBS" as sufficient. Guide apps
   (Fubo, DirecTV, YouTube TV) know channel numbers but not the regional game assignment, and
   they present the guide, not an answer. The regional assignment data is hobbyist-curated.
5. **Opportunity:** A game card that reads *"KDKA-TV (CBS) · Ch. 2 OTA · Ch. 2 DirecTV ·
   'KDKA' on YouTube TV"* and, for regional windows, *"In Pittsburgh this window airs
   Falcons at Steelers (confirmed)"*. Expose confidence (confirmed / likely / check listings)
   and let users correct channel numbers once. This is the feature the app is built around.

## Gap 2 — Reminders that carry both "coverage begins" and "kickoff" in the user's time zone

1. **Pain gap name:** Two-clock reminders (pregame coverage + kickoff), localized.
2. **Evidence:** The NFL lists every game in ET; West-coast fans "constantly convert ET times to
   their local time"; NBC's FNIA starts 7:00 pm ET for an 8:20 kickoff, FOX NFL Kickoff at
   11:00 am and FOX NFL Sunday at noon ET for 1:00 pm games, TNF Tonight at 7:00 pm ET for an
   8:15 kickoff; calendar-sync utilities lead their marketing with "every kickoff lands in your
   calendar in your local timezone" because the mainstream apps don't.
3. **Root cause:** Apps store one timestamp per game (kickoff, ET) and the pregame window is
   network programming data that lives in TV guides, not sports feeds.
4. **Why it's missed:** Score apps think in game clocks, guides think in program grids; neither
   thinks in "when should I be on the couch". Pregame times are stable per network/window and
   easy to model as rules, but nobody bothered.
5. **Opportunity:** Every alert and card shows *Coverage 12:00 pm · Kickoff 1:00 pm (your
   time, PDT) · 4:00 pm ET*, with separate opt-in alerts for coverage start and kickoff, and
   lead times the user chooses.

## Gap 3 — Alerts that only fire for what the user picked, and that the user can see in advance

1. **Pain gap name:** Consent-scoped, previewable notifications.
2. **Evidence:** NFL app users who set alerts for their team "still receiving notifications for
   every high-profile game"; ESPN "5-10 notifications per hour about unwanted sports teams" and
   alerts continuing after being turned off; Yahoo "ads disguised as notifications"; CBS
   "multiple notifications on the same item"; Bleacher Report "notification pollution".
3. **Root cause:** Notification pipelines are shared with marketing and editorial; scoping is by
   team/topic rather than by game and moment; there is no user-visible queue of what will fire.
4. **Why it's missed:** Push volume is a growth KPI for media apps. Reducing it is against the
   business model, so the "fix" is always a deeper settings page rather than fewer alerts.
5. **Opportunity:** Per-game and per-moment opt-in (coverage start, kickoff, schedule change,
   access warning), a hard per-day cap, quiet hours, zero marketing pushes, and a "This week you
   will receive N alerts" preview listing every one with its send time. Delete-and-forget is a
   feature.

## Gap 4 — Schedule-change (flex) alerts that also fix the reminder and the channel

1. **Pain gap name:** Change-aware reminders.
2. **Evidence:** Flex moves documented every season (Weeks 11–16 late flexes; first-ever TNF
   flex; "last-second flex … bumped to third network"); Chargers fans asked for refunds after a
   date change; calendar utilities market "flex schedule moves … show up automatically";
   mainstream app reviews never mention receiving a "game moved" alert because none send a
   useful one.
3. **Root cause:** Reminders are created once from the schedule and never re-derived. A flex
   changes date, time, and network simultaneously, which invalidates the reminder time and the
   channel answer at once.
4. **Why it's missed:** Flexes affect a handful of games a week, so they are treated as news
   rather than as a data change; apps push a headline instead of rewriting the user's reminder.
5. **Opportunity:** Poll the schedule, diff it, and on any change: send one "moved" alert with
   old → new time, network, and channel; reschedule reminders; keep a visible change log per
   game.

## Gap 5 — Access check before kickoff ("this game is on Netflix and you don't have Netflix")

1. **Pain gap name:** Entitlement-aware pre-kickoff warning.
2. **Evidence:** Fans "needed 10 different channels or streaming services" in 2025 and paid
   "$575–$800"; Peacock wild-card "firestorm"; Netflix carrying a Week 1 game from Melbourne
   at 8:35 pm ET and a Thanksgiving-Eve game in 2026; Peacock Week 17 exclusive; Fubo dropping
   NBC mid-season; YouTube TV losing ESPN/ABC during a carriage dispute with Sunday Ticket
   subscribers "trapped"; NFL+ "paying for Premium but not receiving live local games".
3. **Root cause:** No product stores what the user subscribes to alongside what carries the
   game, and carriage status changes over the season.
4. **Why it's missed:** Rights holders have no incentive to tell you the game is elsewhere;
   aggregators avoid entitlement data because it is user-specific and changes.
5. **Opportunity:** User declares their services once; 24 hours before each followed game the
   app checks carrier ∩ services and, if empty, sends *"Broncos at Chiefs is ESPN/ABC only.
   Your options: ABC over the air (KMBC ch. 9), ESPN+ ($), or a free Disney+ trial."* Also warn
   on known blackouts (Sunday Ticket local, NFL+ mobile-only).

## Gap 6 — A utility, not a media product: no login, no ads, no bloat, honest about uncertainty

1. **Pain gap name:** Trustworthy single-purpose reminder.
2. **Evidence:** NFL app "must log in every time"; FOX One logout loops; ESPN "video ads … even
   with ESPN+"; Yahoo ads "regardless of settings"; the small reminder app's uninstall reviews
   are about ads; CBS "wrong information"; Sports Alerts "final score while still in the 8th".
3. **Root cause:** Every product in the category monetizes attention, so it grows features and
   ads; data accuracy is downstream of engagement priorities.
4. **Why it's missed:** A quiet, accurate utility does not fit ad-funded economics; the
   opportunity is a paid-or-free tool with no ad surface at all.
5. **Opportunity:** Device-token accounts (no email/password), no ads, no news feed, an explicit
   confidence label on every derived fact, and an editable channel table so the user can correct
   the data once and never be wrong again.

## Gaps that are NOT open (well served already)
- Live scores and play-by-play alerts: theScore and Flashscore do this well.
- Team-schedule calendar feeds: SportsCal / MatchSync solve the calendar part (without
  channels or coverage). This app still ships an ICS feed because it is cheap and users ask.
- Watching the game itself: outside scope; this app routes to the right place, it does not
  stream.
