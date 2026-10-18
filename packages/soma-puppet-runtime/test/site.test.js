import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createIdentityVerifier, HttpError } from '../site/lib/auth.mjs';
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
  field "Dish"
  button "Add dish" -> adds to dishes { who: "{me.name}", dish: "{form.Dish}" }
}`;
const SUNDAY_SUPPER_SOURCE = await readFile(
  new URL('../examples/sunday-supper.puppet', import.meta.url),
  'utf8',
);

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

function makeApi({ source = SOURCE, store } = {}) {
  const apps = { [APP_ID]: { hostId: HOST_ID, publicRead: false } };
  const feedback = new Map();
  return createApiHandler({
    apps,
    store: store ?? createMemoryStore(apps),
    verifyIdentity: createIdentityVerifier({ env: { NETLIFY_DEV: 'true' } }),
    readSeed: async () => source,
    feedbackStore: {
      async setJSON(key, value) {
        feedback.set(key, value);
      },
      async get(key, { type } = {}) {
        const value = feedback.get(key);
        if (value === undefined) return null;
        return type === 'json' ? structuredClone(value) : JSON.stringify(value);
      },
      async list({ prefix } = {}) {
        return {
          blobs: [...feedback.keys()]
            .filter((key) => !prefix || key.startsWith(prefix))
            .map((key) => ({ key })),
          directories: [],
        };
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

test('API rejects a spoofed me field instead of storing it as the verified identity', async () => {
  const api = makeApi({ source: SUNDAY_SUPPER_SOURCE });
  const base = `/api/app/${APP_ID}`;
  assert.equal((await api(request(`${base}/current`, { user: 'theo:Theo' }))).status, 200);

  const response = await api(request(`${base}/data/seats`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { name: 'Rosa' },
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(
    await (await api(request(`${base}/data/seats`, { user: 'theo:Theo' }))).json(),
    [],
  );
});

test('API preserves form text in mixed me and form templates', async () => {
  const source = `puppet "Mixed templates" version "0.2"
data notes {
  fields: [note]
}
screen "Home" {
  field "Dish"
  button "Add note" -> adds to notes { note: "{me.name} brings {form.Dish}" }
}`;
  const api = makeApi({ source });
  const base = `/api/app/${APP_ID}`;
  await api(request(`${base}/current`, { user: 'theo:Theo' }));

  const valid = await api(request(`${base}/data/notes`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { note: 'Theo brings Pie' },
  }));
  assert.equal(valid.status, 201);
  assert.equal((await valid.json()).note, 'Theo brings Pie');

  const spoofed = await api(request(`${base}/data/notes`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { note: 'Rosa brings Cake' },
  }));
  assert.equal(spoofed.status, 400);
});

test('API matches either of two actions that add to the same collection', async () => {
  const source = `puppet "Two actions" version "0.2"
data attendees {
  fields: [who]
}
screen "Home" {
  field "Who"
  button "Join myself" -> adds to attendees { who: "{me.name}" }
  button "Add a guest" -> adds to attendees { who: "{form.Who}" }
}`;
  const api = makeApi({ source });
  const base = `/api/app/${APP_ID}`;
  await api(request(`${base}/current`, { user: 'theo:Theo' }));

  const self = await api(request(`${base}/data/attendees`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { who: 'Theo' },
  }));
  assert.equal(self.status, 201);
  assert.equal((await self.json()).who, 'Theo');

  const guest = await api(request(`${base}/data/attendees`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { who: 'Rosa' },
  }));
  assert.equal(guest.status, 201);
  assert.equal((await guest.json()).who, 'Rosa');
});

test('API rejects a client value that differs from an action literal', async () => {
  const source = `puppet "Literal template" version "0.2"
data tasks {
  fields: [status]
}
screen "Home" {
  button "Add task" -> adds to tasks { status: "pending" }
}`;
  const api = makeApi({ source });
  const base = `/api/app/${APP_ID}`;
  await api(request(`${base}/current`, { user: 'theo:Theo' }));

  const response = await api(request(`${base}/data/tasks`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { status: 'approved' },
  }));
  assert.equal(response.status, 400);
});

test('API finds adds-to actions inside dialogs and nested list items', async () => {
  const source = `puppet "Nested actions" version "0.2"
data entries {
  fields: [name, dish]
}
screen "Home" {
  list "Entries" from entries {
    button "Join" -> adds to entries { name: "{me.name}" }
  }
}
dialog "Add dish" {
  field "Dish"
  button "Save" -> adds to entries { dish: "{form.Dish}" }
}`;
  const api = makeApi({ source });
  const base = `/api/app/${APP_ID}`;
  await api(request(`${base}/current`, { user: 'theo:Theo' }));

  const spoofed = await api(request(`${base}/data/entries`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { name: 'Rosa' },
  }));
  assert.equal(spoofed.status, 400);

  const nested = await api(request(`${base}/data/entries`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { name: 'Theo' },
  }));
  assert.equal(nested.status, 201);

  const dialog = await api(request(`${base}/data/entries`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { dish: 'Pie' },
  }));
  assert.equal(dialog.status, 201);
});

test('API rejects fields not declared by the live description before storage', async () => {
  const apps = { [APP_ID]: { hostId: HOST_ID, publicRead: false } };
  const backing = createMemoryStore(apps);
  let addCalled = false;
  const store = new Proxy(backing, {
    get(target, property) {
      if (property === 'add') {
        return async () => {
          addCalled = true;
          return { id: 'should-not-be-stored' };
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const api = makeApi({ source: SUNDAY_SUPPER_SOURCE, store });
  const base = `/api/app/${APP_ID}`;
  await api(request(`${base}/current`, { user: 'theo:Theo' }));

  const response = await api(request(`${base}/data/seats`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { name: 'Theo', admin: true },
  }));

  assert.equal(response.status, 400);
  assert.equal(addCalled, false);
});

test('host reads feedback from storage with the verified author', async () => {
  const api = makeApi();
  const base = `/api/app/${APP_ID}`;
  const filed = await api(request(`${base}/feedback`, {
    method: 'POST',
    user: 'theo:Theo',
    body: { text: 'More pie, please', page: 'Next supper' },
  }));
  assert.equal(filed.status, 201);

  assert.equal(
    (await api(request(`${base}/feedback`, { user: 'theo:Theo' }))).status,
    403,
  );
  const response = await api(request(`${base}/feedback`, { user: 'rosa:Rosa' }));
  assert.equal(response.status, 200);
  assert.deepEqual(
    (await response.json()).map(({ text, author }) => ({ text, author })),
    [{
      text: 'More pie, please',
      author: { id: 'theo', name: 'Theo' },
    }],
  );
});

test('local feedback chip uses the app identity-header hook', async () => {
  const app = await readFile(new URL('../site/public/app.js', import.meta.url), 'utf8');
  const chip = await readFile(
    new URL('../site/public/vendor/soma-feedback/soma-feedback.js', import.meta.url),
    'utf8',
  );

  assert.match(app, /window\.somaFeedbackHeaders\s*=/);
  assert.match(chip, /window\.somaFeedbackHeaders/);
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
