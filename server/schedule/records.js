// Won-lost records, derived rather than fetched.
//
// Every completed game already carries its final score, so the standings are arithmetic on data we
// hold. That is worth more than reading ESPN's own record field: the record can never disagree
// with the scores the app is showing, because it is computed from them.
//
// The record is the one a team *brings into* a given game, not its record today. On an upcoming
// game that is the same thing. On a game from three weeks ago it is the honest answer - a card
// saying "Steelers (1-0)" for a week 2 game should still say 1-0 in December.

/// "1-0", or "9-7-1" when there is a tie to report. Ties are rare enough that always printing the
/// third number would be noise, and common enough that dropping it would be wrong.
export function summarize(rec) {
  if (!rec) return null;
  return rec.ties > 0 ? `${rec.wins}-${rec.losses}-${rec.ties}` : `${rec.wins}-${rec.losses}`;
}

/// Every team's record from games finished before `instant`.
export function recordsBefore(games, instant) {
  const at = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  const out = {};
  const bump = (team) => (out[team] ||= { wins: 0, losses: 0, ties: 0 });
  for (const g of games) {
    const f = g.finalScore;
    if (!f) continue;                                   // not played, or not played yet as far as we know
    if (new Date(g.kickoff).getTime() >= at) continue;  // hasn't happened yet relative to this card
    const away = bump(g.away);
    const home = bump(g.home);
    if (f.away === f.home) { away.ties += 1; home.ties += 1; }
    else if (f.away > f.home) { away.wins += 1; home.losses += 1; }
    else { home.wins += 1; away.losses += 1; }
  }
  return out;
}

/// The two records a matchup card needs, already formatted. Null when a team has not played yet -
/// "(0-0)" on every card in week 1 is clutter that tells nobody anything.
export function matchupRecords(games, game) {
  const table = recordsBefore(games, game.kickoff);
  const fmt = (t) => {
    const r = table[t];
    return r && (r.wins || r.losses || r.ties) ? summarize(r) : null;
  };
  return { away: fmt(game.away), home: fmt(game.home) };
}
