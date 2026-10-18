import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from '../src/parser.js';
import { createMemoryStore } from '../src/store.js';

const APP_ID = 'sunday-supper';
const HOST_ID = 'rosa';

async function example(name) {
  return readFile(new URL(`../examples/${name}`, import.meta.url), 'utf8');
}

test('Sunday Supper v1 and v2 parse without errors', async () => {
  const [v1, v2] = await Promise.all([
    example('sunday-supper.puppet'),
    example('sunday-supper-v2.puppet'),
  ]);

  assert.deepEqual(parse(v1).errors, []);
  assert.deepEqual(parse(v2).errors, []);
});

test('approving v2 and undoing restores Sunday Supper v1', async () => {
  const store = createMemoryStore({ [APP_ID]: { hostId: HOST_ID } });
  const v1Source = await example('sunday-supper.puppet');
  const v2Source = await example('sunday-supper-v2.puppet');
  const v1 = await store.propose(APP_ID, {
    source: v1Source,
    author: 'forge',
    reason: 'First supper',
  });
  await store.approve(APP_ID, v1, HOST_ID);
  const v2 = await store.propose(APP_ID, {
    source: v2Source,
    author: 'forge',
    reason: 'Record dietary needs',
  });
  await store.approve(APP_ID, v2, HOST_ID);

  assert.equal((await store.getCurrent(APP_ID)).id, v2);
  const restored = await store.undo(APP_ID, HOST_ID);
  assert.equal(restored.id, v1);
  assert.equal(restored.source, v1Source);
});
