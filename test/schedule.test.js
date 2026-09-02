import test from 'node:test';
import assert from 'node:assert/strict';
import { diffGames, matchKey, ScheduleService, loadSeed } from '../server/schedule/scheduleService.js';
import { normalizeEvent, normalizeNetworkName } from '../server/schedule/espnAdapter.js';
import { coverageStart, inferWindow } from '../server/schedule/windows.js';
import { DB } from '../server/db.js';

test('diff detects time, date and network changes and ignores unchanged games', () => {
  const a = loadSeed(2026);
  const b = a.map((g) => g.id === '2026-W01-ATL-PIT' ? { ...g, kickoff: '2026-09-14T00:20:00Z', networks: ['NBC'], streams: ['Peacock'] } : g);
  const ch = diffGames(a, b);
  assert.deepEqual(ch.map((c) => c.type).sort(), ['network', 'network', 'time']);
  assert.equal(ch[0].gameId, '2026-W01-ATL-PIT');
});

test('matchKey is order-independent for home/away flips', () => {
  assert.equal(matchKey({ week: 1, away: 'SF', home: 'LAR' }), matchKey({ week: 1, away: 'LAR', home: 'SF' }));
});

test('coverage start uses network rules', () => {
  const snf = coverageStart({ kickoff: '2026-09-14T00:20:00Z', networks: ['NBC'], window: 'SNF' });
  assert.equal(snf.minutesBefore, 80);
  assert.match(snf.show, /Football Night/);
  const fox = coverageStart({ kickoff: '2026-09-13T17:00:00Z', networks: ['FOX'], window: 'SUN_EARLY' });
  assert.equal(fox.start, '2026-09-13T15:00:00.000Z');
  const tnf = coverageStart({ kickoff: '2026-09-18T00:15:00Z', networks: [], streams: ['Prime'], window: 'TNF' });
  assert.equal(tnf.confidence, 'typical');
});

test('window inference from ET kickoff', () => {
  assert.equal(inferWindow('2026-09-13T17:00:00Z'), 'SUN_EARLY');
  assert.equal(inferWindow('2026-09-13T20:25:00Z'), 'SUN_LATE');
  assert.equal(inferWindow('2026-09-14T00:20:00Z'), 'SNF');
  assert.equal(inferWindow('2026-09-15T00:15:00Z'), 'MNF');
  assert.equal(inferWindow('2026-09-18T00:15:00Z'), 'TNF');
  assert.equal(inferWindow('2026-10-04T13:30:00Z'), 'INTL');
});

test('ESPN event normalizes to our schema', () => {
  const ev = { id: '401', date: '2026-09-15T00:15Z', name: 'Denver Broncos at Kansas City Chiefs', week: { number: 1 }, status: { type: { state: 'pre' } }, competitions: [{ competitors: [{ homeAway: 'home', team: { abbreviation: 'KC' } }, { homeAway: 'away', team: { abbreviation: 'DEN' } }], broadcasts: [{ names: ['ESPN', 'ABC'] }], geoBroadcasts: [{ market: { type: 'National' }, media: { shortName: 'ESPN+' } }], venue: { fullName: 'GEHA Field at Arrowhead Stadium', address: { city: 'Kansas City' } } }] };
  const g = normalizeEvent(ev, 2026);
  assert.equal(g.id, '2026-W01-DEN-KC');
  assert.deepEqual(g.networks.sort(), ['ABC', 'ESPN']);
  assert.deepEqual(g.streams, ['ESPN+']);
  assert.equal(g.window, 'MNF');
  assert.equal(g.national, true);
  assert.equal(normalizeNetworkName('NFL NET'), 'NFLN');
  assert.deepEqual(normalizeNetworkName('NBC/Peacock'), ['NBC', 'Peacock']);
});

test('sync keeps seed games when live fetch fails, and applies live games when it works', async () => {
  const db = new DB({ persist: false });
  const failing = new ScheduleService({ db, source: 'espn', fetchImpl: async () => { throw new Error('offline'); }, logger: { log() {}, warn() {}, error() {} } });
  const before = failing.all().length;
  await failing.sync();
  assert.equal(failing.all().length, before);
  assert.match(failing.meta.lastError, /offline/);

  const ok = new ScheduleService({ db: new DB({ persist: false }), source: 'espn', logger: { log() {}, warn() {}, error() {} }, fetchImpl: async (url) => ({ ok: true, json: async () => ({ events: /week=1$/.test(url) ? [{ id: '1', date: '2026-09-13T17:00Z', week: { number: 1 }, competitions: [{ competitors: [{ homeAway: 'home', team: { abbreviation: 'PIT' } }, { homeAway: 'away', team: { abbreviation: 'ATL' } }], broadcasts: [{ names: ['FOX'] }] }] }] : [] }) }) });
  const changes = await ok.sync();
  assert.equal(ok.meta.source, 'espn');
  // Week 1 was replaced by the live week (one game), other seed weeks kept
  assert.equal(ok.week(1).length, 1);
  assert.ok(ok.week(2).length > 0);
  assert.ok(changes.some((c) => c.type === 'removed'));
});
