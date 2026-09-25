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
import { decodePNG } from './png.js';
import { MARKET_LATLON, OFF_MAP, fitProjection } from './geo.js';
import { sampleMap, verifySampling, SAMPLER_DEFAULTS } from './mapSampler.js';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
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

  const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  console.log(`-- images (${imgs.length}) --`);
  for (const src of imgs.slice(0, 40)) console.log(`   ${src}`);

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
  console.log('\nHand the image URL and the legend colours to `sample`.');
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

function loadCalibration() {
  const file = flag('calibration', 'server/coverage/map-calibration.json');
  if (!fs.existsSync(file)) die(`no calibration at ${file}. Run \`calibrate\` first.`);
  const cal = JSON.parse(fs.readFileSync(file, 'utf8'));
  const anchors = Object.entries(cal.anchors).map(([market, [x, y]]) => ({ market, x, y }));
  return fitProjection(anchors, { quadratic: cal.model === 'affine' ? false : null });
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

const commands = { probe, calibrate, sample };
if (!commands[cmd]) {
  console.error('usage: sampler-cli.js <probe|calibrate|sample> [...]');
  console.error(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 18).join('\n'));
  process.exit(1);
}
await commands[cmd]();
