import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { guestSource, parse } from '../src/parser.js';
import { componentBase, loadComponents } from '../site/public/components.js';
import { PINNABLE, VENDOR, checkStore, hashFolder, publish } from '../scripts/vendor-store.mjs';

const pinned = (uses) => `puppet "Pins" version "0.7"
${uses}
app "Pins" {
  promise: "Pinned components."
}

screen "Home" {
  text "Hello"
}

screen "Host" {
  requires: host
  text "Only the host"
}
`;

test('the committed component store is in order: latest published, no published build changed', async () => {
  assert.deepEqual(await checkStore(), []);
});

async function scratchVendor() {
  const folder = await mkdtemp(join(tmpdir(), 'vendor-store-'));
  for (const pkg of PINNABLE) await cp(join(VENDOR, pkg), join(folder, pkg), { recursive: true });
  return folder;
}

test('publishing names a build by its hash, and a later change is a new build beside it', async () => {
  const vendor = await scratchVendor();
  try {
    assert.deepEqual((await checkStore(vendor)).sort(), PINNABLE.map((pkg) => `${pkg} is not in the store`).sort());
    const first = await publish(vendor, '2026-10-23');
    assert.equal(first.length, PINNABLE.length);
    assert.deepEqual(await checkStore(vendor), []);
    assert.deepEqual(await publish(vendor, '2026-10-24'), [], 'nothing changed, nothing published');

    const before = await hashFolder(join(vendor, 'soma-video'));
    await writeFile(join(vendor, 'soma-video', 'film.js'), '// changed\n', { flag: 'a' });
    assert.match((await checkStore(vendor)).join('\n'), /soma-video changed/);
    const [added] = await publish(vendor, '2026-10-24');
    const after = added.split('@')[1];
    assert.notEqual(after, before);
    const manifest = JSON.parse(await readFile(join(vendor, 'manifest.json'), 'utf8'));
    assert.equal(manifest['soma-video'].latest, after);
    assert.deepEqual(manifest['soma-video'].versions, { [before]: '2026-10-23', [after]: '2026-10-24' });
    assert.equal(await hashFolder(join(vendor, `soma-video@${before}`)), before, 'the old build is untouched');
    assert.deepEqual(await checkStore(vendor), []);
  } finally {
    await rm(vendor, { recursive: true, force: true });
  }
});

test('the check refuses a published build that was changed, removed or never recorded', async () => {
  const vendor = await scratchVendor();
  try {
    await publish(vendor, '2026-10-23');
    const manifest = JSON.parse(await readFile(join(vendor, 'manifest.json'), 'utf8'));
    const hash = manifest['soma-play'].latest;
    await writeFile(join(vendor, `soma-play@${hash}`, 'script.js'), '// edited in place\n', { flag: 'a' });
    assert.match((await checkStore(vendor)).join('\n'), new RegExp(`soma-play@${hash} was changed after it was published`));

    await rm(join(vendor, `soma-play@${hash}`), { recursive: true });
    assert.match((await checkStore(vendor)).join('\n'), /folder is gone/);

    await cp(join(vendor, 'soma-play'), join(vendor, 'soma-play@aaaaaaaaaaaa'), { recursive: true });
    assert.match((await checkStore(vendor)).join('\n'), /soma-play@aaaaaaaaaaaa has no manifest entry/);
  } finally {
    await rm(vendor, { recursive: true, force: true });
  }
});

test('a description pins a published component build with a top-level uses line', () => {
  const { sketch, errors } = parse(pinned('uses soma-video@0123456789ab\nuses soma-play@ba9876543210'));
  assert.deepEqual(errors, []);
  assert.deepEqual(sketch.uses, { 'soma-video': '0123456789ab', 'soma-play': 'ba9876543210' });
  assert.equal(parse(pinned('')).sketch.uses, undefined, 'no pin, no uses');

  const message = (uses) => parse(pinned(uses)).errors.map((e) => e.message).join('\n');
  assert.match(message('uses puppet@0123456789ab'), /puppet cannot be pinned/);
  assert.match(message('uses soma-signin@0123456789ab'), /soma-signin cannot be pinned/);
  assert.match(message('uses soma-video@012345'), /12-digit hash/);
  assert.match(message('uses soma-video'), /12-digit hash/);
  assert.match(message('uses soma-video@0123456789ab\nuses soma-video@ba9876543210'), /pinned twice/);
  const nested = pinned('').replace('  text "Hello"', '  text "Hello"\n  uses soma-video@0123456789ab');
  assert.match(parse(nested).errors.map((e) => e.message).join('\n'), /top level/);
});

test('a guest receives the pins with the description', () => {
  const guest = guestSource(pinned('uses soma-video@0123456789ab'));
  assert.doesNotMatch(guest, /Only the host/);
  assert.deepEqual(parse(guest).sketch.uses, { 'soma-video': '0123456789ab' });
});

test('the parser and the store pin the same components', async () => {
  const parser = await readFile(new URL('../src/parser.js', import.meta.url), 'utf8');
  const listed = parser.match(/const PINNABLE=new Set\((\[[^\]]*\])\)/)[1].replaceAll("'", '"');
  assert.deepEqual(JSON.parse(listed), PINNABLE);
});

test('a pinned component loads from its hashed folder; no pin or an unknown pin loads the latest', () => {
  const manifest = { 'soma-video': { latest: 'ffffffffffff', versions: { '0123456789ab': '2026-10-23', ffffffffffff: '2026-10-24' } } };
  assert.deepEqual(componentBase('soma-video', {}, manifest), { base: '/vendor/soma-video/' });
  assert.deepEqual(componentBase('soma-video', { 'soma-video': '0123456789ab' }, manifest), { base: '/vendor/soma-video@0123456789ab/' });
  const unknown = componentBase('soma-video', { 'soma-video': 'aaaaaaaaaaaa' }, manifest);
  assert.equal(unknown.base, '/vendor/soma-video/');
  assert.match(unknown.notice, /soma-video@aaaaaaaaaaaa is not published/);
  assert.deepEqual(componentBase('soma-play', { 'soma-video': '0123456789ab' }, manifest), { base: '/vendor/soma-play/' });
});

test('the page imports every component from the folders the pins choose', async () => {
  const manifest = { 'soma-play': { latest: 'b', versions: { ba9876543210: '2026-10-23' } } };
  const asked = [];
  const lib = await loadComponents({ 'soma-play': 'ba9876543210' }, manifest, async (url) => {
    asked.push(url);
    const name = url.split('/').pop();
    const exported = {
      'play-view.js': 'mountPlayView', 'stage-read.js': 'mountStageRead', 'video-view.js': 'mountVideoView',
      'video-read.js': 'mountVideoRead', 'video-assets.js': 'mountVideoAssets', 'video-jobs.js': 'mountVideoJobs',
      'video-storyboard.js': 'mountStoryboards', 'line-run.js': 'mountLineRun',
    }[name];
    return { [exported]: url };
  });
  assert.equal(lib.mountPlayView, '/vendor/soma-play@ba9876543210/play-view.js');
  assert.equal(lib.mountStageRead, '/vendor/soma-play@ba9876543210/stage-read.js');
  assert.equal(lib.mountStoryboards, '/vendor/soma-video/video-storyboard.js');
  assert.equal(lib.mountLineRun, '/vendor/soma-play@ba9876543210/line-run.js');
  assert.equal(asked.length, 8);
  assert.deepEqual(lib.notices, []);
});

test('an app pinned to a soma-play build from before run lines keeps every other component', async () => {
  const manifest = JSON.parse(await readFile(join(VENDOR, 'manifest.json'), 'utf8'));
  const site = fileURLToPath(new URL('../site/public', import.meta.url));
  const lib = await loadComponents({ 'soma-play': '888a2da1f147' }, manifest, (url) => import(join(site, url)));
  assert.equal(typeof lib.mountStageRead, 'function');
  assert.equal(typeof lib.mountPlayView, 'function');
  assert.equal(lib.mountLineRun, undefined, 'the v0.7-era build has no line-run.js');
});

test('the real published builds load and export what the page uses', async () => {
  const manifest = JSON.parse(await readFile(join(VENDOR, 'manifest.json'), 'utf8'));
  const uses = Object.fromEntries(PINNABLE.map((pkg) => [pkg, manifest[pkg].latest]));
  const site = fileURLToPath(new URL('../site/public', import.meta.url));
  const lib = await loadComponents(uses, manifest, (url) => import(join(site, url)));
  for (const name of ['mountPlayView', 'mountStageRead', 'mountLineRun', 'mountVideoView', 'mountVideoRead', 'mountVideoAssets', 'mountVideoJobs', 'mountStoryboards']) {
    assert.equal(typeof lib[name], 'function', name);
  }
});

test('the page imports no shared component statically, so a pin can choose its build', async () => {
  const app = await readFile(new URL('../site/public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /^import .* from '\/vendor\/soma-(play|video)\//m);
  assert.match(app, /loadComponents\(uses, manifest \?\? \{\}, \(url\) => import\(url\)\)/);
});
