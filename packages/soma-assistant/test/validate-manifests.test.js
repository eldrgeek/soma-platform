/**
 * validateManifest structural tests (F1.1).
 * Covers: unknown capabilities, unknown bundles, cap-bundle mismatch,
 * and structural validation of all three committed manifests.
 *
 * Note: validation uses validateManifest() which enforces the same structural
 * constraints as schema/assistant-config.schema.json. Full JSON Schema
 * validation (additionalProperties, pattern, minItems, etc.) would require ajv.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateManifest } from '../src/manifest/validate.js';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// (e) Unknown capabilities and unknown bundles throw with descriptive messages
// ---------------------------------------------------------------------------

describe('(e) unknown capabilities and bundles', () => {
  const base = require('../manifests/izzy.config.json');
  const billBase = require('../manifests/bill.config.json');

  it('unknown capability throws with its name', () => {
    const m = { ...base, capabilities: ['answer-from-content', 'quantum-entanglement'] };
    assert.throws(
      () => validateManifest(m),
      /unknown capability "quantum-entanglement"/
    );
  });

  it('unknown bundle id throws with its name', () => {
    const m = {
      ...base,
      clientBundles: {
        ...base.clientBundles,
        'holographic-widget': { mount: 'fab', capabilities: [], modalities: ['text'] },
      },
    };
    assert.throws(
      () => validateManifest(m),
      /unknown bundle "holographic-widget"/
    );
  });

  it('bundle using capability not declared at app level throws descriptively', () => {
    const m = {
      ...billBase,
      clientBundles: {
        'public-widget': {
          ...billBase.clientBundles['public-widget'],
          capabilities: ['persona-conversation'], // not in bill capabilities[]
        },
      },
    };
    assert.throws(
      () => validateManifest(m),
      /bundle "public-widget" uses capability "persona-conversation" not declared in capabilities\[\]/
    );
  });

  it('empty capabilities array: throws when bundles still reference those caps', () => {
    // validateManifest enforces bundle caps ⊆ app caps, so emptying app caps while
    // bundles still reference them must throw, even though minItems:1 is schema-level.
    const m = { ...base, capabilities: [] };
    assert.throws(() => validateManifest(m));
  });

  it('all capabilities unknown: each produces a throw (first one wins)', () => {
    const m = { ...base, capabilities: ['not-real', 'also-fake'] };
    assert.throws(() => validateManifest(m), /unknown capability "not-real"/);
  });

  it('capabilities must be an array: throws if string', () => {
    const m = { ...base, capabilities: 'answer-from-content' };
    assert.throws(() => validateManifest(m), /capabilities must be an array/);
  });
});

// ---------------------------------------------------------------------------
// Committed manifest schema validation
// All three manifests must pass validateManifest without throwing.
// ---------------------------------------------------------------------------

describe('committed manifests are structurally valid', () => {
  const manifests = [
    { name: 'bill.config.json', data: require('../manifests/bill.config.json') },
    { name: 'izzy.config.json', data: require('../manifests/izzy.config.json') },
    { name: 'playwriting-platform.config.json', data: require('../manifests/playwriting-platform.config.json') },
  ];

  for (const { name, data } of manifests) {
    it(`${name} validates without error`, () => {
      assert.doesNotThrow(() => validateManifest(data));
    });

    it(`${name} has required top-level fields`, () => {
      for (const field of ['assistantId', 'tenantId', 'persona', 'capabilities', 'clientBundles', 'tenantPolicy', 'transcripts']) {
        assert.ok(data[field] !== undefined, `${name}: missing "${field}"`);
      }
    });

    it(`${name} has boolean transcripts.defaultOn`, () => {
      assert.equal(typeof data.transcripts.defaultOn, 'boolean');
    });

    it(`${name} capabilities are all known`, () => {
      const KNOWN = ['answer-from-content', 'persona-conversation', 'guided-site-driving', 'guide-as-tool', 'feedback-channel'];
      for (const cap of data.capabilities) {
        assert.ok(KNOWN.includes(cap), `${name}: unknown capability "${cap}"`);
      }
    });
  }
});
