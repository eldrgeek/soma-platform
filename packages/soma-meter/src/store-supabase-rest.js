/**
 * Supabase PostgREST store — same paths/filters as PlayMaker adminFetch metering.
 *
 * @param {{
 *   url: string;
 *   serviceKey: string;
 *   fetch?: typeof fetch;
 *   ensureEntitlementRpc?: string;
 * }} options
 */
export function createSupabaseRestStore({
  url,
  serviceKey,
  fetch: fetchImpl = globalThis.fetch,
  ensureEntitlementRpc = 'pm_ensure_default_entitlement',
}) {
  if (!url || !serviceKey) {
    throw new Error('createSupabaseRestStore: url and serviceKey are required');
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('createSupabaseRestStore: fetch is required');
  }

  const base = url.replace(/\/$/, '');

  /**
   * @param {string} path
   * @param {RequestInit} [init]
   */
  async function adminFetch(path, init) {
    const resp = await fetchImpl(`${base}${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers && typeof init.headers === 'object' && !Array.isArray(init.headers)
          ? init.headers
          : {}),
      },
    });
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`meter: ${path} → ${resp.status}: ${detail.slice(0, 300)}`);
    }
    const text = await resp.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    /**
     * @param {string} userId
     * @param {string} [requested]
     */
    async resolveStudioId(userId, requested) {
      const rows = await adminFetch(
        `/rest/v1/memberships?user_id=eq.${userId}&select=studio_id&order=created_at.asc`,
      );
      if (!rows?.length) return null;
      if (requested && rows.some((r) => r.studio_id === requested)) return requested;
      return rows[0].studio_id;
    },

    /**
     * @param {string} studioId
     */
    async resolveEntitlement(studioId) {
      const q =
        `/rest/v1/entitlements?studio_id=eq.${studioId}&scope=eq.tenant&subscriber_id=is.null` +
        `&select=id,billing_mode,plan_id,monthly_cap_usd,status&limit=1`;
      let rows = await adminFetch(q);
      if (!rows?.length) {
        await adminFetch(`/rest/v1/rpc/${ensureEntitlementRpc}`, {
          method: 'POST',
          body: JSON.stringify({ p_studio: studioId }),
        });
        rows = await adminFetch(q);
      }
      return rows?.[0] ?? null;
    },

    /**
     * @param {string} studioId
     */
    async monthToDateBillable(studioId) {
      const rows = await adminFetch(
        `/rest/v1/studio_usage_mtd?studio_id=eq.${studioId}&select=billable_usd`,
      );
      const v = rows?.[0]?.billable_usd;
      return typeof v === 'string' ? parseFloat(v) : (v ?? 0);
    },

    /**
     * @param {Record<string, unknown>} row
     */
    async insertUsageEvent(row) {
      await adminFetch(`/rest/v1/usage_events`, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      });
    },

    /**
     * Optional rollup for usageSummary (full studio_usage_mtd row).
     * @param {string} studioId
     */
    async studioUsageMtd(studioId) {
      const rows = await adminFetch(
        `/rest/v1/studio_usage_mtd?studio_id=eq.${studioId}&select=billable_usd,cost_usd,tts_chars,llm_tokens`,
      );
      return rows?.[0] ?? { billable_usd: 0, cost_usd: 0, tts_chars: 0, llm_tokens: 0 };
    },
  };
}
