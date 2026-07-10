/**
 * Smoke tests for soma-assist-core: open / drag / resize / persistence.
 * Run: npm test (from packages/soma-assist-core)
 */
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const DIST_JS = path.join(ROOT, 'dist', 'soma-assist-core.js');

function makeWindow() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const win = dom.window;
  // jsdom lacks layout; stub geometry used by drag/resize
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    const left = parseFloat(this.style.left) || 0;
    const top = parseFloat(this.style.top) || 0;
    const width = parseFloat(this.style.width) || (this.classList?.contains?.('sac-window') ? 360 : 120);
    const height = parseFloat(this.style.height) || (this.classList?.contains?.('sac-window') ? 480 : 48);
    return {
      x: left, y: top, left, top, width, height,
      right: left + width, bottom: top + height,
      toJSON() { return this; },
    };
  };
  Object.defineProperty(win, 'innerWidth', { value: 1280, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true });
  // Inject via <script> so the UMD root resolves to the jsdom window
  const script = win.document.createElement('script');
  script.textContent = fs.readFileSync(DIST_JS, 'utf8');
  win.document.body.appendChild(script);
  return win;
}

describe('soma-assist-core', () => {
  before(() => {
    assert.ok(fs.existsSync(DIST_JS), 'dist/soma-assist-core.js must exist (run npm run build)');
  });

  test('exposes createAssistChip on window', () => {
    const win = makeWindow();
    assert.equal(typeof win.createAssistChip, 'function');
    assert.equal(typeof win.SomaAssistCore.createAssistChip, 'function');
  });

  test('chip mounts into document and starts minimized', () => {
    const win = makeWindow();
    const api = win.createAssistChip({ appId: 'test-a', title: 'TestBot', avatar: '🤖' });
    const host = win.document.querySelector('[data-soma-assist-app="test-a"]');
    assert.ok(host, 'host element present');
    assert.equal(api.isOpen(), false);
    const shadow = host.shadowRoot;
    assert.ok(shadow, 'shadow root present');
    assert.ok(shadow.querySelector('[data-sac="chip"]'));
    assert.ok(shadow.querySelector('[data-sac="window"]'));
  });

  test('open / close toggles window visibility class', () => {
    const win = makeWindow();
    const api = win.createAssistChip({ appId: 'test-open', title: 'OpenMe' });
    const root = api.el.shadowRoot.querySelector('.sac-root');
    assert.ok(!root.classList.contains('sac--open'));
    api.open();
    assert.equal(api.isOpen(), true);
    assert.ok(root.classList.contains('sac--open'));
    api.close();
    assert.equal(api.isOpen(), false);
    assert.ok(!root.classList.contains('sac--open'));
  });

  test('addMessage appends user and assistant bubbles', () => {
    const win = makeWindow();
    const api = win.createAssistChip({ appId: 'test-msg', title: 'Msg' });
    api.open();
    api.addMessage('user', 'hello');
    api.addMessage('assistant', 'hi there');
    const msgs = api.el.shadowRoot.querySelectorAll('.sac-msg');
    assert.equal(msgs.length, 2);
    assert.ok(msgs[0].classList.contains('sac-msg--user'));
    assert.ok(msgs[1].classList.contains('sac-msg--assistant'));
    assert.equal(msgs[0].textContent, 'hello');
  });

  test('onUserMessage fires when send is clicked', () => {
    const win = makeWindow();
    let got = null;
    const api = win.createAssistChip({
      appId: 'test-send',
      title: 'Send',
      onUserMessage(text) { got = text; },
    });
    api.open();
    const input = api.el.shadowRoot.querySelector('[data-sac="input"]');
    const send = api.el.shadowRoot.querySelector('[data-sac="send"]');
    input.value = 'ping';
    send.click();
    assert.equal(got, 'ping');
    const userMsgs = api.el.shadowRoot.querySelectorAll('.sac-msg--user');
    assert.equal(userMsgs.length, 1);
    assert.equal(userMsgs[0].textContent, 'ping');
  });

  test('persistence writes namespaced localStorage keys', () => {
    const win = makeWindow();
    const api = win.createAssistChip({ appId: 'persist-1', title: 'P' });
    api.open();
    // Simulate geometry change via internal state + persist by close/open cycle
    // Drag: fire mousedown on header + mousemove
    const header = api.el.shadowRoot.querySelector('[data-sac="header"]');
    header.dispatchEvent(new win.MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
    win.document.dispatchEvent(new win.MouseEvent('mousemove', { clientX: 250, clientY: 180, bubbles: true }));
    win.document.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }));

    const x = win.localStorage.getItem('soma-assist:persist-1:x');
    const y = win.localStorage.getItem('soma-assist:persist-1:y');
    const w = win.localStorage.getItem('soma-assist:persist-1:w');
    const h = win.localStorage.getItem('soma-assist:persist-1:h');
    assert.ok(x != null && x !== '', 'x persisted');
    assert.ok(y != null && y !== '', 'y persisted');
    assert.ok(w, 'w persisted');
    assert.ok(h, 'h persisted');
    assert.equal(win.localStorage.getItem('soma-assist:persist-1:open'), '1');
  });

  test('restore position/size on new instance with same appId', () => {
    const win = makeWindow();
    win.localStorage.setItem('soma-assist:restore-1:x', '111');
    win.localStorage.setItem('soma-assist:restore-1:y', '222');
    win.localStorage.setItem('soma-assist:restore-1:w', '400');
    win.localStorage.setItem('soma-assist:restore-1:h', '500');

    const api = win.createAssistChip({ appId: 'restore-1', title: 'R' });
    const st = api.getState();
    assert.equal(st.left, 111);
    assert.equal(st.top, 222);
    assert.equal(st.width, 400);
    assert.equal(st.height, 500);
  });

  test('resize se handle updates size and persists', () => {
    const win = makeWindow();
    const api = win.createAssistChip({ appId: 'resize-1', title: 'Rsz' });
    api.open();
    // Seed left/top so resize math is consistent
    win.localStorage.setItem('soma-assist:resize-1:x', '50');
    win.localStorage.setItem('soma-assist:resize-1:y', '50');
    api.destroy();

    const api2 = win.createAssistChip({ appId: 'resize-1', title: 'Rsz' });
    api2.open();
    const se = api2.el.shadowRoot.querySelector('[data-resize="se"]');
    const before = api2.getState();
    se.dispatchEvent(new win.MouseEvent('mousedown', { clientX: 400, clientY: 500, bubbles: true }));
    win.document.dispatchEvent(new win.MouseEvent('mousemove', { clientX: 460, clientY: 560, bubbles: true }));
    win.document.dispatchEvent(new win.MouseEvent('mouseup', { bubbles: true }));
    const after = api2.getState();
    assert.ok(after.width >= before.width, 'width grew or stayed (clamped)');
    assert.ok(after.height >= before.height, 'height grew or stayed');
    assert.ok(win.localStorage.getItem('soma-assist:resize-1:w'));
  });

  test('setStatus shows and clears status bar', () => {
    const win = makeWindow();
    const api = win.createAssistChip({ appId: 'status-1', title: 'S' });
    api.setStatus('Working…');
    const el = api.el.shadowRoot.querySelector('[data-sac="status"]');
    assert.equal(el.hidden, false);
    assert.equal(el.textContent, 'Working…');
    api.setStatus('');
    assert.equal(el.hidden, true);
  });

  test('destroy removes host from DOM', () => {
    const win = makeWindow();
    const api = win.createAssistChip({ appId: 'destroy-1', title: 'D' });
    assert.ok(win.document.querySelector('[data-soma-assist-app="destroy-1"]'));
    api.destroy();
    assert.equal(win.document.querySelector('[data-soma-assist-app="destroy-1"]'), null);
  });
});
