/**
 * soma-infer backend — routes to the VPS /infer/chat endpoint.
 *
 * Used by Izzy and any future soma-platform-hosted character.
 * The server-side Netlify function (soma-playwriting's /netlify/functions/chat)
 * proxies these requests to the VPS with the correct assistant ID.
 */

/**
 * Send a message to a soma-infer-backed character.
 *
 * @param {object} character - Character definition from the registry.
 * @param {object} context
 * @param {Array<{role: string, content: string}>} context.messages - Conversation history.
 * @param {string} [context.workingDocument] - Current working document text, if any.
 * @param {boolean} [context.deepMode] - If true, request the most powerful model.
 * @param {string} [context.projectHint] - Room-level project context string.
 * @param {string} netlifyFunctionBase - Base URL for the Netlify function (e.g. '').
 * @returns {Promise<{reply: string, model?: string, source?: string}>}
 */
export async function sendToSomaInfer(character, context, netlifyFunctionBase = '') {
  const { messages, workingDocument, deepMode, projectHint } = context;

  let apiMessages = messages.map(m => ({ role: m.role, content: m.content }));

  if (workingDocument) {
    const docCtx = [
      {
        role: 'user',
        content:
          'WORKING DOCUMENT (current draft for context):\n---\n' + workingDocument +
          '\n---\nKeep this in mind. When I ask you to propose a revision or addition, wrap the proposed text in <<<PROPOSAL>>> and <<<END PROPOSAL>>> markers.',
      },
      { role: 'assistant', content: 'Understood — I have your current draft in view.' },
    ];
    apiMessages = docCtx.concat(apiMessages);
  }

  if (projectHint) {
    apiMessages = [
      { role: 'user', content: 'ROOM CONTEXT:\n' + projectHint },
      { role: 'assistant', content: 'Noted. I\'ll keep that context in mind.' },
      ...apiMessages,
    ];
  }

  const res = await fetch(netlifyFunctionBase + '/.netlify/functions/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistant: character.backendConfig?.assistantId || character.characterId,
      messages: apiMessages,
      deepMode: !!deepMode,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `soma-infer error ${res.status}`);

  return {
    reply:  data.reply || '',
    model:  data.model,
    source: data.source || 'soma-infer',
  };
}
