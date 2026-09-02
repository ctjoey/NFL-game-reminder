// Subscribable calendar feed (webcal). Calendar apps re-fetch it, so a flexed game moves in the
// user's calendar without them doing anything. Each event carries both clocks, the carrier and
// the channel in the user's market, plus alarms at the user's lead times.
import crypto from 'node:crypto';
import { buildCard } from './cards.js';
import { followedGames, DEFAULT_ALERTS } from './notify/scheduler.js';

function esc(s) { return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
function utc(iso) { return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
function fold(line) { const out = []; let s = line; while (s.length > 73) { out.push(s.slice(0, 73)); s = ' ' + s.slice(73); } out.push(s); return out.join('\r\n'); }

export function buildIcs(user, games, { baseUrl = '' } = {}) {
  const a = { ...DEFAULT_ALERTS, ...(user.alerts || {}) };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//nfl-game-reminder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:NFL games I follow', 'X-PUBLISHED-TTL:PT1H', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H'];
  for (const g of followedGames(user, games)) {
    const c = buildCard(user, g, games);
    const seq = parseInt(crypto.createHash('md5').update(g.kickoff + JSON.stringify(g.networks) + JSON.stringify(g.streams)).digest('hex').slice(0, 6), 16);
    const desc = [
      `Coverage begins: ${c.coverage.local} (${c.coverage.et}) — ${c.coverage.show}`,
      `Kickoff: ${c.kickoff.local} (${c.kickoff.et})`,
      `Watch: ${c.watch}`,
      c.inMarket?.airs === false ? `Market note: ${c.inMarket.reason}` : null,
      c.access.ok ? `You can watch via: ${c.access.ways.map((w) => w.label).join(', ')}` : `Not in your services. Options: ${c.access.missing.map((m) => m.label).join(', ')}`,
      ...c.access.notes,
      c.label ? c.label : null,
      c.venue ? `Venue: ${c.venue}` : null,
      baseUrl ? `${baseUrl}/?game=${encodeURIComponent(g.id)}` : null,
    ].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${g.id}@nfl-game-reminder`, `DTSTAMP:${utc(new Date().toISOString())}`, `SEQUENCE:${seq}`, `DTSTART:${utc(g.kickoff)}`, 'DURATION:PT3H30M', fold(`SUMMARY:${esc(`${c.title} — ${c.watch}`)}`), fold(`DESCRIPTION:${esc(desc)}`), c.venue ? fold(`LOCATION:${esc(c.venue)}`) : null, `CATEGORIES:NFL`);
    if (a.coverage) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(`Coverage begins: ${c.title} on ${c.watch}`)}`), `TRIGGER:-PT${c.coverage.minutesBefore}M`, 'END:VALARM');
    for (const m of a.kickoffLeads || []) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(`Kickoff in ${m} min: ${c.title} on ${c.watch}`)}`), `TRIGGER:-PT${m}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n') + '\r\n';
}
