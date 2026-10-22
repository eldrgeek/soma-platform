// The v0.3 renderer on a minimal fake DOM: host-only screens, buttons on
// every row, date fields, and the checks made before a row is sent.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { parse } from '../src/parser.js';
import { render } from '../src/render.js';

class FakeNode {
  constructor(tag, document) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = document;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.className = '';
    this.value = '';
    this._text = '';
  }
  set textContent(text) { this._text = String(text); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  get required() { return 'required' in this.attributes; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(value);
    }
  }
  append(...nodes) { this.children.push(...nodes); nodes.forEach((node) => { node.parent = this; }); }
  replaceChildren() { this.children = []; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  async click() { for (const listener of this.listeners.click ?? []) await listener({}); }
  all() { return this.children.flatMap((child) => [child, ...child.all()]); }
  querySelectorAll(selector) {
    if (selector === '[data-puppet-field]') return this.all().filter((node) => 'puppetField' in node.dataset);
    const className = selector.replace(/^\./, '');
    return this.all().filter((node) => node.className.split(' ').includes(className));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

function mount() {
  const document = { createElement: (tag) => new FakeNode(tag, document) };
  return new FakeNode('div', document);
}

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
