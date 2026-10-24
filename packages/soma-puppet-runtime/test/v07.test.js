// Puppet v0.7 (VideoMaker storyboards): the video-storyboards element, the people's routes (owner, artist,
// stranger), held jobs the host lets run, the team's routes, and the storyboard component on a fake DOM.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiHandler } from '../site/functions/api.mjs';
import { HttpError } from '../site/lib/auth.mjs';
import { createBoardStore } from '../../soma-video/server/boards.js';
import { createVideoStudio } from '../../soma-video/server/studio.js';
import { mountStoryboards } from '../../soma-video/src/video-storyboard.js';
import { parse } from '../src/parser.js';
import { render } from '../src/render.js';
import { createMemoryStore } from '../src/store.js';
import { flush, mount } from './fake-dom.js';
import { studioBlobs } from './studio-blobs.js';

const APP_ID = 'videomaker';
const KEY = 'team-key-for-tests';
const base = `/api/app/${APP_ID}`;
const SOURCE = await readFile(new URL('../examples/videomaker.puppet', import.meta.url), 'utf8');
// Who is who, by the x-test-user header: the host, an artist (by email), and someone else.
const PEOPLE = {
  mike: { id: 'mike', name: 'Mike', email: 'mike@example.com' },
  eric: { id: 'eric', name: 'Eric', email: 'eric@example.com' },
  theo: { id: 'theo', name: 'Theo', email: 'theo@example.com' },
};

function makeApi({ source = SOURCE } = {}) {
  const apps = { [APP_ID]: { hostId: 'mike' } };
  const blobs = studioBlobs();
  const handler = createApiHandler({
    apps,
    store: createMemoryStore(apps),
    verifyIdentity: async (request) => {
      const who = PEOPLE[request.headers.get('x-test-user')];
      if (!who) throw new HttpError(401, 'Sign in');
      return who;
    },
    readSeed: async () => source,
    feedbackStore: {},
    videoStudio: createVideoStudio({ blobs }),
    videoBoards: createBoardStore({ blobs }),
    teamKey: KEY,
  });
  return {
    async call(path, { method = 'GET', user, key, body, raw, headers = {} } = {}) {
      const response = await handler(new Request(`http://localhost${base}/${path}`, {
        method,
        headers: {
          ...(user ? { 'x-test-user': user } : {}),
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

const BOARD = {
  title: 'Witness and Stay', project: '~/Projects/witness-and-stay-song', artists: ['eric@example.com'],
  song: { file: 'song.mp3', duration: 258 },
  scenes: [
    { id: 'e01', lyric: 'Izzy, I had that dream again.', start: 0, end: 18.12, prompt: 'Older Eric wakes', refs: ['o47'], pictures: { '9x16': 'e01-9x16.jpg' } },
    { id: 'e02', lyric: 'So this is how it ends?', start: 18.12, end: 24 },
  ],
  cuts: [{ id: 'full', name: 'Full song', aspect: '16x9', all: true }],
};

async function seeded(api) {
  await api.call('current', { user: 'mike' });
  const put = await api.call('video-team/boards/witness', { method: 'PUT', key: KEY, body: BOARD });
  assert.equal(put.status, 201, JSON.stringify(put.body));
  return put.body;
}

test('grammar: video-storyboards is a v0.7 word, on a screen not from data', () => {
  assert.deepEqual(parse(SOURCE).errors, []);
  const old = parse(SOURCE.replace('version "0.7"', 'version "0.6"'));
  assert.ok(old.errors.some((e) => /v0\.7 element/.test(e.message)));
  const onRow = parse(SOURCE.replace('  video-assets "{row.text}"', '  video-assets "{row.text}"\n  video-storyboards'));
  assert.ok(onRow.errors.some((e) => /not from data/.test(e.message)));
});

test('the team seeds a board; its owner is the host whatever the body says', async () => {
  const api = makeApi();
  const board = await seeded(api);
  assert.equal(board.owner, 'mike');
  assert.equal(board.id, 'witness');
  const again = await api.call('video-team/boards/witness', { method: 'PUT', key: KEY, body: { ...BOARD, owner: 'theo' } });
  assert.equal(again.body.owner, 'mike');
  assert.equal(again.body.version, 2);
  assert.equal((await api.call('video-team/boards/witness', { method: 'PUT', body: BOARD })).status, 401);
});

test('owner and artists see and change a board; anyone else is told it does not exist', async () => {
  const api = makeApi();
  await seeded(api);
  assert.deepEqual((await api.call('video-boards', { user: 'eric' })).body.map((b) => [b.id, b.role]), [['witness', 'artist']]);
  assert.deepEqual((await api.call('video-boards', { user: 'theo' })).body, []);
  assert.equal((await api.call('video-boards/witness', { user: 'theo' })).status, 404);
  assert.equal((await api.call('video-boards/witness', { user: 'theo', method: 'PATCH', body: { ops: [{ op: 'title', value: 'Mine' }] } })).status, 404);
  assert.equal((await api.call('video-boards')).status, 401);

  const changed = await api.call('video-boards/witness', { user: 'eric', method: 'PATCH', body: { ops: [{ op: 'move', scene: 'e02', to: 0 }, { op: 'add-after', after: 'e02', scene: { prompt: 'A hallway' } }] } });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.deepEqual(changed.body.scenes.map((s) => s.id), ['e02', 'e02a', 'e01']);
  assert.deepEqual(changed.body.added, ['e02a']);
  assert.equal(changed.body.updatedBy, 'Eric');
  assert.equal((await api.call('video-boards/witness', { user: 'eric', method: 'PATCH', body: { ops: [{ op: 'artists', artists: [] }] } })).status, 400);
  assert.equal((await api.call('video-boards/witness', { user: 'eric', method: 'PATCH', body: { ops: [{ op: 'pictures', scene: 'e01', pictures: { '9x16': 'x.jpg' } }] } })).status, 400);
  assert.equal((await api.call('video-boards/witness', { user: 'eric', method: 'DELETE' })).status, 403);
  const shared = await api.call('video-boards/witness', { user: 'mike', method: 'PATCH', body: { ops: [{ op: 'artists', artists: ['eric@example.com', 'theo@example.com'] }] } });
  assert.equal(shared.status, 200);
  assert.equal((await api.call('video-boards/witness', { user: 'theo' })).body.role, 'artist');
});

test('only the host starts a board', async () => {
  const api = makeApi();
  await api.call('current', { user: 'mike' });
  assert.equal((await api.call('video-boards', { user: 'eric', method: 'POST', body: { title: 'Mine' } })).status, 403);
  const made = await api.call('video-boards', { user: 'mike', method: 'POST', body: { title: 'A Song', project: '~/Projects/a-song' } });
  assert.equal(made.status, 201);
  assert.equal(made.body.owner, 'mike');
  assert.match(made.body.id, /^b-/);
});

test('board files: the team sends them, readers of the board fetch them', async () => {
  const api = makeApi();
  await seeded(api);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2]);
  const put = await api.call('video-team/boards/witness/files/e01-9x16.jpg', { method: 'PUT', key: KEY, raw: jpeg, headers: { 'content-type': 'image/jpeg' } });
  assert.equal(put.status, 201, JSON.stringify(put.body));
  const got = await api.call('video-boards/witness/files/e01-9x16.jpg', { user: 'eric' });
  assert.equal(got.status, 200);
  assert.deepEqual([...got.body], [...jpeg]);
  assert.equal((await api.call('video-boards/witness/files/e01-9x16.jpg', { user: 'theo' })).status, 404);
  assert.equal((await api.call('video-team/boards/witness/files/x.exe', { method: 'PUT', key: KEY, raw: jpeg, headers: { 'content-type': 'application/x-msdownload' } })).status, 400);
  assert.equal((await api.call('video-team/boards/nope/files/a.jpg', { method: 'PUT', key: KEY, raw: jpeg, headers: { 'content-type': 'image/jpeg' } })).status, 400);
});

test('an artist\'s job waits for the host; the worker sees board jobs only when it asks for them', async () => {
  const api = makeApi();
  await seeded(api);
  await api.call('video-boards/witness', { user: 'eric', method: 'PATCH', body: { ops: [{ op: 'set', scene: 'e01', field: 'note', value: 'Colder room' }] } });
  const asked = await api.call('video-boards/witness/jobs', { user: 'eric', method: 'POST', body: { step: 'redo', scene: 'e01' } });
  assert.equal(asked.status, 201, JSON.stringify(asked.body));
  assert.equal(asked.body.status, 'held');
  assert.equal((await api.call('video-boards/witness/jobs', { user: 'eric', method: 'POST', body: { step: 'redo', scene: 'nope' } })).status, 400);
  assert.equal((await api.call('video-boards/witness/jobs', { user: 'eric', method: 'POST', body: { step: 'render', cut: 'nope' } })).status, 400);
  assert.equal((await api.call('video-boards/witness/jobs', { user: 'eric', method: 'POST', body: { step: 'ask', scene: 'e01' } })).status, 400);
  assert.equal((await api.call('video-boards/witness/jobs', { user: 'theo', method: 'POST', body: { step: 'redo', scene: 'e01' } })).status, 404);

  // Held jobs are not open to the worker, which cannot start one either; the host lets it run.
  assert.deepEqual((await api.call('video-team/jobs?boards=1', { key: KEY })).body, []);
  const early = await api.call(`video-team/jobs/${asked.body.id}`, { method: 'POST', key: KEY, body: { status: 'running' } });
  assert.equal(early.status, 400);
  assert.match(early.body.error, /waiting for the host/);
  assert.equal((await api.call(`video-boards/witness/jobs/${asked.body.id}`, { user: 'eric', method: 'POST', body: { release: true } })).status, 403);
  const released = await api.call(`video-boards/witness/jobs/${asked.body.id}`, { user: 'mike', method: 'POST', body: { release: true } });
  assert.equal(released.body.status, 'queued');
  assert.equal((await api.call(`video-boards/witness/jobs/${asked.body.id}`, { user: 'mike', method: 'POST', body: { release: true } })).status, 400);

  // An older worker (no ?boards=1) never sees it; a new one gets the board and the brief.
  assert.deepEqual((await api.call('video-team/jobs', { key: KEY })).body, []);
  const [job] = (await api.call('video-team/jobs?boards=1', { key: KEY })).body;
  assert.equal(job.id, asked.body.id);
  assert.equal(job.board.id, 'witness');
  assert.match(job.brief, /Redo note from Eric: Colder room/);

  // The host's own job is queued at once.
  const mine = await api.call('video-boards/witness/jobs', { user: 'mike', method: 'POST', body: { step: 'render', cut: 'full' } });
  assert.equal(mine.body.status, 'queued');
  const declined = await api.call('video-boards/witness/jobs', { user: 'eric', method: 'POST', body: { step: 'render', cut: 'full', note: 'try it' } });
  const no = await api.call(`video-boards/witness/jobs/${declined.body.id}`, { user: 'mike', method: 'POST', body: { release: false } });
  assert.equal(no.body.status, 'failed');
  assert.match(no.body.report, /declined by Mike/);
  assert.equal((await api.call('video-boards/witness/jobs', { user: 'eric' })).body.length, 3);
});

test('the team reports new pictures and a render with ops', async () => {
  const api = makeApi();
  await seeded(api);
  const done = await api.call('video-team/boards/witness', { method: 'POST', key: KEY, body: { ops: [
    { op: 'pictures', scene: 'e02', pictures: { '9x16': 'e02-9x16-v2.jpg' } },
    { op: 'rendered', cut: 'full', file: 'full.mp4' },
  ] } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.scenes[1].pictures['9x16'], 'e02-9x16-v2.jpg');
  assert.equal(done.body.cuts[0].render.file, 'full.mp4');
  assert.equal((await api.call('video-team/boards/witness', { method: 'POST', key: KEY, body: { ops: [{ op: 'pictures', scene: 'zz', pictures: { '9x16': 'a.jpg' } }] } })).status, 400);
});

test('no video-storyboards element in the live app: the routes are not there', async () => {
  const api = makeApi({ source: SOURCE.replace(/screen "Storyboards" \{[\s\S]*?\n\}\n\n/, '') });
  await seeded(api);
  assert.equal((await api.call('video-boards', { user: 'mike' })).status, 404);
});

function fakeApi(board) {
  const calls = [];
  let current = structuredClone(board);
  return {
    calls,
    api: {
      listBoards: async () => [{ id: current.id, title: current.title, role: 'artist', scenes: current.scenes.length, cuts: current.cuts.length, updatedAt: new Date().toISOString() }],
      createBoard: async (input) => { calls.push(['create', input]); return current; },
      getBoard: async () => ({ ...current, role: 'artist' }),
      changeBoard: async (id, ops) => {
        calls.push(['change', ops]);
        current = { ...current, version: current.version + 1, added: ops.some((o) => o.op === 'add-after') ? ['e01a'] : [] };
        return { ...current, role: 'artist' };
      },
      listJobs: async () => [],
      createJob: async (id, job) => { calls.push(['job', job]); return { id: 'j1', ...job, status: 'held' }; },
      decideJob: async () => {},
      fetchFile: async () => new Blob([]),
    },
  };
}

const findText = (root, text) => root.all().find((node) => node.tagName === 'BUTTON' && node.textContent === text);

test('the storyboard component: cards, a redo, and adding a scene after', async () => {
  const blobs = studioBlobs();
  const store = createBoardStore({ blobs });
  const board = await store.put(APP_ID, { ...BOARD, id: 'witness' }, { owner: 'mike' });
  const { api, calls } = fakeApi(board);
  const root = mount();
  const view = mountStoryboards(root, { api, initial: 'witness' });
  await view.ready;
  await flush();
  const cards = root.all().filter((node) => node.className === 'svs-card');
  assert.deepEqual(cards.map((card) => card.dataset.scene), ['e01', 'e02']);
  assert.match(root.textContent, /Full song/);
  assert.match(root.textContent, /not rendered yet/);

  // A redo with no words is refused; with words it saves the note and the status, then asks the team.
  const redo = root.all().find((node) => node.tagName === 'BUTTON' && node.textContent === 'Redo this scene');
  await redo.click();
  assert.match(root.textContent, /Say what should change first/);
  const note = root.all().find((node) => node.attributes['aria-label'] === 'Redo note for e01');
  note.value = 'Colder';
  await redo.click();
  await flush();
  assert.deepEqual(calls.find(([kind]) => kind === 'change')[1], [
    { op: 'set', scene: 'e01', field: 'note', value: 'Colder' },
    { op: 'set', scene: 'e01', field: 'status', value: 'redo' },
  ]);
  assert.deepEqual(calls.find(([kind]) => kind === 'job')[1], { step: 'redo', scene: 'e01' });
  assert.match(root.textContent, /waits for the host/);

  // Add scene after e01, then its pictures are asked for.
  await findText(root, 'Add scene after').click();
  const prompt = root.all().find((node) => node.attributes['aria-label'] === 'Prompt for the new scene');
  prompt.value = 'A hallway';
  await findText(root, 'Add and make its pictures').click();
  await flush();
  assert.deepEqual(calls.filter(([kind]) => kind === 'change').at(-1)[1], [{ op: 'add-after', after: 'e01', scene: { lyric: '', prompt: 'A hallway' } }]);
  assert.deepEqual(calls.filter(([kind]) => kind === 'job').at(-1)[1], { step: 'add', scene: 'e01a' });
  view.destroy();
});

test('the renderer draws video-storyboards through its component', () => {
  const { sketch } = parse(SOURCE);
  const root = mount();
  root.dataset.puppetScreen = 'Storyboards';
  let given;
  render(sketch, { root, host: true, components: { 'video-storyboards': (node, options) => { given = options; return { destroy() {} }; } } });
  assert.deepEqual(given, { host: true });
  const bare = mount();
  bare.dataset.puppetScreen = 'Storyboards';
  render(sketch, { root: bare });
  assert.match(bare.textContent, /Storyboards are not available here/);
});

// Fast notes and rerolls (2026-10-23): notes as written, from the board or from the Mac, become held batches.
test('notes on the board land on their cards, and an artist\'s batch waits for the host', async () => {
  const api = makeApi();
  await seeded(api);
  const sent = await api.call('video-boards/witness/notes', { user: 'eric', method: 'POST', body: { text: 'e01: colder\n"so this is how it ends" is perfect, keep\n\nLove it all' } });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.deepEqual(sent.body.notes.map((n) => [n.scene, n.keep]), [['e01', false], ['e02', true]]);
  assert.deepEqual(sent.body.general, ['Love it all']);
  assert.equal(sent.body.board.scenes[0].note, 'colder');
  assert.equal(sent.body.board.scenes[0].noteBy, 'Eric');
  assert.equal(sent.body.board.scenes[0].status, 'redo');
  assert.equal(sent.body.board.scenes[1].status, 'keep');
  assert.deepEqual([sent.body.job.step, sent.body.job.scenes, sent.body.job.status], ['batch', ['e01'], 'held']);
  // The host's own notes run at once; notes that ask for nothing ask for no job.
  const mine = await api.call('video-boards/witness/notes', { user: 'mike', method: 'POST', body: { text: 'e02: warmer' } });
  assert.equal(mine.body.job.status, 'queued');
  assert.equal((await api.call('video-boards/witness/notes', { user: 'mike', method: 'POST', body: { text: 'nothing named' } })).body.job, null);
  assert.equal((await api.call('video-boards/witness/notes', { user: 'mike', method: 'POST', body: { text: 'e01: x', ask: false } })).body.job, null);
  assert.equal((await api.call('video-boards/witness/notes', { user: 'theo', method: 'POST', body: { text: 'e01: x' } })).status, 404);
  assert.equal((await api.call('video-boards/witness/notes', { user: 'eric', method: 'POST', body: { text: '' } })).status, 400);
  assert.equal((await api.call('video-boards/witness/notes', { user: 'eric', method: 'POST', body: { text: 'e01: x', by: 'Mike' } })).status, 400);
});

test('notes sent from the Mac carry whose they are and are always held, even though the team key sent them', async () => {
  const api = makeApi();
  await seeded(api);
  assert.equal((await api.call('video-team/boards/witness/notes', { method: 'POST', body: { text: 'e01: x', by: 'Eric' } })).status, 401);
  assert.equal((await api.call('video-team/boards/witness/notes', { method: 'POST', key: KEY, body: { text: 'e01: x' } })).status, 400);
  assert.equal((await api.call('video-team/boards/witness/notes', { method: 'POST', key: KEY, body: { text: 'e01: x', by: '   ' } })).status, 400);
  assert.equal((await api.call('video-team/boards/witness/notes', { method: 'POST', key: KEY, body: { text: 'e01: x', by: 'E'.repeat(121) } })).status, 400);
  const sent = await api.call('video-team/boards/witness/notes', { method: 'POST', key: KEY, body: { text: 'Scene 2 - too dark\n\n-- \nEric', by: 'Eric (email)' } });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.board.scenes[1].noteBy, 'Eric (email)');
  assert.equal(sent.body.job.status, 'held');
  assert.equal(sent.body.job.by, 'Eric (email)');
  assert.deepEqual((await api.call('video-team/jobs?boards=1', { key: KEY })).body, []);
  await api.call(`video-boards/witness/jobs/${sent.body.job.id}`, { user: 'mike', method: 'POST', body: { release: true } });
  const [job] = (await api.call('video-team/jobs?boards=1', { key: KEY })).body;
  assert.match(job.brief, /new pictures for 1 scene in this one run: e02/);
  assert.match(job.brief, /Redo note from Eric \(email\): too dark/);
});

test('a batch job names scenes on the board, at most 24', async () => {
  const api = makeApi();
  await seeded(api);
  const ok = await api.call('video-boards/witness/jobs', { user: 'mike', method: 'POST', body: { step: 'batch', scenes: ['e01', 'e02', 'e01'] } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.scenes, ['e01', 'e02']);
  assert.equal((await api.call('video-boards/witness/jobs', { user: 'mike', method: 'POST', body: { step: 'batch', scenes: [] } })).status, 400);
  assert.equal((await api.call('video-boards/witness/jobs', { user: 'mike', method: 'POST', body: { step: 'batch', scenes: ['e01', 'nope'] } })).status, 400);
  assert.equal((await api.call('video-boards/witness/jobs', { user: 'mike', method: 'POST', body: { step: 'batch', scenes: Array(25).fill('e01') } })).status, 400);
  assert.equal((await api.call('video-boards/witness/jobs', { user: 'mike', method: 'POST', body: { step: 'batch', scene: 'e01' } })).status, 400);
});

test('the storyboard component: reroll in one click, redo the marked scenes in one batch, paste notes, let all run', async () => {
  const blobs = studioBlobs();
  const store = createBoardStore({ blobs });
  const board = await store.put(APP_ID, {
    ...BOARD, id: 'witness',
    scenes: [...BOARD.scenes.map((s) => ({ ...s, pictures: { '9x16': `${s.id}.jpg` } })), { id: 'e03', lyric: 'A third', status: 'redo', pictures: { '9x16': 'e03.jpg' } }],
  }, { owner: 'mike' });
  const { api, calls } = fakeApi(board);
  let held = [{ id: 'h1', step: 'batch', scenes: ['e02'], status: 'held', by: 'Eric', createdAt: new Date().toISOString(), log: [] }];
  api.listJobs = async () => held;
  api.decideJob = async (id, jobId, release) => { calls.push(['decide', jobId, release]); held = held.map((j) => (j.id === jobId ? { ...j, status: 'queued' } : j)); };
  api.sendNotes = async (id, notes) => { calls.push(['notes', notes]); return { notes: [{ scene: 'e01', note: 'older' }], general: [], job: { id: 'j2', status: 'queued', scenes: ['e01'] } }; };
  const root = mount();
  const view = mountStoryboards(root, { api, host: true, initial: 'witness' });
  await view.ready;
  await flush();

  // Reroll: no note needed, one click marks redo and asks for another take.
  const rerolls = root.all().filter((node) => node.tagName === 'BUTTON' && node.textContent === 'Reroll');
  assert.equal(rerolls.length, 2, 'e02 has a held batch open, so only e01 and e03 offer a reroll');
  await rerolls[0].click();
  await flush();
  assert.deepEqual(calls.find(([kind]) => kind === 'change')[1], [{ op: 'set', scene: 'e01', field: 'status', value: 'redo' }]);
  assert.deepEqual(calls.find(([kind]) => kind === 'job')[1], { step: 'redo', scene: 'e01', note: 'Reroll: same prompt, a different take.' });

  // The marked scene e03 (e02 is covered by the held batch) goes in one batch.
  await findText(root, 'Redo the 1 marked scene in one batch').click();
  await flush();
  assert.deepEqual(calls.filter(([kind]) => kind === 'job').at(-1)[1], { step: 'batch', scenes: ['e03'] });

  // Let all waiting run.
  await findText(root, 'Let all 1 waiting request run').click();
  await flush();
  assert.deepEqual(calls.find(([kind]) => kind === 'decide'), ['decide', 'h1', true]);

  // Paste notes: the preview shows where each note lands before anything is sent.
  const box = root.all().find((node) => node.attributes['aria-label'] === 'Notes from the artist');
  box.value = 'e01: older\nThanks!';
  box.dispatch?.('input');
  await findText(root, 'Put the notes on the cards and redo them').click();
  await flush();
  assert.deepEqual(calls.find(([kind]) => kind === 'notes')[1], { text: 'e01: older\nThanks!' });
  assert.match(root.textContent, /Notes put on e01; the batch is queued for the Mac/);
  view.destroy();
});

test('a picture of your own: owner or artist uploads it, the server names it, the team fetches it for a render', async () => {
  const api = makeApi();
  await seeded(api);
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const up = await api.call('video-boards/witness/pictures/e02?aspect=16x9', { method: 'POST', user: 'eric', raw: png, headers: { 'content-type': 'image/png' } });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  const name = up.body.file;
  assert.match(name, /^up-e02-16x9-[a-z0-9]+\.png$/);
  assert.equal(up.body.scenes[1].pictures['16x9'], name);
  assert.equal(up.body.updatedBy, 'Eric');
  // Readers of the board and the team fetch it; the team's brief for a render says how.
  assert.deepEqual([...(await api.call(`video-boards/witness/files/${name}`, { user: 'mike' })).body], [...png]);
  const team = await api.call(`video-team/boards/witness/files/${name}`, { key: KEY });
  assert.equal(team.status, 200);
  assert.deepEqual([...team.body], [...png]);
  assert.equal((await api.call(`video-team/boards/witness/files/${name}`)).status, 401);
  assert.equal((await api.call('video-team/boards/witness/files/nope.png', { key: KEY })).status, 404);
  await api.call('video-boards/witness/jobs', { method: 'POST', user: 'mike', body: { step: 'render', cut: 'full' } });
  const jobs = await api.call('video-team/jobs?boards=1', { key: KEY });
  assert.match(jobs.body.find((j) => j.board).brief, new RegExp(`http://localhost/api/app/videomaker/video-team/boards/witness/files/${name.replace('.', '\\.')}`));
  // Refused: someone not on the board, a type that is not a picture, a scene or aspect that is not there.
  assert.equal((await api.call('video-boards/witness/pictures/e02?aspect=16x9', { method: 'POST', user: 'theo', raw: png, headers: { 'content-type': 'image/png' } })).status, 404);
  assert.equal((await api.call('video-boards/witness/pictures/e02?aspect=16x9', { method: 'POST', user: 'eric', raw: png, headers: { 'content-type': 'image/svg+xml' } })).status, 400);
  assert.equal((await api.call('video-boards/witness/pictures/e09?aspect=16x9', { method: 'POST', user: 'eric', raw: png, headers: { 'content-type': 'image/png' } })).status, 400);
  assert.equal((await api.call('video-boards/witness/pictures/e02?aspect=4x3', { method: 'POST', user: 'eric', raw: png, headers: { 'content-type': 'image/png' } })).status, 400);
  // A person cannot point a scene at a file the team made, only at an upload.
  const point = await api.call('video-boards/witness', { method: 'PATCH', user: 'eric', body: { ops: [{ op: 'own-picture', scene: 'e02', aspect: '9x16', file: 'e01-9x16.jpg' }] } });
  assert.equal(point.status, 400);
});
