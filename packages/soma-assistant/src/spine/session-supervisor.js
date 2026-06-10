/**
 * SPINE: session supervisor.
 * Owns session lifecycle, capability attribution, cross-tenant isolation,
 * and transcript write routing. Every transcript write flows through here
 * so attribution fields cannot be omitted by capability code.
 *
 * Pulse Core relationship: Pulse Core is the physical append-only JSONL store.
 * This supervisor is the policy layer — it determines what may be written and
 * with what attribution before forwarding to Pulse Core.
 */

import { validateTranscript, appendToPulseCore } from './transcripts.js';
import { resolveAuth } from './identity-stub.js';

const REQUIRED_WRITE_FIELDS = ['capability_id', 'auth_scope', 'source_provenance', 'relay_source'];

export class SessionSupervisor {
  constructor({ pulseCorePath = null } = {}) {
    /** @type {Map<string, object>} session_id -> session */
    this.sessions = new Map();
    this.pulseCorePath = pulseCorePath;
  }

  /**
   * Get or create a session for an incoming request.
   * Enforces cross-tenant isolation: a session is bound to exactly one tenant_id.
   * @param {object} req - { sessionId?, token?, tenantId, assistant }
   * @param {object} config - merged manifest config for this assistant.
   * @returns {Promise<object>} session { session_id, tenant_id, assistant, auth_scope, subscriber_id, created_at }
   */
  async getOrCreate(req, config) {
    const existing = req.sessionId && this.sessions.get(req.sessionId);
    if (existing) {
      if (existing.tenant_id !== req.tenantId) {
        throw new Error(`cross-tenant session access denied: ${existing.tenant_id} != ${req.tenantId}`);
      }
      return existing;
    }
    const { authScope, subscriberId } = await resolveAuth(req.token);
    const session = {
      session_id: `sess_${crypto.randomUUID()}`,
      tenant_id: req.tenantId,
      assistant: req.assistant,
      auth_scope: authScope,
      subscriber_id: subscriberId,
      transcripts_on: config?.transcripts?.defaultOn ?? false,
      created_at: new Date().toISOString(),
    };
    this.sessions.set(session.session_id, session);
    return session;
  }

  /**
   * Write a transcript turn. Validates attribution fields before routing.
   * Session supervisor rejects any write missing capability_id, auth_scope,
   * source_provenance, or relay_source — prevents unattributed Pulse Core records.
   * @param {object} session - session from getOrCreate().
   * @param {object} fields - capability_id, auth_scope, source_provenance, relay_source,
   *   plus user_turn/assistant_turn/model/depth.
   * @returns {Promise<object>} the written record.
   */
  async writeTranscript(session, fields) {
    for (const f of REQUIRED_WRITE_FIELDS) {
      if (fields[f] === undefined) throw new Error(`writeTranscript missing required field: ${f}`);
    }
    const record = {
      type: 'transcript',
      ts: new Date().toISOString(),
      session_id: session.session_id,
      assistant: session.assistant,
      tenant_id: session.tenant_id,
      ...fields,
    };
    validateTranscript(record);
    if (session.transcripts_on && this.pulseCorePath) {
      await appendToPulseCore(this.pulseCorePath, record);
    }
    return record;
  }

  /**
   * Close a session and release it from the in-memory registry.
   * @param {object} session
   */
  close(session) {
    this.sessions.delete(session.session_id);
  }
}
