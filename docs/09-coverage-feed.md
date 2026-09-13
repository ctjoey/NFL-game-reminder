# The regional coverage feed

**Built 13 September 2026**, after the app told a viewer in Hartford-New Haven that two games
were not on his local FOX station when both of them were.

## The problem this solves

Every Sunday afternoon, CBS and FOX each split their window across the country. One market gets
Falcons at Steelers, the next gets Buccaneers at Bengals. Which market gets which is decided by
the networks and published as a map midweek.

The app never had that map. It had a rule engine that guessed:

1. Market's own team is playing → that game (a real NFL rule, genuinely confirmed)
2. Only one candidate → that game
3. A team on the market's affinity list → *probably* that game
4. ...and then it made something up

Rule 4 was the bug: it keyed off ESPN's "national" flag, which is set on most Sunday games, so it
amounted to picking whichever candidate came first in the array — and then the UI reported that
pick as fact.

Rule 4 is now a **prediction**: the candidate whose two teams come from the largest markets, on
the reasoning that a network sends its biggest matchup to the widest audience. It is labelled
*Best guess*, it is stable under reordering, and it is never allowed to say a game is **not** on
someone's local station. The app always names a game — "unknown" is not an answer a schedule app
gets to give — but it never dresses a guess as a fact.

A prediction is still a guess. **Correct requires the map.** This is the pipeline that carries it.

## Shape

```
  published map ──► docs/coverage-2026.json ──► GitHub Pages ──► app fetches on foreground
                             │                                          │
                     bundled copy in the app  ─────────────────────────►│  (floor, used until
                                                                            the first fetch)
```

Four properties matter:

**It reaches phones without an App Store release.** Maps publish weekly; releases take a week to
review. Anything baked into the binary is stale before it ships. The app fetches the feed on
foreground, caches it to disk, and falls back to the copy it shipped with.

**It hosts for nothing.** The file sits in `docs/`, which GitHub Pages already serves for the
privacy policy. No server, no bill, consistent with the on-device architecture.

**Nothing enters it that was not observed.** Feed entries are reported to users as *confirmed*,
which is a promise. `validateFeed` rejects a feed where a game id does not exist, sits in the
wrong week, sits in the wrong window, or is not carried on the named network — and refuses to
write rather than repairing. A guess promoted to confirmed is worse than no entry, because that
is precisely the bug that started this.

**A missing entry is a safe state.** No map for a market means the engine falls back to its rules
and, failing those, to a labelled prediction. The feed can be empty, partial, or a week behind
without the app ever lying — the worst case is a visibly-marked guess, not a confident error.

## The weekly chore

Coverage maps are drawn game-by-region, not market-by-market — one game covers a swathe of the
country — so the tool works that way too:

```
npm run coverage -- assign --week 3 --network FOX --window SUN_EARLY \
  --game 2026-W03-ATL-PIT --markets pittsburgh,hartford,youngstown --source "506sports 2026-09-24"

npm run coverage -- assign --week 3 --network FOX --window SUN_EARLY \
  --game 2026-W03-TB-CIN --markets rest --source "506sports 2026-09-24"
```

`rest` takes every market in that window the map has not already spoken for — still data entry,
not inference: use it only where the map really does give one game to everywhere left over.

A worked example on the seed schedule filled **89 markets in one window with three commands**.
Four windows a week (CBS and FOX × early and late) is realistically 15-25 commands, call it ten
minutes. That is the difference between a chore that happens and one that does not.

Other commands:

| Command | What it does |
|---|---|
| `template --week N` | Emits only the slots the rules *cannot* already answer, with candidates |
| `apply --week N --file draft.json` | Applies a filled-in template |
| `validate` | Checks the whole feed against the schedule |
| `status` | Per-week fill rate |
| `check` | Non-zero exit if the week now in play has no map |
| `week` | The week the app is about to need |

CI runs `validate` on every push, checks the bundled copy has not drifted from the published one,
fetches the live URL to prove the app's refresh path actually works, and nags every Thursday.

## The source: still open, and it is the real decision

The pipeline is source-agnostic on purpose, because there is no good answer yet. What exists:

**506 Sports** is the de facto authority — the maps everyone else reprints. Published as images
and prose, no API, no structured download. Parsing it weekly without asking would be both fragile
and rude. **Worth an email asking whether they will license or expose a feed**; that is a human
conversation, not an engineering task, and it is the highest-value one available.

**thesportsmaps.com** publishes county-level CBS/FOX maps weekly. Same shape of problem.

**The paid sports APIs** — SportsDataIO, Sportradar, Goalserve — sell schedules, scores and the
*network* a game is on. DMA-level regional splits are generally not part of a standard NFL
package, and none of their public documentation advertises it. Needs a direct question to a sales
rep before anyone budgets for it. Do not assume the expensive option solves this.

**Gracenote/TMS listings** are the technically correct source: rather than predicting the map,
read what WTIC is actually scheduled to air at 1:00 pm. That inverts the problem and would also
answer the cable-channel-number gap. It is an enterprise product, and the public zap2it grid
behind it is unofficial.

**Manual entry** works today, costs nothing, depends on nobody, and is what the tooling above is
built for. It is also the only option that is unambiguously ours to run.

**Recommendation:** run manual entry this season while asking 506 Sports the licensing question.
The pipeline makes the manual path cheap enough to sustain, and every week of it produces a
correctness record that makes the licensing conversation easier to have.

## What is not built

- **No automated fetch of any source.** Deliberate: the adapter is worthless until the source
  question is answered, and a scraper written against a site we have not asked permission to
  scrape is not something to ship quietly.
- **Cross-flexes and late changes.** A map published Wednesday can move by Sunday. The feed has a
  `publishedAt` per week but the app does not yet surface how old the map is.
- **The feed only covers CBS and FOX Sunday afternoons.** That is where the ambiguity lives;
  every other window is national.
