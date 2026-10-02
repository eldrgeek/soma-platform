import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  CapError,
  decideSpend,
  billingUserId,
  costUsd,
  createMeter,
  PRICING,
  USAGE_KINDS,
} from '../src/index.js';

const STUDIO = 'studio-aaa';
const ENT = {
  id: 'ent-1',
  billing_mode: 'platform_subscription',
  plan_id: 'free',
  monthly_cap_usd: 5,
  status: 'active',
};

/** @type {import('../src/meter.js').MeterStore | null} */
let store;
/** @type {string[]} */
let errors;
/** @type {Record<string, unknown> | null} */
let lastInsert;

function makeStore(overrides = {}) {
  return {
    async resolveStudioId(userId, requested) {
      if (overrides.resolveStudioId) return overrides.resolveStudioId(userId, requested);
      if (userId === 'no-member') return null;
      if (requested === 'other-studio') return 'other-studio';
      return STUDIO;
    },
    async resolveEntitlement(studioId) {
      if (overrides.resolveEntitlement) return overrides.resolveEntitlement(studioId);
      return ENT;
    },
    async monthToDateBillable(studioId) {
      if (overrides.monthToDateBillable) return overrides.monthToDateBillable(studioId);
      return overrides.mtd ?? 0;
    },
    async insertUsageEvent(row) {
      if (overrides.insertUsageEvent) return overrides.insertUsageEvent(row);
      lastInsert = row;
    },
    ...overrides,
  };
}

let meter;

beforeEach(() => {
  errors = [];
  lastInsert = null;
  store = makeStore();
  meter = createMeter({
    store,
    app: 'playmaker',
    log: { error: (...args) => errors.push(args.map(String).join(' ')) },
  });
});

test('decideSpend: under cap allows spend', () => {
  const v = decideSpend({
    mtdUsd: 2,
    capUsd: 5,
    estimatedUsd: 1,
    billingMode: 'platform_subscription',
    status: 'active',
  });
  assert.equal(v.allowed, true);
});

test('decideSpend: at cap allows spend when mtd + estimate equals cap', () => {
  const v = decideSpend({
    mtdUsd: 4,
    capUsd: 5,
    estimatedUsd: 1,
    billingMode: 'platform_subscription',
    status: 'active',
  });
  assert.equal(v.allowed, true);
});

test('decideSpend: over cap denies with cap_reached', () => {
  const v = decideSpend({
    mtdUsd: 4.5,
    capUsd: 5,
    estimatedUsd: 1,
    billingMode: 'platform_subscription',
    status: 'active',
  });
  assert.equal(v.allowed, false);
  assert.equal(v.reason, 'cap_reached');
});

test('gateSpend: under cap returns active context', async () => {
  store = makeStore({ mtd: 1 });
  meter = createMeter({ store, log: { error: () => {} } });
  const ctx = await meter.gateSpend(
    { id: 'user-1' },
    { capabilityId: 'tts', estimatedUsd: 0.5 },
  );
  assert.equal(ctx.degraded, false);
  assert.equal(ctx.studioId, STUDIO);
  assert.equal(ctx.mtdUsd, 1);
  assert.equal(ctx.capUsd, 5);
});

test('gateSpend: at cap passes (cap inequality)', async () => {
  store = makeStore({ mtd: 4 });
  meter = createMeter({ store, log: { error: () => {} } });
  const ctx = await meter.gateSpend(
    { id: 'user-1' },
    { capabilityId: 'tts', estimatedUsd: 1 },
  );
  assert.equal(ctx.degraded, false);
});

test('gateSpend: over cap throws CapError with payload fields', async () => {
  store = makeStore({ mtd: 4.99 });
  meter = createMeter({ store, log: { error: () => {} } });
  await assert.rejects(
    () =>
      meter.gateSpend({ id: 'user-1' }, { capabilityId: 'tts', estimatedUsd: 0.02 }),
    (err) => {
      assert.ok(err instanceof CapError);
      assert.equal(err.status, 402);
      assert.equal(err.payload.code, 'cap_reached');
      assert.equal(err.payload.mtd_usd, 4.99);
      assert.equal(err.payload.cap_usd, 5);
      assert.equal(err.payload.estimated_usd, 0.02);
      assert.match(String(err.payload.error), /Monthly usage cap reached/);
      return true;
    },
  );
});

test('gateSpend: BYOK passes when mtd exceeds cap', async () => {
  store = makeStore({
    mtd: 100,
    resolveEntitlement: async () => ({
      ...ENT,
      billing_mode: 'byok',
      monthly_cap_usd: 5,
    }),
  });
  meter = createMeter({ store, log: { error: () => {} } });
  const ctx = await meter.gateSpend(
    { id: 'user-1' },
    { capabilityId: 'tts', estimatedUsd: 10 },
  );
  assert.equal(ctx.degraded, false);
  assert.equal(ctx.billingMode, 'byok');
});

test('billingUserId + gateSpend: OBO bills principal studio membership', async () => {
  let resolvedUser = null;
  store = makeStore({
    resolveStudioId: async (userId) => {
      resolvedUser = userId;
      return userId === 'principal-1' ? STUDIO : null;
    },
  });
  meter = createMeter({ store, log: { error: () => {} } });
  const ctx = await meter.gateSpend(
    { id: 'agent-9', actingFor: 'principal-1' },
    { capabilityId: 'llm', estimatedUsd: 0.01 },
  );
  assert.equal(resolvedUser, 'principal-1');
  assert.equal(ctx.subscriberId, 'principal-1');
});

test('billingUserId returns principal when actingFor set', () => {
  assert.equal(billingUserId({ id: 'agent', actingFor: 'human' }), 'human');
  assert.equal(billingUserId({ id: 'human' }), 'human');
});

test('gateSpend: fail-open when store throws', async () => {
  store = makeStore({
    resolveEntitlement: async () => {
      throw new Error('supabase down');
    },
  });
  meter = createMeter({
    store,
    app: 'playmaker',
    log: { error: (...a) => errors.push(a.join(' ')) },
  });
  const ctx = await meter.gateSpend(
    { id: 'user-1' },
    { capabilityId: 'tts', estimatedUsd: 1 },
  );
  assert.equal(ctx.degraded, true);
  assert.match(errors.join('\n'), /failing open/);
});

test('gateSpend: fail-open when store is null', async () => {
  meter = createMeter({
    store: null,
    log: { error: (...a) => errors.push(a.join(' ')) },
  });
  const ctx = await meter.gateSpend(
    { id: 'user-1' },
    { capabilityId: 'tts', estimatedUsd: 1 },
  );
  assert.equal(ctx.degraded, true);
  assert.match(errors.join('\n'), /null store/);
});

test('recordUsage: BYOK writes billable_usd 0 but records cost_usd', async () => {
  const ctx = {
    studioId: STUDIO,
    subscriberId: 'user-1',
    entitlementId: ENT.id,
    billingMode: 'byok',
    planId: 'byok',
    capUsd: 5,
    mtdUsd: 0,
    degraded: false,
  };
  await meter.recordUsage(ctx, {
    capabilityId: 'tts',
    kind: 'tts_chars',
    provider: 'elevenlabs',
    amount: 1000,
  });
  assert.equal(lastInsert.billable_usd, 0);
  assert.equal(lastInsert.cost_usd, 0.22);
});

test('recordUsage: swallow insert error', async () => {
  store = makeStore({
    insertUsageEvent: async () => {
      throw new Error('insert failed');
    },
  });
  meter = createMeter({
    store,
    log: { error: (...a) => errors.push(a.join(' ')) },
  });
  const ctx = {
    studioId: STUDIO,
    subscriberId: 'user-1',
    entitlementId: ENT.id,
    billingMode: 'platform_subscription',
    planId: 'free',
    capUsd: 5,
    mtdUsd: 0,
    degraded: false,
  };
  await meter.recordUsage(ctx, {
    capabilityId: 'tts',
    kind: 'tts_chars',
    provider: 'elevenlabs',
    amount: 100,
  });
  assert.match(errors.join('\n'), /usage write failed/);
});

test('costUsd for every UsageKind matches PRICING table', () => {
  assert.equal(costUsd('tts_chars', 1000), PRICING.tts_per_1k_chars);
  assert.equal(costUsd('llm_input_tokens', 1_000_000), PRICING.llm_input_per_mtok);
  assert.equal(costUsd('llm_output_tokens', 1_000_000), PRICING.llm_output_per_mtok);
  assert.equal(costUsd('images', 2), 2 * PRICING.image_per_image);
  assert.equal(costUsd('convai_minutes', 3), 3 * PRICING.convai_per_minute);
  assert.equal(costUsd('web_searches', 4), 4 * PRICING.web_search_per_search);
  for (const kind of USAGE_KINDS) {
    assert.ok(Number.isFinite(costUsd(kind, 1)));
  }
});
