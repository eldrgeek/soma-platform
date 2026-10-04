import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inAuthRoundTrip } from '../src/authRoundTrip.js';
import { safeNext, loginHref } from '../src/safeNext.js';
import {
  createSomaAuthConfig,
  DEFAULT_SOMA_AUTH_METHODS,
  providerMeta,
} from '../src/somaAuthConfig.js';
import { createSomaKnownDevice } from '../src/somaKnownDevice.js';

test('inAuthRoundTrip: recovery=1', () => {
  assert.equal(inAuthRoundTrip('?recovery=1', ''), true);
});

test('inAuthRoundTrip: ?code=', () => {
  assert.equal(inAuthRoundTrip('?code=abc', ''), true);
});

test('inAuthRoundTrip: #access_token', () => {
  assert.equal(inAuthRoundTrip('', '#access_token=xyz'), true);
});

test('inAuthRoundTrip: none', () => {
  assert.equal(inAuthRoundTrip('?next=%2Fhome', ''), false);
  assert.equal(inAuthRoundTrip('', ''), false);
});

test('safeNext refuses absolute and protocol-relative URLs', () => {
  assert.equal(safeNext('?next=https://evil.example'), null);
  assert.equal(safeNext('?next=//evil.example'), null);
  assert.equal(safeNext('?next=%2F%2Fevil.example'), null);
});

test('safeNext refuses control characters a browser would strip', () => {
  assert.equal(safeNext('?next=%2F%09%2Fevil.example'), null);
  assert.equal(safeNext('?next=%2F%0A%2Fevil.example'), null);
});

test('safeNext allows in-app paths', () => {
  assert.equal(safeNext('?next=%2Fhouse'), '/house');
  assert.equal(safeNext('?next=/admin'), '/admin');
});

test('loginHref encodes path', () => {
  assert.equal(loginHref('/house'), '/login?next=%2Fhouse');
});

test('createSomaAuthConfig defaults match PlayMaker', () => {
  const cfg = createSomaAuthConfig();
  assert.deepEqual(cfg.methods, DEFAULT_SOMA_AUTH_METHODS);
  assert.equal(cfg.methods.magicLink, true);
  assert.equal(cfg.methods.emailOtp, false);
  assert.equal(cfg.methods.password, true);
  assert.equal(cfg.methods.phone, false);
  assert.deepEqual(cfg.methods.oauth, ['google']);
});

test('createSomaAuthConfig merges overrides', () => {
  const cfg = createSomaAuthConfig({
    url: 'https://example.supabase.co',
    anonKey: 'anon',
    methods: { phone: true, oauth: ['github'] },
  });
  assert.equal(cfg.url, 'https://example.supabase.co');
  assert.equal(cfg.methods.phone, true);
  assert.deepEqual(cfg.methods.oauth, ['github']);
  assert.equal(cfg.methods.magicLink, true);
});

test('providerMeta falls back for unknown providers', () => {
  const meta = providerMeta('custom_oidc');
  assert.match(meta.label, /Custom/);
});

test('known-device read/write with storage that throws does not throw', () => {
  const throwing = {
    getItem() {
      throw new Error('quota');
    },
    setItem() {
      throw new Error('quota');
    },
    removeItem() {
      throw new Error('quota');
    },
  };
  const kd = createSomaKnownDevice({ storageKey: 'test.key', storage: throwing });
  assert.equal(kd.read(), false);
  assert.equal(kd.readMarker(), null);
  kd.mark();
  kd.clear();
});

test('known-device marker has no PII', () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
    removeItem: (k) => mem.delete(k),
  };
  const kd = createSomaKnownDevice({ storageKey: 'test.device', storage });
  kd.mark();
  assert.notEqual(kd.readMarker(), null);
  assert.equal(kd.readMarker(), '1');
  assert.ok(!String(kd.readMarker()).includes('@'));
});
