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

// Behaves like deployed Netlify Blobs: a read without consistency 'strong'
// returns the value as it was before the latest write (eventual consistency),
// and a conditional write is refused when the entry's etag has moved on.
class FakeBlobStore {
  values = new Map();
  stale = new Map();
  #etag = 0;

  #read(key, consistency) {
    const entry = consistency === 'strong' ? this.values.get(key) : this.stale.get(key);
    return entry ?? null;
  }

  async get(key, { type, consistency } = {}) {
    const entry = this.#read(key, consistency);
    if (!entry) return null;
    return type === 'json' ? structuredClone(entry.value) : JSON.stringify(entry.value);
  }

  async getWithMetadata(key, { type, consistency } = {}) {
    const entry = this.#read(key, consistency);
    if (!entry) return null;
    const data = type === 'json' ? structuredClone(entry.value) : JSON.stringify(entry.value);
    return { data, etag: entry.etag, metadata: {} };
  }

  async setJSON(key, value, { onlyIfMatch, onlyIfNew } = {}) {
    // Yield first, so two concurrent updates both read before either writes.
    await new Promise((resolve) => setImmediate(resolve));
    const current = this.values.get(key);
    if (onlyIfNew && current) return { modified: false };
    if (onlyIfMatch && current?.etag !== onlyIfMatch) return { modified: false };
    this.stale.set(key, current);
    const etag = `e${++this.#etag}`;
    this.values.set(key, { value: structuredClone(value), etag });
    return { modified: true, etag };
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

test('blobs store reads its own writes when Blobs reads are eventually consistent', async () => {
  // The live failure of 2026-10-20: seeding proposed v1, then approve read
  // the blob from before that write and the app was left with no current version.
  const store = makeStore();
  const versionId = await propose(store);
  await store.approve(APP_ID, versionId, HOST_ID);
  await store.add(APP_ID, 'guests', { name: 'Rosa' }, 'rosa');

  assert.equal((await store.getCurrent(APP_ID))?.id, versionId);
  assert.deepEqual(await store.list(APP_ID, 'guests'), [{ id: 'r1', name: 'Rosa' }]);
});

test('blobs store keeps both writes when two instances update at once', async () => {
  const blobs = new FakeBlobStore();
  const setup = makeStore(blobs);
  const versionId = await propose(setup);
  await setup.approve(APP_ID, versionId, HOST_ID);

  // Two function instances, each with its own in-process queue.
  const first = makeStore(blobs);
  const second = makeStore(blobs);
  await Promise.all([
    first.add(APP_ID, 'guests', { name: 'Rosa' }, 'rosa'),
    second.add(APP_ID, 'guests', { name: 'Theo' }, 'theo'),
  ]);

  const names = (await makeStore(blobs).list(APP_ID, 'guests')).map(({ name }) => name);
  assert.deepEqual(names.sort(), ['Rosa', 'Theo']);
});
