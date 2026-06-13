/**
 * ui-bridge backend — STUB for the ChatGPT-as-character relay (F4, built by W2).
 *
 * INTEGRATION POINT FOR W2:
 * Replace this stub implementation with the real Yeshie relay call.
 * The interface contract below must be preserved — the character-selector.js
 * and the Writing Room both depend on it.
 *
 * What W2 needs to implement:
 *   1. Open (or locate) a ChatGPT browser tab via Yeshie hardened relay (:3333).
 *   2. Inject `context.messages` (last user message, optionally with working doc context)
 *      into ChatGPT's composer and submit.
 *   3. Wait for ChatGPT's streamed response to finish.
 *   4. Capture the reply text and return { reply, source: 'ui-bridge' }.
 *   5. Error handling: if the relay is not available, return a clear error so the
 *      Writing Room can show a graceful "bridge unavailable" message.
 *
 * Relay spec location: ~/Projects/yeshie/ + SOMA/specs/playmaker-v0.1-spec.md F4.
 * W2 branch: (yeshie repo, separate from this branch).
 */

const BRIDGE_NOT_WIRED_MSG =
  "ChatGPT isn't connected yet — the relay bridge is still being set up. " +
  "Your message has been noted. When the bridge is ready, you'll be able to " +
  "direct messages to ChatGPT directly from the Writing Room.";

/**
 * Send a message via the ui-bridge (Yeshie relay) to a target UI (e.g. ChatGPT).
 *
 * @param {object} character - Character definition from the registry.
 * @param {object} context
 * @param {Array<{role: string, content: string}>} context.messages - Conversation history.
 * @param {string} [context.workingDocument] - Current working document text, if any.
 * @param {string} [context.selectedText] - Selected text from the working document, if any.
 * @returns {Promise<{reply: string, source: string, bridgeStatus: 'connected'|'stub'|'error'}>}
 */
export async function sendToUiBridge(character, context) {
  // W2: replace this stub with the real relay call.
  // The relayTarget from character.backendConfig.relayTarget will hold the Yeshie spec.

  // eslint-disable-next-line no-unused-vars
  const _relayTarget = character.backendConfig?.relayTarget;

  // Stub: return a graceful placeholder so the Writing Room degrades cleanly.
  return {
    reply: BRIDGE_NOT_WIRED_MSG,
    source: 'ui-bridge',
    bridgeStatus: 'stub',
  };
}

/**
 * Check whether the ui-bridge relay is available.
 * W2 should implement this to probe the Yeshie relay on :3333.
 *
 * @returns {Promise<boolean>}
 */
export async function isBridgeAvailable() {
  // W2: probe relay availability here (e.g. fetch('http://localhost:3333/health'))
  return false;
}
