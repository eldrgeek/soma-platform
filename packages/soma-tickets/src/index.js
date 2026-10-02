/**
 * @soma/tickets — front-door single-use invite tokens (PlayMaker extraction).
 *
 * @typedef {'qr' | 'link'} TicketChannel
 * @typedef {'open' | 'used' | 'expired' | 'unknown'} TicketLookupStatus
 * @typedef {'used' | 'already_used' | 'expired' | 'unknown'} TicketUseResult
 * @typedef {'open' | 'used' | 'expired'} TicketListStatus
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
 * @typedef {Object} MyTicketRow
 * @property {string} id
 * @property {string} inviteeName
 * @property {TicketChannel} channel
 * @property {string} createdAt
 * @property {string} expiresAt
 * @property {string | null} usedAt
 *
 * @typedef {Object} TicketsClient
 * @property {(input: {
 *   app?: string;
 *   inviteeName?: string | null;
 *   quoteLine: string;
 *   channel: TicketChannel;
 *   inviteeEmail?: string | null;
 * }) => Promise<TicketCreateResult>} create
 * @property {(token: string, app?: string) => Promise<TicketLookupResult>} lookup
 * @property {(token: string, visitorId: string, app?: string, visitorName?: string | null) => Promise<TicketUseResult>} use
 * @property {(limit?: number) => Promise<MyTicketRow[]>} listMine
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
 * @param {string} origin
 * @param {string} token
 * @returns {string}
 */
export function ticketUrl(origin, token) {
  return `${origin}/?t=${encodeURIComponent(token)}`;
}

/**
 * @param {Pick<MyTicketRow, 'usedAt' | 'expiresAt'>} row
 * @param {number} [nowMs]
 * @returns {TicketListStatus}
 */
export function ticketListStatus(row, nowMs = Date.now()) {
  if (row.usedAt) return 'used';
  if (new Date(row.expiresAt).getTime() <= nowMs) return 'expired';
  return 'open';
}

/**
 * @param {unknown} error
 * @returns {string | null}
 */
export function ticketRpcErrorMessage(error) {
  const msg =
    error && typeof error === 'object' && 'message' in error
      ? String(/** @type {{ message: unknown }} */ (error).message)
      : String(error ?? '');
  if (msg.includes('daily ticket limit reached')) {
    return 'Daily ticket limit reached for today.';
  }
  if (msg.includes('studio membership required')) {
    return 'Studio membership required.';
  }
  return null;
}

/**
 * Wire ticket RPCs for a SOMA app. Supabase client and app id are injected — no env reads.
 *
 * @param {{
 *   supabase: {
 *     rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
 *     from: (table: string) => unknown;
 *   };
 *   app: string;
 * }} options
 * @returns {TicketsClient}
 */
export function createTickets({ supabase, app }) {
  if (!supabase || typeof supabase.rpc !== 'function') {
    throw new Error('createTickets: supabase client with rpc() is required');
  }
  if (typeof supabase.from !== 'function') {
    throw new Error('createTickets: supabase client with from() is required');
  }
  if (!app || typeof app !== 'string') {
    throw new Error('createTickets: app id string is required');
  }

  return {
    /** @param {{ app?: string; inviteeName?: string | null; quoteLine: string; channel: TicketChannel; inviteeEmail?: string | null }} input */
    async create(input) {
      const invitee = input.inviteeName?.trim() ?? '';
      const { data, error } = await supabase.rpc('ticket_create', {
        p_app: input.app ?? app,
        p_invitee_name: invitee || null,
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
        status: /** @type {TicketLookupStatus} */ (row.status),
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
     * @param {string | null} [visitorName]
     */
    async use(token, visitorId, appOverride = app, visitorName) {
      const trimmedName = visitorName?.trim();
      /** @type {Record<string, string>} */
      const args = {
        p_app: appOverride,
        p_token: token,
        p_visitor_id: visitorId,
      };
      if (trimmedName) {
        args.p_visitor_name = trimmedName;
      }
      const { data, error } = await supabase.rpc('ticket_use', args);
      if (error) throw error;
      const result = typeof data === 'string' ? data : String(data ?? 'unknown');
      if (
        result === 'used' ||
        result === 'already_used' ||
        result === 'expired' ||
        result === 'unknown'
      ) {
        return /** @type {TicketUseResult} */ (result);
      }
      return 'unknown';
    },

    /** @param {number} [limit] */
    async listMine(limit = 20) {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, invitee_name, channel, created_at, expires_at, used_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: String(row.id),
        inviteeName: String(row.invitee_name),
        channel: /** @type {TicketChannel} */ (row.channel),
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
        usedAt: row.used_at != null ? String(row.used_at) : null,
      }));
    },
  };
}
