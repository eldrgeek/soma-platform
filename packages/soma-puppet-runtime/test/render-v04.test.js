// The v0.4 renderer on a fake DOM: row screens and Back, drawn dialogs, the
// tab bar only with two or more tabs, and the soma-play components.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mountPlayView } from '../../soma-play/src/play-view.js';
import { parse } from '../src/parser.js';
import { render } from '../src/render.js';
import { mount } from './fake-dom.js';

const SKETCH = parse(await readFile(new URL('../examples/monologues.puppet', import.meta.url), 'utf8')).sketch;
const PIECES = [
  { id: 'r-1', title: 'Hamlet', play: 'Hamlet', text: 'HAMLET: To be, or not to be.' },
  { id: 'r-2', title: 'Medea', play: 'Medea', text: 'MEDEA\n(alone)\nI will not weep.' },
];
const button = (root, text) => root.all().find((node) => node.tagName === 'BUTTON' && node.textContent === text);
const rows = (root) => root.querySelectorAll('.puppet-runtime-list-row');

test('one tabbed screen draws no tab bar', () => {
  const root = mount();
  render(SKETCH, { root, data: { pieces: PIECES }, me: { name: 'Theo' } });
  assert.equal(root.querySelector('.puppet-runtime-tabs'), null);
  assert.match(root.textContent, /Only you can read these, Theo\./);
  assert.match(root.textContent, /2 pieces/);
});

test('choosing a row opens its screen with {row.field}; Back returns; a redraw keeps the row', async () => {
  const root = mount();
  const components = { 'play-view': (node, text) => { node.textContent = `PLAY:${text}`; return {}; } };
  render(SKETCH, { root, data: { pieces: PIECES }, me: { name: 'Theo' }, components });
  await rows(root)[1].click();
  assert.equal(root.dataset.puppetScreen, 'Piece');
  assert.equal(root.dataset.puppetRow, 'r-2');
  assert.match(root.querySelector('.puppet-runtime-hero').textContent, /Medea/);
  assert.match(root.querySelector('.puppet-runtime-play-view').textContent, /PLAY:MEDEA\n\(alone\)\nI will not weep\./);
  assert.ok(button(root, '← Back'), 'a row screen has a Back button');

  render(SKETCH, { root, data: { pieces: PIECES }, me: { name: 'Theo' }, components });
  assert.match(root.querySelector('.puppet-runtime-hero').textContent, /Medea/, 'a redraw with fresh data keeps the row');

  await button(root, '← Back').click();
  assert.equal(root.dataset.puppetScreen, 'My pieces');

  await rows(root)[0].click();
  render(SKETCH, { root, data: { pieces: [PIECES[1]] }, me: {}, components });
  assert.equal(root.querySelector('.puppet-runtime-hero').textContent.includes('Hamlet'), false);
  assert.match(root.textContent, /My pieces/, 'when the row is gone the screen goes back');
});

test('a button on a row screen acts on its row', async () => {
  const root = mount();
  const sent = [];
  render(SKETCH, { root, data: { pieces: PIECES }, me: {}, onAction: (action) => sent.push(action) });
  await rows(root)[0].click();
  await button(root, 'Delete this piece').click();
  assert.deepEqual(sent, [{ type: 'remove', target: 'pieces', rowId: 'r-1' }]);
});

test('a dialog opens over the screen and closes', async () => {
  const root = mount();
  render(SKETCH, { root, data: { pieces: [] }, me: {} });
  await button(root, 'How to write a piece').click();
  const dialog = root.querySelector('.puppet-runtime-dialog');
  assert.ok(dialog);
  assert.match(dialog.textContent, /Put stage directions in parentheses/);
  await button(root, 'Close').click();
  assert.equal(root.querySelector('.puppet-runtime-dialog'), null);
  await button(root, 'How to write a piece').click();
  await button(root, '✕').click();
  assert.equal(root.querySelector('.puppet-runtime-dialog'), null);
});

test('stage-read gets the row address, and highlights the play-view of the same field', async () => {
  const root = mount();
  let given;
  const lit = [];
  const components = {
    'play-view': () => ({ highlight: (index) => lit.push(index) }),
    'stage-read': (node, options) => { given = options; return {}; },
  };
  render(SKETCH, { root, data: { pieces: PIECES }, me: {}, components });
  await rows(root)[1].click();
  assert.deepEqual({ data: given.data, rowId: given.rowId, field: given.field, text: given.text }, {
    data: 'pieces', rowId: 'r-2', field: 'text', text: 'MEDEA\n(alone)\nI will not weep.',
  });
  given.onActive(0);
  given.onActive(null);
  assert.deepEqual(lit, [0, null]);
});

test('the real play-view draws Diana blocks: cue and speech together, directions apart', () => {
  const root = mount();
  const view = mountPlayView(root, '## Act 1 Scene 1\n(Lights up.)\nMEDEA\n(alone)\nI will not weep.\n\nShe crosses to the door.');
  const classes = root.all().map((node) => node.className).filter((name) => name.startsWith('soma-play-'));
  assert.ok(classes.includes('soma-play-heading'));
  assert.ok(classes.includes('soma-play-direction soma-play-technical'), 'lights stay at the margin');
  assert.ok(classes.includes('soma-play-direction'), 'a narrative direction');
  const speech = root.querySelector('.soma-play-speech');
  assert.match(speech.textContent, /^MEDEA\(alone\)I will not weep\.$/);
  assert.equal(view.blocks.length, 4);
});

test('a list that opens a row screen shows a title and one-line values cut short; a value of several lines waits for the row screen', async () => {
  const root = mount();
  const long = { id: 'r-9', title: 'Long', play: 'x'.repeat(120), text: 'FIRST LINE\nsecond line' };
  render(SKETCH, { root, data: { pieces: [long] }, me: {} });
  assert.equal(root.querySelector('.puppet-runtime-list-title').textContent, 'Long');
  assert.equal(root.querySelector('.puppet-runtime-list-sub').textContent, `${'x'.repeat(80)}…`);
  assert.ok(!rows(root)[0].textContent.includes('FIRST LINE'));
  assert.match(rows(root)[0].className, /puppet-runtime-list-opens/);
});
