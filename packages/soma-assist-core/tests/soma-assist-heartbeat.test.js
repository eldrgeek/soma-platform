'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Heartbeat = require(path.join(__dirname, '../src/soma-assist-heartbeat.js'));

describe('heartbeat client', () => {
  test('normalizes adrian → soma-guide and reuses install uuid', () => {
    const store = {
      data: {},
      getItem(k) { return this.data[k] || null; },
      setItem(k, v) { this.data[k] = String(v); }
    };
    const id1 = Heartbeat.resolveInstallUuid(store, () => '11111111-1111-4111-8111-111111111111');
    const id2 = Heartbeat.resolveInstallUuid(store, () => '22222222-2222-4222-8222-222222222222');
    assert.equal(id1, id2);
    assert.equal(Heartbeat.normalizeAppId('adrian'), 'soma-guide');
  });

  test('beat posts rate-limited RPC and start fires immediately', async () => {
    const calls = [];
    const client = Heartbeat.createHeartbeatClient({
      url: 'https://example.supabase.co',
      anonKey: 'anon',
      appId: 'yeshie',
      version: '1.2.3',
      intervalMs: 0,
      installUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      fetch: async (url, init) => {
        calls.push({ url, body: JSON.parse(init.body) });
        return {
          ok: true,
          async json() {
            return {
              install_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              app_id: 'yeshie',
              version: '1.2.3',
              status: 'online',
              last_seen: '2026-07-10T12:00:00Z'
            };
          }
        };
      }
    });

    client.start();
    // allow microtask for startup beat
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls.length >= 1, true);
    assert.match(calls[0].url, /rpc\/assist_record_heartbeat$/);
    assert.equal(calls[0].body.p_app_id, 'yeshie');
    assert.equal(calls[0].body.p_version, '1.2.3');
    const again = await client.beat('idle');
    assert.equal(again.status, 'online');
    client.stop();
  });

  test('uuidV4 produces RFC-ish shape', () => {
    const id = Heartbeat.uuidV4(() => {
      const a = new Uint8Array(16);
      for (let i = 0; i < 16; i++) a[i] = i + 1;
      return a;
    });
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
