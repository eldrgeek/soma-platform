/**
 * Character selector — routes a message to the correct backend based on
 * which character is currently selected in the Writing Room.
 *
 * The selector is stateless; the Writing Room tracks the active characterId.
 * This module provides the routing logic and the sendToCharacter entry point.
 */

import { sendToSomaInfer } from './backends/soma-infer.js';
import { sendToUiBridge } from './backends/ui-bridge.js';

/**
 * Route a message to a character and return its reply.
 *
 * @param {object} character - Character definition from the registry.
 * @param {object} context - Message context (see individual backend docs).
 * @param {object} [options]
 * @param {string} [options.netlifyFunctionBase=''] - Base URL for Netlify functions.
 * @returns {Promise<{reply: string, model?: string, source?: string, bridgeStatus?: string}>}
 */
export async function sendToCharacter(character, context, options = {}) {
  switch (character.backend) {
    case 'soma-infer':
      return sendToSomaInfer(character, context, options.netlifyFunctionBase ?? '');

    case 'ui-bridge':
      return sendToUiBridge(character, context);

    default:
      throw new Error(
        `Unknown backend "${character.backend}" for character "${character.characterId}". ` +
        'Expected "soma-infer" or "ui-bridge".'
      );
  }
}

/**
 * Build the list of selector options for the Writing Room UI.
 * Returns an array of { characterId, displayName, avatar, available } objects.
 * `available` is false if the backend is a stub (graceful UI affordance).
 *
 * @param {Map} registry - Character registry (from buildRegistry).
 * @returns {Array<{characterId: string, displayName: string, avatar: string, available: boolean}>}
 */
export function getSelectorOptions(registry) {
  const options = [];
  for (const [, char] of registry) {
    options.push({
      characterId:  char.characterId,
      displayName:  char.displayName,
      avatar:       char.avatar || '',
      available:    char.backend !== 'ui-bridge',
    });
  }
  return options;
}

/**
 * Get the default character ID for a given set of options.
 * Prefers 'izzy' if present; otherwise the first soma-infer character; otherwise first available.
 *
 * @param {Map} registry
 * @returns {string|null}
 */
export function getDefaultCharacterId(registry) {
  if (registry.has('izzy')) return 'izzy';

  for (const [id, char] of registry) {
    if (char.backend === 'soma-infer') return id;
  }

  const first = registry.keys().next().value;
  return first ?? null;
}
