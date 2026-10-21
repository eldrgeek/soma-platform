// Each Netlify Function invocation brings its own Blobs token, and the token
// expires. A store made on one request and kept on a warm instance fails on a
// later request with "Failed to decode token: Token expired" (seen live on
// 2026-10-21). These tests give every request a new token and expire the old
// one, so a handler that keeps a store across requests fails here too.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createApiFunction } from '../site/functions/api.mjs';
import { createStudioFunction } from '../site/functions/studio.mjs';

let currentToken = 0;

function expiringStores() {
  const values = new Map();
  let etag = 0;
  const made = [];
  const getStoreImpl = ({ name }) => {
    const token = currentToken;
    const check = () => {
      if (token !== currentToken) throw new Error('Netlify Blobs has generated an internal error (Failed to decode token: Token expired)');
    };
    const key = (k) => `${name}/${k}`;
    const store = {
      async get(k, { type } = {}) {
        check();
        const entry = values.get(key(k));
        if (!entry) return null;
        return type === 'json' ? structuredClone(entry.value) : JSON.stringify(entry.value);
      },
      async getWithMetadata(k, { type } = {}) {
        check();
        const entry = values.get(key(k));
        if (!entry) return null;
        return { data: type === 'json' ? structuredClone(entry.value) : JSON.stringify(entry.value), etag: entry.etag, metadata: {} };
      },
      async setJSON(k, value, { onlyIfMatch, onlyIfNew } = {}) {
        check();
        const current = values.get(key(k));
        if (onlyIfNew && current) return { modified: false };
        if (onlyIfMatch && current?.etag !== onlyIfMatch) return { modified: false };
        values.set(key(k), { value: structuredClone(value), etag: `e${++etag}` });
        return { modified: true };
      },
      async list() {
        check();
        return { blobs: [] };
      },
    };
    made.push(name);
    return store;
  };
  return { getStoreImpl, made };
}

test('the studio function makes its Blobs store per request, so an expired token is never reused', async () => {
  const { getStoreImpl, made } = expiringStores();
  const handler = createStudioFunction({ getStoreImpl, env: { STUDIO_TEAM_KEY: 'k'.repeat(32) } });
  for (let request = 1; request <= 3; request += 1) {
    currentToken = request;
    const response = await handler(new Request('https://soma-forge.netlify.app/api/studio/team/inbox', {
      headers: { 'x-studio-team-key': 'k'.repeat(32) },
    }));
    assert.equal(response.status, 200, `request ${request}: ${await response.clone().text()}`);
  }
  assert.equal(made.filter((name) => name === 'soma-studio').length, 3);
});

test('the runtime API makes its Blobs stores per request, so an expired token is never reused', async () => {
  const { getStoreImpl } = expiringStores();
  const handler = createApiFunction({ getStoreImpl, env: { NETLIFY_DEV: 'true' } });
  for (let request = 1; request <= 3; request += 1) {
    currentToken = request;
    const response = await handler(new Request('https://soma-forge.netlify.app/api/app/sunday-supper/current', {
      headers: { 'x-dev-user': 'rosa:Rosa' },
    }));
    assert.equal(response.status, 200, `request ${request}: ${await response.clone().text()}`);
    assert.match((await response.json()).source, /^puppet /);
  }
});
