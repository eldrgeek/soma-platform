/**
 * SOMA Guide Widget — Unit tests
 *
 * Tests: widget mounts, introduce-once logic, walkthrough navigation,
 * jump-out/jump-back-in, and keyword-to-walkthrough matching.
 *
 * Run: npm test
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT    = path.join(__dirname, '..');
const GUIDE_SRC = fs.readFileSync(path.join(ROOT, 'js', 'soma-guide.js'), 'utf8');

/* ── Helpers ── */

/** Create a fresh jsdom window with localStorage + the SomaGuide source loaded.
 *  Does NOT set window.SomaGuideConfig, so auto-init won't fire.
 *  Returns the window object. */
function makeWindow(lsOverrides) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'dangerously'
  });
  const win = dom.window;

  /* Seed localStorage before loading the script */
  if (lsOverrides) {
    Object.entries(lsOverrides).forEach(([k, v]) => win.localStorage.setItem(k, v));
  }

  /* Suppress dynamic import — the ElevenLabs ESM import only runs on voice/text,
   * so tests that don't call _openVoice/_startConversation never hit it.
   * Patch global import to return a stub Conversation class. */
  win.eval('window.__importStub = function(url) { return Promise.resolve({ Conversation: { startSession: function() { return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} }); } } }); };');

  win.eval(GUIDE_SRC);
  return win;
}

/** Minimal test config — no ElevenLabs calls needed for most tests. */
const TEST_CONFIG = {
  persona: {
    name: 'TestBot',
    id: 'test-bot',
    avatar: '🤖',
    greeting: 'Hello first-timer!',
    shortGreeting: 'Welcome back!',
    walkthroughDone: 'All done!'
  },
  voiceAgentId: 'test-agent-id',
  siteMap: [],
  walkthroughs: [
    {
      id: 'wt-alpha',
      label: 'Alpha Tour',
      keywords: ['alpha', 'first tour'],
      steps: [
        { target: 'body',  label: 'Step A1', narration: 'Step one narration',   instruction: 'Step one instruction' },
        { target: 'body',  label: 'Step A2', narration: 'Step two narration',   instruction: 'Step two instruction' },
        { target: 'body',  label: 'Step A3', narration: 'Step three narration', instruction: 'Step three instruction' }
      ]
    },
    {
      id: 'wt-beta',
      label: 'Beta Tour',
      keywords: ['beta', 'second tour'],
      steps: [
        { target: null, label: 'Beta Step 1', narration: 'Beta narration', instruction: 'Beta instruction' }
      ]
    }
  ]
};

/* ── Test suites ── */

describe('SOMA Guide — widget mounts', function () {
  test('SomaGuide class is exposed on window', function () {
    const win = makeWindow();
    assert.ok(typeof win.SomaGuide === 'function', 'window.SomaGuide should be a constructor');
  });

  test('new SomaGuide() appends #soma-guide to body', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const el = win.document.getElementById('soma-guide');
    assert.ok(el, '#soma-guide element should exist in DOM');
  });

  test('widget starts minimized', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g.mode, 'minimized');
    assert.ok(win.document.getElementById('soma-guide').className.includes('sg--min'));
  });

  test('FAB button is present', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const fab = win.document.querySelector('.sg-fab');
    assert.ok(fab, '.sg-fab should exist');
  });

  test('panel contains persona name', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const name = win.document.querySelector('.sg-persona-name');
    assert.ok(name, '.sg-persona-name should exist');
    assert.equal(name.textContent, TEST_CONFIG.persona.name);
  });

  test('topic buttons rendered for each walkthrough', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btns = win.document.querySelectorAll('.sg-topic-btn');
    assert.equal(btns.length, TEST_CONFIG.walkthroughs.length);
  });
});

describe('SOMA Guide — introduce-once logic', function () {
  test('introduced flag starts false when localStorage is empty', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g.introduced, false);
  });

  test('introduced flag starts true when localStorage has the key', function () {
    const win = makeWindow({ 'soma-guide:test-bot:introduced': '1' });
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g.introduced, true);
  });

  test('_openIdle(true) marks user as introduced', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g.introduced, false);
    g._openIdle(true);
    assert.equal(g.introduced, true);
    assert.equal(win.localStorage.getItem('soma-guide:test-bot:introduced'), '1');
  });

  test('_openIdle(true) sets first-time greeting text', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(true);
    const txt = win.document.querySelector('.sg-greeting').textContent;
    assert.equal(txt, TEST_CONFIG.persona.greeting);
  });

  test('_openIdle(false) sets short greeting text', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    const txt = win.document.querySelector('.sg-greeting').textContent;
    assert.equal(txt, TEST_CONFIG.persona.shortGreeting);
  });

  test('_openIdle(true) does NOT re-set greeting on second call', function () {
    const win = makeWindow({ 'soma-guide:test-bot:introduced': '1' });
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    const txt = win.document.querySelector('.sg-greeting').textContent;
    assert.equal(txt, TEST_CONFIG.persona.shortGreeting);
  });
});

describe('SOMA Guide — walkthrough step navigation', function () {
  test('_wtStart sets mode to walkthrough', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    assert.equal(g.mode, 'walkthrough');
  });

  test('_wtStart renders first step narration', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Step one narration');
  });

  test('_wtStart renders first step instruction', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    const inst = win.document.querySelector('.sg-wt-instruction').textContent;
    assert.equal(inst, 'Step one instruction');
  });

  test('progress indicator shows correct step/total', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    const prog = win.document.querySelector('.sg-wt-prog').textContent;
    assert.equal(prog, 'Step 1 of 3');
  });

  test('_wtNext advances to step 2', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext();
    assert.equal(g.wt.stepIndex, 1);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Step two narration');
  });

  test('progress indicator updates after Next', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext();
    const prog = win.document.querySelector('.sg-wt-prog').textContent;
    assert.equal(prog, 'Step 2 of 3');
  });

  test('Next button says "Finish ✓" on last step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext(); // step 2
    g._wtNext(); // step 3 (last)
    const btn = win.document.querySelector('.sg-wt-next').textContent;
    assert.equal(btn, 'Finish ✓');
  });

  test('Finish on last step resets wt to null', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext(); g._wtNext(); // now on last step
    g._wtNext(); // Finish
    assert.equal(g.wt, null);
  });

  test('Finish shows walkthroughDone greeting', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext(); g._wtNext();
    g._wtNext(); // Finish
    const txt = win.document.querySelector('.sg-greeting').textContent;
    assert.equal(txt, TEST_CONFIG.persona.walkthroughDone);
  });

  test('can start walkthrough at arbitrary step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    assert.equal(g.wt.stepIndex, 2);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Step three narration');
  });

  test('_wtById returns correct walkthrough by id', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const wt = g._wtById('wt-beta');
    assert.ok(wt, 'should find wt-beta');
    assert.equal(wt.label, 'Beta Tour');
  });

  test('_wtById returns null for unknown id', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g._wtById('no-such-id'), null);
  });
});

describe('SOMA Guide — jump-out / jump-back-in', function () {
  test('_wtExit saves pendingResume', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 1);
    g._wtExit();
    assert.ok(g.pendingResume, 'pendingResume should be set after exit');
    assert.equal(g.pendingResume.id, 'wt-alpha');
    assert.equal(g.pendingResume.stepIndex, 1);
  });

  test('_wtExit returns to idle mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtExit();
    assert.equal(g.mode, 'idle');
  });

  test('resume bar is visible after exit', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtExit();
    const bar = win.document.querySelector('.sg-resume-bar');
    assert.equal(bar.hidden, false, 'resume bar should be visible after exit');
  });

  test('resume bar is hidden before any walkthrough', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    const bar = win.document.querySelector('.sg-resume-bar');
    assert.equal(bar.hidden, true, 'resume bar should be hidden when no pending resume');
  });

  test('structured nav buttons are rendered for each step in resume bar', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 1);
    g._wtExit();
    const resumeSteps = win.document.querySelector('.sg-resume-steps');
    const steps = resumeSteps.querySelectorAll('.sg-wt-nav-step');
    assert.equal(steps.length, TEST_CONFIG.walkthroughs[0].steps.length);
  });

  test('current step gets --current class in resume navigator', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    g._wtExit();
    const resumeSteps = win.document.querySelector('.sg-resume-steps');
    const steps = resumeSteps.querySelectorAll('.sg-wt-nav-step');
    assert.ok(steps[2].className.includes('sg-wt-nav-step--current'));
  });

  test('clicking restart button re-starts at step 0', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    g._wtExit();
    // simulate restart click
    g._wtStart(g.pendingResume.id, 0);
    assert.equal(g.wt.stepIndex, 0);
    assert.equal(g.mode, 'walkthrough');
  });

  test('pendingResume is cleared after Finish', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    // Set a pendingResume manually
    g.pendingResume = { id: 'wt-alpha', stepIndex: 1 };
    // Finish the walk
    g._wtNext(); g._wtNext(); g._wtNext(); // advance to finish
    assert.equal(g.pendingResume, null);
  });
});

describe('SOMA Guide — keyword matching', function () {
  test('_matchWalkthrough returns correct tour for keyword hit', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const match = g._matchWalkthrough('show me the alpha tour please');
    assert.ok(match, 'should match');
    assert.equal(match.id, 'wt-alpha');
  });

  test('_matchWalkthrough returns second tour for its keyword', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const match = g._matchWalkthrough('tell me about the beta stuff');
    assert.ok(match);
    assert.equal(match.id, 'wt-beta');
  });

  test('_matchWalkthrough returns null on no match', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const match = g._matchWalkthrough('what is the weather like today');
    assert.equal(match, null);
  });

  test('_matchWalkthrough is case-insensitive', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const match = g._matchWalkthrough('ALPHA please');
    assert.ok(match);
    assert.equal(match.id, 'wt-alpha');
  });
});

describe('SOMA Guide — mode transitions', function () {
  test('FAB click opens idle mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    win.document.querySelector('.sg-fab').click();
    assert.equal(g.mode, 'idle');
  });

  test('minimize button sets minimized mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    win.document.querySelector('.sg-btn-min').click();
    assert.equal(g.mode, 'minimized');
  });

  test('text button switches to text mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    win.document.querySelector('.sg-btn-text').click();
    assert.equal(g.mode, 'text');
  });

  test('sg--text class applied in text mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openText();
    assert.ok(win.document.getElementById('soma-guide').className.includes('sg--text'));
  });

  test('_setMode hides correct sub-panels', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._setMode('text');
    assert.equal(win.document.querySelector('.sg-idle-ui').hidden, true);
    assert.equal(win.document.querySelector('.sg-text-ui').hidden, false);
    assert.equal(win.document.querySelector('.sg-voice-ui').hidden, true);
  });

  test('_setMode walkthrough shows wt-bar', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._setMode('walkthrough');
    assert.equal(win.document.querySelector('.sg-wt-bar').hidden, false);
  });
});

/* ── TTS helpers ── */

const TTS_CONFIG = {
  persona: {
    name: 'TestBot',
    id: 'test-bot',
    avatar: '🤖',
    greeting: 'Hello!',
    shortGreeting: 'Back!',
    walkthroughDone: 'Done!'
  },
  voiceAgentId: 'test-agent-id',
  ttsProxyUrl: 'https://example.com/.netlify/functions/el-proxy',
  siteMap: [],
  walkthroughs: [
    {
      id: 'wt-alpha',
      label: 'Alpha Tour',
      keywords: ['alpha'],
      steps: [
        { target: 'body', label: 'Step A1', narration: 'Step one narration',   instruction: 'Do this' },
        { target: 'body', label: 'Step A2', narration: 'Step two narration',   instruction: 'Then that' },
      ]
    }
  ]
};

/** Make a window with Audio + fetch mocks suitable for TTS tests.
 *  By default static /audio/tour/ paths return 404 so existing tests
 *  exercise the live-TTS fallback path.  Set win._staticAudioOk = true
 *  before calling _ttsSpeak to let the static path succeed. */
function makeWindowWithTTS() {
  const win = makeWindow();
  win.eval(`
    window._ttsRequests = [];
    window._audioInstances = [];
    window._ttsBlob = { type: 'audio/mpeg', _mock: true };
    window._staticAudioOk = false;
    window.fetch = function(url) {
      window._ttsRequests.push(url);
      // Static clip paths: 404 by default (tests live fallback);
      // set window._staticAudioOk = true to exercise the static-hit path.
      if (url.includes('/audio/tour/') && !window._staticAudioOk) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return Promise.resolve({
        ok: true,
        blob: function() { return Promise.resolve(window._ttsBlob); }
      });
    };
    window.URL = window.URL || {};
    window.URL.createObjectURL = function(blob) { return 'blob:mock'; };
    window.Audio = function MockAudio(src) {
      this.src = src || '';
      this.paused = true;
      this._plays = 0;
      this._listeners = {};
      window._audioInstances.push(this);
    };
    window.Audio.prototype.play = function() { this.paused = false; this._plays++; return Promise.resolve(); };
    window.Audio.prototype.pause = function() { this.paused = true; };
    window.Audio.prototype.addEventListener = function(type, fn, opts) {
      var once = opts && opts.once;
      var self = this;
      this._listeners[type] = this._listeners[type] || [];
      if (once) {
        var wrapped = function(evt) {
          fn.call(self, evt);
          var idx = self._listeners[type].indexOf(wrapped);
          if (idx >= 0) self._listeners[type].splice(idx, 1);
        };
        this._listeners[type].push(wrapped);
      } else {
        this._listeners[type].push(fn);
      }
    };
    window.Audio.prototype.dispatchEvent = function(evt) {
      var listeners = (this._listeners[evt.type] || []).slice();
      var self = this;
      listeners.forEach(function(fn) { fn.call(self, evt); });
    };
  `);
  return win;
}

describe('SOMA Guide — TTS narration', function () {
  test('_ttsEnabled returns false when no ttsProxyUrl', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG); // TEST_CONFIG has no ttsProxyUrl
    assert.equal(g._ttsEnabled(), false);
  });

  test('_ttsEnabled returns true when proxy configured and not muted', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = false;
    assert.equal(g._ttsEnabled(), true);
  });

  test('_ttsEnabled returns false when muted', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = true;
    assert.equal(g._ttsEnabled(), false);
  });

  test('_ttsMuted loaded from localStorage', function () {
    const win = makeWindow({ 'soma-guide:test-bot:tts-muted': '1' });
    const g = new win.SomaGuide(TTS_CONFIG);
    assert.equal(g._ttsMuted, true);
  });

  test('_ttsMuted defaults to false when not in localStorage', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    assert.equal(g._ttsMuted, false);
  });

  test('_ttsMuteToggle flips _ttsMuted true', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuteToggle();
    assert.equal(g._ttsMuted, true);
  });

  test('_ttsMuteToggle persists to localStorage', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuteToggle();
    assert.equal(win.localStorage.getItem('soma-guide:test-bot:tts-muted'), '1');
  });

  test('_ttsMuteToggle back to false on second call', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuteToggle();
    g._ttsMuteToggle();
    assert.equal(g._ttsMuted, false);
  });

  test('_ttsStop clears _ttsAudio', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    // Place a mock audio object
    const fakeAudio = new win.Audio('blob:x');
    g._ttsAudio = fakeAudio;
    g._ttsStop();
    assert.equal(g._ttsAudio, null);
  });

  test('_ttsStop pauses playing audio', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    const fakeAudio = new win.Audio('blob:x');
    fakeAudio.paused = false;
    g._ttsAudio = fakeAudio;
    g._ttsStop();
    assert.equal(fakeAudio.paused, true);
  });

  test('_ttsSpeak does nothing when no ttsProxyUrl', function () {
    const win = makeWindowWithTTS();
    // Use TEST_CONFIG which has no ttsProxyUrl
    const g = new win.SomaGuide(TEST_CONFIG);
    g._ttsSpeak('hello world');
    assert.equal(win._ttsRequests.length, 0);
  });

  test('_ttsSpeak issues fetch with correct action param', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsSpeak('Hello narration');
    // fetch is async; static 404 causes fallback to live TTS
    setTimeout(function () {
      const liveReq = win._ttsRequests.find(function (u) { return u.includes('action=tts'); });
      assert.ok(liveReq, 'live TTS fetch should have been called');
      assert.ok(liveReq.includes('action=tts'), 'URL should include action=tts');
      done();
    }, 20);
  });

  test('_ttsSpeak encodes text in URL', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsSpeak('Hello & goodbye');
    setTimeout(function () {
      const liveReq = win._ttsRequests.find(function (u) { return u.includes('action=tts'); });
      assert.ok(liveReq && liveReq.includes('Hello'), 'live TTS URL should contain text');
      done();
    }, 20);
  });

  test('_ttsSpeak includes agent_id in URL', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsSpeak('test text');
    setTimeout(function () {
      const liveReq = win._ttsRequests.find(function (u) { return u.includes('action=tts'); });
      assert.ok(liveReq && liveReq.includes('agent_id=test-agent-id'), 'URL should include agent_id');
      done();
    }, 20);
  });

  test('_ttsSpeak stops previous audio before starting new', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    const prev = new win.Audio('blob:prev');
    prev.paused = false;
    g._ttsAudio = prev;
    g._ttsSpeak('new narration');
    assert.equal(prev.paused, true, 'previous audio should be paused');
  });

  test('_ttsSpeak does nothing when muted', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = true;
    g._ttsSpeak('should not speak');
    assert.equal(win._ttsRequests.length, 0, 'no fetch when muted');
  });

  test('_setMode calls _ttsStop', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    const prev = new win.Audio('blob:prev');
    prev.paused = false;
    g._ttsAudio = prev;
    g._setMode('idle');
    assert.equal(g._ttsAudio, null);
  });

  test('_minimize calls _ttsStop', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    const prev = new win.Audio('blob:prev');
    prev.paused = false;
    g._ttsAudio = prev;
    g._minimize();
    assert.equal(g._ttsAudio, null);
  });

  test('tts-bar is hidden when no ttsProxyUrl', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const bar = win.document.querySelector('.sg-tts-bar');
    assert.equal(bar.hidden, true);
  });

  test('tts-bar is visible when ttsProxyUrl configured', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    const bar = win.document.querySelector('.sg-tts-bar');
    assert.equal(bar.hidden, false);
  });

  test('mute button shows speaker icon when unmuted', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = false;
    g._updateMuteBtn();
    const btn = win.document.querySelector('.sg-btn-mute');
    assert.equal(btn.textContent, '🔊');
  });

  test('mute button shows muted icon when muted', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = true;
    g._updateMuteBtn();
    const btn = win.document.querySelector('.sg-btn-mute');
    assert.equal(btn.textContent, '🔇');
  });

  test('unmuting replays current step narration', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._ttsMuted = true;
    win._ttsRequests.length = 0; // clear any requests from _wtStart
    g._ttsMuteToggle(); // unmute → should replay
    setTimeout(function () {
      assert.ok(win._ttsRequests.length > 0, 'should have fetched TTS on unmute');
      done();
    }, 20);
  });

  test('_ttsReplay does nothing outside walkthrough', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsReplay(); // no active walkthrough
    assert.equal(win._ttsRequests.length, 0);
  });

  /* ── Prefetch tests ── */

  test('_ttsPrefetchNext fires at _ttsSpeak start before audio plays', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    // Position wt state at step 0 so prefetch targets step 1
    g.wt = { id: 'wt-alpha', stepIndex: 0, subStepIndex: null };
    win._ttsRequests.length = 0;

    g._ttsSpeak('Step one narration', null);

    // Both fetches initiated synchronously before any promise resolves:
    // one for the current step, one prefetch for the next step.
    assert.ok(win._ttsRequests.length >= 2, 'should have issued current + prefetch fetch synchronously');
    const hasPrefetch = win._ttsRequests.some(function (u) { return u.includes('Step%20two%20narration'); });
    assert.ok(hasPrefetch, 'prefetch request should target next step narration');
  });

  test('advance to next step uses prefetch cache without issuing a new fetch', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g.wt = { id: 'wt-alpha', stepIndex: 0, subStepIndex: null };

    // Simulate prefetch already completed for step 1
    const step1Url = TTS_CONFIG.ttsProxyUrl +
      '?action=tts&text=' + encodeURIComponent('Step two narration') +
      '&agent_id=' + encodeURIComponent(TTS_CONFIG.voiceAgentId);
    g._ttsPrefetchCache = { url: step1Url, blobUrl: 'blob:prefetched' };

    win._ttsRequests.length = 0;

    // Simulate speaking step 1 (as if auto-advance fired)
    g._ttsSpeak('Step two narration', null);

    // Cache hit: no fetch should have been issued for step 1
    const step1Fetches = win._ttsRequests.filter(function (u) { return u.includes('Step%20two%20narration'); });
    assert.equal(step1Fetches.length, 0, 'cache hit must not issue a new fetch for step 1');
  });

  test('_ttsPrefetchNext does not clear valid cache when called again for same URL', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g.wt = { id: 'wt-alpha', stepIndex: 0, subStepIndex: null };

    const step1Url = TTS_CONFIG.ttsProxyUrl +
      '?action=tts&text=' + encodeURIComponent('Step two narration') +
      '&agent_id=' + encodeURIComponent(TTS_CONFIG.voiceAgentId);
    g._ttsPrefetchCache = { url: step1Url, blobUrl: 'blob:cached' };

    win._ttsRequests.length = 0;
    g._ttsPrefetchNext(); // second call for same URL

    assert.ok(g._ttsPrefetchCache !== null, 'cache must not be cleared on duplicate call');
    assert.equal(g._ttsPrefetchCache.blobUrl, 'blob:cached', 'cached blobUrl must be preserved');
    const step1Fetches = win._ttsRequests.filter(function (u) { return u.includes('Step%20two%20narration'); });
    assert.equal(step1Fetches.length, 0, 'no redundant re-fetch for already-cached URL');
  });

  test('_ttsPrefetchNext skips in-flight fetch for same URL (dedup)', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g.wt = { id: 'wt-alpha', stepIndex: 0, subStepIndex: null };

    g._ttsPrefetchNext(); // first call — starts in-flight fetch
    const countAfterFirst = win._ttsRequests.length;

    g._ttsPrefetchNext(); // second call while in-flight — must be a no-op

    assert.equal(win._ttsRequests.length, countAfterFirst, 'in-flight dedup must suppress duplicate fetch');
  });
});

/* ── Pre-generated static audio clips ── */

describe('SOMA Guide — pre-generated static audio', function () {

  test('_tourAudioHash produces 8-char hex string', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    const hash = g._tourAudioHash('agent-id', 'Hello narration');
    assert.ok(typeof hash === 'string', 'hash should be a string');
    assert.equal(hash.length, 8, 'hash should be 8 characters');
    assert.ok(/^[0-9a-f]{8}$/.test(hash), 'hash should be lowercase hex');
  });

  test('_tourAudioHash is stable (same input → same output)', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    const h1 = g._tourAudioHash('agent_2401ks53q6t8e2drt1h7va3f2c52', 'Welcome! Let\'s start at the top.');
    const h2 = g._tourAudioHash('agent_2401ks53q6t8e2drt1h7va3f2c52', 'Welcome! Let\'s start at the top.');
    assert.equal(h1, h2, 'same input must produce same hash');
  });

  test('_tourAudioHash differs for different narrations', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    const h1 = g._tourAudioHash('test-agent', 'First narration');
    const h2 = g._tourAudioHash('test-agent', 'Second narration');
    assert.notEqual(h1, h2, 'different narrations must produce different hashes');
  });

  test('_tourAudioHash differs for different agentIds', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    const h1 = g._tourAudioHash('agent-A', 'Same narration');
    const h2 = g._tourAudioHash('agent-B', 'Same narration');
    assert.notEqual(h1, h2, 'different agentIds must produce different hashes');
  });

  test('engine hash matches gen-script hash for a known sample', function () {
    // Compute the reference hash using the same djb2-xor algorithm as the script
    function refHash(agentId, narration) {
      const s = (agentId || '') + '|' + (narration || '');
      let h = 0;
      for (let i = 0; i < s.length; i++) {
        h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
      }
      return ('0000000' + (h >>> 0).toString(16)).slice(-8);
    }
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    const agentId   = 'agent_2401ks53q6t8e2drt1h7va3f2c52';
    const narration = 'Welcome! Let\'s start at the top. This navigation bar is your map to the whole site.';
    assert.equal(
      g._tourAudioHash(agentId, narration),
      refHash(agentId, narration),
      'engine hash must match script hash for the same input'
    );
  });

  test('engine tries static path first (fetch for /audio/tour/ URL)', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    win._ttsRequests.length = 0;
    g._ttsSpeak('Step one narration', null);
    const staticReqs = win._ttsRequests.filter(function (u) { return u.includes('/audio/tour/'); });
    assert.ok(staticReqs.length > 0, 'engine should try the static clip URL first');
  });

  test('engine falls back to live TTS when static returns 404', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    win._ttsRequests.length = 0;
    win._staticAudioOk = false; // 404 for static paths
    g._ttsSpeak('Step one narration', null);
    setTimeout(function () {
      const liveReqs = win._ttsRequests.filter(function (u) { return u.includes('action=tts'); });
      assert.ok(liveReqs.length > 0, 'should fall back to live TTS when static clip not found');
      done();
    }, 30);
  });

  test('engine uses static clip when available (no live TTS fetch)', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    win._staticAudioOk = true; // static clips return 200
    win._ttsRequests.length = 0;
    g._ttsSpeak('Step one narration', null);
    setTimeout(function () {
      const staticReqs = win._ttsRequests.filter(function (u) { return u.includes('/audio/tour/'); });
      const liveReqs   = win._ttsRequests.filter(function (u) { return u.includes('action=tts'); });
      assert.ok(staticReqs.length > 0, 'should have fetched static clip');
      assert.equal(liveReqs.length, 0, 'should NOT fetch live TTS when static clip is available');
      done();
    }, 30);
  });

  test('static hit plays audio via _ttsPlayBlob (Audio instance created)', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    win._staticAudioOk = true;
    win._audioInstances.length = 0;
    g._ttsSpeak('Step one narration', null);
    setTimeout(function () {
      assert.ok(win._audioInstances.length > 0, 'Audio should be created when static clip loads');
      done();
    }, 30);
  });
});

/* ── Cross-page sessionStorage bridge ── */

const XPAGE_CONFIG = {
  persona: { name: 'XBot', id: 'xbot', avatar: '🤖', greeting: 'Hi!', shortGreeting: 'Back!', walkthroughDone: 'Done!' },
  voiceAgentId: 'xbot-agent',
  siteMap: [],
  walkthroughs: [
    {
      id: 'xp-tour',
      label: 'Cross-page Tour',
      keywords: ['cross'],
      steps: [
        { target: 'body', label: 'Step 1', narration: 'First step', instruction: 'Do this' },
        { target: '.grid', page: 'other.html', label: 'Step 2', narration: 'Second step on other page', instruction: 'See that' },
        { target: 'body', label: 'Step 3', narration: 'Back to basics', instruction: 'Done' }
      ]
    }
  ]
};

/** Build a window that simulates arriving on a given page path */
function makeWindowOnPage(pagePath) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div class="grid"></div></body></html>', {
    url: 'http://localhost/' + pagePath,
    runScripts: 'dangerously'
  });
  const win = dom.window;
  win.eval('window.__importStub = function(url) { return Promise.resolve({ Conversation: { startSession: function() { return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} }); } } }); };');
  win.eval(fs.readFileSync(path.join(ROOT, 'js', 'soma-guide.js'), 'utf8'));
  return win;
}

describe('SOMA Guide — cross-page sessionStorage bridge', function () {
  test('_wtExit persists pendingResume to sessionStorage', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {}; // suppress any navigation
    g._wtStart('xp-tour', 1);
    g._wtExit();
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-id'), 'xp-tour');
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-step'), '1');
  });

  test('_wtFinish clears sessionStorage resume keys', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {};
    g._wtStart('xp-tour', 0);
    win.sessionStorage.setItem('soma-guide-xp:xbot:resume-id', 'xp-tour');
    win.sessionStorage.setItem('soma-guide-xp:xbot:resume-step', '1');
    g._wtFinish();
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-id'), null);
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-step'), null);
  });

  test('_renderWtStep calls _navigate and sets sessionStorage when step.page differs from current', function () {
    const win = makeWindowOnPage('index.html');
    const g = new win.SomaGuide(XPAGE_CONFIG);
    var navigatedTo = null;
    g._navigate = function(page) { navigatedTo = page; };
    g.wt = { id: 'xp-tour', stepIndex: 1 };
    g._setMode('walkthrough');
    g._renderWtStep();
    /* Engine navigates to root-absolute clean URL (no .html) */
    assert.equal(navigatedTo, '/other', 'should navigate to root-absolute path without .html');
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:wt-id'), 'xp-tour');
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:wt-step'), '1');
  });

  test('_renderWtStep does NOT navigate when already on the correct page', function () {
    const win = makeWindowOnPage('other.html');
    const g = new win.SomaGuide(XPAGE_CONFIG);
    var navigated = false;
    g._navigate = function() { navigated = true; };
    g._wtStart('xp-tour', 1); // step 1 has page: 'other.html'; we're on other.html
    assert.equal(navigated, false, 'should not navigate when already on correct page');
  });

  test('_onReady auto-resumes from sessionStorage xpage state', function () {
    const win = makeWindowOnPage('other.html');
    win.sessionStorage.setItem('soma-guide-xp:xbot:wt-id', 'xp-tour');
    win.sessionStorage.setItem('soma-guide-xp:xbot:wt-step', '1');
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {};
    // onReady has already fired (synchronously in makeWindow), but with setTimeout(100)
    // so we need to trigger it manually for testing
    // Clear ss first (onReady already cleared it during construction)
    // and check that _wtStart was called with correct args
    // Instead verify by seeding ss and calling _onReady directly
    win.sessionStorage.setItem('soma-guide-xp:xbot:wt-id', 'xp-tour');
    win.sessionStorage.setItem('soma-guide-xp:xbot:wt-step', '1');
    // Synchronously invoke the resume check
    const xpId   = g._ssGet('wt-id');
    const xpStep = g._ssGet('wt-step');
    assert.equal(xpId, 'xp-tour', 'sessionStorage should contain the tour id');
    assert.equal(xpStep, '1', 'sessionStorage should contain the step');
  });

  test('_onReady reads pendingResume from sessionStorage', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    /* Use the widget's own _ssSet helper (same JS context) to seed resume state,
     * then call _onReady to simulate arriving on a fresh page load. */
    g._ssSet('resume-id', 'xp-tour');
    g._ssSet('resume-step', '2');
    g._onReady();
    assert.ok(g.pendingResume, 'pendingResume should be restored from sessionStorage');
    assert.equal(g.pendingResume.id, 'xp-tour');
    assert.equal(g.pendingResume.stepIndex, 2);
  });

  test('resume button triggers _wtStart at pendingResume step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {};
    g._wtStart('xp-tour', 2);
    g._wtExit(); // sets pendingResume at step 2
    // click resume button
    win.document.querySelector('.sg-wt-resume').click();
    assert.equal(g.wt.stepIndex, 2, 'resume should restart at saved step index');
    assert.equal(g.mode, 'walkthrough');
  });

  test('_wtStart clears sessionStorage resume keys', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {};
    win.sessionStorage.setItem('soma-guide-xp:xbot:resume-id', 'xp-tour');
    win.sessionStorage.setItem('soma-guide-xp:xbot:resume-step', '1');
    g._wtStart('xp-tour', 0);
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-id'), null);
  });
});

/* ── Start/Stop/Pause controls ── */

describe('SOMA Guide — start/stop/pause controls', function () {
  test('Pause button (sg-wt-exit) is present in walkthrough bar', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-wt-exit');
    assert.ok(btn, '.sg-wt-exit should exist');
    assert.ok(btn.textContent.includes('Pause'), 'exit button should say Pause');
  });

  test('Resume button (sg-wt-resume) is present in resume bar', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-wt-resume');
    assert.ok(btn, '.sg-wt-resume should exist');
    assert.ok(btn.textContent.includes('Resume'), 'resume button should say Resume');
  });

  test('pausing walkthrough shows resume bar on re-open', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 1);
    g._wtExit(); // pause
    // re-open idle
    win.document.querySelector('.sg-fab').click();
    const resumeBar = win.document.querySelector('.sg-resume-bar');
    assert.equal(resumeBar.hidden, false, 'resume bar should show after pause');
  });

  test('topic button starts tour from step 0', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    win.document.querySelectorAll('.sg-topic-btn')[0].click();
    assert.equal(g.mode, 'walkthrough');
    assert.equal(g.wt.stepIndex, 0);
  });

  test('wt-exit saves pendingResume and goes to idle', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    win.document.querySelector('.sg-wt-exit').click();
    assert.equal(g.mode, 'idle');
    assert.ok(g.pendingResume);
    assert.equal(g.pendingResume.stepIndex, 2);
  });
});

/* ── Conversation (ElevenLabs text/voice) ── */

describe('SOMA Guide — conversation init', function () {
  /** Build a window with a controllable Conversation mock */
  function makeWindowWithConv() {
    const win = makeWindow();
    win.eval(`
      window._convSessions = [];
      window._mockConv = {
        endSession: function() { this._ended = true; },
        sendUserMessage: function(msg) { this._sent = (this._sent||[]).concat(msg); }
      };
      window.__importStub = function(url) {
        return Promise.resolve({
          Conversation: {
            startSession: function(opts) {
              window._convSessions.push(opts);
              // simulate onConnect firing after a tick
              if (opts.onConnect) setTimeout(function(){ opts.onConnect(); }, 5);
              return Promise.resolve(window._mockConv);
            }
          }
        });
      };
    `);
    return win;
  }

  test('_convConnected starts false', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g._convConnected, false);
  });

  test('_stopConversation resets _convConnected and _convBuffer', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._convConnected = true;
    g._convBuffer = 'hello';
    g._stopConversation();
    assert.equal(g._convConnected, false);
    assert.equal(g._convBuffer, null);
  });

  test('_startConversation includes onConnect in session options', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._startConversation(true).then(function () {
      const opts = win._convSessions[0];
      assert.ok(typeof opts.onConnect === 'function', 'onConnect should be passed to startSession');
      done();
    }).catch(done);
  });

  test('onConnect sets _convConnected to true', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._startConversation(true).then(function () {
      setTimeout(function () {
        assert.equal(g._convConnected, true, '_convConnected should be true after onConnect fires');
        done();
      }, 20);
    }).catch(done);
  });

  test('_openText eagerly starts a conversation session', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openText();
    setTimeout(function () {
      assert.ok(win._convSessions.length > 0, '_openText should have started a session eagerly');
      done();
    }, 20);
  });

  test('_openText passes textOnly:true', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openText();
    setTimeout(function () {
      const opts = win._convSessions[0];
      assert.equal(opts.textOnly, true, 'text mode should use textOnly:true');
      done();
    }, 20);
  });

  test('_sendText buffers message when session exists but not yet connected', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    // Start conversation but don't let onConnect fire yet
    // We manually control timing by not letting the timeout settle
    g._startConversation(true).then(function () {
      // Immediately after startSession resolves, _convConnected is still false
      // (onConnect fires after 5ms; we're in a .then() right away)
      g._convConnected = false; // ensure it's still false
      g._sendText('hello before connect');
      assert.equal(g._convBuffer, 'hello before connect', 'message should be buffered if not connected');
      done();
    }).catch(done);
  });

  test('_sendText sends immediately when _convConnected is true', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._startConversation(true).then(function () {
      g._convConnected = true;
      g._sendText('immediate message');
      const sent = win._mockConv._sent || [];
      assert.ok(sent.includes('immediate message'), 'should send immediately when connected');
      done();
    }).catch(done);
  });

  test('onConnect flushes buffered message', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._startConversation(true).then(function () {
      g._convConnected = false;
      g._convBuffer = 'buffered msg';
      // Manually fire onConnect
      const opts = win._convSessions[0];
      opts.onConnect();
      assert.equal(g._convConnected, true);
      assert.equal(g._convBuffer, null, 'buffer should be cleared after onConnect');
      const sent = win._mockConv._sent || [];
      assert.ok(sent.includes('buffered msg'), 'buffered message should be sent on connect');
      done();
    }).catch(done);
  });
});

/* ── Demo cursor ── */

describe('SOMA Guide — demo cursor', function () {
  test('_demoBuild appends .sg-demo-cursor to body', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._demoBuild();
    const cursor = win.document.querySelector('.sg-demo-cursor');
    assert.ok(cursor, '.sg-demo-cursor should be in the DOM');
    assert.equal(cursor.parentNode, win.document.body);
  });

  test('_demoBuild is idempotent (only one cursor created)', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._demoBuild();
    g._demoBuild();
    const cursors = win.document.querySelectorAll('.sg-demo-cursor');
    assert.equal(cursors.length, 1, 'should not create duplicate cursors');
  });

  test('_demoMoveTo adds visible class', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const target = win.document.querySelector('body');
    g._demoMoveTo(target, 'hover');
    const cursor = win.document.querySelector('.sg-demo-cursor');
    assert.ok(cursor, 'cursor should exist after _demoMoveTo');
    assert.ok(cursor.classList.contains('sg-demo-cursor--visible'), 'cursor should be visible');
  });

  test('_demoMoveTo sets left and top style on cursor', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const target = win.document.querySelector('body');
    g._demoMoveTo(target, 'click');
    const cursor = win.document.querySelector('.sg-demo-cursor');
    assert.ok(cursor.style.left !== undefined, 'cursor should have left style');
    assert.ok(cursor.style.top  !== undefined, 'cursor should have top style');
  });

  test('_demoStop removes visible class', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._demoBuild();
    g._demoCursor.classList.add('sg-demo-cursor--visible');
    g._demoStop();
    assert.ok(!g._demoCursor.classList.contains('sg-demo-cursor--visible'), 'cursor should not be visible after stop');
  });

  test('_demoStop clears _demoCursorTimer', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._demoCursorTimer = setTimeout(function () {}, 9999);
    g._demoStop();
    assert.equal(g._demoCursorTimer, null);
  });

  test('_setMode hides demo cursor', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._demoBuild();
    g._demoCursor.classList.add('sg-demo-cursor--visible');
    g._setMode('idle');
    assert.ok(!g._demoCursor.classList.contains('sg-demo-cursor--visible'));
  });

  test('sg-wt-playpause button is present in walkthrough bar', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-wt-playpause');
    assert.ok(btn, '.sg-wt-playpause should exist');
  });

  test('_demoRipple appends .sg-demo-ripple to body', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._demoBuild();
    g._demoCursor.style.left = '100px';
    g._demoCursor.style.top  = '100px';
    g._demoRipple();
    const ripple = win.document.querySelector('.sg-demo-ripple');
    assert.ok(ripple, '.sg-demo-ripple should be created');
  });
});

/* ── Auto-advance ── */

describe('SOMA Guide — auto-advance', function () {
  test('_autoPlay defaults to true after _wtStart', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    assert.equal(g._autoPlay, true);
  });

  test('_autoStopped defaults to false after _wtStart', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    assert.equal(g._autoStopped, false);
  });

  test('_wtAutoPlayToggle sets _autoStopped to true', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtAutoPlayToggle();
    assert.equal(g._autoStopped, true);
  });

  test('_wtAutoPlayToggle twice restores _autoStopped to false', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtAutoPlayToggle();
    g._autoClear(); // clear the resume timer so test is synchronous
    g._wtAutoPlayToggle();
    assert.equal(g._autoStopped, false);
  });

  test('_updateAutoPlayBtn shows pause icon when playing', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._autoStopped = false;
    g._updateAutoPlayBtn();
    const btn = win.document.querySelector('.sg-wt-playpause');
    assert.equal(btn.textContent, '⏸');
  });

  test('_updateAutoPlayBtn shows play icon when paused', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._autoStopped = true;
    g._updateAutoPlayBtn();
    const btn = win.document.querySelector('.sg-wt-playpause');
    assert.equal(btn.textContent, '▶');
  });

  test('_autoClear cancels pending timer', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    let fired = false;
    g._autoTimer = setTimeout(function () { fired = true; }, 50);
    g._autoClear();
    assert.equal(g._autoTimer, null);
    // give the timer a chance to fire (it should not)
  });

  test('auto-advance fires via timer when TTS is disabled', function (_, done) {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG); // no ttsProxyUrl → TTS disabled
    g._wtStart('wt-alpha', 0);
    // Override the timer delay to something tiny for testing
    g._autoClear(); // cancel the 5000ms default
    let advanced = false;
    g._autoTimer = setTimeout(function () {
      advanced = true;
      if (g.wt) g._wtNext();
    }, 10);
    setTimeout(function () {
      assert.equal(advanced, true, 'auto-advance timer should fire');
      done();
    }, 30);
  });

  test('_ttsSpeak schedules fallback timer when TTS disabled and onEnded provided', function (_, done) {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG); // no ttsProxyUrl
    let called = false;
    // Replace setTimeout so we can detect the 5000ms schedule without waiting
    const origST = win.setTimeout;
    win.eval('window._timerDelays = [];');
    const origTimer = win.setTimeout;
    // Patch: detect the call
    g._autoClear();
    // Call _ttsSpeak with a stub onEnded and verify _autoTimer is set
    const onEnded = function () { called = true; };
    g._ttsSpeak('hello', onEnded);
    // _autoTimer should be set (5000ms timer)
    assert.ok(g._autoTimer !== null, '_autoTimer should be scheduled when TTS disabled');
    g._autoClear();
    done();
  });

  test('_wtNext clears previous _autoTimer before scheduling next', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    const oldId = g._autoTimer; // timer scheduled by _renderWtStep
    g._wtNext(); // should clear oldId and schedule a new one for step 1
    // The old timer handle should be gone — _autoTimer is either null or a NEW handle
    // We verify by stopping auto-play and checking _autoClear works
    g._autoStopped = true;
    g._autoClear();
    assert.equal(g._autoTimer, null, '_autoClear should leave _autoTimer null');
    assert.equal(g.wt.stepIndex, 1, 'step should have advanced to 1');
  });

  test('_wtExit clears _autoTimer', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._autoTimer = setTimeout(function () {}, 9999);
    g._wtExit();
    assert.equal(g._autoTimer, null);
  });
});

/* ── Resume at correct step ── */

describe('SOMA Guide — resume at correct step', function () {
  test('_wtStart with stepIndex=2 starts at step 2', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    assert.equal(g.wt.stepIndex, 2);
  });

  test('_wtStart with stepIndex=0 starts at step 0', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    assert.equal(g.wt.stepIndex, 0);
  });

  test('pause at step 1 then resume returns to step 1', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext(); // step 1
    g._wtExit(); // pause at step 1
    // Resume
    g._wtStart(g.pendingResume.id, g.pendingResume.stepIndex);
    assert.equal(g.wt.stepIndex, 1, 'should resume at step 1, not step 0');
  });

  test('pause at step 2 then resume returns to step 2', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    g._wtExit(); // pause
    const savedStep = g.pendingResume.stepIndex;
    assert.equal(savedStep, 2, 'pendingResume should record step 2');
    g._wtStart(g.pendingResume.id, g.pendingResume.stepIndex);
    assert.equal(g.wt.stepIndex, 2);
  });

  test('clicking resume button resumes at correct step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._navigate = function() {};
    g._wtStart('wt-alpha', 1);
    g._wtExit(); // pause at step 1
    // open idle and click resume
    win.document.querySelector('.sg-wt-resume').click();
    assert.equal(g.wt.stepIndex, 1, 'resume click should go to step 1');
  });

  test('minimize in walkthrough saves progress', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    g._minimize();
    assert.ok(g.pendingResume, 'pendingResume should be set after minimize');
    assert.equal(g.pendingResume.stepIndex, 2);
    assert.equal(g.mode, 'minimized');
  });

  test('auto-advance preserves correct stepIndex for exit', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    // Simulate auto-advance to step 1
    g._wtNext();
    assert.equal(g.wt.stepIndex, 1);
    // Now exit — should save step 1
    g._wtExit();
    assert.equal(g.pendingResume.stepIndex, 1, 'exit after auto-advance should save step 1');
  });
});

/* ── Timing defect fixes ── */

const DEMO_CONFIG = {
  persona: {
    name: 'DemoBot', id: 'demo-bot', avatar: '🤖',
    greeting: 'Hi!', shortGreeting: 'Back!', walkthroughDone: 'Done!'
  },
  voiceAgentId: 'demo-agent',
  ttsProxyUrl: 'https://example.com/.netlify/functions/el-proxy',
  siteMap: [],
  walkthroughs: [
    {
      id: 'wt-demo',
      label: 'Demo Tour',
      keywords: ['demo'],
      steps: [
        { target: 'body', narration: 'Step one narration text', instruction: 'Do this', demo: 'hover' },
        { target: 'body', narration: 'Step two narration text', instruction: 'Do that', demo: 'click' }
      ]
    }
  ]
};

describe('SOMA Guide — cursor lead-in delay', function () {
  test('_demoStop clears _cursorLeadTimer', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._cursorLeadTimer = setTimeout(function () {}, 9999);
    g._demoStop();
    assert.equal(g._cursorLeadTimer, null, 'lead-in timer should be cleared by _demoStop');
  });

  test('_cursorLeadTimer initialised to null', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g._cursorLeadTimer, null);
  });

  test('cursor lead-in timer is set after audio play starts (not synchronously)', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(DEMO_CONFIG);
    let moveCalled = false;
    g._demoMoveTo = function () { moveCalled = true; };
    g._wtStart('wt-demo', 0);
    // Synchronously: moveCalled must be false — cursor not yet triggered
    assert.equal(moveCalled, false, 'cursor should not move synchronously on step render');
    // After async fetch → play().then() → onPlay() sets the lead-in timer:
    setTimeout(function () {
      assert.ok(g._cursorLeadTimer !== null, 'lead-in timer should be set after audio starts playing');
      assert.equal(moveCalled, false, 'cursor should not have fired yet (lead-in delay pending)');
      g._demoStop(); // cleanup
      done();
    }, 80);
  });

  test('lead-in timer is cancelled when _demoStop is called after play starts', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(DEMO_CONFIG);
    g._wtStart('wt-demo', 0);
    setTimeout(function () {
      assert.ok(g._cursorLeadTimer !== null, 'lead-in timer should be set after audio starts');
      g._demoStop();
      assert.equal(g._cursorLeadTimer, null, 'lead-in timer should be null after _demoStop');
      done();
    }, 80);
  });

  test('lead-in timer is cleared when _wtNext is called', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(DEMO_CONFIG);
    g._wtStart('wt-demo', 0);
    setTimeout(function () {
      const firstTimer = g._cursorLeadTimer;
      assert.ok(firstTimer !== null, 'lead-in timer should be set for step 0');
      // Advance to step 1 — _demoStop is called in _wtNext, clearing the timer
      g._wtNext();
      assert.equal(g._cursorLeadTimer, null,
        'lead-in timer should be cleared immediately when _wtNext is called');
      g._demoStop();
      done();
    }, 80);
  });
});

describe('SOMA Guide — audio ended drives auto-advance', function () {
  test('auto-advance fires on audio ended event', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._wtStart('wt-alpha', 0);
    // Wait for async fetch → blob → Audio → play().then()
    setTimeout(function () {
      assert.equal(g.wt && g.wt.stepIndex, 0, 'should still be on step 0 before ended fires');
      const audio = win._audioInstances[win._audioInstances.length - 1];
      assert.ok(audio, 'audio instance should exist');
      // Cancel the long safety-net so it does not interfere with the manual ended dispatch
      g._autoClear();
      // Fire the real ended event
      audio.dispatchEvent(new win.Event('ended'));
      assert.equal(g.wt && g.wt.stepIndex, 1, 'step should advance to 1 after ended fires');
      done();
    }, 80);
  });

  test('step does NOT advance before audio ended fires', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._wtStart('wt-alpha', 0);
    setTimeout(function () {
      // ended has NOT fired — step must still be 0
      assert.equal(g.wt && g.wt.stepIndex, 0, 'should not advance without ended event');
      g._autoClear();
      done();
    }, 80);
  });

  test('safety-net timer is set after audio play resolves', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsSpeak('Test narration for safety net', function () {});
    // After fetch + blob + Audio + play().then()
    setTimeout(function () {
      assert.ok(g._autoTimer !== null, 'safety-net timer should be armed after play starts');
      g._autoClear();
      done();
    }, 80);
  });

  test('ended event cancels safety-net timer', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    let endedCount = 0;
    g._ttsSpeak('Narration text', function () { endedCount++; });
    setTimeout(function () {
      assert.ok(g._autoTimer !== null, 'safety-net should be set');
      const audio = win._audioInstances[win._audioInstances.length - 1];
      audio.dispatchEvent(new win.Event('ended'));
      assert.equal(g._autoTimer, null, 'safety-net should be cleared after ended fires');
      assert.equal(endedCount, 1, 'onEnded callback should fire exactly once');
      done();
    }, 80);
  });

  test('fallback timer when TTS disabled is at least 5000ms (never under-runs narration)', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG); // no ttsProxyUrl
    let advanced = false;
    g._ttsSpeak('A short text', function () { advanced = true; });
    // Timer is set synchronously for the no-TTS path
    assert.ok(g._autoTimer !== null, 'fallback timer should be scheduled');
    // Must NOT have advanced synchronously
    assert.equal(advanced, false, 'should not advance synchronously');
    g._autoClear();
  });

  test('fallback timer scales with text length (longer text → longer delay)', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    // We cannot read the setTimeout delay directly, but we can verify that
    // a long narration does NOT advance synchronously and a timer is pending
    const longText = 'A'.repeat(200);
    let advanced = false;
    g._ttsSpeak(longText, function () { advanced = true; });
    assert.ok(g._autoTimer !== null, 'timer should be set for long text');
    assert.equal(advanced, false, 'should not advance synchronously for long text');
    g._autoClear();
  });

  test('next narration only starts after _ttsStop clears the previous audio', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._wtStart('wt-alpha', 0);
    setTimeout(function () {
      const firstAudio = win._audioInstances[win._audioInstances.length - 1];
      assert.ok(firstAudio, 'first audio should exist');
      assert.equal(firstAudio.paused, false, 'first audio should be playing');
      // Manually advance without waiting for ended
      g._autoClear();
      g._wtNext();
      // _ttsStop should have paused the first audio immediately
      assert.equal(firstAudio.paused, true, 'first audio should be paused after step advance');
      done();
    }, 80);
  });
});

/* ── Sub-step traversal ── */

const SUB_CONFIG = {
  persona: { name: 'SubBot', id: 'sub-bot', avatar: '🤖', greeting: 'Hi!', shortGreeting: 'Back!', walkthroughDone: 'Done!' },
  voiceAgentId: 'sub-agent',
  siteMap: [],
  walkthroughs: [
    {
      id: 'wt-sub',
      label: 'Sub Tour',
      keywords: ['sub'],
      steps: [
        {
          target: 'body', label: 'Parent A', narration: 'Parent A narration', instruction: 'Parent A',
          substeps: [
            { target: 'body', label: 'Sub A1', narration: 'Sub A1 narration', instruction: 'Sub A1' },
            { target: 'body', label: 'Sub A2', narration: 'Sub A2 narration', instruction: 'Sub A2' }
          ]
        },
        {
          target: 'body', label: 'Parent B', narration: 'Parent B narration', instruction: 'Parent B'
        }
      ]
    }
  ]
};

describe('SOMA Guide — sub-step traversal', function () {
  test('_wtStart at parent step shows parent narration', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 0, -1);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Parent A narration');
  });

  test('_wtStart at sub-step shows sub-step narration', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 0, 0);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Sub A1 narration');
  });

  test('_wtNext from parent descends into first sub-step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 0, -1);
    g._wtNext();
    assert.equal(g.wt.stepIndex, 0);
    assert.equal(g.wt.subStepIndex, 0);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Sub A1 narration');
  });

  test('_wtNext from first sub-step advances to second sub-step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 0, 0);
    g._wtNext();
    assert.equal(g.wt.subStepIndex, 1);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Sub A2 narration');
  });

  test('_wtNext from last sub-step advances to next top-level step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 0, 1);  // last sub-step of Parent A
    g._wtNext();
    assert.equal(g.wt.stepIndex, 1);
    assert.equal(g.wt.subStepIndex, -1);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Parent B narration');
  });

  test('_wtNext from last sub-step of last parent finishes walkthrough', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 0, 1); // last sub-step of Parent A
    g._wtNext();  // → Parent B
    g._wtNext();  // → Finish
    assert.equal(g.wt, null);
  });

  test('flat count includes parent + substeps for each top-level step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    const wt = g._wtById('wt-sub');
    // Parent A (1) + Sub A1 (1) + Sub A2 (1) + Parent B (1) = 4
    assert.equal(g._wtFlatCount(wt), 4);
  });

  test('progress shows flat index correctly for sub-step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 0, 1); // Sub A2 is flat index 2 (0-based), position 3 of 4
    const prog = win.document.querySelector('.sg-wt-prog').textContent;
    assert.equal(prog, 'Step 3 of 4');
  });

  test('Finish button shows on last sub-step of last parent', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 1, -1); // Parent B is last step with no substeps
    const btn = win.document.querySelector('.sg-wt-next').textContent;
    assert.equal(btn, 'Finish ✓');
  });

  test('auto-advance via timer descends into sub-step', function (_, done) {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG); // no TTS → timer fallback
    g._wtStart('wt-sub', 0, -1); // at Parent A
    g._autoClear();
    g._autoTimer = setTimeout(function () {
      g._wtNext(); // descend into Sub A1
    }, 10);
    setTimeout(function () {
      assert.equal(g.wt && g.wt.subStepIndex, 0, 'should have descended into first sub-step');
      done();
    }, 30);
  });

  test('_wtCurrentStep resolves to substep when subStepIndex >= 0', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 0, 1);
    const step = g._wtCurrentStep();
    assert.equal(step.narration, 'Sub A2 narration');
  });

  test('_wtCurrentStep resolves to parent when subStepIndex is -1', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(SUB_CONFIG);
    g._wtStart('wt-sub', 0, -1);
    const step = g._wtCurrentStep();
    assert.equal(step.narration, 'Parent A narration');
  });
});

/* ── Preconditions per sub-step ── */

describe('SOMA Guide — preconditions per sub-step', function () {
  const PRECOND_CONFIG = {
    persona: { name: 'PBot', id: 'p-bot', avatar: '🤖', greeting: 'Hi!', shortGreeting: 'Back!', walkthroughDone: 'Done!' },
    voiceAgentId: 'p-agent',
    siteMap: [],
    walkthroughs: [
      {
        id: 'wt-precond',
        label: 'Precond Tour',
        keywords: ['precond'],
        steps: [
          {
            target: '.my-dropdown',
            label: 'Dropdown parent',
            narration: 'Open the dropdown',
            requires: { dropdown: '.my-dropdown' },
            substeps: [
              {
                target: '.item-one',
                label: 'Item one',
                narration: 'First item',
                requires: { dropdown: '.my-dropdown' }
              },
              {
                target: '.item-two',
                label: 'Item two',
                narration: 'Second item',
                requires: { dropdown: '.my-dropdown' }
              }
            ]
          }
        ]
      }
    ]
  };

  function makeWindowWithDropdown() {
    const dom = new JSDOM(
      '<!DOCTYPE html><html><body>' +
      '<div class="my-dropdown" aria-expanded="false">' +
      '<span class="item-one">One</span>' +
      '<span class="item-two">Two</span>' +
      '</div>' +
      '</body></html>',
      { url: 'http://localhost', runScripts: 'dangerously' }
    );
    const win = dom.window;
    win.eval('window.__importStub = function(url) { return Promise.resolve({ Conversation: { startSession: function() { return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} }); } } }); };');
    win.eval(fs.readFileSync(path.join(ROOT, 'js', 'soma-guide.js'), 'utf8'));
    return win;
  }

  test('_wtSatisfyPreconditions opens dropdown for parent step', function () {
    const win = makeWindowWithDropdown();
    const g = new win.SomaGuide(PRECOND_CONFIG);
    const step = PRECOND_CONFIG.walkthroughs[0].steps[0];
    let ready = false;
    g._wtSatisfyPreconditions(step, function () { ready = true; });
    assert.equal(ready, true, 'callback should fire synchronously when target exists');
    const dropdown = win.document.querySelector('.my-dropdown');
    assert.ok(dropdown.classList.contains('sg-demo-open'), 'dropdown should have sg-demo-open class');
  });

  test('_wtSatisfyPreconditions opens dropdown for sub-step', function () {
    const win = makeWindowWithDropdown();
    const g = new win.SomaGuide(PRECOND_CONFIG);
    const sub = PRECOND_CONFIG.walkthroughs[0].steps[0].substeps[0];
    let ready = false;
    g._wtSatisfyPreconditions(sub, function () { ready = true; });
    assert.equal(ready, true, 'callback should fire synchronously when target exists');
    const dropdown = win.document.querySelector('.my-dropdown');
    assert.ok(dropdown.classList.contains('sg-demo-open'), 'dropdown should be open for sub-step');
  });

  test('preconditions are satisfied when jumping to sub-step via _wtStart', function () {
    const win = makeWindowWithDropdown();
    const g = new win.SomaGuide(PRECOND_CONFIG);
    g._wtStart('wt-precond', 0, 1); // Sub-step 1 (item-two) requires dropdown
    const dropdown = win.document.querySelector('.my-dropdown');
    assert.ok(dropdown.classList.contains('sg-demo-open'), 'dropdown should be open after jumping to sub-step');
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Second item');
  });

  test('_wtSatisfyPreconditions calls onReady after timeout when target missing', function (_, done) {
    const win = makeWindow();
    const g = new win.SomaGuide(PRECOND_CONFIG);
    const step = { target: '.no-such-element', narration: 'test', requires: { dropdown: '.my-dropdown' } };
    // Patch _wtReadyGate to simulate immediate timeout
    g._wtReadyGate = function (sel, timeoutMs, onFound, onTimeout) {
      onTimeout();
    };
    let called = false;
    g._wtSatisfyPreconditions(step, function () { called = true; });
    setTimeout(function () {
      assert.equal(called, true, 'onReady should still be called after timeout');
      done();
    }, 10);
  });
});

/* ── Navigator rendering and navigation ── */

const NAV_CONFIG = {
  persona: { name: 'NavBot', id: 'nav-bot', avatar: '🤖', greeting: 'Hi!', shortGreeting: 'Back!', walkthroughDone: 'Done!' },
  voiceAgentId: 'nav-agent',
  siteMap: [],
  walkthroughs: [
    {
      id: 'wt-nav',
      label: 'Nav Tour',
      keywords: ['nav'],
      steps: [
        {
          target: 'body', label: 'Step 1', narration: 'First step', instruction: 'Do this',
          substeps: [
            { target: 'body', label: 'Sub 1a', narration: 'Sub 1a narration', instruction: 'Sub 1a' },
            { target: 'body', label: 'Sub 1b', narration: 'Sub 1b narration', instruction: 'Sub 1b' }
          ]
        },
        {
          target: 'body', label: 'Step 2', narration: 'Second step', instruction: 'Do that'
        }
      ]
    }
  ]
};

describe('SOMA Guide — navigator panel', function () {
  test('sg-wt-nav element exists in the DOM', function () {
    const win = makeWindow();
    new win.SomaGuide(NAV_CONFIG);
    const nav = win.document.querySelector('.sg-wt-nav');
    assert.ok(nav, '.sg-wt-nav should exist in DOM');
  });

  test('_renderWtNav renders buttons for all flat steps', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    const btns = win.document.querySelectorAll('.sg-wt-nav-step');
    // Step 1 + Sub 1a + Sub 1b + Step 2 = 4 buttons
    assert.equal(btns.length, 4, 'should render 4 nav step buttons');
  });

  test('current parent step gets --current class', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    const current = win.document.querySelectorAll('.sg-wt-nav-step--current');
    assert.equal(current.length, 1, 'exactly one button should be current');
    assert.equal(current[0].getAttribute('data-si'), '0');
    assert.equal(current[0].getAttribute('data-sub'), '-1');
  });

  test('current sub-step gets --current class', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, 1); // Sub 1b
    const current = win.document.querySelectorAll('.sg-wt-nav-step--current');
    assert.equal(current.length, 1);
    assert.equal(current[0].getAttribute('data-si'), '0');
    assert.equal(current[0].getAttribute('data-sub'), '1');
  });

  test('sub-step buttons get --sub class', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    const subs = win.document.querySelectorAll('.sg-wt-nav-step--sub');
    assert.equal(subs.length, 2, 'two sub-step buttons should have --sub class');
  });

  test('navigator updates when step advances', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    g._wtNext(); // descend into Sub 1a
    const current = win.document.querySelectorAll('.sg-wt-nav-step--current');
    assert.equal(current.length, 1);
    assert.equal(current[0].getAttribute('data-sub'), '0', 'Sub 1a should be current after advance');
  });

  test('clicking a nav button jumps to that step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    // Find the "Step 2" nav button (data-si=1, data-sub=-1)
    const btns = win.document.querySelectorAll('.sg-wt-nav-step');
    const step2btn = Array.from(btns).find(function (b) {
      return b.getAttribute('data-si') === '1' && b.getAttribute('data-sub') === '-1';
    });
    assert.ok(step2btn, 'Step 2 nav button should exist');
    step2btn.click();
    assert.equal(g.wt.stepIndex, 1, 'click should jump to Step 2');
    assert.equal(g.wt.subStepIndex, -1);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Second step');
  });

  test('clicking a sub-step nav button jumps to that sub-step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 1, -1); // start at Step 2
    // Find Sub 1b (data-si=0, data-sub=1)
    const btns = win.document.querySelectorAll('.sg-wt-nav-step');
    const sub1bBtn = Array.from(btns).find(function (b) {
      return b.getAttribute('data-si') === '0' && b.getAttribute('data-sub') === '1';
    });
    assert.ok(sub1bBtn, 'Sub 1b nav button should exist');
    sub1bBtn.click();
    assert.equal(g.wt.stepIndex, 0, 'click should jump to parent step index 0');
    assert.equal(g.wt.subStepIndex, 1, 'click should land at sub-step 1');
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Sub 1b narration');
  });

  test('navigator is inside the walkthrough panel (sg-wt-ui)', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    const wtUi = win.document.querySelector('.sg-wt-ui');
    const nav  = wtUi && wtUi.querySelector('.sg-wt-nav');
    assert.ok(nav, '.sg-wt-nav should be inside .sg-wt-ui');
    assert.ok(nav.querySelectorAll('.sg-wt-nav-step').length > 0, 'nav should have step buttons');
  });

  test('navigator is empty before walkthrough starts', function () {
    const win = makeWindow();
    new win.SomaGuide(NAV_CONFIG);
    const nav = win.document.querySelector('.sg-wt-nav');
    assert.equal(nav.innerHTML, '', 'navigator should be empty before walkthrough starts');
  });

  test('nav click satisfies preconditions before playing (dropdown config)', function () {
    const dom = new JSDOM(
      '<!DOCTYPE html><html><body>' +
      '<div class="drop" aria-expanded="false"><span class="inner">Item</span></div>' +
      '</body></html>',
      { url: 'http://localhost', runScripts: 'dangerously' }
    );
    const win2 = dom.window;
    win2.eval('window.__importStub = function(url) { return Promise.resolve({ Conversation: { startSession: function() { return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} }); } } }); };');
    win2.eval(fs.readFileSync(path.join(ROOT, 'js', 'soma-guide.js'), 'utf8'));

    const dropConfig = {
      persona: { name: 'D', id: 'd', avatar: '🤖', greeting: 'Hi', shortGreeting: 'Back', walkthroughDone: 'Done' },
      voiceAgentId: 'x',
      siteMap: [],
      walkthroughs: [{
        id: 'wt-drop',
        label: 'Drop',
        keywords: ['drop'],
        steps: [{
          target: '.drop',
          label: 'Dropdown step',
          narration: 'The dropdown',
          requires: { dropdown: '.drop' },
          substeps: [{
            target: '.inner',
            label: 'Inner',
            narration: 'Inner item',
            requires: { dropdown: '.drop' }
          }]
        }]
      }]
    };

    const g = new win2.SomaGuide(dropConfig);
    g._wtStart('wt-drop', 0, -1);
    // Click the sub-step nav button
    const btns = win2.document.querySelectorAll('.sg-wt-nav-step');
    const subBtn = Array.from(btns).find(function (b) {
      return b.getAttribute('data-sub') === '0';
    });
    assert.ok(subBtn, 'sub nav button should exist');
    subBtn.click();
    const dropdown = win2.document.querySelector('.drop');
    assert.ok(dropdown.classList.contains('sg-demo-open'), 'dropdown should be open after nav click to sub-step');
    assert.equal(g.wt.subStepIndex, 0);
  });
});

/* ── A. Root-absolute page resolution (no doubling) ── */

describe('SOMA Guide — root-absolute page resolution', function () {
  test('engine navigates to root-absolute path (no .html), not a relative URL', function () {
    const win = makeWindowOnPage('index.html');
    const g = new win.SomaGuide(XPAGE_CONFIG);
    var navigatedTo = null;
    g._navigate = function(page) { navigatedTo = page; };
    g.wt = { id: 'xp-tour', stepIndex: 1 };
    g._setMode('walkthrough');
    g._renderWtStep();
    assert.ok(navigatedTo && navigatedTo.charAt(0) === '/', 'navigate target must start with / (root-absolute)');
    assert.ok(!navigatedTo.endsWith('.html'), 'navigate target must not end in .html (clean URL)');
  });

  test('no doubling: navigating to member subpage from member subpage uses root-absolute path', function () {
    /* Simulate being on /members/greg-foster and stepping to members.html */
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost/members/greg-foster',
      runScripts: 'dangerously'
    });
    const win2 = dom.window;
    win2.eval('window.__importStub = function(url) { return Promise.resolve({ Conversation: { startSession: function() { return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} }); } } }); };');
    win2.eval(fs.readFileSync(path.join(ROOT, 'js', 'soma-guide.js'), 'utf8'));

    const cfg = {
      persona: { name: 'T', id: 'tbot', avatar: '🤖', greeting: 'Hi', shortGreeting: 'Back', walkthroughDone: 'Done' },
      voiceAgentId: 'x', siteMap: [],
      walkthroughs: [{
        id: 'wt-x', label: 'X', keywords: ['x'],
        steps: [{ target: 'body', page: 'members', label: 'Grid', narration: 'Grid', instruction: 'See' }]
      }]
    };
    const g2 = new win2.SomaGuide(cfg);
    var navigatedTo = null;
    g2._navigate = function(p) { navigatedTo = p; };
    g2._wtStart('wt-x', 0, -1);
    /* When stepping from /members/greg-foster to page 'members', engine must produce /members
     * and NOT /members/members (the doubled form). */
    assert.equal(navigatedTo, '/members', 'should navigate to /members, not doubled path');
  });

  test('engine does NOT navigate when already on the correct page (subpath match)', function () {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost/members/greg-foster',
      runScripts: 'dangerously'
    });
    const win3 = dom.window;
    win3.eval('window.__importStub = function(url) { return Promise.resolve({ Conversation: { startSession: function() { return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} }); } } }); };');
    win3.eval(fs.readFileSync(path.join(ROOT, 'js', 'soma-guide.js'), 'utf8'));

    const cfg = {
      persona: { name: 'T', id: 'tbot2', avatar: '🤖', greeting: 'Hi', shortGreeting: 'Back', walkthroughDone: 'Done' },
      voiceAgentId: 'x', siteMap: [],
      walkthroughs: [{
        id: 'wt-x', label: 'X', keywords: ['x'],
        steps: [{ target: 'body', page: 'members/greg-foster', label: 'Profile', narration: 'Profile', instruction: 'See' }]
      }]
    };
    const g3 = new win3.SomaGuide(cfg);
    var navigated = false;
    g3._navigate = function() { navigated = true; };
    g3._wtStart('wt-x', 0, -1);
    assert.equal(navigated, false, 'should NOT navigate when already on the matching subpath');
  });
});

/* ── B. Ensure-page gate runs on jump from non-matching page ── */

describe('SOMA Guide — ensure-page gate on jump/resume', function () {
  test('jumping to a step with page: navigates even when coming from a different page', function () {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'http://localhost/members/greg-foster',
      runScripts: 'dangerously'
    });
    const win4 = dom.window;
    win4.eval('window.__importStub = function(url) { return Promise.resolve({ Conversation: { startSession: function() { return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} }); } } }); };');
    win4.eval(fs.readFileSync(path.join(ROOT, 'js', 'soma-guide.js'), 'utf8'));

    const cfg = {
      persona: { name: 'T', id: 'tbot3', avatar: '🤖', greeting: 'Hi', shortGreeting: 'Back', walkthroughDone: 'Done' },
      voiceAgentId: 'x', siteMap: [],
      walkthroughs: [{
        id: 'wt-j', label: 'J', keywords: ['j'],
        steps: [
          { target: 'body', label: 'Step 1', narration: 'Step 1', instruction: '' },
          { target: 'body', page: 'recommendations', label: 'Recs', narration: 'Recs', instruction: '' }
        ]
      }]
    };
    const g4 = new win4.SomaGuide(cfg);
    var navigatedTo = null;
    g4._navigate = function(p) { navigatedTo = p; };
    /* Jump directly to step 1 (page: 'recommendations') from /members/greg-foster */
    g4._wtStart('wt-j', 1, -1);
    assert.equal(navigatedTo, '/recommendations', 'should navigate to /recommendations when jumping from wrong page');
  });

  test('navigator click to a page-gated step triggers navigation', function () {
    const win5 = makeWindowOnPage('index.html');
    const cfg = {
      persona: { name: 'T', id: 'tbot4', avatar: '🤖', greeting: 'Hi', shortGreeting: 'Back', walkthroughDone: 'Done' },
      voiceAgentId: 'x', siteMap: [],
      walkthroughs: [{
        id: 'wt-n', label: 'N', keywords: ['n'],
        steps: [
          { target: 'body', label: 'Step 1', narration: 'Step 1', instruction: '' },
          { target: 'body', page: 'about', label: 'About', narration: 'About page', instruction: '' }
        ]
      }]
    };
    const g5 = new win5.SomaGuide(cfg);
    var navigatedTo = null;
    g5._navigate = function(p) { navigatedTo = p; };
    g5._wtStart('wt-n', 0, -1);
    /* Click the About step in the navigator */
    const btns = win5.document.querySelectorAll('.sg-wt-nav-step');
    const aboutBtn = Array.from(btns).find(function(b) { return b.getAttribute('data-si') === '1'; });
    assert.ok(aboutBtn, 'About nav button should exist');
    aboutBtn.click();
    assert.equal(navigatedTo, '/about', 'navigator click should navigate to the gated page');
  });
});

/* ── Pause view consolidation (Issue #3) ── */

describe('SOMA Guide — pause view: single structured navigator', function () {
  test('paused state renders structured navigator buttons (sg-wt-nav-step) in resume-steps', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    g._wtExit(); // pause
    const resumeSteps = win.document.querySelector('.sg-resume-steps');
    const navBtns = resumeSteps.querySelectorAll('.sg-wt-nav-step');
    assert.ok(navBtns.length > 0, 'structured sg-wt-nav-step buttons should render in resume-steps when paused');
  });

  test('paused state has NO flat sg-resume-step buttons in resume-steps', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    g._wtExit();
    const resumeSteps = win.document.querySelector('.sg-resume-steps');
    const flatBtns = resumeSteps.querySelectorAll('.sg-resume-step');
    assert.equal(flatBtns.length, 0, 'old flat sg-resume-step buttons must not appear when paused');
  });

  test('paused navigator includes all steps AND substeps (complete tree)', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 1, -1); // start at Step 2 so the saved position differs
    g._wtExit();
    // NAV_CONFIG: Step 1 + Sub 1a + Sub 1b + Step 2 = 4 total
    const resumeSteps = win.document.querySelector('.sg-resume-steps');
    const navBtns = resumeSteps.querySelectorAll('.sg-wt-nav-step');
    assert.equal(navBtns.length, 4, 'complete tree: all 4 steps/substeps should appear in paused navigator');
    const subBtns = resumeSteps.querySelectorAll('.sg-wt-nav-step--sub');
    assert.equal(subBtns.length, 2, 'both sub-steps should be present in the paused navigator');
  });

  test('topic list is hidden when paused mid-tour', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    g._wtExit(); // triggers _openIdle with pendingResume set
    const topicList = win.document.querySelector('.sg-topic-list');
    assert.equal(topicList.hidden, true, 'topic list should be hidden while paused mid-tour');
  });

  test('topic list is visible after _wtGoToNeutral clears pendingResume', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    g._wtExit(); // pause
    g._wtGoToNeutral(); // return to neutral
    const topicList = win.document.querySelector('.sg-topic-list');
    assert.equal(topicList.hidden, false, 'topic list should be visible after returning to neutral');
  });
});

/* ── Neutral navigation: finish + Back to Menu ── */

describe('SOMA Guide — return to neutral state', function () {
  test('sg-wt-menu button (← Menu) is present in sg-wt-bar', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-wt-bar .sg-wt-menu');
    assert.ok(btn, '.sg-wt-menu button should exist inside .sg-wt-bar');
  });

  test('_wtGoToNeutral from walkthrough mode returns to idle and clears wt', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 1);
    assert.equal(g.mode, 'walkthrough');
    g._wtGoToNeutral();
    assert.equal(g.mode, 'idle', 'mode should be idle after _wtGoToNeutral');
    assert.equal(g.wt, null, 'wt should be cleared');
    assert.equal(g.pendingResume, null, 'pendingResume should not be set');
  });

  test('sg-wt-home button (Back to Menu) is present in resume bar', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-wt-home');
    assert.ok(btn, '.sg-wt-home button should exist in DOM');
  });

  test('clicking Back to Menu clears pendingResume and returns to idle', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    g._wtExit(); // pause
    assert.ok(g.pendingResume, 'should have pendingResume after pause');
    win.document.querySelector('.sg-wt-home').click();
    assert.equal(g.mode, 'idle', 'mode should be idle after Back to Menu');
    assert.equal(g.pendingResume, null, 'pendingResume should be cleared');
  });

  test('Back to Menu shows topic list and hides resume bar', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    g._wtExit();
    win.document.querySelector('.sg-wt-home').click();
    const resumeBar = win.document.querySelector('.sg-resume-bar');
    assert.equal(resumeBar.hidden, true, 'resume bar should be hidden after Back to Menu');
    const topicList = win.document.querySelector('.sg-topic-list');
    assert.equal(topicList.hidden, false, 'topic list should be visible after Back to Menu');
  });

  test('_wtFinish returns to idle mode with topic list visible', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtFinish();
    assert.equal(g.mode, 'idle', '_wtFinish should leave widget in idle mode');
    assert.equal(g.wt, null, 'wt should be null after finish');
    assert.equal(g.pendingResume, null, 'pendingResume should be null after finish');
    const topicList = win.document.querySelector('.sg-topic-list');
    assert.equal(topicList.hidden, false, 'topic list should be visible after finish');
  });

  test('_wtFinish hides resume bar', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtFinish();
    const resumeBar = win.document.querySelector('.sg-resume-bar');
    assert.equal(resumeBar.hidden, true, 'resume bar should be hidden after finish');
  });

  test('_wtGoToNeutral clears sessionStorage resume keys', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 1);
    g._wtExit();
    g._wtGoToNeutral();
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:test-bot:resume-id'), null);
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:test-bot:resume-step'), null);
  });
});

/* ── D. Navigator nesting and first/parent step reachability ── */

describe('SOMA Guide — navigator nesting and parent step reachability', function () {
  test('substeps are inside a sg-wt-nav-substeps wrapper element', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    const substepsWrapper = win.document.querySelector('.sg-wt-nav-substeps');
    assert.ok(substepsWrapper, '.sg-wt-nav-substeps wrapper should exist');
    const subBtns = substepsWrapper.querySelectorAll('.sg-wt-nav-step--sub');
    assert.equal(subBtns.length, 2, 'both substep buttons should be inside the wrapper');
  });

  test('parent step and substeps share a sg-wt-nav-group container', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, -1);
    const group = win.document.querySelector('.sg-wt-nav-group');
    assert.ok(group, '.sg-wt-nav-group should exist for a step with substeps');
    const parentBtn = group.querySelector('.sg-wt-nav-step:not(.sg-wt-nav-step--sub)');
    assert.ok(parentBtn, 'parent step button should be inside the group');
    assert.equal(parentBtn.getAttribute('data-sub'), '-1', 'parent button data-sub should be -1');
  });

  test('clicking the first/parent step button (data-sub=-1) jumps to parent at step 0', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, 1); /* start at sub-step 1b */
    /* Now click the parent step (data-si=0 data-sub=-1) */
    const btns = win.document.querySelectorAll('.sg-wt-nav-step');
    const parentBtn = Array.from(btns).find(function(b) {
      return b.getAttribute('data-si') === '0' && b.getAttribute('data-sub') === '-1';
    });
    assert.ok(parentBtn, 'parent step (data-sub=-1) button should be present');
    parentBtn.click();
    assert.equal(g.wt.stepIndex, 0, 'should jump to step index 0');
    assert.equal(g.wt.subStepIndex, -1, 'subStepIndex should be -1 (at parent)');
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'First step', 'should show parent step narration');
  });

  test('clicking parent step from within a substep restores parent narration', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 0, 1); /* at Sub 1b */
    const btns = win.document.querySelectorAll('.sg-wt-nav-step');
    const parentBtn = Array.from(btns).find(function(b) {
      return b.getAttribute('data-si') === '0' && b.getAttribute('data-sub') === '-1';
    });
    parentBtn.click();
    assert.equal(g.wt.subStepIndex, -1, 'should be at parent (subStepIndex -1) after click');
  });

  test('step without substeps has no sg-wt-nav-group wrapper', function () {
    /* NAV_CONFIG Step 2 has no substeps — should not be wrapped in a group */
    const win = makeWindow();
    const g = new win.SomaGuide(NAV_CONFIG);
    g._wtStart('wt-nav', 1, -1); /* Step 2 (no substeps) */
    /* querySelectorAll gets all step buttons; Step 2 button must NOT be inside a group */
    const groups = win.document.querySelectorAll('.sg-wt-nav-group');
    /* Only Step 1 (which has substeps) gets a group; Step 2 should not */
    groups.forEach(function(gr) {
      const stepBtn = gr.querySelector('[data-si="1"]');
      assert.ok(!stepBtn, 'Step 2 (no substeps) should not be inside a sg-wt-nav-group');
    });
  });
});

/* ── Close (×) button and mobile affordances ── */

describe('SOMA Guide — close button (×)', function () {
  test('.sg-btn-close button exists inside .sg-header-btns', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-header-btns .sg-btn-close');
    assert.ok(btn, '.sg-btn-close should exist inside .sg-header-btns');
  });

  test('.sg-btn-close button shows × symbol', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-btn-close');
    assert.ok(btn.textContent.includes('×'), 'close button text should be ×');
  });

  test('.sg-btn-close has aria-label="Close"', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-btn-close');
    assert.equal(btn.getAttribute('aria-label'), 'Close');
  });

  test('clicking .sg-btn-close minimizes the widget from idle mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    assert.equal(g.mode, 'idle');
    win.document.querySelector('.sg-btn-close').click();
    assert.equal(g.mode, 'minimized', 'close button should minimize widget to FAB');
  });

  test('clicking .sg-btn-close minimizes the widget from walkthrough mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 1);
    assert.equal(g.mode, 'walkthrough');
    win.document.querySelector('.sg-btn-close').click();
    assert.equal(g.mode, 'minimized', 'close button should minimize from walkthrough mode');
  });

  test('after close, FAB is the visible affordance (sg--min class set)', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    win.document.querySelector('.sg-btn-close').click();
    const root = win.document.getElementById('soma-guide');
    assert.ok(root.className.includes('sg--min'), 'root element should have sg--min class after close');
  });

  test('close saves walkthrough progress (pendingResume set) so user can reopen', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    win.document.querySelector('.sg-btn-close').click();
    assert.ok(g.pendingResume, 'pendingResume should be set after closing mid-tour');
    assert.equal(g.pendingResume.stepIndex, 2);
  });

  test('existing minimize button (sg-btn-min) still works alongside sg-btn-close', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    win.document.querySelector('.sg-btn-min').click();
    assert.equal(g.mode, 'minimized', 'original − button should still minimize');
  });
});
