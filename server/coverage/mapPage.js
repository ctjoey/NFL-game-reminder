// Turn a published coverage-map page into something the sampler can read.
//
// The page is laid out as a run of sections: a map image, then one `<div id='game'>` per game in
// that map, each holding its legend swatch and its matchup. So the structure is positional - a map
// image opens a section and the game blocks after it belong to it - which survives changes to the
// wrapper markup around them.
//
// Two things are deliberately strict. A matchup that does not resolve to exactly one game in the
// week's schedule is an error, not a best guess: "LA Chargers" and "LA Rams" share a city, and a
// near-match here would put a whole region on the wrong game. And a map image inside an HTML
// comment is not a map - it is how the page says the week's maps are written but not yet drawn.
import { TEAMS } from '../schedule/teams.js';

// Anything under this year's folder that names a network is a map. The revision suffix matters:
// 506 redrew week 4's FOX map and posted it as 04-FOX-V2.png, and a matcher that insisted on
// 04-FOX.png saw no FOX section at all - so the FOX games attached themselves to the CBS section
// above them and none of them resolved. It refused rather than publishing that, which is the
// system working, but the cause was two matchers disagreeing about what counts as a map.
const MAP_FILE = /(?:^|\/)(\d{2})-(CBS|FOX)(-E|-L)?((?:-[A-Z0-9]+)*)\.png$/i;

/// Anything that looks like it belongs to a map but did not classify. Reported rather than
/// ignored, because a naming change we silently skip is a whole network's coverage missing.
export function looksLikeMap(src) {
  return /\/(?:19|20)\d{2}\/[^/]*\.png$/i.test(src.split('?')[0])
      || /(?:^|\/)\d{2}-[A-Z]/i.test(src.split('?')[0]);
}

/// Which network and windows a map covers. A file marked -E or -L is one window of a doubleheader.
/// An unmarked file is a single-header: one map, both windows, and each game's own label says
/// which one it is in.
export function sectionKind(src) {
  const m = MAP_FILE.exec(src.split('?')[0]);
  if (!m) return null;
  const network = m[2].toUpperCase();
  const window = (m[3] || '').toUpperCase();
  const revision = (m[4] || '').replace(/^-/, '') || null;
  if (window === '-E') return { network, windows: ['SUN_EARLY'], singleHeader: false, revision };
  if (window === '-L') return { network, windows: ['SUN_LATE'], singleHeader: false, revision };
  return { network, windows: ['SUN_EARLY', 'SUN_LATE'], singleHeader: true, revision };
}

/// Every token that could reasonably name a team on one of these pages.
function aliases(id) {
  const t = TEAMS[id];
  const short = t.short.toLowerCase();
  const out = new Set([id.toLowerCase(), t.name.toLowerCase(), short, t.city.toLowerCase()]);
  // "LA Chargers" and "NY Jets" are how the page separates the two teams that share a city.
  if (t.city === 'Los Angeles') out.add(`la ${short}`);
  if (t.city === 'New York') out.add(`ny ${short}`);
  out.add(`${t.city.toLowerCase()} ${short}`);
  return out;
}

const ALIASES = Object.fromEntries(Object.keys(TEAMS).map((id) => [id, aliases(id)]));

/// Match one side of a matchup to a team, from a restricted candidate set. Restricting to the
/// teams actually playing in this window turns a fuzzy-matching problem into a small lookup.
function matchTeam(text, candidates) {
  const clean = text.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const hits = candidates.filter((id) => {
    for (const alias of ALIASES[id]) if (clean === alias || clean.endsWith(` ${alias}`) || clean === alias) return true;
    return false;
  });
  // Longest alias wins, so "LA Chargers" beats a bare city match on the other Los Angeles team.
  if (hits.length > 1) {
    const best = hits.map((id) => ({ id, len: Math.max(...[...ALIASES[id]].filter((a) => clean.includes(a)).map((a) => a.length), 0) }))
      .sort((a, b) => b.len - a.len);
    if (best[0].len > best[1].len) return best[0].id;
    return null;
  }
  return hits[0] ?? null;
}

/**
 * Parse the page into sections, each with its map and its games resolved to schedule ids.
 *
 * @param html  the page source
 * @param games the week's games, from the live schedule
 */
export function parseMapPage(html, games) {
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const problems = [];
  const sections = [];

  // One pass, in document order: a map image opens a section, game blocks fill it.
  const token = /<img[^>]+src=["']([^"']+)["'][^>]*>|<div[^>]+id=['"]game['"][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let m;
  while ((m = token.exec(live)) !== null) {
    if (m[1]) {
      const kind = sectionKind(m[1]);
      if (kind) sections.push({ src: m[1], ...kind, games: [] });
      else if (looksLikeMap(m[1])) problems.push(`"${m[1]}" looks like a map but did not classify`);
      continue;
    }
    const block = m[2] ?? '';
    const matchup = /id=['"]matchup['"][^>]*>([^<]+)</i.exec(block)?.[1]?.trim();
    const swatch = /<img[^>]+src=["']([^"']+)["']/i.exec(block)?.[1];
    if (!matchup || !swatch || !sections.length) continue;
    sections[sections.length - 1].games.push({ matchup, swatch });
  }

  for (const section of sections) {
    const pool = games.filter((g) => (g.networks || []).includes(section.network)
      && section.windows.includes(g.window));
    const teams = [...new Set(pool.flatMap((g) => [g.away, g.home]))];

    section.entries = section.games.map(({ matchup, swatch }) => {
      const late = /\(\s*late\s*\)/i.test(matchup);
      const [awayText, homeText] = matchup.split(/\s+(?:@|vs\.?)\s+/i);
      const away = awayText ? matchTeam(awayText, teams) : null;
      const home = homeText ? matchTeam(homeText, teams) : null;
      const game = away && home ? pool.find((g) => g.away === away && g.home === home) : null;
      if (!game) { problems.push(`"${matchup}" did not resolve to one ${section.network} game`); return null; }
      const window = section.singleHeader
        ? (late ? 'SUN_LATE' : 'SUN_EARLY')
        : section.windows[0];
      if (!section.singleHeader && game.window !== window) {
        problems.push(`${game.id} is a ${game.window} game but appears on the ${window} map`);
      }
      return { gameId: game.id, swatch, window, late };
    }).filter(Boolean);
  }

  return { sections, problems };
}

/// Map images the page lists but has commented out: drawn in the source, not yet published.
export function pendingMaps(html) {
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const all = (h) => [...h.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((x) => x[1]).filter((s) => sectionKind(s));
  const published = new Set(all(live));
  return [...new Set(all(html))].filter((s) => !published.has(s));
}
