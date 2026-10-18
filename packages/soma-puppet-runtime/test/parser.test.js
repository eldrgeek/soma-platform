import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from '../src/parser.js';

test('parses the copied membership fixture without errors', async () => {
  const source = await readFile(
    new URL('./fixtures/membership.puppet', import.meta.url),
    'utf8',
  );

  const result = parse(source);

  assert.deepEqual(result.errors, []);
  assert.equal(result.sketch.meta.title, 'Legends Membership — Request slice');
});
