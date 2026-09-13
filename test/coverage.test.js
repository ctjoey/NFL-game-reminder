import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSeed } from '../server/schedule/scheduleService.js';
import { gameInMarket, resolveWindowGame } from '../server/coverage/coverageService.js';
import { marketForZip, resolveChannel, accessCheck } from '../server/market/marketService.js';

const games = loadSeed(2026);
const byId = (id) => games.find((g) => g.id === id);

test('home-market team game is confirmed for its market', () => {
  const r = gameInMarket(byId('2026-W01-ATL-PIT'), 'pittsburgh', games);
  assert.equal(r.airs, true);
  assert.equal(r.confidence, 'confirmed');
});

test('a different FOX regional game does not air where the local team plays on FOX', () => {
  const r = gameInMarket(byId('2026-W01-CHI-CAR'), 'pittsburgh', games);
  assert.equal(r.airs, false);
  assert.equal(r.instead.id, '2026-W01-ATL-PIT');
  assert.match(r.reason, /Falcons at Steelers/);
});

test('national broadcasts air everywhere', () => {
  const r = gameInMarket(byId('2026-W01-DAL-NYG'), 'denver', games);
  assert.equal(r.airs, true);
  assert.equal(r.confidence, 'confirmed');
});

test('editorial override wins and is confirmed', () => {
  const r = resolveWindowGame({ games, week: 1, marketKey: 'milwaukee', network: 'CBS', window: 'SUN_LATE' });
  assert.equal(r.game.id, '2026-W01-GB-MIN');
  assert.equal(r.confidence, 'confirmed');
});

test('affinity market gets a likely, not confirmed, answer', () => {
  // Columbus lists CLE, CIN, PIT in that order, so the Bengals game outranks the Steelers game.
  const r = resolveWindowGame({ games, week: 1, marketKey: 'columbus', network: 'FOX', window: 'SUN_EARLY' });
  assert.equal(r.game.id, '2026-W01-TB-CIN');
  assert.equal(r.confidence, 'likely');
});

test('a market matching nothing in the window returns no pick at all', () => {
  // Sacramento's affinity is SF, LV and LAR, none of which play in this window. The engine used
  // to hand back an arbitrary candidate here, which the UI then reported as fact.
  const r = resolveWindowGame({ games, week: 1, marketKey: 'sacramento', network: 'FOX', window: 'SUN_EARLY' });
  assert.equal(r.game, null);
  assert.equal(r.confidence, 'unknown');
});

test('zip resolves to market and channel defaults to OTA number on DirecTV', () => {
  const m = marketForZip('15201');
  assert.equal(m.key, 'pittsburgh');
  const ch = resolveChannel({ market: 'pittsburgh', provider: 'directv' }, 'CBS');
  assert.equal(ch.station.call, 'KDKA');
  assert.equal(ch.number, '2');
  assert.equal(ch.confidence, 'likely');
  const ota = resolveChannel({ market: 'pittsburgh', provider: 'ota' }, 'FOX');
  assert.equal(ota.number, '53');
  assert.equal(ota.confidence, 'confirmed');
});

test('user channel override beats provider default and is confirmed', () => {
  const ch = resolveChannel({ market: 'pittsburgh', provider: 'xfinity', channelOverrides: { CBS: '1002' } }, 'CBS');
  assert.equal(ch.number, '1002');
  assert.equal(ch.confidence, 'confirmed');
  const none = resolveChannel({ market: 'pittsburgh', provider: 'xfinity' }, 'CBS');
  assert.equal(none.number, null);
  assert.ok(none.hint);
});

test('streaming providers give a guide hint, not a number', () => {
  const ch = resolveChannel({ market: 'denver', provider: 'youtubetv' }, 'NBC');
  assert.equal(ch.number, null);
  assert.match(ch.hint, /KUSA/);
});

test('access check flags a Netflix exclusive for a user without Netflix', () => {
  const r = accessCheck({ market: 'pittsburgh', provider: 'directv', services: ['Prime'] }, byId('2026-W01-SF-LAR'));
  assert.equal(r.ok, false);
  assert.equal(r.missing[0].network, 'Netflix');
  const ok = accessCheck({ market: 'pittsburgh', provider: 'directv', services: ['Netflix'] }, byId('2026-W01-SF-LAR'));
  assert.equal(ok.ok, true);
});

test('Sunday Ticket does not cover the local game', () => {
  const r = accessCheck({ market: 'pittsburgh', provider: 'youtubetv', services: ['SundayTicket'] }, byId('2026-W01-ATL-PIT'));
  assert.ok(r.notes.some((n) => /Sunday Ticket does not carry your local game/.test(n)));
  const away = accessCheck({ market: 'denver', provider: 'youtubetv', services: ['SundayTicket'] }, byId('2026-W01-ATL-PIT'));
  assert.ok(away.ways.some((w) => w.network === 'SundayTicket'));
});

test('ESPN-only MNF with antenna user: ABC over the air is a way to watch', () => {
  const r = accessCheck({ market: 'kansascity', provider: null, hasAntenna: true, services: [] }, byId('2026-W01-DEN-KC'));
  assert.ok(r.ways.some((w) => w.kind === 'ota' && w.network === 'ABC'));
  assert.ok(r.missing.some((m) => m.network === 'ESPN'));
});

// Regression: reported from Hartford-New Haven on 13 Sep 2026. FOX was showing Falcons at
// Steelers at 1pm and Commanders at Eagles at 4:25, and the app confidently said neither was on
// the local station, naming a different game for each window. Hartford has no home team and its
// affinity list (NE, NYG, NYJ) matched nothing, so the pick fell through to a "national game"
// rule that took whichever candidate happened to carry ESPN's national flag first.
const g = (id, away, home, window, national = false) => ({
  id, week: 2, window, away, home, networks: ['FOX'], national,
});
const week2Fox = [
  g('2026-W02-ATL-PIT', 'ATL', 'PIT', 'SUN_EARLY', true),
  g('2026-W02-TB-CIN', 'TB', 'CIN', 'SUN_EARLY', true),
  g('2026-W02-WAS-PHI', 'WAS', 'PHI', 'SUN_LATE', true),
  g('2026-W02-MIA-LV', 'MIA', 'LV', 'SUN_LATE', true),
];

test('a market with no local team and no affinity match gets no pick, not a guess', () => {
  const r = resolveWindowGame({ games: week2Fox, week: 2, marketKey: 'hartford', network: 'FOX', window: 'SUN_EARLY' });
  assert.equal(r.game, null);
  assert.equal(r.confidence, 'unknown');
  assert.match(r.reason, /local listings/i);
});

test('an unresolved window never claims a game is off the local station', () => {
  for (const game of week2Fox) {
    const r = gameInMarket(game, 'hartford', week2Fox);
    assert.notEqual(r.airs, false, `${game.id} was wrongly reported as not airing`);
    assert.doesNotMatch(r.reason, /is showing/);
  }
});

test('an affinity guess is offered as uncertainty, never as a negative', () => {
  const withJets = [...week2Fox, g('2026-W02-NYJ-TEN', 'NYJ', 'TEN', 'SUN_EARLY')];
  const pick = resolveWindowGame({ games: withJets, week: 2, marketKey: 'hartford', network: 'FOX', window: 'SUN_EARLY' });
  assert.equal(pick.game.id, '2026-W02-NYJ-TEN');
  assert.equal(pick.confidence, 'likely');
  const other = gameInMarket(withJets[0], 'hartford', withJets);
  assert.equal(other.airs, null);
  assert.equal(other.instead.id, '2026-W02-NYJ-TEN');
  assert.match(other.reason, /usually receives/);
});

test('a confirmed pick may still say a game is not on the local station', () => {
  // Philadelphia is guaranteed the Eagles game, so the other FOX game in that window is a
  // confirmed negative and is still allowed to say so.
  const late = week2Fox.filter((x) => x.window === 'SUN_LATE');
  const r = gameInMarket(late.find((x) => x.id === '2026-W02-MIA-LV'), 'philadelphia', late);
  assert.equal(r.airs, false);
  assert.equal(r.confidence, 'confirmed');
  assert.equal(r.instead.id, '2026-W02-WAS-PHI');
  assert.match(r.reason, /is showing/);
});
