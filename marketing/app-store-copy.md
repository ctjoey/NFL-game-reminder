# App Store copy, ready to paste

Character limits are Apple's and are hard. Every string below is checked by
`node marketing/check-copy.js`, which fails if anything is over.

## What can change when

| Field | Limit | Goes live |
|---|---|---|
| Promotional text | 170 | **Immediately**, no version, no review |
| App name | 30 | Only with a new version |
| Subtitle | 30 | Only with a new version |
| Keywords | 100 | Only with a new version |
| Description | 4000 | Only with a new version |
| In-App Event copy | 30 / 50 / 120 | After event review (1-2 days) |

Promotional text is the only lever that moves today. Everything else waits for 1.0.2,
so the keyword rewrite has to ride along with the next build rather than being its own errand.

## Name (30)

> GameDial: Pro Football TV

"Pro" is load-bearing. Without it, "Local Football TV" reads as high-school and community ball to
an American - and in a search result the name is the only thing read before the tap.

"Football" rather than "NFL" because the name is the most legally exposed field and NFL is a live
mark; "football" ranks nearly as well, so the safety is close to free. NFL then sits in the
subtitle, where the use is plainly descriptive.

Upgrade path, when a second league justifies it: `GameDial: Local Football TV` (27) once college
is in - by then the high-school reading is no longer wrong - then `GameDial: Local Sports TV` (25).

## Subtitle (30)

> Local NFL channels and alerts

## Keywords (100)

> schedule,guide,listings,kickoff,game,sunday,cbs,fox,redzone,antenna,cord,cutter,market,today

Rules that shaped this: no spaces after commas (a space costs a character), never repeat a word
already in the app name or subtitle (Apple indexes those separately and unions the results),
singular only - Apple matches plurals itself.

Name and subtitle between them already index **gamedial, pro, football, tv, local, nfl, channels,
alerts**, so none of those appear here. That is the whole discipline: eight indexed words up top,
fourteen more down here, nothing bought twice. `check-copy.js` fails the build on an overlap.

"watch" is deliberately absent. It is well searched, but it promises video the app does not
serve, and an install that arrives expecting to watch the game leaves a one-star review.

## Promotional text (170) - swap this weekly, it needs no review

Week in play:

> Sunday's slate is up. See which CBS and FOX games your market gets, when coverage starts,
> and the channel to turn to - then set an alert so you don't miss kickoff.

Thanksgiving:

> Three games, three networks, one afternoon. Check which channel each one is on where you
> live, and set alerts before the food comes out.

Playoffs:

> Every playoff game, the channel it's on in your market, and an alert before kickoff. No
> guessing which network has which game.

## Description and What's New

Too long for a blockquote, and you want to paste them without markdown in the way, so they live in
`marketing/app-store-description.txt` (4000) and `marketing/app-store-whats-new.txt` (4000).
check-copy.js measures both and fails if either still says "Game Time Reminder".

## In-App Events

See `marketing/in-app-events.md`.
