'use strict';

/**
 * Tests for the cross-navigation session persistence logic.
 *
 * Tests patchAriadneSession (extracted from background.js) and ariadne-gate
 * behaviour using a mock sessionStorage + mock somaGuide engine.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

/* ── Extract patchAriadneSession from background.js ───────────────────────
 * The function is defined at module scope in background.js (no closure over
 * bg variables), so we can pull it out with a regex and eval it.           */
const fs   = require('node:fs');
const path = require('node:path');

const bgSrc = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

// Extract the patchAriadneSession function body.
const fnMatch = bgSrc.match(/function patchAriadneSession\([\s\S]*?\n\}/);
assert.ok(fnMatch, 'patchAriadneSession not found in background.js');
const patchAriadneSession = eval('(' + fnMatch[0] + ')'); // eslint-disable-line no-eval

/* ── Mock sessionStorage ──────────────────────────────────────────────── */
function makeSessionStorage() {
  const store = {};
  return {
    getItem:    (k) => store[k] ?? null,
    setItem:    (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _store:     store,
  };
}

/* ── Mock somaGuide engine ────────────────────────────────────────────── */
function makeMockGuide() {
  const calls = [];
  return {
    mode: 'walkthrough',
    _ariadnePatched: false,
    _minimize() { calls.push('_minimize'); this.mode = 'minimized'; },
    open()      { calls.push('open'); this.mode = 'open'; },
    minimize()  { this._minimize(); },
    _calls: calls,
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/**
 * Set up the fake MAIN-world globals and run patchAriadneSession.
 * Returns a cleanup function; call it after all assertions that rely on
 * the patched callbacks (since the closures capture the bare `sessionStorage`
 * identifier from the global scope).
 */
function runPatch(ss, guide, closeBtn, isResume) {
  global.sessionStorage = ss;
  global.window = { somaGuide: guide };
  global.document = {
    querySelector: (sel) => sel === '.sg-btn-close' ? closeBtn : null,
  };
  patchAriadneSession(isResume);
  // Return a cleanup to restore after callbacks have been exercised.
  return function cleanup() {
    delete global.sessionStorage;
    delete global.window;
    delete global.document;
  };
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe('patchAriadneSession — first activation', () => {
  test('sets somaAriadneActive=1', () => {
    const ss = makeSessionStorage();
    const cleanup = runPatch(ss, makeMockGuide(), null, false);
    assert.equal(ss.getItem('somaAriadneActive'), '1');
    cleanup();
  });

  test('sets somaAriadneMode=open on first activation', () => {
    const ss = makeSessionStorage();
    const cleanup = runPatch(ss, makeMockGuide(), null, false);
    assert.equal(ss.getItem('somaAriadneMode'), 'open');
    cleanup();
  });

  test('marks guide as patched', () => {
    const ss = makeSessionStorage();
    const guide = makeMockGuide();
    const cleanup = runPatch(ss, guide, null, false);
    assert.ok(guide._ariadnePatched);
    cleanup();
  });

  test('dismiss hook: close button click sets active=0', () => {
    const ss = makeSessionStorage();
    const guide = makeMockGuide();
    let captureListener = null;
    const closeBtn = {
      addEventListener(ev, fn, capture) { captureListener = fn; },
    };
    const cleanup = runPatch(ss, guide, closeBtn, false);
    assert.ok(captureListener, 'listener should be registered');

    // Simulate click — globals must still be set so the closure resolves sessionStorage.
    captureListener();
    assert.equal(ss.getItem('somaAriadneActive'), '0');
    cleanup();
  });

  test('_minimize patch saves mode=minimized', () => {
    const ss = makeSessionStorage();
    const guide = makeMockGuide();
    const cleanup = runPatch(ss, guide, null, false);

    // Trigger patched _minimize — globals must still be set.
    guide._minimize();
    assert.equal(ss.getItem('somaAriadneMode'), 'minimized');
    cleanup();
  });

  test('open patch saves mode=open', () => {
    const ss = makeSessionStorage();
    const guide = makeMockGuide();
    const cleanup = runPatch(ss, guide, null, false);

    guide._minimize(); // minimise first
    guide.open();       // then re-open
    assert.equal(ss.getItem('somaAriadneMode'), 'open');
    cleanup();
  });
});

describe('patchAriadneSession — cross-nav resume', () => {
  test('does not call minimize when saved mode is open', () => {
    const ss = makeSessionStorage();
    ss.setItem('somaAriadneMode', 'open');
    const guide = makeMockGuide();
    const cleanup = runPatch(ss, guide, null, true);
    assert.ok(!guide._calls.includes('_minimize'));
    cleanup();
  });

  test('calls minimize when saved mode is minimized', () => {
    const ss = makeSessionStorage();
    ss.setItem('somaAriadneMode', 'minimized');
    const guide = makeMockGuide();
    const cleanup = runPatch(ss, guide, null, true);
    assert.ok(guide._calls.includes('_minimize'), 'should restore minimized state');
    cleanup();
  });

  test('still sets active=1 on resume (re-asserts flag)', () => {
    const ss = makeSessionStorage();
    ss.setItem('somaAriadneActive', '1'); // was already 1 from previous page
    const guide = makeMockGuide();
    const cleanup = runPatch(ss, guide, null, true);
    assert.equal(ss.getItem('somaAriadneActive'), '1');
    cleanup();
  });
});

describe('patchAriadneSession — re-patch guard', () => {
  test('does not double-patch if already patched', () => {
    const ss = makeSessionStorage();
    const guide = makeMockGuide();
    const cleanup1 = runPatch(ss, guide, null, false); // first call patches
    const patchedMinimize = guide._minimize;

    const cleanup2 = runPatch(ss, guide, null, false); // second call — should bail early
    assert.equal(guide._minimize, patchedMinimize, '_minimize should not be wrapped again');
    cleanup1(); cleanup2();
  });
});

describe('patchAriadneSession — no guide (engine not yet ready)', () => {
  test('does not throw when somaGuide is absent', () => {
    const ss = makeSessionStorage();
    // guide=null simulates engine not yet present (shouldn't happen in practice,
    // but the gate could theoretically race on very slow pages).
    let cleanup;
    assert.doesNotThrow(() => { cleanup = runPatch(ss, null, null, false); });
    cleanup?.();
  });

  test('still sets active=1 even when guide is absent', () => {
    const ss = makeSessionStorage();
    const cleanup = runPatch(ss, null, null, false);
    assert.equal(ss.getItem('somaAriadneActive'), '1');
    cleanup();
  });
});

describe('ariadne-gate sessionStorage semantics', () => {
  test('gate sends message only when active=1', () => {
    // Verify the gate condition directly (extracted from ariadne-gate.js).
    // In a real tab, sessionStorage is per-tab+origin; here we just verify logic.
    const messages = [];
    const mockChrome = {
      runtime: { sendMessage: (m) => messages.push(m) },
    };

    function runGate(activeValue) {
      const ss = makeSessionStorage();
      if (activeValue !== null) ss.setItem('somaAriadneActive', activeValue);
      // Simulate the gate script body.
      if (ss.getItem('somaAriadneActive') === '1') {
        mockChrome.runtime.sendMessage({ type: 'ariadne-resume' });
      }
    }

    runGate('1');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'ariadne-resume');

    runGate('0');
    assert.equal(messages.length, 1, 'should not send for active=0');

    runGate(null);
    assert.equal(messages.length, 1, 'should not send when flag absent (fresh tab)');
  });
});
