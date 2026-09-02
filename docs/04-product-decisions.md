# Prompt 4 — How the app answers the gaps

| Pain gap (docs/03) | What the app does | Where |
|---|---|---|
| 1. Market-resolved "where to watch" | ZIP → DMA → affiliate call sign → channel number on the user's provider; regional engine says which CBS/FOX game airs in that market with a confidence label and what airs instead; call-sign search hints for streaming guides; user can override numbers once | `server/market/*`, `server/coverage/*`, card "Watch on" row |
| 2. Two-clock, localized reminders | Every card and alert shows *Coverage begins* and *Kickoff* in the user's zone plus ET; pregame rules per network/window (FNIA 80 min, FOX NFL Kickoff 120 min, TNF Tonight 75 min, The NFL Today 60 min, etc.) marked stable/typical | `server/schedule/windows.js`, `server/cards.js`, `server/notify/templates.js` |
| 3. Consent-scoped, previewable alerts | Per-moment toggles; per-game "Remind me"/exclude; quiet hours; daily cap; Alerts tab lists every planned alert with its send time; no marketing pushes exist in the code path | `server/notify/scheduler.js`, `public/app.js` (Alerts view) |
| 4. Change-aware reminders | 15-minute schedule re-sync, field-level diff, one change alert with old → new time/network/channel, sent-log keys include the kickoff instant so reminders re-arm; change log per game; ICS `SEQUENCE` bumps so calendars update | `server/schedule/scheduleService.js`, `Scheduler.onScheduleChanges`, `server/ics.js` |
| 5. Entitlement-aware warning | User declares provider, antenna and streaming services; 24 h before each followed game the app checks carrier ∩ services and sends a warning only if there is a catch (exclusive not owned, Sunday Ticket local blackout, NFL+ mobile-only, provider carriage gaps such as Fubo/NBC) | `accessCheck` in `server/market/marketService.js`, `access` alert type |
| 6. Trustworthy single-purpose utility | No login (random token), no ads, no feed; confidence labels on every derived fact; unverified seed rows flagged; editable channel table; "Delete my data" | whole app |

## Alert catalogue (the complete list; nothing else can fire)

| Type | When | Content |
|---|---|---|
| `coverage` | network coverage start (pregame show) | show name, station + channel, kickoff local + ET |
| `kickoff_N` | N minutes before kickoff (user picks; default 30) | kickoff local + ET, station + channel, note if your station shows a different game |
| `kickoff_0` | at kickoff (off by default) | same |
| `access` | 24 h before, only if there is a catch | what it is on, what you have, options with cost |
| `change` | when the schedule diff finds a time/date/network change | old → new, new channel, "reminders updated" |
| `weekly` | user-chosen weekday/hour before the week | one line per followed game with channel and any access warning |

Quiet hours hold `access`, `change` and `weekly` until they end; `coverage` and `kickoff_*` still fire.
A daily cap (default 12) skips and logs anything beyond it. The sent-log makes every alert idempotent across restarts.

## Data model

- **Game:** `id (season-Wnn-AWAY-HOME)`, `kickoff` (instant), `networks[]` (linear), `streams[]`, `exclusive`, `window`, `national`, `verified`, `timeTbd`, `venue`, `label`, `notes`.
- **User:** `tz`, `zip`, `market`, `provider`, `hasAntenna`, `services[]`, `channelOverrides{}`, `follow{mode, teams[], games[], excludeGames[]}`, `alerts{...}`, `quiet`, `maxPerDay`, `channels{push[], webhook, sms}`.
- **Market:** affiliates per network with call sign and OTA channel, `teams[]` (primary), `affinity[]` (secondary), ZIP-prefix map.
- **Provider:** kind, `localsMatchOta`, national channel numbers, `carries[]`, carriage notes, guide hint.

## Known limits (stated in the UI where relevant)

- The bundled seed holds only confirmed 2026 games; the rest arrive via live sync. Rows with unconfirmed home team or time are flagged.
- Cable channel numbers vary by headend; the app asks for them once rather than guessing.
- Regional assignments before the networks publish maps are rule-based and labeled "likely"/"unknown"; editorial overrides live in `server/coverage/overrides-2026.json`.
- ZIP coverage is a prefix table for the 54 largest/NFL markets; other ZIPs fall back to a market picker.
- Pregame start times marked "typical" follow the networks' usual pattern and can differ on holiday or special games.
