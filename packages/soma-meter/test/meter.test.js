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
  estimateTtsUsd,
  estimateConvaiUsd,
  estimateLlmUsd,
  estimateWebSearchUsd,
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

test('decideSpend: past_due denies with entitlement_inactive', () => {
  const v = decideSpend({
    mtdUsd: 0,
    capUsd: 5,
    estimatedUsd: 0.01,
    billingMode: 'platform_subscription',
    status: 'past_due',
  });
  assert.equal(v.allowed, false);
  assert.equal(v.reason, 'entitlement_inactive');
});

test('gateSpend: past_due entitlement refused (CapError)', async () => {
  store = makeStore({
    resolveEntitlement: async () => ({ ...ENT, status: 'past_due' }),
  });
  meter = createMeter({ store, log: { error: () => {} } });
  await assert.rejects(
    () => meter.gateSpend({ id: 'user-1' }, { capabilityId: 'tts', estimatedUsd: 0.01 }),
    (err) => err instanceof CapError,
  );
});

test('recordUsage: degraded context skips insertUsageEvent', async () => {
  let insertCalls = 0;
  store = makeStore({
    insertUsageEvent: async () => {
      insertCalls += 1;
    },
  });
  meter = createMeter({
    store,
    log: { error: (...a) => errors.push(a.join(' ')) },
  });
  await meter.recordUsage(
    {
      studioId: STUDIO,
      subscriberId: 'user-1',
      entitlementId: null,
      billingMode: 'platform_subscription',
      planId: null,
      capUsd: 0,
      mtdUsd: 0,
      degraded: true,
    },
    { capabilityId: 'tts', kind: 'tts_chars', provider: 'elevenlabs', amount: 50 },
  );
  assert.equal(insertCalls, 0);
  assert.match(errors.join('\n'), /degraded context/);
});

test('hasActiveEntitlement: active entitlement returns true', async () => {
  assert.equal(await meter.hasActiveEntitlement({ id: 'user-1' }), true);
});

test('hasActiveEntitlement: inactive entitlement returns false', async () => {
  store = makeStore({
    resolveEntitlement: async () => ({ ...ENT, status: 'canceled' }),
  });
  meter = createMeter({ store, log: { error: () => {} } });
  assert.equal(await meter.hasActiveEntitlement({ id: 'user-1' }), false);
});

test('hasActiveEntitlement: store throw fails closed', async () => {
  store = makeStore({
    resolveEntitlement: async () => {
      throw new Error('down');
    },
  });
  meter = createMeter({
    store,
    log: { error: (...a) => errors.push(a.join(' ')) },
  });
  assert.equal(await meter.hasActiveEntitlement({ id: 'user-1' }), false);
  assert.match(errors.join('\n'), /failing closed/);
});

test('hasActiveEntitlement: null store fails closed', async () => {
  meter = createMeter({ store: null, log: { error: () => {} } });
  assert.equal(await meter.hasActiveEntitlement({ id: 'user-1' }), false);
});

test('usageSummary: blocked flag and rounding', async () => {
  store = makeStore({
    mtd: 4.876543,
    resolveEntitlement: async () => ({ ...ENT, monthly_cap_usd: 5 }),
    studioUsageMtd: async () => ({
      billable_usd: 4.876543,
      cost_usd: 5.1,
      tts_chars: 100,
      llm_tokens: 2000,
    }),
  });
  meter = createMeter({ store, log: { error: () => {} } });
  const s = await meter.usageSummary({ id: 'user-1' });
  assert.equal(s.studio_id, STUDIO);
  assert.equal(s.cap_usd, 5);
  assert.equal(s.mtd_usd, 4.8765);
  assert.equal(s.remaining_usd, 0.1235);
  assert.equal(s.blocked, false);
  assert.equal(s.tts_chars, 100);
  assert.equal(s.llm_tokens, 2000);
});

test('usageSummary: blocked when at cap', async () => {
  store = makeStore({
    studioUsageMtd: async () => ({ billable_usd: 5, cost_usd: 5, tts_chars: 0, llm_tokens: 0 }),
  });
  meter = createMeter({ store, log: { error: () => {} } });
  const s = await meter.usageSummary({ id: 'user-1' });
  assert.equal(s.blocked, true);
});

test('usageSummary: errors propagate', async () => {
  store = makeStore({
    resolveStudioId: async () => {
      throw new Error('summary failed');
    },
  });
  meter = createMeter({ store, log: { error: () => {} } });
  await assert.rejects(() => meter.usageSummary({ id: 'user-1' }), /summary failed/);
});

test('estimateTtsUsd matches costUsd for chars', () => {
  assert.equal(estimateTtsUsd(500), costUsd('tts_chars', 500));
});

test('estimateConvaiUsd uses max duration minutes', () => {
  assert.equal(estimateConvaiUsd(120), costUsd('convai_minutes', 2));
});

test('estimateLlmUsd: chars/4 input + max output tokens', () => {
  const est = estimateLlmUsd(400, 1000, 'claude-sonnet-4');
  const want =
    costUsd('llm_input_tokens', 100, 'claude-sonnet-4') +
    costUsd('llm_output_tokens', 1000, 'claude-sonnet-4');
  assert.equal(est, want);
});

test('estimateWebSearchUsd at list price', () => {
  assert.equal(estimateWebSearchUsd(3), 3 * PRICING.web_search_per_search);
  assert.equal(estimateWebSearchUsd(-1), 0);
});
