'use strict';
// Tests for the token handler: who may get a token, how many, and that the
// ElevenLabs key never leaves the server. A fake fetch and an in-memory counter
// stand in for ElevenLabs and the store. SOMA_SPEECH_SERVER lets
// scripts/mutation-check.js run these tests against a deliberately broken copy.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const T = require(process.env.SOMA_SPEECH_SERVER || path.join(__dirname, '..', 'server', 'speech-token.js'));

const KEY = 'sk_test_SECRET_KEY_VALUE';

function memoryStore() {
  const counts = {};
  return { counts, incr: async (key) => { counts[key] = (counts[key] || 0) + 1; return counts[key]; } };
}

function elevenFetch(answer) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (answer.reject) throw new Error('down');
    return { ok: answer.status === 200, status: answer.status, json: async () => answer.body };
  };
  fn.calls = calls;
  return fn;
}

function setup(over) {
  over = over || {};
  const store = memoryStore();
  const fetch = over.fetch || elevenFetch({ status: 200, body: { token: 'single-use-123' } });
  const handle = T.createSpeechTokenHandler({
    apiKey: 'apiKey' in over ? over.apiKey : KEY,
    authorize: over.authorize || (async () => ({ ok: true, id: 'ann' })),
    store, fetch,
    now: () => Date.parse('2026-10-21T15:00:00Z'),
    limits: over.limits
  });
  return { handle, store, fetch };
}

const post = (headers) => ({ method: 'POST', headers: headers || {} });

// ---------------------------------------------------------------- the happy path

test('a signed-in person gets a token, and ElevenLabs is called with the server-side key', async () => {
  const s = setup();
  const res = await s.handle(post());
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { token: 'single-use-123', expires_in: 900 });
  assert.equal(s.fetch.calls.length, 1);
  assert.equal(s.fetch.calls[0].url, 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe');
  assert.equal(s.fetch.calls[0].init.method, 'POST');
  assert.equal(s.fetch.calls[0].init.headers['xi-api-key'], KEY);
});

test('the API key never appears in anything sent back to the page', async () => {
  const s = setup();
  for (const res of [await s.handle(post()), await s.handle({ method: 'GET' }), await s.handle({ method: 'OPTIONS' })]) {
    assert.equal(JSON.stringify(res).includes(KEY), false);
  }
});

test('answers carry open CORS headers and are never cached', async () => {
  const res = await setup().handle(post());
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.match(res.headers['access-control-allow-headers'], /authorization/);
  assert.match(res.headers['access-control-allow-headers'], /x-soma-speech-code/);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('a browser preflight (OPTIONS) is answered without asking who you are', async () => {
  const s = setup({ authorize: async () => { throw new Error('should not be asked'); } });
  const res = await s.handle({ method: 'OPTIONS', headers: {} });
  assert.equal(res.status, 204);
  assert.equal(s.fetch.calls.length, 0);
});

test('only POST is accepted', async () => {
  const res = await setup().handle({ method: 'GET', headers: {} });
  assert.equal(res.status, 405);
});

// ---------------------------------------------------------------- who may ask

test('someone who is not signed in gets 401 and costs nothing', async () => {
  const s = setup({ authorize: async () => ({ ok: false, status: 401 }) });
  const res = await s.handle(post());
  assert.equal(res.status, 401);
  assert.deepEqual(JSON.parse(res.body), { error: 'not-signed-in' });
  assert.equal(s.fetch.calls.length, 0);
  assert.deepEqual(s.store.counts, {});
});

test('someone signed in but not allowed gets 403', async () => {
  const s = setup({ authorize: async () => ({ ok: false, status: 403 }) });
  assert.equal((await s.handle(post())).status, 403);
});

test('an authorize function that throws is treated as not signed in', async () => {
  const s = setup({ authorize: async () => { throw new Error('boom'); } });
  assert.equal((await s.handle(post())).status, 401);
});

test('without an API key the handler says it is not configured and spends nothing', async () => {
  const s = setup({ apiKey: '' });
  const res = await s.handle(post());
  assert.equal(res.status, 503);
  assert.equal(s.fetch.calls.length, 0);
});

// ---------------------------------------------------------------- how many

test('a person gets their daily number of tokens, and the next one is refused with 429', async () => {
  const s = setup({ limits: { perPerson: 3, global: 100 } });
  for (let i = 0; i < 3; i++) assert.equal((await s.handle(post())).status, 200);
  const res = await s.handle(post());
  assert.equal(res.status, 429);
  assert.deepEqual(JSON.parse(res.body), { error: 'capped', scope: 'you' });
  assert.equal(s.fetch.calls.length, 3);                        // the refused one never reached ElevenLabs
});

test('the limit is per person: another person still gets a token', async () => {
  let who = 'ann';
  const s = setup({ limits: { perPerson: 1, global: 100 }, authorize: async () => ({ ok: true, id: who }) });
  assert.equal((await s.handle(post())).status, 200);
  assert.equal((await s.handle(post())).status, 429);
  who = 'bob';
  assert.equal((await s.handle(post())).status, 200);
});

test('everyone together also have a daily limit', async () => {
  let who = 0;
  const s = setup({ limits: { perPerson: 100, global: 2 }, authorize: async () => ({ ok: true, id: 'p' + who++ }) });
  assert.equal((await s.handle(post())).status, 200);
  assert.equal((await s.handle(post())).status, 200);
  const res = await s.handle(post());
  assert.equal(res.status, 429);
  assert.deepEqual(JSON.parse(res.body), { error: 'capped', scope: 'everyone' });
});

test('a person over their own limit does not use up the shared one', async () => {
  const s = setup({ limits: { perPerson: 1, global: 100 } });
  await s.handle(post());
  await s.handle(post());
  await s.handle(post());
  assert.equal(s.store.counts['global:2026-10-21'], 1);
});

test('counts are kept per day', async () => {
  const s = setup();
  await s.handle(post());
  assert.deepEqual(Object.keys(s.store.counts).sort(), ['global:2026-10-21', 'person:2026-10-21:ann']);
});

// ---------------------------------------------------------------- when ElevenLabs fails

test('an ElevenLabs error becomes a 502 without its details', async () => {
  const s = setup({ fetch: elevenFetch({ status: 401, body: { detail: 'invalid key sk_test_SECRET_KEY_VALUE' } }) });
  const res = await s.handle(post());
  assert.equal(res.status, 502);
  assert.equal(res.body.includes(KEY), false);
});

test('an unreachable ElevenLabs becomes a 502', async () => {
  const s = setup({ fetch: elevenFetch({ reject: true }) });
  assert.equal((await s.handle(post())).status, 502);
});

test('an ElevenLabs answer with no token becomes a 502', async () => {
  const s = setup({ fetch: elevenFetch({ status: 200, body: {} }) });
  assert.equal((await s.handle(post())).status, 502);
});

// ---------------------------------------------------------------- the demo code

test('demo code: the right code in the header is accepted, anything else is not', async () => {
  const auth = T.demoCodeAuthorize('open-sesame-1234');
  assert.deepEqual(await auth({ 'x-soma-speech-code': 'open-sesame-1234' }), { ok: true, id: 'demo-code' });
  assert.equal((await auth({ 'x-soma-speech-code': 'open-sesame-1235' })).ok, false);
  assert.equal((await auth({ 'x-soma-speech-code': 'short' })).ok, false);
  assert.equal((await auth({})).ok, false);
});

test('demo code: with no code set on the server nothing is accepted, not even an empty header', async () => {
  const auth = T.demoCodeAuthorize('');
  assert.equal((await auth({ 'x-soma-speech-code': '' })).ok, false);
  assert.equal((await auth({})).ok, false);
});

test('demo code: header names are matched without regard to case', async () => {
  const s = setup({ authorize: T.demoCodeAuthorize('code-1') });
  const res = await s.handle(post({ 'X-Soma-Speech-Code': 'code-1' }));
  assert.equal(res.status, 200);
});

// ---------------------------------------------------------------- SOMA sign-in

function supabaseFetch(status, body) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return { ok: status === 200, status, json: async () => body }; };
  fn.calls = calls;
  return fn;
}

test('sign-in: a valid Supabase token is accepted and identifies the person', async () => {
  const f = supabaseFetch(200, { id: 'user-7', email: 'eric@example.test' });
  const auth = T.supabaseAuthorize({ url: 'https://proj.supabase.test/', anonKey: 'anon-key', fetch: f });
  assert.deepEqual(await auth({ authorization: 'Bearer abc.def' }), { ok: true, id: 'user-7', email: 'eric@example.test' });
  assert.equal(f.calls[0].url, 'https://proj.supabase.test/auth/v1/user');
  assert.equal(f.calls[0].init.headers.authorization, 'Bearer abc.def');
  assert.equal(f.calls[0].init.headers.apikey, 'anon-key');
});

test('sign-in: no header, a malformed header, or a token Supabase refuses is a 401', async () => {
  const auth = T.supabaseAuthorize({ url: 'https://p.test', anonKey: 'k', fetch: supabaseFetch(401, {}) });
  assert.deepEqual(await auth({}), { ok: false, status: 401 });
  assert.deepEqual(await auth({ authorization: 'Token abc' }), { ok: false, status: 401 });
  assert.deepEqual(await auth({ authorization: 'Bearer abc' }), { ok: false, status: 401 });
});

test('sign-in: the allow function can refuse a signed-in person with 403', async () => {
  const f = supabaseFetch(200, { id: 'user-8', email: 'stranger@example.test' });
  const auth = T.supabaseAuthorize({ url: 'https://p.test', anonKey: 'k', fetch: f, allow: (u) => u.email.endsWith('@mike-wolf.com') });
  assert.deepEqual(await auth({ authorization: 'Bearer abc' }), { ok: false, status: 403 });
});
