import test from 'node:test';
import assert from 'node:assert/strict';
import { DB } from '../server/db.js';
import { ScheduleService } from '../server/schedule/scheduleService.js';
import { Scheduler, plan, localToIso, weeklyFireAt } from '../server/notify/scheduler.js';
import { buildIcs } from '../server/ics.js';
import { buildCard } from '../server/cards.js';
import { inQuietHours, fmtTime } from '../server/util/time.js';

const quiet = { log() {}, warn() {}, error() {} };
function setup() {
  const db = new DB({ persist: false });
  const schedule = new ScheduleService({ db, source: 'seed', logger: quiet });
  const sent = [];
  const scheduler = new Scheduler({ db, schedule, logger: quiet, deliverImpl: async (u, m) => { sent.push({ user: u.id, ...m }); return { console: { ok: true } }; } });
  const user = db.createUser({ tz: 'America/New_York', market: 'pittsburgh', provider: 'directv', services: ['Prime'], follow: { mode: 'teams', teams: ['PIT'] }, alerts: { coverage: true, kickoffLeads: [30], kickoffNow: true, changes: true, access: true, weekly: false }, quiet: { start: '23:00', end: '08:00' }, maxPerDay: 12, channels: { push: [] } });
  return { db, schedule, scheduler, sent, user };
}

test('plan lists coverage, lead, kickoff and access alerts for a followed game only', () => {
  const { schedule, user } = setup();
  const p = plan(user, schedule.all(), new Date('2026-09-01T00:00:00Z'));
  const pit = p.filter((x) => x.gameId === '2026-W01-ATL-PIT').map((x) => x.type).sort();
  assert.deepEqual(pit, ['access', 'coverage', 'kickoff_0', 'kickoff_30']);
  assert.ok(!p.some((x) => x.gameId === '2026-W01-CHI-CAR'));
});

test('tick fires due alerts exactly once and re-arms after a flex', async () => {
  const { schedule, scheduler, sent, user } = setup();
  // 30 minutes before kickoff of ATL@PIT (1:00 pm ET = 17:00Z)
  const t = new Date('2026-09-13T16:31:00Z');
  await scheduler.tick(t);
  assert.equal(sent.filter((m) => m.type === 'kickoff_30').length, 1);
  assert.match(sent[0].body, /WPGH \(FOX\) ch\. 53/);
  await scheduler.tick(new Date(t.getTime() + 60000));
  assert.equal(sent.filter((m) => m.type === 'kickoff_30').length, 1, 'no duplicate');

  // Flex the game to Sunday night on NBC: a change alert goes out, and a new lead alert is planned
  const moved = schedule.all().map((g) => g.id === '2026-W01-ATL-PIT' ? { ...g, kickoff: '2026-09-14T00:20:00Z', networks: ['NBC'], streams: ['Peacock'], window: 'SNF' } : g);
  schedule.applyGames(moved, 'test');
  await new Promise((r) => setTimeout(r, 10));
  const change = sent.filter((m) => m.type === 'change');
  assert.equal(change.length, 1, 'one alert per game per sync, not one per field');
  assert.match(change[0].body, /WPXI \(NBC\) ch\. 11/);
  assert.match(change[0].body, /Was: Sun Sep 13, 1:00 pm EDT on FOX/);
  await scheduler.tick(new Date('2026-09-13T23:51:00Z'));
  assert.equal(sent.filter((m) => m.type === 'kickoff_30').length, 2, 're-armed for new kickoff');
});

test('too-late alerts are skipped, not spammed, after downtime', async () => {
  const { scheduler, sent, db, user } = setup();
  await scheduler.tick(new Date('2026-09-13T19:00:00Z')); // 2h after kickoff
  assert.equal(sent.length, 0);
  // 5 minutes late is still fine; 2 hours late is dropped by the planner, so nothing fires and nothing is logged as sent
  assert.equal(db.sentEntries(`${user.id}|`).filter(([, v]) => v.delivered).length, 0);
});

test('non-critical alerts wait for quiet hours to end; critical ones do not', async () => {
  const { scheduler, sent, db, user } = setup();
  db.updateUser(user.id, { quiet: { start: '00:00', end: '23:59' } });
  await scheduler.tick(new Date('2026-09-12T17:01:00Z')); // access alert due (24h before)
  assert.equal(sent.filter((m) => m.type === 'access').length, 0);
  await scheduler.tick(new Date('2026-09-13T16:31:00Z'));
  assert.equal(sent.filter((m) => m.type === 'kickoff_30').length, 1);
});

test('daily cap stops runaway volume', async () => {
  const { scheduler, sent, db, user } = setup();
  db.updateUser(user.id, { maxPerDay: 1, quiet: null });
  await scheduler.tick(new Date('2026-09-13T17:01:00Z')); // coverage, kickoff_30, kickoff_0 all due
  assert.equal(sent.length, 1);
});

test('access alert is silent when the user can watch and there is no catch', async () => {
  const { scheduler, sent, db, user } = setup();
  db.updateUser(user.id, { quiet: null });
  await scheduler.tick(new Date('2026-09-12T17:01:00Z'));
  assert.equal(sent.filter((m) => m.type === 'access').length, 0);
  // Now follow the Netflix game without Netflix: the access alert has something to say
  db.updateUser(user.id, { follow: { mode: 'games', games: ['2026-W01-SF-LAR'] } });
  await scheduler.tick(new Date('2026-09-10T00:36:00Z'));
  const a = sent.find((m) => m.type === 'access');
  assert.ok(a);
  assert.match(a.body, /Netflix/);
});

test('quiet hours handle overnight ranges', () => {
  assert.equal(inQuietHours('2026-09-13T03:30:00Z', 'America/New_York', { start: '23:00', end: '08:00' }), true); // 11:30 pm ET
  assert.equal(inQuietHours('2026-09-13T16:00:00Z', 'America/New_York', { start: '23:00', end: '08:00' }), false);
});

test('local wall-clock to instant conversion respects zone', () => {
  assert.equal(localToIso('2026-09-09', 9, 'America/Los_Angeles'), '2026-09-09T16:00:00.000Z');
  assert.equal(localToIso('2026-09-09', 9, 'America/New_York'), '2026-09-09T13:00:00.000Z');
  assert.equal(fmtTime('2026-09-13T17:00:00Z', 'America/Los_Angeles'), '10:00 am PDT');
});

test('weekly digest fires on the chosen weekday before the first kickoff', () => {
  const { schedule } = setup();
  const u = { tz: 'America/Chicago', alerts: { weekly: true, weeklyDay: 'Tue', weeklyHour: 18 } };
  const at = weeklyFireAt(u, schedule.week(2));
  assert.equal(at, '2026-09-15T23:00:00.000Z'); // Tue Sep 15, 6 pm CDT
});

test('ICS feed has one event per followed game with both clocks and alarms', () => {
  const { schedule, user } = setup();
  const ics = buildIcs(user, schedule.all(), { baseUrl: 'http://x' });
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, schedule.all().filter((g) => g.home === 'PIT' || g.away === 'PIT').length);
  assert.match(ics, /Coverage begins: 11:00 am EDT/);
  assert.match(ics, /TRIGGER:-PT30M/);
  assert.match(ics, /UID:2026-W01-ATL-PIT@nfl-game-reminder/);
});

test('card renders both clocks in the user zone with ET alongside', () => {
  const { schedule } = setup();
  const u = { tz: 'America/Los_Angeles', market: 'seattle', provider: 'ota', services: [], follow: { mode: 'all' } };
  const c = buildCard(u, schedule.byId('2026-W01-NE-SEA'), schedule.all());
  assert.equal(c.kickoff.local, '5:20 pm PDT');
  assert.equal(c.kickoff.et, '8:20 pm ET');
  assert.equal(c.coverage.local, '4:00 pm PDT');
  assert.match(c.watch, /KING \(NBC\) ch\. 5/);
});
