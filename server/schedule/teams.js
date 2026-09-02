// The 32 NFL teams, their primary media market (DMA key in server/market/markets.json)
// and the IANA time zone of their home stadium.
export const TEAMS = {
  ARI: { name: 'Arizona Cardinals', short: 'Cardinals', city: 'Arizona', market: 'phoenix', tz: 'America/Phoenix', conf: 'NFC', div: 'West' },
  ATL: { name: 'Atlanta Falcons', short: 'Falcons', city: 'Atlanta', market: 'atlanta', tz: 'America/New_York', conf: 'NFC', div: 'South' },
  BAL: { name: 'Baltimore Ravens', short: 'Ravens', city: 'Baltimore', market: 'baltimore', tz: 'America/New_York', conf: 'AFC', div: 'North' },
  BUF: { name: 'Buffalo Bills', short: 'Bills', city: 'Buffalo', market: 'buffalo', tz: 'America/New_York', conf: 'AFC', div: 'East' },
  CAR: { name: 'Carolina Panthers', short: 'Panthers', city: 'Carolina', market: 'charlotte', tz: 'America/New_York', conf: 'NFC', div: 'South' },
  CHI: { name: 'Chicago Bears', short: 'Bears', city: 'Chicago', market: 'chicago', tz: 'America/Chicago', conf: 'NFC', div: 'North' },
  CIN: { name: 'Cincinnati Bengals', short: 'Bengals', city: 'Cincinnati', market: 'cincinnati', tz: 'America/New_York', conf: 'AFC', div: 'North' },
  CLE: { name: 'Cleveland Browns', short: 'Browns', city: 'Cleveland', market: 'cleveland', tz: 'America/New_York', conf: 'AFC', div: 'North' },
  DAL: { name: 'Dallas Cowboys', short: 'Cowboys', city: 'Dallas', market: 'dallas', tz: 'America/Chicago', conf: 'NFC', div: 'East' },
  DEN: { name: 'Denver Broncos', short: 'Broncos', city: 'Denver', market: 'denver', tz: 'America/Denver', conf: 'AFC', div: 'West' },
  DET: { name: 'Detroit Lions', short: 'Lions', city: 'Detroit', market: 'detroit', tz: 'America/Detroit', conf: 'NFC', div: 'North' },
  GB:  { name: 'Green Bay Packers', short: 'Packers', city: 'Green Bay', market: 'greenbay', tz: 'America/Chicago', conf: 'NFC', div: 'North' },
  HOU: { name: 'Houston Texans', short: 'Texans', city: 'Houston', market: 'houston', tz: 'America/Chicago', conf: 'AFC', div: 'South' },
  IND: { name: 'Indianapolis Colts', short: 'Colts', city: 'Indianapolis', market: 'indianapolis', tz: 'America/Indiana/Indianapolis', conf: 'AFC', div: 'South' },
  JAX: { name: 'Jacksonville Jaguars', short: 'Jaguars', city: 'Jacksonville', market: 'jacksonville', tz: 'America/New_York', conf: 'AFC', div: 'South' },
  KC:  { name: 'Kansas City Chiefs', short: 'Chiefs', city: 'Kansas City', market: 'kansascity', tz: 'America/Chicago', conf: 'AFC', div: 'West' },
  LV:  { name: 'Las Vegas Raiders', short: 'Raiders', city: 'Las Vegas', market: 'lasvegas', tz: 'America/Los_Angeles', conf: 'AFC', div: 'West' },
  LAC: { name: 'Los Angeles Chargers', short: 'Chargers', city: 'Los Angeles', market: 'losangeles', tz: 'America/Los_Angeles', conf: 'AFC', div: 'West' },
  LAR: { name: 'Los Angeles Rams', short: 'Rams', city: 'Los Angeles', market: 'losangeles', tz: 'America/Los_Angeles', conf: 'NFC', div: 'West' },
  MIA: { name: 'Miami Dolphins', short: 'Dolphins', city: 'Miami', market: 'miami', tz: 'America/New_York', conf: 'AFC', div: 'East' },
  MIN: { name: 'Minnesota Vikings', short: 'Vikings', city: 'Minnesota', market: 'minneapolis', tz: 'America/Chicago', conf: 'NFC', div: 'North' },
  NE:  { name: 'New England Patriots', short: 'Patriots', city: 'New England', market: 'boston', tz: 'America/New_York', conf: 'AFC', div: 'East' },
  NO:  { name: 'New Orleans Saints', short: 'Saints', city: 'New Orleans', market: 'neworleans', tz: 'America/Chicago', conf: 'NFC', div: 'South' },
  NYG: { name: 'New York Giants', short: 'Giants', city: 'New York', market: 'newyork', tz: 'America/New_York', conf: 'NFC', div: 'East' },
  NYJ: { name: 'New York Jets', short: 'Jets', city: 'New York', market: 'newyork', tz: 'America/New_York', conf: 'AFC', div: 'East' },
  PHI: { name: 'Philadelphia Eagles', short: 'Eagles', city: 'Philadelphia', market: 'philadelphia', tz: 'America/New_York', conf: 'NFC', div: 'East' },
  PIT: { name: 'Pittsburgh Steelers', short: 'Steelers', city: 'Pittsburgh', market: 'pittsburgh', tz: 'America/New_York', conf: 'AFC', div: 'North' },
  SF:  { name: 'San Francisco 49ers', short: '49ers', city: 'San Francisco', market: 'sanfrancisco', tz: 'America/Los_Angeles', conf: 'NFC', div: 'West' },
  SEA: { name: 'Seattle Seahawks', short: 'Seahawks', city: 'Seattle', market: 'seattle', tz: 'America/Los_Angeles', conf: 'NFC', div: 'West' },
  TB:  { name: 'Tampa Bay Buccaneers', short: 'Buccaneers', city: 'Tampa Bay', market: 'tampa', tz: 'America/New_York', conf: 'NFC', div: 'South' },
  TEN: { name: 'Tennessee Titans', short: 'Titans', city: 'Tennessee', market: 'nashville', tz: 'America/Chicago', conf: 'AFC', div: 'South' },
  WAS: { name: 'Washington Commanders', short: 'Commanders', city: 'Washington', market: 'washington', tz: 'America/New_York', conf: 'NFC', div: 'East' },
};

export const TEAM_IDS = Object.keys(TEAMS);

// ESPN and other feeds use a few different abbreviations.
const ALIASES = { WSH: 'WAS', JAC: 'JAX', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR', GNB: 'GB', KAN: 'KC', NWE: 'NE', NOR: 'NO', SFO: 'SF', TAM: 'TB' };
export function normalizeTeam(abbr) {
  if (!abbr) return null;
  const a = String(abbr).toUpperCase();
  if (TEAMS[a]) return a;
  if (ALIASES[a]) return ALIASES[a];
  // Try by nickname
  const hit = TEAM_IDS.find((id) => TEAMS[id].short.toLowerCase() === a.toLowerCase() || TEAMS[id].name.toLowerCase() === a.toLowerCase());
  return hit || null;
}

export function teamLabel(id, style = 'short') {
  const t = TEAMS[id];
  if (!t) return id;
  return style === 'full' ? t.name : t.short;
}
