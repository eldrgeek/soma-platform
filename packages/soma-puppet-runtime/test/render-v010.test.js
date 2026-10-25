// The v0.10 renderer on a fake DOM: doc-import and play-print get what they need, and print the
// rows the page was given, in stored order.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from '../src/parser.js';
import { render } from '../src/render.js';
import { mount } from './fake-dom.js';

const SKETCH = parse(await readFile(new URL('../examples/table-read.puppet', import.meta.url), 'utf8')).sketch;
const SCENES = [
  { id: 'r-1', act: 'ACT ONE', title: 'SCENE ONE', text: 'SCENE ONE\n\nSAM\nOne.' },
  { id: 'r-2', act: 'ACT ONE', title: 'SCENE TWO', text: 'SCENE TWO\n\nANA\nTwo.' },
];

test('doc-import gets its data and whether an act is kept; play-print gets the whole play in order', () => {
  const root = mount();
  const given = {};
  const components = {
    'doc-import': (node, options) => { given.doc = options; return {}; },
    'play-print': (node, options) => { (given.print ??= []).push(options); return {}; },
  };
  render(SKETCH, { root, data: { scenes: SCENES }, me: { name: 'Theo' }, components });
  assert.deepEqual(given.doc, { data: 'scenes', withAct: true });
  assert.equal(given.print.length, 1);
  assert.equal(given.print[0].title, 'Table Read');
  assert.equal(given.print[0].getText(), 'SCENE ONE\n\nSAM\nOne.\n\nSCENE TWO\n\nANA\nTwo.');
});

test('on a row screen, play-print prints that row\'s field', async () => {
  const root = mount();
  const prints = [];
  const components = { 'play-print': (node, options) => { prints.push(options); return {}; } };
  render(SKETCH, { root, data: { scenes: SCENES }, me: {}, components });
  await root.querySelectorAll('.puppet-runtime-list-row')[1].click();
  assert.equal(prints.at(-1).getText(), 'SCENE TWO\n\nANA\nTwo.');
});

test('without the components the page says what is missing instead of drawing a dead button', () => {
  const root = mount();
  render(SKETCH, { root, data: { scenes: [] }, me: {} });
  assert.match(root.textContent, /Google Doc import is not available here\./);
  assert.match(root.textContent, /Printing is not available here\./);
});
