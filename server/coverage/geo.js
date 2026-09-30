// Where each television market sits, and how to turn that into a pixel on a coverage map.
//
// The sampler needs a point inside each DMA. A DMA's population centre is close enough to its
// principal city that the city works as the proxy, and the sampler's own uniformity test catches
// the cases where that lands too near a boundary - which is exactly where we want to stop guessing
// anyway.
//
// Coordinates are the principal city of the market, not the geometric centroid of the DMA. The two
// differ most in the sprawling western markets, and in those the DMA is large enough that it does
// not matter.

/// [latitude, longitude]. Honolulu is deliberately off-map: 506 draws Alaska and Hawaii as two
/// dots in the legend box rather than on the map, so it is resolved from a swatch, never a pixel.
export const MARKET_LATLON = {
  albany: [42.65, -73.76], albuquerque: [35.08, -106.65], atlanta: [33.75, -84.39],
  austin: [30.27, -97.74], bakersfield: [35.37, -119.02], baltimore: [39.29, -76.61],
  batonrouge: [30.45, -91.19], birmingham: [33.52, -86.80], birmingham2: [34.73, -86.59],
  boise: [43.62, -116.20], boston: [42.36, -71.06], buffalo: [42.89, -78.88],
  burlington: [44.48, -73.21], charlestonsc: [32.78, -79.93], charlestonwv: [38.35, -81.63],
  charlotte: [35.23, -80.84], chattanooga: [35.05, -85.31], chicago: [41.88, -87.63],
  cincinnati: [39.10, -84.51], cleveland: [41.50, -81.69], coloradosprings: [38.83, -104.82],
  columbus: [39.96, -83.00], dallas: [32.78, -96.80], dayton: [39.76, -84.19],
  denver: [39.74, -104.98], desmoines: [41.59, -93.62], detroit: [42.33, -83.05],
  elpaso: [31.76, -106.49], fortmyers: [26.64, -81.87], fresno: [36.75, -119.77],
  grandrapids: [42.96, -85.67], greenbay: [44.51, -88.02], greensboro: [36.07, -79.79],
  greenvillesc: [34.85, -82.39], harrisburg: [40.27, -76.88], hartford: [41.76, -72.69],
  honolulu: [21.31, -157.86], houston: [29.76, -95.37], indianapolis: [39.77, -86.16],
  jacksonville: [30.33, -81.66], kansascity: [39.10, -94.58], knoxville: [35.96, -83.92],
  lasvegas: [36.17, -115.14], lexington: [38.04, -84.50], littlerock: [34.75, -92.29],
  losangeles: [34.05, -118.24], louisville: [38.25, -85.76], madison: [43.07, -89.40],
  memphis: [35.15, -90.05], miami: [25.77, -80.19], milwaukee: [43.04, -87.91],
  minneapolis: [44.98, -93.27], mobile: [30.69, -88.04], myrtlebeach: [33.69, -78.89],
  nashville: [36.16, -86.78], neworleans: [29.95, -90.07], newyork: [40.71, -74.01],
  norfolk: [36.85, -76.29], oklahomacity: [35.47, -97.52], omaha: [41.26, -95.93],
  orlando: [28.54, -81.38], palmsprings: [33.83, -116.55], philadelphia: [39.95, -75.17],
  phoenix: [33.45, -112.07], pittsburgh: [40.44, -80.00], portland: [45.52, -122.68],
  portlandme: [43.66, -70.26], providence: [41.82, -71.41], raleigh: [35.78, -78.64],
  reno: [39.53, -119.81], richmond: [37.54, -77.44], roanoke: [37.27, -79.94],
  rochesterny: [43.16, -77.61], sacramento: [38.58, -121.49], saltlake: [40.76, -111.89],
  sanantonio: [29.42, -98.49], sandiego: [32.72, -117.16], sanfrancisco: [37.77, -122.42],
  savannah: [32.08, -81.09], scranton: [41.41, -75.66], seattle: [47.61, -122.33],
  shreveport: [32.53, -93.75], spokane: [47.66, -117.43], springfieldmo: [37.21, -93.29],
  stlouis: [38.63, -90.20], syracuse: [43.05, -76.15], tampa: [27.95, -82.46],
  toledo: [41.65, -83.54], tucson: [32.22, -110.97], tulsa: [36.15, -95.99],
  washington: [38.91, -77.04], westpalm: [26.71, -80.05], wichita: [37.69, -97.34],
  youngstown: [41.10, -80.65],
};

/// Markets 506 draws as a legend dot rather than a shape on the map.
export const OFF_MAP = new Set(['honolulu']);

// MARK: - fitting a projection

/// The terms of the model, evaluated at one point. A conic projection - which is what a US map
/// almost always is - is not affine, but over the continental United States a quadratic in
/// (lon, lat) tracks one to within a pixel or two, which is far inside a DMA.
function terms(lon, lat, quadratic) {
  const base = [1, lon, lat];
  return quadratic ? [...base, lon * lon, lat * lat, lon * lat] : base;
}

/// Solve A·x = b by Gaussian elimination with partial pivoting. Small and square; no need for
/// anything cleverer, and a dependency for a 6x6 solve would be absurd.
function solve(A, b) {
  const n = A.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;      // singular: the anchors are collinear
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c += 1) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);   // back-substitution is trivial: the matrix is diagonal now
}

/// Least squares through the normal equations. Enough anchors and this is stable; too few and
/// `solve` returns null rather than a confident wrong answer.
function leastSquares(rows, values) {
  const k = rows[0].length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < rows.length; i += 1) {
    for (let r = 0; r < k; r += 1) {
      b[r] += rows[i][r] * values[i];
      for (let c = 0; c < k; c += 1) A[r][c] += rows[i][r] * rows[i][c];
    }
  }
  return solve(A, b);
}

/**
 * Fit lon/lat -> normalized image coordinates from anchor points.
 *
 * Normalized, not pixels, so the fit survives 506 republishing the same map at a different size.
 * Only a re-projection or a re-crop invalidates it, and the sampler's verification step catches
 * that on the run it happens rather than in the feed a week later.
 *
 * @param anchors [{ market, x, y }] with x,y in 0..1
 */
export function fitProjection(anchors, { quadratic = null } = {}) {
  const pts = anchors
    .map((a) => ({ ...a, ll: MARKET_LATLON[a.market] }))
    .filter((a) => a.ll && !OFF_MAP.has(a.market));
  const useQuadratic = quadratic ?? pts.length >= 8;
  if (pts.length < (useQuadratic ? 6 : 3)) {
    throw new Error(`need at least ${useQuadratic ? 6 : 3} on-map anchors, got ${pts.length}`);
  }
  const rows = pts.map((p) => terms(p.ll[1], p.ll[0], useQuadratic));
  const cx = leastSquares(rows, pts.map((p) => p.x));
  const cy = leastSquares(rows, pts.map((p) => p.y));
  if (!cx || !cy) throw new Error('anchors are degenerate - they need to span the map, not a line');

  const project = (market) => {
    const ll = MARKET_LATLON[market];
    if (!ll) return null;
    const t = terms(ll[1], ll[0], useQuadratic);
    return {
      x: t.reduce((s, v, i) => s + v * cx[i], 0),
      y: t.reduce((s, v, i) => s + v * cy[i], 0),
    };
  };

  // How far the fit misses the anchors it was given. A good fit is a fraction of a percent; a bad
  // one means the anchors disagree with each other and nothing downstream should be trusted.
  const residuals = pts.map((p) => {
    const q = project(p.market);
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
  return {
    project,
    quadratic: useQuadratic,
    anchors: pts.length,
    worstResidual: Math.max(...residuals),
    meanResidual: residuals.reduce((a, b) => a + b, 0) / residuals.length,
  };
}

// MARK: - fitting without anchors

const RAD = Math.PI / 180;
const PHI0 = 37.5;   // the parallel the framing is quoted on
const LAM0 = -96;    // the meridian a US map is drawn symmetric about

/**
 * The map's shape, from five numbers: the lon/lat box it is framed to, plus how conic it is.
 *
 * A plain box says x depends only on longitude and y only on latitude. That is very nearly true
 * of these maps - it placed 23 of 24 home markets correctly - but "very nearly" is not the job.
 * The one it missed was Las Vegas, which a box put far enough west to read as San Francisco's
 * game. That is the signature of a conic: on a conic the meridians lean in towards the poles and
 * the parallels bow, and both errors are largest in the far west at mid latitudes, which is
 * exactly where Las Vegas sits.
 *
 * So the box gets one more parameter: `n`, the cone constant. At n = 0 the meridians are parallel
 * and this is the old box, exactly; at n ~ 0.6 it is a standard US conic. The framing keeps its
 * meaning either way - lonW and lonE are the edges at the central parallel, latN and latS the
 * edges along the central meridian - so a search that used to look for four numbers now looks for
 * five and can still find the old answer.
 *
 * @param n cone constant, 0 (cylindrical) to about 0.65
 */
export function conicProjection({ lonW, lonE, latN, latS, n = 0 }) {
  // Vertical framing: along the central meridian latitude is linear, whatever the cone does.
  const q = 1 / ((latN - latS) * RAD);
  const cy = q * (latN - PHI0) * RAD;

  // Horizontal framing: x = cx + rho * sin(n * dlon), fitted so the two edge meridians land on
  // 0 and 1 at the central parallel.
  const sinT = (lon) => (n === 0 ? (lon - LAM0) * RAD : Math.sin(n * (lon - LAM0) * RAD));
  const p = 1 / (sinT(lonE) - sinT(lonW));
  const cx = -p * sinT(lonW);

  // How fast the arcs close in, as a fraction of the radius per radian of latitude. On a cone
  // touching the sphere at the central parallel the radius there is cos(phi0) / n, so this is
  // n / cos(phi0) - one number, derived, not another thing to search for. It is what keeps the
  // leaning meridians and the bowing parallels describing the same cone: x and y are measured in
  // different units here (the map is not square), and a ratio is the only honest way across.
  const beta = n / Math.cos(PHI0 * RAD);

  return (market) => {
    const ll = MARKET_LATLON[market];
    if (!ll) return null;
    const dphi = (ll[0] - PHI0) * RAD;
    if (n === 0) return { x: cx + p * (ll[1] - LAM0) * RAD, y: cy - q * dphi };
    const theta = n * (ll[1] - LAM0) * RAD;
    const f = 1 - beta * dphi;                        // this arc, relative to the central one
    return { x: cx + p * f * Math.sin(theta), y: cy - (q / beta) * (1 - f * Math.cos(theta)) };
  };
}

/// The cylindrical case, kept by name because that is what a saved calibration may still say.
export function boxProjection(box) {
  return conicProjection({ ...box, n: box.n ?? 0 });
}

/**
 * Find the projection by searching, scored on something already known to be true.
 *
 * Measuring anchor points by eye needs someone to look at the map. The home-market rule does not:
 * a coverage map always gives a team's own market that team's game, so a projection can be scored
 * by how many of those it gets right, and the best-scoring one is the aim. Two dozen assertions
 * spread across the country is a lot to satisfy by accident.
 *
 * Each search is a coarse pass then three refinements around the winner. It runs twice: once with
 * the meridians held parallel, once with the cone free. The cylindrical answer wins ties, and the
 * conic has to beat it on constraints satisfied - not on purity, not on being a closer fit. That
 * rule is not decoration. A free cone constant is enough extra freedom to satisfy every home
 * market with the wrong shape: on a map drawn dead flat it found a conic that honoured all
 * sixteen assertions and then read six other markets confidently wrong. A degree of freedom that
 * only buys a better-looking fit buys nothing, so it has to buy a fact.
 *
 * @param score (project) => hits * 1000 + a tiebreaker below 1000
 */
export function searchProjection(score, { onProgress = null } = {}) {
  const around = (centre, span, steps, floor = -Infinity) =>
    [...new Set(Array.from({ length: steps },
      (_, i) => Math.max(floor, centre - span + (2 * span * i) / (steps - 1))))];

  const spans = [3, 1, 0.4, 0.15];
  const nSpans = [0.08, 0.03, 0.012];

  const run = (cones, label) => {
    let best = null;
    let grid = {
      lonW: around(-121, 6, 7), lonE: around(-66, 6, 7),
      latN: around(49.5, 3.5, 6), latS: around(24, 4, 6), n: cones,
    };
    for (let pass = 0; pass < spans.length; pass += 1) {
      for (const lonW of grid.lonW) for (const lonE of grid.lonE) {
        if (lonE - lonW < 40) continue;                  // a box too narrow to be the country
        for (const latN of grid.latN) for (const latS of grid.latS) {
          if (latN - latS < 15) continue;
          for (const n of grid.n) {
            const box = { lonW, lonE, latN, latS, n };
            const hits = score(conicProjection(box));
            if (!best || hits > best.hits) best = { box, hits };
          }
        }
      }
      onProgress?.(label, pass, best);
      // Tighten around the winner: each pass looks at a fraction of the previous span.
      const b = best.box;
      const span = spans[pass];
      grid = {
        lonW: around(b.lonW, span, 5), lonE: around(b.lonE, span, 5),
        latN: around(b.latN, span * 0.7, 5), latS: around(b.latS, span * 0.7, 5),
        n: cones.length === 1 ? cones : around(b.n, nSpans[pass] ?? 0, 5, 0.01),
      };
    }
    return best;
  };

  const flat = run([0], 'flat');
  const hits = (r) => Math.floor(r.hits / 1000);
  const conic = run([0.1, 0.2, 0.3, 0.4, 0.5, 0.6], 'conic');
  return hits(conic) > hits(flat) ? conic : flat;
}
