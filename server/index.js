import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB } from './db.js';
import { ScheduleService } from './schedule/scheduleService.js';
import { TEAMS } from './schedule/teams.js';
import { listMarkets, listProviders, listServices, marketForZip, getMarket } from './market/marketService.js';
import { buildCard } from './cards.js';
import { Scheduler, previewFor, DEFAULT_ALERTS, DEFAULT_QUIET } from './notify/scheduler.js';
import { configurePush, deliver } from './notify/channels.js';
import { testAlert } from './notify/templates.js';
import { buildIcs } from './ics.js';
import { isValidTz, ET } from './util/time.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

export function createApp({ db = new DB(), schedule, scheduler, env = process.env } = {}) {
  schedule = schedule || new ScheduleService({ db });
  const inbox = [];
  scheduler = scheduler || new Scheduler({ db, schedule, inbox });
  const pushOn = configurePush(env);
  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use((req, res, next) => { res.setHeader('cache-control', 'no-store'); next(); });

  const userOr404 = (req, res) => { const u = db.getUser(req.params.id); if (!u) res.status(404).json({ error: 'unknown user' }); return u; };

  app.get('/api/config', (req, res) => {
    res.json({
      pushPublicKey: pushOn ? env.VAPID_PUBLIC_KEY : null,
      teams: Object.entries(TEAMS).map(([id, t]) => ({ id, ...t })),
      markets: listMarkets(), providers: listProviders(), services: listServices(),
      weeks: schedule.weeks(), currentWeek: schedule.currentWeek(),
      schedule: { ...schedule.meta, games: schedule.all().length },
      defaults: { alerts: DEFAULT_ALERTS, quiet: DEFAULT_QUIET, maxPerDay: 12 },
      baseUrl: BASE_URL,
    });
  });

  app.get('/api/lookup/zip/:zip', (req, res) => {
    const m = marketForZip(req.params.zip);
    res.json(m ? { key: m.key, name: m.name, state: m.state, tz: m.tz, teams: m.teams, affiliates: m.affiliates } : { key: null, message: 'ZIP not in the built-in market table yet. Pick your market from the list.' });
  });

  function sanitize(body, existing = {}) {
    const out = {};
    if (body.tz !== undefined) out.tz = isValidTz(body.tz) ? body.tz : (existing.tz || ET);
    if (body.zip !== undefined) out.zip = String(body.zip || '').slice(0, 10);
    if (body.market !== undefined) out.market = getMarket(body.market) ? body.market : null;
    if (body.provider !== undefined) out.provider = listProviders().some((p) => p.key === body.provider) ? body.provider : null;
    if (body.hasAntenna !== undefined) out.hasAntenna = Boolean(body.hasAntenna);
    if (body.services !== undefined) out.services = (Array.isArray(body.services) ? body.services : []).filter((s) => listServices().some((x) => x.key === s));
    if (body.channelOverrides !== undefined) out.channelOverrides = Object.fromEntries(Object.entries(body.channelOverrides || {}).filter(([k, v]) => /^[A-Za-z0-9+ ]{1,12}$/.test(k) && String(v).length <= 12).map(([k, v]) => [k, String(v).trim()]).filter(([, v]) => v !== ''));
    if (body.follow !== undefined) {
      const f = body.follow || {};
      out.follow = { mode: ['all', 'teams', 'games'].includes(f.mode) ? f.mode : 'teams', teams: (f.teams || []).filter((t) => TEAMS[t]), games: (f.games || []).filter((g) => typeof g === 'string').slice(0, 400), excludeGames: (f.excludeGames || []).filter((g) => typeof g === 'string').slice(0, 400) };
    }
    if (body.alerts !== undefined) {
      const a = body.alerts || {};
      out.alerts = { ...DEFAULT_ALERTS, ...a, kickoffLeads: [...new Set((a.kickoffLeads || []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 7 * 1440))].sort((x, y) => y - x).slice(0, 5), weeklyDay: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(a.weeklyDay) ? a.weeklyDay : 'Wed', weeklyHour: Math.min(23, Math.max(0, Number(a.weeklyHour ?? 9) | 0)) };
      for (const k of ['coverage', 'kickoffNow', 'changes', 'access', 'weekly']) out.alerts[k] = Boolean(out.alerts[k]);
    }
    if (body.quiet !== undefined) out.quiet = body.quiet && /^\d{2}:\d{2}$/.test(body.quiet.start || '') && /^\d{2}:\d{2}$/.test(body.quiet.end || '') ? { start: body.quiet.start, end: body.quiet.end } : null;
    if (body.maxPerDay !== undefined) out.maxPerDay = Math.min(50, Math.max(1, Number(body.maxPerDay) | 0));
    if (body.channels !== undefined) {
      const c = body.channels || {};
      out.channels = { ...(existing.channels || { push: [] }) };
      if (c.webhook !== undefined) out.channels.webhook = typeof c.webhook === 'string' && /^https?:\/\//.test(c.webhook) ? c.webhook.slice(0, 500) : null;
      if (c.sms !== undefined) out.channels.sms = typeof c.sms === 'string' && /^\+?[0-9\-() ]{7,20}$/.test(c.sms) ? c.sms : null;
    }
    if (body.name !== undefined) out.name = String(body.name || '').slice(0, 60);
    return out;
  }

  app.post('/api/users', (req, res) => {
    const fields = sanitize(req.body || {});
    const user = db.createUser({ tz: ET, services: [], follow: { mode: 'teams', teams: [], games: [], excludeGames: [] }, alerts: { ...DEFAULT_ALERTS }, quiet: { ...DEFAULT_QUIET }, maxPerDay: 12, channels: { push: [], webhook: null, sms: null }, hasAntenna: false, channelOverrides: {}, ...fields });
    res.status(201).json(user);
  });
  app.get('/api/users/:id', (req, res) => { const u = userOr404(req, res); if (u) res.json(u); });
  app.put('/api/users/:id', (req, res) => { const u = userOr404(req, res); if (!u) return; res.json(db.updateUser(u.id, sanitize(req.body || {}, u))); });
  app.delete('/api/users/:id', (req, res) => { const u = userOr404(req, res); if (!u) return; db.deleteUser(u.id); res.json({ ok: true }); });

  app.post('/api/users/:id/push', (req, res) => {
    const u = userOr404(req, res); if (!u) return;
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: 'subscription required' });
    const list = (u.channels?.push || []).filter((s) => s.endpoint !== sub.endpoint);
    list.push(sub);
    db.updateUser(u.id, { channels: { ...(u.channels || {}), push: list } });
    res.json({ ok: true, devices: list.length });
  });
  app.delete('/api/users/:id/push', (req, res) => {
    const u = userOr404(req, res); if (!u) return;
    const list = (u.channels?.push || []).filter((s) => s.endpoint !== req.body?.endpoint);
    db.updateUser(u.id, { channels: { ...(u.channels || {}), push: list } });
    res.json({ ok: true, devices: list.length });
  });

  app.get('/api/users/:id/week/:n', (req, res) => {
    const u = userOr404(req, res); if (!u) return;
    const games = schedule.all();
    const week = Number(req.params.n);
    const planned = previewFor(u, games);
    const cards = schedule.week(week).map((g) => buildCard(u, g, games, { changes: db.changes(), plannedAlerts: planned }));
    res.json({ week, cards, followedCount: cards.filter((c) => c.followed).length, alertsThisWeek: planned.filter((p) => (p.gameId && cards.some((c) => c.id === p.gameId)) || p.week === week).length, schedule: schedule.meta });
  });
  app.get('/api/users/:id/game/:gameId', (req, res) => {
    const u = userOr404(req, res); if (!u) return;
    const g = schedule.byId(req.params.gameId);
    if (!g) return res.status(404).json({ error: 'unknown game' });
    res.json(buildCard(u, g, schedule.all(), { changes: db.changes(), plannedAlerts: previewFor(u, schedule.all()) }));
  });
  app.get('/api/users/:id/alerts', (req, res) => {
    const u = userOr404(req, res); if (!u) return;
    const items = previewFor(u, schedule.all()).map((p) => ({ ...p, game: p.game ? { id: p.game.id, away: p.game.away, home: p.game.home } : null }));
    res.json({ planned: items, recent: [...db.sentEntries(`${u.id}|`)].map(([key, v]) => ({ key, ...v })).filter((x) => x.delivered).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30), inbox: inbox.filter((m) => m.userId === u.id).slice(-30).reverse() });
  });
  app.post('/api/users/:id/test', async (req, res) => {
    const u = userOr404(req, res); if (!u) return;
    const msg = { ...testAlert(u), url: '/', tag: 'test' };
    const results = await deliver(u, msg, { db, inbox });
    res.json({ ok: true, results, pushConfigured: pushOn });
  });
  app.get('/api/users/:id/calendar.ics', (req, res) => {
    const u = userOr404(req, res); if (!u) return;
    res.setHeader('content-type', 'text/calendar; charset=utf-8');
    res.setHeader('content-disposition', 'inline; filename="nfl-games.ics"');
    res.send(buildIcs(u, schedule.all(), { baseUrl: BASE_URL }));
  });

  app.get('/api/schedule/week/:n', (req, res) => res.json({ week: Number(req.params.n), games: schedule.week(req.params.n), meta: schedule.meta }));
  app.get('/api/changes', (req, res) => res.json(db.changes().slice(-100).reverse()));
  app.post('/api/admin/sync', async (req, res) => { const changes = await schedule.sync(); res.json({ ok: !schedule.meta.lastError, meta: schedule.meta, changes: changes.length }); });

  // Dev-only: simulate a flex so you can see the change alert + reminder re-arm end to end.
  if (env.NODE_ENV !== 'production' || env.ALLOW_SIMULATE === '1') {
    app.post('/api/admin/simulate-change', (req, res) => {
      const g = schedule.byId(req.body?.gameId);
      if (!g) return res.status(404).json({ error: 'unknown game' });
      const patched = { ...g };
      if (req.body.kickoff) patched.kickoff = new Date(req.body.kickoff).toISOString();
      if (req.body.networks) patched.networks = req.body.networks;
      if (req.body.streams) patched.streams = req.body.streams;
      if (req.body.window) patched.window = req.body.window;
      const games = schedule.all().map((x) => (x.id === g.id ? patched : x));
      const changes = schedule.applyGames(games, schedule.meta.source + '+simulated');
      res.json({ ok: true, changes });
    });
  }

  app.use(express.static(path.join(here, '..', 'public')));
  app.get('/health', (req, res) => res.json({ ok: true, games: schedule.all().length, source: schedule.meta.source, lastSync: schedule.meta.lastSync, push: pushOn }));
  return { app, db, schedule, scheduler, inbox };
}

export function startServer({ onListen } = {}) {
  const { app, db, schedule, scheduler } = createApp();
  const intervalMin = Number(process.env.SYNC_INTERVAL_MIN || 15);
  schedule.sync().then(() => db.flush());
  const syncTimer = setInterval(() => schedule.sync().catch(() => {}), intervalMin * 60000);
  syncTimer.unref?.();
  scheduler.start(30000);
  const server = app.listen(PORT, () => {
    console.log(`NFL Game Reminder listening on ${BASE_URL}`);
    console.log(`schedule: ${schedule.all().length} games from ${schedule.meta.source}; live sync every ${intervalMin} min (${process.env.SCHEDULE_SOURCE || 'espn'})`);
    console.log(`push: ${process.env.VAPID_PUBLIC_KEY ? 'configured' : 'not configured — run `npm run vapid` and put the keys in .env'}`);
    onListen?.(BASE_URL);
  });
  const stop = () => { db.flush(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return { server, app, db, schedule, scheduler, url: BASE_URL };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) startServer();
