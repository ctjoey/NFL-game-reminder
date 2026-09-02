// Every alert says: what game, when coverage begins, when kickoff is (user's zone + ET),
// which network/service, and what channel that is in the user's market. Short enough for a
// lock screen, complete enough that the user never has to open anything else.
import { humanLead } from '../util/time.js';

function chan(card) {
  const n = card.carriers.networks[0];
  if (n) {
    const c = n.channel;
    const station = c.station ? `${c.station.call} (${n.label})` : n.label;
    const num = c.number ? ` ch. ${c.number}` : (c.hint ? '' : '');
    return `${station}${num}`;
  }
  if (card.carriers.exclusive) return `${card.carriers.exclusive} only`;
  return card.carriers.streams.map((s) => s.label).join('/') || 'carrier TBD';
}

function marketWarning(card) {
  if (card.inMarket?.airs === false && card.inMarket.instead) {
    return ` Note: your local ${card.carriers.networks[0]?.label || 'station'} shows ${card.inMarket.instead.away} at ${card.inMarket.instead.home} instead.`;
  }
  return '';
}

export function coverageAlert(card) {
  return {
    type: 'coverage',
    title: `Coverage starting: ${card.title}`,
    body: `${card.coverage.show} on ${chan(card)} from ${card.coverage.local}. Kickoff ${card.kickoff.local} (${card.kickoff.et}).${marketWarning(card)}`,
  };
}

export function kickoffLeadAlert(card, minutes) {
  return {
    type: `kickoff_${minutes}`,
    title: `Kickoff in ${humanLead(minutes)}: ${card.title}`,
    body: `${card.kickoff.local} (${card.kickoff.et}) on ${chan(card)}. Coverage already on since ${card.coverage.local}.${marketWarning(card)}`,
  };
}

export function kickoffNowAlert(card) {
  return {
    type: 'kickoff_0',
    title: `Kickoff now: ${card.title}`,
    body: `${chan(card)} · ${card.kickoff.local} (${card.kickoff.et}).${marketWarning(card)}`,
  };
}

export function accessAlert(card) {
  const missing = card.access.missing.map((m) => m.label + (m.cost ? ` (${m.cost})` : '')).join(', ');
  const notes = card.access.notes.join(' ');
  const when = `${card.kickoff.day} ${card.kickoff.local}`;
  if (!card.access.ok) {
    return {
      type: 'access',
      title: `Heads up: you may not be able to watch ${card.title}`,
      body: `${when}. It is on ${chan(card)}${card.carriers.exclusive ? ` (${card.carriers.exclusive} exclusive)` : ''}. Not in your services. Options: ${missing || 'see game details'}. ${notes}`.trim(),
    };
  }
  return {
    type: 'access',
    title: `Where to watch ${card.title}`,
    body: `${when} on ${chan(card)}. You can watch via ${card.access.ways.map((w) => w.label).join(', ')}. ${notes}`.trim(),
  };
}

export function changeAlert(card, change, tz) {
  const what = change.type === 'date' ? 'moved to a new day' : change.type === 'time' ? 'new kickoff time' : change.type === 'network' ? 'new network' : 'schedule change';
  let detail = '';
  if (change.type === 'time' || change.type === 'date') detail = `Now ${card.kickoff.day} ${card.kickoff.local} (${card.kickoff.et}), coverage from ${card.coverage.local}.`;
  else if (change.type === 'network') detail = `Now on ${chan(card)}.`;
  return {
    type: 'change',
    title: `Schedule change: ${card.title} (${what})`,
    body: `${detail} Was: ${change.oldLabel || JSON.stringify(change.old)}. Your reminders were updated automatically.`,
  };
}

export function weeklyAlert(cards, weekNo) {
  const lines = cards.map((c) => `${c.kickoff.day.split(' ')[0]} ${c.kickoff.local.replace(/ [A-Z]{2,4}$/, '')} ${c.title} · ${chan(c)}${c.access.ok ? '' : ' ⚠︎ not in your services'}`);
  return {
    type: 'weekly',
    title: `Week ${weekNo}: ${cards.length} game${cards.length === 1 ? '' : 's'} you follow`,
    body: lines.join('\n') || 'No followed games this week.',
  };
}

export function testAlert(user) {
  return { type: 'test', title: 'NFL Game Reminder is set up', body: `Alerts will arrive on this device in ${user.tz || 'ET'}. No ads, no news, only the games you picked.` };
}
