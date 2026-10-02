import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSupabaseRestStore } from '../src/store-supabase-rest.js';

const URL = 'https://example.supabase.co';
const KEY = 'service-role-key';

/** @typedef {{ url: string; init?: RequestInit }} FetchCall */

/**
 * @param {(call: FetchCall) => Response | Promise<Response>} handler
 */
function fakeFetch(handler) {
  /** @type {FetchCall[]} */
  const calls = [];
  /** @type {typeof fetch} */
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler({ url: String(url), init });
  };
  return { fn, calls };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authHeaders(init) {
  const h = init?.headers;
  assert.ok(h && typeof h === 'object' && !Array.isArray(h));
  assert.equal(h.apikey, KEY);
  assert.equal(h.Authorization, `Bearer ${KEY}`);
  assert.equal(h['Content-Type'], 'application/json');
}

test('resolveStudioId: membership query URL and headers', async () => {
  const { fn, calls } = fakeFetch(({ url }) => {
    assert.match(
      url,
      /\/rest\/v1\/memberships\?user_id=eq\.user-42&select=studio_id&order=created_at\.asc$/,
    );
    return jsonResponse([{ studio_id: 'studio-first' }]);
  });
  const store = createSupabaseRestStore({ url: URL, serviceKey: KEY, fetch: fn });
  const id = await store.resolveStudioId('user-42');
  assert.equal(id, 'studio-first');
  assert.equal(calls.length, 1);
  authHeaders(calls[0].init);
});

test('resolveStudioId: honours requested studio only when member', async () => {
  const { fn } = fakeFetch(({ url }) => {
    if (url.includes('user_id=eq.agent')) {
      return jsonResponse([
        { studio_id: 'studio-a' },
        { studio_id: 'studio-b' },
      ]);
    }
    throw new Error(`unexpected ${url}`);
  });
  const store = createSupabaseRestStore({ url: URL, serviceKey: KEY, fetch: fn });
  assert.equal(await store.resolveStudioId('agent', 'studio-b'), 'studio-b');
  assert.equal(await store.resolveStudioId('agent', 'studio-z'), 'studio-a');
});

test('resolveEntitlement: query then RPC heal when missing', async () => {
  const entQ =
    '/rest/v1/entitlements?studio_id=eq.studio-x&scope=eq.tenant&subscriber_id=is.null' +
    '&select=id,billing_mode,plan_id,monthly_cap_usd,status&limit=1';
  let entHits = 0;
  const { fn, calls } = fakeFetch(({ url, init }) => {
    if (url.endsWith(entQ)) {
      entHits += 1;
      if (entHits === 1) return jsonResponse([]);
      return jsonResponse([
        {
          id: 'ent-new',
          billing_mode: 'platform_subscription',
          plan_id: 'free',
          monthly_cap_usd: 5,
          status: 'active',
        },
      ]);
    }
    if (url.endsWith('/rest/v1/rpc/pm_ensure_default_entitlement')) {
      assert.equal(init?.method, 'POST');
      assert.deepEqual(JSON.parse(String(init?.body)), { p_studio: 'studio-x' });
      return jsonResponse(null);
    }
    throw new Error(`unexpected ${url}`);
  });
  const store = createSupabaseRestStore({ url: URL, serviceKey: KEY, fetch: fn });
  const ent = await store.resolveEntitlement('studio-x');
  assert.equal(ent?.id, 'ent-new');
  assert.equal(calls.length, 3);
  authHeaders(calls[0].init);
});

test('monthToDateBillable: studio_usage_mtd filter', async () => {
  const { fn, calls } = fakeFetch(({ url }) => {
    assert.match(url, /\/rest\/v1\/studio_usage_mtd\?studio_id=eq\.s1&select=billable_usd$/);
    return jsonResponse([{ billable_usd: '3.25' }]);
  });
  const store = createSupabaseRestStore({ url: URL, serviceKey: KEY, fetch: fn });
  assert.equal(await store.monthToDateBillable('s1'), 3.25);
  assert.equal(calls.length, 1);
});

test('insertUsageEvent: POST body columns and Prefer return=minimal', async () => {
  const row = {
    studio_id: 's1',
    subscriber_id: 'u1',
    capability_id: 'cap',
    kind: 'tts_chars',
    provider: 'elevenlabs',
    amount: 100,
    cost_usd: 0.022,
    billable_usd: 0.022,
    entitlement_id: 'e1',
    billing_mode: 'platform_subscription',
    ref: null,
  };
  const { fn, calls } = fakeFetch(({ url, init }) => {
    assert.equal(url, `${URL}/rest/v1/usage_events`);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), row);
    const h = init?.headers;
    assert.ok(h && typeof h === 'object');
    assert.equal(h.Prefer, 'return=minimal');
    return new Response('', { status: 201 });
  });
  const store = createSupabaseRestStore({ url: URL, serviceKey: KEY, fetch: fn });
  await store.insertUsageEvent(row);
  assert.equal(calls.length, 1);
  authHeaders(calls[0].init);
});

test('adminFetch: non-ok response throws', async () => {
  const { fn } = fakeFetch(() => new Response('nope', { status: 503 }));
  const store = createSupabaseRestStore({ url: URL, serviceKey: KEY, fetch: fn });
  await assert.rejects(
    () => store.resolveStudioId('u'),
    /meter:.*503/,
  );
});
