// Puppet v0.5 (VideoMaker): video-view, video-read and script-editor. The grammar, the server's
// checks on an edit and on the narration read, and the renderer on a fake DOM. Each server refusal
// is also broken on purpose by scripts/mutation-check.mjs, and these tests must notice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { blobCounters, createApiHandler, MAX_EDIT_LENGTH } from '../site/functions/api.mjs';
import { createIdentityVerifier } from '../site/lib/auth.mjs';
import { createVideoReader } from '../../soma-video/server/video-read.js';
import { mountVideoView } from '../../soma-video/src/video-view.js';
import { BlobsStore } from '../src/blobs-store.js';
import { parse, walk } from '../src/parser.js';
import { render } from '../src/render.js';
import { createMemoryStore } from '../src/store.js';
import { flush, mount } from './fake-dom.js';

const APP_ID = 'videomaker';
const HOST = 'rosa:Rosa';
const THEO = 'theo:Theo';
const base = `/api/app/${APP_ID}`;
const SOURCE = await readFile(new URL('../examples/videomaker.puppet', import.meta.url), 'utf8');
const SCRIPT = 'Title: Gig\n\nCAST\nCLAUDE: Chris\nSUNO: Charlie\n\n.THE SONG\n\nCARD title\n# Gig\n\nCLAUDE\nI am Claude.\n\nSUNO\nI am Suno.';

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

function makeApi({ source = SOURCE, store, speakCalls = [] } = {}) {
  const apps = { [APP_ID]: { hostId: 'rosa', publicRead: true } };
  const backing = store ?? createMemoryStore(apps);
  const videoReader = createVideoReader({
    apiKey: 'test-key',
    store: blobCounters(fakeBlobs()),
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
    videoReader,
  });
  return {
    async call(path, options) {
      const response = await api(request(`${base}/${path}`, options));
      const type = response.headers.get('content-type') ?? '';
      return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : await response.arrayBuffer() };
    },
  };
}

// The first request seeds the app from its description, as on the live site.
const addScript = async (api, user, title, text = SCRIPT) => {
  await api.call('current', { user: HOST });
  return api.call('data/scripts', { method: 'POST', user, body: { title, logline: '', text } });
};
const edit = (api, user, rowId, body) => api.call(`data/scripts/${rowId}`, { method: 'PUT', user, body });

// ---------- the grammar ----------

test('the VideoMaker description parses with no warnings and binds its v0.5 elements', () => {
  const { sketch, errors, warnings } = parse(SOURCE);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  const screen = sketch.screens.find(({ name }) => name === 'Script');
  const kinds = walk(screen.children).filter(({ kind }) => ['video-view', 'video-read', 'script-editor'].includes(kind));
  assert.deepEqual(kinds.map(({ kind, field }) => [kind, field]), [['video-read', 'text'], ['script-editor', 'text'], ['video-view', undefined]]);
});

const v05 = (body, version = '0.5') =>
  `puppet "X" version "${version}"\ndata notes {\n  fields: [title, text]\n  read: private\n}\nscreen "Home" {\n  list "Notes" from notes -> opens screen "Note"\n}\n${body}`;
const errorsOf = (source) => parse(source).errors.map(({ message }) => message);

test('v0.5 refuses each misuse with a plain message', () => {
  const cases = [
    [v05('screen "Note" from notes {\n  video-view "{row.text}"\n}', '0.4'), /video-view is a Puppet v0.5 element/],
    [v05('screen "Note" from notes {\n  script-editor "{row.text}"\n}', '0.4'), /script-editor is a Puppet v0.5 element/],
    [v05('screen "Note" from notes {\n  video-view\n}'), /video-view needs its text in quotes/],
    [v05('screen "Note" from notes {\n  video-read "{row.text} aloud"\n}'), /video-read works on one field of a row/],
    [v05('screen "Note" from notes {\n  text "x"\n}\nscreen "Loose" {\n  script-editor "{row.text}"\n}'), /script-editor works on one field of a row/],
  ];
  for (const [source, pattern] of cases) {
    assert.ok(errorsOf(source).some((message) => pattern.test(message)), `${pattern}: ${JSON.stringify(errorsOf(source))}`);
  }
  const status = `puppet "X" version "0.5"\ndata notes {\n  fields: [title, text, status]\n  read: own\n}\nscreen "Home" {\n  list "Notes" from notes -> opens screen "Note"\n}\nscreen "Note" from notes {\n  script-editor "{row.status}"\n}`;
  assert.ok(errorsOf(status).some((m) => /may not change status/.test(m)));
});

// ---------- editing ----------

for (const [name, makeStore] of [
  ['memory', () => undefined],
  ['blobs', () => new BlobsStore({ [APP_ID]: { hostId: 'rosa' } }, { blobStore: fakeBlobs() })],
]) {
  test(`the author edits their script and reads the change back (${name} store)`, async () => {
    const api = makeApi({ store: makeStore() });
    const added = await addScript(api, THEO, 'Gig');
    assert.equal(added.status, 201);
    const saved = await edit(api, THEO, added.body.id, { field: 'text', value: `${SCRIPT}\n\nCLAUDE\nOne more line.` });
    assert.equal(saved.status, 200);
    const rows = (await api.call('data/scripts', { user: THEO })).body;
    assert.match(rows[0].text, /One more line\.$/);
  });

  test(`nobody else edits a private script, the host included (${name} store)`, async () => {
    const api = makeApi({ store: makeStore() });
    const added = await addScript(api, THEO, 'Gig');
    for (const user of [HOST, 'ana:Ana']) {
      const out = await edit(api, user, added.body.id, { field: 'text', value: 'taken over' });
      assert.equal(out.status, 404, `${user}: ${JSON.stringify(out.body)}`);
    }
    assert.equal((await edit(api, undefined, added.body.id, { field: 'text', value: 'x' })).status, 401);
    const rows = (await api.call('data/scripts', { user: THEO })).body;
    assert.equal(rows[0].text, SCRIPT);
  });
}

test('an edit needs a script-editor of that field, a well-formed body, and a script under the limit', async () => {
  const api = makeApi();
  const added = await addScript(api, THEO, 'Gig');
  assert.equal((await edit(api, THEO, added.body.id, { field: 'title', value: 'Renamed' })).status, 403);
  assert.equal((await edit(api, THEO, added.body.id, { field: 'text', value: 'x', extra: 1 })).status, 400);
  assert.equal((await edit(api, THEO, added.body.id, { field: 'text', value: 7 })).status, 400);
  assert.equal((await edit(api, THEO, added.body.id, { field: 'text', value: 'x'.repeat(MAX_EDIT_LENGTH + 1) })).status, 413);
  assert.equal((await edit(api, THEO, added.body.id, { field: 'text', value: 'x'.repeat(MAX_EDIT_LENGTH) })).status, 200);
  assert.equal((await edit(api, THEO, 'r-missing', { field: 'text', value: 'x' })).status, 404);
});

test('in data everyone reads, only the author edits; others are told so', async () => {
  const source = SOURCE.replace('  read: private\n', '');
  const api = makeApi({ source });
  const added = await addScript(api, THEO, 'Gig');
  const out = await edit(api, 'ana:Ana', added.body.id, { field: 'text', value: 'x' });
  assert.equal(out.status, 403);
  assert.match(out.body.error, /Only the row author/);
  assert.equal((await edit(api, HOST, added.body.id, { field: 'text', value: 'x' })).status, 403);
});

// ---------- the narration read ----------

test('the narration read speaks a line in the CAST voice of a script the reader may read', async () => {
  const speakCalls = [];
  const api = makeApi({ speakCalls });
  const added = await addScript(api, THEO, 'Gig');
  const ok = await api.call('video-read', { method: 'POST', user: THEO, body: { data: 'scripts', rowId: added.body.id, field: 'text', line: 1 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('x-stage-read-voice'), 'Charlie');
  assert.equal(speakCalls[0].body.text, 'I am Suno.');
  const other = await api.call('video-read', { method: 'POST', user: 'ana:Ana', body: { data: 'scripts', rowId: added.body.id, field: 'text', line: 0 } });
  assert.equal(other.status, 404);
  const wrongField = await api.call('video-read', { method: 'POST', user: THEO, body: { data: 'scripts', rowId: added.body.id, field: 'title', line: 0 } });
  assert.equal(wrongField.status, 404);
  const stage = await api.call('stage-read', { method: 'POST', user: THEO, body: { data: 'scripts', rowId: added.body.id, field: 'text', line: 0 } });
  assert.equal(stage.status, 404, 'a video-read is not a stage-read');
  assert.equal(speakCalls.length, 1);
});

// ---------- the renderer ----------

const SKETCH = parse(SOURCE).sketch;
const ROWS = [{ id: 'r-1', title: 'Gig', logline: 'how it was made', text: SCRIPT }];
const rowsOf = (root) => root.querySelectorAll('.puppet-runtime-list-row');
const button = (root, text) => root.all().find((node) => node.tagName === 'BUTTON' && node.textContent === text);

test('the script screen draws the editor beside the AV script; typing redraws the view; Save sends an edit', async () => {
  const root = mount();
  const actions = [];
  const components = { 'video-view': (node, text) => mountVideoView(node, text, { document: root.ownerDocument }) };
  const draw = () => render(SKETCH, { root, data: { scripts: ROWS }, me: { name: 'Theo' }, components, onAction: (a) => actions.push(a) });
  draw();
  await rowsOf(root)[0].click();
  const view = root.querySelector('.soma-video');
  assert.match(view.textContent, /CLAUDE · Chris/);
  const area = root.all().find((node) => node.tagName === 'TEXTAREA' && node.className === 'puppet-runtime-script-text');
  assert.equal(area.value, SCRIPT);
  area.value = `${SCRIPT}\n\n.THE PICTURES\n\nCARD title\n# Pictures`;
  for (const listener of area.listeners.input) listener({});
  assert.match(root.querySelector('.soma-video').textContent, /2\. THE PICTURES/, 'the view follows the typing');
  assert.match(root.querySelector('.puppet-runtime-script-note').textContent, /Not saved yet/);

  draw();
  const again = root.all().find((node) => node.tagName === 'TEXTAREA' && node.className === 'puppet-runtime-script-text');
  assert.match(again.value, /THE PICTURES/, 'unsaved text survives a redraw');
  assert.match(root.querySelector('.soma-video').textContent, /THE PICTURES/);

  await button(root, 'Save').click();
  await flush();
  assert.deepEqual(actions.at(-1), { type: 'edit', target: 'scripts', rowId: 'r-1', field: 'text', value: again.value });
  draw();
  const after = root.all().find((node) => node.tagName === 'TEXTAREA' && node.className === 'puppet-runtime-script-text');
  assert.equal(after.value, SCRIPT, 'after a save the editor shows the row the server returns');
});

test('a refused save keeps the unsaved text and says why', async () => {
  const root = mount();
  render(SKETCH, { root, data: { scripts: ROWS }, me: {}, onAction: async () => { throw new Error('No script editor here'); } });
  await rowsOf(root)[0].click();
  const area = root.all().find((node) => node.tagName === 'TEXTAREA' && node.className === 'puppet-runtime-script-text');
  area.value = 'changed';
  for (const listener of area.listeners.input) listener({});
  await button(root, 'Save').click();
  await flush();
  assert.match(root.querySelector('.puppet-runtime-script-note').textContent, /No script editor here/);
  render(SKETCH, { root, data: { scripts: ROWS }, me: {} });
  assert.equal(root.all().find((node) => node.className === 'puppet-runtime-script-text').value, 'changed');
});

test('video-read gets the row address and highlights the video-view of the same field', async () => {
  const root = mount();
  let given;
  const components = {
    'video-view': (node, text) => mountVideoView(node, text, { document: root.ownerDocument }),
    'video-read': (node, options) => { given = options; return {}; },
  };
  render(SKETCH, { root, data: { scripts: ROWS }, me: {}, components });
  await rowsOf(root)[0].click();
  assert.deepEqual({ data: given.data, rowId: given.rowId, field: given.field }, { data: 'scripts', rowId: 'r-1', field: 'text' });
  const speech = parse(SOURCE) && (await import('../../soma-video/src/film.js')).parseFilm(SCRIPT).findIndex((b) => b.type === 'speech');
  given.onActive(speech);
  assert.equal(root.querySelectorAll('.soma-video-spotlight').length, 2);
});
