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
const v2Source = await readFile(
  new URL('../examples/sunday-supper-v2.puppet', import.meta.url),
  'utf8',
);

let failures = 0;
let initialVersionId;
let proposedVersionId;

async function call(path, { method = 'GET', user, body } = {}) {
  const response = await fetch(`${apiBase}/${path}`, {
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

await step('Theo saves a seat', async () => {
  const { response, payload } = await call('data/seats', {
    method: 'POST',
    user: guest,
    body: { name: 'Theo' },
  });
  assert.equal(response.status, 201, payload.error);
  assert.equal(payload.name, 'Theo');
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

if (failures) {
  console.log(`FAIL ${failures} end-to-end step(s) failed`);
  process.exitCode = 1;
} else {
  console.log('PASS all end-to-end steps');
}
