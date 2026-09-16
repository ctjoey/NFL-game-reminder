# In-App Events: the first batch, ready to paste

**Before you start, two corrections to the plan you were given.**

*It said 15 approved and 10 live.* The real caps are **10 events in an approved/published state
at once, and only 5 shown on your product page**. So there is no point batching 15 - batch four
or five and top up.

*It treated the deep link as step zero.* It is, and it was missing: the app had a handler for
incoming links but no registered URL scheme, so nothing could ever reach it. That is now built
(`gametime://week/3`, `gametime://game/<id>`, `gametime://alerts`) but it is **not in the live
build** - 1.0.1 (67) shipped before it. Until 1.0.2 is out, **leave the deep-link field blank**.
An event whose link the live app cannot honour is worse than an event with no link: a reviewer
taps it, nothing happens, and the event is rejected.

## Fields, and what Apple actually does with them

| Field | Limit | Where it shows |
|---|---|---|
| Reference name | 64 | Internal only. Nobody sees it. |
| Event name | 30 | On the card, over your image |
| Short description | 50 | Under the name on the card |
| Long description | 120 | The event detail page |
| Badge | pick one | "Live Event" is the right one for a game slate |
| Event card media | 1920x1080, 16:9 | `marketing/event-art/event-card-16x9.png` |
| Detail page media | 1080x1920, 9:16 | `marketing/event-art/event-details-9x16.png` |

Apple lays type over both images, and its own guidance is to keep text and logos out of them.
The two files above are therefore backgrounds, not posters - one pair covers every event below.
Regenerate with `python3 marketing/event-art/make-art.py` if the palette ever changes.

## Timing rules that bite

- Publish start can be **at most 14 days ahead**, so you cannot set the season up in September.
- An event runs **15 minutes to 31 days**.
- Review takes a day or two. **Submit by Monday for the coming Sunday**, not Friday.
- "Minor updates, bug fixes, or routine improvements do not qualify." Every event below is
  pegged to a real dated moment for exactly this reason.

## Batch 1 - submit now

Windows run Thursday evening to Tuesday small hours so the event is live across TNF, Sunday and
MNF, rather than only during the window it is named for. All times Eastern.

### 1. Week 3 Coverage Map
- **Reference name:** 2026 W03 Sunday regional coverage
- **Event name:** Week 3 Coverage Map
- **Short description:** The CBS and FOX games your market gets
- **Long description:** Sunday's regional map is in. See which games your area receives, when coverage starts, and the channel.
- **Badge:** Live Event · **Priority:** Normal
- **Runs:** Thu Sep 24, 6:00 pm - Tue Sep 29, 2:00 am
- **Deep link:** (blank until 1.0.2) then `gametime://week/3`

### 2. Week 4 Sunday Channels
- **Reference name:** 2026 W04 Sunday regional coverage
- **Event name:** Week 4 Sunday Channels
- **Short description:** Both windows, mapped to your market
- **Long description:** One o'clock and four o'clock are different games in different cities. Check which two you get before kickoff.
- **Badge:** Live Event · **Priority:** Normal
- **Runs:** Thu Oct 1, 6:00 pm - Tue Oct 6, 2:00 am
- **Deep link:** `gametime://week/4`

### 3. Week 5 Doubleheader Sunday
- **Reference name:** 2026 W05 doubleheader
- **Event name:** Doubleheader Sunday
- **Short description:** One network gets both windows. Which one?
- **Long description:** On doubleheader weeks a single network carries your afternoon. Find out which, and what it is showing.
- **Badge:** Live Event · **Priority:** Normal
- **Runs:** Thu Oct 8, 6:00 pm - Tue Oct 13, 2:00 am
- **Deep link:** `gametime://week/5`

## Batch 2 - the tentpoles, submit ~12 days before each

These are the ones worth spending High Priority on. They are genuinely distinct events with real
search volume behind them, which is both why they convert and why they will not read as routine.

### 4. Thanksgiving Triple-Header
- **Reference name:** 2026 Thanksgiving three games
- **Event name:** Thanksgiving Football
- **Short description:** Three games, three networks, one day
- **Long description:** Each Thanksgiving game is on a different network. Get all three channels for where you live, plus alerts.
- **Badge:** Live Event · **Priority:** **High**
- **Runs:** Wed Nov 25, 12:00 pm - Fri Nov 27, 2:00 am

### 5. Final Sunday, All at Once
- **Reference name:** 2026 week 18 simultaneous kickoffs
- **Event name:** Every Game at Once
- **Short description:** Week 18 kicks off all together. Be ready.
- **Long description:** The last Sunday runs every game simultaneously. Know your market's channel before they all start.
- **Badge:** Live Event · **Priority:** Normal
- **Runs:** the Thursday before Week 18 - the Monday after

### 6. Wild Card Weekend
- **Reference name:** 2027 wild card weekend
- **Event name:** Wild Card Weekend
- **Short description:** Six games, five networks, three days
- **Long description:** Playoff games scatter across networks and streamers. Get every channel and an alert before each one.
- **Badge:** Live Event · **Priority:** **High**
- **Runs:** Thu - Tue of wild card week

### 7. Super Bowl Sunday
- **Reference name:** 2027 super bowl sunday
- **Event name:** Super Bowl Sunday
- **Short description:** The channel, the time, the alert
- **Long description:** One game, one network, and the only kickoff time that matters. Set the alert and forget about it.
- **Badge:** Live Event · **Priority:** **High**
- **Runs:** Thu - Mon of Super Bowl week

## The honest caveat

There is a real chance Apple rejects a weekly slate event on the grounds that the event belongs
to the NFL, not to this app. The mitigation is baked into the copy above: every event is framed
around **what the app does that week** - the map, your channel, the alert - rather than around
the games themselves. If one is rejected, that framing is the first thing to push harder on, not
the last.
