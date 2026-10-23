/**
 * @typedef {'reversible' | 'consequential' | 'irreversible'} EffectRisk
 */

/**
 * @typedef {'view' | 'observe' | 'effect'} ActionKind
 */

/**
 * PlayMaker agent-portal command kind.
 * @typedef {'effect' | 'view' | 'inspection'} PortalCommandKind
 */

/**
 * @typedef {Record<string, unknown>} CommandArgs
 */

/**
 * @typedef {'string' | 'number' | 'boolean' | 'string[]' | 'array'} ArgType
 */

/**
 * @typedef {Record<string, {
 *   type: ArgType;
 *   required?: boolean;
 *   enum?: readonly string[];
 *   description: string;
 * }>} ArgSchema
 */

/**
 * @typedef {Object} CommandSpec
 * @property {string} id
 * @property {string} [title]
 * @property {string} [description]
 * @property {PortalCommandKind | ActionKind} kind
 * @property {ArgSchema} args
 * @property {EffectRisk} [risk] Effect actions only (kit manifest semantics).
 * @property {readonly string[]} [scopes] Required capability scopes to invoke.
 */

/**
 * @typedef {Object} Actor
 * @property {'person' | 'ai'} kind
 * @property {string} [name]
 * @property {'ui' | 'in-page'} via
 */

/**
 * @typedef {Object} InvokeResult
 * @property {boolean} ok
 * @property {string} command
 * @property {string} auditId
 * @property {unknown} [result]
 * @property {string} [error]
 * @property {string} [unavailable]
 */

/**
 * @typedef {Object} CommandAuditRecord
 * @property {string} auditId
 * @property {string} at
 * @property {string} command
 * @property {CommandArgs} args
 * @property {Actor} actor
 * @property {string | null} [userId]
 * @property {string | null} [playId]
 * @property {boolean} ok
 * @property {string} [error]
 * @property {string} [unavailable]
 */

/**
 * @typedef {Object} CommandStateSnapshot
 * @property {string | null} [userId]
 * @property {string | null} [playId]
 */

/**
 * @typedef {Object} CommandImpl
 * @property {(args: CommandArgs) => unknown} run
 * @property {(args: CommandArgs) => string | null} [unavailable]
 */

/**
 * Idempotency input for effect receipts (storage-free interface).
 * @typedef {Object} IdempotencyInput
 * @property {string} idempotency_key
 * @property {string} request_fingerprint
 */

/**
 * Kit action receipt lifecycle (docs/kit/10-plan.md §2.4 action_receipts).
 * @typedef {
 *   'prepared'
 *   | 'approval_required'
 *   | 'approved'
 *   | 'running'
 *   | 'succeeded'
 *   | 'failed'
 *   | 'refused'
 *   | 'expired'
 *   | 'undone'
 * } ReceiptStatus
 */

/**
 * @typedef {Object} ActionReceipt
 * @property {string} receipt_id
 * @property {string} action_id
 * @property {string} action_version
 * @property {string} idempotency_key
 * @property {string} request_fingerprint
 * @property {string} actor_id
 * @property {string} principal
 * @property {string} [grant_ref]
 * @property {string} authorization_version
 * @property {EffectRisk} [declared_risk]
 * @property {EffectRisk} [effective_risk]
 * @property {ReceiptStatus} status
 * @property {string} [resource_version]
 * @property {string} [effect_summary]
 * @property {string} [output_ref]
 * @property {string} [undo_of]
 * @property {string} [cool_off_started_at]
 * @property {string} [expires_at]
 * @property {string} created_at
 * @property {string} [completed_at]
 * @property {string} [payload_sha256]
 * @property {string} [signing_key_id]
 * @property {string} [signature]
 */

/**
 * @typedef {Object} WorkflowStep
 * @property {string | readonly string[]} command
 * @property {string} [person]
 */

/**
 * @typedef {Object} WorkflowSpec
 * @property {string} id
 * @property {string} [title]
 * @property {readonly WorkflowStep[]} [personReaches]
 * @property {readonly WorkflowStep[]} steps
 */

/**
 * Map PlayMaker portal kinds to kit action kinds.
 * @param {PortalCommandKind} kind
 * @returns {ActionKind}
 */
export function portalKindToActionKind(kind) {
  if (kind === "inspection") return "observe";
  if (kind === "view") return "view";
  if (kind === "effect") return "effect";
  return kind;
}

/**
 * @param {CommandSpec} spec
 * @returns {ActionKind}
 */
export function actionKindForSpec(spec) {
  return portalKindToActionKind(spec.kind);
}

export const SOMA_ACTIONS_VERSION = "0.1.0";
