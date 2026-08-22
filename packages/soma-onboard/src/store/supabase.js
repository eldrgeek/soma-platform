/**
 * Supabase store adapter.
 *
 * Table names come from the app's config prefix (§15b: apps stay federated —
 * `vc_members`, `r1x1_members`, `lgc_members` are separate tables in separate
 * projects, and that is deliberate, not debt). Nothing here reads a hardcoded
 * table name; that was the single largest source of fork drift between
 * vegas-connect and r1x1-app (156 diff-lines, all of them `vc_` → `r1x1_`).
 *
 * RLS: the schema template enables RLS with NO anon/authenticated policies.
 * This adapter therefore requires the SERVICE ROLE key and must only ever run
 * server-side (Netlify function / VPS), never in a browser bundle.
 */

import { createClient } from '@supabase/supabase-js';
import { newToken, nowIso, orderPair } from '../codes.js';
import { tables } from '../config.js';

/**
 * @param {import('../config.js').OnboardConfig} cfg
 * @param {{ url?: string, serviceRoleKey?: string }} [opts]
 */
export function createSupabaseStore(cfg, opts = {}) {
  const url = opts.url || process.env.SUPABASE_URL;
  const key = opts.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'soma-onboard: createSupabaseStore needs SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY. Refusing to start with a half-configured store.'
    );
  }
  if (/^eyJ/.test(key) && !/service_role/.test(safeDecodeRole(key))) {
    // Loud, because an anon key here fails at the first RLS-blocked write —
    // in production, on a real invite, in front of a real person.
    throw new Error(
      'soma-onboard: SUPABASE_SERVICE_ROLE_KEY does not look like a service_role key. ' +
        'RLS is deny-all for anon; onboarding writes would silently fail.'
    );
  }

  const t = tables(cfg);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const one = async (query) => {
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return data || null;
  };
  const many = async (query) => {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  };

  return {
    kind: 'supabase',
    tables: t,

    async ensureReady() {
      const { error } = await db.from(t.members).select('id').limit(1);
      if (error) {
        throw new Error(
          `soma-onboard: table ${t.members} is not reachable (${error.message}). ` +
            `Apply sql/schema.sql.tmpl with prefix "${cfg.tablePrefix}".`
        );
      }
    },

    // -- members ------------------------------------------------------------
    getMemberById: (id) => one(db.from(t.members).select('*').eq('id', id)),

    getMemberByCode: (code) =>
      one(db.from(t.members).select('*').eq('code', String(code).trim())),

    getMemberByEmail: (email) =>
      one(
        db
          .from(t.members)
          .select('*')
          .ilike('email', String(email || '').trim())
          .limit(1)
      ),

    async createMember(member) {
      const { data, error } = await db
        .from(t.members)
        .insert(member)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async updateMember(id, patch) {
      const { data, error } = await db
        .from(t.members)
        .update(patch)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },

    listMembers: () => many(db.from(t.members).select('*')),

    listInvitees: (memberId) =>
      many(
        db
          .from(t.members)
          .select('*')
          .eq('invited_by', memberId)
          .order('created_at', { ascending: true })
      ),

    async activeMemberCount() {
      const { count, error } = await db
        .from(t.members)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      if (error) throw error;
      return count || 0;
    },

    // -- sessions -----------------------------------------------------------
    async createSession(memberId) {
      const row = { token: newToken(), member_id: memberId, created_at: nowIso() };
      const { data, error } = await db.from(t.sessions).insert(row).select().single();
      if (error) throw error;
      return data;
    },

    async getSession(token) {
      const session = await one(db.from(t.sessions).select('*').eq('token', token));
      if (!session) return null;
      const member = await one(
        db.from(t.members).select('*').eq('id', session.member_id)
      );
      if (!member) return null;
      return { session, member };
    },

    async touchSession(token) {
      await db.from(t.sessions).update({ last_seen: nowIso() }).eq('token', token);
    },

    async deleteSession(token) {
      await db.from(t.sessions).delete().eq('token', token);
    },

    // -- connections --------------------------------------------------------
    async createConnection(a, b, kind) {
      const [member_a, member_b] = orderPair(a, b);
      const existing = await one(
        db
          .from(t.connections)
          .select('*')
          .eq('member_a', member_a)
          .eq('member_b', member_b)
      );
      if (existing) {
        if (kind && kind !== 'invited' && existing.kind !== kind) {
          const { data, error } = await db
            .from(t.connections)
            .update({ kind })
            .eq('id', existing.id)
            .select()
            .single();
          if (error) throw error;
          return data;
        }
        return existing;
      }
      const { data, error } = await db
        .from(t.connections)
        .insert({ member_a, member_b, kind: kind || 'invited' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async findConnection(a, b) {
      const [member_a, member_b] = orderPair(a, b);
      return one(
        db
          .from(t.connections)
          .select('*')
          .eq('member_a', member_a)
          .eq('member_b', member_b)
      );
    },

    listConnections: () => many(db.from(t.connections).select('*')),

    // -- invites ------------------------------------------------------------
    async createInvite(invite) {
      const { data, error } = await db.from(t.invites).insert(invite).select().single();
      if (error) throw error;
      return data;
    },

    getInviteById: (id) => one(db.from(t.invites).select('*').eq('id', id)),

    listInvitesByInviter: (memberId) =>
      many(
        db
          .from(t.invites)
          .select('*')
          .eq('inviter_id', memberId)
          .order('created_at', { ascending: false })
      ),

    async markInviteOpened(id, channel) {
      const existing = await one(db.from(t.invites).select('*').eq('id', id));
      if (!existing) return null;
      const patch = {};
      if (!existing.opened_at) patch.opened_at = nowIso();
      if (channel && !existing.channel) patch.channel = channel;
      if (!Object.keys(patch).length) return existing;
      const { data, error } = await db
        .from(t.invites)
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async markInviteJoined(claimMemberId) {
      const existing = await one(
        db
          .from(t.invites)
          .select('*')
          .eq('claim_member_id', claimMemberId)
          .is('joined_at', null)
          .limit(1)
      );
      if (!existing) return null;
      const { data, error } = await db
        .from(t.invites)
        .update({ joined_at: nowIso() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async channelStats() {
      const rows = await many(
        db.from(t.invites).select('channel, opened_at, joined_at')
      );
      /** @type {Record<string, {sent: number, opened: number, joined: number}>} */
      const out = {};
      for (const r of rows) {
        const key = r.channel || 'untagged';
        out[key] = out[key] || { sent: 0, opened: 0, joined: 0 };
        out[key].sent += 1;
        if (r.opened_at) out[key].opened += 1;
        if (r.joined_at) out[key].joined += 1;
      }
      return out;
    },
  };
}

/** Best-effort JWT role peek. Never throws — this is a guard, not a validator. */
function safeDecodeRole(jwt) {
  try {
    const payload = jwt.split('.')[1];
    return Buffer.from(payload, 'base64').toString('utf8');
  } catch {
    return '';
  }
}
