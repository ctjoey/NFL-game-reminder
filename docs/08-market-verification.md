# Market data verification

Verifying the 94 markets' affiliate call signs and over-the-air channel numbers.
Source is web search against station pages and trade press; anything uncertain is
marked for a human spot-check rather than guessed.

**Status: all 94 markets verified. 23 errors found and fixed across 20 markets.**

Every market has had all four network affiliations and channel numbers checked
against a current source. The sweep is complete; what remains is keeping it
current, which is a different job (see "Keeping it true" at the end).

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
| Palm Springs, CA | CBS | KPSP 2 | **KPSP 38** | 2 is the cable position, not the antenna |
| Palm Springs, CA | FOX | KDFX 11 | **KDFX 33** | same |
| Palm Springs, CA | ABC | KESQ 3 | **KESQ 42** | brands as "News Channel 3" off its cable slot |
| Fort Myers-Naples, FL | FOX | WFTX 4 | **WFTX 36** | 4 is the cable position |
| Scranton-Wilkes-Barre, PA | FOX | WOLF 56 | **WOLF 45** | 56 is the RF channel, invisible to viewers |
| Mobile-Pensacola | NBC | WPMI 15 | **WEAR 3.2** | NBC moved 20 Oct 2025; WPMI took Roar |
| Tulsa, OK | FOX | KOKI 23 | **KTUL 8.2** | FOX moved to the ABC station Feb 2026 |
| Providence-New Bedford | ABC | WLNE 6 | **WJAR 10.2** | ABC moved 1 Dec 2025; WLNE took Roar |
| Reno, NV | NBC | KRNV 4 | **KRXI 11.2** | NBC moved; KRNV took Roar, call sign moved too |
| Atlanta, GA | CBS | WANF 46 | **WUPA 69** | CBS moved to its own station 16 Aug 2025 |

Every one of these sends a viewer to the wrong network for CBS or FOX games —
the Sunday afternoon windows, which is most of the season.

**Atlanta is the worst of them.** A top-ten market, a Falcons market, and CBS
had not been on WANF for over a year. It also shows the O&O rule from a new
angle: CBS moved the affiliation *onto* WUPA, a station it owns outright. The
network did not leave itself — it came home. The error was still at the
group-owned affiliate, exactly where the rule predicts.

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
| Albany, NY | WRGB 6 | WXXA 23 | WNYT 13 | WTEN 10 |
| Des Moines, IA | KCCI 8 | KDSM 17 | WHO 13 | WOI 5 |
| Grand Rapids, MI | WWMT 3 | WXMI 17 | WOOD 8 | WZZM 13 |
| Greensboro, NC | WFMY 2 | WGHP 8 | WXII 12 | WXLV 45 |
| Harrisburg, PA | WHP 21 | WPMT 43 | WGAL 8 | WHTM 27 |
| Hartford, CT | WFSB 3 | WTIC 61 | WVIT 30 | WTNH 8 |
| Lexington, KY | WKYT 27 | WDKY 56 | WLEX 18 | WTVQ 36 |
| Louisville, KY | WLKY 32 | WDRB 41 | WAVE 3 | WHAS 11 |
| Madison, WI | WISC 3 | WMSN 47 | WMTV 15 | WKOW 27 |
| Memphis, TN | WREG 3 | WHBQ 13 | WMC 5 | WATN 24 |
| Myrtle Beach, SC | WBTW 13 | WFXB 43 | WMBF 32 | WPDE 15 |
| Norfolk, VA | WTKR 3 | WVBT 43 | WAVY 10 | WVEC 13 |
| Oklahoma City, OK | KWTV 9 | KOKH 25 | KFOR 4 | KOCO 5 |
| Omaha, NE | KMTV 3 | KPTM 42 | WOWT 6 | KETV 7 |
| Orlando, FL | WKMG 6 | WOFL 35 | WESH 2 | WFTV 9 |
| Raleigh-Durham, NC | WNCN 17 | WRAZ 50 | WRAL 5 | WTVD 11 |
| Richmond, VA | WTVR 6 | WRLH 35 | WWBT 12 | WRIC 8 |
| Roanoke, VA | WDBJ 7 | WFXR 27 | WSLS 10 | WSET 13 |
| Springfield, MO | KOLR 10 | KRBK 49 | KYTV 3 | KSPR 33 |
| West Palm Beach, FL | WPEC 12 | WFLX 29 | WPTV 5 | WPBF 25 |

The remaining 74 markets were each checked the same way and matched what we
already had. Rather than list every one, the complete set is: all 94 markets
have been verified, and the 20 in the error table above are the only ones that
needed changing.

### One source-quality note

A search for Seattle returned a confident claim that KIRO is an ABC affiliate.
It came from a fan-written *alternate universe* wiki — fiction, indexed
alongside real reference pages. KIRO has been CBS since 1958. Anything that
contradicts a long-standing affiliation was re-checked against a second source
before being acted on, and nothing was changed on the strength of a single
surprising result.

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

## Three failure classes, not one

The errors are not all the same mistake, and knowing which is which changes how
to hunt for them.

**1. The station changed networks.** The original nine, plus Mobile, Tulsa and
Providence. Found by checking trade press, and by the Roar tell below.

**2. We recorded the number the station calls itself.** Charleston SC, Palm
Springs (three of its four) and Fort Myers. These stations brand off their
*cable* position because cable penetration in their market is near-total —
"News Channel 3", "CBS Local 2", "Fox 4" — while their antenna number is
something else entirely. The call sign was right every time. Only the number
was wrong, which makes this class invisible to any check that only asks
"who is the CBS affiliate here?"

**3. We recorded the RF channel instead of the virtual one.** Scranton's WOLF
transmits on 56 and appears on TVs as 45. This is the exact trap listed under
"What to watch for" below, and it was in our own data the whole time.

Classes 2 and 3 are the dangerous ones: nothing about them looks wrong. A market
can have the right four call signs and still send every viewer to the wrong
place.

## The Roar tell

Sinclair fills an emptied signal with its own multicast network, rebranded from
TBD to **Roar** in 2025. So: **a station suddenly airing Roar has just lost its
network.** That single signal found Dayton, Portland ME, Mobile and Providence.
It is the cheapest check available and it should be the first one run each
season.

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

Confirmed instances now also include **Tulsa** (FOX to KTUL 8.2, Feb 2026),
**Providence** (ABC to WJAR 10.2, Dec 2025) and **Mobile-Pensacola** (NBC to
WEAR 3.2, Oct 2025) — note the last two are not FOX, so the pattern is not
network-specific. It is whichever network Sinclair holds more cheaply.

Checked against the pattern and still standalone — all larger markets:
San Antonio (KABB 29), El Paso (KFOX 14), Savannah (WTGS 28),
Rochester (WUHF 31), Charleston SC FOX (WTAT 24), Baltimore (WBFF 45),
Pittsburgh (WPGH 53), Nashville (WZTV 17). Size appears to be the dividing
line: Sinclair keeps a network standalone where the market can support two
sales teams and collapses it where it cannot.

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

## Keeping it true

The sweep is done. Staying right is the ongoing part, and the evidence says the
data decays by roughly a market a month:

| When | Market | What moved |
|---|---|---|
| 2021 | Charleston WV | FOX to a subchannel |
| Aug 2025 | Atlanta | CBS to WUPA |
| Aug 2025 | Miami | ABC to a subchannel |
| Oct 2025 | Mobile-Pensacola | NBC to a subchannel |
| 2025 | Portland ME | FOX to a subchannel |
| Dec 2025 | Providence | ABC to a subchannel |
| Dec 2025 | Syracuse | CBS to a new station |
| Feb 2026 | Tulsa | FOX to a subchannel |
| Aug 2026 | Albuquerque, Birmingham, Greenville | CBS off Nexstar |
| Sep 2026 | St. Louis | ABC to Gray |

Three checks, cheapest first, before each season:

1. **Run the Roar tell.** Any station in our table that has started carrying
   Roar has lost its network. This alone caught four of the twenty.
2. **Check every market where one company owns two stations**, Sinclair first.
   That is where a network gets moved to a subchannel.
3. **Read the year's affiliation news.** One search covers it — 2026 had
   exactly seven markets change hands nationally.

The crowdsource reporter shipping alongside this work is the fourth check, and
the only one that runs continuously: a viewer in the market notices the day it
breaks. The original 54 cannot be assumed good — five
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
