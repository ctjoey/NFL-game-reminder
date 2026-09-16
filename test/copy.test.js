import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCopy } from '../marketing/check-copy.js';

// App Store Connect truncates an over-length field as you type it, so a string that is two
// characters too long ships as a sentence that stops mid-word. Cheap to catch here.
test('every App Store string fits inside Apple\'s character limit', () => {
  const problems = checkCopy();
  assert.deepEqual(problems, [], problems.join('\n'));
});
