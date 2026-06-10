/**
 * CAPABILITY: feedback-channel.
 * Intake for user feedback during an assistant session. Stub routes to
 * an in-memory log; production version routes to the tenant's feedback
 * sink (pulse-core stream / email / board per tenantPolicy).
 */

export const CAPABILITY_ID = 'feedback-channel';

/**
 * Accept a piece of user feedback.
 * @param {string} message - Free-text feedback from the user.
 * @param {object} session - SessionSupervisor session (tenant/assistant attribution).
 * @returns {Promise<{ok: boolean, feedback_id: string, routed_to: string}>}
 */
export async function feedbackChannel(message, session) {
  if (!message || typeof message !== 'string') {
    throw new Error('feedbackChannel: message is required');
  }
  if (!session?.session_id) {
    throw new Error('feedbackChannel: session is required');
  }
  const record = {
    feedback_id: `fb_${crypto.randomUUID()}`,
    ts: new Date().toISOString(),
    session_id: session.session_id,
    tenant_id: session.tenant_id,
    assistant: session.assistant,
    message,
  };
  feedbackChannel._log.push(record);
  return { ok: true, feedback_id: record.feedback_id, routed_to: 'stub-memory' };
}

/** @type {object[]} stub in-memory sink, inspectable in tests. */
feedbackChannel._log = [];
