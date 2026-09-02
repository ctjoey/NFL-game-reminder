import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEAMS } from '../schedule/teams.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MARKETS = JSON.parse(fs.readFileSync(path.join(here, 'markets.json'), 'utf8'));
const PROVIDERS = JSON.parse(fs.readFileSync(path.join(here, 'providers.json'), 'utf8'));

export const LINEAR_NETWORKS = ['CBS', 'FOX', 'NBC', 'ABC', 'ESPN', 'ESPN2', 'NFLN'];
export const LOCAL_NETWORKS = ['CBS', 'FOX', 'NBC', 'ABC'];

export function listMarkets() {
  return Object.entries(MARKETS.markets).map(([key, m]) => ({ key, name: m.name, state: m.state, tz: m.tz, teams: m.teams }));
}
export function getMarket(key) {
  const m = MARKETS.markets[key];
  return m ? { key, ...m } : null;
}
export function marketForZip(zip) {
  const z = String(zip || '').replace(/\D/g, '');
  if (z.length < 3) return null;
  const key = MARKETS.zipPrefixes[z.slice(0, 3)];
  return key ? getMarket(key) : null;
}
export function marketForTeam(teamId) {
  const t = TEAMS[teamId];
  return t ? getMarket(t.market) : null;
}
export function listProviders() {
  return Object.entries(PROVIDERS.providers).map(([key, p]) => ({ key, name: p.name, kind: p.kind, guideHint: p.guideHint || null, carriageNotes: p.carriageNotes || null }));
}
export function getProvider(key) {
  const p = PROVIDERS.providers[key];
  return p ? { key, ...p } : null;
}
export function listServices() {
  return Object.entries(PROVIDERS.services).map(([key, s]) => ({ key, ...s }));
}
export function networkLabel(n) { return PROVIDERS.networkLabels[n] || n; }

// Resolve "what channel is <network> in this user's market on this user's provider?".
// Returns a structure the UI and notification templates can render, with a confidence
// label so we never present a default as a fact.
export function resolveChannel(user, network) {
  const market = user.market ? getMarket(user.market) : null;
  const provider = user.provider ? getProvider(user.provider) : null;
  const overrides = user.channelOverrides || {};
  const out = { network, label: networkLabel(network), station: null, number: null, source: null, confidence: 'unknown', hint: null };

  if (LOCAL_NETWORKS.includes(network)) {
    const aff = market?.affiliates?.[network];
    if (aff) out.station = { call: aff.call, ota: aff.ota, name: `${aff.call} (${network})` };
    if (overrides[network] != null && overrides[network] !== '') {
      out.number = String(overrides[network]); out.source = 'you set this'; out.confidence = 'confirmed';
    } else if (provider?.kind === 'ota' && aff) {
      out.number = String(aff.ota); out.source = 'over-the-air channel'; out.confidence = 'confirmed';
    } else if (provider?.localsMatchOta && aff) {
      out.number = String(aff.ota); out.source = `${provider.name} carries locals on their over-the-air number`; out.confidence = 'likely';
    } else if (provider?.kind === 'stream') {
      out.number = null; out.source = provider.name; out.confidence = 'n/a';
      out.hint = aff ? `Search "${aff.call}" or "${network}" in the ${provider.name} guide.` : (provider.guideHint || null);
    } else if (provider) {
      out.number = null; out.source = provider.name; out.confidence = 'unknown';
      out.hint = provider.guideHint || 'Set your channel number once in Settings.';
    }
    if (!provider && aff) { out.hint = `Over the air: channel ${aff.ota}.`; }
  } else {
    // national channel (ESPN, NFLN, ...)
    if (overrides[network] != null && overrides[network] !== '') {
      out.number = String(overrides[network]); out.source = 'you set this'; out.confidence = 'confirmed';
    } else if (provider?.national?.[network] != null) {
      out.number = String(provider.national[network]); out.source = `${provider.name} standard lineup`; out.confidence = 'confirmed';
    } else if (provider?.kind === 'stream') {
      out.confidence = 'n/a'; out.source = provider.name; out.hint = `Search "${networkLabel(network)}" in the ${provider.name} guide.`;
    } else if (provider) {
      out.confidence = 'unknown'; out.source = provider.name; out.hint = provider.guideHint || 'Set your channel number once in Settings.';
    }
  }
  return out;
}

// Which of the game's carriers can THIS user actually use? Returns ways-to-watch and what is
// missing so we can warn a day ahead instead of at kickoff (Gap 5).
export function accessCheck(user, game) {
  const provider = user.provider ? getProvider(user.provider) : null;
  const services = new Set(user.services || []);
  const ways = [];
  const missing = [];
  const notes = [];

  for (const n of game.networks || []) {
    const ch = resolveChannel(user, n);
    const carried = provider ? (provider.carries || []).includes(n) : false;
    if (carried) {
      ways.push({ kind: 'tv', network: n, label: networkLabel(n), channel: ch });
    } else if (LOCAL_NETWORKS.includes(n) && user.hasAntenna) {
      ways.push({ kind: 'ota', network: n, label: `${networkLabel(n)} over the air`, channel: resolveChannel({ ...user, provider: 'ota', channelOverrides: {} }, n) });
    } else {
      missing.push({ kind: 'tv', network: n, label: networkLabel(n), hint: LOCAL_NETWORKS.includes(n) ? 'Free with an antenna' : null });
    }
  }
  for (const s of game.streams || []) {
    const svc = PROVIDERS.services[s] || PROVIDERS.services[Object.keys(PROVIDERS.services).find((k) => PROVIDERS.services[k].carries.includes(s))];
    const have = services.has(s) || [...services].some((have) => (PROVIDERS.services[have]?.carries || []).includes(s));
    if (have) ways.push({ kind: 'stream', network: s, label: networkLabel(s) });
    else missing.push({ kind: 'stream', network: s, label: networkLabel(s), cost: svc?.cost || null, note: svc?.note || null });
  }
  // Streaming services that carry linear networks (Peacock carries NBC, Paramount+ carries CBS, ...)
  for (const have of services) {
    const svc = PROVIDERS.services[have];
    if (!svc) continue;
    for (const n of game.networks || []) {
      if (svc.carries.includes(n) && !ways.some((w) => w.network === have)) ways.push({ kind: 'stream', network: have, label: `${svc.name} (streams ${networkLabel(n)})` });
    }
  }
  if (services.has('SundayTicket') && ['SUN_EARLY', 'SUN_LATE'].includes(game.window)) {
    const mk = user.market;
    const local = [game.home, game.away].some((t) => TEAMS[t]?.market === mk);
    if (local) notes.push('Sunday Ticket does not carry your local game. Use your CBS/FOX station.');
    else ways.push({ kind: 'stream', network: 'SundayTicket', label: 'NFL Sunday Ticket (out-of-market)' });
  }
  if (services.has('NFL+')) {
    const primetime = ['SNF', 'MNF', 'TNF', 'KICKOFF', 'HOLIDAY'].includes(game.window);
    const local = [game.home, game.away].some((t) => TEAMS[t]?.market === user.market);
    if (primetime || local) { ways.push({ kind: 'stream', network: 'NFL+', label: 'NFL+ (phone/tablet only)' }); notes.push('NFL+ streams this on phone and tablet only, not on a TV.'); }
  }
  if (provider?.carriageNotes) {
    const affected = (game.networks || []).some((n) => !(provider.carries || []).includes(n));
    if (affected) notes.push(provider.carriageNotes);
  }
  const exclusive = game.exclusive || null;
  return { ok: ways.length > 0, ways, missing, notes, exclusive };
}
