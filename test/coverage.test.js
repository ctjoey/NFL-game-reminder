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
  const r = resolveWindowGame({ games, week: 1, marketKey: 'sacramento', network: 'FOX', window: 'SUN_EARLY' });
  assert.ok(r.game);
  assert.notEqual(r.confidence, 'confirmed');
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
