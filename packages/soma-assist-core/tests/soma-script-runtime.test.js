'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('../src/soma-script-runtime.js');

function memoryStorage() {
  const values = new Map();
  return {
    async get(key) { return values.get(key); },
    async set(key, value) { values.set(key, structuredClone(value)); },
    values
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(body); } };
}

describe('Supabase script client', () => {
  test('constructs with the browser global fetch implementation', () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => response([]);
    try {
      assert.doesNotThrow(() => runtime.createScriptClient({
        url: 'https://project.supabase.co', anonKey: 'public', storage: memoryStorage()
      }));
    } finally {
      globalThis.fetch = original;
    }
  });

  test('fetches full rows, uses TTL cache, then validates versions without refetching payloads', async () => {
    const storage = memoryStorage();
    let time = 1_000;
    const manifest = [{ id: '1', name: 'flow', version: '1', content_hash: 'abc', updated_at: '2026-07-10' }];
    const rows = [{ ...manifest[0], payload: { chain: [] }, flow_metadata: {} }];
    const calls = [];
    const client = runtime.createScriptClient({
      url: 'https://project.supabase.co', anonKey: 'public', storage, ttlMs: 100,
      now: () => time,
      fetch: async url => { calls.push(url); return response(url.includes('payload') ? rows : manifest); }
    });

    assert.equal((await client.getScripts('Example.COM')).source, 'supabase');
    assert.equal(calls.length, 2);
    time += 50;
    assert.equal((await client.getScripts('example.com')).source, 'cache');
    assert.equal(calls.length, 2);
    time += 100;
    assert.equal((await client.getScripts('example.com')).source, 'cache-validated');
    assert.equal(calls.length, 3);
  });

  test('refetches payloads when manifest version changes', async () => {
    const storage = memoryStorage();
    let version = '1';
    let time = 0;
    let fullFetches = 0;
    const client = runtime.createScriptClient({
      url: 'https://project.supabase.co', anonKey: 'public', storage, ttlMs: 10, now: () => time,
      fetch: async url => {
        const row = { id: '1', name: 'flow', version, content_hash: version, updated_at: version };
        if (url.includes('payload')) { fullFetches += 1; return response([{ ...row, payload: { version } }]); }
        return response([row]);
      }
    });
    await client.getScripts('example.com');
    version = '2'; time = 20;
    const refreshed = await client.getScripts('example.com');
    assert.equal(refreshed.scripts[0].payload.version, '2');
    assert.equal(fullFetches, 2);
  });

  test('returns stale cache, then bundled rows when offline without cache', async () => {
    const storage = memoryStorage();
    let offline = false;
    let time = 0;
    const client = runtime.createScriptClient({
      url: 'https://project.supabase.co', anonKey: 'public', storage, ttlMs: 1, now: () => time,
      fetch: async url => {
        if (offline) throw new Error('offline');
        const manifest = [{ id: '1', version: '1', content_hash: 'a', updated_at: 'a' }];
        return response(url.includes('payload') ? [{ ...manifest[0], payload: {} }] : manifest);
      },
      localFallback: async hostname => [{ name: 'local-' + hostname }]
    });
    await client.getScripts('cached.test');
    offline = true; time = 2;
    assert.equal((await client.getScripts('cached.test')).source, 'cache-stale');
    const bundled = await client.getScripts('new.test');
    assert.equal(bundled.source, 'bundled');
    assert.equal(bundled.scripts[0].name, 'local-new.test');
  });
});

describe('multi-page flow engine', () => {
  const flow = {
    timeoutMs: 10_000,
    stepTimeoutMs: 2_000,
    steps: [1, 2, 3, 4].map(number => ({
      id: 'p' + number,
      pageMatch: { pathname: '/p' + number },
      action: { type: number === 4 ? 'complete' : 'click' }
    }))
  };

  test('persists a cursor and resumes through three full navigations', async () => {
    const storage = memoryStorage();
    let time = 100;
    let engine = runtime.createFlowEngine({ storage, now: () => time });
    await engine.start(7, flow, { id: 'script' });
    assert.equal((await engine.onNavigation(7, 'http://localhost/p1', true)).cursor, 0);

    time += 10;
    engine = runtime.createFlowEngine({ storage, now: () => time }); // service-worker restart
    assert.equal((await engine.onNavigation(7, 'http://localhost/p2', true)).cursor, 1);
    time += 10;
    assert.equal((await engine.onNavigation(7, 'http://localhost/p3', true)).cursor, 2);
    time += 10;
    assert.equal((await engine.onNavigation(7, 'http://localhost/p4', true)).cursor, 3);
    const done = await engine.completeStep(7, 3);
    assert.equal(done.type, 'completed');
    assert.equal((await engine.getState(7)).status, 'completed');
  });

  test('waits across restricted Google auth surfaces and resumes afterward', async () => {
    const storage = memoryStorage();
    const engine = runtime.createFlowEngine({ storage, now: () => 100 });
    await engine.start(9, flow);
    const restricted = await engine.onNavigation(9, 'https://accounts.google.com/gsi/select', false);
    assert.equal(restricted.reason, 'restricted-surface');
    assert.equal((await engine.getState(9)).cursor, 0);
    assert.equal((await engine.onNavigation(9, 'http://localhost/p1', true)).type, 'dispatch');
  });

  test('abandons a flow whose step deadline expires', async () => {
    const storage = memoryStorage();
    let time = 0;
    const engine = runtime.createFlowEngine({ storage, now: () => time });
    await engine.start(3, flow);
    await engine.onNavigation(3, 'http://localhost/p1', true);
    time = 2_001;
    const result = await engine.onNavigation(3, 'http://localhost/other', true);
    assert.equal(result.type, 'abandoned');
    assert.equal(result.reason, 'step-timeout');
  });
});
