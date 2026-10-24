// Puppet v0.8: run lines. The grammar of line-run, the page's wiring, and the server rule that a line-run
// offers Stage Read (same checks, same allowance) and nothing else. scripts/mutation-check.mjs breaks
// each rule on purpose, and these tests must notice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { blobCounters, createApiHandler } from '../site/functions/api.mjs';
import { createIdentityVerifier } from '../site/lib/auth.mjs';
import { createStageReader } from '../../soma-play/server/stage-read.js';
import { parse, walk } from '../src/parser.js';
import { render } from '../src/render.js';
import { createMemoryStore } from '../src/store.js';
import { mount } from './fake-dom.js';

const APP_ID = 'run-lines';
const HOST = 'rosa:Rosa';
const THEO = 'theo:Theo';
const ANA = 'ana:Ana';
const SCENE = 'THEO: I came back for the letter.\nANA: Then take it and go.\nTHEO: Not yet.';
const MONOLOGUES = await readFile(new URL('../examples/monologues.puppet', import.meta.url), 'utf8');

const app = (body, { version = '0.8', read = 'private' } = {}) => `puppet "Run lines" version "${version}"
data scenes {
  fields: [title, text]
  read: ${read}
}
screen "Scenes" {
  list "Scenes" from scenes -> opens screen "Scene"
  field "Title"
  field "Text" @multiline
  button "Add" -> adds to scenes { title: "{form.Title}", text: "{form.Text}" }
}
screen "Scene" from scenes {
${body}
}
`;
const errors = (source) => parse(source).errors.map((e) => e.message);

// ---------- the grammar ----------

test('line-run runs one field of a row and records which', () => {
  const { sketch, errors: found } = parse(app('  line-run "{row.text}" hint: initials'));
  assert.deepEqual(found, []);
  const run = walk(sketch.screens[1].children).find((el) => el.kind === 'line-run');
  assert.equal(run.field, 'text');
  assert.equal(run.props.hint, 'initials');
});

test('line-run is refused before v0.8, on any text but one {row.field}, off a row screen, and with an unknown hint', () => {
  assert.ok(errors(app('  line-run "{row.text}"', { version: '0.7' })).some((m) => /line-run is a Puppet v0.8 element/.test(m)));
  assert.ok(errors(app('  line-run "{row.text} aloud"')).some((m) => /line-run runs one field of a row/.test(m)));
  const loose = app('  text "x"').replace('  button "Add"', '  line-run "Some words"\n  button "Add"');
  assert.ok(errors(loose).some((m) => /line-run runs one field of a row/.test(m)));
  assert.ok(errors(app('  line-run "{row.text}" hint: everything')).some((m) => /hint: takes none or initials/.test(m)));
});

test('the Monologues example offers run lines beside Stage Read', () => {
  const { sketch, errors: found, warnings } = parse(MONOLOGUES);
  assert.deepEqual(found, []);
  assert.deepEqual(warnings, []);
  const piece = sketch.screens.find((s) => s.name === 'Piece');
  assert.deepEqual(walk(piece.children).filter((el) => ['stage-read', 'line-run'].includes(el.kind)).map((el) => [el.kind, el.field]), [['stage-read', 'text'], ['line-run', 'text']]);
});

// ---------- the page ----------

test('the renderer hands line-run the row address and hint, and highlights the play-view of the same field', async () => {
  const sketch = parse(app('  play-view "{row.text}"\n  line-run "{row.text}" hint: initials')).sketch;
  const root = mount();
  let given;
  const lit = [];
  const components = {
    'play-view': () => ({ highlight: (index) => lit.push(index) }),
    'line-run': (node, options) => { given = options; return {}; },
  };
  render(sketch, { root, data: { scenes: [{ id: 'r-1', title: 'Letter', text: SCENE }] }, me: {}, components });
  await root.querySelectorAll('.puppet-runtime-list-row')[0].click();
  assert.deepEqual({ data: given.data, rowId: given.rowId, field: given.field, hint: given.hint, text: given.text }, {
    data: 'scenes', rowId: 'r-1', field: 'text', hint: 'initials', text: SCENE,
  });
  given.onActive(2);
  assert.deepEqual(lit, [2]);
});

test('without the component the renderer says run lines is not available', async () => {
  const sketch = parse(app('  line-run "{row.text}"')).sketch;
  const root = mount();
  render(sketch, { root, data: { scenes: [{ id: 'r-1', title: 'Letter', text: SCENE }] }, me: {}, components: {} });
  await root.querySelectorAll('.puppet-runtime-list-row')[0].click();
  assert.match(root.textContent, /Run lines is not available here\./);
});

// ---------- the server ----------

function request(path, { method = 'GET', user, body } = {}) {
  return new Request(`http://localhost/api/app/${APP_ID}/${path}`, {
    method,
    headers: { ...(user ? { 'x-dev-user': user } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function counters() {
  const values = new Map();
  let etag = 0;
  return blobCounters({
    async get(key) { return values.get(key)?.value ?? null; },
    async getWithMetadata(key) { const e = values.get(key); return e ? { data: e.value, etag: e.etag } : null; },
    async setJSON(key, value, { onlyIfMatch, onlyIfNew } = {}) {
      const e = values.get(key);
      if ((onlyIfNew && e) || (onlyIfMatch && e?.etag !== onlyIfMatch)) return { modified: false };
      values.set(key, { value, etag: `e${++etag}` });
      return { modified: true };
    },
    async set(key, value) { values.set(key, { value, etag: `e${++etag}` }); },
  });
}

function makeApi(source, { limits } = {}) {
  const spoken = [];
  const apps = { [APP_ID]: { hostId: 'rosa', publicRead: false } };
  const handler = createApiHandler({
    apps,
    store: createMemoryStore(apps),
    verifyIdentity: createIdentityVerifier({ env: { NETLIFY_DEV: 'true' } }),
    readSeed: async () => source,
    feedbackStore: {},
    stageReader: createStageReader({
      apiKey: 'test-key',
      store: counters(),
      limits: limits ?? { perLine: 600, perPerson: 3000, perApp: 8000, linesPerPerson: 400 },
      fetch: async (url, init) => {
        spoken.push(JSON.parse(init.body).text);
        return new Response(new Uint8Array([1, 2, 3]));
      },
    }),
  });
  const call = async (path, options) => {
    const response = await handler(request(path, options));
    return { status: response.status, type: response.headers.get('content-type') };
  };
  return { call, spoken, handler };
}

async function addScene(api, user) {
  const response = await api.handler(request('data/scenes', { method: 'POST', user, body: { title: 'Letter', text: SCENE } }));
  return (await response.json()).id;
}

test('a line-run offers Stage Read for its field, with the same checks', async () => {
  const api = makeApi(app('  line-run "{row.text}"'));
  await api.call('current', { user: HOST });
  const theo = await addScene(api, THEO);
  const ask = (user, body) => api.call('stage-read', { method: 'POST', user, body: { data: 'scenes', rowId: theo, field: 'text', line: 1, ...body } });
  assert.equal((await ask(undefined)).status, 401);
  const heard = await ask(THEO);
  assert.equal(heard.status, 200);
  assert.equal(heard.type, 'audio/mpeg');
  assert.deepEqual(api.spoken, ['Then take it and go.']);
  assert.equal((await ask(ANA)).status, 404, 'a private row is not read to anyone else');
  assert.equal((await ask(HOST)).status, 404, 'not even to the host');
  assert.equal((await ask(THEO, { field: 'title' })).status, 404, 'no line-run runs the title');
});

test('a line-run never offers the narration read', async () => {
  const api = makeApi(app('  line-run "{row.text}"'));
  await api.call('current', { user: HOST });
  const theo = await addScene(api, THEO);
  const asked = await api.call('video-read', { method: 'POST', user: THEO, body: { data: 'scenes', rowId: theo, field: 'text', line: 0 } });
  assert.equal(asked.status, 404);
});

test('without a line-run or stage-read on a visible screen, Stage Read stays shut', async () => {
  const api = makeApi(app('  text "Nothing to hear"'));
  await api.call('current', { user: HOST });
  const theo = await addScene(api, THEO);
  assert.equal((await api.call('stage-read', { method: 'POST', user: THEO, body: { data: 'scenes', rowId: theo, field: 'text', line: 0 } })).status, 404);
});

test('run lines counts against Stage Read\'s allowance', async () => {
  const api = makeApi(app('  line-run "{row.text}"'), { limits: { perLine: 600, perPerson: 30, perApp: 8000, linesPerPerson: 400 } });
  await api.call('current', { user: HOST });
  const theo = await addScene(api, THEO);
  const ask = (line) => api.call('stage-read', { method: 'POST', user: THEO, body: { data: 'scenes', rowId: theo, field: 'text', line } });
  assert.equal((await ask(0)).status, 200);
  assert.equal((await ask(1)).status, 402, 'the second line would pass the 30-character allowance');
});
