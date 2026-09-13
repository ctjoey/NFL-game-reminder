// Regional coverage engine: which CBS/FOX Sunday-afternoon game does a market receive?
//
// Rules, in order (each returns a confidence so the UI can be honest):
//   1. The coverage feed, or an editorial override, for (week, market, network, window)
//      -> confirmed. See coverageFeed.js: the feed is the published map, refreshed weekly and
//      fetched over the network so it reaches phones without an App Store release.
//   2. A game involving the market's own team(s)                        -> confirmed
//      (NFL rules require the home market to receive its team's game)
//   3. Only one candidate game on that network in that window            -> confirmed
//   4. A game involving a team in the market's affinity list             -> likely
//   5. Otherwise: the matchup from the biggest markets                    -> predicted
//
// There is deliberately no "national game" rule. ESPN flags most Sunday-afternoon games as
// nationally distributed, so the flag never identified the single game every market receives -
// and in the 1pm window no such game exists. A genuinely national window has one candidate and
// is caught by rule 3.
//
// Rule 5 replaces it with a signal that is actually about distribution: a network sends its
// biggest matchup to the most of the country, so the candidate whose teams come from the largest
// markets is the best available guess. It is labelled `predicted`, and a predicted pick is never
// allowed to tell anyone a game is *not* on their local station.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMarket } from '../market/marketService.js';
import { TEAMS } from '../schedule/teams.js';
import { loadFeed, feedOverrides } from './coverageFeed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let OVERRIDES = {};
try { OVERRIDES = JSON.parse(fs.readFileSync(path.join(here, 'overrides-2026.json'), 'utf8')).overrides || {}; } catch { OVERRIDES = {}; }

// The published feed wins over the checked-in editorial file: it is the fresher of the two, and
// the editorial file exists mainly as a floor for weeks the feed has not covered yet.
function withFeed(overrides, season = 2026) {
  const feed = feedOverrides(loadFeed(season));
  const weeks = new Set([...Object.keys(overrides || {}), ...Object.keys(feed)]);
  const out = {};
  for (const w of weeks) {
    out[w] = { ...(overrides?.[w] || {}) };
    for (const [market, nets] of Object.entries(feed[w] || {})) {
      out[w][market] = { ...(out[w][market] || {}) };
      for (const [net, windows] of Object.entries(nets)) out[w][market][net] = { ...(out[w][market][net] || {}), ...windows };
    }
  }
  return out;
}
OVERRIDES = withFeed(OVERRIDES);

export const REGIONAL_NETWORKS = ['CBS', 'FOX'];
export const REGIONAL_WINDOWS = ['SUN_EARLY', 'SUN_LATE'];

export function isRegional(game) {
  return REGIONAL_WINDOWS.includes(game.window) && (game.networks || []).some((n) => REGIONAL_NETWORKS.includes(n));
}

export function resolveWindowGame({ games, week, marketKey, network, window, overrides = OVERRIDES }) {
  const market = getMarket(marketKey);
  const candidates = games.filter((g) => g.week === week && g.window === window && (g.networks || []).includes(network));
  if (!candidates.length) return { game: null, confidence: 'unknown', reason: `No ${network} game in this window.` , candidates };

  const ov = overrides?.[String(week)]?.[marketKey]?.[network]?.[window];
  if (ov) {
    const g = candidates.find((c) => c.id === ov) || games.find((c) => c.id === ov);
    if (g) return { game: g, confidence: 'confirmed', reason: 'Published coverage map', candidates };
  }
  if (market) {
    for (const t of market.teams || []) {
      const g = candidates.find((c) => c.home === t || c.away === t);
      if (g) return { game: g, confidence: 'confirmed', reason: `${TEAMS[t]?.short || t} game always airs in ${market.name}`, candidates };
    }
  }
  if (candidates.length === 1) return { game: candidates[0], confidence: 'confirmed', reason: `Only ${network} game in this window`, candidates };
  if (market) {
    for (const t of market.affinity || []) {
      const g = candidates.find((c) => c.home === t || c.away === t);
      if (g) return { game: g, confidence: 'likely', reason: `${market.name} usually receives ${TEAMS[t]?.short || t} games`, candidates };
    }
  }
  const guess = predictWidestGame(candidates);
  if (guess) {
    return {
      game: guess,
      confidence: 'predicted',
      reason: `${network} has not published its regional map for this week; this is the matchup most markets get`,
      candidates,
    };
  }
  return { game: null, confidence: 'unknown', reason: `No ${network} game to show for this window.`, candidates };
}

/// The candidate a network is most likely to send widely: the one whose teams come from the
/// biggest markets. Ties break on the second market, then on id so the answer never wanders.
export function predictWidestGame(candidates) {
  const rankOf = (m) => getMarket(m)?.rank ?? 999;
  const key = (g) => {
    const r = [g.home, g.away].map((t) => rankOf(TEAMS[t]?.market)).sort((a, b) => a - b);
    return [r[0] ?? 999, r[1] ?? 999];
  };
  return [...candidates].sort((a, b) => {
    const ka = key(a); const kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || (a.id < b.id ? -1 : 1);
  })[0] || null;
}

// For a specific game and market: does it air there, and if not, what airs instead?
export function gameInMarket(game, marketKey, allGames, overrides = OVERRIDES) {
  if (!isRegional(game)) {
    return { airs: true, confidence: 'confirmed', reason: (game.exclusive ? `${game.exclusive} exclusive, available everywhere` : 'National broadcast'), instead: null };
  }
  const network = (game.networks || []).find((n) => REGIONAL_NETWORKS.includes(n));
  const r = resolveWindowGame({ games: allGames, week: game.week, marketKey, network, window: game.window, overrides });
  if (!r.game) return { airs: null, confidence: 'unknown', reason: r.reason, instead: null };
  const airs = r.game.id === game.id;
  const local = marketKey && [game.home, game.away].some((t) => TEAMS[t]?.market === marketKey);
  const other = `${TEAMS[r.game.away]?.short} at ${TEAMS[r.game.home]?.short}`;
  // Only a confirmed pick may say a game is NOT on the local station. Telling someone the wrong
  // thing is on sends them away from the right channel, so a guess stays a guess.
  if (!airs && r.confidence !== 'confirmed') {
    const lead = r.confidence === 'predicted'
      ? `Best guess: your market gets ${other} in this window`
      : `Your market usually receives ${other} in this window`;
    return {
      airs: null,
      confidence: r.confidence,
      reason: `${lead}, but ${network} regional maps change week to week. Check your local listings.`,
      instead: r.game,
      local,
    };
  }
  return {
    airs,
    confidence: r.confidence,
    reason: airs ? r.reason : `${network} in your market is showing ${other} in this window (${r.reason.toLowerCase()})`,
    instead: airs ? null : r.game,
    local,
    alternatives: airs ? [] : ['NFL Sunday Ticket (out-of-market games)', 'NFL+ (phone/tablet, not live out-of-market)'].slice(0, 1),
  };
}

export function overridesForTests() { return OVERRIDES; }
