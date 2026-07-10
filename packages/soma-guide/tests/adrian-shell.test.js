/**
 * Adrian shell via soma-assist-core — smoke tests.
 * Ensures guide mounts with createAssistChip when available.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const CORE_SRC = fs.readFileSync(path.join(ROOT, 'vendor', 'soma-assist-core.js'), 'utf8');
const GUIDE_SRC = fs.readFileSync(path.join(ROOT, 'soma-guide.js'), 'utf8');

function makeWindow() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  const win = dom.window;
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, width: 360, height: 480, right: 360, bottom: 480, toJSON() { return this; } };
  };
  Object.defineProperty(win, 'innerWidth', { value: 1280, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true });

  const s1 = win.document.createElement('script');
  s1.textContent = CORE_SRC;
  win.document.body.appendChild(s1);

  const s2 = win.document.createElement('script');
  s2.textContent = GUIDE_SRC;
  win.document.body.appendChild(s2);

  return win;
}

const CFG = {
  persona: {
    name: 'Adrian',
    id: 'adrian',
    avatar: '🧭',
    greeting: 'Hello from Adrian',
    shortGreeting: 'Welcome back',
    walkthroughDone: 'Done'
  },
  siteMap: [],
  walkthroughs: [],
  conversationalShell: true
};

describe('Adrian shell (soma-assist-core)', () => {
  test('createAssistChip is available after vendor load', () => {
    const win = makeWindow();
    assert.equal(typeof win.createAssistChip, 'function');
  });

  test('SomaGuide mounts with assist core shell', () => {
    const win = makeWindow();
    const g = new win.SomaGuide(CFG);
    assert.ok(g._assist, 'guide should hold _assist API');
    assert.equal(typeof g._assist.open, 'function');
    const host = win.document.querySelector('[data-soma-assist-app]');
    assert.ok(host, 'assist host in DOM');
    assert.ok(host.shadowRoot, 'shadow root present');
  });

  test('open / minimize go through core chip', () => {
    const win = makeWindow();
    const g = new win.SomaGuide(CFG);
    g.open();
    assert.equal(g._assist.isOpen(), true);
    g.minimize();
    assert.equal(g._assist.isOpen(), false);
    assert.equal(g.mode, 'minimized');
  });

  test('legacy shell still works without core when forced', () => {
    const win = makeWindow();
    // Simulate missing core
    win.createAssistChip = undefined;
    win.SomaAssistCore = undefined;
    const g = new win.SomaGuide(Object.assign({}, CFG, { shell: 'legacy' }));
    assert.equal(g._assist, null);
    assert.ok(win.document.getElementById('soma-guide'));
  });

  test('user-facing persona name is Adrian', () => {
    const win = makeWindow();
    const g = new win.SomaGuide(CFG);
    assert.equal(g.cfg.persona.name, 'Adrian');
    const title = g._assist.el.shadowRoot.querySelector('.sac-header-title');
    assert.equal(title.textContent, 'Adrian');
  });
});
