/**
 * MANIFEST: validation.
 * validateManifest() checks app-level required fields against the schema shape.
 * validateSubscriberOverride() rejects any key outside the merge contract.
 * Dependency-free structural checks; full JSON Schema validation can be layered
 * with ajv against schema/assistant-config.schema.json.
 */

const APP_REQUIRED = ['assistantId', 'tenantId', 'persona', 'capabilities', 'clientBundles', 'tenantPolicy', 'transcripts'];
const KNOWN_CAPABILITIES = [
  'answer-from-content', 'persona-conversation', 'guided-site-driving',
  'guide-as-tool', 'feedback-channel',
];
const KNOWN_BUNDLES = ['public-widget', 'subscriber-chat', 'voice-first-agent'];
const FORBIDDEN_OVERRIDE_KEYS = ['tenantPolicy', 'guide', 'capabilities', 'spine', 'intentClassifier'];
const PERSONA_OVERRIDABLE = ['name', 'voice_id', 'greeting', 'contextDoc'];

/**
 * Validate an app-level manifest. Throws with a descriptive message on failure.
 * @param {object} manifest
 * @returns {object} the validated manifest.
 */
export function validateManifest(manifest) {
  for (const key of APP_REQUIRED) {
    if (manifest[key] === undefined) throw new Error(`manifest: missing required field "${key}"`);
  }
  if (!Array.isArray(manifest.capabilities)) throw new Error('manifest: capabilities must be an array');
  for (const cap of manifest.capabilities) {
    if (!KNOWN_CAPABILITIES.includes(cap)) throw new Error(`manifest: unknown capability "${cap}"`);
  }
  for (const [bundleId, bundle] of Object.entries(manifest.clientBundles)) {
    if (!KNOWN_BUNDLES.includes(bundleId)) throw new Error(`manifest: unknown bundle "${bundleId}"`);
    for (const cap of bundle.capabilities ?? []) {
      if (!manifest.capabilities.includes(cap)) {
        throw new Error(`manifest: bundle "${bundleId}" uses capability "${cap}" not declared in capabilities[]`);
      }
    }
  }
  if (typeof manifest.transcripts.defaultOn !== 'boolean') {
    throw new Error('manifest: transcripts.defaultOn must be boolean');
  }
  return manifest;
}

/**
 * Validate a subscriber override against the merge contract and app manifest.
 * @param {object} override
 * @param {object} appManifest - the validated app-level manifest.
 * @returns {object} the validated override.
 */
export function validateSubscriberOverride(override, appManifest) {
  for (const key of FORBIDDEN_OVERRIDE_KEYS) {
    if (override[key] !== undefined) throw new Error(`override: "${key}" cannot be overridden by subscriber`);
  }
  for (const key of Object.keys(override.persona ?? {})) {
    if (!PERSONA_OVERRIDABLE.includes(key)) throw new Error(`override: persona.${key} is not subscriber-overridable`);
  }
  for (const [bundleId, b] of Object.entries(override.clientBundles ?? {})) {
    if (!appManifest.clientBundles[bundleId]) throw new Error(`override: bundle "${bundleId}" not in app manifest`);
    const appMods = appManifest.clientBundles[bundleId].modalities ?? [];
    for (const m of b.modalities ?? []) {
      if (!appMods.includes(m)) {
        throw new Error(`override: modality "${m}" not enabled at app level for bundle "${bundleId}" (disable-only contract)`);
      }
    }
  }
  return override;
}
