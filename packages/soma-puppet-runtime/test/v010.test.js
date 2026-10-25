// Puppet v0.10: doc-import (a play from a Google Doc, the Doc holding the pen), play-print, and
// versions compared by their parts. Each server rule is also broken on purpose by
// scripts/mutation-check.mjs, and these tests must notice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { checkPull, createApiHandler } from '../site/functions/api.mjs';
import { createIdentityVerifier } from '../site/lib/auth.mjs';
import { BlobsStore } from '../src/blobs-store.js';
import { guestSource, parse } from '../src/parser.js';
import { createMemoryStore } from '../src/store.js';

const APP_ID = 'table-read';
const HOST = 'rosa:Rosa';
const THEO = 'theo:Theo';
const ANA = 'ana:Ana';
const base = `/api/app/${APP_ID}`;
const SOURCE = await readFile(new URL('../examples/table-read.puppet', import.meta.url), 'utf8');
const DOC = { id: 'docTheo_1234567890', name: 'Witness Projection' };
const SCENES = [
  { act: 'ACT ONE', title: 'SCENE ONE', text: 'ACT ONE\n\nSCENE ONE\n\nOLDER ERIC\nKeep your voice down.' },
  { act: 'ACT ONE', title: 'SCENE TWO', text: 'SCENE TWO\n\nIZZY\nThen read it to me.' },
];

// The same app plus the ways a row could be changed in the app, to prove the pen holds on each.
const WITH_EDITS = SOURCE.replace(
  '  play-print "{row.text}"\n}',
  '  play-print "{row.text}"\n  script-editor "{row.text}"\n  button "Remove" -> removes from scenes\n}',
).replace(
  '  play-print from scenes\n}',
  '  play-print from scenes\n  field "Title"\n  field "Text"\n  button "Add a scene" -> adds to scenes { title: "{form.Title}", text: "{form.Text}" }\n}',
);

function fakeBlobs() {
  const values = new Map();
  let etag = 0;
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key).value) : null; },
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
  };
}

function makeApi({ source = SOURCE, store, publicRead = true } = {}) {
  const apps = { [APP_ID]: { hostId: 'rosa', publicRead } };
  const api = createApiHandler({
    apps,
    store: store ?? createMemoryStore(apps),
    verifyIdentity: createIdentityVerifier({ env: { NETLIFY_DEV: 'true' } }),
    readSeed: async () => source,
    feedbackStore: {},
  });
  return async (path, { method = 'GET', user, body } = {}) => {
    const response = await api(new Request(`http://localhost${base}/${path}`, {
      method,
      headers: { ...(user ? { 'x-dev-user': user } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }));
    return { status: response.status, body: await response.json().catch(() => null) };
  };
}

const pull = (call, user, { doc = DOC, scenes = SCENES } = {}) =>
  call('doc-import', { method: 'POST', user, body: { data: 'scenes', doc, scenes } });

// ---------- the grammar ----------

test('the v0.10 example parses, and guests receive it unchanged', () => {
  const { errors, warnings, sketch } = parse(SOURCE);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(guestSource(SOURCE), SOURCE);
  const home = sketch.screens[0];
  assert.equal(home.children.find(({ kind }) => kind === 'doc-import').into, 'scenes');
  assert.equal(home.children.find(({ kind }) => kind === 'play-print').from, 'scenes');
  assert.equal(sketch.screens[1].children.find(({ kind }) => kind === 'play-print').field, 'text');
});

test('versions compare by their parts: 0.10 comes after 0.9', () => {
  const v = (version) => SOURCE.replace('version "0.10"', `version "${version}"`);
  assert.deepEqual(parse(v('0.10')).errors, []);
  assert.deepEqual(parse(v('0.10.1')).errors, []);
  assert.ok(parse(v('0.9')).errors.some(({ message }) => /doc-import is a Puppet v0.10 element/.test(message)));
  assert.ok(parse(v('0.1')).errors.some(({ message }) => /doc-import is a Puppet v0.10 element/.test(message)));
  // The token check (from 0.4) still holds at 0.10: "0.10" is not read as 0.1.
  const token = v('0.10').replace('"{scenes.count} scenes"', '"{play}"');
  assert.ok(parse(token).errors.some(({ message }) => /\{play\} will not be filled in/.test(message)));
});

const errorsOf = (source) => parse(source).errors.map(({ message }) => message);
const app = (body, data = 'data scenes {\n  fields: [title, text]\n  read: private\n}') =>
  `puppet "X" version "0.10"\n${data}\nscreen "Home" {\n  list "Scenes" from scenes -> opens screen "Scene"\n}\nscreen "Scene" from scenes {\n  play-view "{row.text}"\n}\n${body}`;

test('v0.10 refuses each misuse with a plain message', () => {
  const cases = [
    [app('screen "Bring" {\n  doc-import into scenes\n}', 'data scenes {\n  fields: [title, text]\n  read: own\n}'), /scenes must say read: private/],
    [app('screen "Bring" {\n  doc-import into scenes\n}', 'data scenes {\n  fields: [title, text, notes]\n  read: private\n}'), /must be exactly \[title, text\] or \[title, text, act\]/],
    [app('screen "Bring" {\n  doc-import\n}'), /Name the data the scenes go into/],
    [app('screen "Bring" {\n  doc-import into plays\n}'), /plays is not declared data/],
    [app('screen "Bring" {\n  doc-import "My Doc" into scenes\n}'), /doc-import takes no text in quotes/],
    [app('').replace('  play-view "{row.text}"\n', '  play-view "{row.text}"\n  doc-import into scenes\n'), /goes on a screen that is not from data/],
    [app('screen "Print" {\n  play-print "{row.text}"\n}'), /play-print prints one field of a row/],
    [app('').replace('  play-view "{row.text}"\n', '  play-view "{row.text}"\n  play-print "Scene: {row.text}"\n'), /play-print prints one field of a row/],
    [app('screen "Print" {\n  play-print from notes\n}\ndata notes {\n  fields: [title]\n}'), /needs a text field/],
  ];
  for (const [source, pattern] of cases) {
    assert.ok(errorsOf(source).some((message) => pattern.test(message)), `${pattern}: ${JSON.stringify(errorsOf(source))}`);
  }
});

// ---------- doc-import on the server ----------

test('a pull stores the scenes as the writer\'s own private rows, in the Doc\'s order', async () => {
  for (const store of [createMemoryStore({ [APP_ID]: { hostId: 'rosa' } }), new BlobsStore({ [APP_ID]: { hostId: 'rosa' } }, { blobStore: fakeBlobs() })]) {
    const call = makeApi({ store });
    await call('current', { user: THEO });
    const done = await pull(call, THEO);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.deepEqual({ ...done.body, pulledAt: 'x' }, { id: DOC.id, name: DOC.name, pulledAt: 'x', scenes: 2 });
    const theo = (await call('data/scenes', { user: THEO })).body;
    assert.deepEqual(theo.map(({ title }) => title), ['SCENE ONE', 'SCENE TWO']);
    assert.ok(theo.every(({ id }) => /^r-[0-9a-f-]{36}$/.test(id)), 'unguessable ids');
    assert.deepEqual((await call('data/scenes', { user: HOST })).body, [], 'not even the host reads them');
    assert.deepEqual((await call('data/scenes', { user: ANA })).body, []);
    assert.equal((await call('data/scenes')).status, 401, 'nothing for someone not signed in, even with publicRead');
  }
});

test('each pull replaces only this writer\'s Doc rows; typed rows and other writers stay', async () => {
  const call = makeApi({ source: WITH_EDITS });
  await call('current', { user: THEO });
  assert.equal((await call('data/scenes', { method: 'POST', user: THEO, body: { title: 'Notes', text: 'A note to self.' } })).status, 201);
  await pull(call, THEO);
  await pull(call, ANA, { doc: { id: 'docAna_1234567890', name: 'Medea' }, scenes: [{ title: 'ONE', text: 'MEDEA\nNo.' }] });
  await pull(call, THEO, { doc: { id: 'docTheo_other_doc', name: 'A new draft' }, scenes: [{ title: 'ONLY', text: 'SAM\nHello.' }] });
  assert.deepEqual((await call('data/scenes', { user: THEO })).body.map(({ title }) => title), ['Notes', 'ONLY'],
    'a pull from a different Doc replaces every earlier Doc row of this writer, and keeps what they typed');
  assert.deepEqual((await call('data/scenes', { user: ANA })).body.map(({ title }) => title), ['ONE']);
  assert.deepEqual((await call('doc-import/scenes', { user: THEO })).body.name, 'A new draft');
  assert.deepEqual((await call('doc-import/scenes', { user: ANA })).body.name, 'Medea');
  assert.equal((await call('doc-import/scenes', { user: HOST })).body, null, 'the host has no pull of their own');
});

test('the Doc holds the pen: a Doc row is never edited or removed in the app, by anyone', async () => {
  const call = makeApi({ source: WITH_EDITS });
  await call('current', { user: THEO });
  await pull(call, THEO);
  const [row] = (await call('data/scenes', { user: THEO })).body;
  const edit = await call(`data/scenes/${row.id}`, { method: 'PUT', user: THEO, body: { field: 'text', value: 'Changed here' } });
  assert.equal(edit.status, 409);
  assert.match(edit.body.error, /comes from your Google Doc/);
  const remove = await call(`data/scenes/${row.id}`, { method: 'DELETE', user: THEO });
  assert.equal(remove.status, 409);
  assert.equal((await call(`data/scenes/${row.id}`, { method: 'DELETE', user: HOST })).status, 404, 'others get the answer for a missing row');
  // A row the writer typed in the app is still theirs to change.
  const { body: typed } = await call('data/scenes', { method: 'POST', user: THEO, body: { title: 'Mine', text: 'Typed.' } });
  assert.equal((await call(`data/scenes/${typed.id}`, { method: 'PUT', user: THEO, body: { field: 'text', value: 'Retyped.' } })).status, 200);
});

test('a pull is refused unless a doc-import into that data is on a screen the reader can see', async () => {
  const hostOnly = SOURCE.replace('screen "My play" {\n', 'screen "Home" {\n  text "Hello"\n}\n\nscreen "My play" {\n  requires: host\n')
    .replace('screen "Scene" from scenes {\n', 'screen "Scene" from scenes {\n  requires: host\n');
  assert.deepEqual(parse(hostOnly).errors, []);
  const call = makeApi({ source: hostOnly });
  await call('current', { user: HOST });
  assert.equal((await pull(call, THEO)).status, 404);
  assert.equal((await call('doc-import/scenes', { user: THEO })).status, 404);
  assert.equal((await pull(call, HOST)).status, 200);
  assert.equal((await pull(makeApi(), undefined)).status, 401);
  const other = makeApi();
  await other('current', { user: THEO });
  const wrong = await other('doc-import', { method: 'POST', user: THEO, body: { data: 'plays', doc: DOC, scenes: SCENES } });
  assert.equal(wrong.status, 404);
});

test('a pull body is checked whole: shape, Doc id, and every size limit', () => {
  const ok = { data: 'scenes', doc: DOC, scenes: SCENES };
  assert.deepEqual(checkPull(ok).scenes.length, 2);
  const refuse = (body, pattern) => assert.throws(() => checkPull(body), pattern);
  refuse({ ...ok, author: 'rosa' }, /exactly \{ data, doc/);
  refuse({ ...ok, doc: { ...DOC, owner: 'x' } }, /doc must be exactly/);
  refuse({ ...ok, doc: { ...DOC, id: '../../etc' } }, /not a Google Doc id/);
  refuse({ ...ok, doc: { ...DOC, id: 'short' } }, /not a Google Doc id/);
  refuse({ ...ok, doc: { ...DOC, name: 'n'.repeat(301) } }, /Doc name may be at most 300/);
  refuse({ ...ok, scenes: [] }, /1 to 300 scenes/);
  refuse({ ...ok, scenes: Array.from({ length: 301 }, () => ({ title: 't', text: 'x' })) }, /1 to 300 scenes/);
  refuse({ ...ok, scenes: [{ title: 't', text: 'x', id: 'r1' }] }, /Each scene is/);
  refuse({ ...ok, scenes: [{ title: 't'.repeat(301), text: 'x' }] }, /title may be at most 300/);
  refuse({ ...ok, scenes: [{ title: 't', text: 'x', act: 'a'.repeat(101) }] }, /act is text of at most 100/);
  refuse({ ...ok, scenes: [{ title: 't', text: 'x'.repeat(40001) }] }, /at most 40000 characters/);
  refuse({ ...ok, scenes: Array.from({ length: 13 }, () => ({ title: 't', text: 'x'.repeat(40000) })) }, /at most 500000 characters in all/);
});

test('a scene may carry only fields the data declares', async () => {
  const noAct = SOURCE.replace('fields: [act, title, text]', 'fields: [title, text]').replace('subtitle: "{row.act}" ', '');
  assert.deepEqual(parse(noAct).errors, []);
  const call = makeApi({ source: noAct });
  await call('current', { user: THEO });
  const result = await pull(call, THEO);
  assert.equal(result.status, 400);
  assert.match(result.body.error, /scenes has no field act/);
});
