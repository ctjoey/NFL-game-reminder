#!/usr/bin/env node
// Read a coverage map with a program instead of with your eyes.
//
//   node server/coverage/sampler-cli.js probe --year 2026 --week 4
//   node server/coverage/sampler-cli.js calibrate --image <url|file> \
//        --anchors 'seattle=0.075,0.115;sandiego=0.115,0.545;miami=0.865,0.905;boston=0.905,0.175;
//                   minneapolis=0.520,0.185;dallas=0.455,0.690;denver=0.300,0.395;atlanta=0.760,0.675'
//   node server/coverage/sampler-cli.js sample --image <url|file> --week 4 \
//        --network CBS --window SUN_EARLY \
//        --legend '2026-W04-AAA-BBB=#e86a6a,2026-W04-CCC-DDD=#7896eb' --games /tmp/games.json
//
// `probe` exists because 506's page structure cannot be inspected from the sandbox the rest of this
// was written in - the egress proxy blocks the domain. Run it once from CI, read what it prints,
// and the image and legend can be passed to `sample` directly, or wired in automatically.
//
// `sample` writes the same draft JSON that `feed-cli.js apply` already reads, so nothing downstream
// has to learn about any of this. A market the sampler is not sure about is simply absent from the
// draft, which leaves the slot open - the behaviour we already decided is the honest one.
import fs from 'node:fs';
import { decodePNG, pixelAt } from './png.js';
import { MARKET_LATLON, OFF_MAP, fitProjection, conicProjection, searchProjection } from './geo.js';
import { sampleMap, samplePoint, verifySampling, SAMPLER_DEFAULTS } from './mapSampler.js';
import { parseMapPage, pendingMaps, sectionKind } from './mapPage.js';
import { loadFeed, shouldReadWeek } from './coverageFeed.js';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
/// A flag with no value. `flag()` cannot see one: `--save --week 4` reads the next token, finds
/// `--week`, and returns the fallback - so `--save` looked unset and the calibration was never
/// written, which then broke the commit that expected the file.
const has = (name) => args.includes(`--${name}`);
const die = (msg) => { console.error(msg); process.exit(1); };
const UA = 'GameDial coverage sampler (+https://github.com/ctjoey/NFL-game-reminder)';

async function load(source) {
  if (!source) die('--image is required: a URL or a local file');
  if (!/^https?:/i.test(source)) return fs.readFileSync(source);
  const res = await fetch(source, { headers: { 'user-agent': UA } });
  if (!res.ok) die(`fetching ${source}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function parseLegend(spec) {
  if (!spec) die('--legend is required: gameId=#rrggbb pairs, or a JSON file of them');
  const text = fs.existsSync(spec) ? fs.readFileSync(spec, 'utf8') : spec;
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
    const raw = JSON.parse(text);
    const pairs = Array.isArray(raw) ? raw.map((e) => [e.key ?? e.game, e.rgb ?? e.color]) : Object.entries(raw);
    return pairs.map(([key, v]) => ({ key, rgb: Array.isArray(v) ? v : hex(v) }));
  }
  return text.split(',').map((p) => {
    const [key, value] = p.split('=').map((s) => s.trim());
    if (!key || !value) die(`cannot read legend entry "${p}"`);
    return { key, rgb: hex(value) };
  });
}

function hex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s).trim());
  if (!m) die(`"${s}" is not a #rrggbb colour`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function parseAnchors(spec) {
  if (!spec) die('--anchors is required');
  return spec.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [market, xy] = p.split('=');
    const [x, y] = String(xy).split(',').map(Number);
    if (!MARKET_LATLON[market]) die(`unknown market "${market}"`);
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) die(`${market}: anchors are fractions of the image, 0 to 1`);
    return { market: market.trim(), x, y };
  });
}

/// Dump enough of 506's page to finish the adapter from one run's output.
async function probe() {
  const year = flag('year', String(new Date().getUTCFullYear()));
  const week = flag('week') ?? die('--week is required');
  const url = flag('url', `https://506sports.com/nfl.php?yr=${year}&wk=${week}`);
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  console.log(`GET ${url} -> HTTP ${res.status} ${res.headers.get('content-type') || ''}`);
  if (!res.ok) process.exit(1);
  const html = await res.text();
  console.log(`${html.length} bytes\n`);

  // Commented-out images are how this page says "the maps are not drawn yet": the week's game
  // list and announcers go up first, with the map tags left in the source behind <!-- -->. A
  // scraper that ignores comments reports four 404s and looks like a bug in itself.
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const srcOf = (h) => [...h.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const imgs = srcOf(live);
  const pending = srcOf(html).filter((s) => !imgs.includes(s));
  console.log(`-- images (${imgs.length} live) --`);
  for (const src of imgs.slice(0, 40)) console.log(`   ${src}`);
  if (pending.length) {
    console.log(`\n-- ${pending.length} image(s) commented out: not published yet --`);
    for (const src of pending.slice(0, 20)) console.log(`   ${src}`);
  }

  // The captured src is what a regex thinks the src is. When the URL built from it 404s, the tag
  // itself is the only thing worth looking at - lazy-loading attributes, a srcset, a CDN host or
  // a query string all hide behind a naive capture.
  const mapTags = [...html.matchAll(/<img[^>]*>/gi)].map((m) => m[0])
    .filter((t) => /CBS|FOX|NBC|\d{2}-/i.test(t));
  console.log(`\n-- raw tags that look like maps (${mapTags.length}) --`);
  for (const t of mapTags.slice(0, 8)) console.log(`   ${t}`);

  const at = html.search(/<img[^>]*(CBS-E|CBS|FOX)[^>]*>/i);
  if (at >= 0) {
    console.log('\n-- raw HTML around the first map --');
    console.log(html.slice(Math.max(0, at - 400), at + 400).replace(/\n+/g, '\n').trim());
  }

  const swatches = [...html.matchAll(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}|rgba?\([^)]*\))/gi)].map((m) => m[1]);
  console.log(`\n-- inline background colours (${swatches.length}) --`);
  console.log(`   ${[...new Set(swatches)].slice(0, 40).join('  ')}`);

  const headings = [...html.matchAll(/<(h[1-4]|b|strong)[^>]*>\s*([^<]{3,60}?)\s*<\/\1>/gi)].map((m) => m[2].trim());
  console.log(`\n-- headings (${headings.length}) --`);
  console.log(`   ${[...new Set(headings)].slice(0, 40).join(' | ')}`);

  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '\n')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  console.log(`\n-- text lines mentioning "@" or "vs" (${text.length} total) --`);
  for (const line of text.filter((l) => /\s(@|vs\.?)\s/i.test(l)).slice(0, 40)) console.log(`   ${line}`);
  // Fetch the swatches and the maps themselves, so one run yields everything `sample` needs:
  // the palette 506 draws with, and the pixel size each map is published at.
  // A <base href> changes what every relative src means, and 506's map srcs resolve to a 404
  // without accounting for it. Rather than guess the right prefix, try the plausible ones and
  // report which answered - the point of a probe is to come back with a fact.
  const baseTag = /<base[^>]+href=["']([^"']+)["']/i.exec(html)?.[1];
  const base = new URL(baseTag || url, url);
  if (baseTag) console.log(`\n-- <base href> is ${base.href} --`);
  const candidates = (src) => {
    if (/^https?:/i.test(src)) return [src];
    const host = new URL(url).origin;
    return [...new Set([
      new URL(src, base).href,
      `${host}/nfl/${src}`,
      `${host.replace('://', '://www.')}/${src}`,
      `${host.replace('://', '://www.')}/nfl/${src}`,
    ])];
  };
  const unique = [...new Set(imgs)].filter((s) => /\.png$/i.test(s));
  console.log('\n-- image details --');
  for (const src of unique) {
    try {
      let r = null, from = null;
      for (const candidate of candidates(src)) {
        const attempt = await fetch(candidate, { headers: { 'user-agent': UA } });
        if (attempt.ok) { r = attempt; from = candidate; break; }
      }
      if (!r) { console.log(`   ${src}: not found at ${candidates(src).join(' | ')}`); continue; }
      if (from !== candidates(src)[0]) console.log(`   ${src.padEnd(34)} -> ${from}`);
      const img = decodePNG(Buffer.from(await r.arrayBuffer()));
      const mid = pixelAt(img, img.width / 2, img.height / 2);
      const hexOf = (p) => `#${p.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
      const note = img.width < 60 && img.height < 60
        ? `swatch ${hexOf(mid)}`                       // a legend chip: the middle is the colour
        : `map ${img.width}x${img.height}`;
      console.log(`   ${src.padEnd(34)} ${note}`);
    } catch (e) { console.log(`   ${src}: ${e.message}`); }
  }
  console.log('\nHand the map URL and the swatch colours to `sample`.');
}

/// Has 506 drawn this week's maps yet?
///
/// The page goes up early with the week's games and announcers, and the map tags sit inside an
/// HTML comment until the maps are actually drawn. So "published" is not "the page exists" - it is
/// "the image tag is live and the file answers".
async function watch() {
  const year = flag('year', String(new Date().getUTCFullYear()));
  const week = flag('week') ?? die('--week is required');
  const url = flag('url', `https://506sports.com/nfl.php?yr=${year}&wk=${week}`);
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) die(`GET ${url} -> HTTP ${res.status}`);
  const html = await res.text();

  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  // The same matcher the parser uses. When these two disagreed, one reported three maps published
  // and the other quietly saw two.
  const maps = (h) => [...h.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map((m) => m[1]).filter((s) => sectionKind(s));
  const published = [...new Set(maps(live))];
  const pending = [...new Set(maps(html))].filter((m) => !published.includes(m));

  const line = published.length
    ? `506 has published ${published.length} map(s) for week ${week}: ${published.join(', ')}`
    : pending.length
      ? `Week ${week} maps are drawn but not yet posted - ${pending.length} tag(s) still commented out.`
      : `No map tags on the week ${week} page at all yet.`;
  console.log(line);
  for (const m of pending) console.log(`  pending: ${m}`);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) fs.appendFileSync(summary, `### Coverage maps, week ${week}\n\n${line}\n`);

  // Exit non-zero when there is something to act on. A scheduled run that succeeds is silent, and
  // silence is the wrong response to "the maps you have been waiting for are up".
  if (published.length && flag('alert') !== undefined) {
    console.error(`::error::Week ${week} maps are up and the feed has no entries for it yet.`);
    process.exit(1);
  }
}

/// Read every map on a week's page and produce one draft for the whole week.
///
/// Exits 0 with an empty draft when the maps are not up yet - on a Wednesday that is the normal
/// answer, not a failure. Exits non-zero when a map is up but cannot be trusted, because the one
/// thing worse than no coverage is coverage nobody checked.
async function ingest() {
  const year = flag('year', String(new Date().getUTCFullYear()));
  const week = Number(flag('week') ?? die('--week is required'));
  const season = Number(flag('season', year));
  const gamesFile = flag('games') ?? die('--games is required: the live schedule to resolve against');
  const raw = JSON.parse(fs.readFileSync(gamesFile, 'utf8'));
  const all = (Array.isArray(raw) ? raw : raw.games || []).filter((g) => g.week === week);
  if (!all.length) die(`no week ${week} games in ${gamesFile}`);

  const pageUrl = flag('url', `https://506sports.com/nfl.php?yr=${year}&wk=${week}`);
  const res = await fetch(pageUrl, { headers: { 'user-agent': UA } });
  if (!res.ok) die(`GET ${pageUrl} -> HTTP ${res.status}`);
  const html = await res.text();

  const { sections, problems } = parseMapPage(html, all);
  if (problems.length) { for (const p of problems) console.error(`  ${p}`); die('Refusing to read a page I cannot parse.'); }
  if (!sections.length) {
    const pending = pendingMaps(html);
    console.error(pending.length
      ? `Week ${week}: ${pending.length} map(s) written but not posted yet (${pending.join(', ')}).`
      : `Week ${week}: no maps on the page yet.`);
    process.stdout.write(`${JSON.stringify({ week, season, source: 'no maps published', slots: [] }, null, 2)}\n`);
    return;
  }

  // Should this week be read at all? Asking here, rather than in the workflow that calls this,
  // is the point: the answer depends on which map files are up right now, and this is the only
  // place that knows them.
  const maps = sections.map((x) => x.src);
  const already = loadFeed(season).weeks?.[week];
  const verdict = shouldReadWeek(already, maps);
  // A re-read replaces the week rather than merging into it. Merging is right when a week is
  // built up from several hand-read crops, but wrong for a revision: a market the new maps leave
  // uncertain would keep the answer the superseded map gave it. The exception is a page that is
  // temporarily short a map - fewer maps than last time cannot be the whole week, so merge.
  const replace = Boolean(already?.markets && Object.keys(already.markets).length
    && maps.length >= (already.maps?.length ?? 0));
  if (!verdict.read) {
    console.error(`Week ${week}: not reading - ${verdict.why}.`);
    process.stdout.write(`${JSON.stringify({ week, season, source: verdict.why, maps, slots: [] }, null, 2)}\n`);
    return;
  }
  console.error(`Week ${week}: reading - ${verdict.why}.`);

  const base = new URL(pageUrl);
  const fetchImage = async (src) => {
    const r = await fetch(new URL(src, base).href, { headers: { 'user-agent': UA } });
    if (!r.ok) throw new Error(`${src}: HTTP ${r.status}`);
    return decodePNG(Buffer.from(await r.arrayBuffer()));
  };
  const swatchCache = new Map();
  const swatchColour = async (src) => {
    if (!swatchCache.has(src)) {
      const img = await fetchImage(src);
      swatchCache.set(src, pixelAt(img, img.width / 2, img.height / 2));
    }
    return swatchCache.get(src);
  };

  const teamMarkets = {};
  for (const [key, m] of Object.entries(JSON.parse(fs.readFileSync(flag('markets', 'ios/NFLGameReminder/Resources/markets.json'), 'utf8')).markets)) {
    for (const team of m.teams || []) teamMarkets[team] = key;
  }

  // Load every map and legend first: calibration is scored against all of them at once, and two
  // dozen assertions spread across three maps is a much stronger signal than one map's worth.
  for (const section of sections) {
    section.legend = [];
    for (const e of section.entries) section.legend.push({ key: e.gameId, rgb: await swatchColour(e.swatch) });
    section.img = await fetchImage(section.src);
    console.error(`${section.src}: ${section.img.width}x${section.img.height}, ${section.entries.length} game(s)`);
  }

  /// Read every map through one projection, or return null if any of them disagrees with the
  /// home-market rule. Never writes anything: a reading that does not verify is not a reading.
  const readAll = (project) => {
    const slots = [];
    const notes = [];
    for (const section of sections) {
      const results = sampleMap({
        img: section.img, legend: section.legend, projection: project,
        markets: Object.keys(MARKET_LATLON), offMapKey: flag('offmap', null),
      });

      const games = section.entries.map((e) => {
        const g = all.find((x) => x.id === e.gameId);
        return { key: e.gameId, away: g.away, home: g.home };
      });
      const v = verifySampling(results, games, teamMarkets);
      notes.push(`${section.src}: ${v.summary}`);
      if (!v.ok) {
        for (const w of v.wrong) console.error(`  ${w.market}: read ${w.got}, but ${w.team} plays ${w.expect}`);
        console.error(`${section.src}: the projection is not aimed at the map it is reading.`);
        return null;
      }

      const windowOf = Object.fromEntries(section.entries.map((e) => [e.gameId, e.window]));
      for (const [market, r] of Object.entries(results)) {
        if (!r.key) continue;
        const window = windowOf[r.key];
        slots.push({ market, network: section.network, window, choose: r.key });
        // A single-header shows one game per market, so the other window carries nothing. Saying
        // so is better than leaving it blank: the app can state that nothing airs rather than guess.
        if (section.singleHeader) {
          const other = window === 'SUN_EARLY' ? 'SUN_LATE' : 'SUN_EARLY';
          slots.push({ market, network: section.network, window: other, choose: 'none' });
        }
      }
    }
    return { slots, notes };
  };

  /// No anchors, and nobody available to measure them. Search for the projection instead, scored
  /// on the one thing already known to be true about any coverage map.
  const searchForFit = () => {
    const constraints = constraintsFor(sections, all, teamMarkets);
    console.error(`Searching for the projection, scored on ${constraints.length} home and away markets:`);
    const found = calibrateBySearch(sections, constraints, (l) => console.error(l));
    const rate = found.hits / found.total;
    console.error(`  best: ${found.hits}/${found.total} (${(rate * 100).toFixed(0)}%) `
      + `box ${JSON.stringify(Object.fromEntries(Object.entries(found.box).map(([k, v]) => [k, +v.toFixed(3)])))}`);
    if (found.total < 8 || rate < 0.9) {
      die(`Refusing to calibrate on ${found.hits}/${found.total}. A projection that cannot place `
        + `a team's own market cannot be trusted to place anyone else's.`);
    }
    return found;
  };

  let read = null;
  if (fs.existsSync(calibrationFile())) {
    read = readAll(loadCalibration().project);
    // A saved calibration that stops working is not a dead end. 506 could recrop or reproject at
    // any point in the season, and a week that refuses with no way forward is a week nobody gets.
    // The search costs twenty seconds and is checked against the same rule, so try it.
    if (!read) console.error('The saved calibration no longer reads these maps. Searching again.');
  }
  if (!read) {
    const found = searchForFit();
    read = readAll(conicProjection(found.box));
    if (!read) die('Refusing to emit: no projection reads these maps consistently.');
    if (has('save')) {
      fs.writeFileSync(calibrationFile(), `${JSON.stringify({
        version: 2, model: 'conic', box: found.box,
        note: 'Found by search, scored on the home-market rule. Every ingest re-verifies it and '
            + 'searches again if it has stopped working, so a map 506 reprojects costs a minute '
            + 'rather than a week.',
        foundAt: new Date().toISOString(), score: `${found.hits}/${found.total}`,
      }, null, 2)}\n`);
      console.error(`Wrote ${calibrationFile()}.`);
    }
  }
  const { slots, notes } = read;

  for (const n of notes) console.error(n);
  console.error(`${slots.length} entr(ies) from ${sections.length} map(s).`);
  process.stdout.write(`${JSON.stringify({
    week, season,
    source: flag('source', `506sports week ${week}, sampled automatically ${new Date().toISOString().slice(0, 10)}`),
    maps,
    replace,
    slots,
  }, null, 2)}\n`);
}

async function calibrate() {
  const img = decodePNG(await load(flag('image')));
  const anchors = parseAnchors(flag('anchors'));
  const fit = fitProjection(anchors, { quadratic: flag('affine') !== undefined ? false : null });

  const out = {
    version: 1,
    note: 'Anchors are fractions of the image, so this survives a resolution change but not a '
        + 'reprojection or a recrop. Every sample run re-checks it against the home-market rule.',
    fittedFrom: { image: flag('image'), width: img.width, height: img.height },
    model: fit.quadratic ? 'quadratic' : 'affine',
    anchors: Object.fromEntries(anchors.map((a) => [a.market, [a.x, a.y]])),
  };
  const file = flag('out', 'server/coverage/map-calibration.json');
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  console.error(`${fit.anchors} anchors, ${out.model} model, worst residual `
    + `${(fit.worstResidual * 100).toFixed(2)}% of the image. Wrote ${file}.`);

  const off = Object.keys(MARKET_LATLON).filter((m) => !OFF_MAP.has(m))
    .map((m) => ({ m, p: fit.project(m) }))
    .filter(({ p }) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1);
  if (off.length) console.error(`WARNING: ${off.length} market(s) project off the image: ${off.map((o) => o.m).join(', ')}`);
}

function calibrationFile() { return flag('calibration', 'server/coverage/map-calibration.json'); }

function loadCalibration() {
  const file = calibrationFile();
  if (!fs.existsSync(file)) die(`no calibration at ${file}. Run \`calibrate\` first.`);
  const cal = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cal.box) return { project: conicProjection({ n: 0, ...cal.box }), box: cal.box, model: cal.model ?? 'box' };
  const anchors = Object.entries(cal.anchors).map(([market, [x, y]]) => ({ market, x, y }));
  return fitProjection(anchors, { quadratic: cal.model === 'affine' ? false : null });
}

/// Every "this market must show this game" assertion the week's maps make.
function constraintsFor(sections, all, teamMarkets) {
  const out = [];
  for (const section of sections) {
    for (const e of section.entries) {
      const g = all.find((x) => x.id === e.gameId);
      if (!g) continue;
      for (const team of [g.away, g.home]) {
        const market = teamMarkets[team];
        if (market && !OFF_MAP.has(market)) out.push({ section, market, expect: e.gameId });
      }
    }
  }
  return out;
}

/// Work out the projection from the maps themselves, with no anchor points from anyone.
function calibrateBySearch(sections, constraints, log = () => {}) {
  const everywhere = Object.keys(MARKET_LATLON).filter((m) => !OFF_MAP.has(m));
  const inside = (p) => p && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

  // Two signals, in order. Satisfying the home-market rule is the hard requirement. But several
  // projections a percent apart satisfy all of it, and a percent is enough to drop a market
  // inside its neighbour's region - that cost three wrong markets in testing. So ties break on
  // how cleanly the whole map reads: a correctly aimed projection puts every market deep inside
  // a colour, a shifted one strands some on boundaries. That needs no ground truth, so it speaks
  // for all 94 markets rather than only the two dozen a team plays in.
  const score = (project) => {
    let hits = 0;
    for (const c of constraints) {
      const point = project(c.market);
      if (!inside(point)) continue;
      const r = samplePoint(c.section.img, point, c.section.legend, { radius: 0.004, minPurity: 0.6 });
      if (r.key === c.expect) hits += 1;
    }
    let purity = 0, counted = 0;
    const biggest = sections.reduce((a, b) => (b.entries.length > a.entries.length ? b : a), sections[0]);
    for (const m of everywhere) {
      const point = project(m);
      if (!inside(point)) continue;
      purity += samplePoint(biggest.img, point, biggest.legend, { radius: 0.004, minPurity: 0 }).purity;
      counted += 1;
    }
    return hits * 1000 + (counted ? (purity / counted) * 100 : 0);
  };

  const best = searchProjection(score, {
    onProgress: (label, pass, b) => log(`  ${label} pass ${pass + 1}: `
      + `${Math.floor(b.hits / 1000)}/${constraints.length} constraints, `
      + `mean purity ${((b.hits % 1000) / 100).toFixed(3)}, cone ${b.box.n.toFixed(3)}`),
  });
  return { box: best.box, hits: Math.floor(best.hits / 1000), total: constraints.length };
}

async function sample() {
  const week = Number(flag('week') ?? die('--week is required'));
  const season = Number(flag('season', 2026));
  const network = flag('network') ?? die('--network is required (CBS or FOX)');
  const window = flag('window') ?? die('--window is required (SUN_EARLY or SUN_LATE)');
  const img = decodePNG(await load(flag('image')));
  const legend = parseLegend(flag('legend'));
  const fit = loadCalibration();

  const markets = Object.keys(MARKET_LATLON);
  const results = sampleMap({
    img, legend, projection: fit.project, markets,
    offMapKey: flag('offmap', null),
    // Only override what was actually asked for. Passing `radius: undefined` through would pin the
    // sampler to a single disc and switch off the widening it does for labels.
    options: {
      ...(flag('radius') ? { radius: Number(flag('radius')) } : {}),
      tolerance: Number(flag('tolerance', SAMPLER_DEFAULTS.tolerance)),
      minPurity: Number(flag('purity', SAMPLER_DEFAULTS.minPurity)),
    },
  });

  // The football check. Without it this is a program confidently reading the wrong pixels.
  const gamesFile = flag('games');
  if (gamesFile) {
    const raw = JSON.parse(fs.readFileSync(gamesFile, 'utf8'));
    const all = Array.isArray(raw) ? raw : raw.games || [];
    const teamMarkets = {};
    for (const [key, m] of Object.entries(JSON.parse(fs.readFileSync(flag('markets', 'ios/NFLGameReminder/Resources/markets.json'), 'utf8')).markets)) {
      for (const team of m.teams || []) teamMarkets[team] = key;
    }
    const games = legend.map((l) => all.find((g) => g.id === l.key)).filter(Boolean)
      .map((g) => ({ key: g.id, away: g.away, home: g.home }));
    const v = verifySampling(results, games, teamMarkets);
    console.error(v.summary);
    if (!v.ok) {
      for (const w of v.wrong) console.error(`  ${w.market}: read ${w.got}, but ${w.team} plays ${w.expect}`);
      die('Refusing to emit: the projection is not aimed at the map it is reading.');
    }
  } else {
    console.error('WARNING: no --games, so the reading was not checked against the home-market rule.');
  }

  const slots = [];
  const open = [];
  for (const market of markets) {
    const r = results[market];
    if (r.key) slots.push({ market, network, window, choose: r.key });
    else open.push(`${market} (${r.reason})`);
  }
  process.stdout.write(`${JSON.stringify({
    week, season,
    source: flag('source', `506sports week ${week} ${network} ${window}, sampled`),
    slots,
  }, null, 2)}\n`);
  console.error(`${slots.length} market(s) read, ${open.length} left open:`);
  for (const o of open) console.error(`  ${o}`);
}

const commands = { probe, watch, calibrate, sample, ingest };
if (!commands[cmd]) {
  console.error('usage: sampler-cli.js <probe|watch|calibrate|sample|ingest> [...]');
  console.error(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 18).join('\n'));
  process.exit(1);
}
await commands[cmd]();
