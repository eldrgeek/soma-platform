/**
 * CAPABILITY: persona-conversation.
 * Multi-turn chat in a configured persona. Wraps spine inference chat() (/chat).
 * Persona is resolved by soma-infer from assistants/{assistant}/persona.md
 * + knowledge.md + config.json; the manifest may layer overrides on top.
 * capability_id for transcript attribution: "persona-conversation".
 */

import { chat } from '../spine/inference.js';

export const CAPABILITY_ID = 'persona-conversation';

/**
 * Run one persona-conversation turn.
 * @param {string} assistant - Assistant id (e.g. "izzy").
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages - Conversation so far.
 * @param {object} config - Merged manifest config (persona overrides ride along).
 * @param {boolean} [deepMode=false] - Force deep (opus) instead of classifier routing.
 * @returns {Promise<{reply: string, model: string, depth: 'fast'|'deep', capability_id: string}>}
 */
export async function personaChat(assistant, messages, config, deepMode = false) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('personaChat: messages must be a non-empty array');
  }
  const opts = {
    tenantId: config?.tenantId,
    persona: config?.persona,
    ...(deepMode ? { depth: 'deep' } : {}),
  };
  const result = await chat(assistant, messages, opts);
  return { ...result, capability_id: CAPABILITY_ID };
}
