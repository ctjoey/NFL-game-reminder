# In-App Events: the first batch, ready to paste

Deep links work in the live app (`gamedial://week/7`, `gamedial://game/<id>`,
`gamedial://alerts`), so every event below can open GameDial straight to its week.

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

## Batch 1 - weeks 7 to 9 (refreshed for 1.0.7)

The first batch (weeks 3 to 5) has run. These replace it, and lead with what is new: the games you
can watch in green, and the maps read every Wednesday. Same windows as before, Thursday evening to
the Tuesday small hours, all times Eastern.

Submit week 7 now and week 8 by Monday Oct 19. Week 9 starts more than 14 days out, so Apple will
not take it until **Thursday Oct 22**.

### 1. Week 7: Your Games in Green
- **Reference name:** 2026 W07 games you can watch
- **Event name:** Week 7: Your Games in Green
- **Short description:** See which games are on your TV this week
- **Long description:** Sunday's games you can watch are in green: your local CBS and FOX games, plus the ones on your services.
- **Badge:** Live Event · **Priority:** Normal
- **Runs:** Thu Oct 22, 6:00 pm - Tue Oct 27, 2:00 am
- **Deep link:** `gamedial://week/7`

### 2. Week 8 Maps Are In
- **Reference name:** 2026 W08 Wednesday coverage maps
- **Event name:** Week 8 Maps Are In
- **Short description:** Your local Sunday games, updated Wednesday
- **Long description:** The regional maps came out Wednesday. Your 1 and 4 o'clock games are in, with your station and channel.
- **Badge:** Live Event · **Priority:** Normal
- **Runs:** Thu Oct 29, 6:00 pm - Tue Nov 3, 2:00 am
- **Deep link:** `gamedial://week/8`

### 3. Week 9: What's On Near You
- **Reference name:** 2026 W09 games on near you
- **Event name:** Week 9: What's On Near You
- **Short description:** Every game this week, and where to find it
- **Long description:** Home or on the road, see which games your area gets, the channel to turn to and when coverage starts.
- **Badge:** Live Event · **Priority:** Normal
- **Runs:** Thu Nov 5, 6:00 pm - Tue Nov 10, 2:00 am
- **Deep link:** `gamedial://week/9`

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
