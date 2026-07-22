/**
 * In-memory store — the reference implementation of the store port.
 *
 * Used by tests and by `npm run dev` before an app has a Supabase project.
 * Every method here is the behavioural spec the Supabase adapter must match;
 * test/store-parity.test.js runs the same suite against both.
 */

import { newId, newToken, nowIso, orderPair } from '../codes.js';

export function createMemoryStore() {
  /** @type {Map<string, any>} */
  const members = new Map();
  /** @type {Map<string, any>} */
  const sessions = new Map();
  /** @type {any[]} */
  const connections = [];
  /** @type {any[]} */
  const invites = [];

  const byCode = (code) =>
    [...members.values()].find((m) => m.code === String(code).trim()) || null;

  return {
    kind: 'memory',

    async ensureReady() {},

    // -- members ------------------------------------------------------------
    async getMemberById(id) {
      return members.get(id) || null;
    },

    async getMemberByCode(code) {
      return byCode(code);
    },

    async getMemberByEmail(email) {
      const needle = String(email || '').trim().toLowerCase();
      if (!needle) return null;
      return (
        [...members.values()].find(
          (m) => (m.email || '').toLowerCase() === needle
        ) || null
      );
    },

    async createMember(member) {
      const row = {
        id: member.id || newId(),
        created_at: member.created_at || nowIso(),
        email: null,
        phone: null,
        city: null,
        role: 'other',
        bio: null,
        photo_url: null,
        invited_by: null,
        status: 'contact_only',
        is_admin: false,
        onboarding_complete: false,
        consent_at: null,
        ...member,
      };
      members.set(row.id, row);
      return row;
    },

    async updateMember(id, patch) {
      const existing = members.get(id);
      if (!existing) return null;
      const row = { ...existing, ...patch, id: existing.id };
      members.set(id, row);
      return row;
    },

    async listMembers() {
      return [...members.values()];
    },

    async listInvitees(memberId) {
      return [...members.values()]
        .filter((m) => m.invited_by === memberId)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    },

    async activeMemberCount() {
      return [...members.values()].filter((m) => m.status === 'active').length;
    },

    // -- sessions -----------------------------------------------------------
    async createSession(memberId) {
      const session = {
        token: newToken(),
        member_id: memberId,
        created_at: nowIso(),
        last_seen: null,
      };
      sessions.set(session.token, session);
      return session;
    },

    async getSession(token) {
      const session = sessions.get(token);
      if (!session) return null;
      const member = members.get(session.member_id);
      if (!member) return null;
      return { session, member };
    },

    async touchSession(token) {
      const session = sessions.get(token);
      if (session) session.last_seen = nowIso();
    },

    async deleteSession(token) {
      sessions.delete(token);
    },

    // -- connections --------------------------------------------------------
    async createConnection(a, b, kind) {
      const [member_a, member_b] = orderPair(a, b);
      const existing = connections.find(
        (c) => c.member_a === member_a && c.member_b === member_b
      );
      if (existing) {
        // An invite edge upgrades to the asserted relationship; a real
        // relationship is never downgraded back to the placeholder.
        if (kind && kind !== 'invited') existing.kind = kind;
        return existing;
      }
      const row = {
        id: newId(),
        member_a,
        member_b,
        kind: kind || 'invited',
        created_at: nowIso(),
      };
      connections.push(row);
      return row;
    },

    async findConnection(a, b) {
      const [member_a, member_b] = orderPair(a, b);
      return (
        connections.find(
          (c) => c.member_a === member_a && c.member_b === member_b
        ) || null
      );
    },

    async listConnections() {
      return [...connections];
    },

    // -- invites (channel attribution) -------------------------------------
    async createInvite(invite) {
      const row = {
        id: newId(),
        created_at: nowIso(),
        opened_at: null,
        joined_at: null,
        claim_member_id: null,
        invitee_name: null,
        relationship: null,
        channel: null,
        ...invite,
      };
      invites.push(row);
      return row;
    },

    async getInviteById(id) {
      return invites.find((i) => i.id === id) || null;
    },

    async listInvitesByInviter(memberId) {
      return invites
        .filter((i) => i.inviter_id === memberId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    },

    async markInviteOpened(id, channel) {
      const row = invites.find((i) => i.id === id);
      if (!row) return null;
      if (!row.opened_at) row.opened_at = nowIso();
      if (channel && !row.channel) row.channel = channel;
      return row;
    },

    async markInviteJoined(claimMemberId) {
      const row = invites.find((i) => i.claim_member_id === claimMemberId && !i.joined_at);
      if (!row) return null;
      row.joined_at = nowIso();
      return row;
    },

    /** Channel → { sent, opened, joined }. The point of tagging links. */
    async channelStats() {
      /** @type {Record<string, {sent: number, opened: number, joined: number}>} */
      const out = {};
      for (const i of invites) {
        const key = i.channel || 'untagged';
        out[key] = out[key] || { sent: 0, opened: 0, joined: 0 };
        out[key].sent += 1;
        if (i.opened_at) out[key].opened += 1;
        if (i.joined_at) out[key].joined += 1;
      }
      return out;
    },

    /** Test helper. */
    _reset() {
      members.clear();
      sessions.clear();
      connections.length = 0;
      invites.length = 0;
    },
  };
}

let shared = null;

export function getSharedMemoryStore() {
  if (!shared) shared = createMemoryStore();
  return shared;
}

export function resetSharedMemoryStore() {
  shared = createMemoryStore();
  return shared;
}
