import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSeason } from './espnAdapter.js';
import { inferWindow } from './windows.js';
import { dayKey, ET } from '../util/time.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadSeed(season = 2026) {
  const file = path.join(here, `seed-${season}.json`);
  const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return seed.games.map((g) => ({ ...g, source: 'seed', window: g.window || inferWindow(g.kickoff, g.streams || []) }));
}

export function matchKey(g) {
  // Match games across sources by week + the pair of teams (order-independent, in case a feed
  // flips home/away for neutral-site games).
  return `${g.week}:${[g.away, g.home].sort().join('-')}`;
}

const TRACKED = ['kickoff', 'networks', 'streams', 'home', 'away', 'exclusive'];
function same(a, b) { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }

// Compare two lists and return user-meaningful change events.
export function diffGames(oldGames, newGames) {
  const changes = [];
  const oldBy = new Map(oldGames.map((g) => [matchKey(g), g]));
  const newBy = new Map(newGames.map((g) => [matchKey(g), g]));
  const at = new Date().toISOString();
  for (const [k, n] of newBy) {
    const o = oldBy.get(k);
    if (!o) { changes.push({ at, type: 'added', key: k, gameId: n.id, game: n }); continue; }
    for (const f of TRACKED) {
      if (!same(o[f], n[f])) {
        let type = f === 'kickoff' ? 'time' : (f === 'networks' || f === 'streams' || f === 'exclusive') ? 'network' : 'teams';
        if (f === 'kickoff' && dayKey(o.kickoff, ET) !== dayKey(n.kickoff, ET)) type = 'date';
        changes.push({ at, type, field: f, key: k, gameId: n.id, old: o[f], new: n[f], game: n, previous: o });
      }
    }
  }
  for (const [k, o] of oldBy) if (!newBy.has(k)) changes.push({ at, type: 'removed', key: k, gameId: o.id, game: o });
  return changes;
}

export class ScheduleService {
  constructor({ db, season = 2026, source = process.env.SCHEDULE_SOURCE || 'espn', fetchImpl = fetch, logger = console } = {}) {
    this.db = db; this.season = season; this.source = source; this.fetchImpl = fetchImpl; this.log = logger;
    this.games = [];
    this.meta = { source: 'seed', lastSync: null, lastError: null };
    this.listeners = [];
    this.load();
  }
  onChange(fn) { this.listeners.push(fn); }
  load() {
    const cached = this.db?.getSchedule();
    if (cached?.season === this.season && Array.isArray(cached.games) && cached.games.length) {
      this.games = cached.games; this.meta = { ...this.meta, ...cached.meta };
    } else {
      this.games = loadSeed(this.season);
      this.meta = { source: 'seed', lastSync: null, lastError: null, seedNote: 'Offline seed; partial until first live sync.' };
    }
  }
  all() { return this.games; }
  week(n) { return this.games.filter((g) => g.week === Number(n)).sort((a, b) => a.kickoff.localeCompare(b.kickoff)); }
  byId(id) { return this.games.find((g) => g.id === id) || null; }
  weeks() { return [...new Set(this.games.map((g) => g.week))].sort((a, b) => a - b); }
  // The week to show by default: the first week that still has a game not yet over (kickoff + 4h).
  currentWeek(now = new Date()) {
    const t = now.getTime();
    for (const w of this.weeks()) {
      const last = Math.max(...this.week(w).map((g) => new Date(g.kickoff).getTime()));
      if (last + 4 * 3600 * 1000 > t) return w;
    }
    return this.weeks().at(-1) || 1;
  }
  applyGames(games, sourceName) {
    const changes = diffGames(this.games, games);
    // Keep seed-only games (weeks the live feed didn't return) so nothing disappears if a fetch is partial.
    const liveKeys = new Set(games.map(matchKey));
    const liveWeeks = new Set(games.map((g) => g.week));
    const kept = this.games.filter((g) => !liveKeys.has(matchKey(g)) && !liveWeeks.has(g.week));
    this.games = [...games, ...kept].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    this.meta = { ...this.meta, source: sourceName, lastSync: new Date().toISOString(), lastError: null };
    this.db?.setSchedule({ season: this.season, games: this.games, meta: this.meta });
    const meaningful = changes.filter((c) => c.type !== 'added' && c.type !== 'removed');
    if (meaningful.length) this.db?.addChanges(meaningful.map(({ game, previous, ...rest }) => rest));
    for (const fn of this.listeners) { try { fn(changes); } catch (e) { this.log.error('[schedule] listener failed', e); } }
    return changes;
  }
  async sync() {
    if (this.source === 'seed') { this.meta.lastSync = new Date().toISOString(); return []; }
    try {
      const games = await fetchSeason(this.season, { fetchImpl: this.fetchImpl });
      if (!games.length) throw new Error('live source returned no games');
      const changes = this.applyGames(games, 'espn');
      this.log.log(`[schedule] synced ${games.length} games from ESPN; ${changes.length} change(s)`);
      return changes;
    } catch (e) {
      this.meta.lastError = `${new Date().toISOString()} ${e.message}`;
      this.log.warn(`[schedule] live sync failed (${e.message}); keeping ${this.meta.source} data`);
      return [];
    }
  }
}
