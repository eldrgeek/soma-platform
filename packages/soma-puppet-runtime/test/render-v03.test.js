// The v0.3 renderer on a minimal fake DOM: host-only screens, buttons on
// every row, date fields, and the checks made before a row is sent.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from '../src/parser.js';
import { render } from '../src/render.js';
import { mount } from './fake-dom.js';

const V3 = parse(await readFile(new URL('../examples/sunday-supper-v3.puppet', import.meta.url), 'utf8')).sketch;
const tabs = (root) => root.all().filter((node) => node.parent?.tagName === 'NAV').map((node) => node.textContent);
const button = (root, text) => root.all().find((node) => node.tagName === 'BUTTON' && node.textContent === text);
const requests = [
  { id: 'r-1', who: 'Theo', guest: 'Mo', sunday: '2026-10-25', status: 'pending' },
  { id: 'r-2', who: 'Ana', guest: 'Jo', sunday: '2026-11-01', status: 'confirmed' },
];

test('a guest never sees the host-only screen; the host sees it marked "only you"', () => {
  const guest = mount();
  render(V3, { root: guest, data: {}, me: { name: 'Theo' } });
  assert.deepEqual(tabs(guest), ['Next supper', "Who's bringing what", 'Bring a guest']);
  const host = mount();
  render(V3, { root: host, data: {}, me: { name: 'Rosa' }, host: true });
  assert.deepEqual(tabs(host).at(-1), "Rosa's listonly you");
});

test('buttons inside a table act on their row and send the status to set', async () => {
  const root = mount();
  const sent = [];
  const view = render(V3, {
    root,
    data: { guest_requests: requests, host_notes: [] },
    me: { name: 'Rosa' },
    host: true,
    onAction: (action) => { sent.push(action); },
  });
  view.selectScreen("Rosa's list");
  const confirms = root.all().filter((node) => node.textContent === 'Confirm' && node.tagName === 'BUTTON');
  assert.equal(confirms.length, 2, 'one Confirm button per row');
  assert.ok(root.all().some((node) => node.className.includes('puppet-runtime-status-confirmed')));
  assert.ok(root.all().some((node) => node.tagName === 'TD' && /Sun/.test(node.textContent)), 'dates show a weekday');
  await confirms[0].click();
  assert.deepEqual(sent, [{ type: 'set-status', target: 'guest_requests', rowId: 'r-1', status: 'confirmed' }]);
});

test('a date field is a date picker, and its day and @required are checked before sending', async () => {
  const root = mount();
  const sent = [];
  const view = render(V3, { root, data: { guest_requests: [] }, me: { name: 'Theo' }, onAction: (action) => sent.push(action) });
  view.selectScreen('Bring a guest');
  const [name, sunday] = root.querySelectorAll('[data-puppet-field]');
  assert.equal(sunday.type, 'date');
  assert.equal(sunday.dataset.puppetDays, 'Sun');
  const ask = button(root, 'Ask Rosa');

  name.value = 'Mo';
  await ask.click();
  assert.match(root.querySelector('.puppet-runtime-toast').textContent, /fill in "Which Sunday\?"/);
  sunday.value = '2026-10-24';
  await ask.click();
  assert.match(root.querySelector('.puppet-runtime-toast').textContent, /must be a Sunday/);
  assert.deepEqual(sent, []);

  sunday.value = '2026-10-25';
  await ask.click();
  assert.deepEqual(sent, [{
    type: 'add',
    target: 'guest_requests',
    row: { who: 'Theo', guest: 'Mo', sunday: '2026-10-25' },
  }]);
});

test('a @select field with items is drawn as a choice list', () => {
  const { sketch } = parse(`puppet "Times" version "0.3"
screen "Home" {
  field "Saturday time" @select @required items: ["Saturday 9:00", "Saturday 9:30"]
  field "Note" @select
}`);
  const root = mount();
  render(sketch, { root, data: {}, me: {} });
  const [time, note] = root.querySelectorAll('[data-puppet-field]');
  assert.equal(time.tagName, 'SELECT');
  assert.equal(time.required, true);
  assert.deepEqual(time.children.map((option) => option.attributes.value), ['', 'Saturday 9:00', 'Saturday 9:30']);
  assert.equal(note.tagName, 'INPUT', 'a @select without items stays a text box');
});
