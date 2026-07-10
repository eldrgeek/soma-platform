'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../dist/soma-assist-core.js'), 'utf8');

function setup() {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost', runScripts: 'dangerously', pretendToBeVisual: true });
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1200 });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 800 });
  dom.window.eval(source);
  return dom.window;
}

function pointer(win, target, type, x, y) {
  target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
}

describe('soma-assist-core', () => {
  test('mounts in Shadow DOM and opens from the chip', () => {
    const win = setup();
    const api = win.SomaAssistCore.createAssistChip({ appId: 'test', title: 'Test Assistant' });
    const chip = api.shadowRoot.querySelector('[data-assist-chip]');
    const panel = api.shadowRoot.querySelector('[data-assist-window]');
    assert.equal(panel.hidden, true);
    chip.click();
    assert.equal(panel.hidden, false);
    assert.equal(chip.hidden, true);
  });

  test('submits a user message to the configured handler', () => {
    const win = setup();
    let received = '';
    const api = win.SomaAssistCore.createAssistChip({ appId: 'messages', onUserMessage: text => { received = text; return 'Received'; } });
    api.open();
    const input = api.shadowRoot.querySelector('[data-assist-input]');
    input.value = 'hello';
    api.shadowRoot.querySelector('[data-assist-composer]').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(received, 'hello');
    assert.equal(api.shadowRoot.querySelectorAll('[data-assist-message]').length, 2);
  });

  test('drag and resize persist namespaced geometry', () => {
    const win = setup();
    const api = win.SomaAssistCore.createAssistChip({ appId: 'geometry' });
    api.open();
    const panel = api.shadowRoot.querySelector('[data-assist-window]');
    const startLeft = parseInt(panel.style.left, 10);
    const startTop = parseInt(panel.style.top, 10);
    const startWidth = parseInt(panel.style.width, 10);
    const startHeight = parseInt(panel.style.height, 10);
    const header = api.shadowRoot.querySelector('[data-assist-drag-handle]');
    pointer(win, header, 'pointerdown', 900, 100);
    pointer(win, win, 'pointermove', 800, 40);
    pointer(win, win, 'pointerup', 800, 40);
    assert.equal(parseInt(panel.style.left, 10), startLeft - 100);
    assert.equal(parseInt(panel.style.top, 10), startTop - 60);

    const se = api.shadowRoot.querySelector('[data-edge="se"]');
    pointer(win, se, 'pointerdown', 900, 600);
    pointer(win, win, 'pointermove', 960, 640);
    pointer(win, win, 'pointerup', 960, 640);
    assert.equal(parseInt(panel.style.width, 10), startWidth + 60);
    assert.equal(parseInt(panel.style.height, 10), startHeight + 40);

    const saved = JSON.parse(win.localStorage.getItem('soma-assist:geometry:geometry'));
    assert.equal(saved.x, startLeft - 100);
    assert.equal(saved.y, startTop - 60);
    assert.equal(saved.width, startWidth + 60);
    assert.equal(saved.height, startHeight + 40);
  });

  test('restores geometry in a new instance after reload', () => {
    const win = setup();
    win.localStorage.setItem('soma-assist:persist:geometry', JSON.stringify({ x: 140, y: 90, width: 510, height: 430 }));
    const api = win.SomaAssistCore.createAssistChip({ appId: 'persist' });
    api.open();
    const panel = api.shadowRoot.querySelector('[data-assist-window]');
    assert.deepEqual(
      [panel.style.left, panel.style.top, panel.style.width, panel.style.height],
      ['140px', '90px', '510px', '430px']
    );
  });
});
