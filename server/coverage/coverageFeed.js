// The coverage feed: which CBS/FOX game each market actually receives, per week.
//
// The rule engine can only ever guess at a regional window. This file is the place where a
// known answer lives, and everything in it is treated as confirmed - so nothing may enter it
// that has not been read off a published coverage map or verified some other way. A guess
// promoted to "confirmed" is worse than no entry at all, which is why validate() rejects a
// feed rather than repairing one.
//
// The app fetches this over the network so a Wednesday map reaches phones without an App Store
// release. The copy bundled in the app is the floor, not the source of truth.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listMarkets } from '../market/marketService.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export const FEED_VERSION = 1;
export const FEED_NETWORKS = ['CBS', 'FOX'];
export const FEED_WINDOWS = ['SUN_EARLY', 'SUN_LATE'];

/// "This market gets no game at all in this window."
///
/// On a single-header week one network carries a single round of games, so most of the country has
/// nothing on CBS at 4:25. Without a way to say that, the feed's only options were to name a game
/// that is not on - the engine would fall through to a prediction and offer one - or to stay silent
/// and let it predict anyway. Both put a phantom game on the screen.
///
/// Older app builds do not know this value: they look for a game with this id, find none, and fall
/// back to the same prediction they make today. So publishing it is safe before the app ships.
export const NO_GAME = 'none';

export function emptyFeed(season = 2026) {
  return { version: FEED_VERSION, season, generatedAt: new Date().toISOString(), weeks: {} };
}

// GitHub Pages serves the docs/ directory (that is where .nojekyll sits), so a file written here
// is reachable at <pages-root>/coverage-<season>.json with no build step and no hosting bill.
// CI checks the live URL on every run rather than trusting that claim.
export function feedPath(season = 2026) {
  return path.join(here, '..', '..', 'docs', `coverage-${season}.json`);
}

export function loadFeed(season = 2026, file = feedPath(season)) {
  try {
    const feed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return feed?.version === FEED_VERSION && feed.season === season ? feed : emptyFeed(season);
  } catch {
    return emptyFeed(season);
  }
}

export function saveFeed(feed, file = feedPath(feed.season)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(feed, null, 2)}\n`);
  return file;
}

/// Feed entries are read as overrides, which the engine already reports as confirmed.
export function feedOverrides(feed) {
  const out = {};
  for (const [week, w] of Object.entries(feed?.weeks || {})) out[week] = w.markets || {};
  return out;
}

/// A game is only nameable in the feed if it is a real regional candidate that week. This is the
/// check that stops a typo, a stale id or a misread map from being published as fact.
export function validateFeed(feed, games) {
  const errors = [];
  const warnings = [];
  const marketKeys = new Set(listMarkets().map((m) => m.key ?? m.id));
  let entries = 0;

  if (!feed || typeof feed !== 'object') return { ok: false, errors: ['feed is not an object'], warnings, stats: { entries: 0 } };
  if (feed.version !== FEED_VERSION) errors.push(`version must be ${FEED_VERSION}, got ${feed.version}`);
  if (!Number.isInteger(feed.season)) errors.push('season must be an integer');

  for (const [week, w] of Object.entries(feed.weeks || {})) {
    const n = Number(week);
    if (!Number.isInteger(n) || n < 1 || n > 23) { errors.push(`week "${week}" is not a valid week number`); continue; }
    if (w.source == null || `${w.source}`.trim() === '') errors.push(`week ${week}: source is required, so a wrong entry can be traced back`);

    for (const [market, nets] of Object.entries(w.markets || {})) {
      if (!marketKeys.has(market)) { errors.push(`week ${week}: unknown market "${market}"`); continue; }
      for (const [network, windows] of Object.entries(nets || {})) {
        if (!FEED_NETWORKS.includes(network)) { errors.push(`week ${week} ${market}: "${network}" is not a regional network`); continue; }
        for (const [window, gameId] of Object.entries(windows || {})) {
          if (!FEED_WINDOWS.includes(window)) { errors.push(`week ${week} ${market} ${network}: "${window}" is not a regional window`); continue; }
          entries += 1;
          if (gameId === NO_GAME) continue;   // a deliberate "nothing airs here", not a game id
          const game = games.find((g) => g.id === gameId);
          if (!game) { errors.push(`week ${week} ${market} ${network} ${window}: no game "${gameId}" in the schedule`); continue; }
          if (game.week !== n) errors.push(`week ${week} ${market} ${network} ${window}: ${gameId} is a week ${game.week} game`);
          if (game.window !== window) errors.push(`week ${week} ${market} ${network} ${window}: ${gameId} is in the ${game.window} window`);
          if (!(game.networks || []).includes(network)) errors.push(`week ${week} ${market} ${network} ${window}: ${gameId} is not on ${network}`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings, stats: { entries } };
}

/// Which (market, network, window) slots does the rule engine already answer on its own, and
/// which need a human to read the map? Only the unresolved ones are worth anyone's Wednesday.
export function openSlots(games, week, resolve) {
  const open = [];
  for (const m of listMarkets()) {
    const key = m.key ?? m.id;
    for (const network of FEED_NETWORKS) {
      for (const window of FEED_WINDOWS) {
        const candidates = games.filter((g) => g.week === week && g.window === window && (g.networks || []).includes(network));
        if (candidates.length < 2) continue; // nothing to choose between
        const r = resolve({ games, week, marketKey: key, network, window });
        if (r.confidence === 'confirmed') continue;
        open.push({ market: key, name: m.name, network, window, candidates: candidates.map((c) => c.id) });
      }
    }
  }
  return open;
}
