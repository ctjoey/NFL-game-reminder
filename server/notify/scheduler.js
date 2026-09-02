// Alert planner + ticker.
//
// Design rules pulled straight from the review analysis:
//  - Alerts are derived from the schedule, not from live-score polling, so they cannot be late
//    because a feed lagged, and they re-derive automatically when a game moves.
//  - Every alert is opt-in per moment (coverage start, kickoff lead, kickoff, access check,
//    weekly digest, schedule change). Nothing else ever fires. No marketing.
//  - Idempotent: a sent-log key includes the kickoff instant, so a moved game re-arms its
//    reminders and an unchanged game never double-fires, even across restarts.
//  - Quiet hours delay non-time-critical alerts; game-time alerts still fire (you asked for them).
//  - Per-day cap stops runaway volume; the user can see everything planned in advance.
import { buildCard, isFollowed } from '../cards.js';
import { coverageStart } from '../schedule/windows.js';
import { addMinutes, dayKey, inQuietHours, fmtDateTime, ET } from '../util/time.js';
import * as T from './templates.js';
import { deliver } from './channels.js';

export const DEFAULT_ALERTS = { coverage: true, kickoffLeads: [30], kickoffNow: false, changes: true, access: true, weekly: true, weeklyDay: 'Wed', weeklyHour: 9 };
export const DEFAULT_QUIET = { start: '23:00', end: '08:00' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LATE_WINDOW_MIN = 45; // if the server was down, fire alerts up to this late; older ones are marked skipped

export function followedGames(user, games) {
  return games.filter((g) => isFollowed(user, g).followed);
}

// Weekly digest fire time for a given week: user's weeklyDay/weeklyHour in their zone, in the
// 7 days before the week's first kickoff. Computed by walking back from the first kickoff.
export function weeklyFireAt(user, weekGames) {
  if (!weekGames.length) return null;
  const a = user.alerts || DEFAULT_ALERTS;
  const tz = user.tz || ET;
  const first = new Date(Math.min(...weekGames.map((g) => new Date(g.kickoff).getTime())));
  const wantDay = DAYS.indexOf(a.weeklyDay || 'Wed');
  for (let back = 0; back < 8; back++) {
    const d = new Date(first.getTime() - back * 86400000);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const wd = DAYS.indexOf(parts.find((p) => p.type === 'weekday').value);
    if (wd !== wantDay) continue;
    const y = parts.find((p) => p.type === 'year').value, m = parts.find((p) => p.type === 'month').value, dd = parts.find((p) => p.type === 'day').value;
    return localToIso(`${y}-${m}-${dd}`, a.weeklyHour ?? 9, tz);
  }
  return null;
}

// Convert a wall-clock (date + hour) in tz to an ISO instant.
export function localToIso(ymd, hour, tz) {
  const guess = new Date(`${ymd}T${String(hour).padStart(2, '0')}:00:00Z`);
  const asTz = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false, minute: 'numeric' }).formatToParts(guess);
  const h = parseInt(asTz.find((p) => p.type === 'hour').value, 10) % 24;
  const offsetH = h - hour; // how far the guess drifted
  let fixed = new Date(guess.getTime() - offsetH * 3600000);
  // handle day wrap
  const check = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false }).formatToParts(fixed);
  const ymd2 = `${check.find((p) => p.type === 'year').value}-${check.find((p) => p.type === 'month').value}-${check.find((p) => p.type === 'day').value}`;
  if (ymd2 > ymd) fixed = new Date(fixed.getTime() - 86400000);
  if (ymd2 < ymd) fixed = new Date(fixed.getTime() + 86400000);
  return fixed.toISOString();
}

// Everything that will fire for this user, from `now` forward (and recent past within window).
export function plan(user, games, now = new Date()) {
  const a = { ...DEFAULT_ALERTS, ...(user.alerts || {}) };
  const out = [];
  const mine = followedGames(user, games);
  for (const g of mine) {
    const ver = g.kickoff;
    const cov = coverageStart(g);
    if (a.coverage) out.push({ key: `${user.id}|${g.id}|coverage|${ver}`, gameId: g.id, type: 'coverage', fireAt: cov.start, critical: true });
    for (const m of a.kickoffLeads || []) out.push({ key: `${user.id}|${g.id}|kickoff_${m}|${ver}`, gameId: g.id, type: `kickoff_${m}`, minutes: m, fireAt: addMinutes(g.kickoff, -m), critical: true });
    if (a.kickoffNow) out.push({ key: `${user.id}|${g.id}|kickoff_0|${ver}`, gameId: g.id, type: 'kickoff_0', fireAt: g.kickoff, critical: true });
    if (a.access) out.push({ key: `${user.id}|${g.id}|access|${ver}`, gameId: g.id, type: 'access', fireAt: addMinutes(g.kickoff, -24 * 60), critical: false });
  }
  if (a.weekly) {
    const weeks = [...new Set(mine.map((g) => g.week))];
    for (const w of weeks) {
      const wg = mine.filter((g) => g.week === w);
      const at = weeklyFireAt(user, wg);
      if (at) out.push({ key: `${user.id}|week${w}|weekly|${wg.map((g) => g.kickoff).join(',')}`, gameId: null, week: w, type: 'weekly', fireAt: at, critical: false });
    }
  }
  return out.filter((x) => new Date(x.fireAt).getTime() > now.getTime() - LATE_WINDOW_MIN * 60000).sort((x, y) => x.fireAt.localeCompare(y.fireAt));
}

export function previewFor(user, games, now = new Date()) {
  const tz = user.tz || ET;
  return plan(user, games, now).map((p) => ({ ...p, fireAtLocal: fmtDateTime(p.fireAt, tz), game: p.gameId ? games.find((g) => g.id === p.gameId) : null }));
}

export class Scheduler {
  constructor({ db, schedule, logger = console, deliverImpl = deliver, inbox = [] }) {
    this.db = db; this.schedule = schedule; this.log = logger; this.deliverImpl = deliverImpl; this.inbox = inbox;
    this.timer = null;
    schedule.onChange((changes) => this.onScheduleChanges(changes).catch((e) => logger.error('[scheduler] change handling failed', e)));
  }
  start(intervalMs = 30000) { this.stop(); this.timer = setInterval(() => this.tick().catch((e) => this.log.error('[scheduler] tick failed', e)), intervalMs); this.timer.unref?.(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  sentToday(user, now) {
    const dk = dayKey(now.toISOString(), user.tz || ET);
    return this.db.sentEntries(`${user.id}|`).filter(([, v]) => v.at && dayKey(v.at, user.tz || ET) === dk && v.delivered).length;
  }

  buildMessage(user, item, games) {
    const card = item.gameId ? buildCard(user, games.find((g) => g.id === item.gameId), games) : null;
    let msg;
    if (item.type === 'coverage') msg = T.coverageAlert(card);
    else if (item.type === 'kickoff_0') msg = T.kickoffNowAlert(card);
    else if (item.type.startsWith('kickoff_')) msg = T.kickoffLeadAlert(card, item.minutes ?? parseInt(item.type.split('_')[1], 10));
    else if (item.type === 'access') {
      // Only bother the user if there is something to say: they can't watch it, or there is a caveat.
      if (card.access.ok && !card.access.notes.length && card.inMarket.airs !== false) return null;
      msg = T.accessAlert(card);
      if (card.inMarket.airs === false) msg.body += ` Also: ${card.inMarket.reason}.`;
    } else if (item.type === 'weekly') {
      const cards = followedGames(user, games).filter((g) => g.week === item.week).map((g) => buildCard(user, g, games));
      msg = T.weeklyAlert(cards, item.week);
    }
    if (!msg) return null;
    return { ...msg, gameId: item.gameId || null, url: item.gameId ? `/?game=${encodeURIComponent(item.gameId)}` : '/', tag: item.key };
  }

  async tick(now = new Date()) {
    const games = this.schedule.all();
    let fired = 0;
    for (const user of this.db.users()) {
      const items = plan(user, games, now).filter((i) => new Date(i.fireAt).getTime() <= now.getTime());
      for (const item of items) {
        if (this.db.wasSent(item.key)) continue;
        const ageMin = (now.getTime() - new Date(item.fireAt).getTime()) / 60000;
        if (ageMin > LATE_WINDOW_MIN) { this.db.markSent(item.key, { at: now.toISOString(), delivered: false, reason: 'too late' }); continue; }
        const quiet = user.quiet === null ? null : (user.quiet || DEFAULT_QUIET);
        if (!item.critical && inQuietHours(now.toISOString(), user.tz || ET, quiet)) continue; // try again after quiet hours
        const cap = user.maxPerDay ?? 12;
        if (this.sentToday(user, now) >= cap) { this.db.markSent(item.key, { at: now.toISOString(), delivered: false, reason: 'daily cap' }); this.log.warn(`[scheduler] ${user.id} hit daily cap; skipped ${item.type}`); continue; }
        const msg = this.buildMessage(user, item, games);
        if (!msg) { this.db.markSent(item.key, { at: now.toISOString(), delivered: false, reason: 'nothing to say' }); continue; }
        const results = await this.deliverImpl(user, msg, { db: this.db, logger: this.log, inbox: this.inbox });
        this.db.markSent(item.key, { at: now.toISOString(), delivered: true, type: item.type, gameId: item.gameId, results });
        fired++;
      }
    }
    return fired;
  }

  // A moved/renetworked game: one alert per game per sync for everyone following it, however
  // many fields changed. The kickoff-versioned keys re-arm the reminders on their own.
  async onScheduleChanges(changes) {
    const games = this.schedule.all();
    const byGame = new Map();
    for (const c of changes) if (['time', 'date', 'network'].includes(c.type)) { if (!byGame.has(c.gameId)) byGame.set(c.gameId, []); byGame.get(c.gameId).push(c); }
    for (const user of this.db.users()) {
      const a = { ...DEFAULT_ALERTS, ...(user.alerts || {}) };
      if (!a.changes) continue;
      const tz = user.tz || ET;
      for (const [gameId, list] of byGame) {
        const g = games.find((x) => x.id === gameId) || list[0].game;
        if (!g || !isFollowed(user, g).followed) continue;
        const key = `${user.id}|${g.id}|change|${g.kickoff}|${(g.networks || []).join('/')}|${(g.streams || []).join('/')}`;
        if (this.db.wasSent(key)) continue;
        const card = buildCard(user, g, games);
        const prev = list[0].previous || {};
        const kinds = new Set(list.map((c) => c.type));
        const summary = { type: kinds.has('date') ? 'date' : kinds.has('time') ? 'time' : 'network', old: null };
        const wasParts = [];
        if (kinds.has('date') || kinds.has('time')) wasParts.push(fmtDateTime(prev.kickoff || list.find((c) => c.field === 'kickoff')?.old, tz));
        if (kinds.has('network')) wasParts.push([...(prev.networks || []), ...(prev.streams || [])].join('/') || 'previous carrier');
        const msg = T.changeAlert(card, { ...summary, oldLabel: wasParts.join(' on ') }, tz);
        if (kinds.has('network') && (kinds.has('date') || kinds.has('time'))) msg.body = `Now ${card.kickoff.day} ${card.kickoff.local} (${card.kickoff.et}) on ${card.watch}, coverage from ${card.coverage.local}. Was: ${wasParts.join(' on ')}. Your reminders were updated automatically.`;
        const results = await this.deliverImpl(user, { ...msg, gameId: g.id, url: `/?game=${encodeURIComponent(g.id)}`, tag: key }, { db: this.db, logger: this.log, inbox: this.inbox });
        this.db.markSent(key, { delivered: true, type: 'change', gameId: g.id, results });
      }
    }
  }
}
