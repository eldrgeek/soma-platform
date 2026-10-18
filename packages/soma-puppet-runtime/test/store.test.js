import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MemoryStore,
  PuppetParseError,
  StoreAdapter,
  createMemoryStore,
} from '../src/store.js';

const APP_ID = 'dinner';
const HOST_ID = 'host-1';
const SOURCE = `puppet "Dinner" version "0.2"
data guests {
  fields: [name]
}
screen "Home" {
  list "Guests" from guests
}`;

function makeStore() {
  return createMemoryStore({ [APP_ID]: { hostId: HOST_ID } });
}

async function propose(store, source = SOURCE) {
  return store.propose(APP_ID, {
    source,
    author: 'maker-1',
    reason: 'Initial version',
  });
}

test('memory store implements the adapter interface', () => {
  assert.ok(makeStore() instanceof MemoryStore);
  assert.ok(makeStore() instanceof StoreAdapter);
});

test('propose creates a proposed version without making it live', async () => {
  const store = makeStore();
  const versionId = await propose(store);

  assert.equal(versionId, 'v1');
  assert.equal(await store.getCurrent(APP_ID), null);
  assert.deepEqual(await store.listVersions(APP_ID), [{
    id: 'v1',
    source: SOURCE,
    author: 'maker-1',
    reason: 'Initial version',
    status: 'proposed',
  }]);
});

test('approve makes a proposed version live', async () => {
  const store = makeStore();
  const versionId = await propose(store);

  await store.approve(APP_ID, versionId, HOST_ID);

  assert.equal((await store.getCurrent(APP_ID)).id, versionId);
  assert.equal((await store.getCurrent(APP_ID)).status, 'approved');
});

test('undo restores the previous approved version', async () => {
  const store = makeStore();
  const first = await propose(store);
  await store.approve(APP_ID, first, HOST_ID);
  const second = await propose(store, SOURCE.replace('Dinner', 'Dinner v2'));
  await store.approve(APP_ID, second, HOST_ID);

  const restored = await store.undo(APP_ID, HOST_ID);

  assert.equal(restored.id, first);
  assert.equal((await store.getCurrent(APP_ID)).id, first);
});

test('non-host cannot approve or undo', async () => {
  const store = makeStore();
  const first = await propose(store);

  await assert.rejects(
    store.approve(APP_ID, first, 'someone-else'),
    /Only the host/,
  );
  await store.approve(APP_ID, first, HOST_ID);
  const second = await propose(store, SOURCE.replace('Dinner', 'Dinner v2'));
  await store.approve(APP_ID, second, HOST_ID);
  await assert.rejects(
    store.undo(APP_ID, 'someone-else'),
    /Only the host/,
  );
});

test('propose refuses source with parse errors', async () => {
  const store = makeStore();

  await assert.rejects(
    propose(store, SOURCE.replace('list "Guests"', 'carousel "Guests"')),
    (error) => {
      assert.ok(error instanceof PuppetParseError);
      assert.match(error.errors[0].message, /Unknown element kind/);
      return true;
    },
  );
  assert.deepEqual(await store.listVersions(APP_ID), []);
});

test('add refuses a field not declared by the current version', async () => {
  const store = makeStore();
  const versionId = await propose(store);
  await store.approve(APP_ID, versionId, HOST_ID);

  await assert.rejects(
    store.add(APP_ID, 'guests', { name: 'Rosa', email: 'rosa@example.com' }, 'rosa'),
    /Undeclared field\(s\) for guests: email/,
  );
  assert.deepEqual(await store.list(APP_ID, 'guests'), []);
});

test('only a row author or host can remove it', async () => {
  const store = makeStore();
  const versionId = await propose(store);
  await store.approve(APP_ID, versionId, HOST_ID);
  const row = await store.add(APP_ID, 'guests', { name: 'Rosa' }, 'rosa');

  await assert.rejects(
    store.remove(APP_ID, 'guests', row.id, 'stranger'),
    /Only the row author or app host/,
  );
  await store.remove(APP_ID, 'guests', row.id, HOST_ID);
  assert.deepEqual(await store.list(APP_ID, 'guests'), []);
});
