// Puppet v0.4: row screens, drawn dialogs, read: private, the token check, and
// Stage Read's server checks. Each server refusal is also broken on purpose by
// scripts/mutation-check.mjs, and these tests must notice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { blobCounters, createApiHandler } from '../site/functions/api.mjs';
import { createIdentityVerifier } from '../site/lib/auth.mjs';
import { createStageReader } from '../../soma-play/server/stage-read.js';
import { BlobsStore } from '../src/blobs-store.js';
import { guestSource, parse, walk } from '../src/parser.js';
import { createMemoryStore } from '../src/store.js';

const APP_ID = 'monologues';
const HOST = 'rosa:Rosa';
const THEO = 'theo:Theo';
const ANA = 'ana:Ana';
const base = `/api/app/${APP_ID}`;
const SOURCE = await readFile(new URL('../examples/monologues.puppet', import.meta.url), 'utf8');
const SCENE = 'THEO: I came back for the letter.\nANA\n(quietly)\nThen take it and go.\n(He takes it.)';

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

// A Blobs store with etags, like deployed Netlify Blobs.
function fakeBlobs() {
  const values = new Map();
  let etag = 0;
  return {
    values,
    async get(key, { type } = {}) {
      const entry = values.get(key);
      if (!entry) return null;
      return type === 'json' ? structuredClone(entry.value) : entry.value;
    },
    async getWithMetadata(key) {
      const entry = values.get(key);
      return entry ? { data: structuredClone(entry.value), etag: entry.etag } : null;
    },
    async setJSON(key, value, { onlyIfMatch, onlyIfNew } = {}) {
      const entry = values.get(key);
      if (onlyIfNew && entry) return { modified: false };
      if (onlyIfMatch && entry?.etag !== onlyIfMatch) return { modified: false };
      values.set(key, { value: structuredClone(value), etag: `e${++etag}` });
      return { modified: true };
    },
    async set(key, value) {
      values.set(key, { value, etag: `e${++etag}` });
    },
  };
}

function makeApi({ source = SOURCE, store, publicRead = true, speakCalls = [], limits } = {}) {
  const apps = { [APP_ID]: { hostId: 'rosa', publicRead } };
  const backing = store ?? createMemoryStore(apps);
  const stageReader = createStageReader({
    apiKey: 'test-key',
    store: blobCounters(fakeBlobs()),
    limits: limits ?? { perLine: 600, perPerson: 3000, perApp: 8000, linesPerPerson: 400 },
    fetch: async (url, init) => {
      speakCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    },
  });
  const api = createApiHandler({
    apps,
    store: backing,
    verifyIdentity: createIdentityVerifier({ env: { NETLIFY_DEV: 'true' } }),
    readSeed: async () => source,
    feedbackStore: {},
    stageReader,
  });
  return {
    store: backing,
    async raw(path, options) {
      return api(request(`${base}/${path}`, options));
    },
    async call(path, options) {
      const response = await api(request(`${base}/${path}`, options));
      const type = response.headers.get('content-type') ?? '';
      return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : await response.arrayBuffer() };
    },
  };
}

const addPiece = (api, user, title, text = SCENE) =>
  api.call('data/pieces', { method: 'POST', user, body: { title, play: '', text } });

// ---------- the grammar ----------

test('the v0.4 example parses, binds its row screen, and needs no warnings', () => {
  const { sketch, errors, warnings } = parse(SOURCE);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  const piece = sketch.screens.find(({ name }) => name === 'Piece');
  assert.equal(piece.from, 'pieces');
  assert.equal(sketch.data.pieces.read, 'private');
  const read = walk(piece.children).find(({ kind }) => kind === 'stage-read');
  assert.equal(read.field, 'text');
  assert.equal(walk(piece.children).find(({ kind }) => kind === 'button').rowOf, 'pieces');
});

const v04 = (body, data = 'data notes {\n  fields: [title, text]\n  read: private\n}') =>
  `puppet "X" version "0.4"\n${data}\nscreen "Home" {\n  list "Notes" from notes -> opens screen "Note"\n}\n${body}`;
const errorsOf = (source) => parse(source).errors.map(({ message }) => message);

test('v0.4 refuses each misuse with a plain message', () => {
  const note = 'screen "Note" from notes {\n  text "{row.title}"\n}';
  const cases = [
    [`puppet "X" version "0.4"\ndata notes {\n  fields: [t]\n}\nscreen "Note" from notes {\n  text "x"\n}`, /cannot be where the app opens/],
    [v04('screen "Other" from notes {\n  text "x"\n}'), /Nothing opens screen "Other"/],
    [v04(`${note}\nscreen "Extra" {\n  button "Go" -> opens screen "Note"\n}`), /open it from a list or table of notes/],
    [v04(`${note}\nscreen "Help" {\n  button "Go" -> opens dialog "D"\n}\ndialog "D" {\n  text "{row.title}"\n}`), /works only on a screen from data/],
    [v04('screen "Note" from notes {\n  text "{row.colour}"\n}'), /notes has no field colour/],
    [v04('screen "Note" from notes {\n  field "T"\n  button "Copy" -> adds to notes { title: "{row.title}" }\n}'), /may not go in an adds to/],
    [v04('screen "Note" from notes {\n  stage-read "{row.text} aloud"\n}'), /stage-read reads one field of a row/],
    [v04(`${note}\nscreen "Loose" {\n  stage-read "{row.text}"\n}`), /stage-read reads one field of a row/],
    [v04('screen "Note" from notes {\n  play-view\n}'), /play-view needs its text in quotes/],
    [v04(note, 'data notes {\n  fields: [title, text, status]\n  read: private\n}'), /the host cannot read the rows a status would decide/],
    [v04(`${note}\nscreen "Last" {\n  text "Last synced {last_synced}"\n}`), /\{last_synced\} will not be filled in/],
    [v04(`${note}\nscreen "Last" {\n  field "Name {me.name}"\n}`), /A field's label is shown as written/],
    [v04(`${note}\nscreen "Last" {\n  button "Go" -> adds to notes { title: "{play}" }\n}`), /\{play\} will not be filled in/],
    [v04(`${note}\nscreen "Last" {\n  button "Go" -> toast "Hello {form.Missing}"\n}`), /\{form.Missing\} will not be filled in/],
    [`puppet "X" version "0.4"\ndata notes {\n  fields: [title]\n  read: private\n}\nscreen "Home" {\n  text "x"\n}\nscreen "Mine" {\n  requires: host\n  list "Notes" from notes -> opens screen "Note"\n}\nscreen "Note" from notes {\n  text "{row.title}"\n}`, /Screen "Note" is sent to everyone; add requires: host/],
  ];
  for (const [source, pattern] of cases) {
    assert.ok(errorsOf(source).some((message) => pattern.test(message)), `${pattern}: ${JSON.stringify(errorsOf(source))}`);
  }
});

test('an unfillable token is a warning in v0.3 and v0.2 and ignored in a v0.1 sketch', () => {
  const body = (version) => `puppet "X" version "${version}"\nstate "play" {\n  where: memory\n}\nscreen "Home" {\n  hero { title: "{play}" }\n}`;
  assert.deepEqual(parse(body('0.4')).errors.map(({ message }) => message), ['{play} will not be filled in: this runtime fills only {me.name}, {Name.count}, {form.Label} and {row.field}']);
  for (const version of ['0.3', '0.2']) {
    assert.deepEqual(parse(body(version)).errors, []);
    assert.ok(parse(body(version)).warnings.some(({ message }) => /\{play\} will not be filled in/.test(message)));
  }
  assert.deepEqual(parse(body('0.1')).warnings.filter(({ message }) => /filled in/.test(message)), []);
});

test('guests receive a row screen and its data, and a host-only row screen not at all', () => {
  assert.match(guestSource(SOURCE), /screen "Piece" from pieces/);
  const hostOnly = `puppet "X" version "0.4"\ndata notes {\n  fields: [title]\n  read: private\n}\nscreen "Home" {\n  text "x"\n}\nscreen "Mine" {\n  requires: host\n  list "Notes" from notes -> opens screen "Note"\n}\nscreen "Note" from notes {\n  requires: host\n  text "{row.title}"\n}`;
  assert.deepEqual(parse(hostOnly).errors, []);
  const guest = guestSource(hostOnly);
  assert.equal(guest.includes('screen "Note"'), false);
  assert.equal(guest.includes('data notes'), false);
});

// ---------- read: private ----------

test('each person, the host included, reads only the private rows they added', async () => {
  const api = makeApi();
  await api.call('current', { user: HOST });
  for (const [user, title] of [[THEO, 'Hamlet'], [ANA, 'Medea'], [HOST, 'Lear']]) {
    assert.equal((await addPiece(api, user, title)).status, 201);
  }
  for (const [user, title] of [[THEO, 'Hamlet'], [ANA, 'Medea'], [HOST, 'Lear']]) {
    assert.deepEqual((await api.call('data/pieces', { user })).body.map((row) => row.title), [title]);
  }
  assert.equal((await api.call('data/pieces')).status, 401, 'no rows to someone not signed in, even with publicRead');
});

test('a private row is removed only by its author, and answers like a missing row to anyone else', async () => {
  const api = makeApi();
  await api.call('current', { user: HOST });
  const { body: piece } = await addPiece(api, THEO, 'Hamlet');
  const host = await api.call(`data/pieces/${piece.id}`, { method: 'DELETE', user: HOST });
  const ana = await api.call(`data/pieces/${piece.id}`, { method: 'DELETE', user: ANA });
  const missing = await api.call('data/pieces/r-nope', { method: 'DELETE', user: ANA });
  assert.equal(host.status, 404);
  assert.deepEqual(host.body, { error: `Unknown row: ${piece.id}` });
  assert.equal(ana.status, 404);
  assert.equal(missing.status, 404);
  assert.equal((await api.call(`data/pieces/${piece.id}`, { method: 'DELETE', user: THEO })).status, 200);
});

test('privacy tightens from read: own to read: private and stays there', async () => {
  const apps = { [APP_ID]: { hostId: 'rosa' } };
  for (const store of [createMemoryStore(apps), new BlobsStore(apps, { blobStore: fakeBlobs() })]) {
    const api = makeApi({ store });
    await api.call('current', { user: HOST });
    await addPiece(api, THEO, 'Hamlet');
    const shared = SOURCE.replace('  read: private\n', '  read: own\n');
    const { body: { versionId } } = await api.call('propose', { method: 'POST', user: HOST, body: { source: shared } });
    assert.equal((await api.call('approve', { method: 'POST', user: HOST, body: { versionId } })).status, 200);
    assert.deepEqual((await api.call('data/pieces', { user: HOST })).body, [], 'the host still reads none of Theo\'s rows');
    assert.deepEqual(await store.privacyLevels(APP_ID), { pieces: 'private' });
  }
});

// ---------- Stage Read ----------

test('Stage Read speaks a line of a row the reader may read, and nothing else', async () => {
  const speakCalls = [];
  const api = makeApi({ speakCalls });
  await api.call('current', { user: HOST });
  const { body: theo } = await addPiece(api, THEO, 'Hamlet');
  const { body: ana } = await addPiece(api, ANA, 'Medea');
  const ask = (user, body) => api.call('stage-read', { method: 'POST', user, body: { data: 'pieces', field: 'text', line: 0, ...body } });

  assert.equal((await ask(undefined, { rowId: theo.id })).status, 401);
  const spoken = await ask(THEO, { rowId: theo.id });
  assert.equal(spoken.status, 200);
  assert.equal(spoken.headers.get('content-type'), 'audio/mpeg');
  assert.equal(spoken.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(speakCalls.map(({ body }) => body.text), ['I came back for the letter.']);

  const foreign = await ask(THEO, { rowId: ana.id });
  const missing = await ask(THEO, { rowId: 'r-nope' });
  assert.equal(foreign.status, 404);
  assert.deepEqual(foreign.body, { error: `Unknown row: ${ana.id}` });
  assert.equal(missing.status, 404);
  assert.equal((await ask(HOST, { rowId: theo.id })).status, 404, 'the host may not hear a private row');
  assert.equal((await ask(THEO, { rowId: theo.id, field: 'title' })).status, 404, 'no stage-read reads the title');
  assert.equal((await ask(THEO, { rowId: theo.id, line: 7 })).status, 404);
  assert.equal((await ask(THEO, { rowId: theo.id, line: 1 })).status, 200);
  assert.deepEqual(speakCalls.map(({ body }) => body.text), ['I came back for the letter.', 'Then take it and go.'], 'parentheticals and directions are not spoken');
  assert.equal(speakCalls.length, 2);

  const again = await ask(THEO, { rowId: theo.id });
  assert.equal(again.headers.get('x-stage-read-cached'), 'yes');
  assert.equal(speakCalls.length, 2, 'a line already spoken for this person is replayed from the cache');
});

test('Stage Read needs sign-in even for rows everyone may read', async () => {
  const source = `puppet "X" version "0.4"\ndata notes {\n  fields: [text]\n}\nscreen "Home" {\n  list "Notes" from notes -> opens screen "Note"\n  field "Text"\n  button "Add" -> adds to notes { text: "{form.Text}" }\n}\nscreen "Note" from notes {\n  stage-read "{row.text}"\n}`;
  const speakCalls = [];
  const api = makeApi({ source, speakCalls });
  await api.call('current', { user: HOST });
  const { body: row } = await api.call('data/notes', { method: 'POST', user: THEO, body: { text: SCENE } });
  assert.equal((await api.call('data/notes')).status, 200, 'the rows themselves are public');
  const body = { data: 'notes', rowId: row.id, field: 'text', line: 0 };
  assert.equal((await api.call('stage-read', { method: 'POST', body })).status, 401);
  assert.equal(speakCalls.length, 0);
  assert.equal((await api.call('stage-read', { method: 'POST', user: ANA, body })).status, 200);
});

test('Stage Read on a host-only screen is the host\'s alone', async () => {
  const source = `puppet "X" version "0.4"\ndata notes {\n  fields: [title, text]\n  read: own\n}\nscreen "Home" {\n  field "Text"\n  button "Add" -> adds to notes { text: "{form.Text}" }\n}\nscreen "Mine" {\n  requires: host\n  list "Notes" from notes -> opens screen "Note"\n}\nscreen "Note" from notes {\n  requires: host\n  stage-read "{row.text}"\n}`;
  const api = makeApi({ source });
  await api.call('current', { user: HOST });
  const { body: row } = await api.call('data/notes', { method: 'POST', user: THEO, body: { text: SCENE } });
  const body = { data: 'notes', rowId: row.id, field: 'text', line: 0 };
  assert.equal((await api.call('stage-read', { method: 'POST', user: THEO, body })).status, 404);
  assert.equal((await api.call('stage-read', { method: 'POST', user: HOST, body })).status, 200);
});

function memoryCounters() {
  return blobCounters(fakeBlobs());
}

test('the spend check reserves characters before speaking and gives them back on failure', async () => {
  let calls = 0;
  let fail = false;
  const store = memoryCounters();
  const speak = createStageReader({
    apiKey: 'k',
    store,
    limits: { perLine: 40, perPerson: 60, perApp: 85, linesPerPerson: 6 },
    fetch: async () => {
      calls += 1;
      return fail ? new Response('no', { status: 500 }) : new Response(new Uint8Array([7]));
    },
  });
  const say = (who, words, line = 0) => speak({ who, scope: 'app', text: `SAM: ${words}`, line });
  assert.equal((await say('a', 'x'.repeat(41))).status, 413, 'a line over the per-line limit');
  assert.equal((await say('a', 'y'.repeat(35))).status, 200);
  assert.equal((await say('a', 'z'.repeat(30))).status, 402, 'the person\'s allowance');
  assert.equal((await say('b', 'w'.repeat(35))).status, 200);
  assert.equal((await say('c', 'v'.repeat(30))).status, 402, 'the app\'s allowance');
  assert.equal(calls, 2);
  fail = true;
  assert.equal((await say('d', 'u'.repeat(10))).status, 502);
  fail = false;
  assert.equal((await say('d', 'u'.repeat(10))).status, 200, 'a failed call gave its characters back');
  for (let index = 0; index < 4; index += 1) await say('d', 'u'.repeat(10));
  assert.equal((await say('d', 'u'.repeat(10))).status, 429, 'lines per person per day, cached or not');
  assert.equal((await say('a', 'q', 3)).status, 404);
});

test('parallel lines cannot all pass one allowance', async () => {
  const blobs = fakeBlobs();
  const store = blobCounters(blobs);
  const results = await Promise.all(Array.from({ length: 12 }, () => store.reserve('k', 10, 50)));
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal((await blobs.getWithMetadata('k')).data, 50);
});

test('one person\'s audio cache never answers for another person', async () => {
  let calls = 0;
  const speak = createStageReader({
    apiKey: 'k',
    store: memoryCounters(),
    fetch: async () => { calls += 1; return new Response(new Uint8Array([1])); },
  });
  await speak({ who: 'a', text: 'SAM: Secret words.', line: 0 });
  const other = await speak({ who: 'b', text: 'SAM: Secret words.', line: 0 });
  assert.equal(other.headers['x-stage-read-cached'], 'no');
  assert.equal(calls, 2);
});

test('a private row needs a visible removes from, even for the host', async () => {
  const source = SOURCE.replace('  button "Delete this piece" @danger -> removes from pieces\n', '');
  const api = makeApi({ source });
  await api.call('current', { user: HOST });
  const { body: mine } = await addPiece(api, HOST, 'Lear');
  assert.equal((await api.call(`data/pieces/${mine.id}`, { method: 'DELETE', user: HOST })).status, 403);
});
