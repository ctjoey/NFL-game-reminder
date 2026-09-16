# Getting found, with thirteen weeks left

**Written 16 September 2026**, the Tuesday of week 2, with the app live and essentially nobody
on it.

The constraint that shapes everything: an NFL utility has a **season, not a runway**. An install
in September gets used seventeen times. An install in January gets used twice. Anything whose
payoff arrives in six weeks has already lost most of its value, which is the lens the list below
is sorted through - not "what is the best marketing channel" but "what produces a download this
Sunday".

## The order, by how fast it can possibly work

### 1. Promotional text - today, no review, no version

The one App Store field that updates instantly. Everything else (subtitle, keywords, description)
is locked to a version submission. Rewrite it every Tuesday to name the coming weekend. Copy is
in `marketing/app-store-copy.md`.

This does not find anyone new on its own. It converts the people who already landed on the page,
which is worth doing before spending effort sending more of them there.

### 2. Go where the question is already being asked - today, free, highest yield

Every Sunday morning, in a dozen places, somebody types some version of *"what game am I getting
in Cleveland?"* That is not an audience to be persuaded; it is the exact question the app
answers. The places it gets asked:

- **r/nfl** game-day threads, **r/NFLv2**, **r/cordcutters**, **r/Antennas**
- The 32 team subreddits, which are more tolerant of a useful answer than r/nfl is
- Facebook groups for cord-cutting and for individual teams
- Twitter/X replies to the 506sports weekly map post, which is where people go to read the map

**The rule that matters:** answer the question first, in plain words, and mention the app second
or not at all. A comment that says "you're getting Falcons-Steelers on WTIC 61, coverage starts
at 1:00" earns the right to add "I built a thing that does this". A comment that is only a link
gets removed, and in some subs gets the domain banned. Ten real answers beat a hundred drops.

This is unglamorous and it is the single fastest lever available. It costs an hour on Sunday
morning.

### 3. Ship 1.0.2, carrying the keyword rewrite - two to three days

Keywords and subtitle only go live with a version. 1.0.2 is going out anyway for the URL scheme,
so the ASO rewrite rides along rather than becoming its own errand. Both are drafted in
`marketing/app-store-copy.md`.

The keyword set is built around the phrasing people actually use - *what game is on*, *nfl tv
schedule*, *nfl channel* - rather than around the product's own vocabulary. Nobody searches for
"coverage map".

Update review has been running about eighteen hours, so submitting Tuesday means live Wednesday.

### 4. In-App Events - submit Monday, live the weekend after

Worth doing, and worth doing *fourth*. Events appear in search results and on the product page,
and on the Today tab only if Apple features them. For an app with no installs that mostly means
better conversion of traffic that steps 1-3 produce, not new traffic by itself. The multi-day
review loop also makes it structurally incapable of being the fast lever.

Set up and copy: `marketing/in-app-events.md`. Art: `marketing/event-art/`.

### 5. Sharing - already shipped

The share sheet went into Settings in 1.0.1. Every shared link is a recommendation from a friend,
which converts better than anything above. It needs installs to compound, so it follows them
rather than leading.

## What is not worth doing right now

**Paid ads.** Apple Search Ads on "nfl tv schedule" competes with NFL, ESPN and the carriers. A
budget that does not embarrass itself in that auction is not a budget this app has, and a small
budget buys a statistically meaningless number of installs.

**A press push.** A free single-league utility is not a story. It becomes one when it has a
number attached - installs, or markets corrected, or a season of accuracy - which is a reason to
keep the coverage-map record, not a reason to email anyone in September.

**The rename.** GameDial is a better name and the reposition is right, but a rename mid-season
resets whatever search ranking has accumulated and costs a review cycle. February.

## The measurement that actually tells you something

App Store Connect's **Analytics → Sources** splits impressions into App Store search versus
referrals. Check it each Tuesday. If search impressions climb but installs do not, the problem is
the product page and the answer is step 1. If neither climbs, the problem is that nobody knows the
app exists and the answer is step 2. Those are different problems and they look identical from
the install count alone.
