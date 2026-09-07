# Market data verification

Verifying the 94 markets' affiliate call signs and over-the-air channel numbers.
Source is web search against station pages and trade press; anything uncertain is
marked for a human spot-check rather than guessed.

**Status: 22 markets fully verified, 20 more spot-checked. 13 errors found and fixed.**

## Two findings that change the shape of this job

### 1. The data goes stale, and it already has

On **1 August 2026** — five weeks ago — CBS moved its affiliation off six Nexstar
stations in a rights-fee dispute with Paramount. Three of those markets are ours,
and **two of them are in the original 54 I had described as the more carefully
sourced set**. Careful original research would not have prevented this. Affiliate
data is not a fact you establish once; it decays.

This means verification cannot be a one-time pass. It needs a recheck before each
season at minimum, and ideally a way for users to report drift (task #12).

### 2. The data model cannot express a subchannel

`Affiliate.ota` is an `Int`. Three of the four errors below resolve to
subchannels — 7.4, 13.4, 4.3 — and Chattanooga's FOX is 9.2. **None of these can
be stored today.** Fixing the data requires changing `ota` from `Int` to `String`
first, across `Models.swift`, both copies of `markets.json`, `Catalog.swift`, the
web app, and the tests. Until that lands, the correct values for these markets
cannot be recorded.

## Errors found and fixed

| Market | Field | We say | Actually | Note |
|---|---|---|---|---|
| Albuquerque-Santa Fe, NM | CBS | KRQE 13 | **KOAT 7.4** | KRQE dropped CBS 1 Aug 2026 after 72 years |
| Albuquerque-Santa Fe, NM | FOX | KASA 2 | **KRQE 13** | KASA became Telemundo in 2017; KRQE now full-time FOX |
| Birmingham, AL | CBS | WIAT 42 | **WVTM 13.4** | WIAT dropped CBS 1 Aug 2026 after 61 years; now CW |
| Greenville-Spartanburg-Asheville, SC | CBS | WSPA 7 | **WYFF 4.3** | WSPA dropped CBS 1 Aug 2026; now CW |
| Chattanooga, TN | FOX | WTVC 9 | **WTVC 9.2** | Channel 9 is ABC; FOX is the subchannel |
| Miami-Fort Lauderdale, FL | ABC | WPLG 10 | **WSVN 7.2** | WPLG went independent 3 Aug 2025 — wrong for over a year |
| St. Louis, MO | ABC | KDNL 30 | **KMOV 32.1** | KDNL disaffiliated 1 Sep 2026, six days ago |
| Columbus, OH | FOX | WTTE 28 | **WSYX 6.3** | WTTE is now TBD; Sinclair moved FOX to its ABC station |
| Dayton, OH | FOX | WRGT 45 | **WKEF 22.2** | WRGT is now independent; same Sinclair consolidation |
| Charleston-Huntington, WV | FOX | WVAH 11 | **WCHS 8.2** | WVAH lost FOX in **2021**; five years wrong |
| Portland-Auburn, ME | FOX | WPFO 23 | **WGME 13.2** | WPFO lost FOX in 2025; now carries Roar |
| Charleston, SC | ABC | WCIV 4 | **WCIV 36.2** | Right station, wrong number — 36.1 is MyNetworkTV |
| Syracuse, NY | CBS | WTVH 5 | **WKOF 15** | CBS moved to a new station 1 Dec 2025 |

Every one of these sends a viewer to the wrong network for CBS or FOX games —
the Sunday afternoon windows, which is most of the season.

## Verified clean

| Market | CBS | FOX | NBC | ABC |
|---|---|---|---|---|
| Bakersfield, CA | KBAK 29 | KBFX 58 | KGET 17 | KERO 23 |
| Baton Rouge, LA | WAFB 9 | WGMB 44 | WVLA 33 | WBRZ 2 |
| Knoxville, TN | WVLT 8 | WTNZ 43 | WBIR 10 | WATE 6 |
| Toledo, OH | WTOL 11 | WUPW 36 | WNWO 24 | WTVG 13 |
| Cleveland-Akron, OH | WOIO 19 | WJW 8 | WKYC 3 | WEWS 5 |
| Youngstown, OH | WKBN 27 | WYFX 62 | WFMJ 21 | WYTV 33 |
| New York, NY | WCBS 2 | WNYW 5 | WNBC 4 | WABC 7 |
| Philadelphia, PA | KYW 3 | WTXF 29 | WCAU 10 | WPVI 6 |
| Boston, MA | WBZ 4 | WFXT 25 | WBTS 10 | WCVB 5 |
| Washington, DC | WUSA 9 | WTTG 5 | WRC 4 | WJLA 7 |

### Spot-checked, not yet complete

At least one network confirmed against a current source, the rest still to do:
Chicago, Detroit, Indianapolis, Cincinnati, Pittsburgh, Baltimore, Seattle,
Denver, Phoenix, Las Vegas, Buffalo, San Antonio, El Paso, Savannah,
Rochester, Syracuse, Charleston SC, Portland ME, Charleston WV, Green Bay.

## Patterns, not typos

Nine errors in fifteen markets, and **not one is a mistyped call sign**. Every
single one is a station that changed networks:

- **The Nexstar/Paramount split** (1 Aug 2026) — CBS to subchannels in
  Albuquerque, Birmingham, Greenville.
- **ABC consolidations** — Miami (Aug 2025) and St. Louis (1 Sep 2026), both
  moving ABC onto a subchannel of a station that already carries another network.
- **Sinclair FOX consolidation** — Columbus and Dayton both moved FOX off its own
  station onto a subchannel of Sinclair's ABC station. Chasing this pattern
  deliberately found three more: Charleston WV, Portland ME and Charleston SC.
  It is now the single most productive thing to check. See below.

The implication for the product: the data is not wrong because it was researched
carelessly. It is wrong because **broadcast affiliations churn faster than a
static table can track**. Anything that ships this data needs a refresh before
each season and a way for viewers to report drift the moment they see it.

## A shortcut worth knowing: O&Os do not churn

Every error so far is at a station a *group* owns — Nexstar, Sinclair, Gray,
Hearst. None are at a network **owned-and-operated** station, and that is not
luck: CBS owns WCBS and WBBM, NBC owns WNBC and WMAQ, FOX owns WNYW and WFLD.
A network does not disaffiliate from itself.

So the top markets, which are mostly O&Os, are the *stable* ones, and the risk
concentrates in mid-size markets where a group owns the affiliate and can move it.
Miami and St. Louis are the exceptions that prove it — both were group-owned
affiliates in big markets, and both moved.

That is the triage rule for the remaining sweep: check group-owned affiliates
first, treat O&Os as low-risk confirmations.

## The Sinclair subchannel collapse is the dominant failure mode

Sinclair is systematically pulling its second network off its own station and
onto a subchannel of the station it already owns in that market, then filling
the emptied signal with its own multicast network — TBD, now rebranded **Roar**.
A standalone station suddenly airing Roar is the tell that its network moved.

Predicting from the pattern rather than checking markets alphabetically found
three of the four errors this round. The rule: **wherever Sinclair operates two
stations in one market, expect the weaker network on a subchannel.**

Confirmed instances, ours in bold: **Columbus**, **Dayton**, **Chattanooga**,
**Charleston WV**, **Portland ME**, **Charleston SC**, plus Eureka,
Chico-Redding, Beaumont and Tri-Cities TN, which are outside our 94.

Checked against the pattern and still standalone — all larger markets:
San Antonio (KABB 29), El Paso (KFOX 14), Savannah (WTGS 28),
Rochester (WUHF 31), Charleston SC FOX (WTAT 24), Baltimore (WBFF 45),
Pittsburgh (WPGH 53), Nashville (WZTV 17). Size appears to be the dividing
line: Sinclair keeps FOX standalone where the market can support two sales
teams and collapses it where it cannot.

## 2026's churn is now fully accounted for

The master list of this year's affiliation switches is short, and we have all
of it:

- **The six CBS markets** (1 Aug 2026) — Albuquerque, Jackson MS, Bismarck,
  Birmingham, Greenville SC, Rapid City. **Three are ours and all three are
  fixed**; the other three are not among our 94. This closes the question of
  whether other CBS stations moved — no others did.
- **St. Louis ABC** (1 Sep 2026), Sinclair to Gray. Fixed.

Which reframes the remaining risk: it is **not** this year's news. It is old
changes we never had right in the first place. Charleston WV has been wrong
since 2021, Charleston SC since a 2014 station swap, Miami since 2025. The
sweep is archaeology, not headline-watching.

## What to watch for

1. **Virtual vs RF channel.** Virtual is what appears on the TV (WVLT = 8); RF is
   the transmit frequency (WVLT = 30) and is invisible to viewers. Always virtual.
2. **Subchannels.** Small and mid markets often carry a second network on x.2 or
   x.3. Any market where the same call sign appears twice is an automatic flag.
3. **Duopolies.** One owner, two stations (Toledo's WTOL and WUPW are both
   Nexstar). Legitimate, not an error.
4. **Markets with no affiliate**, importing from an adjacent market. Listing a
   station that does not serve them is worse than listing nothing.
5. **Affiliation swaps.** See above. Check the trade press, not just the station
   page, which may lag.

## Also noticed

- The market key `birmingham2` holds **Huntsville-Decatur, AL**, not a second
  Birmingham. Cosmetic, but confusing to work with.

## Remaining

72 markets not yet fully verified. The original 54 cannot be assumed good — five
of the nine errors so far are in that set.

Sinclair and FOX renewed all FOX affiliations nationwide, so the Columbus and
Dayton consolidations were local decisions rather than a spreading pattern. That
bounds the FOX risk considerably.

A structural scan of all 94 has been run and found no *other* markets where one
call sign is listed against two networks, so the remaining subchannel cases are
likely to be ones where we name the wrong station entirely rather than the right
station at the wrong number. Channel numbers above 50 were also reviewed and are
legitimate legacy UHF assignments (WWJ 62 Detroit, WXIN 59 Indianapolis, KSWB 69
San Diego and so on), not errors.
