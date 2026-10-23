// An in-memory Netlify Blobs store for the video studio tests (v0.6, v0.7): list, metadata, etags and
// onlyIfMatch, as server/studio.js and server/boards.js use them.
export function studioBlobs() {
  const values = new Map();
  let etag = 0;
  return {
    values,
    async list({ prefix = '' } = {}) {
      return { blobs: [...values.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    async getMetadata(key) {
      const entry = values.get(key);
      return entry ? { etag: entry.etag, metadata: entry.metadata } : null;
    },
    async get(key, { type } = {}) {
      const entry = values.get(key);
      if (!entry) return null;
      return type === 'json' ? structuredClone(entry.value) : entry.value;
    },
    async getWithMetadata(key, { type } = {}) {
      const entry = values.get(key);
      if (!entry) return null;
      return { data: type === 'json' ? structuredClone(entry.value) : entry.value, etag: entry.etag, metadata: entry.metadata };
    },
    async set(key, value, { metadata } = {}) {
      values.set(key, { value, metadata, etag: `e${++etag}` });
    },
    async setJSON(key, value, { onlyIfMatch } = {}) {
      const entry = values.get(key);
      if (onlyIfMatch && entry?.etag !== onlyIfMatch) return { modified: false };
      values.set(key, { value: structuredClone(value), etag: `e${++etag}` });
      return { modified: true };
    },
    async delete(key) {
      values.delete(key);
    },
  };
}
