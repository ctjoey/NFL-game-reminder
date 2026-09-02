// Regional coverage engine: which CBS/FOX Sunday-afternoon game does a market receive?
//
// Rules, in order (each returns a confidence so the UI can be honest):
//   1. Editorial override for (week, market, network, window)          -> confirmed
//   2. A game involving the market's own team(s)                        -> confirmed
//      (NFL rules require the home market to receive its team's game)
//   3. Only one candidate game on that network in that window            -> confirmed
//   4. A game involving a team in the market's affinity list             -> likely
//   5. The network's designated national game for the window            -> likely
//   6. Otherwise: the first candidate, flagged                           -> unknown
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMarket } from '../market/marketService.js';
import { TEAMS } from '../schedule/teams.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let OVERRIDES = {};
try { OVERRIDES = JSON.parse(fs.readFileSync(path.join(here, 'overrides-2026.json'), 'utf8')).overrides || {}; } catch { OVERRIDES = {}; }

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
  const nat = candidates.find((c) => c.national);
  if (nat) return { game: nat, confidence: 'likely', reason: `${network}'s national game this window`, candidates };
  return { game: candidates[0], confidence: 'unknown', reason: 'Regional assignment not published yet; check local listings', candidates };
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
  return {
    airs,
    confidence: r.confidence,
    reason: airs ? r.reason : `${network} in your market is showing ${TEAMS[r.game.away]?.short} at ${TEAMS[r.game.home]?.short} in this window (${r.reason.toLowerCase()})`,
    instead: airs ? null : r.game,
    local,
    alternatives: airs ? [] : ['NFL Sunday Ticket (out-of-market games)', 'NFL+ (phone/tablet, not live out-of-market)'].slice(0, 1),
  };
}

export function overridesForTests() { return OVERRIDES; }
