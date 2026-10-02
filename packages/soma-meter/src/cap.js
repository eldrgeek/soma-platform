/**
 * @typedef {'platform_subscription' | 'platform_metered' | 'byok'} BillingMode
 */

export class CapError extends Error {
  constructor(mtdUsd, capUsd, estimatedUsd) {
    super(
      `Monthly usage cap reached ($${mtdUsd.toFixed(2)} of $${capUsd.toFixed(2)} used this month). ` +
        `The cap resets at the start of next month; plan upgrades and bring-your-own-key are on the roadmap.`,
    );
    this.status = 402;
    this.payload = {
      error: this.message,
      code: 'cap_reached',
      mtd_usd: round2(mtdUsd),
      cap_usd: round2(capUsd),
      estimated_usd: round4(estimatedUsd),
    };
  }
}

/**
 * @param {{
 *   mtdUsd: number;
 *   capUsd: number;
 *   estimatedUsd: number;
 *   billingMode: BillingMode;
 *   status: string;
 * }} input
 */
export function decideSpend(input) {
  if (input.status !== 'active') return { allowed: false, reason: 'entitlement_inactive' };
  if (input.billingMode === 'byok') return { allowed: true };
  if (input.mtdUsd + input.estimatedUsd <= input.capUsd) return { allowed: true };
  return { allowed: false, reason: 'cap_reached' };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
function round4(n) {
  return Math.round(n * 10_000) / 10_000;
}
