/**
 * SOMA Guide — narration cue markup + voice connection flow (2026-0610b)
 *
 * Covers:
 *  1. parseNarration / stripCues — syntax, positions, durations, defaults
 *  2. Cue scheduling and execution (highlight/arrow/click/open/close)
 *  3. Scripted steps replace the default choreography; cleanup on stop
 *  4. Voice flow: explicit mic acquisition with status guidance, error
 *     categorization, connect timeout, websocket retry, pinned SDK version
 *
 * Run: npm test
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT      = path.join(__dirname, '..');
const GUIDE_SRC = fs.readFileSync(path.join(ROOT, 'soma-guide.js'), 'utf8');

function makeWindow(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body>' + (opts.bodyHtml || '') + '</body></html>',
    { url: opts.url || 'http://localhost/', runScripts: 'dangerously' }
  );
  const win = dom.window;
  win.eval(`
    window._sessionCalls = [];
    window._sessionBehavior = 'ok';   // 'ok' | 'fail-once' | 'fail' | 'hang'
    window.__importStub = function () {
      return Promise.resolve({ Conversation: { startSession: function (opts) {
        window._sessionCalls.push(opts || {});
        if (window._sessionBehavior === 'hang') return new Promise(function () {});
        if (window._sessionBehavior === 'fail') return Promise.reject(new Error('conn failed'));
        if (window._sessionBehavior === 'fail-once') {
          window._sessionBehavior = 'ok';
          return Promise.reject(new Error('webrtc failed'));
        }
        return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} });
      } } });
    };
    window.fetch = function () {
      return Promise.resolve({ ok: false, status: 404,
        json: function(){ return Promise.resolve({}); },
        blob: function(){ return Promise.resolve(null); } });
    };
  `);
  win.eval(GUIDE_SRC);
  return win;
}

const BASE_CFG = (overrides) => Object.assign({
  persona: { name: 'TestBot', id: 'test-bot', avatar: '🤖',
    greeting: 'Hi!', shortGreeting: 'Hi again!', walkthroughDone: 'Done!' },
  voiceAgentId: 'test-agent-id',
  siteMap: [],
  walkthroughs: [{
    id: 'wt-scripted',
    label: 'Scripted',
    keywords: ['scripted tour'],
    steps: [
      { target: '#tgt', label: 'S1', demo: 'click',
        narration: '[[highlight #tgt]] Hello there my friend, look at this. [[click #tgt]]' },
      { target: 'body', label: 'S2', narration: 'Second step here.' }
    ]
  }]
}, overrides || {});

/* ── 1. Parser ──────────────────────────────────────────────────────────── */

describe('Cues — parseNarration / stripCues', () => {
  test('plain narration parses to itself with no cues', () => {
    const win = makeWindow();
    const p = win.SomaGuide.parseNarration('Just plain words.');
    assert.equal(p.text, 'Just plain words.');
    assert.equal(p.cues.length, 0);
  });

  test('cues are stripped and positions become fractions', () => {
    const win = makeWindow();
    const raw = 'Start here. [[arrow #a]] Middle bit. [[highlight]] End.';
    const p = win.SomaGuide.parseNarration(raw);
    assert.equal(p.text, 'Start here. Middle bit. End.');
    assert.equal(p.cues.length, 2);
    assert.equal(p.cues[0].verb, 'arrow');
    assert.equal(p.cues[0].selector, '#a');
    assert.ok(p.cues[0].frac > 0.3 && p.cues[0].frac < 0.55, `frac ${p.cues[0].frac}`);
    assert.equal(p.cues[1].verb, 'highlight');
    assert.equal(p.cues[1].selector, null, 'bare cue has no selector');
    assert.ok(p.cues[1].frac > 0.75, `frac ${p.cues[1].frac}`);
  });

  test('stripping an annotated narration yields the original un-annotated text (audio hash safe)', () => {
    const win = makeWindow();
    const original  = 'The Committee page shows all nine members. Let me show you the layout.';
    const annotated = 'The Committee page shows all nine members. [[arrow a[href="members.html"] 2s]] Let me show you the layout. [[click]]';
    assert.equal(win.SomaGuide.stripCues(annotated), original);
  });

  test('leading cue: position 0, text trimmed', () => {
    const win = makeWindow();
    const p = win.SomaGuide.parseNarration('[[highlight #x]] Welcome to the page.');
    assert.equal(p.text, 'Welcome to the page.');
    assert.equal(p.cues[0].frac, 0);
  });

  test('selectors with spaces and attribute brackets survive', () => {
    const win = makeWindow();
    const p = win.SomaGuide.parseNarration('Look [[arrow .nav-dropdown-menu a[href="resources.html"]]] here.');
    assert.equal(p.cues[0].selector, '.nav-dropdown-menu a[href="resources.html"]');
  });

  test('durations: 2s, 800ms, slow, fast', () => {
    const win = makeWindow();
    const p = win.SomaGuide.parseNarration(
      'a [[arrow #a 2s]] b [[arrow #b 800ms]] c [[arrow #c slow]] d [[arrow #d fast]] e');
    assert.deepEqual([...p.cues].map(c => c.travelMs), [2000, 800, 2400, 600]);
    assert.deepEqual([...p.cues].map(c => c.selector), ['#a', '#b', '#c', '#d']);
  });
});

/* ── 2+3. Scheduling & execution ────────────────────────────────────────── */

describe('Cues — scheduling and execution', () => {
  test('_scheduleCues fires cues at frac × duration', (_, done) => {
    const win = makeWindow({ bodyHtml: '<div id="tgt">t</div>' });
    const g = new win.SomaGuide(BASE_CFG());
    g._pendingCues = { cues: [
      { verb: 'highlight', selector: '#tgt', travelMs: null, frac: 0 },
      { verb: 'click',     selector: '#tgt', travelMs: null, frac: 0.5 },
    ], step: null };
    g._scheduleCues(100);
    setTimeout(() => {
      assert.ok(win.document.getElementById('tgt').classList.contains('sg-highlight'),
        'frac-0 highlight fires immediately');
      assert.ok(win.document.querySelector('.sg-demo-ripple'),
        'frac-0.5 click ripple fired by 100ms');
      done();
    }, 140);
  });

  test('scripted walkthrough step: cues run, default choreography is suppressed', (_, done) => {
    const win = makeWindow({ bodyHtml: '<div id="tgt">t</div>' });
    const g = new win.SomaGuide(BASE_CFG());
    g._wtStart('wt-scripted', 0, -1);
    assert.equal(g._pendingCursorTarget, null,
      'scripted step must not arm the default cursor choreography');
    assert.equal(win.document.querySelector('.sg-wt-narration').textContent,
      'Hello there my friend, look at this.', 'cues stripped from display');
    setTimeout(() => {
      assert.ok(win.document.getElementById('tgt').classList.contains('sg-highlight'),
        'leading [[highlight]] cue fired');
      g._autoClear(); g._demoStop();
      done();
    }, 120);
  });

  test('open/close cues drive dropdowns', (_, done) => {
    const win = makeWindow({ bodyHtml: '<div class="dd"><a aria-expanded="false">t</a></div>' });
    const g = new win.SomaGuide(BASE_CFG());
    g._pendingCues = { cues: [
      { verb: 'open',  selector: '.dd', travelMs: null, frac: 0 },
      { verb: 'close', selector: null,  travelMs: null, frac: 0.6 },
    ], step: null };
    g._scheduleCues(80);
    setTimeout(() => {
      assert.ok(win.document.querySelector('.dd').classList.contains('sg-demo-open'), 'opened');
    }, 30);
    setTimeout(() => {
      assert.ok(!win.document.querySelector('.dd').classList.contains('sg-demo-open'), 'closed again');
      done();
    }, 130);
  });

  test('arrow cue honors per-cue duration on the cursor transition', (_, done) => {
    const win = makeWindow({ bodyHtml: '<div id="tgt">t</div>' });
    const g = new win.SomaGuide(BASE_CFG());
    g._runCue({ verb: 'arrow', selector: '#tgt', travelMs: 2000, frac: 0 }, null);
    setTimeout(() => {
      assert.equal(g._demoCursor.style.transitionDuration, '2s, 2s, 0.2s');
      g._demoStop();
      done();
    }, 20);
  });

  test('bare cue after arrow reuses the last touched element', () => {
    const win = makeWindow({ bodyHtml: '<div id="a">a</div><div id="b">b</div>' });
    const g = new win.SomaGuide(BASE_CFG());
    g._runCue({ verb: 'arrow', selector: '#b', travelMs: 0, frac: 0 }, null);
    g._runCue({ verb: 'highlight', selector: null, travelMs: null, frac: 0 }, { target: '#a' });
    assert.ok(win.document.getElementById('b').classList.contains('sg-highlight'),
      'bare [[highlight]] applies to the element the arrow just visited, not step.target');
    g._demoStop();
  });

  test('stopping the tour cancels scheduled cues', (_, done) => {
    const win = makeWindow({ bodyHtml: '<div id="tgt">t</div>' });
    const g = new win.SomaGuide(BASE_CFG());
    g._pendingCues = { cues: [{ verb: 'highlight', selector: '#tgt', travelMs: null, frac: 0.5 }], step: null };
    g._scheduleCues(100);
    g._demoStop(); /* stop before the cue fires */
    setTimeout(() => {
      assert.ok(!win.document.getElementById('tgt').classList.contains('sg-highlight'),
        'cancelled cue must not fire after stop');
      done();
    }, 150);
  });

  test('verify() flags unknown cue verbs and missing cue selectors', () => {
    const win = makeWindow({ bodyHtml: '<div id="ok">x</div>' });
    const issues = win.SomaGuide.verify({
      walkthroughs: [{ id: 'w', steps: [
        { narration: 'a [[zoom #ok]] b' },
        { narration: 'c [[highlight #missing]] d' },
        { narration: 'e [[arrow #ok]] f' },
      ] }]
    });
    assert.ok(issues.some(i => /unknown cue verb: zoom/.test(i.issue)));
    assert.ok(issues.some(i => /cue selector not found: #missing/.test(i.issue)));
    assert.ok(!issues.some(i => /#ok/.test(i.issue)), 'valid cue passes');
  });
});

/* ── 4. Voice flow ──────────────────────────────────────────────────────── */

function withMic(win, behavior) {
  win.eval(`
    window._micRequests = 0;
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = function () {
      window._micRequests++;
      if ('${behavior}' === 'deny') {
        var e = new Error('denied'); e.name = 'NotAllowedError';
        return Promise.reject(e);
      }
      if ('${behavior}' === 'nomic') {
        var e2 = new Error('none'); e2.name = 'NotFoundError';
        return Promise.reject(e2);
      }
      return Promise.resolve({ getTracks: function () { return []; } });
    };
  `);
}

describe('Voice — connection flow', () => {
  test('engine pins the ElevenLabs SDK version (no @latest)', () => {
    assert.ok(!GUIDE_SRC.includes('@elevenlabs/client@latest'),
      '@latest silently breaks when the SDK ships a new major');
    assert.match(GUIDE_SRC, /@elevenlabs\/client@\d+\.\d+\.\d+/);
  });

  test('mic granted → mic requested first, session starts, status Listening', (_, done) => {
    const win = makeWindow();
    withMic(win, 'grant');
    const g = new win.SomaGuide(BASE_CFG());
    g._openVoice();
    assert.equal(win.document.querySelector('.sg-voice-status').textContent,
      'Allow microphone access to talk…', 'status guides the user during the permission prompt');
    setTimeout(() => {
      assert.equal(win._micRequests, 1, 'mic requested explicitly before the session');
      assert.equal(win.document.querySelector('.sg-voice-status').textContent, 'Listening…');
      assert.equal(win._sessionCalls.length, 1);
      done();
    }, 50);
  });

  test('mic denied → actionable unblock guidance, no session attempt', (_, done) => {
    const win = makeWindow();
    withMic(win, 'deny');
    const g = new win.SomaGuide(BASE_CFG());
    g._openVoice();
    setTimeout(() => {
      const status = win.document.querySelector('.sg-voice-status').textContent;
      assert.ok(/Microphone access is blocked/.test(status), status);
      assert.equal(win._sessionCalls.length, 0, 'no session without a mic');
      done();
    }, 50);
  });

  test('no microphone → distinct message suggesting text chat', (_, done) => {
    const win = makeWindow();
    withMic(win, 'nomic');
    const g = new win.SomaGuide(BASE_CFG());
    g._openVoice();
    setTimeout(() => {
      assert.match(win.document.querySelector('.sg-voice-status').textContent,
        /No working microphone/);
      done();
    }, 50);
  });

  test('voice session failure retries once over websocket', (_, done) => {
    const win = makeWindow();
    withMic(win, 'grant');
    win._sessionBehavior = 'fail-once';
    const g = new win.SomaGuide(BASE_CFG());
    g._openVoice();
    setTimeout(() => {
      assert.equal(win._sessionCalls.length, 2, 'two attempts');
      assert.equal(win._sessionCalls[1].connectionType, 'websocket',
        'retry forces the websocket transport');
      assert.equal(win.document.querySelector('.sg-voice-status').textContent, 'Listening…');
      done();
    }, 60);
  });

  test('textOnly session failure does NOT retry (no transport to vary)', (_, done) => {
    const win = makeWindow();
    win._sessionBehavior = 'fail';
    const g = new win.SomaGuide(BASE_CFG());
    g._startConversation(true).catch(() => {});
    setTimeout(() => {
      assert.equal(win._sessionCalls.length, 1);
      done();
    }, 50);
  });

  test('hanging connection surfaces a timeout message instead of infinite Connecting…', (_, done) => {
    const win = makeWindow();
    withMic(win, 'grant');
    win._sessionBehavior = 'hang';
    const g = new win.SomaGuide(BASE_CFG({ voiceConnectTimeoutMs: 60 }));
    g._openVoice();
    setTimeout(() => {
      assert.match(win.document.querySelector('.sg-voice-status').textContent,
        /Taking too long to connect/);
      done();
    }, 150);
  });
});
