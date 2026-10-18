import assert from 'node:assert/strict';
import test from 'node:test';

import { BlobsStore, createBlobsStore } from '../src/blobs-store.js';
import { StoreAdapter } from '../src/store.js';

const APP_ID = 'dinner';
const HOST_ID = 'host-1';
const SOURCE = `puppet "Dinner" version "0.2"
data guests {
  fields: [name]
}
screen "Home" {
  list "Guests" from guests
}`;

class FakeBlobStore {
  values = new Map();

  async get(key, { type } = {}) {
    const value = this.values.get(key);
    if (value === undefined) return null;
    return type === 'json' ? structuredClone(value) : JSON.stringify(value);
  }

  async setJSON(key, value) {
    this.values.set(key, structuredClone(value));
  }
}

function makeStore(blobStore = new FakeBlobStore()) {
  return createBlobsStore(
    { [APP_ID]: { hostId: HOST_ID } },
    { blobStore },
  );
}

async function propose(store, title = 'Dinner') {
  return store.propose(APP_ID, {
    source: SOURCE.replace('Dinner', title),
    author: 'maker-1',
    reason: `Create ${title}`,
  });
}

test('blobs store implements StoreAdapter and persists versions and rows', async () => {
  const blobs = new FakeBlobStore();
  const store = makeStore(blobs);
  assert.ok(store instanceof BlobsStore);
  assert.ok(store instanceof StoreAdapter);

  const versionId = await propose(store);
  await store.approve(APP_ID, versionId, HOST_ID);
  await store.add(APP_ID, 'guests', { name: 'Rosa' }, 'rosa');

  const reloaded = makeStore(blobs);
  assert.equal((await reloaded.getCurrent(APP_ID)).id, 'v1');
  assert.deepEqual(await reloaded.list(APP_ID, 'guests'), [{ id: 'r1', name: 'Rosa' }]);
});

test('blobs store enforces declarations, hosts, and row ownership', async () => {
  const store = makeStore();
  const versionId = await propose(store);
  await assert.rejects(store.approve(APP_ID, versionId, 'stranger'), /Only the host/);
  await store.approve(APP_ID, versionId, HOST_ID);
  await assert.rejects(
    store.add(APP_ID, 'guests', { name: 'Rosa', email: 'r@example.com' }, 'rosa'),
    /Undeclared field/,
  );
  const row = await store.add(APP_ID, 'guests', { name: 'Rosa' }, 'rosa');
  await assert.rejects(
    store.remove(APP_ID, 'guests', row.id, 'stranger'),
    /Only the row author or app host/,
  );
});

test('blobs store can re-approve an undone version', async () => {
  const store = makeStore();
  const first = await propose(store);
  await store.approve(APP_ID, first, HOST_ID);
  const second = await propose(store, 'Dinner v2');
  await store.approve(APP_ID, second, HOST_ID);
  await store.undo(APP_ID, HOST_ID);

  const redone = await store.approve(APP_ID, second, HOST_ID);

  assert.equal(redone.id, second);
  assert.equal((await store.getCurrent(APP_ID)).id, second);
});
