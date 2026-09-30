// Parsing the coverage-map page, against HTML shaped like the real one - the fixture below is
// built from what the probe printed off 506 for week 4, including the commented-out map tags it
// uses to say "drawn but not posted yet".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMapPage, pendingMaps, sectionKind } from '../server/coverage/mapPage.js';

const g = (away, home, networks, window) => ({
  id: `2026-W04-${away}-${home}`, week: 4, away, home, networks, window,
});
const WEEK4 = [
  g('NE', 'BUF', ['CBS'], 'SUN_EARLY'), g('ARI', 'NYG', ['CBS'], 'SUN_EARLY'),
  g('JAX', 'CIN', ['CBS'], 'SUN_EARLY'), g('TEN', 'BAL', ['CBS'], 'SUN_EARLY'),
  g('KC', 'LV', ['CBS'], 'SUN_LATE'), g('DEN', 'SF', ['CBS'], 'SUN_LATE'),
  g('LAC', 'SEA', ['CBS'], 'SUN_LATE'),
  g('LAR', 'PHI', ['FOX'], 'SUN_EARLY'), g('DAL', 'HOU', ['FOX'], 'SUN_EARLY'),
  g('GB', 'TB', ['FOX'], 'SUN_EARLY'), g('NYJ', 'CHI', ['FOX'], 'SUN_EARLY'),
  g('MIA', 'MIN', ['FOX'], 'SUN_LATE'),
];

const game = (n, matchup) =>
  `<div id='game'> <div id='square'><img src='nfl/swatches/${n}.png'></div> `
  + `<div id='matchup'>${matchup}</div> <div id='anncrs'>Someone, Someone</div></div>`;

const PAGE = `<html><body>
<div id='header'>NFL TV Schedule and Maps: Week 4, 2026</div>
<div id='national'>${game(9, 'Pittsburgh @ Cleveland')}</div>
<h2>CBS EARLY</h2><img src='2026/04-CBS-E.png'>
${game(1, 'New England @ Buffalo')}${game(2, 'Arizona @ NY Giants')}
${game(3, 'Jacksonville @ Cincinnati')}${game(4, 'Tennessee @ Baltimore')}
<h2>CBS LATE</h2><img src='2026/04-CBS-L.png'>
${game(1, 'Kansas City @ Las Vegas')}${game(2, 'Denver @ San Francisco')}${game(3, 'LA Chargers @ Seattle')}
<h2>FOX SINGLE</h2><img src='2026/04-FOX.png'>
${game(1, 'LA Rams @ Philadelphia')}${game(2, 'Dallas @ Houston')}${game(3, 'Green Bay @ Tampa Bay')}
${game(4, 'NY Jets @ Chicago')}${game(5, 'Miami @ Minnesota (LATE)')}
</body></html>`;

test('a map filename says which network and which windows it covers', () => {
  assert.deepEqual(sectionKind('2026/04-CBS-E.png'), { network: 'CBS', windows: ['SUN_EARLY'], singleHeader: false });
  assert.deepEqual(sectionKind('2026/04-CBS-L.png'), { network: 'CBS', windows: ['SUN_LATE'], singleHeader: false });
  assert.deepEqual(sectionKind('2026/04-FOX.png'), { network: 'FOX', windows: ['SUN_EARLY', 'SUN_LATE'], singleHeader: true });
  assert.equal(sectionKind('nfl/swatches/1.png'), null);
  assert.equal(sectionKind('506 sports v3.png'), null);
});

test('the page resolves to three sections with every game identified', () => {
  const { sections, problems } = parseMapPage(PAGE, WEEK4);
  assert.deepEqual(problems, []);
  assert.equal(sections.length, 3, 'national games are not a map section');
  assert.deepEqual(sections.map((s) => [s.network, s.singleHeader, s.entries.length]),
    [['CBS', false, 4], ['CBS', false, 3], ['FOX', true, 5]]);

  const cbsEarly = sections[0].entries;
  assert.deepEqual(cbsEarly.map((e) => e.gameId),
    ['2026-W04-NE-BUF', '2026-W04-ARI-NYG', '2026-W04-JAX-CIN', '2026-W04-TEN-BAL']);
  assert.ok(cbsEarly.every((e) => e.window === 'SUN_EARLY'));
  assert.deepEqual(cbsEarly.map((e) => e.swatch),
    ['nfl/swatches/1.png', 'nfl/swatches/2.png', 'nfl/swatches/3.png', 'nfl/swatches/4.png']);
});

test('two teams in one city are told apart, which a city-only match would not do', () => {
  const { sections, problems } = parseMapPage(PAGE, WEEK4);
  assert.deepEqual(problems, []);
  // "LA Chargers" on the CBS late map and "LA Rams" on the FOX map: same city, different games.
  assert.ok(sections[1].entries.some((e) => e.gameId === '2026-W04-LAC-SEA'));
  assert.ok(sections[2].entries.some((e) => e.gameId === '2026-W04-LAR-PHI'));
  // Same for the two New York teams.
  assert.ok(sections[0].entries.some((e) => e.gameId === '2026-W04-ARI-NYG'));
  assert.ok(sections[2].entries.some((e) => e.gameId === '2026-W04-NYJ-CHI'));
});

test('on a single-header map the "(LATE)" label decides the window', () => {
  const fox = parseMapPage(PAGE, WEEK4).sections[2].entries;
  const late = fox.filter((e) => e.window === 'SUN_LATE');
  assert.deepEqual(late.map((e) => e.gameId), ['2026-W04-MIA-MIN']);
  assert.equal(fox.filter((e) => e.window === 'SUN_EARLY').length, 4);
});

test('a matchup that does not resolve is a problem, not a guess', () => {
  const bad = PAGE.replace('New England @ Buffalo', 'Somewhere @ Elsewhere');
  const { problems } = parseMapPage(bad, WEEK4);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /did not resolve/);
});

test('a commented-out map is pending, not published', () => {
  const notYet = PAGE.replace("<img src='2026/04-FOX.png'>", "<!-- <img src='2026/04-FOX.png'> -->");
  const { sections } = parseMapPage(notYet, WEEK4);
  assert.equal(sections.length, 2, 'the FOX map is not up yet');
  assert.deepEqual(pendingMaps(notYet), ['2026/04-FOX.png']);
  assert.deepEqual(pendingMaps(PAGE), [], 'nothing pending when every map is live');
});
