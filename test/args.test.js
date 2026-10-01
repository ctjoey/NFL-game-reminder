// The flag reader, because the same mistake happened three times: `--save` never saved,
// `--alert` never alerted, and `--replace` never replaced. Each one read as unset, each run
// passed, and nothing said the switch had done nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flags } from '../server/coverage/args.js';

test('a value flag reads its value, and falls back when it has none', () => {
  const { flag } = flags(['ingest', '--week', '4', '--games', '/tmp/g.json']);
  assert.equal(flag('week'), '4');
  assert.equal(flag('games'), '/tmp/g.json');
  assert.equal(flag('season'), undefined);
  assert.equal(flag('season', '2026'), '2026');
});

test('a switch is seen wherever it sits, including last and before another flag', () => {
  const last = flags(['watch', '--week', '4', '--alert']);
  assert.equal(last.has('alert'), true, 'a switch written last has no token after it');

  const middle = flags(['ingest', '--save', '--week', '4']);
  assert.equal(middle.has('save'), true, 'the token after a switch is the next flag');

  assert.equal(flags(['ingest', '--week', '4']).has('save'), false);
});

test('a switch is not a value, and reading it as one is what went wrong', () => {
  // This is the bug, written down: both of these read as unset through `flag`, so every caller
  // that asked `flag('save') !== undefined` got false and skipped the work in silence.
  const { flag, has } = flags(['ingest', '--save', '--week', '4', '--alert']);
  assert.equal(flag('save'), undefined);
  assert.equal(flag('alert'), undefined);
  assert.equal(has('save'), true);
  assert.equal(has('alert'), true);
});

test('a flag absent from the line is absent either way', () => {
  const { flag, has } = flags([]);
  assert.equal(flag('week'), undefined);
  assert.equal(has('week'), false);
});
