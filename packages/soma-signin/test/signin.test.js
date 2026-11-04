import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inAuthRoundTrip } from '../src/authRoundTrip.js';
import { safeNext, loginHref } from '../src/safeNext.js';
import {
  createSomaAuthConfig,
  DEFAULT_SOMA_AUTH_METHODS,
  providerMeta,
  orderProviders,
  enabledProviders,
  fetchAuthSettings,
  providerOAuthOptions,
  normalizeProvider,
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
  assert.deepEqual(cfg.methods.oauth, ['google', 'facebook', 'linkedin_oidc', 'azure', 'apple', 'github']);
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

test('orderProviders puts Google first, normalizes aliases, drops duplicates', () => {
  assert.deepEqual(orderProviders(['facebook', 'Microsoft', 'google', 'github', 'azure', 'linkedin']), [
    'google',
    'facebook',
    'linkedin_oidc',
    'azure',
    'github',
  ]);
  assert.deepEqual(orderProviders(['discord', 'google', 'custom_oidc', 'apple']), [
    'google',
    'apple',
    'discord',
    'custom_oidc',
  ]);
  assert.deepEqual(orderProviders([]), []);
});

test('createSomaAuthConfig orders a custom provider list', () => {
  const cfg = createSomaAuthConfig({ methods: { oauth: ['github', 'google'] } });
  assert.deepEqual(cfg.methods.oauth, ['google', 'github']);
});

test('enabledProviders keeps only providers Supabase reports on', () => {
  const settings = { external: { google: true, github: true, azure: false, email: true } };
  assert.deepEqual(enabledProviders(['facebook', 'github', 'azure', 'google'], settings), [
    'google',
    'github',
  ]);
});

test('enabledProviders falls back to Google when settings are unavailable', () => {
  const wanted = ['google', 'github', 'apple'];
  assert.deepEqual(enabledProviders(wanted, null), ['google']);
  assert.deepEqual(enabledProviders(wanted, {}), ['google']);
  assert.deepEqual(enabledProviders(['github'], null), []);
});

test('fetchAuthSettings reads /auth/v1/settings with the anon key', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, apikey: init.headers.apikey };
    return { ok: true, json: async () => ({ external: { google: true } }) };
  };
  const out = await fetchAuthSettings({ url: 'https://x.supabase.co/', anonKey: 'anon', fetchImpl });
  assert.deepEqual(out, { external: { google: true } });
  assert.deepEqual(seen, { url: 'https://x.supabase.co/auth/v1/settings', apikey: 'anon' });
});

test('fetchAuthSettings returns null on failure, never throws', async () => {
  const boom = async () => {
    throw new Error('offline');
  };
  const notOk = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await fetchAuthSettings({ url: 'https://x', anonKey: 'a', fetchImpl: boom }), null);
  assert.equal(await fetchAuthSettings({ url: 'https://x', anonKey: 'a', fetchImpl: notOk }), null);
  assert.equal(await fetchAuthSettings({ url: '', anonKey: 'a', fetchImpl: boom }), null);
});

test('Microsoft asks for the email scope so accounts link by email', () => {
  assert.deepEqual(providerOAuthOptions('azure'), { scopes: 'email' });
  assert.deepEqual(providerOAuthOptions('microsoft'), { scopes: 'email' });
  assert.deepEqual(providerOAuthOptions('github'), {});
  assert.equal(normalizeProvider(' Microsoft '), 'azure');
  assert.equal(providerMeta('microsoft').label, 'Microsoft');
});

import { hubGoogleUrl, readHubSession, shouldUseGoogleHub } from '../src/hubSignIn.js';

test('hubGoogleUrl points at /google with the encoded return URL', () => {
  assert.equal(
    hubGoogleUrl('https://hub.example/', 'https://app.example/sign-in?next=%2Fx'),
    'https://hub.example/google?to=https%3A%2F%2Fapp.example%2Fsign-in%3Fnext%3D%252Fx',
  );
});

test('readHubSession takes only a hub-shaped fragment', () => {
  assert.deepEqual(readHubSession('#access_token=A&refresh_token=R&token_type=bearer&type=signin&provider=google'), {
    access_token: 'A',
    refresh_token: 'R',
  });
  assert.equal(readHubSession('#access_token=A&refresh_token=R'), null);
  assert.equal(readHubSession('#access_token=A&provider=google'), null);
  assert.equal(readHubSession(''), null);
});

test('shouldUseGoogleHub follows config', () => {
  assert.equal(shouldUseGoogleHub({ googleHub: 'https://h' }), true);
  assert.equal(shouldUseGoogleHub({}), false);
});

test('createSomaAuthConfig carries googleHub only when given, without a trailing slash', () => {
  assert.equal('googleHub' in createSomaAuthConfig(), false);
  assert.equal(createSomaAuthConfig({ googleHub: ' https://hub.example/ ' }).googleHub, 'https://hub.example');
});
