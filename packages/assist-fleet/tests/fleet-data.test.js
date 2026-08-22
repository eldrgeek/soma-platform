'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Fleet = require(path.join(__dirname, '../js/fleet-data.js'));

describe('fleet data layer', () => {
  test('listInstances maps derived status and sends bearer token', async () => {
    const calls = [];
    const client = Fleet.createFleetDataClient({
      url: 'https://example.supabase.co',
      anonKey: 'anon',
      getAccessToken: async () => 'user-jwt',
      fetch: async (url, init) => {
        calls.push({ url, init });
        return {
          ok: true,
          async json() {
            return [
              {
                install_uuid: 'a',
                app_id: 'yeshie',
                version: '1.0.0',
                last_seen: new Date().toISOString(),
                status: 'online'
              },
              {
                install_uuid: 'b',
                app_id: 'soma-guide',
                version: '1.0.1',
                last_seen: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                status: 'online'
              }
            ];
          }
        };
      }
    });

    const rows = await client.listInstances();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].derived_status, 'online');
    assert.equal(rows[1].derived_status, 'stale');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer user-jwt');
    assert.match(calls[0].url, /assist_heartbeats/);
  });

  test('getReviewQueue groups triage and open requests', async () => {
    const client = Fleet.createFleetDataClient({
      url: 'https://example.supabase.co',
      anonKey: 'anon',
      getAccessToken: async () => 'jwt',
      fetch: async (url) => {
        if (url.includes('assist_feedback')) {
          return {
            ok: true,
            async json() {
              return [
                { id: '1', route: 'yeshie', status: 'queued', description: 'a' },
                { id: '2', route: 'common', status: 'shipped', reviewed_at: null, description: 'b' },
                { id: '3', route: 'soma-guide', status: 'new', description: 'c' }
              ];
            }
          };
        }
        return {
          ok: true,
          async json() {
            return [
              { id: 'r1', app: 'yeshie', status: 'requested', item_count: 1 },
              { id: 'r2', app: 'common', status: 'completed', item_count: 2 }
            ];
          }
        };
      }
    });

    const queue = await client.getReviewQueue({ route: 'all' });
    assert.equal(queue.counts.feedback, 3);
    assert.equal(queue.counts.triage, 2);
    assert.equal(queue.counts.openRequests, 1);
    assert.equal(queue.counts.awaiting, 1);
  });

  test('unauthenticated responses surface as auth errors', async () => {
    const client = Fleet.createFleetDataClient({
      url: 'https://example.supabase.co',
      anonKey: 'anon',
      fetch: async () => ({ ok: false, status: 401, async json() { return []; } })
    });
    await assert.rejects(() => client.listFeedback(), /Authentication required/);
  });
});
