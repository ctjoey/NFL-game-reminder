#!/usr/bin/env node
// Weekly coverage-map chore, made small.
//
//   node server/coverage/feed-cli.js template --week 3 > draft.json
//   ...fill in each "choose" from the published map...
//   node server/coverage/feed-cli.js apply --week 3 --file draft.json --source "506sports 2026-09-24"
//   node server/coverage/feed-cli.js validate
//   node server/coverage/feed-cli.js status
//   node server/coverage/feed-cli.js check          # non-zero if the upcoming week has no map
//
// Coverage maps are drawn game-by-region, not market-by-market: one game covers a swathe of the
// country. So the fast way to enter a week is one assign per game, with "rest" for the game that
// takes everywhere the map has not already spoken for:
//
//   node server/coverage/feed-cli.js assign --week 3 --network FOX --window SUN_EARLY \
//     --game 2026-W03-ATL-PIT --markets pittsburgh,hartford,youngstown --source "506sports"
//   node server/coverage/feed-cli.js assign --week 3 --network FOX --window SUN_EARLY \
//     --game 2026-W03-TB-CIN --markets rest --source "506sports"
//
// "rest" is still data entry, not a guess: use it only when the map really does give one game to
// everywhere left over.
//
// The template only lists slots the rule engine cannot already answer, so a week where every
// market has a local team or a single candidate asks for nothing. Apply refuses to write a feed
// that does not validate, because the whole point of the feed is that its entries are trusted.
import fs from 'node:fs';
import { loadSeed } from '../schedule/scheduleService.js';
import { resolveWindowGame } from './coverageService.js';
import { loadFeed, saveFeed, validateFeed, openSlots, emptyFeed, feedPath, FEED_WINDOWS } from './coverageFeed.js';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const season = Number(flag('season', 2026));
const die = (msg) => { console.error(msg); process.exit(1); };

// Games come from the checked-in seed by default. Pass --games to point at a file pulled from a
// live source, which is how CI runs this against the real schedule.
function games() {
  const file = flag('games');
  if (!file) return loadSeed(season);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(raw) ? raw : raw.games || [];
}

function template() {
  const week = Number(flag('week') ?? die('--week is required'));
  const gs = games();
  // Resolve against a feed that does not yet include this week, so already-published entries do
  // not hide slots a re-run should still ask about.
  const slots = openSlots(gs, week, (a) => resolveWindowGame({ ...a, overrides: {} }));
  const title = (id) => { const g = gs.find((x) => x.id === id); return g ? `${g.away} at ${g.home}` : id; };
  process.stdout.write(`${JSON.stringify({
    week,
    season,
    source: '',
    note: 'Set "choose" on each slot to one of its candidates. Leave blank to skip - a blank slot stays a guess in the app, which is the correct outcome when the map does not say.',
    slots: slots.map((s) => ({ ...s, choose: '', candidateTitles: s.candidates.map(title) })),
  }, null, 2)}\n`);
  console.error(`${slots.length} open slot(s) for week ${week}. Windows the engine already resolves are not listed.`);
}

function apply() {
  const file = flag('file') ?? die('--file is required');
  const draft = JSON.parse(fs.readFileSync(file, 'utf8'));
  const week = Number(flag('week', draft.week) ?? die('--week is required'));
  const source = flag('source', draft.source) || die('--source is required: an entry nobody can trace is an entry nobody can fix');

  const feed = loadFeed(season);
  if (!feed.weeks) feed.weeks = {};
  const markets = { ...(feed.weeks[week]?.markets || {}) };
  let added = 0;
  for (const s of draft.slots || []) {
    if (!s.choose) continue;
    if (s.candidates && !s.candidates.includes(s.choose)) die(`${s.market} ${s.network} ${s.window}: "${s.choose}" is not one of the candidates`);
    markets[s.market] = { ...(markets[s.market] || {}) };
    markets[s.market][s.network] = { ...(markets[s.market][s.network] || {}), [s.window]: s.choose };
    added += 1;
  }
  feed.weeks[week] = { source, publishedAt: new Date().toISOString(), markets };
  feed.generatedAt = new Date().toISOString();

  const v = validateFeed(feed, games());
  if (!v.ok) { console.error(v.errors.map((e) => `  ${e}`).join('\n')); die(`Refusing to write: ${v.errors.length} problem(s).`); }
  console.log(`Wrote ${added} entr(ies) for week ${week} to ${saveFeed(feed)} (${v.stats.entries} total).`);
}

/// Assign one game to many markets at once - the shape a coverage map is actually published in.
function assign() {
  const week = Number(flag('week') ?? die('--week is required'));
  const network = flag('network') ?? die('--network is required (CBS or FOX)');
  const window = flag('window') ?? die(`--window is required (${FEED_WINDOWS.join(' or ')})`);
  const gameId = flag('game') ?? die('--game is required');
  const list = flag('markets') ?? die('--markets is required: a comma-separated list, or "rest"');
  const source = flag('source') ?? die('--source is required: an entry nobody can trace is an entry nobody can fix');
  const gs = games();

  const feed = loadFeed(season);
  if (!feed.weeks) feed.weeks = {};
  const markets = { ...(feed.weeks[week]?.markets || {}) };

  let targets;
  if (list === 'rest') {
    // Everywhere the map has not already spoken for in this window, and only where there was a
    // genuine choice to make - markets the rules already pin down are left to the rules.
    targets = openSlots(gs, week, (a) => resolveWindowGame({ ...a, overrides: {} }))
      .filter((s) => s.network === network && s.window === window)
      .map((s) => s.market)
      .filter((m) => !markets[m]?.[network]?.[window]);
  } else {
    targets = list.split(',').map((m) => m.trim()).filter(Boolean);
  }
  if (!targets.length) die('No markets to assign. Every slot in this window is already published or already resolved by rule.');

  for (const m of targets) {
    markets[m] = { ...(markets[m] || {}) };
    markets[m][network] = { ...(markets[m][network] || {}), [window]: gameId };
  }
  feed.weeks[week] = { source, publishedAt: new Date().toISOString(), markets: { ...(feed.weeks[week]?.markets || {}), ...markets } };
  feed.generatedAt = new Date().toISOString();

  const v = validateFeed(feed, gs);
  if (!v.ok) { console.error(v.errors.slice(0, 20).map((e) => `  ${e}`).join('\n')); die(`Refusing to write: ${v.errors.length} problem(s).`); }
  saveFeed(feed);
  console.log(`${gameId} -> ${targets.length} market(s) for week ${week} ${network} ${window}. Feed now holds ${v.stats.entries} entr(ies).`);
}

function validate() {
  const feed = loadFeed(season);
  const v = validateFeed(feed, games());
  if (!v.ok) { console.error(v.errors.map((e) => `  ${e}`).join('\n')); die(`${v.errors.length} problem(s) in ${feedPath(season)}.`); }
  console.log(`Feed is valid: ${v.stats.entries} entr(ies) across ${Object.keys(feed.weeks || {}).length} week(s).`);
}

function status() {
  const feed = loadFeed(season);
  const gs = games();
  const weeks = Object.keys(feed.weeks || {}).map(Number).sort((a, b) => a - b);
  if (!weeks.length) { console.log(`No weeks published yet in ${feedPath(season)}.`); return; }
  for (const w of weeks) {
    const open = openSlots(gs, w, (a) => resolveWindowGame({ ...a, overrides: {} })).length;
    const filled = Object.values(feed.weeks[w].markets || {}).reduce((n, nets) => n + Object.values(nets).reduce((m, wins) => m + Object.keys(wins).length, 0), 0);
    const pct = open ? Math.round((filled / open) * 100) : 100;
    console.log(`week ${String(w).padStart(2)}  ${String(filled).padStart(4)}/${String(open).padEnd(4)} open slots filled (${pct}%)  source: ${feed.weeks[w].source}`);
  }
}

/// The week the app is about to need: the one containing today, else the next one to kick off.
function currentWeek(gs = games(), now = new Date()) {
  const weeks = [...new Set(gs.map((g) => g.week))].sort((a, b) => a - b);
  for (const w of weeks) {
    const kicks = gs.filter((g) => g.week === w).map((g) => new Date(g.kickoff));
    const last = new Date(Math.max(...kicks));
    if (now <= new Date(last.getTime() + 6 * 3600 * 1000)) return w;
  }
  return weeks[weeks.length - 1] ?? 1;
}

/// Pull the real schedule from the live source and write it out, so `check` and `status` can be
/// run against the actual slate. The checked-in seed is a placeholder with one CBS and one FOX
/// game per Sunday window; every window in it resolves by the "only candidate" rule, so a check
/// run against it reports no ambiguity for weeks that are in fact nothing but ambiguity.
async function fetchLive() {
  const out = flag('out') ?? die('--out is required');
  const { fetchSeason } = await import('../schedule/espnAdapter.js');
  const gs = await fetchSeason(season);
  if (!gs.length) die('live source returned no games');
  fs.writeFileSync(out, JSON.stringify({ season, fetchedAt: new Date().toISOString(), games: gs }, null, 2));
  console.log(`Wrote ${gs.length} live games for ${season} to ${out}.`);
}

/// A real NFL week has thirteen or so Sunday-afternoon games across CBS and FOX. Far fewer means
/// we are looking at the seed, and any answer about ambiguity is about the placeholder rather than
/// about the season - which is worse than no answer, because it comes back green.
const SUNDAY = ['SUN_EARLY', 'SUN_LATE'];
function looksLikeSeed(gs, week) {
  return gs.filter((g) => g.week === week && SUNDAY.includes(g.window)).length < 8;
}

/// The nag. A week with open slots and no published map is the state that produced the bug this
/// whole pipeline exists to prevent, so it fails loudly rather than printing a warning nobody reads.
function check() {
  const gs = games();
  const week = Number(flag('week', currentWeek(gs)));
  const feed = loadFeed(season);
  if (looksLikeSeed(gs, week)) {
    die(`Week ${week} has only ${gs.filter((g) => g.week === week && SUNDAY.includes(g.window)).length} Sunday-afternoon games, so this is the seed, not the real slate. `
      + 'Pass --games from a live pull: node server/coverage/feed-cli.js fetch --out games.json');
  }
  const open = openSlots(gs, week, (a) => resolveWindowGame({ ...a, overrides: {} }));
  const filled = Object.values(feed.weeks?.[week]?.markets || {})
    .reduce((n, nets) => n + Object.values(nets).reduce((m, wins) => m + Object.keys(wins).length, 0), 0);
  if (!open.length) { console.log(`Week ${week}: nothing ambiguous to publish.`); return; }
  console.log(`Week ${week}: ${filled}/${open.length} ambiguous slots have a published map.`);
  if (!filled) die(`No coverage map published for week ${week}. Run: node server/coverage/feed-cli.js template --week ${week}`);
}

function week() { console.log(currentWeek()); }

const commands = { template, apply, assign, validate, status, check, week, fetch: fetchLive };
if (!commands[cmd]) die(`usage: feed-cli.js <${Object.keys(commands).join('|')}> [--week N] [--file draft.json] [--source "..."] [--games games.json] [--out games.json] [--season 2026]`);
// fetch is async; without this its rejection would print a warning and still exit 0.
Promise.resolve(commands[cmd]()).catch((e) => die(e.stack || e.message));
