// Behaves like deployed Netlify Blobs: a read without consistency 'strong'
// returns the value as it was before the latest write, and a conditional
// write is refused when the entry's etag has moved on. (Same contract as
// soma-puppet-runtime's test/blobs-store.test.js.)
export class FakeBlobStore {
  values = new Map();
  stale = new Map();
  writes = 0;
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
    this.writes += 1;
    return { modified: true, etag };
  }
}
