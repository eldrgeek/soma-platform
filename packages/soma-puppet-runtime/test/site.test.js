import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createIdentityVerifier, HttpError } from '../site/functions/auth.mjs';
import { createApiHandler } from '../site/functions/api.mjs';
import { createMemoryStore } from '../src/store.js';

const APP_ID = 'sunday-supper';
const HOST_ID = 'rosa';
const SOURCE = `puppet "Dinner" version "0.2"
data dishes {
  fields: [who, dish]
}
screen "Home" {
  list "Dishes" from dishes
}`;

function request(path, { method = 'GET', user, body } = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(user ? { 'x-dev-user': user } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeApi() {
  const apps = { [APP_ID]: { hostId: HOST_ID, publicRead: false } };
  const feedback = new Map();
  return createApiHandler({
    apps,
    store: createMemoryStore(apps),
    verifyIdentity: createIdentityVerifier({ env: { NETLIFY_DEV: 'true' } }),
    readSeed: async () => SOURCE,
    feedbackStore: {
      async setJSON(key, value) {
        feedback.set(key, value);
      },
    },
  });
}

test('x-dev-user is accepted only when NETLIFY_DEV is exactly true', async () => {
  const dev = createIdentityVerifier({ env: { NETLIFY_DEV: 'true' } });
  assert.deepEqual(
    await dev(request('/', { user: 'theo:Theo' })),
    { id: 'theo', name: 'Theo' },
  );

  const production = createIdentityVerifier({
    env: {},
    fetchImpl: async () => {
      throw new Error('network should not be called without a bearer token');
    },
  });
  await assert.rejects(
    production(request('/', { user: 'theo:Theo' })),
    (error) => error instanceof HttpError && error.status === 401,
  );
});

test('bearer identity is verified with Supabase auth using the anon key', async () => {
  let call;
  const verify = createIdentityVerifier({
    env: { SUPABASE_URL: 'https://identity.example', SUPABASE_ANON_KEY: 'anon-test' },
    fetchImpl: async (url, options) => {
      call = { url, options };
      return Response.json({
        id: 'user-1',
        email: 'theo@example.com',
        user_metadata: { full_name: 'Theo' },
      });
    },
  });

  const identity = await verify(
    new Request('http://localhost', {
      headers: { authorization: 'Bearer access-token' },
    }),
  );

  assert.deepEqual(identity, { id: 'user-1', name: 'Theo', email: 'theo@example.com' });
  assert.equal(call.url, 'https://identity.example/auth/v1/user');
  assert.equal(call.options.headers.apikey, 'anon-test');
  assert.equal(call.options.headers.authorization, 'Bearer access-token');
});

test('API seeds current, protects writes, and exposes versioned data', async () => {
  const api = makeApi();
  const base = `/api/app/${APP_ID}`;

  assert.equal((await api(request(`${base}/current`))).status, 401);

  const seeded = await api(request(`${base}/current`, { user: 'theo:Theo' }));
  assert.equal(seeded.status, 200);
  assert.deepEqual(await seeded.json(), {
    versionId: 'v1',
    source: SOURCE,
    hostId: HOST_ID,
  });

  const forbidden = await api(request(`${base}/propose`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { source: SOURCE.replace('Dinner', 'Dinner v2') },
  }));
  assert.equal(forbidden.status, 403);

  const proposed = await api(request(`${base}/propose`, {
    method: 'POST',
    user: 'rosa:Rosa',
    body: { source: SOURCE.replace('Dinner', 'Dinner v2'), reason: 'More dinner' },
  }));
  assert.equal(proposed.status, 201);
  const { versionId } = await proposed.json();
  assert.equal(
    (await (await api(request(`${base}/current`, { user: 'theo:Theo' }))).json()).versionId,
    'v1',
  );

  assert.equal((await api(request(`${base}/approve`, {
    method: 'POST',
    user: 'rosa:Rosa',
    body: { versionId },
  }))).status, 200);

  const added = await api(request(`${base}/data/dishes`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { who: 'Theo', dish: 'Beans' },
  }));
  assert.equal(added.status, 201);
  assert.deepEqual(
    await (await api(request(`${base}/data/dishes`, { user: 'rosa:Rosa' }))).json(),
    [{ id: 'r1', who: 'Theo', dish: 'Beans' }],
  );
});

test('static browser parser and renderer mirror the package sources', async () => {
  const pairs = [
    ['../src/parser.js', '../site/public/vendor/puppet/parser.js'],
    ['../src/render.js', '../site/public/vendor/puppet/render.js'],
  ];
  for (const [source, browser] of pairs) {
    assert.equal(
      await readFile(new URL(browser, import.meta.url), 'utf8'),
      await readFile(new URL(source, import.meta.url), 'utf8'),
    );
  }
});
