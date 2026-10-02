/**
 * @soma/tickets — front-door single-use invite tokens (PlayMaker extraction).
 *
 * @typedef {'qr' | 'link'} TicketChannel
 * @typedef {'open' | 'used' | 'expired' | 'unknown'} TicketLookupStatus
 * @typedef {'used' | 'already_used' | 'expired' | 'unknown'} TicketUseResult
 *
 * @typedef {Object} TicketCreateResult
 * @property {string} token
 * @property {string} expiresAt
 *
 * @typedef {Object} TicketLookupResult
 * @property {TicketLookupStatus} status
 * @property {string | null} inviteeName
 * @property {string | null} inviterName
 * @property {string | null} quoteLine
 * @property {boolean | null} hasEmail
 *
 * @typedef {Object} TicketsClient
 * @property {(input: {
 *   app?: string;
 *   inviteeName: string;
 *   quoteLine: string;
 *   channel: TicketChannel;
 *   inviteeEmail?: string | null;
 * }) => Promise<TicketCreateResult>} create
 * @property {(token: string, app?: string) => Promise<TicketLookupResult>} lookup
 * @property {(token: string, visitorId: string, app?: string) => Promise<TicketUseResult>} use
 */

/** @typedef {Record<string, unknown>} RpcRow */

/**
 * @param {unknown} data
 * @returns {RpcRow | null}
 */
function firstRow(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

/**
 * Wire ticket RPCs for a SOMA app. Supabase client and app id are injected — no env reads.
 *
 * @param {{ supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }; app: string }} options
 * @returns {TicketsClient}
 */
export function createTickets({ supabase, app }) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('createTickets: supabase client with rpc() is required');
  }
  if (!app || typeof app !== 'string') {
    throw new Error('createTickets: app id string is required');
  }

  return {
    /** @param {{ app?: string; inviteeName: string; quoteLine: string; channel: TicketChannel; inviteeEmail?: string | null }} input */
    async create(input) {
      const { data, error } = await supabase.rpc('ticket_create', {
        p_app: input.app ?? app,
        p_invitee_name: input.inviteeName,
        p_quote_line: input.quoteLine,
        p_channel: input.channel,
        p_invitee_email: input.inviteeEmail ?? null,
      });
      if (error) throw error;
      const row = firstRow(data);
      if (!row?.token || !row?.expires_at) {
        throw new Error('ticket_create returned no row');
      }
      return {
        token: String(row.token),
        expiresAt: String(row.expires_at),
      };
    },

    /**
     * @param {string} token
     * @param {string} [appOverride]
     */
    async lookup(token, appOverride = app) {
      const { data, error } = await supabase.rpc('ticket_lookup', {
        p_app: appOverride,
        p_token: token,
      });
      if (error) throw error;
      const row = firstRow(data);
      if (!row?.status) {
        return {
          status: 'unknown',
          inviteeName: null,
          inviterName: null,
          quoteLine: null,
          hasEmail: null,
        };
      }
      return {
        status: row.status,
        inviteeName: row.invitee_name != null ? String(row.invitee_name) : null,
        inviterName: row.inviter_name != null ? String(row.inviter_name) : null,
        quoteLine: row.quote_line != null ? String(row.quote_line) : null,
        hasEmail: row.has_email == null ? null : Boolean(row.has_email),
      };
    },

    /**
     * @param {string} token
     * @param {string} visitorId
     * @param {string} [appOverride]
     */
    async use(token, visitorId, appOverride = app) {
      const { data, error } = await supabase.rpc('ticket_use', {
        p_app: appOverride,
        p_token: token,
        p_visitor_id: visitorId,
      });
      if (error) throw error;
      const result = typeof data === 'string' ? data : String(data ?? 'unknown');
      if (
        result === 'used' ||
        result === 'already_used' ||
        result === 'expired' ||
        result === 'unknown'
      ) {
        return result;
      }
      return 'unknown';
    },
  };
}
