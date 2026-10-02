import { CapError, decideSpend } from './cap.js';
import { costUsd } from './pricing.js';

/**
 * @typedef {'platform_subscription' | 'platform_metered' | 'byok'} BillingMode
 * @typedef {import('./pricing.js').UsageKind} UsageKind
 *
 * @typedef {Object} SpendContext
 * @property {string} studioId
 * @property {string} subscriberId
 * @property {string | null} entitlementId
 * @property {BillingMode} billingMode
 * @property {string | null} planId
 * @property {number} capUsd
 * @property {number} mtdUsd
 * @property {boolean} degraded
 *
 * @typedef {Object} MeterStore
 * @property {(userId: string, requested?: string) => Promise<string | null>} resolveStudioId
 * @property {(studioId: string) => Promise<{
 *   id: string;
 *   billing_mode: BillingMode;
 *   plan_id: string | null;
 *   monthly_cap_usd: number | string;
 *   status: string;
 * } | null>} resolveEntitlement
 * @property {(studioId: string) => Promise<number>} monthToDateBillable
 * @property {(row: Record<string, unknown>) => Promise<void>} insertUsageEvent
 * @property {(studioId: string) => Promise<{
 *   billable_usd?: number | string;
 *   cost_usd?: number | string;
 *   tts_chars?: number | string;
 *   llm_tokens?: number | string;
 * }>} [studioUsageMtd]
 *
 * @typedef {{ id: string; actingFor?: string; email?: string | null; token?: string }} MeterUser
 */

/**
 * @param {{ id: string; actingFor?: string }} user
 */
export function billingUserId(user) {
  return user.actingFor ?? user.id;
}

/**
 * @param {{
 *   store: MeterStore | null;
 *   app?: string;
 *   log?: Pick<Console, 'error'>;
 * }} options
 */
export function createMeter({ store, app, log = console }) {
  const tag = app ? `[${app}] ` : '';

  /**
   * @param {string} subscriberId
   * @param {string} [studioId]
   */
  function degradedContext(subscriberId, studioId) {
    return {
      studioId: studioId ?? '',
      subscriberId,
      entitlementId: null,
      billingMode: 'platform_subscription',
      planId: null,
      capUsd: 0,
      mtdUsd: 0,
      degraded: true,
    };
  }

  /**
   * @param {string} userId
   * @param {{ capabilityId: string; estimatedUsd: number; studioId?: string }} opts
   */
  async function gateSpendForUserId(userId, opts) {
    return gateSpend({ id: userId, email: null, token: '' }, opts);
  }

  /**
   * @param {MeterUser} user
   * @param {{ capabilityId: string; estimatedUsd: number; studioId?: string }} opts
   */
  async function gateSpend(user, opts) {
    if (!store) {
      log.error(`${tag}metering: gate degraded (null store, failing open)`);
      return degradedContext(billingUserId(user), opts.studioId);
    }
    try {
      const billUser = billingUserId(user);
      const studioId = await store.resolveStudioId(billUser, opts.studioId);
      if (!studioId) {
        log.error(
          `${tag}metering: user ${billUser} has no studio membership (${opts.capabilityId})`,
        );
        return degradedContext(billUser, opts.studioId);
      }
      const ent = await store.resolveEntitlement(studioId);
      if (!ent) {
        log.error(`${tag}metering: no entitlement resolvable for studio ${studioId}`);
        return degradedContext(user.id, studioId);
      }
      const mtdUsd = await store.monthToDateBillable(studioId);
      const cap = num(ent.monthly_cap_usd);
      const verdict = decideSpend({
        mtdUsd,
        capUsd: cap,
        estimatedUsd: opts.estimatedUsd,
        billingMode: ent.billing_mode,
        status: ent.status,
      });
      if (!verdict.allowed) throw new CapError(mtdUsd, cap, opts.estimatedUsd);
      return {
        studioId,
        subscriberId: billUser,
        entitlementId: ent.id,
        billingMode: ent.billing_mode,
        planId: ent.plan_id,
        capUsd: cap,
        mtdUsd,
        degraded: false,
      };
    } catch (err) {
      if (err instanceof CapError) throw err;
      log.error(`${tag}metering: gate degraded (failing open):`, err);
      return degradedContext(billingUserId(user), opts.studioId);
    }
  }

  /**
   * @param {SpendContext} ctx
   * @param {{
   *   capabilityId: string;
   *   kind: UsageKind;
   *   provider: string;
   *   amount: number;
   *   ref?: string;
   *   model?: string;
   * }} usage
   */
  async function recordUsage(ctx, usage) {
    if (!store) {
      log.error(
        `${tag}metering: usage NOT recorded (null store): ${usage.capabilityId} ${usage.kind}=${usage.amount}`,
      );
      return;
    }
    try {
      if (ctx.degraded || !ctx.studioId) {
        log.error(
          `${tag}metering: usage NOT recorded (degraded context): ${usage.capabilityId} ${usage.kind}=${usage.amount}`,
        );
        return;
      }
      const cost = costUsd(usage.kind, usage.amount, usage.model);
      const billable = ctx.billingMode === 'byok' ? 0 : cost;
      await store.insertUsageEvent({
        studio_id: ctx.studioId,
        subscriber_id: ctx.subscriberId,
        capability_id: usage.capabilityId,
        kind: usage.kind,
        provider: usage.provider,
        amount: Math.max(0, Math.round(usage.amount)),
        cost_usd: round6(cost),
        billable_usd: round6(billable),
        entitlement_id: ctx.entitlementId,
        billing_mode: ctx.billingMode,
        ref: usage.ref ?? null,
      });
    } catch (err) {
      log.error(`${tag}metering: usage write failed (spend already happened):`, err);
    }
  }

  /**
   * @param {MeterUser} user
   * @param {string} [studioId]
   */
  async function usageSummary(user, studioId) {
    if (!store) return null;
    try {
      const studio = await store.resolveStudioId(billingUserId(user), studioId);
      if (!studio) return null;
      const ent = await store.resolveEntitlement(studio);
      if (!ent) return null;
      const mtd =
        typeof store.studioUsageMtd === 'function'
          ? await store.studioUsageMtd(studio)
          : { billable_usd: await store.monthToDateBillable(studio), tts_chars: 0, llm_tokens: 0 };
      const mtdUsd = num(mtd.billable_usd);
      const cap = num(ent.monthly_cap_usd);
      return {
        studio_id: studio,
        plan_id: ent.plan_id,
        billing_mode: ent.billing_mode,
        status: ent.status,
        cap_usd: round2(cap),
        mtd_usd: round4(mtdUsd),
        remaining_usd: round4(Math.max(0, cap - mtdUsd)),
        blocked:
          ent.status !== 'active' || (ent.billing_mode !== 'byok' && mtdUsd >= cap),
        tts_chars: num(mtd.tts_chars),
        llm_tokens: num(mtd.llm_tokens),
      };
    } catch {
      return null;
    }
  }

  /**
   * @param {MeterUser} user
   * @param {string} [studioId]
   */
  async function hasActiveEntitlement(user, studioId) {
    if (!store) return false;
    try {
      const studio = await store.resolveStudioId(billingUserId(user), studioId);
      if (!studio) return false;
      const ent = await store.resolveEntitlement(studio);
      return ent?.status === 'active';
    } catch (err) {
      log.error(`${tag}metering: hasActiveEntitlement check failed (failing closed):`, err);
      return false;
    }
  }

  return {
    gateSpend,
    gateSpendForUserId,
    recordUsage,
    usageSummary,
    hasActiveEntitlement,
  };
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10_000) / 10_000;
}
function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}
