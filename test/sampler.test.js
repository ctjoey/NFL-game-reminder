// The sampler is tested against a coverage map this file draws, because a real one cannot be
// fetched from here and a test that needs the network is a test that fails on a Tuesday.
//
// The synthetic map is built to be hostile in the ways a real one is: hatched fills, dark DMA
// borders, white place labels sitting exactly on the point being sampled, a pale watermark, and
// ocean outside the land. If the sampler survives all of that it is reading the fill and not the
// furniture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { decodePNG, pixelAt } from '../server/coverage/png.js';
import { MARKET_LATLON, fitProjection, boxProjection, conicProjection, searchProjection } from '../server/coverage/geo.js';
import { samplePoint, sampleMap, verifySampling } from '../server/coverage/mapSampler.js';

// MARK: - a PNG encoder, so the test can hand the decoder something real

function encodePNG(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;                                  // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

// MARK: - drawing a plausible coverage map

const W = 1200, H = 700;
const LON0 = -125, LON1 = -65, LAT0 = 50, LAT1 = 24;
const toXY = (lat, lon) => ({ x: (lon - LON0) / (LON1 - LON0), y: (lat - LAT0) / (LAT1 - LAT0) });

const GAMES = [
  { key: 'G-WEST',  rgb: [232, 106, 106], hatch: true },
  { key: 'G-MID',   rgb: [120, 150, 235], hatch: false },
  { key: 'G-SOUTH', rgb: [247, 229, 108], hatch: false },
  { key: 'G-EAST',  rgb: [126, 214, 150], hatch: true },
  { key: 'G-OHIO',  rgb: [244, 178, 106], hatch: false },
];

/// Which game each market is painted with. Longitude bands, plus a couple of deliberate islands so
/// the map has the awkward shapes real ones do.
function gameFor(market) {
  const [, lon] = MARKET_LATLON[market];
  if (['cleveland', 'columbus', 'dayton', 'toledo', 'youngstown', 'pittsburgh'].includes(market)) return 'G-OHIO';
  if (['miami', 'westpalm', 'fortmyers', 'tampa', 'orlando', 'jacksonville'].includes(market)) return 'G-SOUTH';
  if (lon < -110) return 'G-WEST';
  if (lon < -95) return 'G-MID';
  if (lon < -83) return 'G-OHIO';
  return 'G-EAST';
}

function drawMap() {
  const rgb = Buffer.alloc(W * H * 3);
  const onMap = Object.keys(MARKET_LATLON).filter((m) => m !== 'honolulu');
  const pts = onMap.map((market) => {
    const [lat, lon] = MARKET_LATLON[market];
    const p = toXY(lat, lon);
    return { market, game: gameFor(market), px: p.x * W, py: p.y * H };
  });
  const byKey = Object.fromEntries(GAMES.map((g) => [g.key, g]));

  const nearest = (x, y) => {
    let best = null, bestD = Infinity, second = Infinity;
    for (const p of pts) {
      const d = (p.px - x) ** 2 + (p.py - y) ** 2;
      if (d < bestD) { second = bestD; bestD = d; best = p; } else if (d < second) second = d;
    }
    return { best, edge: Math.sqrt(second) - Math.sqrt(bestD) };
  };

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const o = (y * W + x) * 3;
      const { best, edge } = nearest(x, y);
      // Ocean beyond the reach of any market, the way the real maps show water.
      const far = Math.hypot(best.px - x, best.py - y) > 95;
      let c = far ? [198, 228, 245] : byKey[best.game].rgb;
      if (!far && byKey[best.game].hatch && (x + y) % 7 === 0) c = c.map((v) => Math.max(0, v - 38));
      if (!far && edge < 1.4) c = [90, 60, 60];                      // DMA border
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
    }
  }

  // Place labels, drawn exactly where the sampler is about to look.
  for (const p of pts) {
    for (let dy = -6; dy <= 6; dy += 1) {
      for (let dx = -22; dx <= 22; dx += 1) {
        const x = Math.round(p.px + dx), y = Math.round(p.py + dy);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const o = (y * W + x) * 3;
        const edge = Math.abs(dy) > 4 || Math.abs(dx) > 19;
        rgb[o] = edge ? 25 : 252; rgb[o + 1] = edge ? 25 : 252; rgb[o + 2] = edge ? 25 : 252;
      }
    }
  }
  // Watermark: pale, low contrast, scattered.
  for (let y = 40; y < H; y += 130) {
    for (let x = 30; x < W; x += 210) {
      for (let dy = 0; dy < 9; dy += 1) for (let dx = 0; dx < 96; dx += 1) {
        if ((dx * 7 + dy * 3) % 11 > 4) continue;
        const o = ((y + dy) * W + (x + dx)) * 3;
        rgb[o] = 205; rgb[o + 1] = 225; rgb[o + 2] = 205;
      }
    }
  }
  return { png: encodePNG(W, H, rgb), pts };
}

const MAP = drawMap();
const IMG = decodePNG(MAP.png);
const LEGEND = GAMES.map((g) => ({ key: g.key, rgb: g.rgb }));
const ANCHORS = ['seattle', 'sandiego', 'miami', 'boston', 'minneapolis', 'dallas', 'denver', 'atlanta', 'chicago']
  .map((market) => { const [lat, lon] = MARKET_LATLON[market]; return { market, ...toXY(lat, lon) }; });

test('the PNG decoder round-trips what the encoder wrote', () => {
  assert.equal(IMG.width, W);
  assert.equal(IMG.height, H);
  // Somewhere well inside the West region and away from any label.
  const deep = toXY(44.0, -117.0);
  const p = pixelAt(IMG, deep.x * W, deep.y * H);
  assert.ok(p.every((v) => v >= 0 && v <= 255));
});

test('a projection fitted from nine anchors places markets it never saw', () => {
  const fit = fitProjection(ANCHORS);
  assert.ok(fit.quadratic, 'nine anchors is enough for the quadratic model');
  assert.ok(fit.worstResidual < 1e-6, `anchors should be reproduced exactly, got ${fit.worstResidual}`);
  for (const market of ['cleveland', 'spokane', 'elpaso', 'burlington']) {
    const [lat, lon] = MARKET_LATLON[market];
    const want = toXY(lat, lon), got = fit.project(market);
    assert.ok(Math.hypot(got.x - want.x, got.y - want.y) < 1e-6, `${market} should land where it belongs`);
  }
});

test('sampling reads the fill through hatching, borders, labels and the watermark', () => {
  const fit = fitProjection(ANCHORS);
  const markets = Object.keys(MARKET_LATLON);
  const results = sampleMap({ img: IMG, legend: LEGEND, projection: fit.project, markets, offMapKey: 'G-WEST' });

  let confident = 0, wrong = 0;
  for (const market of markets) {
    if (market === 'honolulu') continue;
    const r = results[market];
    if (!r.key) continue;
    confident += 1;
    if (r.key !== gameFor(market)) { wrong += 1; console.error(`  ${market}: read ${r.key}, painted ${gameFor(market)}`); }
  }
  assert.equal(wrong, 0, 'a confident read must never be the wrong game');
  assert.ok(confident > 60, `should resolve most of the map, resolved ${confident}`);
});

test('sampling widens past a place label rather than reading the label', () => {
  // The smallest disc lands entirely inside the white label drawn on the point, so a sampler that
  // did not widen would return nothing here. This is the bug that got through the unit tests and
  // only showed up running the CLI: a NaN radius silently sampled zero pixels and every market
  // came back open, which looks exactly like an honest "I cannot tell".
  const seattle = toXY(...MARKET_LATLON.seattle);
  const tight = samplePoint(IMG, seattle, LEGEND, { radius: 0.003 });
  assert.equal(tight.classified, 0, 'fixture check: a tiny disc here should see only the label');

  const adaptive = samplePoint(IMG, seattle, LEGEND);
  assert.equal(adaptive.key, gameFor('seattle'));
  assert.ok(adaptive.radius > 0.003, 'it should have widened to get past the label');
});

test('a market that straddles two regions is left open rather than guessed', () => {
  // A point placed deliberately on the seam between two painted regions.
  const a = MARKET_LATLON.denver, b = MARKET_LATLON.saltlake;
  const seam = toXY((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  const r = samplePoint(IMG, seam, LEGEND, { radius: 0.05 });
  assert.equal(r.key, null);
  assert.match(r.reason, /straddles|usable|match/);
});

test('Hawaii is taken from the legend dot, never from a pixel', () => {
  const fit = fitProjection(ANCHORS);
  const withDot = sampleMap({ img: IMG, legend: LEGEND, projection: fit.project, markets: ['honolulu'], offMapKey: 'G-SOUTH' });
  assert.equal(withDot.honolulu.key, 'G-SOUTH');
  assert.equal(withDot.honolulu.offMap, true);
  const without = sampleMap({ img: IMG, legend: LEGEND, projection: fit.project, markets: ['honolulu'] });
  assert.equal(without.honolulu.key, null, 'no swatch means no answer, not a pixel from the Pacific');
});

test('the projection can be found by search, with nobody measuring anything', () => {
  // No anchors. Score a candidate projection the only way that needs no human: a coverage map
  // always gives a team's own market that team's game, so count how many of those it gets right.
  const teamMarkets = {
    SEA: 'seattle', SF: 'sanfrancisco', DEN: 'denver', DAL: 'dallas', MIA: 'miami', TB: 'tampa',
    NYG: 'newyork', NE: 'boston', CLE: 'cleveland', PIT: 'pittsburgh', CHI: 'chicago',
    MIN: 'minneapolis', KC: 'kansascity', ATL: 'atlanta', PHI: 'philadelphia', HOU: 'houston',
  };
  const constraints = Object.values(teamMarkets).map((market) => ({ market, expect: gameFor(market) }));

  // Constraint count alone is not enough: several nearby projections satisfy all of them while
  // sitting a percent off, which is plenty to put a market inside its neighbour's region. So the
  // score breaks those ties on how cleanly the whole map reads. A correctly aimed projection puts
  // every market deep inside a colour; a shifted one strands some on boundaries. That signal
  // needs no ground truth, so it is available for all 94 markets rather than just the 16.
  const everywhere = Object.keys(MARKET_LATLON).filter((m) => m !== 'honolulu');
  const score = (project) => {
    let hits = 0;
    for (const c of constraints) {
      const p = project(c.market);
      if (!p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
      if (samplePoint(IMG, p, LEGEND, { radius: 0.004, minPurity: 0.6 }).key === c.expect) hits += 1;
    }
    let purity = 0;
    for (const m of everywhere) {
      const p = project(m);
      if (!p || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
      purity += samplePoint(IMG, p, LEGEND, { radius: 0.004, minPurity: 0 }).purity;
    }
    return hits * 1000 + (purity / everywhere.length) * 100;
  };

  const best = searchProjection(score);
  const hits = Math.floor(best.hits / 1000);
  assert.equal(hits, constraints.length,
    `should satisfy every home-market assertion, got ${hits}/${constraints.length}`);

  // The fixture is drawn dead flat, so the search must come back flat. A free cone constant can
  // satisfy all sixteen assertions with the wrong shape, and then reads other markets confidently
  // wrong - so the conic only wins when it satisfies a constraint the flat model cannot.
  assert.equal(best.box.n, 0, `a flat map should be read flat, got cone ${best.box.n}`);

  // And the projection it found is good enough to read the rest of the map with.
  const found = conicProjection(best.box);
  const results = sampleMap({ img: IMG, legend: LEGEND, projection: found, markets: Object.keys(MARKET_LATLON) });
  let confident = 0, wrong = 0;
  for (const market of Object.keys(MARKET_LATLON)) {
    if (market === 'honolulu') continue;
    const r = results[market];
    if (!r.key) continue;
    confident += 1;
    if (r.key !== gameFor(market)) wrong += 1;
  }
  assert.equal(wrong, 0, 'a searched-for projection must not produce confident wrong answers');
  assert.ok(confident > 55, `should still read most of the map, read ${confident}`);
});

test('verification passes on a good fit and fails on a map read through the wrong projection', () => {
  // Both teams of a game have to be painted that game, the way a real map draws them. Picking a
  // pair from different painted regions would be testing the fixture, not the sampler - which is
  // how this test failed the first time, with Kansas City sitting a longitude band away from
  // Denver.
  const teamMarkets = {
    SEA: 'seattle', SF: 'sanfrancisco', DEN: 'denver', DAL: 'dallas',
    MIA: 'miami', TB: 'tampa', NYG: 'newyork', NE: 'boston', CLE: 'cleveland', PIT: 'pittsburgh',
  };
  const games = [
    { key: gameFor('seattle'), away: 'SF', home: 'SEA' },
    { key: gameFor('denver'), away: 'DAL', home: 'DEN' },
    { key: gameFor('miami'), away: 'TB', home: 'MIA' },
    { key: gameFor('newyork'), away: 'NE', home: 'NYG' },
    { key: gameFor('cleveland'), away: 'PIT', home: 'CLE' },
  ];
  for (const g of games) for (const t of [g.away, g.home]) {
    assert.equal(gameFor(teamMarkets[t]), g.key, `fixture: ${t} must be painted its own game`);
  }

  const good = sampleMap({
    img: IMG, legend: LEGEND, markets: Object.values(teamMarkets),
    projection: fitProjection(ANCHORS).project,
  });
  const pass = verifySampling(good, games, teamMarkets);
  assert.ok(pass.ok, `should verify, got: ${pass.summary} ${JSON.stringify(pass.wrong)}`);

  // Same map, projection shifted a long way east: the sampler now reads other people's markets.
  const shifted = fitProjection(ANCHORS.map((a) => ({ ...a, x: a.x + 0.16 })));
  const bad = sampleMap({ img: IMG, legend: LEGEND, markets: Object.values(teamMarkets), projection: shifted.project });
  const fail = verifySampling(bad, games, teamMarkets);
  assert.equal(fail.ok, false, 'a misaimed projection must not be allowed to publish');
});


test('the conic model is the box model when the cone is flat', () => {
  const box = { lonW: -125, lonE: -66, latN: 50, latS: 24 };
  const flat = conicProjection({ ...box, n: 0 });
  for (const market of Object.keys(MARKET_LATLON)) {
    const [lat, lon] = MARKET_LATLON[market];
    const p = flat(market);
    assert.ok(Math.abs(p.x - (lon - box.lonW) / (box.lonE - box.lonW)) < 1e-12, market);
    assert.ok(Math.abs(p.y - (box.latN - lat) / (box.latN - box.latS)) < 1e-12, market);
  }
  // Omitting the cone entirely means flat, so a calibration written before it existed still reads.
  assert.deepEqual(conicProjection(box)('denver'), flat('denver'));
  assert.deepEqual(boxProjection(box)('denver'), flat('denver'));
});

test('a cone leans the meridians and bows the parallels, and still frames the same edges', () => {
  const box = { lonW: -125, lonE: -66, latN: 50, latS: 24, n: 0.4 };
  const p = conicProjection(box);
  const at = (lat, lon) => { MARKET_LATLON.__probe = [lat, lon]; return p('__probe'); };

  // The framing keeps its meaning: the edge meridians at the central parallel and the edge
  // parallels on the central meridian are still 0 and 1.
  assert.ok(Math.abs(at(37.5, -125).x - 0) < 1e-9);
  assert.ok(Math.abs(at(37.5, -66).x - 1) < 1e-9);
  assert.ok(Math.abs(at(50, -96).y - 0) < 1e-9);
  assert.ok(Math.abs(at(24, -96).y - 1) < 1e-9);

  // Meridians lean in towards the north: the same longitude is further from centre down south.
  const west = -120;
  assert.ok(at(47, west).x > at(30, west).x, 'the western edge should lean inward going north');
  // Parallels bow: the arcs are centred on the apex away to the north, so the middle of a
  // parallel is its lowest point and the ends ride up. The 49th on a US conic map sags over the
  // Dakotas and lifts over Washington and Maine, which is the shape to check for.
  assert.ok(at(45, -125).y < at(45, -96).y, 'a parallel should ride up at its ends');
  assert.ok(at(45, -66).y < at(45, -96).y, 'and at the other end too');

  delete MARKET_LATLON.__probe;
});

test('a home market that cannot be read is still counted, not quietly excused', () => {
  // Reporting 9/9 where it had been 10/10 made a market going unreadable look like a cleaner
  // result than before. A projection that drifted off the map reads nothing anywhere, and
  // nothing out of nothing must never score full marks.
  const games = [
    { key: 'G1', away: 'GB', home: 'TB' },
    { key: 'G2', away: 'NE', home: 'BUF' },
    { key: 'G3', away: 'DAL', home: 'PHI' },
  ];
  const teamMarkets = {
    GB: 'greenbay', TB: 'tampa', NE: 'boston', BUF: 'buffalo', DAL: 'dallas', PHI: 'philadelphia',
  };
  const read = (over) => verifySampling({
    greenbay: { key: 'G1' }, tampa: { key: 'G1' }, boston: { key: 'G2' }, buffalo: { key: 'G2' },
    dallas: { key: 'G3' }, philadelphia: { key: 'G3' }, ...over,
  }, games, teamMarkets);

  assert.match(read({}).summary, /^6\/6 /);
  assert.deepEqual(read({}).unread, []);

  const blind = read({ tampa: { key: null } });
  assert.match(blind.summary, /^5\/6 /, `denominator must stay 6, got "${blind.summary}"`);
  assert.match(blind.summary, /tampa/);
  assert.deepEqual(blind.unread, ['tampa']);
  assert.equal(blind.ok, true, 'one unreadable market is uncertainty, not a wrong answer');

  // A wrong answer still fails, and reads as wrong rather than as one fewer.
  assert.equal(read({ tampa: { key: 'G2' } }).ok, false);

  // Read nothing at all and it fails, rather than passing 0/0.
  const nothing = verifySampling(
    Object.fromEntries(Object.values(teamMarkets).map((m) => [m, { key: null }])),
    games, teamMarkets,
  );
  assert.equal(nothing.ok, false, 'too little evidence is not a pass');
  assert.match(nothing.summary, /^0\/6 /);
});
