/**
 * MANIFEST: merge contract (spec section 3c).
 *
 * Subscriber CAN override:
 *   persona.{name, voice_id, greeting, contextDoc}
 *   clientBundles.<id>.modalities  (DISABLE only — result = intersection)
 *   transcripts.defaultOn
 *
 * Subscriber CANNOT override:
 *   tenantPolicy.*, guide.*, capabilities[], spine.*, intentClassifier.*
 *
 * Explicit stack resolution (logged in _mergeLog):
 *   persona merge (field-by-field, allowlist)
 *   capabilities-per-bundle (always app; subscriber attempt is logged as blocked)
 *   transcripts.retentionDays = min(app, subscriber)
 *
 * Schema versioning: breaking changes require new $schema major version.
 * Session supervisor rejects manifests with mismatched major versions.
 */

export const MERGE_CONTRACT = {
  canOverride: [
    'persona.name', 'persona.voice_id', 'persona.greeting', 'persona.contextDoc',
    'clientBundles.<id>.modalities',
    'transcripts.defaultOn',
  ],
  cannotOverride: ['tenantPolicy', 'guide', 'capabilities', 'spine', 'intentClassifier'],
};

const PERSONA_OVERRIDABLE = ['name', 'voice_id', 'greeting', 'contextDoc'];

/**
 * Merge a validated subscriber override into the app manifest.
 * @param {object} app - validated app-level manifest.
 * @param {object} override - validated subscriber override.
 * @returns {object} merged manifest with _mergeLog: Array<{path, app, subscriber, resolved}>.
 */
export function mergeManifests(app, override) {
  const merged = structuredClone(app);
  const log = [];

  if (override.persona) {
    for (const key of PERSONA_OVERRIDABLE) {
      if (override.persona[key] !== undefined) {
        log.push({ path: `persona.${key}`, app: app.persona?.[key], subscriber: override.persona[key], resolved: 'subscriber' });
        merged.persona[key] = override.persona[key];
      }
    }
  }

  for (const [bundleId, b] of Object.entries(override.clientBundles ?? {})) {
    if (!merged.clientBundles?.[bundleId]) continue;
    if (b.modalities) {
      const appMods = merged.clientBundles[bundleId].modalities ?? [];
      const result = appMods.filter((m) => b.modalities.includes(m));
      log.push({ path: `clientBundles.${bundleId}.modalities`, app: appMods, subscriber: b.modalities, resolved: result });
      merged.clientBundles[bundleId].modalities = result;
    }
    if (b.capabilities) {
      log.push({ path: `clientBundles.${bundleId}.capabilities`, app: merged.clientBundles[bundleId]?.capabilities, subscriber: b.capabilities, resolved: 'app (immutable)' });
    }
  }

  if (override.transcripts) {
    if (override.transcripts.defaultOn !== undefined) {
      log.push({ path: 'transcripts.defaultOn', app: app.transcripts?.defaultOn, subscriber: override.transcripts.defaultOn, resolved: 'subscriber' });
      merged.transcripts.defaultOn = override.transcripts.defaultOn;
    }
    if (override.transcripts.retentionDays !== undefined) {
      const resolved = Math.min(app.transcripts?.retentionDays ?? Infinity, override.transcripts.retentionDays);
      log.push({ path: 'transcripts.retentionDays', app: app.transcripts?.retentionDays, subscriber: override.transcripts.retentionDays, resolved });
      merged.transcripts.retentionDays = resolved;
    }
  }

  merged._mergeLog = log;
  return merged;
}
