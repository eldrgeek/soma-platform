/**
 * CAPABILITY: answer-from-content.
 * Grounded Q&A over a context document. Wraps spine inference ask() (/ask).
 * capability_id for transcript attribution: "answer-from-content".
 * Non-negotiable: this capability is ON by default for every assistant.
 */

import { ask } from '../spine/inference.js';

export const CAPABILITY_ID = 'answer-from-content';

/**
 * Answer a question grounded in supplied content.
 * @param {string} question - User question.
 * @param {object} context - {
 *   assistant: string,        // assistant id (selects contextDoc server-side if omitted)
 *   contextDoc?: string,      // explicit grounding document (manifest persona.contextDoc)
 *   tenantId: string,
 *   sessionId?: string,
 *   depth?: 'fast'|'deep',    // optional override; classifier decides otherwise
 * }
 * @returns {Promise<{answer: string, model: string, depth: 'fast'|'deep', capability_id: string}>}
 */
export async function answerFromContent(question, context) {
  if (!question || typeof question !== 'string') {
    throw new Error('answerFromContent: question is required');
  }
  const result = await ask(question, context);
  return { ...result, capability_id: CAPABILITY_ID };
}
