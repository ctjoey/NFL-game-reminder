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
