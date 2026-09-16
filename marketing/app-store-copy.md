# App Store copy, ready to paste

Character limits are Apple's and are hard. Every string below is checked by
`node marketing/check-copy.js`, which fails if anything is over.

## What can change when

| Field | Limit | Goes live |
|---|---|---|
| Promotional text | 170 | **Immediately**, no version, no review |
| Subtitle | 30 | Only with a new version |
| Keywords | 100 | Only with a new version |
| Description | 4000 | Only with a new version |
| In-App Event copy | 30 / 50 / 120 | After event review (1-2 days) |

Promotional text is the only lever that moves today. Everything else waits for 1.0.2,
so the keyword rewrite has to ride along with the next build rather than being its own errand.

## Subtitle (30)

> What game is on, where you are

Runners-up: `Your NFL channel, every week`, `NFL kickoff and channel alerts`.

## Keywords (100)

> nfl,football,tv,schedule,channel,guide,listings,kickoff,cbs,fox,redzone,antenna,cord,market,local

Rules that shaped this: no spaces after commas (a space costs a character), never repeat a word
already in the app name or subtitle (Apple indexes those separately), singular only - Apple
matches plurals itself. "game", "time" and "reminder" are deliberately absent: they are in the name.

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

## In-App Events

See `marketing/in-app-events.md`.
