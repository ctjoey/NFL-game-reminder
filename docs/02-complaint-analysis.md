# Prompt 2 — Cross-product complaint analysis

Eleven products were reviewed (ESPN, NFL app/NFL+, Yahoo Sports, theScore, CBS Sports,
FOX Sports/FOX One, Bleacher Report, YouTube TV/Sunday Ticket, Fubo/DirecTV Stream/Sling,
Sports Alerts/SofaScore/Flashscore, and schedule-reminder utilities incl. 506 Sports).
Each complaint theme below is marked with the products where it appeared in reviews.

Legend: ● appears repeatedly in reviews, ○ appears occasionally, — not observed.

| # | Complaint theme | ESPN | NFL | Yahoo | theScore | CBS | FOX | B/R | YTTV | Fubo/DTV | Alerts apps | Sched. utils |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Notification spam / can't scope alerts to what I asked for | ● | ● | ● | ○ | ● | — | ● | — | — | ○ | — |
| 2 | Ads (incl. ads disguised as notifications, ads despite paying) | ● | ○ | ● | ● | ○ | ○ | ○ | — | — | ○ | ● |
| 3 | Alerts late, missing, or for the wrong game | ○ | ○ | — | ○ | ● | — | — | — | — | ● | — |
| 4 | Wrong or stale information (scores, statuses) | ○ | ○ | ○ | — | ● | — | — | — | — | ● | — |
| 5 | Can't find the game / where to watch inside the app | ● | ● | — | — | — | ○ | — | ● | ● | — | — |
| 6 | Crashes, slow loads, buffering | ● | ● | ● | — | ● | ● | ● | ● | ○ | — | — |
| 7 | Forced/broken login | ○ | ● | — | — | ○ | ● | — | — | — | — | — |
| 8 | Blackouts / carriage disputes / "I paid and still can't watch" | ○ | ● | — | — | — | — | — | ● | ● | — | — |
| 9 | Regional-game confusion (which CBS/FOX game airs here) | — | ○ | — | — | — | — | — | ● | ● | — | ● |
| 10 | Times shown in ET only / time-zone conversion burden | ○ | ○ | — | — | — | — | — | — | — | — | ● |
| 11 | Schedule changes (flex) not surfaced; reminders not updated | — | ○ | — | — | — | — | — | — | — | — | ● |
| 12 | Pregame coverage vs kickoff time ambiguity | — | ○ | — | — | — | — | — | — | — | — | ○ |
| 13 | Streaming fragmentation: didn't know the game was on Netflix/Prime/Peacock | ○ | ● | — | — | — | — | — | ● | ● | — | ○ |
| 14 | Channel numbers per provider unknown / wrong | — | — | — | — | — | — | — | — | ● | — | — |
| 15 | Bloat: user wants one job done, gets news/fantasy/betting/chat | ● | ○ | ● | ○ | ○ | — | ● | — | — | — | — |

## What repeats across the whole set

### A. Notifications are the #1 product-level complaint, and they fail in the same two ways everywhere
1. **Over-delivery.** ESPN ("5-10 notifications per hour about unwanted sports teams", and
   alerts continuing after being disabled), NFL ("every high-profile game … even though they
   said they didn't want those"), Yahoo ("ads disguised as notifications"), CBS ("multiple
   notifications on the same item"), Bleacher Report ("notification pollution").
   Root pattern: alerts are used as an engagement/marketing channel, and the scoping model is
   team- or topic-level, so it cannot express "only the games I picked, only these moments".
2. **Under-delivery / unreliability.** Sports Alerts ("start notification almost an hour after
   the game began", "only come when their phone screen is active"), SofaScore ("incorrect
   alerts multiple times daily"), theScore has a dedicated "Alert Troubleshooting" article,
   ESPN Android alerts that open nothing. Root pattern: alerts are triggered from live-score
   polling instead of from the schedule, and there is no feedback to the user about what has
   been scheduled to fire.

### B. "Where is the game?" is unsolved in-app even by the rights holders
- ESPN reviews: "challenges finding specific games"; NFL+: "no search function", local games
  "audio only" on mobile; YouTube TV: local games "blacked out on Sunday Ticket", black screens
  on mobile; DirecTV: tuning to 212 for NFL Network flips to Telemundo; Fubo lost NBC (SNF)
  mid-season.
- Outside the apps, fans rely on a Wednesday image map from 506 Sports and articles titled
  "NFL Week N guide: how to stream all the Sunday games" to answer a question that should be
  a single line: *"Your game is on KDKA (CBS), channel 2 on your box, coverage from noon,
  kickoff 1:00 pm ET / 10:00 am PT."*
- No product combines: (network for the game) × (which game the network shows in my DMA) ×
  (the channel number for that station on my provider) × (whether I actually subscribe to it).

### C. Wrong or stale data destroys trust faster than missing data
- CBS: "final scores shown as ties in playoff games"; Sports Alerts: "final score while still
  in the 8th inning"; NFL: replays delayed 2–4 h without notice. Products present guesses
  with the same confidence as facts and provide no way for the user to see or correct them.

### D. Time is presented the way the league publishes it, not the way the fan lives it
- All schedules are ET; West-coast fans "constantly convert". Pregame shows begin 60–120
  minutes before kickoff (FNIA 7:00 pm for 8:20 kickoff; FOX NFL Kickoff 11:00 am and FOX NFL
  Sunday noon for 1:00 pm; TNF Tonight 7:00 pm for 8:15). The "start time" fans see in guides
  is frequently the show, and vice-versa. No product tells the user both numbers in local time.

### E. The schedule moves and the apps don't
- Flex scheduling can move a game to a different day, time, and network with as little as 12
  days' notice (TNF flex now 21 days; late flexes in Weeks 11–16 documented every season).
  Calendar-sync utilities market "flex moves show up automatically" precisely because the big
  apps do not push a "your game moved" alert that also re-times the reminder and re-resolves
  the channel.

### F. Fragmentation is a knowledge problem before it is a money problem
- 10 services needed in 2025; Netflix now has 5 games including a Week 1 game from Melbourne
  and a Thanksgiving-Eve game; Peacock has an exclusive in Week 17; Prime has TNF plus Black
  Friday and a playoff game; MNF is ESPN/ABC/ESPN+/Disney+. Fans report only discovering the
  service requirement at kickoff. No app cross-references the game's carrier against the
  services the user actually has and warns ahead of time.

### G. Everything is bloated and ad-laden, and users say so
- Every mass-market app in the set carries ads, news, fantasy, betting and chat. Reviews for
  theScore (the best-rated) still say "sticks to the basics" as a compliment. Reviews for the
  small reminder utility complain about ads specifically. A reminder is a utility; users want
  it to be quiet, accurate, and to not require a login (NFL, FOX One login loops).
