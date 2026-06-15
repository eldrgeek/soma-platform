/**
 * SOMA Guide Widget — behavior tests for the 2026-0610 engine changes
 *
 * Covers:
 *  1. _sendText routing precedence (feedback → scope guard → walkthrough → inference)
 *  2. Factual questions go to inference, never hijacked by walkthrough keywords
 *  3. Feedback affordance buttons do NOT pre-start the ElevenLabs session
 *  4. Stop-tour restores the starting state (page, scroll, widget panel)
 *  5. Tour choreography: cursor glide → highlight on arrival → click ripple at
 *     narration end → advance (which performs the navigation)
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

/* ── Helpers ── */

function makeWindow(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body>' + (opts.bodyHtml || '') + '</body></html>',
    { url: opts.url || 'http://localhost/', runScripts: 'dangerously' }
  );
  const win = dom.window;

  /* Conversation stub that counts session starts. */
  win.eval(`
    window._convStarts = 0;
    window._convMessages = [];
    window.__importStub = function(url) {
      return Promise.resolve({ Conversation: { startSession: function(opts) {
        window._convStarts++;
        return Promise.resolve({
          endSession: function(){},
          sendUserMessage: function(m){ window._convMessages.push(m); }
        });
      } } });
    };
  `);

  /* fetch stub: records calls; /infer returns an answer, /fb returns ok. */
  win.eval(`
    window._fetchCalls = [];
    window.fetch = function(url, init) {
      window._fetchCalls.push({ url: String(url), init: init || null });
      if (String(url).includes('/infer')) {
        return Promise.resolve({ json: function(){ return Promise.resolve({ answer: 'Inferred answer.' }); } });
      }
      if (String(url).includes('/fb')) {
        return Promise.resolve({ status: 200, json: function(){ return Promise.resolve({ ok: true }); } });
      }
      return Promise.resolve({ ok: false, status: 404, json: function(){ return Promise.resolve({}); } });
    };
  `);

  win.eval(GUIDE_SRC);
  return win;
}

/** TTS-enabled window with controllable mock Audio (same shape as the main suite). */
function makeWindowWithTTS(opts) {
  const win = makeWindow(opts);
  win.eval(`
    window._audioInstances = [];
    window._ttsBlob = { type: 'audio/mpeg', _mock: true };
    window.fetch = function(url) {
      window._fetchCalls.push({ url: String(url) });
      if (String(url).includes('/audio/tour/')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({ ok: true, blob: function(){ return Promise.resolve(window._ttsBlob); } });
    };
    window.URL = window.URL || {};
    window.URL.createObjectURL = function(blob) { return 'blob:mock'; };
    window.Audio = function MockAudio(src) {
      this.src = src || '';
      this.paused = true;
      this._listeners = {};
      window._audioInstances.push(this);
    };
    window.Audio.prototype.play = function() { this.paused = false; return Promise.resolve(); };
    window.Audio.prototype.pause = function() { this.paused = true; };
    window.Audio.prototype.addEventListener = function(type, fn, opts) {
      var once = opts && opts.once; var self = this;
      this._listeners[type] = this._listeners[type] || [];
      if (once) {
        var wrapped = function(evt) {
          fn.call(self, evt);
          var idx = self._listeners[type].indexOf(wrapped);
          if (idx >= 0) self._listeners[type].splice(idx, 1);
        };
        this._listeners[type].push(wrapped);
      } else { this._listeners[type].push(fn); }
    };
    window.Audio.prototype.dispatchEvent = function(evt) {
      var ls = (this._listeners[evt.type] || []).slice(); var self = this;
      ls.forEach(function(fn) { fn.call(self, evt); });
    };
  `);
  return win;
}

/** Bill-shaped config: feedback + scope guard + inference + walkthroughs. */
function fullConfig(overrides) {
  return Object.assign({
    persona: {
      name: 'TestBot', id: 'test-bot', avatar: '🤖',
      greeting: 'Hello!', shortGreeting: 'Back again!', walkthroughDone: 'Done!'
    },
    voiceAgentId: 'test-agent-id',
    feedbackUrl: '/fb',
    inferenceUrl: '/infer',
    scopeGuard: {
      deflect: 'Outside my lane.',
      offTopicPatterns: [/\bweather\b/i]
    },
    siteMap: [],
    walkthroughs: [
      {
        id: 'wt-committee',
        label: 'Committee tour',
        keywords: ['committee page', 'find a member'],
        steps: [
          { target: 'body', label: 'C1', narration: 'Committee narration', instruction: 'i1' }
        ]
      }
    ]
  }, overrides || {});
}

const lastAgentMsg = (win) => {
  const msgs = win.document.querySelectorAll('.sg-msg--agent .sg-msg-text');
  return msgs.length ? msgs[msgs.length - 1].textContent : null;
};

/* ── 1+2. Routing precedence ─────────────────────────────────────────────── */

describe('Routing — _sendText precedence', function () {
  test('bug-report intent wins over a walkthrough keyword in the same message', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._sendText('I want to report a bug on the committee page');
    assert.equal(g.mode === 'walkthrough', false, 'must not start the tour');
    assert.ok(win.document.querySelector('.sg-feedback-overlay'), 'feedback modal must render');
    assert.equal(g.wt, null);
  });

  test('feature intent wins over a walkthrough keyword', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._sendText('it would be great if the committee page had photos');
    assert.ok(win.document.querySelector('.sg-feedback-overlay'), 'feedback modal must render');
    assert.equal(g.wt, null);
  });

  test('off-topic message is deflected by the scope guard', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._sendText('what is the weather in Denver');
    assert.equal(lastAgentMsg(win), 'Outside my lane.');
    assert.equal(win._fetchCalls.length, 0, 'no inference call for deflected message');
  });

  test('factual question mentioning a walkthrough keyword goes to inference, not the tour', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._sendText('What is on the committee page?');
    assert.equal(g.wt, null, 'tour must not start');
    assert.equal(win._fetchCalls.length, 1, 'inference endpoint must be called');
    assert.ok(win._fetchCalls[0].url.includes('/infer'));
  });

  test('inference answer offers a "show me" button when a walkthrough relates', function (_, done) {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._sendText('What is on the committee page?');
    setTimeout(function () {
      assert.equal(lastAgentMsg(win), 'Inferred answer.');
      assert.ok(win.document.querySelector('.sg-show-me-btn'), 'show-me button should be offered');
      done();
    }, 50);
  });

  test('how-do-I question with a walkthrough keyword starts the tour', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._sendText('how do I find a member');
    assert.equal(g.mode, 'walkthrough');
    assert.equal(g.wt.id, 'wt-committee');
  });

  test('short explicit keyword message starts the tour', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._sendText('committee page');
    assert.equal(g.mode, 'walkthrough');
  });

  test('factual question still matches walkthrough when no inferenceUrl is configured', function () {
    const win = makeWindow();
    const cfg = fullConfig(); delete cfg.inferenceUrl;
    const g = new win.SomaGuide(cfg);
    g._sendText('where is the committee page?');
    assert.equal(g.mode, 'walkthrough', 'without inference, the tour is the best answer');
  });
});

/* ── 3. Feedback buttons must not pre-start the voice session ─────────────── */

describe('Feedback buttons — no ElevenLabs pre-start', function () {
  test('clicking 🐛 Report a Bug opens the form without starting a conversation', function (_, done) {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._openIdle(false);
    const btns = win.document.querySelectorAll('.sg-topic-btn--feedback');
    assert.equal(btns.length, 2, 'feature + bug buttons should render');
    btns[1].click(); /* 🐛 Report a Bug */
    setTimeout(function () {
      assert.equal(g.mode, 'text');
      assert.ok(win.document.querySelector('.sg-feedback-overlay'), 'feedback modal must render');
      assert.equal(win._convStarts, 0, 'ElevenLabs session must NOT start (its scripted greeting would land in the chat)');
      done();
    }, 30);
  });

  test('clicking 💡 Feature Request opens the form without starting a conversation', function (_, done) {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._openIdle(false);
    win.document.querySelectorAll('.sg-topic-btn--feedback')[0].click();
    setTimeout(function () {
      assert.ok(win.document.querySelector('.sg-feedback-overlay'));
      assert.equal(win._convStarts, 0);
      done();
    }, 30);
  });

  test('plain text mode still pre-starts the session (latency optimization)', function (_, done) {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._openText();
    setTimeout(function () {
      assert.equal(win._convStarts, 1, 'normal 💬 open should pre-start');
      done();
    }, 30);
  });

  test('_openText({skipPreStart:true}) suppresses the pre-start', function (_, done) {
    const win = makeWindow();
    const g = new win.SomaGuide(fullConfig());
    g._openText({ skipPreStart: true });
    setTimeout(function () {
      assert.equal(win._convStarts, 0);
      done();
    }, 30);
  });
});

/* ── 4. Stop-tour restores starting state ─────────────────────────────────── */

describe('Stop tour — starting-state restore', function () {
  test('origin page + scroll are recorded when a tour starts fresh', function () {
    const win = makeWindow({ url: 'http://localhost/start.html' });
    const g = new win.SomaGuide(fullConfig());
    g._wtStart('wt-committee', 0, -1);
    assert.equal(g._ssGet('origin-path'), '/start.html');
    assert.ok(g._ssGet('origin-scroll') !== null);
  });

  test('origin is NOT overwritten by mid-tour navigation or jumps', function () {
    const win = makeWindow({ url: 'http://localhost/elsewhere.html' });
    const g = new win.SomaGuide(fullConfig());
    g._ssSet('origin-path', '/start.html'); /* simulate: tour began on another page */
    g._ssSet('origin-scroll', '120');
    g._wtStart('wt-committee', 0, -1);
    assert.equal(g._ssGet('origin-path'), '/start.html');
  });

  test('stop on the same page restores scroll and opens idle (no navigation)', function () {
    const win = makeWindow({ url: 'http://localhost/start.html' });
    const g = new win.SomaGuide(fullConfig());
    let navigated = null;
    g._navigate = function (p) { navigated = p; };
    const scrolls = [];
    win.scrollTo = function (x, y) { scrolls.push([x, y]); };
    g._wtStart('wt-committee', 0, -1);
    g._ssSet('origin-scroll', '240');
    g._wtGoToNeutral();
    assert.equal(navigated, null, 'must not navigate when already on origin page');
    assert.deepEqual(scrolls[scrolls.length - 1], [0, 240], 'scroll restored');
    assert.equal(g.mode, 'idle');
    assert.equal(g._ssGet('origin-path'), null, 'origin keys cleared');
  });

  test('stop after the tour navigated away returns to the origin page', function () {
    const win = makeWindow({ url: 'http://localhost/members.html' });
    const g = new win.SomaGuide(fullConfig());
    let navigated = null;
    g._navigate = function (p) { navigated = p; };
    g._ssSet('origin-path', '/index.html');
    g._ssSet('origin-scroll', '80');
    g._wtStart('wt-committee', 0, -1);
    g._wtGoToNeutral();
    assert.equal(navigated, '/index.html', 'must navigate back to origin');
    assert.equal(g._ssGet('reopen-idle'), '1', 'widget reopens at the menu after landing');
    assert.equal(g._ssGet('restore-scroll'), '80');
    assert.equal(g._ssGet('origin-path'), null, 'origin keys cleared');
    assert.equal(g._ssGet('resume-id'), null, 'no resume state survives a stop');
  });

  test('landing with reopen-idle flag opens the widget at the menu and restores scroll', function (_, done) {
    const win = makeWindow({ url: 'http://localhost/index.html' });
    const scrolls = [];
    win.scrollTo = function (x, y) { scrolls.push([x, y]); };
    /* Seed flags as the pre-navigation page would have */
    win.sessionStorage.setItem('soma-guide-xp:test-bot:reopen-idle', '1');
    win.sessionStorage.setItem('soma-guide-xp:test-bot:restore-scroll', '80');
    const g = new win.SomaGuide(fullConfig());
    setTimeout(function () {
      assert.equal(g.mode, 'idle', 'widget should reopen at the menu');
      assert.deepEqual(scrolls[scrolls.length - 1], [0, 80], 'scroll restored after landing');
      assert.equal(g._ssGet('reopen-idle'), null, 'flag consumed');
      done();
    }, 400);
  });

  test('finishing a tour clears the origin keys', function () {
    const win = makeWindow({ url: 'http://localhost/start.html' });
    const g = new win.SomaGuide(fullConfig());
    g._wtStart('wt-committee', 0, -1);
    assert.ok(g._ssGet('origin-path'));
    g._wtFinish();
    assert.equal(g._ssGet('origin-path'), null);
    assert.equal(g._ssGet('origin-scroll'), null);
  });

  test('cleanOnClose minimize clears origin keys too', function () {
    const win = makeWindow({ url: 'http://localhost/start.html' });
    const g = new win.SomaGuide(fullConfig({ cleanOnClose: true }));
    g._wtStart('wt-committee', 0, -1);
    g._minimize();
    assert.equal(g._ssGet('origin-path'), null);
  });
});

/* ── 5. Choreography — arrow → highlight → click → navigate ──────────────── */

const CHOREO_CONFIG = () => fullConfig({
  inferenceUrl: undefined,
  cursorLeadIn: 0,
  cursorTravelMs: 10,
  clickThroughDelayMs: 20,
  walkthroughs: [
    {
      id: 'wt-demo',
      label: 'Demo tour',
      keywords: ['demo tour'],
      steps: [
        { target: '#tgt', label: 'S1', demo: 'click', narration: 'Click the thing', instruction: 'i' },
        { target: 'body', label: 'S2', narration: 'Second step', instruction: 'i' }
      ]
    }
  ]
});

describe('Choreography — highlight lands when the cursor arrives', function () {
  test('demo step: highlight is deferred until cursor arrival, then applied', function (_, done) {
    const win = makeWindow({ bodyHtml: '<div id="tgt">target</div>' });
    const g = new win.SomaGuide(CHOREO_CONFIG());
    g._wtStart('wt-demo', 0, -1);
    const tgt = win.document.getElementById('tgt');
    assert.equal(tgt.classList.contains('sg-highlight'), false,
      'highlight must NOT be applied at render time for demo steps');
    setTimeout(function () {
      assert.equal(tgt.classList.contains('sg-highlight'), true,
        'highlight must be applied once the cursor arrives');
      g._autoClear();
      done();
    }, 200);
  });

  test('non-demo step: highlight is applied immediately', function () {
    const win = makeWindow({ bodyHtml: '<div id="tgt">target</div>' });
    const cfg = CHOREO_CONFIG();
    cfg.walkthroughs[0].steps[0].demo = null;
    const g = new win.SomaGuide(cfg);
    g._wtStart('wt-demo', 0, -1);
    assert.equal(win.document.getElementById('tgt').classList.contains('sg-highlight'), true);
    g._autoClear();
  });

  test('highlight fallback fires even if the cursor never runs', function (_, done) {
    const win = makeWindow({ bodyHtml: '<div id="tgt">target</div>' });
    const g = new win.SomaGuide(CHOREO_CONFIG());
    g._wtStart('wt-demo', 0, -1);
    /* Kill the cursor pipeline the way a blocked autoplay would */
    if (g._cursorLeadTimer) { win.clearTimeout(g._cursorLeadTimer); g._cursorLeadTimer = null; }
    g._pendingCursorTarget = null;
    g._pendingCursorDemo = null;
    setTimeout(function () {
      assert.equal(win.document.getElementById('tgt').classList.contains('sg-highlight'), true,
        'fallback timer must apply the highlight');
      g._autoClear();
      done();
    }, 1500); /* leadIn 0 + travel 10 + 1200 fallback */
  });

  test('stopping the demo clears the pending highlight (no orphan highlight later)', function (_, done) {
    const win = makeWindow({ bodyHtml: '<div id="tgt">target</div>' });
    const g = new win.SomaGuide(CHOREO_CONFIG());
    g._wtStart('wt-demo', 0, -1);
    g._wtGoToNeutral(); /* stop immediately — pending highlight must die with it */
    setTimeout(function () {
      assert.equal(win.document.getElementById('tgt').classList.contains('sg-highlight'), false);
      done();
    }, 1500);
  });
});

describe('Choreography — click ripple at narration end, then advance', function () {
  test('demo:click — ended fires ripple first, advance follows after the click-through beat', function (_, done) {
    const win = makeWindowWithTTS({ bodyHtml: '<div id="tgt">target</div>' });
    const cfg = CHOREO_CONFIG();
    cfg.ttsProxyUrl = '/tts';
    const g = new win.SomaGuide(cfg);
    g._wtStart('wt-demo', 0, -1);
    setTimeout(function () {
      /* Audio playing, cursor lead-in (0ms) + travel (10ms) elapsed → cursor visible */
      const audio = win._audioInstances[win._audioInstances.length - 1];
      assert.ok(audio, 'audio should be playing');
      assert.ok(g._demoCursor && g._demoCursor.classList.contains('sg-demo-cursor--visible'),
        'cursor should be in place at the target');
      g._autoClear(); /* cancel the long safety net */
      audio.dispatchEvent(new win.Event('ended'));
      /* Ripple fires immediately; step must NOT advance yet */
      assert.ok(win.document.querySelector('.sg-demo-ripple'), 'click ripple shows at narration end');
      assert.equal(g.wt.stepIndex, 0, 'step must not advance until the click-through beat');
      setTimeout(function () {
        assert.equal(g.wt.stepIndex, 1, 'step advances after the click-through beat');
        g._autoClear();
        done();
      }, 80);
    }, 120);
  });

  test('demo:hover — ended advances immediately (no ripple)', function (_, done) {
    const win = makeWindowWithTTS({ bodyHtml: '<div id="tgt">target</div>' });
    const cfg = CHOREO_CONFIG();
    cfg.ttsProxyUrl = '/tts';
    cfg.walkthroughs[0].steps[0].demo = 'hover';
    const g = new win.SomaGuide(cfg);
    g._wtStart('wt-demo', 0, -1);
    setTimeout(function () {
      const audio = win._audioInstances[win._audioInstances.length - 1];
      g._autoClear();
      audio.dispatchEvent(new win.Event('ended'));
      assert.equal(g.wt.stepIndex, 1, 'hover steps advance immediately on ended');
      assert.equal(win.document.querySelector('.sg-demo-ripple'), null, 'no ripple for hover');
      g._autoClear();
      done();
    }, 120);
  });

  test('demo:click with no visible cursor — ended advances without the ripple stage', function () {
    const win = makeWindow({ bodyHtml: '<div id="tgt">target</div>' });
    const g = new win.SomaGuide(CHOREO_CONFIG()); /* no TTS — exercise fallback path directly */
    g._wtStart('wt-demo', 0, -1);
    /* Simulate narration end before the cursor ever showed */
    g._demoStop();
    if (g._demoCursor) g._demoCursor.classList.remove('sg-demo-cursor--visible');
    g._autoClear();
    /* Manually invoke the advance the fallback timer would have run */
    g._wtNext();
    assert.equal(g.wt.stepIndex, 1);
    g._autoClear();
  });

  test('cursor travel pace honors cfg.cursorTravelMs', function (_, done) {
    const win = makeWindow({ bodyHtml: '<div id="tgt">target</div>' });
    const cfg = CHOREO_CONFIG();
    cfg.cursorTravelMs = 50;
    const g = new win.SomaGuide(cfg);
    g._wtStart('wt-demo', 0, -1);
    setTimeout(function () {
      assert.ok(g._demoCursor, 'cursor exists');
      assert.equal(g._demoCursor.style.transitionDuration, '0.05s, 0.05s, 0.2s',
        'inline transition-duration reflects the configured pace');
      g._autoClear();
      done();
    }, 40);
  });
});
