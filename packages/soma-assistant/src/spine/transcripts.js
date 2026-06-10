/**
 * SPINE: transcript schema v1 — validation and pulse-core write routing.
 * Transcripts are platform infrastructure, not a toggleable capability.
 * Every capability invocation must write attribution fields; this module
 * enforces the schema and routes to pulse-core.
 */

export const TRANSCRIPT_SCHEMA_VERSION = 1;

const ENUMS = {
  capability_id: ['persona-conversation', 'guide-relay', 'answer-from-content'],
  auth_scope: ['anonymous', 'subscriber', 'tenant-admin'],
  source_provenance: ['user', 'assistant', 'guide-relay', 'system'],
  relay_source: ['guide', null],
  model: ['haiku', 'opus'],
  depth: ['fast', 'deep'],
};

const REQUIRED = [
  'type', 'ts', 'session_id', 'assistant', 'tenant_id',
  'capability_id', 'auth_scope', 'source_provenance', 'relay_source',
  'user_turn', 'assistant_turn', 'model', 'depth',
];

/**
 * Validate a transcript record against schema v1. Throws on violation.
 * @param {object} record
 * @returns {object} the validated record.
 */
export function validateTranscript(record) {
  for (const key of REQUIRED) {
    if (!(key in record)) throw new Error(`transcript v1: missing field "${key}"`);
  }
  if (record.type !== 'transcript') throw new Error('transcript v1: type must be "transcript"');
  if (Number.isNaN(Date.parse(record.ts))) throw new Error('transcript v1: ts must be ISO-8601');
  if (!/^sess_[0-9a-f-]{36}$/.test(record.session_id)) {
    throw new Error('transcript v1: session_id must match sess_<uuid>');
  }
  for (const [field, allowed] of Object.entries(ENUMS)) {
    if (!allowed.includes(record[field])) {
      throw new Error(`transcript v1: ${field}="${record[field]}" not in [${allowed.join(', ')}]`);
    }
  }
  return record;
}

/**
 * Append a validated transcript record to pulse-core (JSONL, append-only).
 * All writes are async fire-and-forget from the caller's perspective; the
 * fcntl lock in pulse-core guarantees concurrency safety.
 * @param {string} path - pulse-core store path for this tenant/assistant.
 * @param {object} record - a record that has passed validateTranscript().
 * @returns {Promise<void>}
 */
export async function appendToPulseCore(path, record) {
  validateTranscript(record);
  const { appendFile } = await import('node:fs/promises');
  await appendFile(path, JSON.stringify(record) + '\n', 'utf8');
}
