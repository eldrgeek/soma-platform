import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createMeter } from '../src/meter.js';
import { createSupabaseRestStore } from '../src/store-supabase-rest.js';

const ENT = {
  id: 'ent-1',
  billing_mode: 'platform_subscription',
  plan_id: 'free',
  monthly_cap_usd: 5,
  status: 'active',
};

function baseStore(overrides = {}) {
  return {
    async resolveEntitlement() {
      return ENT;
    },
    async monthToDateBillable() {
      return 0;
    },
    async insertUsageEvent() {},
    ...overrides,
  };
}

test('createMeter: store with resolveBillingSubject only', async () => {
  let called = false;
  const store = baseStore({
    async resolveBillingSubject(userId, requested) {
      called = true;
      assert.equal(userId, 'user-1');
      assert.equal(requested, undefined);
      return 'subject-a';
    },
  });
  const meter = createMeter({ store, app: 'kit' });
  const ctx = await meter.gateSpendForUserId('user-1', {
    capabilityId: 'x',
    estimatedUsd: 0.01,
  });
  assert.equal(called, true);
  assert.equal(ctx.studioId, 'subject-a');
  assert.equal(ctx.degraded, false);
});

test('createMeter: store with resolveStudioId only (PlayMaker adapter path)', async () => {
  let called = false;
  const store = baseStore({
    async resolveStudioId(userId) {
      called = true;
      assert.equal(userId, 'user-2');
      return 'studio-legacy';
    },
  });
  const meter = createMeter({ store, app: 'kit' });
  const ctx = await meter.gateSpendForUserId('user-2', {
    capabilityId: 'x',
    estimatedUsd: 0.01,
  });
  assert.equal(called, true);
  assert.equal(ctx.studioId, 'studio-legacy');
});

test('createMeter: when both resolvers exist, resolveBillingSubject wins', async () => {
  let newCalls = 0;
  let oldCalls = 0;
  const store = baseStore({
    async resolveBillingSubject() {
      newCalls += 1;
      return 'from-new';
    },
    async resolveStudioId() {
      oldCalls += 1;
      return 'from-old';
    },
  });
  const meter = createMeter({ store, app: 'kit' });
  const ctx = await meter.gateSpendForUserId('user-3', {
    capabilityId: 'x',
    estimatedUsd: 0.01,
  });
  assert.equal(newCalls, 1);
  assert.equal(oldCalls, 0);
  assert.equal(ctx.studioId, 'from-new');
});

test('createMeter: store with neither resolver throws at construction', () => {
  assert.throws(
    () => createMeter({ store: baseStore(), app: 'kit' }),
    /resolveBillingSubject or resolveStudioId/,
  );
});

test('createSupabaseRestStore: resolveStudioId is an alias of resolveBillingSubject', () => {
  const store = createSupabaseRestStore({
    url: 'https://example.supabase.co',
    serviceKey: 'key',
    fetch: async () => ({
      ok: true,
      text: async () => JSON.stringify([{ studio_id: 's1' }]),
    }),
  });
  assert.equal(store.resolveStudioId, store.resolveBillingSubject);
});
