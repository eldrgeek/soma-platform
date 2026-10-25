import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const baseUrl = process.env.PM_BASE_URL || 'http://localhost:8899';
const appId = 'sunday-supper';
const apiBase = `${baseUrl}/api/app/${appId}`;
const host = 'rosa:Rosa';
const guest = 'theo:Theo';
const runId = Date.now().toString(36);
const firstDish = `Beans ${runId}`;
const secondDish = `Salad ${runId}`;
const feedbackText = `Please save room for pie ${runId}`;
const v2Source = await readFile(
  new URL('../examples/sunday-supper-v2.puppet', import.meta.url),
  'utf8',
);

let failures = 0;
let initialVersionId;
let proposedVersionId;

async function call(path, { method = 'GET', user, body, base = apiBase } = {}) {
  const response = await fetch(`${base}/${path}`, {
    method,
    headers: {
      ...(user ? { 'x-dev-user': user } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function step(name, check) {
  try {
    await check();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

await step('request without identity is refused', async () => {
  const { response } = await call('current');
  assert.equal(response.status, 401);
});

await step('Sunday Supper starts on v1', async () => {
  let result = await call('current', { user: guest });
  assert.equal(result.response.status, 200);
  if (result.payload.source.includes('cant_eat')) {
    const undone = await call('undo', { method: 'POST', user: host });
    assert.equal(undone.response.status, 200);
    result = await call('current', { user: guest });
  }
  assert.equal(result.payload.source.includes('cant_eat'), false);
  initialVersionId = result.payload.versionId;
});

await step('server rejects a spoofed seat name', async () => {
  const { response, payload } = await call('data/seats', {
    method: 'POST',
    user: guest,
    body: { name: 'Rosa' },
  });
  assert.equal(response.status, 400, payload.error);
});

await step('Theo files feedback and Rosa reads its stored author', async () => {
  const filed = await call('feedback', {
    method: 'POST',
    user: guest,
    body: { text: feedbackText, page: 'Next supper' },
  });
  assert.equal(filed.response.status, 201, filed.payload.error);

  const stored = await call('feedback', { user: host });
  assert.equal(stored.response.status, 200, stored.payload.error);
  assert.ok(stored.payload.some((item) =>
    item.text === feedbackText &&
    item.author?.id === 'theo' &&
    item.author?.name === 'Theo'
  ));
});

await step('Theo adds a dish under v1', async () => {
  const { response, payload } = await call('data/dishes', {
    method: 'POST',
    user: guest,
    body: { who: 'Theo', dish: firstDish },
  });
  assert.equal(response.status, 201, payload.error);
  assert.equal(payload.dish, firstDish);
});

await step("Rosa's dishes view contains Theo's dish", async () => {
  const { response, payload } = await call('data/dishes', { user: host });
  assert.equal(response.status, 200, payload.error);
  assert.ok(payload.some((row) => row.who === 'Theo' && row.dish === firstDish));
});

await step('Theo cannot approve a version', async () => {
  const { response } = await call('approve', {
    method: 'POST',
    user: guest,
    body: { versionId: initialVersionId },
  });
  assert.equal(response.status, 403);
});

await step('Rosa proposes v2 and current stays on v1', async () => {
  const proposed = await call('propose', {
    method: 'POST',
    user: host,
    body: { source: v2Source, reason: "Capture what guests can't eat" },
  });
  assert.equal(proposed.response.status, 201, proposed.payload.error);
  proposedVersionId = proposed.payload.versionId;
  const current = await call('current', { user: host });
  assert.equal(current.payload.versionId, initialVersionId);
});

await step('Rosa approves v2 and it becomes current', async () => {
  const approved = await call('approve', {
    method: 'POST',
    user: host,
    body: { versionId: proposedVersionId },
  });
  assert.equal(approved.response.status, 200, approved.payload.error);
  const current = await call('current', { user: guest });
  assert.equal(current.payload.versionId, proposedVersionId);
  assert.equal(current.payload.source, v2Source);
});

await step("Theo adds a v2 dish with can't-eat information", async () => {
  const { response, payload } = await call('data/dishes', {
    method: 'POST',
    user: guest,
    body: { who: 'Theo', dish: secondDish, cant_eat: 'Peanuts' },
  });
  assert.equal(response.status, 201, payload.error);
  assert.equal(payload.cant_eat, 'Peanuts');
});

await step('Rosa undoes v2 and v1 is current again', async () => {
  const undone = await call('undo', { method: 'POST', user: host });
  assert.equal(undone.response.status, 200, undone.payload.error);
  const current = await call('current', { user: guest });
  assert.equal(current.payload.versionId, initialVersionId);
});

await step('Rosa re-approves the undone v2', async () => {
  const redone = await call('approve', {
    method: 'POST',
    user: host,
    body: { versionId: proposedVersionId },
  });
  assert.equal(redone.response.status, 200, redone.payload.error);
  const current = await call('current', { user: guest });
  assert.equal(current.payload.versionId, proposedVersionId);
  assert.equal(current.payload.source, v2Source);
});

// ---------- Puppet v0.3 on the demo app (seeded from examples/sunday-supper-v3.puppet) ----------
const v3Base = `${baseUrl}/api/app/sunday-supper-v3`;
const ana = 'ana:Ana';
const guestName = `Mo ${runId}`;

const v3call = (path, options = {}) => call(path, { ...options, base: v3Base });

// The next Sunday and Saturday from today, as ISO dates.
function next(weekday) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + ((weekday - date.getUTCDay() + 7) % 7 || 7));
  return date.toISOString().slice(0, 10);
}

let theoRequest;

await step('v0.3: a reader without sign-in gets the description without the host-only screen', async () => {
  const { response, payload } = await v3call('current');
  assert.equal(response.status, 200, payload.error);
  assert.equal(payload.source.includes("Rosa's list"), false);
  const hostView = await v3call('current', { user: host });
  assert.match(hostView.payload.source, /Rosa's list/);
});

await step('v0.3: a date on the wrong weekday is refused', async () => {
  const { response } = await v3call('data/guest_requests', {
    method: 'POST', user: guest, body: { who: 'Theo', guest: guestName, sunday: next(6) },
  });
  assert.equal(response.status, 400);
});

await step('v0.3: Theo and Ana each ask to bring a guest; requests start pending', async () => {
  const theo = await v3call('data/guest_requests', {
    method: 'POST', user: guest, body: { who: 'Theo', guest: guestName, sunday: next(0) },
  });
  assert.equal(theo.response.status, 201, theo.payload.error);
  assert.equal(theo.payload.status, 'pending');
  theoRequest = theo.payload;
  const anaAsk = await v3call('data/guest_requests', {
    method: 'POST', user: ana, body: { who: 'Ana', guest: guestName, sunday: next(0) },
  });
  assert.equal(anaAsk.response.status, 201, anaAsk.payload.error);
});

await step("v0.3: Theo's GET returns only his own requests; Rosa's returns both", async () => {
  const theo = await v3call('data/guest_requests', { user: guest });
  assert.ok(theo.payload.length >= 1);
  assert.ok(theo.payload.every((row) => row.who === 'Theo'));
  const rosa = await v3call('data/guest_requests', { user: host });
  const mine = rosa.payload.filter((row) => row.guest === guestName).map((row) => row.who).sort();
  assert.deepEqual(mine, ['Ana', 'Theo']);
});

await step("v0.3: Rosa's notes are hers alone, and Theo cannot write one", async () => {
  const note = await v3call('data/host_notes', { method: 'POST', user: host, body: { note: `Order chairs ${runId}` } });
  assert.equal(note.response.status, 201, note.payload.error);
  const forged = await v3call('data/host_notes', { method: 'POST', user: guest, body: { note: 'hi' } });
  assert.equal(forged.response.status, 400);
  assert.deepEqual((await v3call('data/host_notes', { user: guest })).payload, []);
  assert.equal((await v3call('data/host_notes')).response.status, 401);
});

await step('v0.3: only Rosa confirms a request, and Theo sees it confirmed', async () => {
  const path = `data/guest_requests/${encodeURIComponent(theoRequest.id)}`;
  const theo = await v3call(path, { method: 'PATCH', user: guest, body: { status: 'confirmed' } });
  assert.equal(theo.response.status, 403);
  const rosa = await v3call(path, { method: 'PATCH', user: host, body: { status: 'confirmed' } });
  assert.equal(rosa.response.status, 200, rosa.payload.error);
  const seen = (await v3call('data/guest_requests', { user: guest })).payload.find((row) => row.id === theoRequest.id);
  assert.equal(seen.status, 'confirmed');
});

await step('v0.3: version history is the host\'s alone', async () => {
  assert.equal((await v3call('versions', { user: guest })).response.status, 403);
  assert.equal((await v3call('versions', { user: host })).response.status, 200);
});

// ---------- Puppet v0.4 on the demo app (seeded from examples/monologues.puppet) ----------
const v4call = (path, options = {}) => call(path, { ...options, base: `${baseUrl}/api/app/monologues` });
const piece = (who, title) => ({ title: `${title} ${runId}`, play: '', text: `${who.toUpperCase()}: Short line ${runId}.` });
let theoPiece;

await step('v0.4: each person, the host included, reads only their own private pieces', async () => {
  assert.equal((await v4call('current', { user: guest })).response.status, 200);
  const theo = await v4call('data/pieces', { method: 'POST', user: guest, body: piece('Theo', 'Hamlet') });
  assert.equal(theo.response.status, 201, theo.payload.error);
  theoPiece = theo.payload;
  assert.match(theoPiece.id, /^r-/);
  const rosa = await v4call('data/pieces', { method: 'POST', user: host, body: piece('Rosa', 'Lear') });
  assert.equal(rosa.response.status, 201, rosa.payload.error);
  const theoRows = (await v4call('data/pieces', { user: guest })).payload;
  const rosaRows = (await v4call('data/pieces', { user: host })).payload;
  assert.ok(theoRows.some((row) => row.id === theoPiece.id));
  assert.equal(rosaRows.some((row) => row.id === theoPiece.id), false, 'the host does not read a private piece');
  assert.equal((await v4call('data/pieces')).response.status, 401);
});

await step("v0.4: nobody else removes Theo's piece, the host included", async () => {
  const path = `data/pieces/${encodeURIComponent(theoPiece.id)}`;
  assert.equal((await v4call(path, { method: 'DELETE', user: host })).response.status, 404);
  assert.equal((await v4call(path, { method: 'DELETE', user: 'ana:Ana' })).response.status, 404);
});

await step('v0.4: Stage Read refuses a piece the reader may not read, and a line that does not exist', async () => {
  const ask = (user, body) => v4call('stage-read', { method: 'POST', user, body: { data: 'pieces', field: 'text', rowId: theoPiece.id, line: 0, ...body } });
  assert.equal((await ask(undefined, {})).response.status, 401);
  assert.equal((await ask(host, {})).response.status, 404);
  assert.equal((await ask(guest, { line: 5 })).response.status, 404);
  assert.equal((await ask(guest, { field: 'title' })).response.status, 404);
});

if (process.env.STAGE_READ_LIVE === '1') {
  await step('v0.4: Stage Read speaks one short line of Theo\'s own piece (spends about 20 characters)', async () => {
    const response = await fetch(`${baseUrl}/api/app/monologues/stage-read`, {
      method: 'POST',
      headers: { 'x-dev-user': guest, 'content-type': 'application/json' },
      body: JSON.stringify({ data: 'pieces', field: 'text', rowId: theoPiece.id, line: 0 }),
    });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get('content-type'), 'audio/mpeg');
    assert.ok((await response.arrayBuffer()).byteLength > 1000, 'real audio');
  });
}

await step('v0.4: the Theo piece is removed by Theo through the visible Delete button', async () => {
  const removed = await v4call(`data/pieces/${encodeURIComponent(theoPiece.id)}`, { method: 'DELETE', user: guest });
  assert.equal(removed.response.status, 200, removed.payload.error);
});

// ---------- Puppet v0.10 on the demo app (seeded from examples/table-read.puppet) ----------
const v10call = (path, options = {}) => call(path, { ...options, base: `${baseUrl}/api/app/table-read` });
const theoDoc = { id: `docTheo${runId}x`, name: `Witness Projection ${runId}` };
const scene = (title, who) => ({ act: 'ACT ONE', title, text: `${title}\n\n${who}\nA line ${runId}.` });

await step('v0.10: a pull stores the scenes as the writer\'s own rows, in the Doc\'s order', async () => {
  assert.equal((await v10call('current', { user: guest })).response.status, 200);
  const pulled = await v10call('doc-import', { method: 'POST', user: guest, body: { data: 'scenes', doc: theoDoc, scenes: [scene('SCENE ONE', 'SAM'), scene('SCENE TWO', 'ANA')] } });
  assert.equal(pulled.response.status, 200, pulled.payload.error);
  assert.equal(pulled.payload.scenes, 2);
  const theo = (await v10call('data/scenes', { user: guest })).payload;
  assert.deepEqual(theo.map((row) => row.title), ['SCENE ONE', 'SCENE TWO']);
  assert.deepEqual((await v10call('data/scenes', { user: host })).payload, [], 'the host reads none of them');
  assert.equal((await v10call('data/scenes')).response.status, 401);
});

await step('v0.10: Pull again replaces the writer\'s rows; the record is the writer\'s own', async () => {
  const again = await v10call('doc-import', { method: 'POST', user: guest, body: { data: 'scenes', doc: theoDoc, scenes: [scene('SCENE ONE', 'SAM')] } });
  assert.equal(again.response.status, 200, again.payload.error);
  assert.deepEqual((await v10call('data/scenes', { user: guest })).payload.map((row) => row.title), ['SCENE ONE']);
  assert.equal((await v10call('doc-import/scenes', { user: guest })).payload.name, theoDoc.name);
  assert.equal((await v10call('doc-import/scenes', { user: 'ana:Ana' })).payload, null);
});

await step('v0.10: a pull with a bad body or a forged Doc id is refused', async () => {
  const bad = (body) => v10call('doc-import', { method: 'POST', user: guest, body });
  assert.equal((await bad({ data: 'scenes', doc: theoDoc, scenes: [] })).response.status, 400);
  assert.equal((await bad({ data: 'scenes', doc: { ...theoDoc, id: '../x' }, scenes: [scene('S', 'SAM')] })).response.status, 400);
  assert.equal((await bad({ data: 'scenes', doc: theoDoc, scenes: [scene('S', 'SAM')], author: 'rosa' })).response.status, 400);
  assert.equal((await bad({ data: 'plays', doc: theoDoc, scenes: [scene('S', 'SAM')] })).response.status, 404);
});

if (failures) {
  console.log(`FAIL ${failures} end-to-end step(s) failed`);
  process.exitCode = 1;
} else {
  console.log('PASS all end-to-end steps');
}
