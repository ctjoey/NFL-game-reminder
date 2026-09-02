// Broadcast windows and the pregame ("coverage begins") rules for each network.
//
// Reviews repeatedly show that fans confuse the time the network goes on air with kickoff.
// We model coverage start per network/window as minutes before kickoff, with the show name,
// and mark whether it is a published, stable convention ("stable") or a typical value that
// should be confirmed against the week's listings ("typical").

export const WINDOWS = {
  KICKOFF:   { label: 'NFL Kickoff (Wed/Thu opener)' },
  TNF:       { label: 'Thursday Night Football' },
  INTL:      { label: 'International (morning ET)' },
  SUN_EARLY: { label: 'Sunday early window' },
  SUN_LATE:  { label: 'Sunday late window' },
  SNF:       { label: 'Sunday Night Football' },
  MNF:       { label: 'Monday Night Football' },
  SAT:       { label: 'Saturday' },
  HOLIDAY:   { label: 'Holiday / special' },
};

// Minutes before kickoff that network coverage begins, by network then window.
// "*" is the fallback for that network.
const COVERAGE_RULES = {
  CBS: {
    SUN_EARLY: { minutes: 60, show: 'The NFL Today', confidence: 'stable' },
    SUN_LATE:  { minutes: 5, show: 'The NFL Today (late-window update; station already in NFL coverage)', confidence: 'stable' },
    '*':       { minutes: 60, show: 'CBS pregame', confidence: 'typical' },
  },
  FOX: {
    SUN_EARLY: { minutes: 120, show: 'FOX NFL Kickoff (11:00 ET), then FOX NFL Sunday (12:00 ET)', confidence: 'stable' },
    SUN_LATE:  { minutes: 5, show: 'FOX NFL Sunday (late-window update; station already in NFL coverage)', confidence: 'stable' },
    TNF:       { minutes: 60, show: 'FOX pregame', confidence: 'typical' },
    '*':       { minutes: 60, show: 'FOX pregame', confidence: 'typical' },
  },
  NBC: {
    SNF:     { minutes: 80, show: 'Football Night in America', confidence: 'stable' },
    KICKOFF: { minutes: 80, show: 'NFL Kickoff pregame / Football Night in America', confidence: 'typical' },
    HOLIDAY: { minutes: 80, show: 'Football Night in America', confidence: 'typical' },
    '*':     { minutes: 60, show: 'NBC pregame', confidence: 'typical' },
  },
  Peacock: {
    '*': { minutes: 80, show: 'Football Night in America (simulcast)', confidence: 'typical' },
  },
  ESPN: {
    MNF: { minutes: 135, show: 'Monday Night Countdown', confidence: 'typical' },
    '*': { minutes: 60, show: 'ESPN pregame', confidence: 'typical' },
  },
  ABC: {
    MNF: { minutes: 15, show: 'ABC joins MNF coverage (Countdown is on ESPN)', confidence: 'typical' },
    '*': { minutes: 60, show: 'ABC pregame', confidence: 'typical' },
  },
  Prime: {
    TNF: { minutes: 75, show: 'TNF Tonight', confidence: 'stable' },
    '*': { minutes: 75, show: 'TNF Tonight', confidence: 'typical' },
  },
  Netflix: {
    '*': { minutes: 60, show: 'Netflix NFL pregame', confidence: 'typical' },
  },
  NFLN: {
    '*': { minutes: 60, show: 'NFL GameDay Kickoff', confidence: 'typical' },
  },
  YouTube: {
    '*': { minutes: 60, show: 'YouTube pregame', confidence: 'typical' },
  },
  '*': { '*': { minutes: 60, show: 'Network pregame', confidence: 'typical' } },
};

export function coverageRule(network, window) {
  const byNet = COVERAGE_RULES[network] || COVERAGE_RULES['*'];
  return byNet[window] || byNet['*'] || COVERAGE_RULES['*']['*'];
}

// Given a game (kickoff ISO string, network list, window, optional coverageStart override)
// return { start: ISO, show, confidence, minutesBefore }.
export function coverageStart(game) {
  if (game.coverageStart) {
    return { start: game.coverageStart, show: game.coverageShow || 'Pregame', confidence: 'confirmed', minutesBefore: Math.round((new Date(game.kickoff) - new Date(game.coverageStart)) / 60000) };
  }
  const primary = (game.networks || [])[0] || '*';
  const rule = coverageRule(primary, game.window);
  const start = new Date(new Date(game.kickoff).getTime() - rule.minutes * 60000).toISOString();
  return { start, show: rule.show, confidence: rule.confidence, minutesBefore: rule.minutes };
}

// Infer a window from a kickoff instant (in ET) when the feed doesn't tell us.
export function inferWindow(kickoffISO, networks = []) {
  const d = new Date(kickoffISO);
  const et = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d);
  const get = (t) => et.find((p) => p.type === t)?.value;
  const wd = get('weekday');
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  const hm = hour * 60 + minute;
  if (wd === 'Sun') {
    if (hm < 12 * 60) return 'INTL';
    if (hm < 15 * 60 + 30) return 'SUN_EARLY';
    if (hm < 18 * 60 + 30) return 'SUN_LATE';
    return 'SNF';
  }
  if (wd === 'Mon') return 'MNF';
  if (wd === 'Thu') return 'TNF';
  if (wd === 'Sat') return 'SAT';
  if (wd === 'Wed') return 'KICKOFF';
  if (networks.includes('Netflix')) return 'HOLIDAY';
  return 'HOLIDAY';
}
