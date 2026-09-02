// Time helpers. Everything the user sees is rendered in THEIR zone, with ET alongside,
// because the league publishes in ET and West-coast fans complain about converting.

export const ET = 'America/New_York';

function parts(iso, tz, opts) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).formatToParts(d);
}
function pick(ps, type) { return ps.find((p) => p.type === type)?.value; }

export function tzAbbr(iso, tz) {
  const ps = parts(iso, tz, { timeZoneName: 'short' });
  const v = pick(ps, 'timeZoneName') || tz;
  // Some runtimes give "GMT-4" for zones without a short name; keep it readable.
  return v;
}

export function fmtTime(iso, tz, { withZone = true } = {}) {
  const ps = parts(iso, tz, { hour: 'numeric', minute: '2-digit', hour12: true });
  const t = `${pick(ps, 'hour')}:${pick(ps, 'minute')} ${pick(ps, 'dayPeriod').toLowerCase()}`;
  return withZone ? `${t} ${tzAbbr(iso, tz)}` : t;
}

export function fmtET(iso) {
  return fmtTime(iso, ET, { withZone: false }) + ' ET';
}

export function fmtDay(iso, tz) {
  const ps = parts(iso, tz, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${pick(ps, 'weekday')} ${pick(ps, 'month')} ${pick(ps, 'day')}`;
}

export function fmtDateTime(iso, tz) {
  return `${fmtDay(iso, tz)}, ${fmtTime(iso, tz)}`;
}

export function dayKey(iso, tz) {
  const ps = parts(iso, tz, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${pick(ps, 'year')}-${pick(ps, 'month')}-${pick(ps, 'day')}`;
}

export function minutesUntil(iso, now = new Date()) {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
}

export function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

// quiet = { start: 'HH:MM', end: 'HH:MM' } in the user's zone. Handles overnight ranges.
export function inQuietHours(nowIso, tz, quiet) {
  if (!quiet || !quiet.start || !quiet.end || quiet.start === quiet.end) return false;
  const ps = parts(nowIso, tz, { hour: 'numeric', minute: 'numeric', hour12: false });
  const h = parseInt(pick(ps, 'hour'), 10) % 24;
  const m = parseInt(pick(ps, 'minute'), 10);
  const cur = h * 60 + m;
  const [sh, sm] = quiet.start.split(':').map(Number);
  const [eh, em] = quiet.end.split(':').map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

export function humanLead(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes / 1440 === 1 ? '' : 's'}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes / 60 === 1 ? '' : 's'}`;
  return `${minutes} min`;
}

export function isValidTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
