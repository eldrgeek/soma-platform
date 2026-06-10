/**
 * Adversarial merge-contract test suite (F1.1).
 * Covers: happy-path, forbidden-key injection, modality intersection,
 * retentionDays min-resolution, _mergeLog, and malformed inputs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mergeManifests } from '../src/manifest/merge.js';
import { validateManifest, validateSubscriberOverride } from '../src/manifest/validate.js';

const require = createRequire(import.meta.url);
const billConfig = require('../manifests/bill.config.json');
const izzyConfig = require('../manifests/izzy.config.json');

// ---------------------------------------------------------------------------
// (a) Happy-path merge for bill and izzy manifests
// ---------------------------------------------------------------------------

describe('(a) happy-path merge', () => {
  it('izzy: persona name + retentionDays override', () => {
    const override = {
      persona: { name: 'Izzy (Studio)' },
      transcripts: { retentionDays: 90 },
    };
    validateSubscriberOverride(override, izzyConfig);
    const merged = mergeManifests(izzyConfig, override);
    assert.equal(merged.persona.name, 'Izzy (Studio)');
    assert.equal(merged.transcripts.retentionDays, 90);
    // Immutable fields preserved
    assert.equal(merged.tenantId, izzyConfig.tenantId);
    assert.deepEqual(merged.tenantPolicy, izzyConfig.tenantPolicy);
    assert.deepEqual(merged.capabilities, izzyConfig.capabilities);
  });

  it('izzy: voice_id, greeting, contextDoc override', () => {
    const override = {
      persona: {
        voice_id: 'custom-voice-id',
        greeting: 'Welcome, playwright!',
        contextDoc: 'custom/knowledge.md',
      },
    };
    validateSubscriberOverride(override, izzyConfig);
    const merged = mergeManifests(izzyConfig, override);
    assert.equal(merged.persona.voice_id, 'custom-voice-id');
    assert.equal(merged.persona.greeting, 'Welcome, playwright!');
    assert.equal(merged.persona.contextDoc, 'custom/knowledge.md');
    // Name unchanged
    assert.equal(merged.persona.name, izzyConfig.persona.name);
  });

  it('bill: greeting + disable tts from public-widget', () => {
    const override = {
      persona: { greeting: "Hey, I'm Bill!" },
      clientBundles: { 'public-widget': { modalities: ['text'] } },
    };
    validateSubscriberOverride(override, billConfig);
    const merged = mergeManifests(billConfig, override);
    assert.equal(merged.persona.greeting, "Hey, I'm Bill!");
    assert.deepEqual(merged.clientBundles['public-widget'].modalities, ['text']);
    // tenantPolicy and other fields unchanged
    assert.deepEqual(merged.tenantPolicy, billConfig.tenantPolicy);
    assert.equal(merged.assistantId, billConfig.assistantId);
  });

  it('empty override returns clone of app manifest (plus empty _mergeLog)', () => {
    const merged = mergeManifests(izzyConfig, {});
    assert.equal(merged.tenantId, izzyConfig.tenantId);
    assert.equal(merged.persona.name, izzyConfig.persona.name);
    assert.deepEqual(merged._mergeLog, []);
    // Confirm it's a clone, not same reference
    merged.persona.name = 'MUTATED';
    assert.equal(izzyConfig.persona.name, 'Izzy');
  });
});

// ---------------------------------------------------------------------------
// (b) Forbidden subscriber-override keys rejected
// ---------------------------------------------------------------------------

describe('(b) forbidden key rejection', () => {
  // Direct top-level forbidden keys
  for (const key of ['tenantPolicy', 'guide', 'capabilities', 'spine', 'intentClassifier']) {
    it(`direct: "${key}" is rejected`, () => {
      const override = { [key]: {} };
      assert.throws(
        () => validateSubscriberOverride(override, izzyConfig),
        /cannot be overridden by subscriber/
      );
    });
  }

  // Nested in persona object
  it('nested: persona.tenantPolicy is rejected', () => {
    const override = { persona: { tenantPolicy: {} } };
    assert.throws(
      () => validateSubscriberOverride(override, izzyConfig),
      /persona\.tenantPolicy is not subscriber-overridable/
    );
  });

  it('nested: persona.capabilities is rejected', () => {
    const override = { persona: { capabilities: ['answer-from-content'] } };
    assert.throws(
      () => validateSubscriberOverride(override, izzyConfig),
      /not subscriber-overridable/
    );
  });

  it('nested: persona.spine is rejected', () => {
    const override = { persona: { spine: { rag: { enabled: false } } } };
    assert.throws(
      () => validateSubscriberOverride(override, izzyConfig),
      /not subscriber-overridable/
    );
  });

  // Prototype-pollution-style: JSON.parse with __proto__ key
  it('prototype-pollution: JSON.parse __proto__ does not pollute Object.prototype', () => {
    const raw = JSON.parse('{"__proto__": {"tenantPolicy": {"guideDelegation": false}}}');
    // Object.prototype must NOT be contaminated
    assert.equal(({}).tenantPolicy, undefined);
    // Merge should run cleanly; __proto__ key is ignored by merge (processes known fields only)
    const merged = mergeManifests(izzyConfig, raw);
    assert.deepEqual(merged.tenantPolicy, izzyConfig.tenantPolicy);
    assert.deepEqual(merged._mergeLog, []);
  });

  // Prototype-inherited forbidden key (Object.create)
  it('prototype-inherited tenantPolicy is caught by validateSubscriberOverride', () => {
    const proto = { tenantPolicy: { guideDelegation: false } };
    const override = Object.create(proto);
    // override['tenantPolicy'] reads through prototype — validator must catch this
    assert.throws(
      () => validateSubscriberOverride(override, izzyConfig),
      /cannot be overridden by subscriber/
    );
  });

  // Merge defense-in-depth: even without validate, merge ignores non-allowlisted persona keys
  it('merge layer ignores unvalidated extra persona keys (defense-in-depth)', () => {
    // Production flow always calls validate first; this tests the merge layer alone.
    const override = { persona: { name: 'Hacked', tenantPolicy: { guideDelegation: false } } };
    const merged = mergeManifests(izzyConfig, override);
    // Only allowlisted persona fields are applied
    assert.equal(merged.persona.name, 'Hacked');
    assert.deepEqual(merged.tenantPolicy, izzyConfig.tenantPolicy);
  });

  // Merge defense-in-depth: bundle capabilities override logged as blocked, not applied
  it('merge layer blocks bundle capabilities override and logs it', () => {
    const override = { clientBundles: { 'subscriber-chat': { capabilities: ['feedback-channel'] } } };
    const merged = mergeManifests(izzyConfig, override);
    // App capabilities unchanged
    assert.deepEqual(
      merged.clientBundles['subscriber-chat'].capabilities,
      izzyConfig.clientBundles['subscriber-chat'].capabilities
    );
    const entry = merged._mergeLog.find(e => e.path === 'clientBundles.subscriber-chat.capabilities');
    assert.ok(entry, 'capabilities block should appear in _mergeLog');
    assert.equal(entry.resolved, 'app (immutable)');
  });
});

// ---------------------------------------------------------------------------
// (c) Bundle modality intersection — override cannot ENABLE a disabled modality
// ---------------------------------------------------------------------------

describe('(c) bundle modality intersection', () => {
  it('disable tts from bill public-widget [text,tts] → [text]', () => {
    const override = { clientBundles: { 'public-widget': { modalities: ['text'] } } };
    validateSubscriberOverride(override, billConfig);
    const merged = mergeManifests(billConfig, override);
    assert.deepEqual(merged.clientBundles['public-widget'].modalities, ['text']);
  });

  it('cannot enable stt on bill public-widget (not in app)', () => {
    const override = { clientBundles: { 'public-widget': { modalities: ['text', 'tts', 'stt'] } } };
    assert.throws(
      () => validateSubscriberOverride(override, billConfig),
      /modality "stt" not enabled at app level for bundle "public-widget"/
    );
  });

  it('cannot reference a bundle not in app manifest', () => {
    const override = { clientBundles: { 'voice-first-agent': { modalities: ['text'] } } };
    // izzy manifest doesn't have voice-first-agent
    assert.throws(
      () => validateSubscriberOverride(override, izzyConfig),
      /bundle "voice-first-agent" not in app manifest/
    );
  });

  it('empty modalities override yields empty intersection (all disabled)', () => {
    const override = { clientBundles: { 'public-widget': { modalities: [] } } };
    validateSubscriberOverride(override, billConfig);
    const merged = mergeManifests(billConfig, override);
    assert.deepEqual(merged.clientBundles['public-widget'].modalities, []);
  });

  it('full modality override (same as app) is a no-op', () => {
    const appMods = billConfig.clientBundles['public-widget'].modalities;
    const override = { clientBundles: { 'public-widget': { modalities: [...appMods] } } };
    validateSubscriberOverride(override, billConfig);
    const merged = mergeManifests(billConfig, override);
    assert.deepEqual(merged.clientBundles['public-widget'].modalities, appMods);
  });
});

// ---------------------------------------------------------------------------
// (d) retentionDays min-resolution
// BUG FOUND: validateSubscriberOverride did not validate retentionDays before this
// fix — null/zero/negative values would propagate through to Math.min() and
// produce invalid merged values (e.g. null → 0, -1 → -1).
// Fix: added positive-integer check in validateSubscriberOverride (validate.js).
// ---------------------------------------------------------------------------

describe('(d) retentionDays min-resolution', () => {
  it('subscriber < app: subscriber wins (izzy 365 → 90)', () => {
    const override = { transcripts: { retentionDays: 90 } };
    validateSubscriberOverride(override, izzyConfig);
    const merged = mergeManifests(izzyConfig, override);
    assert.equal(merged.transcripts.retentionDays, 90);
  });

  it('subscriber > app: app cap wins (bill 30, override 365 → 30)', () => {
    const override = { transcripts: { retentionDays: 365 } };
    validateSubscriberOverride(override, billConfig);
    const merged = mergeManifests(billConfig, override);
    assert.equal(merged.transcripts.retentionDays, 30);
  });

  it('subscriber equals app: result equals that value', () => {
    const override = { transcripts: { retentionDays: izzyConfig.transcripts.retentionDays } };
    validateSubscriberOverride(override, izzyConfig);
    const merged = mergeManifests(izzyConfig, override);
    assert.equal(merged.transcripts.retentionDays, izzyConfig.transcripts.retentionDays);
  });

  it('missing retentionDays in override: app value preserved', () => {
    const override = { transcripts: { defaultOn: false } };
    validateSubscriberOverride(override, izzyConfig);
    const merged = mergeManifests(izzyConfig, override);
    assert.equal(merged.transcripts.retentionDays, izzyConfig.transcripts.retentionDays);
  });

  it('null retentionDays: rejected by validateSubscriberOverride', () => {
    const override = { transcripts: { retentionDays: null } };
    assert.throws(
      () => validateSubscriberOverride(override, izzyConfig),
      /retentionDays must be a positive integer/
    );
  });

  it('zero retentionDays: rejected by validateSubscriberOverride', () => {
    const override = { transcripts: { retentionDays: 0 } };
    assert.throws(
      () => validateSubscriberOverride(override, izzyConfig),
      /retentionDays must be a positive integer/
    );
  });

  it('negative retentionDays: rejected by validateSubscriberOverride', () => {
    const override = { transcripts: { retentionDays: -7 } };
    assert.throws(
      () => validateSubscriberOverride(override, izzyConfig),
      /retentionDays must be a positive integer/
    );
  });

  it('float retentionDays: rejected by validateSubscriberOverride', () => {
    const override = { transcripts: { retentionDays: 1.5 } };
    assert.throws(
      () => validateSubscriberOverride(override, izzyConfig),
      /retentionDays must be a positive integer/
    );
  });

  it('minimum valid value 1: accepted', () => {
    const override = { transcripts: { retentionDays: 1 } };
    validateSubscriberOverride(override, izzyConfig);
    const merged = mergeManifests(izzyConfig, override);
    assert.equal(merged.transcripts.retentionDays, 1);
  });
});

// ---------------------------------------------------------------------------
// (f) _mergeLog records every override applied
// ---------------------------------------------------------------------------

describe('(f) _mergeLog', () => {
  it('persona.name override produces a log entry', () => {
    const override = { persona: { name: 'Izzy Pro' } };
    const merged = mergeManifests(izzyConfig, override);
    const entry = merged._mergeLog.find(e => e.path === 'persona.name');
    assert.ok(entry, '_mergeLog must contain persona.name entry');
    assert.equal(entry.resolved, 'subscriber');
    assert.equal(entry.subscriber, 'Izzy Pro');
    assert.equal(entry.app, izzyConfig.persona.name);
  });

  it('transcripts.retentionDays override logged with resolved min value', () => {
    const override = { transcripts: { retentionDays: 60 } };
    const merged = mergeManifests(izzyConfig, override);
    const entry = merged._mergeLog.find(e => e.path === 'transcripts.retentionDays');
    assert.ok(entry, '_mergeLog must contain retentionDays entry');
    assert.equal(entry.resolved, 60);
    assert.equal(entry.app, izzyConfig.transcripts.retentionDays);
  });

  it('transcripts.defaultOn override logged', () => {
    const override = { transcripts: { defaultOn: false } };
    const merged = mergeManifests(izzyConfig, override);
    const entry = merged._mergeLog.find(e => e.path === 'transcripts.defaultOn');
    assert.ok(entry, '_mergeLog must contain transcripts.defaultOn entry');
    assert.equal(entry.resolved, 'subscriber');
    assert.equal(entry.subscriber, false);
  });

  it('modality intersection logged with app/subscriber/resolved arrays', () => {
    const override = { clientBundles: { 'subscriber-chat': { modalities: ['text'] } } };
    const merged = mergeManifests(izzyConfig, override);
    const entry = merged._mergeLog.find(e => e.path === 'clientBundles.subscriber-chat.modalities');
    assert.ok(entry, '_mergeLog must contain modalities entry');
    assert.deepEqual(entry.resolved, ['text']);
    assert.ok(Array.isArray(entry.app), 'entry.app must be the original modalities array');
  });

  it('multi-field override produces one log entry per field', () => {
    const override = {
      persona: { name: 'X', greeting: 'Hello' },
      transcripts: { defaultOn: false, retentionDays: 30 },
    };
    const merged = mergeManifests(izzyConfig, override);
    const paths = merged._mergeLog.map(e => e.path);
    assert.ok(paths.includes('persona.name'));
    assert.ok(paths.includes('persona.greeting'));
    assert.ok(paths.includes('transcripts.defaultOn'));
    assert.ok(paths.includes('transcripts.retentionDays'));
  });

  it('no-op override yields empty _mergeLog', () => {
    const merged = mergeManifests(izzyConfig, {});
    assert.deepEqual(merged._mergeLog, []);
  });
});

// ---------------------------------------------------------------------------
// (g) Malformed inputs
// ---------------------------------------------------------------------------

describe('(g) malformed inputs', () => {
  it('null manifest: throws (cannot read property of null)', () => {
    assert.throws(() => validateManifest(null));
  });

  it('undefined manifest: throws', () => {
    assert.throws(() => validateManifest(undefined));
  });

  it('empty object: throws with "missing required field"', () => {
    assert.throws(() => validateManifest({}), /missing required field/);
  });

  it('manifest missing transcripts: throws', () => {
    const m = { ...izzyConfig };
    delete m.transcripts;
    assert.throws(() => validateManifest(m), /missing required field "transcripts"/);
  });

  it('manifest with transcripts.defaultOn as string: throws', () => {
    const m = { ...izzyConfig, transcripts: { ...izzyConfig.transcripts, defaultOn: 'yes' } };
    assert.throws(() => validateManifest(m), /transcripts\.defaultOn must be boolean/);
  });

  it('override with null persona: merge skips persona processing (persona unchanged)', () => {
    // null persona = no persona override; merge must not throw
    const override = { persona: null };
    const merged = mergeManifests(izzyConfig, override);
    assert.equal(merged.persona.name, izzyConfig.persona.name);
    assert.deepEqual(merged._mergeLog, []);
  });
});
