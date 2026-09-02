import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import { DB } from '../server/db.js';
import { ScheduleService } from '../server/schedule/scheduleService.js';
import { Scheduler } from '../server/notify/scheduler.js';

const quiet = { log() {}, warn() {}, error() {} };
async function start() {
  const db = new DB({ persist: false });
  const schedule = new ScheduleService({ db, source: 'seed', logger: quiet });
  const scheduler = new Scheduler({ db, schedule, logger: quiet, deliverImpl: async () => ({ console: { ok: true } }) });
  const { app } = createApp({ db, schedule, scheduler, env: { NODE_ENV: 'test' } });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const j = async (path, opts = {}) => { const res = await fetch(base + path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined }); return { status: res.status, body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() }; };
  return { server, j };
}

test('API: config, user lifecycle, week cards, alerts, ics, simulate change', async () => {
  const { server, j } = await start();
  try {
    const cfg = await j('/api/config');
    assert.equal(cfg.status, 200);
    assert.equal(cfg.body.teams.length, 32);
    assert.ok(cfg.body.markets.length > 30);

    const zip = await j('/api/lookup/zip/90210');
    assert.equal(zip.body.key, 'losangeles');

    const created = await j('/api/users', { method: 'POST', body: { tz: 'America/Chicago', market: 'kansascity', provider: 'dish', services: ['Peacock'], follow: { mode: 'teams', teams: ['KC'] }, alerts: { coverage: true, kickoffLeads: [60, 15], access: true, changes: true, weekly: true } } });
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.deepEqual(created.body.alerts.kickoffLeads, [60, 15]);

    const bad = await j('/api/users', { method: 'POST', body: { tz: 'Not/AZone', provider: 'nope', market: 'nowhere' } });
    assert.equal(bad.body.tz, 'America/New_York');
    assert.equal(bad.body.provider, null);
    assert.equal(bad.body.market, null);

    const wk = await j(`/api/users/${id}/week/1`);
    assert.equal(wk.status, 200);
    const mnf = wk.body.cards.find((c) => c.id === '2026-W01-DEN-KC');
    assert.equal(mnf.followed, true);
    assert.equal(mnf.kickoff.local, '7:15 pm CDT');
    assert.match(mnf.watch, /ESPN ch\. 140/);
    assert.ok(mnf.access.ok, 'DISH carries ESPN');
    assert.ok(mnf.alerts.length >= 3);

    // Pick a single extra game, then exclude it
    let upd = await j(`/api/users/${id}`, { method: 'PUT', body: { follow: { mode: 'teams', teams: ['KC'], games: ['2026-W01-SF-LAR'] } } });
    let card = await j(`/api/users/${id}/game/2026-W01-SF-LAR`);
    assert.equal(card.body.followed, true);
    assert.equal(card.body.access.ok, false, 'no Netflix');
    upd = await j(`/api/users/${id}`, { method: 'PUT', body: { follow: { mode: 'teams', teams: ['KC'], games: [], excludeGames: ['2026-W01-DEN-KC'] } } });
    card = await j(`/api/users/${id}/game/2026-W01-DEN-KC`);
    assert.equal(card.body.followed, false);

    const alerts = await j(`/api/users/${id}/alerts`);
    assert.ok(Array.isArray(alerts.body.planned));
    assert.ok(alerts.body.planned.every((p) => p.fireAtLocal));

    const ics = await j(`/api/users/${id}/calendar.ics`);
    assert.equal(ics.status, 200);
    assert.match(ics.body, /BEGIN:VCALENDAR/);

    const sim = await j('/api/admin/simulate-change', { method: 'POST', body: { gameId: '2026-W02-IND-KC', kickoff: '2026-09-21T00:20:00Z', networks: ['NBC'] } });
    assert.equal(sim.status, 200);
    assert.ok(sim.body.changes.some((c) => c.type === 'time'));
    const ch = await j('/api/changes');
    assert.ok(ch.body.length >= 1);

    const test_ = await j(`/api/users/${id}/test`, { method: 'POST' });
    assert.equal(test_.status, 200);

    const del = await j(`/api/users/${id}`, { method: 'DELETE' });
    assert.equal(del.body.ok, true);
    assert.equal((await j(`/api/users/${id}`)).status, 404);
  } finally { server.close(); }
});
