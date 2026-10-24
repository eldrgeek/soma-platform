import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from '../../soma-puppet-runtime/src/parser.js';
import {
  GRAMMAR, PINNABLE, REPO, ROOT, buildCatalog, catalog, exampleApp, find, loadRecords, pinsFromManifest, skeleton, validateRecord,
} from '../src/index.mjs';

const records = loadRecords();
const byWord = new Map(records.map((r) => [r.word, r]));
const parserSource = readFileSync(join(REPO, 'packages/soma-puppet-runtime/src/parser.js'), 'utf8');
const renderSource = readFileSync(join(REPO, 'packages/soma-puppet-runtime/src/render.js'), 'utf8');
const setFrom = (name) => new Set(parserSource.match(new RegExp(`const ${name}=new Set\\('([^']+)'`))[1].split(' '));
const versions = ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7'];

test('every record is valid against the schema', () => {
  for (const r of records) assert.deepEqual(validateRecord(r).errors, [], r.word);
});

test('the schema refuses a record missing what a Designer needs', () => {
  const { permissions, ...noPermissions } = byWord.get('stage-read');
  assert.equal(validateRecord(noPermissions).valid, false);
  assert.equal(validateRecord({ ...byWord.get('hero'), placement: 'sidebar' }).valid, false);
  assert.equal(validateRecord({ ...byWord.get('hero'), surprise: true }).valid, false);
});

test('the catalog has exactly the words the parser knows, one file each', () => {
  const kinds = setFrom('KINDS');
  assert.deepEqual([...byWord.keys()].sort(), [...kinds].sort());
  for (const r of records) assert.ok(existsSync(join(ROOT, 'components', `${r.word}.json`)));
});

test('the grammar roles are the parser\'s roles', () => {
  assert.deepEqual([...GRAMMAR.roles].sort(), [...setFrom('ROLES')].sort());
});

test('every template parses with no errors where its record says it goes', () => {
  for (const r of records) {
    const { errors } = parse(exampleApp(r));
    assert.deepEqual(errors, [], `${r.word}: ${exampleApp(r)}`);
  }
});

test('placement is true: a row word off a row screen, or a screen word on one, is refused', () => {
  for (const r of records.filter((x) => x.placement === 'row')) {
    assert.ok(parse(exampleApp(r, { placement: 'screen' })).errors.length, `${r.word} should be refused off a row screen`);
  }
  for (const r of records.filter((x) => x.placement === 'screen')) {
    assert.ok(parse(exampleApp(r, { placement: 'row' })).errors.length, `${r.word} should be refused on a row screen`);
  }
  for (const r of records.filter((x) => x.placement === 'any')) {
    assert.deepEqual(parse(exampleApp(r, { placement: 'row' })).errors, [], `${r.word} should work on a row screen too`);
  }
});

test('a row-field label is enforced: anything but one {row.field} is refused', () => {
  for (const r of records.filter((x) => x.label === 'row-field')) {
    const loose = { ...r, template: `${r.word} "Some words"` };
    assert.ok(parse(exampleApp(loose)).errors.length, r.word);
  }
});

test('since is true for words the parser gates by version', () => {
  for (const r of records.filter((x) => Number(x.since) >= 0.5)) {
    const before = versions[versions.indexOf(r.since) - 1];
    assert.deepEqual(parse(exampleApp(r, { version: r.since })).errors, [], `${r.word} at ${r.since}`);
    assert.ok(parse(exampleApp(r, { version: before })).errors.some((e) => e.message.includes(r.word)), `${r.word} at ${before}`);
  }
});

test('rendering is true: drawn words have a branch in the renderer, placeholders do not', () => {
  for (const r of records) {
    const named = renderSource.includes(`'${r.word}'`);
    assert.equal(named, r.rendering === 'drawn', `${r.word} is marked ${r.rendering}`);
  }
});

test('components and pins agree with the component store', async () => {
  const named = new Set(records.map((r) => r.component).filter(Boolean));
  assert.deepEqual([...named].sort(), [...PINNABLE].sort(), 'a component in the catalog must be pinnable, and every pinnable component must draw a word');
  const pins = await pinsFromManifest();
  const manifest = JSON.parse(readFileSync(join(REPO, 'packages/soma-puppet-runtime/site/public/vendor/manifest.json'), 'utf8'));
  const doc = await buildCatalog();
  for (const r of doc.components) {
    if (!r.component) {
      assert.equal(r.pin, null, r.word);
      continue;
    }
    assert.equal(r.pin.hash, manifest[r.component].latest, r.word);
    assert.equal(r.pin.hash, pins[r.component]);
    assert.ok(existsSync(join(REPO, 'packages/soma-puppet-runtime/site/public/vendor', `${r.component}@${r.pin.hash}`)), `${r.word}: the pinned build is served`);
    assert.deepEqual(parse(`puppet "x" version "0.7"\n${r.pin.uses}\nscreen "A" {\n  text "a"\n}\n`).errors, [], `${r.word}: ${r.pin.uses}`);
  }
});

test('every source, test and docs path in a record exists', () => {
  for (const r of records) {
    for (const p of [...r.source, ...r.tests, r.docs.split('#')[0]]) assert.ok(existsSync(join(REPO, p)), `${r.word}: ${p}`);
  }
});

test('a component\'s export is a function its source exports', () => {
  for (const r of records.filter((x) => x.export)) {
    const text = r.source.map((p) => readFileSync(join(REPO, p), 'utf8')).join('\n');
    assert.match(text, new RegExp(`export function ${r.export}\\b`), r.word);
  }
});

test('catalog.json is up to date and carries no pins (pins are read live)', () => {
  assert.equal(readFileSync(join(ROOT, 'catalog.json'), 'utf8'), `${JSON.stringify(catalog(records), null, 2)}\n`);
  execFileSync(process.execPath, [join(ROOT, 'bin/soma-catalog.mjs'), 'check'], { stdio: 'pipe' });
});

test('find matches word, tag and summary, every term', () => {
  assert.deepEqual(find(records, 'voice tts').map((r) => r.word).sort(), ['stage-read', 'video-read']);
  assert.ok(find(records, 'storyboard').some((r) => r.word === 'video-storyboards'));
  assert.equal(find(records, 'nothing-matches-this').length, 0);
});

test('skeleton writes an app the parser accepts, with pins when asked', async () => {
  const pins = await pinsFromManifest();
  const result = skeleton(
    { title: 'Audition pieces', data: { name: 'pieces', fields: ['title', 'play', 'text'], read: 'private' }, home: ['text'], row: ['play-view', 'stage-read'], pin: true },
    { pins },
  );
  assert.deepEqual(result.errors, [], result.source);
  assert.match(result.source, /^puppet "Audition pieces" version "0\.4"$/m);
  assert.match(result.source, new RegExp(`^uses soma-play@${pins['soma-play']}$`, 'm'));
  assert.match(result.source, /stage-read "\{row\.text\}"/);
  assert.match(result.source, /read: private/);
});

test('skeleton takes the version its newest word needs', () => {
  const result = skeleton({ title: 'Videos', data: { name: 'scripts', fields: ['title', 'text'] }, home: ['video-storyboards'], row: ['script-editor', 'video-view'] });
  assert.deepEqual(result.errors, [], result.source);
  assert.equal(result.version, '0.7');
  assert.deepEqual(result.uses, []);
});

test('skeleton refuses unknown words and wrong placement before writing anything', () => {
  const r1 = skeleton({ title: 'X', data: { name: 'items', fields: ['title'] }, home: ['stage-read'] });
  assert.equal(r1.source, null);
  assert.match(r1.errors[0].message, /stage-read goes only on the row screen/);
  const r2 = skeleton({ title: 'X', data: { name: 'items', fields: ['title'] }, row: ['video-storyboards'] });
  assert.match(r2.errors[0].message, /not from data/);
  const r3 = skeleton({ title: 'X', data: { name: 'items', fields: ['title'] }, home: ['flux-capacitor'] });
  assert.match(r3.errors[0].message, /not a Puppet word/);
  const r4 = skeleton({ title: 'X', data: { name: 'Bad Name', fields: [] } });
  assert.equal(r4.errors.length, 2);
});
