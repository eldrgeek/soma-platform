/**
 * Character registry — loads and validates Playmaker character definitions.
 *
 * Characters live in packages/playmaker/characters/<id>/character.json.
 * The registry is the source of truth for which characters are available
 * and their routing backends.
 */

const REQUIRED_FIELDS = ['characterId', 'displayName', 'backend', 'persona', 'capabilities'];
const VALID_BACKENDS   = ['soma-infer', 'ui-bridge'];
const VALID_CAPABILITIES = [
  'persona-conversation',
  'answer-from-content',
  'feedback-channel',
  'margins-reactor',
];

/**
 * Validate a raw character definition object.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 */
export function validateCharacter(def) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (def[field] == null) errors.push(`missing required field: ${field}`);
  }

  if (def.characterId && !/^[a-z0-9-]+$/.test(def.characterId)) {
    errors.push(`characterId must be kebab-case alphanumeric: "${def.characterId}"`);
  }

  if (def.backend && !VALID_BACKENDS.includes(def.backend)) {
    errors.push(`unknown backend "${def.backend}"; expected one of: ${VALID_BACKENDS.join(', ')}`);
  }

  if (Array.isArray(def.capabilities)) {
    for (const cap of def.capabilities) {
      if (!VALID_CAPABILITIES.includes(cap)) {
        errors.push(`unknown capability "${cap}"; expected one of: ${VALID_CAPABILITIES.join(', ')}`);
      }
    }
    if (def.capabilities.length === 0) errors.push('capabilities must have at least one entry');
  }

  if (def.persona == null || typeof def.persona !== 'object') {
    errors.push('persona must be an object');
  } else if (!def.persona.name) {
    errors.push('persona.name is required');
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/**
 * Build a registry from an array of raw character definitions.
 * Throws if any definition fails validation.
 * Returns a Map<characterId, characterDef>.
 */
export function buildRegistry(defs) {
  const registry = new Map();

  for (const def of defs) {
    const result = validateCharacter(def);
    if (!result.valid) {
      throw new Error(
        `Invalid character definition${def.characterId ? ` "${def.characterId}"` : ''}: ` +
        result.errors.join('; ')
      );
    }
    if (registry.has(def.characterId)) {
      throw new Error(`Duplicate characterId: "${def.characterId}"`);
    }
    registry.set(def.characterId, Object.freeze({ ...def }));
  }

  return registry;
}

/**
 * Get a character by ID from the registry.
 * Returns the character def or undefined.
 */
export function getCharacter(registry, characterId) {
  return registry.get(characterId);
}

/**
 * List all character IDs in the registry.
 */
export function listCharacterIds(registry) {
  return [...registry.keys()];
}
