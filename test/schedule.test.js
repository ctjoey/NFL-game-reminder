import test from 'node:test';
import assert from 'node:assert/strict';
import { diffGames, matchKey, ScheduleService, loadSeed } from '../server/schedule/scheduleService.js';
import { normalizeEvent, normalizeNetworkName } from '../server/schedule/espnAdapter.js';
import { matchupRecords, recordsBefore, summarize } from '../server/schedule/records.js';
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

test('a final score is read off the payload we already fetch, and only once the game is over', () => {
  const event = (state, awayScore, homeScore) => ({
    id: '1', date: '2026-09-18T00:15:00Z', week: { number: 2 },
    status: { type: { state } },
    competitions: [{
      competitors: [
        { homeAway: 'away', score: awayScore, team: { abbreviation: 'DET' } },
        { homeAway: 'home', score: homeScore, team: { abbreviation: 'BUF' } },
      ],
      broadcasts: [{ names: ['Prime Video'] }],
    }],
  });

  assert.equal(normalizeEvent(event('pre', '0', '0'), 2026).finalScore, null, 'a game that has not kicked off has no final');
  assert.equal(normalizeEvent(event('in', '14', '10'), 2026).finalScore, null,
               'a score mid-game is a different product; we close the loop, we do not call the game');
  assert.deepEqual(normalizeEvent(event('post', '27', '24'), 2026).finalScore, { away: 27, home: 24 });

  // A shutout is a real score, not a missing one.
  assert.deepEqual(normalizeEvent(event('post', '0', '31'), 2026).finalScore, { away: 0, home: 31 });
  // Garbage in the score field must not become NaN on someone's card.
  assert.equal(normalizeEvent(event('post', null, '24'), 2026).finalScore, null);
});

test('scores never register as schedule changes', () => {
  // The change feed tells people a game moved. Tracking the score would fire a "schedule change"
  // alert on every touchdown, which is precisely the noise this app promises not to make.
  const before = [{ id: 'g', week: 2, kickoff: '2026-09-18T00:15:00Z', away: 'DET', home: 'BUF', networks: [], streams: ['Prime'], finalScore: null }];
  const after = [{ ...before[0], finalScore: { away: 27, home: 24 } }];
  assert.deepEqual(diffGames(before, after), [], 'a score is not a move');
});

test('records are derived from the finals we already hold, as of each game', () => {
  const g = (id, week, away, home, day, fs) => ({
    id, week, away, home, window: 'SUN_EARLY', networks: ['CBS'],
    kickoff: `2026-09-${day}T17:00:00Z`, finalScore: fs,
  });
  const games = [
    g('w1a', 1, 'PIT', 'NE', '13', { away: 24, home: 17 }),   // PIT beat NE
    g('w1b', 1, 'GB', 'CHI', '13', { away: 20, home: 20 }),   // tie
    g('w2a', 2, 'PIT', 'NE', '20', null),                     // not played yet
  ];

  const week2 = matchupRecords(games, games[2]);
  assert.equal(week2.away, '1-0', 'Pittsburgh brings a win into week 2');
  assert.equal(week2.home, '0-1');

  // A tie prints the third number; nothing else does.
  assert.equal(summarize(recordsBefore(games, '2026-09-20T00:00:00Z').GB), '0-0-1');
  assert.equal(summarize(recordsBefore(games, '2026-09-20T00:00:00Z').PIT), '1-0');

  // The record is the one carried INTO the game, so a past card does not drift as the season runs.
  const week1 = matchupRecords(games, games[0]);
  assert.equal(week1.away, null, 'nobody has played before week 1, so no "(0-0)" clutter');
  assert.equal(week1.home, null);
});

test('a live score is kept only while the game is being played, and carries its quarter', () => {
  const ev = (state, extra = {}) => ({
    id: '1', date: '2026-09-20T17:00:00Z', week: { number: 2 },
    status: { type: { state }, ...extra },
    competitions: [{
      competitors: [
        { homeAway: 'away', score: '24', team: { abbreviation: 'PIT' } },
        { homeAway: 'home', score: '21', team: { abbreviation: 'NE' } },
      ],
      broadcasts: [{ names: ['CBS'] }],
    }],
  });

  const live = normalizeEvent(ev('in', { period: 3, displayClock: '4:12' }), 2026);
  assert.deepEqual(live.liveScore, { away: 24, home: 21, period: 3 },
                   'the quarter, never the game clock - a frozen clock looks like a running one');
  assert.equal(live.finalScore, null, 'a game in progress has no final');

  // Before kickoff and after the whistle there is nothing live to report.
  assert.equal(normalizeEvent(ev('pre'), 2026).liveScore, null);
  const done = normalizeEvent(ev('post'), 2026);
  assert.equal(done.liveScore, null, 'a finished game is a final, not a live score');
  assert.deepEqual(done.finalScore, { away: 24, home: 21 });

  // A score with no quarter is still a score; the card just says less about it.
  assert.equal(normalizeEvent(ev('in'), 2026).liveScore.period, null);
});

test('a live score never counts toward a record', () => {
  // Only finals move the standings. Counting a game in progress would show a team at 2-0 in the
  // third quarter of a game they go on to lose.
  const games = [{
    id: 'g', week: 2, away: 'PIT', home: 'NE', window: 'SUN_EARLY', networks: ['CBS'],
    kickoff: '2026-09-20T17:00:00Z', finalScore: null, liveScore: { away: 24, home: 21, period: 3 },
  }];
  assert.deepEqual(recordsBefore(games, '2026-09-21T00:00:00Z'), {});
});
