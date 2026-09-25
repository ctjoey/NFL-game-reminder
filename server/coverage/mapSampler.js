// Read a published coverage map by sampling its pixels, instead of by looking at it.
//
// Every wrong entry this pipeline has produced came from the same human failure: taking a market's
// colour from a label near it rather than from the market itself. Albuquerque was read as the blue
// plains because Denver is blue; Knoxville as red because Atlanta is. A program sampling a fixed
// coordinate cannot make that mistake - it can only be right, or uncertain and say so.
//
// Three ideas do the work:
//
// Classify, then vote. Hatched fills, DMA borders, place labels and the site's watermark all put
// stray pixels inside a market. Averaging them produces a colour that belongs to no game at all.
// So every pixel is matched to its nearest legend swatch or rejected, and the market takes the
// majority - the same way your eye ignores the hatching.
//
// Purity is the confidence signal. A market deep inside one region votes unanimously. A market on
// a boundary splits. That split is the whole point: it is the machine-readable version of "I
// cannot tell which side of the line this is on", and it leaves the slot open rather than
// publishing a coin flip as confirmed.
//
// Verify against football. A coverage map always gives a team's own market that team's game. With
// a dozen regional games that is two dozen independent assertions about whether the projection is
// aimed correctly, checkable before any of the output is believed.
import { pixelAt } from './png.js';
import { MARKET_LATLON, OFF_MAP } from './geo.js';

/// Squared distance in RGB. Good enough here: the legend colours 506 picks are far apart by
/// construction, because a human has to tell them apart at a glance too.
function dist2(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/// Ink rather than fill: near-white and near-black are labels, borders and the watermark. Rejecting
/// them by brightness is cruder than segmenting them properly and works because no legend colour is
/// ever near either extreme - a map whose games were white and black would be unreadable.
function isInk(p) {
  const max = Math.max(p[0], p[1], p[2]), min = Math.min(p[0], p[1], p[2]);
  return (max > 235 && max - min < 22) || max < 45;
}

const DEFAULTS = {
  // Tried smallest first. A small disc is the honest one - it asks about this market and not its
  // neighbours - but the place label sits exactly on the point being sampled, so a small disc can
  // come back as nothing but white. Widening only when too little was classified gets the tight
  // eastern DMAs right without going blind on the labels.
  radii: [0.004, 0.007, 0.012],
  tolerance: 62,      // how far a pixel may sit from a swatch and still count as that game
  minPurity: 0.80,    // below this the market is on a boundary and stays open
  minClassified: 24,  // too few usable pixels means we sampled ocean, a label, or off the canvas
};

/**
 * Sample one point and decide which legend entry it belongs to.
 *
 * @param img      decoded PNG
 * @param point    { x, y } normalized 0..1
 * @param legend   [{ key, rgb }]
 */
export function samplePoint(img, point, legend, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const radii = o.radius != null ? [o.radius] : o.radii;
  let last = null;
  for (const radius of radii) {
    last = sampleDisc(img, point, legend, { ...o, radius });
    // Widen only for want of pixels. A split verdict is a real answer about a real boundary, and
    // widening would just blur it into the neighbour - which is the mistake being designed out.
    if (last.key || last.classified >= o.minClassified) return last;
  }
  return last;
}

function sampleDisc(img, point, legend, o) {
  const cx = point.x * img.width, cy = point.y * img.height;
  const r = Math.max(2, Math.round(o.radius * img.width));
  const tol2 = o.tolerance * o.tolerance;

  const votes = new Map();
  let classified = 0, ink = 0, rejected = 0, total = 0;

  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      total += 1;
      const p = pixelAt(img, x, y);
      if (isInk(p)) { ink += 1; continue; }
      let best = null, bestD = Infinity;
      for (const entry of legend) {
        const d = dist2(p, entry.rgb);
        if (d < bestD) { bestD = d; best = entry; }
      }
      if (!best || bestD > tol2) { rejected += 1; continue; }
      classified += 1;
      votes.set(best.key, (votes.get(best.key) || 0) + 1);
    }
  }

  let winner = null, count = 0;
  for (const [key, n] of votes) if (n > count) { winner = key; count = n; }
  const purity = classified ? count / classified : 0;
  const ok = winner !== null && classified >= o.minClassified && purity >= o.minPurity;

  return {
    key: ok ? winner : null,
    winner,
    purity,
    classified,
    radius: o.radius,
    sampled: total,
    inkFraction: total ? ink / total : 0,
    rejectedFraction: total ? rejected / total : 0,
    reason: ok ? null
      : winner === null ? 'nothing in the sample matched a legend colour'
      : classified < o.minClassified ? `only ${classified} usable pixels`
      : `split ${(purity * 100).toFixed(0)}% - this market straddles a boundary`,
  };
}

/**
 * Sample every market on one map.
 *
 * @param projection from fitProjection: market -> { x, y } normalized
 * @param offMapKey  the legend entry Alaska and Hawaii are drawn with, when the caller knows it
 */
export function sampleMap({ img, legend, projection, markets, offMapKey = null, options = {} }) {
  const results = {};
  for (const market of markets) {
    if (OFF_MAP.has(market)) {
      results[market] = offMapKey
        ? { key: offMapKey, purity: 1, offMap: true, reason: null }
        : { key: null, purity: 0, offMap: true, reason: 'drawn as a legend dot; no swatch supplied' };
      continue;
    }
    const point = projection(market);
    if (!point) { results[market] = { key: null, purity: 0, reason: 'no coordinates for this market' }; continue; }
    if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
      results[market] = { key: null, purity: 0, reason: 'projects outside the image' };
      continue;
    }
    results[market] = { ...samplePoint(img, point, legend, options), point };
  }
  return results;
}

/**
 * Check the sampling against something we already know to be true.
 *
 * A regional map gives a team's own market that team's game - always, it is why the maps have the
 * shape they do. So for every game on this map, both teams' markets are an assertion the sample
 * has to agree with. Disagreement means the projection is aimed wrong, and the right response is
 * to publish nothing.
 *
 * @param teamMarkets team abbreviation -> market key
 * @param games       [{ key, away, home }] the legend's games
 */
export function verifySampling(results, games, teamMarkets) {
  const checks = [];
  for (const g of games) {
    for (const team of [g.away, g.home]) {
      const market = teamMarkets[team];
      if (!market || OFF_MAP.has(market)) continue;
      const got = results[market];
      if (!got) continue;
      // Only a confident sample is evidence either way; an open one is silence, not a failure.
      if (!got.key) { checks.push({ team, market, expect: g.key, got: null, status: 'unsampled' }); continue; }
      checks.push({ team, market, expect: g.key, got: got.key, status: got.key === g.key ? 'ok' : 'wrong' });
    }
  }
  const decided = checks.filter((c) => c.status !== 'unsampled');
  const wrong = decided.filter((c) => c.status === 'wrong');
  return {
    ok: decided.length >= 4 && wrong.length === 0,
    checks,
    decided: decided.length,
    wrong,
    summary: `${decided.length - wrong.length}/${decided.length} home and away markets show their own team's game`,
  };
}

export const SAMPLER_DEFAULTS = DEFAULTS;
