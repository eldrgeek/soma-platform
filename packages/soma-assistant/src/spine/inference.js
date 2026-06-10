/**
 * SPINE: inference seam.
 * Wraps the soma-infer service (/ask and /chat endpoints).
 * Depth routing (fast=haiku, deep=opus) is decided server-side by the
 * soma-infer depth classifier; callers may force depth via opts.depth.
 */

const DEFAULT_BASE_URL = globalThis.process?.env?.SOMA_INFER_URL || 'http://localhost:4250';

/**
 * One-shot grounded answer (wraps soma-infer POST /ask).
 * @param {string} q - The user question.
 * @param {object} ctx - Context: { assistant, contextDoc, tenantId, sessionId, baseUrl? }
 * @returns {Promise<{answer: string, model: string, depth: 'fast'|'deep'}>}
 */
export async function ask(q, ctx = {}) {
  const baseUrl = ctx.baseUrl || DEFAULT_BASE_URL;
  const res = await fetch(`${baseUrl}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: q, ...ctx }),
  });
  if (!res.ok) throw new Error(`soma-infer /ask failed: ${res.status}`);
  return res.json();
}

/**
 * Multi-turn persona conversation (wraps soma-infer POST /chat).
 * @param {string} assistant - Assistant id; resolves persona.md + knowledge.md
 *   + config.json from soma-infer's assistants/{assistant}/ directory.
 * @param {Array<{role: 'user'|'assistant', content: string}>} messages
 * @param {object} [opts] - { depth?: 'fast'|'deep', tenantId?, sessionId?, baseUrl? }
 * @returns {Promise<{reply: string, model: string, depth: 'fast'|'deep'}>}
 */
export async function chat(assistant, messages, opts = {}) {
  const baseUrl = opts.baseUrl || DEFAULT_BASE_URL;
  const res = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assistant, messages, ...opts }),
  });
  if (!res.ok) throw new Error(`soma-infer /chat failed: ${res.status}`);
  return res.json();
}
