// Puppet v0.3: host-only screens, read: own, @date, and approve or decline.
// The server-side refusals are the point: each one is also broken on purpose
// by scripts/mutation-check.mjs, and these tests must notice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createApiHandler, validDate } from '../site/functions/api.mjs';
import { createIdentityVerifier } from '../site/lib/auth.mjs';
import { BlobsStore } from '../src/blobs-store.js';
import { guestSource, parse, walk } from '../src/parser.js';
import { formatValue } from '../src/render.js';
import { createMemoryStore } from '../src/store.js';

const APP_ID = 'supper';
const HOST = 'rosa:Rosa';
const THEO = 'theo:Theo';
const ANA = 'ana:Ana';
const base = `/api/app/${APP_ID}`;
const V3 = await readFile(new URL('../examples/sunday-supper-v3.puppet', import.meta.url), 'utf8');

// The guest list and private notes, with guests able to withdraw a pending request.
const LESSONS = `puppet "Lessons" version "0.3"
app "Lessons" {
  requires: signin
}
data requests {
  fields: [who, day, status]
  read: own
}
data roster {
  fields: [student]
  read: own
}
stub secrets {
  { student: "Ana pays cash" }
}
screen "Ask" {
  field "Day" @date @required days: [Sat]
  field "Note"  # teacher: Theo is often late
  button "Ask" @primary -> adds to requests { who: "{me.name}", day: "{form.Day}" }
  list "My requests" from requests {
    button "Withdraw" -> removes from requests
  }
}
screen "My week" {
  requires: host
  # private: Ana's mother pays in cash
  table "Requests" from requests {
    button "Confirm" -> sets status "confirmed"
    button "Decline" -> sets status "declined"
  }
  table "Roster" from roster
  list "Secrets" from secrets
  field "Student"
  button "Add student" -> adds to roster { student: "{form.Student}" }
}
story "As the teacher I plan my week" {
  entry: screen "My week"
  done: "I see every request"
}
story "As a student I ask for a make-up" {
  entry: screen "Ask"
}`;

function request(path, { method = 'GET', user, body, token } = {}) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(user ? { 'x-dev-user': user } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeApi({ source = LESSONS, store, publicRead = false } = {}) {
  const apps = { [APP_ID]: { hostId: 'rosa', publicRead } };
  const backing = store ?? createMemoryStore(apps);
  const api = createApiHandler({
    apps,
    store: backing,
    verifyIdentity: createIdentityVerifier({ env: { NETLIFY_DEV: 'true' } }),
    readSeed: async () => source,
    feedbackStore: { async setJSON() {}, async get() { return null; }, async list() { return { blobs: [] }; } },
  });
  return {
    store: backing,
    async call(path, options) {
      const response = await api(request(`${base}/${path}`, options));
      return { status: response.status, body: await response.json() };
    },
  };
}

async function rawResponse(path, options) {
  const apps = { [APP_ID]: { hostId: 'rosa' } };
  const api = createApiHandler({
    apps,
    store: createMemoryStore(apps),
    verifyIdentity: createIdentityVerifier({ env: { NETLIFY_DEV: 'true' } }),
    readSeed: async () => LESSONS,
    feedbackStore: {},
  });
  return api(request(`${base}/${path}`, options));
}

const ask = (api, user, day = '2026-10-24') =>
  api.call('data/requests', { method: 'POST', user, body: { who: user.split(':')[1], day } });

// ---------- the grammar ----------

test('v0.3 Sunday Supper parses and marks host-only screens and row buttons', () => {
  const { sketch, errors, warnings } = parse(V3);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(sketch.screens.map(({ name, hostOnly }) => [name, Boolean(hostOnly)]), [
    ['Next supper', false], ["Who's bringing what", false], ['Bring a guest', false], ["Rosa's list", true],
  ]);
  assert.equal(sketch.data.guest_requests.read, 'own');
  const confirm = walk(sketch.screens[3].children).find(({ label }) => label === 'Confirm');
  assert.deepEqual(confirm.hook, [{ type: 'set-status', status: 'confirmed' }]);
  assert.equal(confirm.rowOf, 'guest_requests');
  assert.equal(confirm.hostOnly, true);
  const sunday = walk(sketch.screens[2].children).find(({ label }) => label === 'Which Sunday?');
  assert.deepEqual(sunday.roles, ['@date', '@required']);
  assert.deepEqual(sunday.props.days, ['Sun']);
});

const errorsOf = (source) => parse(source).errors.map(({ message }) => message);
const withScreen = (screen, data = 'data notes {\n  fields: [text, status]\n  read: own\n}') =>
  `puppet "X" version "0.3"\n${data}\n${screen}`;

test('v0.3 refuses each misuse with a plain message', () => {
  const cases = [
    [withScreen('app "X" {\n  requires: host\n}'), /requires: host goes on a screen or dialog, not on app/],
    [withScreen('screen "S" {\n  button "B" requires: host\n}'), /not on an element/],
    [withScreen('screen "S" {\n  list "L" from notes\n}', 'data notes {\n  fields: [text]\n  read: host\n}'), /read: takes only own, not host/],
    [withScreen('screen "S" {\n  requires: host\n  list "L" from notes\n}', 'data notes {\n  fields: [text]\n}'), /Data notes is read only on host-only screens; add read: own/],
    [withScreen('screen "S" {\n  button "Go" -> opens screen "P"\n}\nscreen "P" {\n  requires: host\n}'), /Only the host sees screen "P"/],
    [withScreen('screen "P" {\n  requires: host\n  button "Go" -> opens dialog "D"\n}\ndialog "D" {\n  text "hi"\n}'), /Dialog "D" is sent to everyone/],
    [withScreen('screen "P" {\n  requires: host\n  button "OK" -> sets status "confirmed"\n}'), /sets status goes on a button inside a list or table/],
    [withScreen('screen "P" {\n  list "L" from notes {\n    button "OK" -> sets status "confirmed"\n  }\n}'), /Only the host sets status/],
    [withScreen('screen "P" {\n  requires: host\n  list "L" from notes {\n    button "OK" -> sets status "pending"\n  }\n}'), /sets status takes "confirmed" or "declined", not "pending"/],
    [withScreen('screen "P" {\n  requires: host\n  list "L" from notes {\n    button "OK" -> sets status "confirmed"\n  }\n}', 'data notes {\n  fields: [text]\n  read: own\n}'), /notes has none/],
    [withScreen('screen "P" {\n  list "L" from notes\n  button "Add" -> adds to notes { text: "x", status: "confirmed" }\n}'), /may not set status/],
    [withScreen('screen "P" {\n  list "L" from notes\n  button "Day" @date\n}'), /@date goes only on a field/],
    [withScreen('screen "P" {\n  list "L" from notes\n  field "Day" days: [Sat]\n}'), /days: goes only on a @date field/],
    [withScreen('screen "P" {\n  list "L" from notes\n  field "Day" @date days: [Funday]\n}'), /days: takes Mon Tue Wed Thu Fri Sat Sun, not Funday/],
    [withScreen('screen "P" {\n  list "L" from notes\n  field "Day" @date\n  field "Day"\n  button "Add" -> adds to notes { text: "{form.Day}" }\n}'), /Several fields are labelled "Day"/],
    [withScreen('screen "P" {\n  list "L" from notes {\n    button "X" -> removes from other\n  }\n}\ndata other {\n  fields: [a]\n}'), /acts on notes, not other/],
    [withScreen('screen "P" {\n  list "L" from notes\n}', 'data notes {\n  fields: [text]\n  colour: blue\n}'), /A data block takes only fields: and read:/],
  ];
  for (const [source, pattern] of cases) {
    assert.ok(errorsOf(source).some((message) => pattern.test(message)), `${pattern}: ${JSON.stringify(errorsOf(source))}`);
  }
});

test('the source a guest receives has no host-only screen, comment, or private block', () => {
  const guest = guestSource(LESSONS);
  for (const secret of ['My week', 'Confirm', 'Ana pays cash', 'secrets', 'roster', 'private:', 'often late', 'Add student', 'plan my week']) {
    assert.equal(guest.includes(secret), false, `guest source still contains ${secret}`);
  }
  assert.match(guest, /screen "Ask"/);
  assert.match(guest, /data requests/);
  assert.match(guest, /story "As a student I ask for a make-up"/);
  assert.deepEqual(parse(guest).errors, []);
  // A description with nothing private reaches guests as written.
  const supper = `puppet "Dinner" version "0.2"\ndata dishes {\n  fields: [who]\n}\nscreen "Home" {\n  list "Dishes" from dishes\n}`;
  assert.equal(guestSource(supper), supper);
  assert.throws(() => guestSource('screen "Broken" {'), /parse errors/);
});

// ---------- 1. host-only screens ----------

test('the server sends a guest the description without the host-only screen', async () => {
  const api = makeApi();
  const guest = await api.call('current', { user: THEO });
  assert.equal(guest.status, 200);
  assert.equal(guest.body.source.includes('My week'), false);
  assert.equal(guest.body.source.includes('Ana pays cash'), false);
  const host = await api.call('current', { user: HOST });
  assert.equal(host.body.source, LESSONS);
  // Two readers get two documents from one address, so nothing may cache it.
  assert.equal((await rawResponse('current', { user: THEO })).headers.get('cache-control'), 'no-store');
  assert.equal((await api.call('versions', { user: THEO })).status, 403);
  assert.equal((await api.call('versions', { user: HOST })).status, 200);
});

test('a guest cannot send a row that only a host-only screen could send', async () => {
  const api = makeApi();
  await api.call('current', { user: HOST });
  const guest = await api.call('data/roster', { method: 'POST', user: THEO, body: { student: 'Mallory' } });
  assert.equal(guest.status, 400);
  const host = await api.call('data/roster', { method: 'POST', user: HOST, body: { student: 'Ana' } });
  assert.equal(host.status, 201);
  // Host-only data: rows the host added reach no one else.
  assert.deepEqual((await api.call('data/roster', { user: THEO })).body, []);
  assert.deepEqual((await api.call('data/roster', { user: HOST })).body.map(({ student }) => student), ['Ana']);
});

test('a publicRead app still hides host-only parts and needs sign-in for private rows', async () => {
  const api = makeApi({ publicRead: true });
  const anonymous = await api.call('current');
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.body.source.includes('My week'), false);
  assert.equal((await api.call('current', { user: HOST })).body.source, LESSONS);
  assert.equal((await api.call('data/requests')).status, 401);
  assert.equal((await api.call('data/roster')).status, 401);
  assert.equal((await api.call('versions')).status, 401);
});

// ---------- 2. my rows only ----------

test("a guest's GET returns only their own rows; the host's returns all", async () => {
  const api = makeApi();
  await api.call('current', { user: HOST });
  assert.equal((await ask(api, THEO)).status, 201);
  assert.equal((await ask(api, ANA, '2026-10-31')).status, 201);
  const theo = await api.call('data/requests', { user: THEO });
  assert.deepEqual(theo.body.map(({ who }) => who), ['Theo']);
  const host = await api.call('data/requests', { user: HOST });
  assert.deepEqual(host.body.map(({ who }) => who).sort(), ['Ana', 'Theo']);
  for (const { id } of host.body) assert.match(id, /^r-[0-9a-f-]{36}$/, 'private rows get unguessable ids');
});

test("someone else's private row answers like a missing one", async () => {
  const api = makeApi();
  await api.call('current', { user: HOST });
  const { body: row } = await ask(api, ANA);
  const theo = await api.call(`data/requests/${row.id}`, { method: 'DELETE', user: THEO });
  const missing = await api.call('data/requests/r-nope', { method: 'DELETE', user: THEO });
  assert.equal(theo.status, 404);
  assert.deepEqual(theo.body, { error: `Unknown row: ${row.id}` });
  assert.equal(missing.status, 404);
});

test('privacy only tightens: undo or a later version cannot make private rows public', async () => {
  const apps = { [APP_ID]: { hostId: 'rosa' } };
  const blobs = new Map();
  const blobStore = {
    async get(key) { return blobs.has(key) ? structuredClone(blobs.get(key)) : null; },
    async getWithMetadata(key) { return blobs.has(key) ? { data: structuredClone(blobs.get(key)), etag: 'e' } : null; },
    async setJSON(key, value) { blobs.set(key, structuredClone(value)); return { modified: true }; },
  };
  for (const store of [createMemoryStore(apps), new BlobsStore(apps, { blobStore })]) {
    const api = makeApi({ store });
    await api.call('current', { user: HOST });
    await ask(api, THEO);
    await ask(api, ANA);
    const open = LESSONS.replace('  read: own\n}\ndata roster', '}\ndata roster');
    assert.equal(parse(open).sketch.data.requests.read, undefined);
    const { body: { versionId } } = await api.call('propose', { method: 'POST', user: HOST, body: { source: open } });
    assert.equal((await api.call('approve', { method: 'POST', user: HOST, body: { versionId } })).status, 200);
    assert.deepEqual((await api.call('data/requests', { user: THEO })).body.map(({ who }) => who), ['Theo']);
    // Undo back to the first version and redo: still private.
    await api.call('undo', { method: 'POST', user: HOST });
    await api.call('approve', { method: 'POST', user: HOST, body: { versionId } });
    assert.deepEqual((await api.call('data/requests', { user: THEO })).body.map(({ who }) => who), ['Theo']);
  }
});

test('data the live version does not declare is not returned to anyone', async () => {
  const api = makeApi();
  await api.call('current', { user: HOST });
  await api.store.add(APP_ID, 'requests', { who: 'Theo', day: '2026-10-24' }, 'theo');
  const { body: { versionId } } = await api.call('propose', {
    method: 'POST', user: HOST, body: { source: 'puppet "Empty" version "0.3"\nscreen "Home" {\n  text "Closed"\n}' },
  });
  await api.call('approve', { method: 'POST', user: HOST, body: { versionId } });
  assert.equal((await api.call('data/requests', { user: THEO })).status, 404);
  assert.equal((await api.call('data/old', { user: HOST })).status, 404);
});

// ---------- 3. dates ----------

test('a @date value must be a real date on an allowed day, and @required is checked', async () => {
  assert.equal(validDate('2026-10-24', ['Sat']), true);
  assert.equal(validDate('2026-10-25', ['Sat']), false);
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('24/10/2026'), false);
  const api = makeApi();
  await api.call('current', { user: HOST });
  assert.equal((await ask(api, THEO, '2026-10-24')).status, 201, 'a Saturday');
  assert.equal((await ask(api, THEO, '2026-10-25')).status, 400, 'a Sunday');
  assert.equal((await ask(api, THEO, '2026-02-30')).status, 400, 'no such day');
  assert.equal((await ask(api, THEO, 'next Saturday')).status, 400, 'not ISO');
  assert.equal((await ask(api, THEO, '')).status, 400, 'empty but @required');
});

test('a field that is not @required may be left empty', async () => {
  const source = `puppet "Notes" version "0.3"
data notes {
  fields: [day, text]
}
screen "Home" {
  list "Notes" from notes
  field "Day" @date
  field "Text" @required
  button "Add" -> adds to notes { day: "{form.Day}", text: "{form.Text}" }
}`;
  const api = makeApi({ source });
  await api.call('current', { user: THEO });
  assert.equal((await api.call('data/notes', { method: 'POST', user: THEO, body: { day: '', text: 'hi' } })).status, 201);
  assert.equal((await api.call('data/notes', { method: 'POST', user: THEO, body: { day: '', text: '  ' } })).status, 400);
});

test('a choice list takes one of its items, and nothing only when not @required', async () => {
  const source = `puppet "Times" version "0.3"
data picks {
  fields: [time, room]
}
screen "Home" {
  list "Picks" from picks
  field "Saturday time" @select @required items: ["Saturday 9:00", "Saturday 9:30"]
  field "Room" @select items: [Studio, Hall]
  button "Pick" -> adds to picks { time: "{form.Saturday time}", room: "{form.Room}" }
}`;
  const { sketch, errors } = parse(source);
  assert.deepEqual(errors, []);
  assert.deepEqual(walk(sketch.screens[0].children)[1].props.items, ['Saturday 9:00', 'Saturday 9:30']);
  const api = makeApi({ source });
  await api.call('current', { user: THEO });
  const pick = (time, room) => api.call('data/picks', { method: 'POST', user: THEO, body: { time, room } });
  assert.equal((await pick('Saturday 9:30', 'Hall')).status, 201);
  assert.equal((await pick('Saturday 9:30', '')).status, 201, 'Room is not @required');
  assert.equal((await pick('Sunday 9:00', 'Hall')).status, 400, 'not one of the items');
  assert.equal((await pick('Saturday 9:30', 'Attic')).status, 400, 'not one of the items');
  assert.equal((await pick('', 'Hall')).status, 400, 'empty but @required');
});

test('lists show a stored ISO date with its weekday, read in UTC', () => {
  assert.match(formatValue('2026-10-24'), /Sat/);
  assert.match(formatValue('2026-10-24'), /24/);
  assert.equal(formatValue('Beans'), 'Beans');
  assert.equal(formatValue('2026-02-30'), '2026-02-30');
});

// ---------- 4. approve or decline ----------

test('a new row is pending, only the host confirms or declines it, and the guest sees the result', async () => {
  const api = makeApi();
  await api.call('current', { user: HOST });
  const { body: row } = await ask(api, THEO);
  assert.equal(row.status, 'pending');
  const forged = await api.call('data/requests', {
    method: 'POST', user: THEO, body: { who: 'Theo', day: '2026-10-24', status: 'confirmed' },
  });
  assert.equal(forged.status, 400);

  const theo = await api.call(`data/requests/${row.id}`, { method: 'PATCH', user: THEO, body: { status: 'confirmed' } });
  assert.equal(theo.status, 403);
  const pending = await api.call(`data/requests/${row.id}`, { method: 'PATCH', user: HOST, body: { status: 'pending' } });
  assert.equal(pending.status, 400);
  const extra = await api.call(`data/requests/${row.id}`, { method: 'PATCH', user: HOST, body: { status: 'confirmed', who: 'Rosa' } });
  assert.equal(extra.status, 400);
  const unknown = await api.call('data/requests/r-nope', { method: 'PATCH', user: HOST, body: { status: 'confirmed' } });
  assert.equal(unknown.status, 404);

  const confirmed = await api.call(`data/requests/${row.id}`, { method: 'PATCH', user: HOST, body: { status: 'confirmed' } });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.status, 'confirmed');
  assert.deepEqual((await api.call('data/requests', { user: THEO })).body.map(({ status }) => status), ['confirmed']);
});

test('the host sets status only through a sets status action on that data', async () => {
  const source = LESSONS.replace('    button "Decline" -> sets status "declined"\n', '');
  const api = makeApi({ source });
  await api.call('current', { user: HOST });
  const { body: row } = await ask(api, THEO);
  const declined = await api.call(`data/requests/${row.id}`, { method: 'PATCH', user: HOST, body: { status: 'declined' } });
  assert.equal(declined.status, 400);
  const roster = await api.call(`data/roster/${row.id}`, { method: 'PATCH', user: HOST, body: { status: 'confirmed' } });
  assert.equal(roster.status, 400);
});

test("the API refuses a guest's status change before it reaches the store", async () => {
  const backing = createMemoryStore({ [APP_ID]: { hostId: 'rosa' } });
  let called = false;
  const store = new Proxy(backing, {
    get(target, key) {
      if (key === 'setStatus') return async () => { called = true; return {}; };
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const api = makeApi({ store });
  await api.call('current', { user: HOST });
  const { body: row } = await ask(api, THEO);
  assert.equal((await api.call(`data/requests/${row.id}`, { method: 'PATCH', user: THEO, body: { status: 'confirmed' } })).status, 403);
  assert.equal(called, false);
});

test('the stores refuse a status change by anyone but the host', async () => {
  const apps = { [APP_ID]: { hostId: 'rosa' } };
  const blobs = new Map();
  const blobStore = {
    async get(key) { return blobs.has(key) ? structuredClone(blobs.get(key)) : null; },
    async getWithMetadata(key) { return blobs.has(key) ? { data: structuredClone(blobs.get(key)), etag: 'e' } : null; },
    async setJSON(key, value) { blobs.set(key, structuredClone(value)); return { modified: true }; },
  };
  for (const store of [createMemoryStore(apps), new BlobsStore(apps, { blobStore })]) {
    const versionId = await store.propose(APP_ID, { source: LESSONS, author: 'rosa', reason: '' });
    await store.approve(APP_ID, versionId, 'rosa');
    const row = await store.add(APP_ID, 'requests', { who: 'Theo', day: '2026-10-24' }, 'theo');
    assert.equal(row.status, 'pending');
    await assert.rejects(store.setStatus(APP_ID, 'requests', row.id, 'confirmed', 'theo'), /Only the host/);
    await assert.rejects(store.setStatus(APP_ID, 'requests', row.id, 'maybe', 'rosa'), /Status must be/);
    assert.equal((await store.setStatus(APP_ID, 'requests', row.id, 'declined', 'rosa')).status, 'declined');
    assert.deepEqual((await store.list(APP_ID, 'requests', { author: 'ana' })), []);
    assert.equal((await store.list(APP_ID, 'requests', { author: 'theo' })).length, 1);
    assert.deepEqual(await store.privateData(APP_ID), ['requests', 'roster']);
  }
});

test('a guest withdraws only their own pending request, through a visible action', async () => {
  const api = makeApi();
  await api.call('current', { user: HOST });
  const { body: pending } = await ask(api, THEO);
  const { body: decided } = await ask(api, THEO, '2026-10-31');
  await api.call(`data/requests/${decided.id}`, { method: 'PATCH', user: HOST, body: { status: 'declined' } });
  assert.equal((await api.call(`data/requests/${decided.id}`, { method: 'DELETE', user: THEO })).status, 403);
  assert.equal((await api.call(`data/requests/${pending.id}`, { method: 'DELETE', user: THEO })).status, 200);
  // Roster rows have no removes-from action anyone but the host can see.
  const { body: student } = await api.call('data/roster', { method: 'POST', user: HOST, body: { student: 'Ana' } });
  await api.store.add(APP_ID, 'roster', { student: 'Theo' }, 'theo');
  const own = (await api.call('data/roster', { user: THEO })).body[0];
  assert.equal((await api.call(`data/roster/${own.id}`, { method: 'DELETE', user: THEO })).status, 403);
  assert.equal((await api.call(`data/roster/${student.id}`, { method: 'DELETE', user: HOST })).status, 200);
});
