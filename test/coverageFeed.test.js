import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSeed } from '../server/schedule/scheduleService.js';
import { resolveWindowGame, gameInMarket } from '../server/coverage/coverageService.js';
import { validateFeed, feedOverrides, openSlots, emptyFeed, FEED_VERSION } from '../server/coverage/coverageFeed.js';

const games = loadSeed(2026);
const good = () => ({
  version: FEED_VERSION,
  season: 2026,
  generatedAt: new Date().toISOString(),
  weeks: { 1: { source: 'test map', markets: { hartford: { FOX: { SUN_EARLY: '2026-W01-ATL-PIT' } } } } },
});

test('a well-formed feed validates and counts its entries', () => {
  const v = validateFeed(good(), games);
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(v.stats.entries, 1);
});

test('a feed entry naming a game that does not exist is rejected', () => {
  const f = good();
  f.weeks[1].markets.hartford.FOX.SUN_EARLY = '2026-W01-NOT-REAL';
  const v = validateFeed(f, games);
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /no game/);
});

test('a feed entry naming a game from the wrong week or window is rejected', () => {
  const wrongWindow = good();
  wrongWindow.weeks[1].markets.hartford.FOX = { SUN_LATE: '2026-W01-ATL-PIT' };
  assert.match(validateFeed(wrongWindow, games).errors.join(';'), /SUN_EARLY window/);

  const wrongWeek = good();
  wrongWeek.weeks[2] = { source: 'test map', markets: { hartford: { FOX: { SUN_EARLY: '2026-W01-ATL-PIT' } } } };
  assert.match(validateFeed(wrongWeek, games).errors.join(';'), /week 1 game/);
});

test('a feed entry putting a game on the wrong network is rejected', () => {
  const f = good();
  f.weeks[1].markets.hartford = { CBS: { SUN_EARLY: '2026-W01-ATL-PIT' } };
  assert.match(validateFeed(f, games).errors.join(';'), /not on CBS/);
});

test('unknown markets and unpublishable weeks are rejected', () => {
  const f = good();
  f.weeks[1].markets.notaplace = { FOX: { SUN_EARLY: '2026-W01-ATL-PIT' } };
  assert.match(validateFeed(f, games).errors.join(';'), /unknown market/);
});

test('a week with no source is rejected, so a wrong entry stays traceable', () => {
  const f = good();
  delete f.weeks[1].source;
  assert.match(validateFeed(f, games).errors.join(';'), /source is required/);
});

test('an empty feed is valid - having no answer is a legitimate state', () => {
  const v = validateFeed(emptyFeed(2026), games);
  assert.equal(v.ok, true);
  assert.equal(v.stats.entries, 0);
});

test('feed entries read as overrides, keyed by week', () => {
  const o = feedOverrides(good());
  assert.equal(o['1'].hartford.FOX.SUN_EARLY, '2026-W01-ATL-PIT');
});

test('the published map turns an unresolvable window into a confirmed answer', () => {
  const overrides = feedOverrides(good());
  const before = resolveWindowGame({ games, week: 1, marketKey: 'hartford', network: 'FOX', window: 'SUN_EARLY', overrides: {} });
  assert.equal(before.game, null);
  assert.equal(before.confidence, 'unknown');

  const after = resolveWindowGame({ games, week: 1, marketKey: 'hartford', network: 'FOX', window: 'SUN_EARLY', overrides });
  assert.equal(after.game.id, '2026-W01-ATL-PIT');
  assert.equal(after.confidence, 'confirmed');

  // ...and only then may the app tell someone a different game is not on their station.
  const other = gameInMarket(games.find((g) => g.id === '2026-W01-TB-CIN'), 'hartford', games, overrides);
  assert.equal(other.airs, false);
  assert.equal(other.confidence, 'confirmed');
  assert.match(other.reason, /Falcons at Steelers/);
});

test('the weekly chore only asks about windows the rules cannot already answer', () => {
  const open = openSlots(games, 1, (a) => resolveWindowGame({ ...a, overrides: {} }));
  assert.ok(open.length > 0);
  // Every listed slot must be genuinely ambiguous: more than one candidate, and no confirmed rule.
  for (const s of open) {
    assert.ok(s.candidates.length > 1, `${s.market} ${s.network} ${s.window} had only one candidate`);
    const r = resolveWindowGame({ games, week: 1, marketKey: s.market, network: s.network, window: s.window, overrides: {} });
    assert.notEqual(r.confidence, 'confirmed');
  }
  // Pittsburgh gets the Steelers by rule, so it must never appear in the chore list.
  assert.equal(open.some((s) => s.market === 'pittsburgh' && s.network === 'FOX'), false);
});
