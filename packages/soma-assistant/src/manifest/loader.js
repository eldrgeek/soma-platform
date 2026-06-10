/**
 * MANIFEST: loader.
 * Loads the app-level manifest, resolves a per-subscriber override via the
 * subscriber token, validates both, and merges under the contract (Section 3c).
 * Resolution order: spine defaults → app-level config → per-subscriber override.
 */

import { validateManifest, validateSubscriberOverride } from './validate.js';
import { mergeManifests } from './merge.js';
import { resolveAuth } from '../spine/identity-stub.js';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_BASE = globalThis.process?.env?.SOMA_MANIFEST_DIR
  || path.join(__dirname, '../../manifests/');

/**
 * @param {string} assistantId
 * @returns {Promise<object>}
 */
async function loadAppManifest(assistantId) {
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(path.join(MANIFEST_BASE, `${assistantId}.config.json`), 'utf8');
  return JSON.parse(raw);
}

/**
 * Subscriber overrides stored as manifests/overrides/{assistantId}.{subscriberId}.json.
 * Missing file → no override (anonymous or default subscriber experience).
 * @param {string} assistantId
 * @param {string} subscriberId
 * @returns {Promise<object|null>}
 */
async function loadSubscriberOverride(assistantId, subscriberId) {
  const { readFile } = await import('node:fs/promises');
  try {
    const raw = await readFile(
      path.join(MANIFEST_BASE, 'overrides', `${assistantId}.${subscriberId}.json`), 'utf8',
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Load app manifest + optional subscriber override and merge under the contract.
 * @param {string} assistantId - e.g. "bill", "izzy".
 * @param {string|undefined} subscriberToken - auth token; anonymous if absent.
 * @returns {Promise<object>} merged, validated manifest with _mergeLog.
 */
export async function loadAndMergeConfig(assistantId, subscriberToken) {
  const appManifest = await loadAppManifest(assistantId);
  validateManifest(appManifest);

  const { authScope, subscriberId } = await resolveAuth(subscriberToken);
  if (authScope === 'anonymous' || !subscriberId) {
    return { ...appManifest, _mergeLog: [{ source: 'app', note: 'no subscriber override' }] };
  }

  const override = await loadSubscriberOverride(assistantId, subscriberId);
  if (!override) {
    return { ...appManifest, _mergeLog: [{ source: 'app', note: 'subscriber has no override file' }] };
  }
  validateSubscriberOverride(override, appManifest);
  return mergeManifests(appManifest, override);
}
