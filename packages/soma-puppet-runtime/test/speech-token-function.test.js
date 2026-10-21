// The studio's /api/speech-token function: who may mint an ElevenLabs token
// for the Punctuated voice. A fake Supabase, a fake ElevenLabs and a fake Blobs
// stand in; every expected value is a literal.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSpeechTokenFunction, studioEmails } from '../site/functions/speech-token.mjs';

const KEY = 'sk_test_FORGE_SECRET_VALUE';
const ENV = { ELEVENLABS_API_KEY: KEY, SUPABASE_URL: 'https://proj.supabase.test', SUPABASE_ANON_KEY: 'anon-key' };

const STUDIOS = {
  'soma-studio': { hosts: ['mw@mike-wolf.com', 'Mw.PersonalMail@gmail.com'], members: [] },
  'coaching-age-of-ai': { hosts: ['mw@mike-wolf.com'], members: ['eric@example.test'] },
};

// Supabase knows these access tokens; ElevenLabs hands out a token; both are recorded.
function fakeNetwork({ users }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === 'https://proj.supabase.test/auth/v1/user') {
      const bearer = String(init.headers?.authorization ?? '').replace(/^Bearer /, '');
      const user = users[bearer];
      return user
        ? { ok: true, status: 200, json: async () => user }
        : { ok: false, status: 401, json: async () => ({}) };
    }
    if (url === 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe') {
      return { ok: true, status: 200, json: async () => ({ token: 'scribe-token-xyz' }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

// Blobs whose token expires with each request, as on Netlify.
let currentToken = 0;
function expiringBlobs() {
  const values = new Map();
  const made = [];
  const getStoreImpl = ({ name }) => {
    const token = currentToken;
    made.push(name);
    const check = () => {
      if (token !== currentToken) throw new Error('Failed to decode token: Token expired');
    };
    return {
      async get(key) { check(); return values.get(`${name}/${key}`) ?? null; },
      async set(key, value) { check(); values.set(`${name}/${key}`, value); },
    };
  };
  return { getStoreImpl, made, values };
}

const USERS = {
  'mike-token': { id: 'u-mike', email: 'MW@mike-wolf.com' },
  'eric-token': { id: 'u-eric', email: 'eric@example.test' },
  'stranger-token': { id: 'u-stranger', email: 'stranger@example.test' },
  'no-email-token': { id: 'u-none' },
};

function setup(over = {}) {
  const fetchImpl = fakeNetwork({ users: USERS });
  const blobs = expiringBlobs();
  const handler = createSpeechTokenFunction({
    getStoreImpl: blobs.getStoreImpl,
    env: over.env ?? ENV,
    fetchImpl,
    studiosMap: STUDIOS,
    limits: over.limits,
  });
  return { handler, fetchImpl, blobs };
}

const post = (token) => new Request('https://soma-forge.netlify.app/api/speech-token', {
  method: 'POST',
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

const elevenCalls = (fetchImpl) => fetchImpl.calls.filter((c) => c.url.includes('elevenlabs'));

test('a studio host signed in with SOMA sign-in gets a token, minted with the server-side key', async () => {
  const s = setup();
  const res = await s.handler(post('mike-token'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { token: 'scribe-token-xyz', expires_in: 900 });
  const eleven = elevenCalls(s.fetchImpl);
  assert.equal(eleven.length, 1);
  assert.equal(eleven[0].init.headers['xi-api-key'], KEY);
});

test('the email match ignores case, and a studio member (not only a host) is let in', async () => {
  const s = setup();
  assert.equal((await s.handler(post('mike-token'))).status, 200);   // MW@mike-wolf.com vs mw@mike-wolf.com
  assert.equal((await s.handler(post('eric-token'))).status, 200);   // a member of the coaching studio
});

test('someone signed in who is in no studio is refused with 403 and costs nothing', async () => {
  const s = setup();
  const res = await s.handler(post('stranger-token'));
  assert.equal(res.status, 403);
  assert.equal(elevenCalls(s.fetchImpl).length, 0);
  assert.equal(s.blobs.values.size, 0);
});

test('a sign-in with no email on it is refused', async () => {
  assert.equal((await setup().handler(post('no-email-token'))).status, 403);
});

test('no sign-in header is a 401', async () => {
  const s = setup();
  assert.equal((await s.handler(post(null))).status, 401);
  assert.equal(s.fetchImpl.calls.length, 0);
});

test('a token Supabase does not know is a 401', async () => {
  const s = setup();
  assert.equal((await s.handler(post('forged-token'))).status, 401);
  assert.equal(elevenCalls(s.fetchImpl).length, 0);
});

test('without the ElevenLabs key set, the function says it is not configured', async () => {
  const res = await setup({ env: { ...ENV, ELEVENLABS_API_KEY: '' } }).handler(post('mike-token'));
  assert.equal(res.status, 503);
});

test('the key is never in an answer', async () => {
  const s = setup();
  for (const request of [post('mike-token'), post('stranger-token'), post(null)]) {
    assert.equal((await (await s.handler(request)).text()).includes(KEY), false);
  }
});

test('each person has a daily limit, then gets 429', async () => {
  const s = setup({ limits: { perPerson: 2, global: 100 } });
  assert.equal((await s.handler(post('mike-token'))).status, 200);
  assert.equal((await s.handler(post('mike-token'))).status, 200);
  const res = await s.handler(post('mike-token'));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'capped', scope: 'you' });
  assert.equal((await s.handler(post('eric-token'))).status, 200);   // another person is unaffected
});

test('the counters are kept in a store made for each request, so an expired Blobs token is never reused', async () => {
  const s = setup();
  for (let request = 1; request <= 3; request += 1) {
    currentToken = request;                                          // a new invocation, a new Blobs token
    const res = await s.handler(post('mike-token'));
    assert.equal(res.status, 200, `request ${request}`);
  }
  assert.ok(s.blobs.made.length >= 6, 'a store per counter per request');
});

test('only POST is accepted, and a browser preflight is answered', async () => {
  const s = setup();
  assert.equal((await s.handler(new Request('https://x.test/api/speech-token', { method: 'GET' }))).status, 405);
  const preflight = await s.handler(new Request('https://x.test/api/speech-token', { method: 'OPTIONS' }));
  assert.equal(preflight.status, 204);
});

test('studioEmails collects hosts and members of every studio, lower case, once', () => {
  assert.deepEqual([...studioEmails(STUDIOS)].sort(), ['eric@example.test', 'mw.personalmail@gmail.com', 'mw@mike-wolf.com']);
});
