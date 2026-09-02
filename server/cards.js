// Turn a raw schedule game + a user into the fully resolved "game card": both clocks in the
// user's zone with ET alongside, network, station, channel number for their provider, whether
// the game actually airs in their market, whether they can watch it with what they pay for,
// and which alerts are planned. Every derived fact carries a confidence.
import { TEAMS, teamLabel } from './schedule/teams.js';
import { coverageStart, WINDOWS } from './schedule/windows.js';
import { resolveChannel, accessCheck, networkLabel } from './market/marketService.js';
import { gameInMarket } from './coverage/coverageService.js';
import { fmtTime, fmtET, fmtDay, ET } from './util/time.js';

export function userTz(user) { return user?.tz || ET; }

export function isFollowed(user, game) {
  const f = user.follow || { mode: 'all' };
  const excluded = (f.excludeGames || []).includes(game.id);
  if (excluded) return { followed: false, reasons: ['excluded'] };
  const reasons = [];
  if ((f.games || []).includes(game.id)) reasons.push('picked game');
  if (f.mode === 'all') reasons.push('all games');
  if (f.mode === 'teams' || f.mode === 'all') {
    for (const t of f.teams || []) if (game.home === t || game.away === t) reasons.push(`team: ${teamLabel(t)}`);
  }
  if (f.mode === 'teams' && reasons.length === 0) return { followed: false, reasons };
  if (f.mode === 'games' && !(f.games || []).includes(game.id)) return { followed: false, reasons };
  return { followed: reasons.length > 0 || f.mode === 'all', reasons };
}

export function watchLine(user, game, inMarket) {
  const parts = [];
  for (const n of game.networks || []) {
    const ch = resolveChannel(user, n);
    let s = ch.station ? `${ch.station.call} (${networkLabel(n)})` : networkLabel(n);
    if (ch.number) s += ` ch. ${ch.number}`;
    parts.push(s);
  }
  for (const s of game.streams || []) parts.push(networkLabel(s));
  let line = parts.join(' · ') || 'Carrier TBD';
  if (inMarket && inMarket.airs === false && inMarket.instead) line = `Not on your local ${(game.networks || [])[0]} (they show ${teamLabel(inMarket.instead.away)} at ${teamLabel(inMarket.instead.home)})`;
  return line;
}

export function buildCard(user, game, allGames, { changes = [], plannedAlerts = [] } = {}) {
  const tz = userTz(user);
  const cov = coverageStart(game);
  const inMarket = user.market ? gameInMarket(game, user.market, allGames) : { airs: null, confidence: 'unknown', reason: 'Set your ZIP to see whether this game airs in your market.', instead: null };
  const access = accessCheck(user, game);
  const follow = isFollowed(user, game);
  const networks = (game.networks || []).map((n) => ({ network: n, label: networkLabel(n), channel: resolveChannel(user, n) }));
  const streams = (game.streams || []).map((s) => ({ key: s, label: networkLabel(s) }));
  return {
    id: game.id,
    week: game.week,
    away: { id: game.away, short: teamLabel(game.away), name: teamLabel(game.away, 'full') },
    home: { id: game.home, short: teamLabel(game.home), name: teamLabel(game.home, 'full') },
    title: `${teamLabel(game.away)} at ${teamLabel(game.home)}`,
    label: game.label || null,
    venue: game.venue || null,
    notes: game.notes || null,
    verified: game.verified !== false,
    timeTbd: Boolean(game.timeTbd),
    source: game.source || 'seed',
    window: game.window,
    windowLabel: WINDOWS[game.window]?.label || game.window,
    kickoff: { iso: game.kickoff, day: fmtDay(game.kickoff, tz), local: fmtTime(game.kickoff, tz), et: fmtET(game.kickoff), tz },
    coverage: { iso: cov.start, local: fmtTime(cov.start, tz), et: fmtET(cov.start), show: cov.show, confidence: cov.confidence, minutesBefore: cov.minutesBefore },
    carriers: { networks, streams, exclusive: game.exclusive || null, national: Boolean(game.national) },
    inMarket,
    access,
    watch: watchLine(user, game, inMarket),
    followed: follow.followed,
    followReasons: follow.reasons,
    alerts: plannedAlerts.filter((a) => a.gameId === game.id),
    changes: changes.filter((c) => c.gameId === game.id || c.key === `${game.week}:${[game.away, game.home].sort().join('-')}`).slice(-5),
  };
}
