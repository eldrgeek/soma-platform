/**
 * @soma-platform/playmaker — barrel export.
 *
 * CHARACTER MODEL
 *   buildRegistry, validateCharacter, getCharacter, listCharacterIds
 *
 * CHARACTER SELECTOR
 *   sendToCharacter, getSelectorOptions, getDefaultCharacterId
 *
 * BACKENDS (lower-level; prefer sendToCharacter for most use cases)
 *   sendToSomaInfer, sendToUiBridge, isBridgeAvailable
 */

// CHARACTER MODEL
export {
  validateCharacter,
  buildRegistry,
  getCharacter,
  listCharacterIds,
} from './character-registry.js';

// CHARACTER SELECTOR
export {
  sendToCharacter,
  getSelectorOptions,
  getDefaultCharacterId,
} from './character-selector.js';

// BACKENDS
export { sendToSomaInfer } from './backends/soma-infer.js';
export { sendToUiBridge, isBridgeAvailable } from './backends/ui-bridge.js';
