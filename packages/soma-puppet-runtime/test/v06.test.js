// Puppet v0.6 (VideoMaker studio): video-assets and video-jobs, the team's routes signed with the team
// key, the address of a row screen, and the cleaner list. The grammar, the server's checks, the renderer
// and the two soma-video components on a fake DOM.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiHandler, keyMatches } from '../site/functions/api.mjs';
import { createIdentityVerifier } from '../site/lib/auth.mjs';
import { createVideoStudio } from '../../soma-video/server/studio.js';
import { boardScenes, mountVideoAssets, placePictures } from '../../soma-video/src/video-assets.js';
import { mountVideoJobs } from '../../soma-video/src/video-jobs.js';
import { parse, walk } from '../src/parser.js';
import { render } from '../src/render.js';
import { createMemoryStore } from '../src/store.js';
import { flush, mount } from './fake-dom.js';

const APP_ID = 'videomaker';
const HOST = 'rosa:Rosa';
const THEO = 'theo:Theo';
const KEY = 'team-key-for-tests';
const base = `/api/app/${APP_ID}`;
const SOURCE = await readFile(new URL('../examples/videomaker.puppet', import.meta.url), 'utf8');
const SONG = `Title: A Song

.INTRO 0:00-0:14

CARD title
# A Song

~Woah, woah

.VERSE 1 0:14-0:48

CARD reveal
# War

~War is the angry expression of

.CHORUS 0:48-1:11

~The Compassionate Heart`;

export function studioBlobs() {
  const values = new Map();
  let etag = 0;
  return {
    values,
    async list({ prefix = '' } = {}) {
      return { blobs: [...values.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    async getMetadata(key) {
      const entry = values.get(key);
      return entry ? { etag: entry.etag, metadata: entry.metadata } : null;
    },
    async get(key, { type } = {}) {
      const entry = values.get(key);
      if (!entry) return null;
      return type === 'json' ? structuredClone(entry.value) : entry.value;
    },
    async getWithMetadata(key, { type } = {}) {
      const entry = values.get(key);
      if (!entry) return null;
      return { data: type === 'json' ? structuredClone(entry.value) : entry.value, etag: entry.etag, metadata: entry.metadata };
    },
    async set(key, value, { metadata } = {}) {
      values.set(key, { value, metadata, etag: `e${++etag}` });
    },
    async setJSON(key, value, { onlyIfMatch } = {}) {
      const entry = values.get(key);
      if (onlyIfMatch && entry?.etag !== onlyIfMatch) return { modified: false };
      values.set(key, { value: structuredClone(value), etag: `e${++etag}` });
      return { modified: true };
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

function makeApi({ source = SOURCE, teamKey = KEY } = {}) {
  const apps = { [APP_ID]: { hostId: 'rosa' } };
  const api = createApiHandler({
    apps,
    store: createMemoryStore(apps),
    verifyIdentity: createIdentityVerifier({ env: { NETLIFY_DEV: 'true' } }),
    readSeed: async () => source,
    feedbackStore: {},
    videoStudio: createVideoStudio({ blobs: studioBlobs() }),
    teamKey,
  });
  return {
    async call(path, { method = 'GET', user, key, body, raw, headers = {} } = {}) {
      const response = await api(new Request(`http://localhost${base}/${path}`, {
        method,
        headers: {
          ...(user ? { 'x-dev-user': user } : {}),
          ...(key ? { 'x-studio-team-key': key } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: raw ?? (body ? JSON.stringify(body) : undefined),
      }));
      const type = response.headers.get('content-type') ?? '';
      return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : new Uint8Array(await response.arrayBuffer()) };
    },
  };
}

async function withScript(api, user = HOST, text = SONG) {
  await api.call('current', { user: HOST });
  const added = await api.call('data/scripts', { method: 'POST', user, body: { title: 'A Song', logline: 'a music video', text } });
  assert.equal(added.status, 201, JSON.stringify(added.body));
  return added.body.id;
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const putAsset = (api, rowId, name, { key = KEY, type = 'image/jpeg', meta = {}, bytes = JPEG } = {}) =>
  api.call(`video-team/assets/scripts/${rowId}/${name}`, { method: 'PUT', key, raw: bytes, headers: { 'content-type': type, 'x-asset-meta': JSON.stringify(meta) } });

// ---------- the grammar ----------

test('the VideoMaker description is v0.6 and binds video-jobs and video-assets to the script text', () => {
  const { sketch, errors, warnings } = parse(SOURCE);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  const screen = sketch.screens.find(({ name }) => name === 'Script');
  const kinds = walk(screen.children).filter(({ kind }) => ['video-jobs', 'video-assets'].includes(kind));
  assert.deepEqual(kinds.map(({ kind, field }) => [kind, field]), [['video-jobs', 'text'], ['video-assets', 'text']]);
});

test('v0.6 elements need version 0.6 and one field of a row', () => {
  const doc = (body, version = '0.6') =>
    `puppet "X" version "${version}"\ndata notes {\n  fields: [title, text]\n  read: private\n}\nscreen "Home" {\n  list "Notes" from notes -> opens screen "Note"\n}\n${body}`;
  const errorsOf = (source) => parse(source).errors.map(({ message }) => message);
  assert.ok(errorsOf(doc('screen "Note" from notes {\n  video-assets "{row.text}"\n}', '0.5')).some((m) => /video-assets is a Puppet v0.6 element/.test(m)));
  assert.ok(errorsOf(doc('screen "Note" from notes {\n  video-jobs "{row.text} now"\n}')).some((m) => /video-jobs works on one field of a row/.test(m)));
  assert.deepEqual(errorsOf(doc('screen "Note" from notes {\n  video-jobs "{row.text}"\n  video-assets "{row.text}"\n}')), []);
});

// ---------- the team key ----------

test('keyMatches needs the exact key and refuses an empty one', () => {
  assert.equal(keyMatches(KEY, KEY), true);
  assert.equal(keyMatches(`${KEY}x`, KEY), false);
  assert.equal(keyMatches('', ''), false);
  assert.equal(keyMatches(KEY, ''), false);
  assert.equal(keyMatches(undefined, KEY), false);
});

test('the team routes answer only to the team key, and never to a signed-in person', async () => {
  const api = makeApi();
  const rowId = await withScript(api);
  assert.equal((await api.call('video-team/jobs')).status, 401);
  assert.equal((await api.call('video-team/jobs', { key: 'wrong' })).status, 401);
  assert.equal((await api.call('video-team/jobs', { user: HOST })).status, 401);
  assert.equal((await putAsset(api, rowId, 'p.jpg', { key: 'wrong' })).status, 401);
  assert.equal((await api.call('video-team/jobs', { key: KEY })).status, 200);
  const unkeyed = makeApi({ teamKey: '' });
  assert.equal((await unkeyed.call('video-team/jobs', { key: '' })).status, 401, 'a site with no key set refuses everyone');
});

// ---------- jobs ----------

test('the host asks for a job; the team reads it with the script, reports on it, and it closes', async () => {
  const api = makeApi();
  const rowId = await withScript(api);
  const made = await api.call(`video/scripts/${rowId}/jobs`, { method: 'POST', user: HOST, body: { step: 'ask', note: 'Make Verse 1 colder' } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.status, 'queued');
  const open = await api.call('video-team/jobs', { key: KEY });
  assert.equal(open.body.length, 1);
  assert.equal(open.body[0].text, SONG, 'the team gets the script the job is for');
  assert.equal(open.body[0].title, 'A Song');
  assert.equal(open.body[0].note, 'Make Verse 1 colder');
  const id = made.body.id;
  assert.equal((await api.call(`video-team/jobs/${id}`, { method: 'POST', key: KEY, body: { status: 'running', log: 'started' } })).body.status, 'running');
  const done = await api.call(`video-team/jobs/${id}`, { method: 'POST', key: KEY, body: { status: 'done', report: 'Colder now.' } });
  assert.equal(done.body.report, 'Colder now.');
  assert.deepEqual(done.body.log, ['started']);
  assert.equal((await api.call('video-team/jobs', { key: KEY })).body.length, 0, 'a finished job is no longer open');
  assert.equal((await api.call(`video-team/jobs/${id}`, { method: 'POST', key: KEY, body: { status: 'running' } })).status, 400, 'a finished job is not reopened');
  const mine = await api.call(`video/scripts/${rowId}/jobs`, { user: HOST });
  assert.equal(mine.body[0].status, 'done');
});

test('only the host may ask for a job, for a step the page offers, with words for an ask', async () => {
  const api = makeApi();
  const theirs = await withScript(api, THEO);
  assert.equal((await api.call(`video/scripts/${theirs}/jobs`, { method: 'POST', user: THEO, body: { step: 'images' } })).status, 403, 'a job runs on the host\'s Mac');
  const rowId = await withScript(api);
  const odd = await api.call(`video/scripts/${rowId}/jobs`, { method: 'POST', user: HOST, body: { step: 'anything-at-all' } });
  assert.equal(odd.status, 400);
  assert.match(odd.body.error, /step is one of ask, analyze, images, render, sync/);
  assert.equal((await api.call(`video/scripts/${rowId}/jobs`, { method: 'POST', user: HOST, body: { step: 'ask', note: '  ' } })).status, 400);
  assert.equal((await api.call(`video/scripts/${rowId}/jobs`, { method: 'POST', user: HOST, body: { step: 'images', extra: 1 } })).status, 400);
  assert.equal((await api.call(`video/scripts/${rowId}/jobs`, { method: 'POST', body: { step: 'images' } })).status, 401);
  assert.equal((await api.call(`video/scripts/${theirs}/jobs`, { method: 'POST', user: HOST, body: { step: 'images' } })).status, 404, 'a private row of someone else is missing, even for the host');
});

test('a description with no video-jobs offers no jobs, and none without assets offers no assets', async () => {
  const bare = SOURCE.replace('  video-jobs "{row.text}"\n', '').replace('  video-assets "{row.text}"\n', '');
  const api = makeApi({ source: bare });
  const rowId = await withScript(api);
  assert.equal((await api.call(`video/scripts/${rowId}/jobs`, { method: 'POST', user: HOST, body: { step: 'images' } })).status, 404);
  assert.equal((await api.call(`video/scripts/${rowId}/assets`, { user: HOST })).status, 404);
});

// ---------- assets ----------

test('the team stores an asset; the row\'s reader lists it and gets the same bytes; no one else can', async () => {
  const api = makeApi();
  const rowId = await withScript(api);
  const stored = await putAsset(api, rowId, 'i01.jpg', { meta: { section: 'Verse 1', start: 20, caption: 'smoke', prompter: 'Grok', ignored: 'x' } });
  assert.equal(stored.status, 201, JSON.stringify(stored.body));
  const list = await api.call(`video/scripts/${rowId}/assets`, { user: HOST });
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].name, 'i01.jpg');
  assert.equal(list.body[0].section, 'Verse 1');
  assert.equal(list.body[0].start, 20);
  assert.equal(list.body[0].ignored, undefined, 'only known metadata is kept');
  const file = await api.call(`video/scripts/${rowId}/assets/i01.jpg`, { user: HOST });
  assert.equal(file.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual([...file.body], [...JPEG]);
  assert.equal((await api.call(`video/scripts/${rowId}/assets`, { user: THEO })).status, 404, 'a private script\'s assets are missing for others');
  assert.equal((await api.call(`video/scripts/${rowId}/assets/i01.jpg`, { user: THEO })).status, 404);
  assert.equal((await api.call(`video/scripts/${rowId}/assets/nope.jpg`, { user: HOST })).status, 404);
});

test('an asset needs a plain name, a known type, and bytes under the limit', async () => {
  const api = makeApi();
  const rowId = await withScript(api);
  assert.equal((await putAsset(api, rowId, '..secret')).status, 400);
  assert.equal((await putAsset(api, rowId, 'x.html', { type: 'text/html' })).status, 400);
  assert.equal((await putAsset(api, rowId, 'empty.jpg', { bytes: new Uint8Array() })).status, 400);
  assert.equal((await putAsset(api, rowId, 'big.jpg', { bytes: new Uint8Array(4_600_000) })).status, 400);
  assert.equal((await putAsset(api, rowId, 'song.mp3', { type: 'audio/mpeg', meta: { kind: 'song' } })).status, 201);
});

// ---------- the renderer: the address and the list ----------

const SKETCH = parse(SOURCE).sketch;
const ROWS = [{ id: 'r-1', title: 'A Song', logline: 'a music video', text: SONG }];

test('opening a script tells the page where it is; a root that names a row opens on it', async () => {
  const root = mount();
  const moves = [];
  render(SKETCH, { root, data: { scripts: ROWS }, me: {}, onNavigate: (where) => moves.push(where) });
  assert.equal(moves.length, 0, 'the first draw does not move');
  const row = root.querySelector('.puppet-runtime-list-row');
  assert.equal(root.querySelector('.puppet-runtime-list-title').textContent, 'A Song');
  assert.equal(root.querySelector('.puppet-runtime-list-sub').textContent, 'a music video');
  assert.ok(!row.textContent.includes('Title:'), 'the script text is not in the list');
  await row.click();
  assert.deepEqual(moves.at(-1), { screen: 'Script', row: 'r-1', back: 'My videos' });
  await root.all().find((node) => node.tagName === 'BUTTON' && node.textContent === '← Back').click();
  assert.deepEqual(moves.at(-1), { screen: 'My videos', row: null, back: null });

  const direct = mount();
  direct.dataset.puppetScreen = 'Script';
  direct.dataset.puppetRow = 'r-1';
  render(SKETCH, { root: direct, data: { scripts: ROWS }, me: {} });
  assert.ok(direct.querySelector('.puppet-runtime-script-text'), 'the script screen opens straight away');
  const missing = mount();
  missing.dataset.puppetScreen = 'Script';
  missing.dataset.puppetRow = 'r-404';
  render(SKETCH, { root: missing, data: { scripts: ROWS }, me: {} });
  assert.ok(missing.querySelector('.puppet-runtime-list-row'), 'a row that is not there falls back to the list');
});

test('the script screen mounts the jobs panel and the asset board with the row, and the board follows typing', async () => {
  const root = mount();
  const calls = [];
  const updates = [];
  const components = {
    'video-jobs': (node, where) => { calls.push(['video-jobs', where]); return { destroy() {} }; },
    'video-assets': (node, where) => { calls.push(['video-assets', where]); return { update: (text) => updates.push(text), destroy() {} }; },
  };
  render(SKETCH, { root, data: { scripts: ROWS }, me: {}, components });
  await root.querySelector('.puppet-runtime-list-row').click();
  assert.deepEqual(calls.map(([kind, { data, rowId, field }]) => [kind, data, rowId, field]), [['video-jobs', 'scripts', 'r-1', 'text'], ['video-assets', 'scripts', 'r-1', 'text']]);
  assert.equal(calls[1][1].text, SONG);
  const area = root.querySelector('.puppet-runtime-script-text');
  area.value = `${SONG}\n\n.OUTRO 1:11-1:20`;
  for (const listener of area.listeners.input) listener({});
  assert.equal(updates.at(-1), area.value);
});

// ---------- the components ----------

test('the board finds each scene\'s times, cards and sung lines, and places pictures by time, then by section', () => {
  const scenes = boardScenes(SONG);
  assert.deepEqual(scenes.map((s) => [s.key, s.times?.start, s.cards.length, s.lyrics]), [
    ['intro', 0, 1, ['Woah, woah']],
    ['verse 1', 14, 1, ['War is the angry expression of']],
    ['chorus', 48, 0, ['The Compassionate Heart']],
  ]);
  const assets = [
    { name: 'a.jpg', type: 'image/jpeg', start: 50, section: 'Verse 1' },
    { name: 'b.jpg', type: 'image/jpeg', section: 'VERSE 1' },
    { name: 'c.jpg', type: 'image/jpeg', section: 'Bridge' },
    { name: 'b-p2.jpg', type: 'image/jpeg', parent: 'b.jpg' },
    { name: 'b-p1.jpg', type: 'image/jpeg', parent: 'b.jpg' },
    { name: 'song.mp3', type: 'audio/mpeg', kind: 'song' },
  ];
  const placed = placePictures(scenes, assets);
  assert.deepEqual(placed.map((p) => [p.picture.name, p.index, p.pieces.map((x) => x.name)]), [
    ['a.jpg', 2, []],
    ['b.jpg', 1, ['b-p1.jpg', 'b-p2.jpg']],
    ['c.jpg', -1, []],
  ]);
});

test('the board draws cards, pictures with their pieces, a play button per timed scene, and loose pictures last', async () => {
  const root = mount();
  const fetched = [];
  const board = mountVideoAssets(root, {
    text: SONG,
    cacheKey: 'test-board',
    listAssets: async () => [
      { name: 'b.jpg', type: 'image/jpeg', section: 'Verse 1', updatedAt: '1' },
      { name: 'b-p1.jpg', type: 'image/jpeg', parent: 'b.jpg', updatedAt: '1' },
      { name: 'c.jpg', type: 'image/jpeg', section: 'Bridge', updatedAt: '1' },
      { name: 'song.mp3', type: 'audio/mpeg', kind: 'song', updatedAt: '1' },
    ],
    fetchAsset: async (name) => { fetched.push(name); return new Blob([name]); },
    document: root.ownerDocument,
  });
  await board.ready;
  await flush();
  const scenes = root.querySelectorAll('sva-scene');
  assert.equal(scenes.length, 4, 'three scenes and the loose pictures');
  assert.match(scenes[0].textContent, /INTRO/);
  assert.match(scenes[0].textContent, /A Song/, 'the title card is drawn');
  assert.match(scenes[1].textContent, /War/);
  assert.match(scenes[1].textContent, /War is the angry expression of/);
  assert.equal(scenes[1].querySelectorAll('sva-frame').length, 2, 'the picture and its piece');
  assert.match(scenes[3].textContent, /not placed/);
  const plays = root.querySelectorAll('sva-play');
  assert.equal(plays.length, 3);
  assert.ok(plays.every((button) => !button.disabled), 'the song is there, so every timed scene plays');
  assert.match(root.querySelector('sva-count').textContent, /2 pictures · 1 pieces · song loaded/);
  assert.deepEqual(fetched.sort(), ['b-p1.jpg', 'b.jpg', 'c.jpg'], 'pictures load; the song waits for Play');
  board.update(SONG.replace('.CHORUS 0:48-1:11', '.CHORUS'));
  assert.equal(root.querySelectorAll('sva-play').filter((b) => !b.disabled).length, 2, 'a scene with no times has nothing to play');
  assert.equal(fetched.length, 3, 'a redraw fetches nothing again');
});

test('the jobs panel sends a step or an ask, lists the jobs with the report, and says when a job ends', async () => {
  const root = mount();
  const sent = [];
  let jobs = [{ id: 'j1', step: 'images', status: 'running', log: ['drawing i03'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  let done = 0;
  const timers = [];
  const window = { setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {} };
  const panel = mountVideoJobs(root, {
    listJobs: async () => jobs,
    createJob: async (job) => { sent.push(job); },
    onDone: () => { done += 1; },
    document: root.ownerDocument,
    window,
  });
  await panel.ready;
  assert.match(root.textContent, /Make the pictures/);
  assert.match(root.textContent, /drawing i03/);
  assert.equal(timers.length, 1, 'an open job is asked about again');
  const images = root.querySelectorAll('svj-step').find((b) => b.textContent.startsWith('Make the pictures'));
  await images.click();
  assert.deepEqual(sent.at(-1), { step: 'images', note: '' });
  const area = root.all().find((node) => node.tagName === 'TEXTAREA');
  area.value = 'Make Verse 1 colder';
  await root.all().find((node) => node.tagName === 'BUTTON' && node.textContent === 'Send').click();
  assert.deepEqual(sent.at(-1), { step: 'ask', note: 'Make Verse 1 colder' });
  assert.equal(area.value, '', 'the box empties once sent');
  jobs = [{ ...jobs[0], status: 'done', report: '20 pictures drawn.' }];
  await panel.refresh();
  assert.equal(done, 1, 'the page is told a job ended');
  assert.match(root.textContent, /20 pictures drawn\./);
  panel.destroy();
});
