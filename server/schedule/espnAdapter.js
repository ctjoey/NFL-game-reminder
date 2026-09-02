// Live schedule adapter for ESPN's public (unofficial) scoreboard JSON.
// Endpoint: https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=YYYY&seasontype=2&week=N
// It carries date/time, teams, TV/streaming broadcasts and whether a broadcast is national or
// regional, which is exactly what we need. Nothing here is authenticated.
import { normalizeTeam } from './teams.js';
import { inferWindow } from './windows.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const NETWORK_MAP = {
  'CBS': 'CBS', 'FOX': 'FOX', 'NBC': 'NBC', 'ABC': 'ABC', 'ESPN': 'ESPN', 'ESPN2': 'ESPN2',
  'NFL NET': 'NFLN', 'NFL NETWORK': 'NFLN', 'NFLN': 'NFLN',
  'PRIME VIDEO': 'Prime', 'AMAZON PRIME': 'Prime', 'AMAZON': 'Prime', 'PRIME': 'Prime',
  'NETFLIX': 'Netflix', 'PEACOCK': 'Peacock', 'ESPN+': 'ESPN+', 'DISNEY+': 'Disney+',
  'PARAMOUNT+': 'Paramount+', 'FOX ONE': 'FOX One', 'NFL+': 'NFL+', 'YOUTUBE': 'YouTube', 'YOUTUBE TV': 'YouTube',
};
export const LINEAR = new Set(['CBS', 'FOX', 'NBC', 'ABC', 'ESPN', 'ESPN2', 'NFLN']);

export function normalizeNetworkName(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toUpperCase();
  if (NETWORK_MAP[key]) return NETWORK_MAP[key];
  // "ABC/ESPN", "NBC/Peacock" style combos
  if (key.includes('/')) return key.split('/').map(normalizeNetworkName).filter(Boolean);
  return raw.trim();
}

export function normalizeEvent(ev, season) {
  const comp = ev.competitions?.[0] || {};
  const home = comp.competitors?.find((c) => c.homeAway === 'home');
  const away = comp.competitors?.find((c) => c.homeAway === 'away');
  const homeId = normalizeTeam(home?.team?.abbreviation);
  const awayId = normalizeTeam(away?.team?.abbreviation);
  if (!homeId || !awayId) return null;

  const names = new Set();
  let national = false;
  for (const b of comp.broadcasts || []) for (const n of b.names || []) for (const x of [].concat(normalizeNetworkName(n))) if (x) names.add(x);
  for (const g of comp.geoBroadcasts || []) {
    const n = normalizeNetworkName(g.media?.shortName);
    for (const x of [].concat(n)) if (x) names.add(x);
    if ((g.market?.type || '').toLowerCase() === 'national') national = true;
  }
  const networks = [...names].filter((n) => LINEAR.has(n));
  const streams = [...names].filter((n) => !LINEAR.has(n));
  const week = ev.week?.number ?? comp.week?.number ?? null;
  const kickoff = new Date(ev.date).toISOString();
  const window = inferWindow(kickoff, streams);
  const exclusive = networks.length === 0 && streams.length === 1 ? streams[0] : null;
  // Sunday primetime, MNF, TNF and holiday games are national by definition.
  if (['SNF', 'MNF', 'TNF', 'KICKOFF', 'HOLIDAY', 'SAT', 'INTL'].includes(window)) national = true;
  const tbd = comp.timeValid === false || ev.status?.type?.name === 'STATUS_SCHEDULED' && comp.timeValid === false;
  return {
    id: `${season}-W${String(week).padStart(2, '0')}-${awayId}-${homeId}`,
    espnId: ev.id,
    week,
    kickoff,
    timeTbd: Boolean(tbd),
    away: awayId,
    home: homeId,
    networks,
    streams,
    exclusive,
    window,
    national,
    venue: comp.venue?.fullName ? `${comp.venue.fullName}${comp.venue.address?.city ? ', ' + comp.venue.address.city : ''}` : null,
    status: ev.status?.type?.state || 'pre',
    label: ev.name && /kickoff|christmas|thanksgiving|international/i.test(ev.name) ? ev.name : null,
    verified: true,
    source: 'espn',
  };
}

export async function fetchWeek(season, week, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const url = `${BASE}?dates=${season}&seasontype=2&week=${week}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, headers: { 'user-agent': 'nfl-game-reminder/1.0' } });
    if (!res.ok) throw new Error(`ESPN ${res.status} for week ${week}`);
    const json = await res.json();
    return (json.events || []).map((e) => normalizeEvent(e, season)).filter(Boolean);
  } finally { clearTimeout(t); }
}

export async function fetchSeason(season, { weeks = 18, fetchImpl = fetch, concurrency = 3 } = {}) {
  const out = [];
  const list = Array.from({ length: weeks }, (_, i) => i + 1);
  let i = 0;
  async function worker() {
    while (i < list.length) {
      const w = list[i++];
      const games = await fetchWeek(season, w, { fetchImpl });
      out.push(...games);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}
