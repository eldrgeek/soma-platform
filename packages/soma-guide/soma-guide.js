/* SOMA Guide Widget — portable floating assistant
 *
 * No site-specific logic here. All persona, voice agent, site map,
 * and walkthrough scripts live in the per-site config object:
 *   window.SomaGuideConfig = { persona, voiceAgentId, siteMap, walkthroughs }
 *
 * Step schema (each entry in walkthroughs[].steps or substeps[]):
 *   { id, label, target, narration, instruction, page, demo, requires, substeps[] }
 *   - page:     navigate to this filename before animating (e.g. 'members.html')
 *   - demo:     'click' | 'hover' | 'openDropdown' | falsy
 *   - requires: { dropdown: '<css-selector>' } — open this dropdown before animating
 *   - substeps: array of child steps (one level deep); parent narrates first,
 *               then substeps play in sequence
 *
 * Integration: include css/soma-guide.css, then the per-site config script,
 * then this script (type="module" or plain — both work).
 */
(function (global) {
  'use strict';

  /* ── Constants ──────────────────────────────────────────────────────────── */
  const ELEVENLABS_ESM   = 'https://esm.sh/@elevenlabs/client@latest';
  const READY_GATE_MS    = 2500;   /* max wait for target to appear */
  const READY_GATE_TICK  = 80;     /* poll interval */
  const CURSOR_LEAD_IN   = 1200;   /* ms after audio starts → cursor appears */
  const TTS_MS_PER_CHAR  = 85;     /* generous estimate; used for fallback timer */
  const TTS_FLOOR_MS     = 6000;   /* minimum fallback when TTS enabled */
  const TTS_BUFFER_MS    = 3500;   /* extra buffer added to known audio duration */
  const SOMA_GUIDE_VERSION = '2026-0615c'; /* bump each build; used for stale-state guard */

  /* ── SomaGuide class ────────────────────────────────────────────────────── */
  function SomaGuide(cfg) {
    this.cfg = cfg;
    this.ConvClass = null;
    this.conversation = null;
    this._convConnected = false;
    this._convBuffer = null;
    this.mode = 'minimized';
    this.wt = null;          /* { id, stepIndex, subStepIndex } — subStepIndex=-1 means at parent */
    this.pendingResume = null;

    /* Auto-advance state */
    this._autoPlay    = true;
    this._autoStopped = false;
    this._autoTimer   = null;

    /* Demo cursor state */
    this._demoCursor        = null;
    this._demoCursorTimer   = null;
    this._cursorLeadTimer   = null;  /* delay cursor until mid-utterance */
    this._pendingCursorTarget = null; /* target element captured before audio starts */
    this._pendingCursorDemo   = null; /* demo action captured before audio starts */

    /* Dropdown state managed by engine */
    this._openDropdownContainer = null;
    this._openDropdownToggle    = null;

    /* TTS pre-fetch cache: { url, blobUrl } | null */
    this._ttsPrefetchCache = null;
    this._ttsPrefetchUrl   = null;

    /* Inference (Ask) state */
    this._webSearchEnabled = false;

    var lsBase = 'soma-guide:' + (cfg.persona.id || cfg.persona.name);
    this._lsGet = function (k) { try { return localStorage.getItem(lsBase + ':' + k); } catch(e) { return null; } };
    this._lsSet = function (k, v) { try { localStorage.setItem(lsBase + ':' + k, v); } catch(e) {} };

    var ssBase = 'soma-guide-xp:' + (cfg.persona.id || cfg.persona.name);
    this._ssGet = function (k) { try { return sessionStorage.getItem(ssBase + ':' + k); } catch(e) { return null; } };
    this._ssSet = function (k, v) { try { sessionStorage.setItem(ssBase + ':' + k, v); } catch(e) {} };
    this._ssDel = function (k) { try { sessionStorage.removeItem(ssBase + ':' + k); } catch(e) {} };

    this.introduced = this._lsGet('introduced') === '1';
    this._ttsMuted  = this._lsGet('tts-muted')  === '1';
    this._ttsAudio  = null;

    /* Conversation recording (diagnostics): stable anon id + per-load session. */
    this._anonId = this._lsGet('anon-id');
    if (!this._anonId) { this._anonId = 'a-' + Math.random().toString(36).slice(2, 10); this._lsSet('anon-id', this._anonId); }
    this._session = { id: 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), turns: [] };
    this._profile = null;

    /* Host adapter — "Bill's hands". All reach into the host page goes through
     * this one object, so a future iframe build can swap in a postMessage-backed
     * adapter (talking to a host shim) without changing engine logic. Defaults
     * to direct-DOM for the embedded delivery mode. See docs/SOMA-DELIVERY.md. */
    this._host = this.cfg.host ||
      (this.cfg.delivery === 'iframe' ? this._makeIframeHost() : this._makeEmbeddedHost());

    /* Always-on observer: a ring buffer of recent page activity (nav / clicks /
     * errors / input focus), used to give intake its "is this about <last
     * action>?" context. Privacy-guarded — never captures sensitive field values. */
    this._activity = [];
    this._activePersona = null;

    this._build();
    this._enableDrag();
    this._enableResize();
    this._bindEvents();
    this._loadProfile();
    this._startObserver();
    console.log('[SomaGuide] v' + SOMA_GUIDE_VERSION);

    var self = this;
    if (typeof document !== 'undefined' && document.readyState !== 'loading') {
      self._onReady();
    } else if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', function () { self._onReady(); });
    }
  }

  /* Overridable navigation hook — tests replace this to intercept. */
  SomaGuide.prototype._navigate = function (page) {
    if (typeof location !== 'undefined') location.href = page;
  };

  /* djb2-xor hash of all walkthrough/step ids → 8-char hex, used for the
   * state version guard (if config changes, stale sessionStorage is discarded). */
  SomaGuide.prototype._computeConfigHash = function () {
    var s = (this.cfg.walkthroughs || []).map(function (wt) {
      return wt.id + ':' + (wt.steps || []).map(function (step) {
        return (step.id || '') + '+' + (step.substeps || []).map(function (sub) {
          return sub.id || '';
        }).join(',');
      }).join(';');
    }).join('|');
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
    }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  };

  SomaGuide.prototype._onReady = function () {
    var self = this;

    /* State version guard: discard any persisted walkthrough/resume state saved
     * by a different build or config — prevents dead steps from replaying. */
    var storedVer  = this._ssGet('state-ver');
    var storedCfg  = this._ssGet('state-cfg');
    var currentCfg = this._computeConfigHash();
    var stateValid = storedVer === SOMA_GUIDE_VERSION && storedCfg === currentCfg;

    var xpId      = this._ssGet('wt-id');
    var xpStep    = this._ssGet('wt-step');
    var xpSubStep = this._ssGet('wt-substep');
    if (xpId) {
      this._ssDel('wt-id');
      this._ssDel('wt-step');
      this._ssDel('wt-substep');
      if (stateValid) {
        var subSt = (xpSubStep !== null && xpSubStep !== '') ? parseInt(xpSubStep, 10) : -1;
        setTimeout(function () {
          self._wtStart(xpId, parseInt(xpStep, 10) || 0, subSt);
        }, 100);
        return;
      }
      /* Stale state — clear remaining keys and fall through to fresh start */
      this._ssDel('resume-id');
      this._ssDel('resume-step');
      this._ssDel('resume-substep');
      this._ssDel('state-ver');
      this._ssDel('state-cfg');
    }

    var prId      = this._ssGet('resume-id');
    var prStep    = this._ssGet('resume-step');
    var prSubStep = this._ssGet('resume-substep');
    if (prId) {
      if (stateValid) {
        var subR = (prSubStep !== null && prSubStep !== '') ? parseInt(prSubStep, 10) : -1;
        this.pendingResume = { id: prId, stepIndex: parseInt(prStep, 10) || 0, subStepIndex: subR };
      } else {
        /* Stale resume state — discard */
        this._ssDel('resume-id');
        this._ssDel('resume-step');
        this._ssDel('resume-substep');
        this._ssDel('state-ver');
        this._ssDel('state-cfg');
      }
    }

    var autoWt = this.cfg.autoStartWalkthrough;
    if (autoWt) {
      /* autoStartWalkthrough (Bill/Proteus): open the widget to the greeting
       * panel so the user sees the "▶ Start tour" button. Their click provides
       * the browser gesture that unlocks audio. */
      setTimeout(function () {
        self._lsSet('introduced', '1');
        self.introduced = true;
        self._openIdle(true);
      }, 500);
    } else if (self.cfg.askFirst && self.cfg.inferenceUrl) {
      /* askFirst (Ariadne): open directly into conversational Ask mode.
       * Inference answers from page content; no auto-tour. */
      setTimeout(function () {
        self._lsSet('introduced', '1');
        self.introduced = true;
        self._openAsk();
      }, 500);
    } else if (!this.introduced) {
      setTimeout(function () { self._openIdle(true); }, 500);
    }
  };

  /* ── Build DOM ── */
  SomaGuide.prototype._build = function () {
    var name   = this.cfg.persona.name;
    var avatar = this.cfg.persona.avatar || '💬';

    var el = document.createElement('div');
    el.id = 'soma-guide';
    el.className = 'sg sg--min';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', name + ' Assistant');

    el.innerHTML = [
      '<button class="sg-fab" aria-label="Ask ' + name + '">',
      '  <span class="sg-fab-avatar">' + avatar + '</span>',
      '  <span class="sg-fab-name">Ask ' + name + '</span>',
      '</button>',
      '<div class="sg-panel" aria-hidden="true">',
      '  <div class="sg-header">',
      '    <div class="sg-persona">',
      '      <span class="sg-persona-avatar">' + avatar + '</span>',
      '      <span class="sg-persona-name">' + name + '</span>',
      '      <span class="sg-version">v' + SOMA_GUIDE_VERSION + '</span>',
      '    </div>',
      '    <div class="sg-header-btns">',
      '      <button class="sg-btn-text" title="Text chat" aria-label="Text mode">💬</button>',
      '      <button class="sg-btn-voice" title="Voice" aria-label="Voice mode">🎙</button>',
      '      <button class="sg-btn-min" title="Minimize" aria-label="Minimize">−</button>',
      '      <button class="sg-btn-close" title="Close" aria-label="Close">×</button>',
      '    </div>',
      '  </div>',
      '  <div class="sg-body">',
      '    <div class="sg-io-toggle" hidden role="group" aria-label="Response mode">',
      '      <button class="sg-io-btn sg-io-text" aria-pressed="true">💬 Text</button>',
      '      <button class="sg-io-btn sg-io-voice" aria-pressed="false">🎙 Voice</button>',
      '    </div>',
      '    <div class="sg-idle-ui">',
      '      <p class="sg-greeting"></p>',
      '      <div class="sg-topic-list"></div>',
      '    </div>',
      '    <div class="sg-voice-ui" hidden>',
      '      <div class="sg-orb" role="button" tabindex="0" aria-label="Tap to speak with Bill"></div>',
      '      <p class="sg-voice-status">Tap to speak</p>',
      '      <p class="sg-voice-transcript"></p>',
      '    </div>',
      '    <div class="sg-text-ui" hidden>',
      '      <div class="sg-messages" role="log" aria-live="polite"></div>',
      '      <div class="sg-suggest" hidden></div>',
      '      <div class="sg-input-bar">',
      '        <input class="sg-input" type="text" placeholder="Ask me anything…" aria-label="Message">',
      '        <button class="sg-mic sg-btn-icon" title="Voice input" aria-label="Voice input">🎤</button>',
      '        <button class="sg-web-toggle" title="Search the web (off)" aria-label="Toggle web search" aria-pressed="false">🔎</button>',
      '        <button class="sg-send" aria-label="Send">↑</button>',
      '      </div>',
      '    </div>',
      '    <div class="sg-wt-ui" hidden>',
      '      <p class="sg-wt-narration"></p>',
      '      <p class="sg-wt-instruction"></p>',
      '      <div class="sg-wt-nav"></div>',
      '      <div class="sg-tts-bar">',
      '        <button class="sg-btn-mute sg-btn-icon" title="Mute narration" aria-label="Mute narration">🔊</button>',
      '        <button class="sg-btn-replay sg-btn-icon" title="Replay narration" aria-label="Replay narration">↺</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="sg-wt-bar" hidden>',
      '    <button class="sg-wt-menu" title="Stop tour and return to menu">■ Stop tour</button>',
      '    <button class="sg-wt-exit" title="Pause tour and save your progress">⏸ Pause</button>',
      '    <span class="sg-wt-prog"></span>',
      '    <button class="sg-wt-playpause sg-btn-icon" title="Pause auto-play" aria-label="Pause auto-play">⏸</button>',
      '    <button class="sg-wt-next">Next →</button>',
      '  </div>',
      '  <div class="sg-resume-bar" hidden>',
      '    <p>Pick up where you left off?</p>',
      '    <div class="sg-resume-steps"></div>',
      '    <div class="sg-resume-btns">',
      '      <button class="sg-wt-resume">▶ Resume</button>',
      '      <button class="sg-wt-restart">↺ Start over</button>',
      '      <button class="sg-wt-home">← Menu</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    document.body.appendChild(el);
    this.el = el;
    this._$ = function (sel) { return el.querySelector(sel); };
  };

  /* ── Drag ── */
  SomaGuide.prototype._enableDrag = function () {
    var self   = this;
    var header = this._$('.sg-header');
    var dragging = false, ox = 0, oy = 0;

    function onDown(cx, cy) {
      dragging = true;
      var r = self.el.getBoundingClientRect();
      ox = cx - r.left;
      oy = cy - r.top;
    }
    function onMove(cx, cy) {
      if (!dragging) return;
      self.el.style.left   = (cx - ox) + 'px';
      self.el.style.top    = (cy - oy) + 'px';
      self.el.style.right  = 'auto';
      self.el.style.bottom = 'auto';
    }
    function onUp() { dragging = false; }

    header.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) return;
      onDown(e.clientX, e.clientY);
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); });
    document.addEventListener('mouseup', onUp);

    header.addEventListener('touchstart', function (e) {
      if (e.target.closest('button')) return;
      var t = e.touches[0];
      onDown(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      var t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchend', onUp);
  };

  /* ── Resize (custom handles on all four corners) ── */
  SomaGuide.prototype._enableResize = function () {
    var self = this;
    var panel = this._$('.sg-panel');
    if (!panel) return;
    /* [name, affectsLeft, affectsTop] */
    var corners = [['nw', 1, 1], ['ne', 0, 1], ['sw', 1, 0], ['se', 0, 0]];
    corners.forEach(function (c) {
      var name = c[0], affL = c[1], affT = c[2];
      var h = document.createElement('div');
      h.className = 'sg-resize-h sg-resize-' + name;
      self.el.appendChild(h);

      var active = false, sx, sy, sw, sh, sLeft, sTop;
      function down(cx, cy) {
        var r = self.el.getBoundingClientRect();
        /* anchor to left/top so all-corner math is consistent */
        self.el.style.left = r.left + 'px';
        self.el.style.top = r.top + 'px';
        self.el.style.right = 'auto';
        self.el.style.bottom = 'auto';
        sx = cx; sy = cy; sw = r.width; sh = r.height; sLeft = r.left; sTop = r.top;
        active = true;
        document.body.style.userSelect = 'none';
      }
      function move(cx, cy) {
        if (!active) return;
        var dx = cx - sx, dy = cy - sy;
        var minW = 280, minH = 300;
        var maxW = Math.min(window.innerWidth - 20, 760), maxH = window.innerHeight - 20;
        var w = affL ? sw - dx : sw + dx;
        var ht = affT ? sh - dy : sh + dy;
        w = Math.max(minW, Math.min(maxW, w));
        ht = Math.max(minH, Math.min(maxH, ht));
        panel.style.width = w + 'px';
        panel.style.height = ht + 'px';
        if (affL) self.el.style.left = (sLeft + (sw - w)) + 'px';
        if (affT) self.el.style.top = (sTop + (sh - ht)) + 'px';
      }
      function up() {
        if (!active) return;
        active = false;
        document.body.style.userSelect = '';
        self._lsSet('panel-w', parseInt(panel.style.width, 10) || '');
        self._lsSet('panel-h', parseInt(panel.style.height, 10) || '');
      }
      h.addEventListener('mousedown', function (e) { down(e.clientX, e.clientY); e.preventDefault(); e.stopPropagation(); });
      document.addEventListener('mousemove', function (e) { move(e.clientX, e.clientY); });
      document.addEventListener('mouseup', up);
      h.addEventListener('touchstart', function (e) { var t = e.touches[0]; down(t.clientX, t.clientY); }, { passive: true });
      document.addEventListener('touchmove', function (e) { if (active) { var t = e.touches[0]; move(t.clientX, t.clientY); } }, { passive: true });
      document.addEventListener('touchend', up);
    });
  };

  SomaGuide.prototype._applySavedSize = function () {
    var panel = this._$('.sg-panel');
    if (!panel) return;
    var w = this._lsGet('panel-w'), h = this._lsGet('panel-h');
    if (w) panel.style.width = w + 'px';
    if (h) panel.style.height = h + 'px';
  };

  /* ── Conversation recording (diagnostics) ──────────────────────────────────
   * Records each turn AND Bill's decision trace (matched action, extracted
   * params, chosen rung) so off-track behavior is diagnosable after the fact.
   * Kept in memory + a rolling localStorage transcript; optionally POSTed to
   * cfg.telemetry.logUrl for cross-session/user collection.
   * Inspect live:  somaGuide.dumpTranscript()  /  somaGuide.getTranscript({all:true}) */
  SomaGuide.prototype._log = function (event, data) {
    if (!this._session) return;
    var rec = {
      ts: new Date().toISOString(),
      sessionId: this._session.id,
      anonId: this._anonId,
      app: this.cfg.tenantId || this.cfg.persona.id || this.cfg.persona.name,
      page: (typeof location !== 'undefined') ? location.href : null,
      event: event,
      data: data || {}
    };
    this._session.turns.push(rec);
    try {
      var prev = JSON.parse(this._lsGet('transcript') || '[]');
      prev.push(rec);
      if (prev.length > 200) prev = prev.slice(-200);
      this._lsSet('transcript', JSON.stringify(prev));
    } catch (e) {}
    var t = this.cfg.telemetry;
    if (t && t.logUrl) {
      try {
        fetch(t.logUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec), keepalive: true }).catch(function () {});
      } catch (e) {}
    }
  };

  SomaGuide.prototype.getTranscript = function (opts) {
    if (opts && opts.all) { try { return JSON.parse(this._lsGet('transcript') || '[]'); } catch (e) { return []; } }
    return this._session ? this._session.turns.slice() : [];
  };
  SomaGuide.prototype.dumpTranscript = function (opts) {
    var t = this.getTranscript(opts);
    try {
      console.table(t.map(function (r) { return { ts: r.ts, event: r.event, summary: JSON.stringify(r.data).slice(0, 140) }; }));
    } catch (e) {}
    return JSON.stringify(t, null, 2);
  };
  SomaGuide.prototype.clearTranscript = function () {
    if (this._session) this._session.turns = [];
    this._lsSet('transcript', '[]');
  };

  /* ── Always-on observer ────────────────────────────────────────────────────
   * Records recent page activity so intake can say "is this about <last
   * action>?". Privacy: clicks store element labels/selectors, inputs store the
   * field identity, and field VALUES are captured ONLY for non-sensitive fields
   * (never password/email/cc/otp/etc.) and only when cfg.observeValues !== false. */
  SomaGuide.prototype._startObserver = function () {
    if (this.cfg.observe === false || typeof document === 'undefined') return;
    var self = this;
    var captureValues = this.cfg.observeValues !== false;

    function inWidget(el) { return !!(el && el.closest && el.closest('#soma-guide')); }
    function labelFor(el) {
      if (!el) return '';
      var t = el.closest ? (el.closest('button, a, [role="button"], [role="link"], input, select, textarea, label') || el) : el;
      var txt = (t.getAttribute && (t.getAttribute('aria-label') || t.getAttribute('title'))) ||
                (t.textContent || '').trim() || (t.getAttribute && (t.getAttribute('name') || t.getAttribute('id'))) ||
                (t.value || '') || t.tagName;
      return String(txt).replace(/\s+/g, ' ').trim().slice(0, 80);
    }
    function selFor(el) {
      if (!el || !el.tagName) return '';
      var s = el.tagName.toLowerCase();
      if (el.id) s += '#' + el.id;
      else if (el.name) s += '[name="' + el.name + '"]';
      return s;
    }
    function sensitive(el) {
      if (!el) return true;
      var type = (el.type || '').toLowerCase();
      if (type === 'password' || type === 'email' || type === 'hidden') return true;
      var hay = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.autocomplete || '')).toLowerCase();
      return /pass|otp|code|secret|token|card|cc-|cvv|cvc|ssn|social|account|routing|pin/.test(hay);
    }

    document.addEventListener('click', function (e) {
      if (inWidget(e.target)) return;
      self._recordActivity({ type: 'click', label: labelFor(e.target), selector: selFor(e.target.closest ? (e.target.closest('button,a,[role]') || e.target) : e.target) });
    }, true);

    document.addEventListener('focusin', function (e) {
      var el = e.target;
      if (inWidget(el) || !el.tagName || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      self._recordActivity({ type: 'focus', field: labelFor(el), selector: selFor(el) });
    }, true);

    document.addEventListener('change', function (e) {
      var el = e.target;
      if (inWidget(el) || !el.tagName || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      var ev = { type: 'input', field: labelFor(el), selector: selFor(el) };
      if (captureValues && !sensitive(el)) ev.value = String(el.value == null ? '' : el.value).slice(0, 120);
      else ev.value = '(redacted)';
      self._recordActivity(ev);
    }, true);

    window.addEventListener('error', function (e) {
      self._recordActivity({ type: 'error', message: String((e && e.message) || 'error').slice(0, 200) });
    });

    function nav() { self._recordActivity({ type: 'nav', url: location.href, title: (document.title || '').slice(0, 120) }); }
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      if (typeof orig === 'function') { history[m] = function () { var r = orig.apply(this, arguments); try { nav(); } catch (e) {} return r; }; }
    });
    window.addEventListener('popstate', nav);
    window.addEventListener('hashchange', nav);
    nav();
  };

  SomaGuide.prototype._recordActivity = function (ev) {
    ev.ts = Date.now();
    this._activity.push(ev);
    if (this._activity.length > 50) this._activity = this._activity.slice(-50);
  };

  /* Recent meaningful activity (most-recent first), excluding pure focus noise. */
  SomaGuide.prototype.getRecentActivity = function (n) {
    var meaningful = this._activity.filter(function (a) { return a.type !== 'focus'; });
    return meaningful.slice(-(n || 5)).reverse();
  };

  /* ── Identity (account-keyed SOMA profile, optional) ───────────────────────
   * Delivery-agnostic: works the same whether Bill is embedded via <script> or
   * served in an iframe. The per-site config supplies getProfile()/recordSeen();
   * the engine uses the profile for recognition (skip the first-run greeting for
   * known users, decay chips cross-device) and reports progress back. */
  SomaGuide.prototype._loadProfile = function () {
    var self = this;
    var idn = this.cfg.identity;
    if (!idn || typeof idn.getProfile !== 'function') return;
    var appId = idn.appId || this.cfg.persona.id || this.cfg.persona.name;
    try {
      Promise.resolve(idn.getProfile()).then(function (p) {
        if (!p) return;
        self._profile = p;
        /* Known user → treat as introduced (skip the first-run greeting). */
        if ((p.bill_familiarity && p.bill_familiarity > 0) || (p.apps_used && p.apps_used.length)) {
          self.introduced = true;
        }
        /* Cross-device chip decay: walkthroughs already seen on any device. */
        var seen = (p.guide_seen && p.guide_seen[appId]) || [];
        if (seen.length) {
          var used = (self._lsGet('used-suggest') || '').split(',').filter(Boolean);
          seen.forEach(function (s) { if (used.indexOf(s) === -1) used.push(s); });
          self._lsSet('used-suggest', used.join(','));
        }
        if (self.mode === 'text') self._renderSuggestions(false);
      }).catch(function () {});
    } catch (e) {}
  };

  SomaGuide.prototype._recordSeen = function (id) {
    var idn = this.cfg.identity;
    if (idn && typeof idn.recordSeen === 'function') {
      try { Promise.resolve(idn.recordSeen(id)).catch(function () {}); } catch (e) {}
    }
  };

  /* ── Host adapter (embedded / direct-DOM) ──────────────────────────────────
   * The single surface through which Bill touches the host page. An iframe
   * delivery would provide an alternative adapter with the SAME methods, backed
   * by postMessage to a host shim (which executes these on the host and renders
   * highlight/cursor host-side). Engine logic calls this._host.* and stays
   * delivery-agnostic. */
  SomaGuide.prototype._makeEmbeddedHost = function () {
    return {
      mode: 'embedded',
      find: function (sel) { return document.querySelector(sel); },
      exists: function (sel) { return !!document.querySelector(sel); },
      rect: function (sel) { var el = document.querySelector(sel); return el ? el.getBoundingClientRect() : null; },
      click: function (sel) { var el = document.querySelector(sel); if (el) el.click(); return !!el; },
      setValue: function (sel, val) {
        var el = document.querySelector(sel);
        if (!el) return false;
        el.value = (val == null ? '' : val);
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        return true;
      },
      scrollIntoView: function (sel) { var el = document.querySelector(sel); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
      highlight: function (sel) { var el = document.querySelector(sel); if (el) el.classList.add('sg-highlight'); },
      clearHighlight: function () { Array.prototype.forEach.call(document.querySelectorAll('.sg-highlight'), function (e) { e.classList.remove('sg-highlight'); }); }
    };
  };

  /* ── Host adapter (iframe / postMessage) ────────────────────────────────────
   * Used when cfg.delivery === 'iframe'. Bill's brain + UI run inside a
   * cross-origin <iframe>; a cross-origin iframe cannot touch the host DOM, so
   * every reach into the host is posted to the host shim (soma-guide-shim.js),
   * which executes it on the host DOM and renders highlight + demo cursor
   * host-side. Same method names as the embedded adapter, so engine logic is
   * unchanged.
   *
   * Sync methods (click/setValue/scrollIntoView/highlight/clearHighlight/demo)
   * are fire-and-forget — they post a command and return immediately. Methods
   * that need an answer (exists/rect) return a Promise resolved by the shim's
   * reply, correlated by a monotonically increasing request id. find() is not
   * meaningfully transferable across the origin boundary, so it returns null;
   * the engine's iframe-mode paths use selectors + exists/rect instead of raw
   * element handles. */
  SomaGuide.prototype._makeIframeHost = function () {
    var self = this;
    this._hostReqId = 0;
    this._hostPending = {};          /* id -> resolve fn */
    var target = (typeof window !== 'undefined' && window.parent) ? window.parent : null;
    var origin = this.cfg.hostOrigin || '*';

    /* Single listener for shim replies (results of exists/rect requests). */
    if (typeof window !== 'undefined' && !this._hostListenerBound) {
      this._hostListenerBound = true;
      window.addEventListener('message', function (ev) {
        var d = ev.data;
        if (!d || d.sg !== 'host-result' || d.id == null) return;
        var fn = self._hostPending[d.id];
        if (fn) { delete self._hostPending[d.id]; fn(d.result); }
      });
    }

    function post(cmd, args) {
      if (!target) return;
      try { target.postMessage({ sg: 'host-cmd', cmd: cmd, args: args || {} }, origin); }
      catch (e) { /* origin mismatch / detached parent */ }
    }
    function request(cmd, args) {
      return new Promise(function (resolve) {
        if (!target) { resolve(null); return; }
        var id = ++self._hostReqId;
        self._hostPending[id] = resolve;
        try { target.postMessage({ sg: 'host-cmd', cmd: cmd, args: args || {}, id: id }, origin); }
        catch (e) { delete self._hostPending[id]; resolve(null); }
        /* Safety timeout so a lost reply never wedges a Promise forever. */
        setTimeout(function () {
          if (self._hostPending[id]) { delete self._hostPending[id]; resolve(null); }
        }, 3000);
      });
    }

    return {
      mode: 'iframe',
      _post: post,                              /* engine uses this for demo-cursor commands */
      find: function () { return null; },        /* element handles can't cross the boundary */
      exists: function (sel) { return request('exists', { sel: sel }); },   /* Promise<bool> */
      rect: function (sel) { return request('rect', { sel: sel }); },       /* Promise<rect|null> */
      click: function (sel) { post('click', { sel: sel }); return true; },
      setValue: function (sel, val) { post('setValue', { sel: sel, val: (val == null ? '' : val) }); return true; },
      scrollIntoView: function (sel) { post('scrollIntoView', { sel: sel }); },
      highlight: function (sel) { post('highlight', { sel: sel }); },
      clearHighlight: function () { post('clearHighlight', {}); }
    };
  };

  /* ── Bind events ── */
  SomaGuide.prototype._bindEvents = function () {
    var self = this;

    this._$('.sg-fab').addEventListener('click', function () { self.open(); });
    this._$('.sg-btn-min').addEventListener('click', function () { self._minimize(); });
    this._$('.sg-btn-close').addEventListener('click', function () { self._minimize(); });
    this._$('.sg-btn-text').addEventListener('click', function () { self._chooseText(); });
    this._$('.sg-btn-voice').addEventListener('click', function () { self._chooseVoice(); });

    /* Explicit output-mode toggle (Text / Voice) shown in the shell. */
    var ioText = this._$('.sg-io-text');
    var ioVoice = this._$('.sg-io-voice');
    if (ioText)  ioText.addEventListener('click', function () { self._chooseText(); });
    if (ioVoice) ioVoice.addEventListener('click', function () { self._chooseVoice(); });

    /* Orb is the tap-to-start target in voice mode.
     * First tap → connect; second tap (while active) → reset to invitation state.
     * Connection starts here, NOT in _openVoice(), so entering voice mode is an
     * invitation and the user chooses when to start speaking. */
    var orbEl = this._$('.sg-orb');
    if (orbEl) {
      var orbAction = function () {
        if (self.mode !== 'voice') return;
        var orb = self._$('.sg-orb');
        if (orb && orb.classList.contains('sg-orb--active')) {
          /* Already connected/connecting — tap again to reset */
          orb.classList.remove('sg-orb--active');
          self._stopConversation();
          self._$('.sg-voice-status').textContent = 'Tap to speak';
          return;
        }
        /* Start voice connection */
        if (orb) orb.classList.add('sg-orb--active');
        self._$('.sg-voice-status').textContent = 'Connecting…';
        self._startConversation(false).then(function () {
          self._$('.sg-voice-status').textContent = 'Listening…';
        }).catch(function (e) {
          console.warn('[SomaGuide] voice error', e);
          if (orb) orb.classList.remove('sg-orb--active');
          var name = self.cfg.persona.name || 'I';
          self._$('.sg-voice-status').textContent = name + " can't connect — try text chat instead.";
        });
      };
      orbEl.addEventListener('click', orbAction);
      orbEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); orbAction(); }
      });
    }

    this._$('.sg-wt-menu').addEventListener('click', function () { self._wtGoToNeutral(); });
    this._$('.sg-wt-next').addEventListener('click', function () { self._wtNext(); });
    this._$('.sg-wt-exit').addEventListener('click', function () { self._wtExit(); });
    this._$('.sg-wt-playpause').addEventListener('click', function () { self._wtAutoPlayToggle(); });
    this._$('.sg-wt-resume').addEventListener('click', function () {
      if (self.pendingResume) {
        var si = self.pendingResume.subStepIndex != null ? self.pendingResume.subStepIndex : -1;
        self._wtStart(self.pendingResume.id, self.pendingResume.stepIndex, si);
      }
    });
    this._$('.sg-wt-restart').addEventListener('click', function () {
      if (self.pendingResume) self._wtStart(self.pendingResume.id, 0, -1);
    });
    this._$('.sg-wt-home').addEventListener('click', function () { self._wtGoToNeutral(); });
    this._$('.sg-btn-mute').addEventListener('click', function () { self._ttsMuteToggle(); });
    this._$('.sg-btn-replay').addEventListener('click', function () { self._ttsReplay(); });
    this._updateMuteBtn();
    if (!this.cfg.ttsProxyUrl) {
      var ttsBar = this._$('.sg-tts-bar');
      if (ttsBar) ttsBar.hidden = true;
    }

    var input = this._$('.sg-input');
    this._$('.sg-send').addEventListener('click', function () { self._sendText(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self._sendText(input.value); }
    });

    var webToggle = this._$('.sg-web-toggle');
    if (webToggle) {
      webToggle.addEventListener('click', function () {
        self._webSearchEnabled = !self._webSearchEnabled;
        webToggle.setAttribute('aria-pressed', String(self._webSearchEnabled));
        webToggle.classList.toggle('sg-web-toggle--on', self._webSearchEnabled);
        webToggle.title = self._webSearchEnabled ? 'Search the web (on)' : 'Search the web (off)';
      });
    }

    this._renderTopicList();
    this._initMic();
  };

  /* Set up Web Speech API mic button in the text chat input bar.
   * Always visible. On browsers without SpeechRecognition (Firefox etc.),
   * clicking the button falls through to the ElevenLabs voice mode instead. */
  SomaGuide.prototype._initMic = function () {
    var self = this;
    var micBtn = this._$('.sg-mic');
    if (!micBtn) return;

    var SR = (typeof window !== 'undefined') &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      /* No Web Speech API — route mic click to ElevenLabs voice mode */
      micBtn.title = 'Speak your question (opens voice mode)';
      micBtn.addEventListener('click', function () { self._openVoice(); });
      return;
    }

    var recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    var isListening = false;
    var finalText = '';

    recognition.onstart = function () {
      isListening = true;
      micBtn.classList.add('sg-mic--listening');
      micBtn.title = 'Listening… (click to stop)';
      var input = self._$('.sg-input');
      if (input) { input.placeholder = 'Listening…'; input.value = ''; }
      finalText = '';
    };
    recognition.onresult = function (e) {
      var interim = '';
      finalText = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) { finalText += e.results[i][0].transcript; }
        else { interim += e.results[i][0].transcript; }
      }
      var input = self._$('.sg-input');
      if (input) input.value = finalText + interim;
    };
    recognition.onend = function () {
      isListening = false;
      micBtn.classList.remove('sg-mic--listening');
      micBtn.title = 'Voice input';
      var input = self._$('.sg-input');
      if (input) input.placeholder = 'Ask me anything…';
      if (finalText.trim()) self._sendText(finalText.trim());
    };
    recognition.onerror = function (e) {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      console.warn('[SomaGuide] mic error', e.error);
    };

    micBtn.addEventListener('click', function () {
      if (isListening) { recognition.stop(); return; }
      try { recognition.start(); } catch (e) { console.warn('[SomaGuide] mic start error', e); }
    });
  };

  SomaGuide.prototype._renderTopicList = function () {
    var self = this;
    var list = this._$('.sg-topic-list');
    var wts  = this.cfg.walkthroughs || [];
    list.innerHTML = wts.map(function (w) {
      return '<button class="sg-topic-btn" data-wt="' + w.id + '">▶ ' + w.label + '</button>';
    }).join('');
    list.querySelectorAll('.sg-topic-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { self._wtStart(btn.getAttribute('data-wt'), 0, -1); });
    });
    /* Feedback affordance buttons — only when cfg.feedbackUrl is set */
    if (self.cfg.feedbackUrl) {
      [['feature', '💡 Submit a Feature Request'], ['bug', '🐛 Report a Bug']].forEach(function (pair) {
        var fb = document.createElement('button');
        fb.className = 'sg-topic-btn sg-topic-btn--feedback';
        fb.textContent = pair[1];
        fb.addEventListener('click', function () {
          self._openText();
          self._startFeedbackFlow(pair[0], '');
        });
        list.appendChild(fb);
      });
    }
  };

  /* ── Mode transitions ────────────────────────────────────────────────────── */

  SomaGuide.prototype._minimize = function () {
    /* Capture panel's bottom-right before hiding it so the chip lands there. */
    var panelRect = this.el.getBoundingClientRect();

    this._ttsStop();
    this._stopConversation();
    this._autoClear();
    this._demoStop();
    this._wtCloseDropdowns();
    if (this.mode === 'walkthrough' && this.wt) {
      if (this.cfg.cleanOnClose) {
        /* cleanOnClose: discard tour state so re-opening starts fresh */
        this.wt = null;
        this.pendingResume = null;
        this._ssDel('resume-id');
        this._ssDel('resume-step');
        this._ssDel('resume-substep');
        this._ssDel('state-ver');
        this._ssDel('state-cfg');
      } else {
        var si = this.wt.subStepIndex != null ? this.wt.subStepIndex : -1;
        this.pendingResume = { id: this.wt.id, stepIndex: this.wt.stepIndex, subStepIndex: si };
        this._ssSet('resume-id',      this.wt.id);
        this._ssSet('resume-step',    String(this.wt.stepIndex));
        this._ssSet('resume-substep', String(si));
        this._ssSet('state-ver',      SOMA_GUIDE_VERSION);
        this._ssSet('state-cfg',      this._computeConfigHash());
        this.wt = null;
      }
    }
    this._clearHighlight();
    this.mode = 'minimized';
    this.el.className = 'sg sg--min';
    this._$('.sg-panel').setAttribute('aria-hidden', 'true');

    /* Anchor chip's bottom-right corner to where the panel's bottom-right was. */
    if (typeof window !== 'undefined' && panelRect.right > 0) {
      var vw = window.innerWidth  || (document.documentElement && document.documentElement.clientWidth)  || 0;
      var vh = window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0;
      this.el.style.right  = Math.max(0, vw - panelRect.right)  + 'px';
      this.el.style.bottom = Math.max(0, vh - panelRect.bottom) + 'px';
      this.el.style.left   = 'auto';
      this.el.style.top    = 'auto';
    }
  };

  SomaGuide.prototype._openIdle = function (isFirst) {
    this._setMode('idle');
    var greeting = isFirst ? this.cfg.persona.greeting : this.cfg.persona.shortGreeting;
    this._$('.sg-greeting').textContent = greeting || '';

    /* Hide the topic-list (walkthrough chooser) while paused mid-tour so it
     * doesn't appear alongside the resume navigator as a second list. */
    var topicList = this._$('.sg-topic-list');
    if (topicList) topicList.hidden = !!this.pendingResume;

    var resumeBar = this._$('.sg-resume-bar');
    if (this.pendingResume) {
      this._renderResumeNav();
      resumeBar.hidden = false;
    } else {
      resumeBar.hidden = true;
    }

    if (isFirst) {
      this._lsSet('introduced', '1');
      this.introduced = true;
    }
  };

  SomaGuide.prototype._openText = function () {
    var self = this;
    /* Anchor to top-left before entering text mode so CSS resize extends right/down.
     * Default CSS positions the widget via bottom/right; resize would extend left/up
     * (counter-intuitive) until we convert to explicit left/top coordinates. */
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      var cs = window.getComputedStyle(self.el);
      if (cs.right !== 'auto' || cs.bottom !== 'auto') {
        var r = self.el.getBoundingClientRect();
        self.el.style.left   = r.left + 'px';
        self.el.style.top    = r.top  + 'px';
        self.el.style.right  = 'auto';
        self.el.style.bottom = 'auto';
      }
    }
    this._setMode('text');
    this._$('.sg-input').focus();
    if (this.cfg.voiceAgentId) {
      this._startConversation(true).catch(function (e) {
        console.warn('[SomaGuide] text session pre-start error', e);
      });
    }
  };

  SomaGuide.prototype._openVoice = function () {
    this._setMode('voice');
    /* Reset orb to invitation state — connection starts when orb is tapped */
    var orb = this._$('.sg-orb');
    if (orb) orb.classList.remove('sg-orb--active');
    this._$('.sg-voice-status').textContent = 'Tap to speak';
  };

  /* Open directly into the conversational ask UI (text mode) with a greeting
   * message but WITHOUT eagerly starting the ElevenLabs session. Used by the
   * askFirst flow (Ariadne) so the first page-load opens into "ask me anything"
   * rather than an auto-generated tour. */
  SomaGuide.prototype._openAsk = function () {
    this._setMode('text');
    var greeting = this.cfg.persona.askGreeting || this.cfg.persona.greeting || '';
    if (greeting) this._appendMessage('agent', greeting);
    this._$('.sg-input').focus();
  };

  /* Decluttered conversational shell (opt-in via cfg.conversationalShell).
   * One prompt instead of the idle menu; the orb and tour bar are mode-gated so
   * they never appear here. A few adaptive chips sit above the input and fade as
   * they're used; a "What can <name> do?" chip expands the full list on demand. */
  SomaGuide.prototype._openShell = function () {
    this._setMode('text');
    if (!this.introduced) {
      var greeting = this.cfg.persona.greeting || '';
      if (greeting) this._appendMessage('agent', greeting);
      this._lsSet('introduced', '1');
      this.introduced = true;
    }
    this._renderSuggestions(false);
    /* Voice affordance: announce "you can talk to me" on first encounter by
     * pulsing the Voice output toggle; it quiets once the user engages. */
    var vbtn = this._$('.sg-io-voice');
    if (vbtn && this.cfg.voiceAgentId && this._lsGet('voice-intro-done') !== '1') {
      vbtn.classList.add('sg-io-voice--pulse');
    }
    var input = this._$('.sg-input');
    if (input) input.focus();
  };

  SomaGuide.prototype._retireVoiceIntro = function () {
    var vbtn = this._$('.sg-io-voice');
    if (vbtn) vbtn.classList.remove('sg-io-voice--pulse');
    this._lsSet('voice-intro-done', '1');
  };

  /* Output-mode choices (Text vs Voice), persisted so returning users get their pick. */
  SomaGuide.prototype._chooseText = function () {
    this._lsSet('io-mode', 'text');
    if (this.cfg.conversationalShell) { this._openShell(); } else { this._openText(); }
  };
  SomaGuide.prototype._chooseVoice = function () {
    this._lsSet('io-mode', 'voice');
    this._retireVoiceIntro();
    this._openVoice();
  };

  SomaGuide.prototype._renderSuggestions = function (expandAll) {
    var self = this;
    var box = this._$('.sg-suggest');
    if (!box) return;

    var chips = (this.cfg.walkthroughs || []).map(function (w) {
      return { id: w.id, label: w.label, kind: 'wt' };
    });
    if (this.cfg.feedbackUrl) {
      chips.push({ id: 'fb-feature', label: 'Suggest a feature', kind: 'feature' });
      chips.push({ id: 'fb-bug',     label: 'Report a bug',      kind: 'bug' });
    }
    if (!chips.length) { box.hidden = true; return; }

    var usedRaw = this._lsGet('used-suggest') || '';
    var used = usedRaw ? usedRaw.split(',') : [];

    var shown;
    if (expandAll) {
      shown = chips;
    } else {
      var fresh = chips.filter(function (c) { return used.indexOf(c.id) === -1; });
      shown = (fresh.length ? fresh : chips).slice(0, 3);
    }

    box.innerHTML = '';
    shown.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'sg-suggest-chip';
      b.textContent = c.label;
      b.addEventListener('click', function () {
        if (used.indexOf(c.id) === -1) { used.push(c.id); self._lsSet('used-suggest', used.join(',')); }
        if (c.kind === 'wt') { self._wtStart(c.id, 0, -1); }
        else { self._openText(); self._startFeedbackFlow(c.kind, ''); }
      });
      box.appendChild(b);
    });
    if (!expandAll && chips.length > shown.length) {
      var more = document.createElement('button');
      more.className = 'sg-suggest-more';
      more.textContent = 'What can ' + (this.cfg.persona.name || 'I') + ' do?';
      more.addEventListener('click', function () { self._renderSuggestions(true); });
      box.appendChild(more);
    }
    box.hidden = false;
  };

  SomaGuide.prototype._setMode = function (mode) {
    this._ttsStop();
    this._stopConversation();
    this._autoClear();
    this._demoStop();
    this._wtCloseDropdowns();
    this.mode = mode;
    this.el.className = 'sg sg--' + mode;
    this._$('.sg-panel').removeAttribute('aria-hidden');

    this._$('.sg-idle-ui').hidden        = mode !== 'idle';
    this._$('.sg-voice-ui').hidden       = mode !== 'voice';
    this._$('.sg-text-ui').hidden        = mode !== 'text';
    this._$('.sg-wt-ui').hidden          = mode !== 'walkthrough';
    this._$('.sg-wt-bar').hidden         = mode !== 'walkthrough';
    this._$('.sg-resume-bar').hidden     = true;
    if (mode === 'text') this._applySavedSize();

    /* Output-mode toggle is present in text + voice; reflect the active choice. */
    var tog = this._$('.sg-io-toggle');
    if (tog) {
      tog.hidden = !(mode === 'text' || mode === 'voice');
      var t = this._$('.sg-io-text'), v = this._$('.sg-io-voice');
      if (t) { t.classList.toggle('sg-io-btn--active', mode === 'text'); t.setAttribute('aria-pressed', mode === 'text'); }
      if (v) { v.classList.toggle('sg-io-btn--active', mode === 'voice'); v.setAttribute('aria-pressed', mode === 'voice'); }
    }
  };

  /* ── Walkthrough — state helpers ─────────────────────────────────────────── */

  SomaGuide.prototype._wtById = function (id) {
    return (this.cfg.walkthroughs || []).filter(function (w) { return w.id === id; })[0] || null;
  };

  /* Resolve the current step object (parent or substep) from wt state. */
  SomaGuide.prototype._wtCurrentStep = function () {
    if (!this.wt) return null;
    var wt = this._wtById(this.wt.id);
    if (!wt) return null;
    var step = wt.steps[this.wt.stepIndex];
    if (!step) return null;
    var si = this.wt.subStepIndex;
    if (si != null && si >= 0 && step.substeps && step.substeps[si]) {
      return step.substeps[si];
    }
    return step;
  };

  /* Total flat step count: parent + all substeps, for every top-level step. */
  SomaGuide.prototype._wtFlatCount = function (wt) {
    return (wt.steps || []).reduce(function (n, s) {
      return n + 1 + (s.substeps ? s.substeps.length : 0);
    }, 0);
  };

  /* Flat 0-based index of current position in the full sequence. */
  SomaGuide.prototype._wtFlatIndex = function (wt, stepIndex, subStepIndex) {
    var n = 0;
    for (var i = 0; i < stepIndex; i++) {
      n += 1 + ((wt.steps[i].substeps || []).length);
    }
    if (subStepIndex != null && subStepIndex >= 0) n += 1 + subStepIndex;
    return n;
  };

  /* ── Walkthrough — lifecycle ─────────────────────────────────────────────── */

  SomaGuide.prototype._wtStart = function (id, stepIndex, subStepIndex) {
    var wt = this._wtById(id);
    if (!wt) return;
    this._recordSeen(id);
    this._clearHighlight();
    this.wt = {
      id: id,
      stepIndex: typeof stepIndex === 'number' ? stepIndex : 0,
      subStepIndex: (subStepIndex != null && typeof subStepIndex === 'number') ? subStepIndex : -1
    };
    this._autoPlay    = true;
    this._autoStopped = false;
    this.pendingResume = null;
    this._ssDel('resume-id');
    this._ssDel('resume-step');
    this._ssDel('resume-substep');
    this._ssDel('state-ver');
    this._ssDel('state-cfg');
    this._ttsPrefetchCache = null;
    this._ttsPrefetchUrl   = null;
    this._setMode('walkthrough');
    this._updateAutoPlayBtn();
    this._renderWtStep();
  };

  SomaGuide.prototype._renderWtStep = function () {
    if (!this.wt) return;
    var self = this;
    var wt   = this._wtById(this.wt.id);
    if (!wt) return;

    var step = this._wtCurrentStep();
    if (!step) return;

    /* ── 1. Page navigation (synchronous) ── */
    if (step.page && typeof location !== 'undefined') {
      /* Resolve to root-absolute and strip .html for comparison + navigation.
       * Stripping .html supports clean-URL servers (Netlify pretty URLs, etc.) where
       * /members/greg-foster serves the file but /members/greg-foster.html 404s.
       * Comparing full paths (not just pop()) prevents doubling on subpages. */
      var absPage   = step.page.charAt(0) === '/' ? step.page : ('/' + step.page);
      var navTarget = absPage.replace(/\.html$/, '');
      var curNorm   = location.pathname.replace(/\.html$/, '');
      if (curNorm !== navTarget) {
        this._ssSet('wt-id',      this.wt.id);
        this._ssSet('wt-step',    String(this.wt.stepIndex));
        this._ssSet('wt-substep', String(this.wt.subStepIndex != null ? this.wt.subStepIndex : -1));
        this._ssSet('state-ver',  SOMA_GUIDE_VERSION);
        this._ssSet('state-cfg',  this._computeConfigHash());
        this._navigate(navTarget);
        return;
      }
    }

    /* ── 2. Update narration / instruction text (synchronous — tests check here) ── */
    this._$('.sg-wt-narration').textContent  = step.narration || '';
    this._$('.sg-wt-instruction').textContent = step.instruction || '';

    var flatIdx   = this._wtFlatIndex(wt, this.wt.stepIndex, this.wt.subStepIndex);
    var flatTotal = this._wtFlatCount(wt);
    var isLast    = flatIdx >= flatTotal - 1;
    this._$('.sg-wt-prog').textContent = 'Step ' + (flatIdx + 1) + ' of ' + flatTotal;
    this._$('.sg-wt-next').textContent = isLast ? 'Finish ✓' : 'Next →';

    /* ── 2b. Navigator (synchronous) ── */
    this._renderWtNav();

    /* ── 3. Sync cleanup ── */
    this._autoClear();
    this._demoStop();
    this._clearHighlight();
    this._wtCloseDropdowns();

    /* ── 4. Satisfy preconditions then highlight + narrate ── */
    this._wtSatisfyPreconditions(step, function () {
      if (!self.wt) return; /* tour exited during async gate */

      /* Iframe delivery: we can't hold a host element handle, so we delegate
       * highlight + scroll to the shim by selector and stash the SELECTOR as the
       * pending cursor target. _demoMoveTo branches on string vs. element. */
      if (self._host && self._host.mode === 'iframe') {
        if (step.target) {
          self._host.scrollIntoView(step.target);
          self._host.highlight(step.target);
        }
        self._pendingCursorTarget = step.target || null;   /* selector string */
        self._pendingCursorDemo   = step.demo || null;
      } else {
        var targetEl = null;
        if (step.target) {
          targetEl = document.querySelector(step.target);
          if (targetEl) {
            /* Skip highlight when the element has no layout (hidden/invisible).
             * docHasLayout guard keeps jsdom-based tests unaffected (doc is 0-wide). */
            var docHasLayout = typeof document !== 'undefined' &&
              document.documentElement.getBoundingClientRect().width > 0;
            if (docHasLayout) {
              var tRect = targetEl.getBoundingClientRect();
              if (tRect.width === 0 && tRect.height === 0) {
                targetEl = null; /* not visible — narrate without highlight */
              }
            }
          }
          if (targetEl) {
            var dispVal = (typeof window !== 'undefined' && window.getComputedStyle)
              ? window.getComputedStyle(targetEl).display : '';
            if (dispVal === 'inline') targetEl.dataset.sgWasInline = '1';
            targetEl.classList.add('sg-highlight');
            if (typeof targetEl.scrollIntoView === 'function') {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
        }

        /* Store cursor target/action so the lead-in timer can be armed once audio
         * actually starts playing (in _ttsPlayBlob play().then() / no-TTS fallback).
         * This ensures the 1200ms lead-in is relative to audio start, not ready-gate. */
        self._pendingCursorTarget = targetEl || null;
        self._pendingCursorDemo   = step.demo || null;
      }

      /* Auto-advance: fires ONLY via audio ended event (or muted fallback timer) */
      var onEnded = null;
      if (self._autoPlay && !self._autoStopped) {
        onEnded = function () {
          if (self._autoPlay && !self._autoStopped && self.wt) {
            self._wtNext();
          }
        };
      }

      self._ttsSpeak(step.narration || '', onEnded);
    });
  };

  SomaGuide.prototype._wtNext = function () {
    if (!this.wt) return;
    var wt = this._wtById(this.wt.id);
    if (!wt) return;
    this._autoClear();
    this._demoStop();
    this._wtCloseDropdowns();

    var stepIdx  = this.wt.stepIndex;
    var subIdx   = this.wt.subStepIndex != null ? this.wt.subStepIndex : -1;
    var topStep  = wt.steps[stepIdx];
    var substeps = (topStep && topStep.substeps) ? topStep.substeps : [];

    if (subIdx === -1) {
      /* At parent: descend to first substep if any, else advance to next top-level */
      if (substeps.length > 0) {
        this.wt.subStepIndex = 0;
        this._renderWtStep();
      } else {
        this._wtAdvanceTopLevel(wt, stepIdx);
      }
    } else {
      /* At a substep: move to next substep or next top-level */
      if (subIdx + 1 < substeps.length) {
        this.wt.subStepIndex = subIdx + 1;
        this._renderWtStep();
      } else {
        this._wtAdvanceTopLevel(wt, stepIdx);
      }
    }
  };

  SomaGuide.prototype._wtAdvanceTopLevel = function (wt, stepIdx) {
    if (stepIdx >= wt.steps.length - 1) {
      this._wtFinish();
    } else {
      this.wt.stepIndex    = stepIdx + 1;
      this.wt.subStepIndex = -1;
      this._renderWtStep();
    }
  };

  SomaGuide.prototype._wtFinish = function () {
    this._clearHighlight();
    this._autoClear();
    this._demoStop();
    this._wtCloseDropdowns();
    this._ssDel('wt-id');
    this._ssDel('wt-step');
    this._ssDel('wt-substep');
    this._ssDel('resume-id');
    this._ssDel('resume-step');
    this._ssDel('resume-substep');
    this._ssDel('state-ver');
    this._ssDel('state-cfg');
    var done = this.cfg.persona.walkthroughDone || 'All done! Ask me anything.';
    this.wt = null;
    this.pendingResume = null;
    this._openIdle(false);
    this._$('.sg-greeting').textContent = done;
  };

  SomaGuide.prototype._wtExit = function () {
    this._autoClear();
    this._demoStop();
    this._wtCloseDropdowns();
    if (this.wt) {
      var si = this.wt.subStepIndex != null ? this.wt.subStepIndex : -1;
      this.pendingResume = { id: this.wt.id, stepIndex: this.wt.stepIndex, subStepIndex: si };
      this._ssSet('resume-id',      this.wt.id);
      this._ssSet('resume-step',    String(this.wt.stepIndex));
      this._ssSet('resume-substep', String(si));
      this._ssSet('state-ver',      SOMA_GUIDE_VERSION);
      this._ssSet('state-cfg',      this._computeConfigHash());
    }
    this._clearHighlight();
    this.wt = null;
    this._openIdle(false);
  };

  /* ── Precondition satisfaction ──────────────────────────────────────────── */

  /* Open a dropdown container generically via CSS class (not a real click).
   * `selector` should match the dropdown's wrapper element. */
  SomaGuide.prototype._wtOpenDropdown = function (selector) {
    if (!selector || typeof document === 'undefined') return;
    var container = document.querySelector(selector);
    if (!container) return;
    container.classList.add('sg-demo-open');
    this._openDropdownContainer = container;
    var toggle = container.querySelector('[aria-expanded]');
    if (!toggle && container.matches && container.matches('[aria-expanded]')) toggle = container;
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'true');
      this._openDropdownToggle = toggle;
    }
  };

  /* Close any dropdown the engine opened, restoring aria state. */
  SomaGuide.prototype._wtCloseDropdowns = function () {
    if (this._openDropdownContainer) {
      this._openDropdownContainer.classList.remove('sg-demo-open');
      this._openDropdownContainer = null;
    }
    if (this._openDropdownToggle) {
      this._openDropdownToggle.setAttribute('aria-expanded', 'false');
      this._openDropdownToggle = null;
    }
  };

  /* Poll until `selector` resolves to a visible element (or timeout fires). */
  SomaGuide.prototype._wtReadyGate = function (selector, timeoutMs, onFound, onTimeout) {
    var start = Date.now();
    function check() {
      var el = typeof document !== 'undefined' ? document.querySelector(selector) : null;
      if (el) {
        var cs = (typeof window !== 'undefined' && window.getComputedStyle)
          ? window.getComputedStyle(el) : null;
        var vis = !cs || (cs.display !== 'none' && cs.visibility !== 'hidden');
        if (vis) { onFound(); return; }
      }
      if (Date.now() - start >= timeoutMs) { onTimeout(); return; }
      setTimeout(check, READY_GATE_TICK);
    }
    check();
  };

  /* Satisfy dropdown-open and target-visible preconditions, then call onReady.
   * Page navigation is handled upstream in _renderWtStep (synchronous path). */
  SomaGuide.prototype._wtSatisfyPreconditions = function (step, onReady) {
    /* Iframe delivery: the host shim opens dropdowns + owns the host DOM, so we
     * dispatch the dropdown command and let the shim's exists() gate the target.
     * We give the shim a brief moment to apply the dropdown, then proceed — the
     * shim's highlight/scroll/cursor are no-ops when a selector is absent. */
    if (this._host && this._host.mode === 'iframe') {
      if (step.requires && step.requires.dropdown && this._host._post) {
        this._host._post('openDropdown', { sel: step.requires.dropdown });
      }
      if (!step.target) { onReady(); return; }
      var self = this, start = Date.now();
      (function poll() {
        Promise.resolve(self._host.exists(step.target)).then(function (ok) {
          if (!self.wt) return;                       /* tour exited during gate */
          if (ok) { onReady(); return; }
          if (Date.now() - start >= READY_GATE_MS) {
            console.warn('[SomaGuide] (iframe) target not found within timeout: ' + step.target + ' — proceeding');
            onReady();
            return;
          }
          setTimeout(poll, READY_GATE_TICK);
        });
      })();
      return;
    }
    if (step.requires && step.requires.dropdown) {
      this._wtOpenDropdown(step.requires.dropdown);
    }
    if (step.target && typeof document !== 'undefined') {
      this._wtReadyGate(step.target, READY_GATE_MS, onReady, function () {
        console.warn('[SomaGuide] target not found within timeout: ' + step.target + ' — proceeding');
        onReady();
      });
    } else {
      onReady();
    }
  };

  /* ── Auto-advance helpers ─────────────────────────────────────────────────── */

  SomaGuide.prototype._autoClear = function () {
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
  };

  SomaGuide.prototype._wtAutoPlayToggle = function () {
    var self = this;
    this._autoStopped = !this._autoStopped;
    this._updateAutoPlayBtn();
    if (this._autoStopped) {
      this._autoClear();
      this._ttsStop();
    } else {
      if (self.wt) self._renderWtStep();
    }
  };

  SomaGuide.prototype._updateAutoPlayBtn = function () {
    var btn = this._$('.sg-wt-playpause');
    if (!btn) return;
    if (this._autoStopped) {
      btn.textContent = '▶';
      btn.setAttribute('title', 'Resume auto-play');
      btn.setAttribute('aria-label', 'Resume auto-play');
    } else {
      btn.textContent = '⏸';
      btn.setAttribute('title', 'Pause auto-play');
      btn.setAttribute('aria-label', 'Pause auto-play');
    }
  };

  /* ── Demo cursor ──────────────────────────────────────────────────────────── */

  SomaGuide.prototype._demoBuild = function () {
    if (this._demoCursor || typeof document === 'undefined') return;
    var el = document.createElement('div');
    el.className = 'sg-demo-cursor';
    el.innerHTML = '<svg width="20" height="24" viewBox="0 0 20 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 2L2 20L7 15L11 23L14 22L10 14L18 14Z" fill="#c9a84c" stroke="#060e18" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(el);
    this._demoCursor = el;
  };

  SomaGuide.prototype._demoStop = function () {
    this._pendingCursorTarget = null;
    this._pendingCursorDemo   = null;
    if (this._host && this._host.mode === 'iframe' && this._host._post) {
      this._host._post('demoStop', {});
    }
    if (this._cursorLeadTimer) {
      clearTimeout(this._cursorLeadTimer);
      this._cursorLeadTimer = null;
    }
    if (this._demoCursorTimer) {
      clearTimeout(this._demoCursorTimer);
      this._demoCursorTimer = null;
    }
    if (this._demoCursor) {
      this._demoCursor.classList.remove('sg-demo-cursor--visible');
    }
  };

  SomaGuide.prototype._demoMoveTo = function (target, action) {
    var self = this;
    if (!target) return;
    /* Iframe delivery: target is a selector string; the shim owns the cursor and
     * renders it host-side (over the host DOM, where the target actually lives). */
    if (self._host && self._host.mode === 'iframe') {
      if (self._host._post) self._host._post('demoCursor', { sel: target, action: action || null });
      return;
    }
    if (typeof document === 'undefined') return;
    this._demoBuild();
    var cursor = this._demoCursor;
    if (!cursor) return;

    var rect = target.getBoundingClientRect();
    var destX = Math.round(rect.left + rect.width * 0.5 - 10);
    var destY = Math.round(rect.top - 8);

    if (!cursor.classList.contains('sg-demo-cursor--visible')) {
      cursor.style.transition = 'none';
      var wx = (typeof window !== 'undefined' ? window.innerWidth  : 800) - 80;
      var wy = (typeof window !== 'undefined' ? window.innerHeight : 600) - 120;
      cursor.style.left = wx + 'px';
      cursor.style.top  = wy + 'px';
      cursor.classList.add('sg-demo-cursor--visible');
      cursor.getBoundingClientRect(); /* force reflow */
      cursor.style.transition = '';
    }

    cursor.style.left = destX + 'px';
    cursor.style.top  = destY + 'px';

    if (this._demoCursorTimer) clearTimeout(this._demoCursorTimer);
    this._demoCursorTimer = setTimeout(function () {
      self._demoCursorTimer = null;
      self._demoDoAction(target, action);
    }, 800);
  };

  SomaGuide.prototype._demoDoAction = function (target, action) {
    if (action === 'openDropdown') {
      /* Dropdown already open via precondition; ripple shows where to click */
      this._demoRipple();
    } else if (action === 'click') {
      this._demoRipple();
    }
    /* 'hover' — cursor presence at target is the visual */
  };

  SomaGuide.prototype._demoRipple = function () {
    if (!this._demoCursor || typeof document === 'undefined') return;
    var rect = this._demoCursor.getBoundingClientRect();
    var ripple = document.createElement('div');
    ripple.className = 'sg-demo-ripple';
    ripple.style.left = (rect.left - 6) + 'px';
    ripple.style.top  = (rect.top  - 6) + 'px';
    document.body.appendChild(ripple);
    setTimeout(function () {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 700);
  };

  /* ── Resume / navigator ──────────────────────────────────────────────────── */

  /* Render the structured navigator tree in the resume bar (paused state).
   * Uses the same sg-wt-nav-step / sg-wt-nav-group / sg-wt-nav-substeps structure
   * as _renderWtNav so the paused view is identical to the active-walkthrough navigator. */
  SomaGuide.prototype._renderResumeNav = function () {
    var self = this;
    var bar  = this._$('.sg-resume-steps');
    var wt   = this._wtById(this.pendingResume && this.pendingResume.id);
    if (!wt) { bar.innerHTML = ''; return; }

    var curStepIdx = this.pendingResume.stepIndex;
    var curSubIdx  = this.pendingResume.subStepIndex != null ? this.pendingResume.subStepIndex : -1;
    var html = [];
    var flatN = 0;

    wt.steps.forEach(function (s, i) {
      var isParentCurrent = (i === curStepIdx && curSubIdx === -1);
      var label = s.label || (s.narration ? s.narration.slice(0, 40) + '…' : ('Step ' + (i + 1)));
      var hasSubsteps = s.substeps && s.substeps.length > 0;

      if (hasSubsteps) html.push('<div class="sg-wt-nav-group">');
      html.push(
        '<button class="sg-wt-nav-step' + (isParentCurrent ? ' sg-wt-nav-step--current' : '') +
        '" data-si="' + i + '" data-sub="-1">' + (flatN + 1) + '. ' + label + '</button>'
      );
      flatN++;
      if (hasSubsteps) {
        html.push('<div class="sg-wt-nav-substeps">');
        s.substeps.forEach(function (sub, j) {
          var isSubCurrent = (i === curStepIdx && j === curSubIdx);
          var subLabel = sub.label || (sub.narration ? sub.narration.slice(0, 35) + '…' : ('Sub-step ' + (j + 1)));
          html.push(
            '<button class="sg-wt-nav-step sg-wt-nav-step--sub' + (isSubCurrent ? ' sg-wt-nav-step--current' : '') +
            '" data-si="' + i + '" data-sub="' + j + '">' + (flatN + 1) + '. ' + subLabel + '</button>'
          );
          flatN++;
        });
        html.push('</div></div>');
      }
    });

    bar.innerHTML = html.join('');
    bar.querySelectorAll('.sg-wt-nav-step').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var si  = parseInt(btn.getAttribute('data-si'),  10);
        var sub = parseInt(btn.getAttribute('data-sub'), 10);
        self._wtStart(self.pendingResume.id, si, sub);
      });
    });
  };

  /* Return to the neutral idle state, discarding any in-progress tour resume. */
  SomaGuide.prototype._wtGoToNeutral = function () {
    this._autoClear();
    this._ttsStop();
    this._demoStop();
    this._clearHighlight();
    this._wtCloseDropdowns();
    this.wt = null;
    this.pendingResume = null;
    this._ssDel('resume-id');
    this._ssDel('resume-step');
    this._ssDel('resume-substep');
    this._ssDel('state-ver');
    this._ssDel('state-cfg');
    this._openIdle(false);
  };

  /* Render the step-tree navigator inside the active walkthrough panel.
   * Highlights the current step; clicking any step jumps there (satisfying its preconditions).
   * Steps with substeps are wrapped in sg-wt-nav-group; substeps go in sg-wt-nav-substeps
   * for visual nesting. All buttons (including the parent/first step) are clickable. */
  SomaGuide.prototype._renderWtNav = function () {
    var self   = this;
    var navDiv = this._$('.sg-wt-nav');
    if (!navDiv || !this.wt) { if (navDiv) navDiv.innerHTML = ''; return; }
    var wt = this._wtById(this.wt.id);
    if (!wt) { navDiv.innerHTML = ''; return; }

    var curStepIdx = this.wt.stepIndex;
    var curSubIdx  = this.wt.subStepIndex != null ? this.wt.subStepIndex : -1;
    var html = [];
    var flatN = 0;

    wt.steps.forEach(function (s, i) {
      var isParentCurrent = (i === curStepIdx && curSubIdx === -1);
      var label = s.label || (s.narration ? s.narration.slice(0, 40) + '…' : ('Step ' + (i + 1)));
      var hasSubsteps = s.substeps && s.substeps.length > 0;

      if (hasSubsteps) html.push('<div class="sg-wt-nav-group">');
      html.push(
        '<button class="sg-wt-nav-step' + (isParentCurrent ? ' sg-wt-nav-step--current' : '') +
        '" data-si="' + i + '" data-sub="-1">' + (flatN + 1) + '. ' + label + '</button>'
      );
      flatN++;
      if (hasSubsteps) {
        html.push('<div class="sg-wt-nav-substeps">');
        s.substeps.forEach(function (sub, j) {
          var isSubCurrent = (i === curStepIdx && j === curSubIdx);
          var subLabel = sub.label || (sub.narration ? sub.narration.slice(0, 35) + '…' : ('Sub-step ' + (j + 1)));
          html.push(
            '<button class="sg-wt-nav-step sg-wt-nav-step--sub' + (isSubCurrent ? ' sg-wt-nav-step--current' : '') +
            '" data-si="' + i + '" data-sub="' + j + '">' + (flatN + 1) + '. ' + subLabel + '</button>'
          );
          flatN++;
        });
        html.push('</div></div>');
      }
    });

    navDiv.innerHTML = html.join('');
    navDiv.querySelectorAll('.sg-wt-nav-step').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!self.wt) return;
        var si  = parseInt(btn.getAttribute('data-si'),  10);
        var sub = parseInt(btn.getAttribute('data-sub'), 10);
        self._wtStart(self.wt.id, si, sub);
      });
    });
  };

  SomaGuide.prototype._clearHighlight = function () {
    if (this._host && this._host.mode === 'iframe') {
      this._host.clearHighlight();
      return;
    }
    document.querySelectorAll('.sg-highlight').forEach(function (el) {
      el.classList.remove('sg-highlight');
      if (el.dataset.sgWasInline) delete el.dataset.sgWasInline;
    });
  };

  /* ── ElevenLabs voice / text ──────────────────────────────────────────────── */

  SomaGuide.prototype._loadConvClass = function () {
    var self = this;
    if (self.ConvClass) return Promise.resolve(self.ConvClass);
    var esmUrl = self.cfg.voiceAgentEsmUrl || ELEVENLABS_ESM;
    var imp = (typeof global.__importStub === 'function')
      ? global.__importStub
      : function (u) { return import(u); };
    return imp(esmUrl).then(function (mod) {
      self.ConvClass = mod.Conversation;
      return self.ConvClass;
    });
  };

  SomaGuide.prototype._startConversation = function (textOnly) {
    var self = this;
    var agentId = this.cfg.voiceAgentId;
    if (!agentId) return Promise.reject(new Error('No voiceAgentId configured'));

    self._convConnected = false;
    self._convBuffer = null;

    return this._loadConvClass().then(function (Conversation) {
      return Conversation.startSession({
        agentId: agentId,
        textOnly: textOnly === true ? true : undefined,
        onConnect: function () {
          self._convConnected = true;
          if (self._convBuffer) {
            var buffered = self._convBuffer;
            self._convBuffer = null;
            try {
              if (self.conversation && typeof self.conversation.sendUserMessage === 'function') {
                self.conversation.sendUserMessage(buffered);
              }
            } catch (e) { console.warn('[SomaGuide] buffered send error', e); }
          }
        },
        onMessage: function (data) {
          if (data && data.source === 'ai') self._onAgentMessage(data.message || data.text || '');
        },
        onError: function (msg) { console.warn('[SomaGuide]', msg); },
        onModeChange: function (data) {
          if (self.mode !== 'voice') return;
          var speaking = data && data.mode === 'speaking';
          var orb = self._$('.sg-orb');
          if (orb) orb.classList.toggle('sg-orb--speaking', speaking);
          var status = self._$('.sg-voice-status');
          if (status) status.textContent = speaking ? 'Speaking…' : 'Listening…';
        },
        onDisconnect: function () {
          if (self.mode === 'voice') {
            var orb = self._$('.sg-orb');
            if (orb) orb.classList.remove('sg-orb--active');
            var status = self._$('.sg-voice-status');
            if (status) status.textContent = 'Tap to speak';
          }
        }
      });
    }).then(function (conv) {
      self.conversation = conv;
      return conv;
    });
  };

  SomaGuide.prototype._stopConversation = function () {
    this._convConnected = false;
    this._convBuffer = null;
    if (this.conversation) {
      try { this.conversation.endSession(); } catch (e) {}
      this.conversation = null;
    }
  };

  SomaGuide.prototype._onAgentMessage = function (text) {
    if (this.mode === 'text') {
      this._appendMessage('agent', text);
    } else if (this.mode === 'voice') {
      var t = this._$('.sg-voice-transcript');
      if (t) t.textContent = text;
    }
  };

  SomaGuide.prototype._sendText = function (text) {
    if (typeof text !== 'string') return;
    text = text.trim();
    if (!text) return;

    var input = this._$('.sg-input');
    if (input) input.value = '';

    this._appendMessage('user', text);

    /* ── Tell → Show ladder ──────────────────────────────────────
     * A how-to question that matches a walkthrough gets an OFFER to show
     * (Tell, then "want me to show you?"). An explicit "show me / walk me
     * through" launches the demo directly. Factual questions fall through
     * to the answer path below. */
    var lower = text.toLowerCase();
    var wt = this._matchWalkthrough(text);
    var action = this._matchAction(text);
    var explicitShow = /\b(show me|walk me|demonstrate|give me a demo|guide me)\b/.test(lower);
    var explicitDo = /\b(do it|do that|go ahead|for me|just do it|please add|can you add)\b/.test(lower);
    var imperative = /^\s*(add|create|new|link|assign|delete|remove|wipe|reset|update|set|change)\b/i.test(text);
    var classified = this._classifyQuestion(text);

    /* Decision trace — records what Bill matched and decided, so off-track
     * behavior ("add Purvis to membership" → wrong action) is diagnosable. */
    this._log('decision', {
      text: text,
      classified: classified,
      matchedWalkthrough: wt ? wt.id : null,
      matchedAction: action ? action.id : null,
      extractedParams: action ? this._extractParams(action, text) : null,
      imperative: imperative, explicitDo: explicitDo, explicitShow: explicitShow
    });

    if (wt || action) {
      var howto = explicitShow || classified === 'howto';
      /* A direct command ("add Sam Jones as Treasurer") goes straight to Do. */
      if (action && (imperative || explicitDo)) {
        this._log('rung', { rung: 'do', action: action.id });
        this._startDoFlow(action, text); return;
      }
      /* A how-to offers the rungs. */
      if (howto) {
        if (explicitShow && wt) { this._log('rung', { rung: 'show', walkthrough: wt.id }); this._wtStart(wt.id, 0, -1); return; }
        this._log('rung', { rung: 'offer', walkthrough: wt ? wt.id : null, action: action ? action.id : null });
        this._appendOffer(wt, action, text);
        return;
      }
    }
    this._log('rung', { rung: 'tell' });

    /* ── Scope guard: deflect off-domain questions immediately ─── */
    if (this.cfg.scopeGuard && this._checkScopeGuard(text)) {
      var deflect = this.cfg.scopeGuard.deflect || "That's outside what I can help with here.";
      this._appendMessage('agent', deflect);
      return;
    }

    /* ── Bug / change intake ─────────────────────────────────────
     * A reported bug or change request hands off to the intake specialist
     * (context-rich, observer-aware). Falls back to the plain feedback form
     * when intake is disabled. */
    if (this.cfg.feedbackUrl) {
      var fbType = this._classifyFeedback(text);
      if (fbType) {
        if (this.cfg.intake !== false) { this._startIntake(fbType, text); }
        else { this._startFeedbackFlow(fbType, text); }
        return;
      }
    }

    /* Route all questions to inference when configured — ElevenLabs text sessions
     * are unreliable (async ESM load, CORS) and silently fail, leaving users with
     * no response. Inference is the reliable answer path for text mode. */
    if (this.cfg.inferenceUrl) {
      this._askInference(text);
      return;
    }

    var self = this;
    var send = function () {
      if (self.conversation) {
        if (self._convConnected) {
          return Promise.resolve(self.conversation.sendUserMessage(text));
        }
        self._convBuffer = text;
        return Promise.resolve();
      }
      return self._startConversation(true).then(function (conv) {
        if (self._convConnected) {
          return conv.sendUserMessage(text);
        }
        self._convBuffer = text;
      });
    };

    send().catch(function (e) {
      console.warn('[SomaGuide] send error', e);
      var name = self.cfg.persona.name || 'I';
      self._appendMessage('agent', name + " can't reach the server right now — please try again.");
    });
  };

  SomaGuide.prototype._matchWalkthrough = function (text) {
    var lower = text.toLowerCase();
    var wts = this.cfg.walkthroughs || [];

    /* 1) explicit keyword hit (config-defined, highest confidence) */
    var byKw = wts.filter(function (wt) {
      return (wt.keywords || []).some(function (kw) { return lower.indexOf(kw) !== -1; });
    })[0];
    if (byKw) return byKw;

    /* 2) significant-token overlap with the walkthrough label */
    var STOP = { how:1, do:1, does:1, i:1, to:1, a:1, an:1, the:1, me:1, can:1, could:1,
      you:1, my:1, of:1, on:1, for:1, with:1, in:1, is:1, are:1, what:1, where:1, site:1 };
    var words = lower.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    var best = null, bestScore = 0;
    wts.forEach(function (wt) {
      var tokens = (wt.label || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/).filter(function (t) { return t && !STOP[t]; });
      var score = tokens.filter(function (t) { return words.indexOf(t) !== -1; }).length;
      if (score > bestScore) { bestScore = score; best = wt; }
    });
    return bestScore >= 1 ? best : null;
  };

  /* Match a typed request to a registered action: explicit keywords first, then
   * significant-token overlap with the action label (so "add Sam Jones as
   * Treasurer" matches the "add a member" action via the verb). */
  SomaGuide.prototype._isAdmin = function () {
    try { return !!(this.cfg.isAdmin && this.cfg.isAdmin()); } catch (e) { return false; }
  };

  SomaGuide.prototype._matchAction = function (text) {
    var self = this;
    var lower = text.toLowerCase();
    /* Admin-only actions (requiresAdmin) are invisible to non-admins — they never
     * match, so members can't trigger them even by phrasing. */
    var actions = (this.cfg.actions || []).filter(function (a) {
      return !a.requiresAdmin || self._isAdmin();
    });
    var byKw = actions.filter(function (a) {
      return (a.keywords || []).some(function (kw) { return lower.indexOf(kw) !== -1; });
    })[0];
    if (byKw) return byKw;

    var STOP = { a:1, an:1, the:1, to:1, of:1, for:1, with:1, in:1, on:1, my:1, me:1 };
    var words = lower.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    function wb(s) { return new RegExp('\\b' + s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(lower); }
    var best = null, bestScore = 0;
    actions.forEach(function (a) {
      var tokens = (a.label || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/).filter(function (t) { return t && !STOP[t]; });
      var score = tokens.filter(function (t) { return words.indexOf(t) !== -1; }).length;
      /* Strong signal: the sentence names one of THIS action's option values
       * (e.g. "membership" → the link action's room), which disambiguates
       * "add X to <group>" away from a plain "add a member". */
      (a.params || []).forEach(function (p) {
        (p.options || []).forEach(function (o) {
          o.toLowerCase().split(/\s+/).forEach(function (w) { if (w.length > 2 && wb(w)) score += 2; });
        });
      });
      if (score > bestScore) { bestScore = score; best = a; }
    });
    return bestScore >= 1 ? best : null;
  };

  /* Tell → Show → Do: offer the rungs that apply rather than acting unbidden.
   * An answer ends with "want me to show you / do it?" — the user climbs as far
   * as they need. */
  SomaGuide.prototype._appendOffer = function (wt, action, originalText) {
    var self = this;
    var msgs = this._$('.sg-messages');
    if (!msgs) return;
    var label = ((action && action.label) || (wt && wt.label) || 'this').replace(/^how to /i, '');
    this._appendMessage('agent', 'I can help you ' + label + ' — want me to walk you through it, or just do it for you?');

    var row = document.createElement('div');
    row.className = 'sg-msg sg-msg--action sg-offer';

    if (wt) {
      var showBtn = document.createElement('button');
      showBtn.className = 'sg-offer-show';
      showBtn.textContent = '▶ Show me';
      showBtn.addEventListener('click', function () {
        if (row.parentNode) row.parentNode.removeChild(row);
        self._wtStart(wt.id, 0, -1);
      });
      row.appendChild(showBtn);
    }
    if (action) {
      var doBtn = document.createElement('button');
      doBtn.className = 'sg-offer-do';
      doBtn.textContent = '✨ Do it for me';
      doBtn.addEventListener('click', function () {
        if (row.parentNode) row.parentNode.removeChild(row);
        self._startDoFlow(action, originalText);
      });
      row.appendChild(doBtn);
    }
    var tellBtn = document.createElement('button');
    tellBtn.className = 'sg-offer-tell';
    tellBtn.textContent = 'Just tell me';
    tellBtn.addEventListener('click', function () {
      if (row.parentNode) row.parentNode.removeChild(row);
      if (self.cfg.inferenceUrl) { self._askInference(originalText); }
      else { self._appendMessage('agent', "It's under " + label + "."); }
    });
    row.appendChild(tellBtn);
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  };

  /* Extract action params from the user's sentence (intent → structured args).
   * Select params match against their option list (reliable); the first free-text
   * param is pulled from "named X" / "add X (as|to)" patterns. */
  SomaGuide.prototype._extractParams = function (action, text) {
    var lower = ' ' + (text || '').toLowerCase() + ' ';
    var out = {};
    var textParamUsed = false;
    function wb(s) { return new RegExp('\\b' + s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(lower); }
    (action.params || []).forEach(function (p) {
      if (p.type === 'select' && p.options) {
        /* whole-word match first ("membership" must NOT match the "Member" role);
         * then token overlap so "Purvis" resolves to the "Purvis Short" option. */
        var hit = p.options.filter(function (o) { return wb(o); })[0];
        if (!hit) {
          hit = p.options.filter(function (o) {
            return o.toLowerCase().split(/\s+/).some(function (w) { return w.length > 2 && wb(w); });
          })[0];
        }
        if (hit) out[p.name] = hit;
      } else if (!textParamUsed) {
        textParamUsed = true;
        var v = null, m;
        if ((m = text.match(/\bnamed\s+(.+?)(?:\s+as\b|\s+to\b|[.,]|$)/i))) v = m[1];
        else if ((m = text.match(/\badd\s+(?:a\s+member\s+)?(.+?)(?:\s+as\b|\s+to\b|[.,]|$)/i))) v = m[1];
        if (v) {
          v = v.trim();
          if (v && !/^(a|an|the|member|new member|user)$/i.test(v)) {
            out[p.name] = v.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
          }
        }
      }
    });
    return out;
  };

  /* Single gate: execute (reversible) or route to approval (consequential). */
  SomaGuide.prototype._commitDo = function (action, params) {
    this._log(action.risk === 'high' ? 'action_routed_for_approval' : 'action_run', { action: action.id, params: params });
    this._recordSeen(action.id);
    if (action.risk === 'high') {
      if (this.cfg.feedbackUrl) {
        this._startFeedbackFlow('feature', this._fill(action.requestText || (action.label + ': ' + JSON.stringify(params)), params));
      } else {
        this._appendMessage('agent', 'That one needs sign-off — I’ve routed it for approval rather than doing it directly.');
      }
      return;
    }
    this._runAction(action, params);
  };

  /* Do: pull params from the sentence. If we have them all, confirm and go;
   * otherwise show a form pre-filled with whatever we extracted. */
  SomaGuide.prototype._startDoFlow = function (action, originalText) {
    var extracted = this._extractParams(action, originalText || '');
    var defs = action.params || [];
    var allFilled = defs.length > 0 && defs.every(function (p) { return extracted[p.name]; });
    if (allFilled || (defs.length === 0 && action.risk !== 'high')) {
      this._appendConfirmDo(action, extracted);
    } else {
      this._renderDoForm(action, extracted);
    }
  };

  SomaGuide.prototype._renderDoForm = function (action, prefill) {
    var self = this;
    var msgs = this._$('.sg-messages');
    if (!msgs) return;
    prefill = prefill || {};

    var wrap = document.createElement('div');
    wrap.className = 'sg-msg sg-msg--action sg-do-form';
    var title = document.createElement('div');
    title.className = 'sg-feedback-form-title';
    title.textContent = '✨ ' + (action.label || 'Do this').replace(/^./, function (c) { return c.toUpperCase(); });
    wrap.appendChild(title);

    var inputs = {};
    (action.params || []).forEach(function (p) {
      var lbl = document.createElement('label');
      lbl.className = 'sg-feedback-label';
      lbl.textContent = p.label || p.name;
      wrap.appendChild(lbl);
      var field;
      if (p.type === 'select' && p.options) {
        field = document.createElement('select');
        p.options.forEach(function (o) { var op = document.createElement('option'); op.textContent = o; field.appendChild(op); });
      } else {
        field = document.createElement('input');
        field.type = 'text';
        field.placeholder = p.placeholder || '';
      }
      if (prefill[p.name]) field.value = prefill[p.name];
      field.className = 'sg-feedback-input';
      wrap.appendChild(field);
      inputs[p.name] = field;
    });

    var btnRow = document.createElement('div');
    btnRow.className = 'sg-feedback-btn-row';
    var goBtn = document.createElement('button');
    goBtn.className = 'sg-feedback-submit';
    goBtn.textContent = action.risk === 'high' ? 'Submit for approval' : 'Do it';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'sg-feedback-cancel';
    cancelBtn.textContent = 'Cancel';
    btnRow.appendChild(goBtn);
    btnRow.appendChild(cancelBtn);
    wrap.appendChild(btnRow);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;

    cancelBtn.addEventListener('click', function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      self._appendMessage('agent', 'No problem — left it as is.');
    });
    goBtn.addEventListener('click', function () {
      var params = {};
      Object.keys(inputs).forEach(function (k) { params[k] = inputs[k].value; });
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      self._commitDo(action, params);
    });
  };

  /* Confident path: one-line confirm with Do it / Edit / Cancel. */
  SomaGuide.prototype._appendConfirmDo = function (action, params) {
    var self = this;
    var msgs = this._$('.sg-messages');
    if (!msgs) return;
    var summary = action.confirmText ? this._fill(action.confirmText, params)
      : (action.label.replace(/^./, function (c) { return c.toUpperCase(); }) +
         (Object.keys(params).length ? ' (' + Object.keys(params).map(function (k) { return params[k]; }).join(', ') + ')' : '') + '?');
    this._appendMessage('agent', summary);

    var row = document.createElement('div');
    row.className = 'sg-msg sg-msg--action sg-offer';
    var go = document.createElement('button');
    go.className = action.risk === 'high' ? 'sg-offer-tell' : 'sg-offer-do';
    go.textContent = action.risk === 'high' ? 'Submit for approval' : '✨ Do it';
    go.addEventListener('click', function () { if (row.parentNode) row.parentNode.removeChild(row); self._commitDo(action, params); });
    var edit = document.createElement('button');
    edit.className = 'sg-offer-show';
    edit.textContent = 'Edit';
    edit.addEventListener('click', function () { if (row.parentNode) row.parentNode.removeChild(row); self._renderDoForm(action, params); });
    var cancel = document.createElement('button');
    cancel.className = 'sg-offer-tell';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { if (row.parentNode) row.parentNode.removeChild(row); self._appendMessage('agent', 'No problem — left it as is.'); });
    row.appendChild(go);
    row.appendChild(edit);
    row.appendChild(cancel);
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
  };

  SomaGuide.prototype._fill = function (tpl, params) {
    return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return params[k] != null ? params[k] : ''; });
  };

  /* Execute an action's declarative steps on the live page, visibly.
   * All host access goes through this._host so the executor is delivery-agnostic. */
  SomaGuide.prototype._runAction = function (action, params) {
    var self = this;
    var steps = action.steps || [];
    var i = 0;
    var say = action.doneText ? this._fill(action.doneText, params) : 'Done.';
    function next() {
      if (i >= steps.length) {
        self._appendMessage('agent', say);
        return;
      }
      var s = steps[i++];
      var val = (s.param ? params[s.param] : s.value);
      if (s.op === 'click') self._host.click(s.target);
      else if (s.op === 'fill' || s.op === 'select') self._host.setValue(s.target, val);
      setTimeout(next, 420);
    }
    next();
  };

  /* Returns 'bug' | 'feature' | null based on clear submission intent in text. */
  SomaGuide.prototype._classifyFeedback = function (text) {
    var lower = text.toLowerCase();
    var bugIntents = ['bug report', 'report a bug', 'submit a bug', 'i found a bug',
      "there's a bug", 'there is a bug', 'something is broken', 'page is broken',
      "isn't working", 'is not working', 'not loading', "won't load", 'broken on',
      'bug:', 'issue:', 'i want to report an issue', 'i need to report a bug'];
    var featureIntents = ['feature request', 'feature idea', 'suggest a feature',
      'submit a feature', 'i have an idea for', 'i have a suggestion',
      'it would be great if', 'it would be nice if', 'can you add', 'wish the site',
      'feature:', 'idea:', 'suggestion:', "i'd like to suggest", 'want to suggest',
      'want to request a feature', 'submit an idea'];
    for (var i = 0; i < bugIntents.length; i++) {
      if (lower.indexOf(bugIntents[i]) !== -1) return 'bug';
    }
    for (var j = 0; j < featureIntents.length; j++) {
      if (lower.indexOf(featureIntents[j]) !== -1) return 'feature';
    }
    return null;
  };

  /* Returns true if text matches an off-domain pattern in cfg.scopeGuard.offTopicPatterns. */
  SomaGuide.prototype._checkScopeGuard = function (text) {
    var sg = this.cfg.scopeGuard;
    if (!sg || !sg.offTopicPatterns) return false;
    var patterns = sg.offTopicPatterns;
    for (var i = 0; i < patterns.length; i++) {
      var p = patterns[i];
      if (p instanceof RegExp && p.test(text)) return true;
      if (typeof p === 'string' && text.toLowerCase().indexOf(p.toLowerCase()) !== -1) return true;
    }
    return false;
  };

  /* Show a brief acknowledgement then render an inline capture form. */
  /* ── Intake specialist (persona handoff + observer context) ──────────────── */
  SomaGuide.prototype._handoffTo = function (key) {
    var p = (this.cfg.personas && this.cfg.personas[key]) ||
            { name: (this.cfg.persona.name || 'Bill') + ' · Support', avatar: '🛠', greeting: '' };
    this._activePersona = key;
    var av = this._$('.sg-persona-avatar'); if (av && p.avatar) av.textContent = p.avatar;
    var nm = this._$('.sg-persona-name');  if (nm && p.name) nm.textContent = p.name;
    /* If the specialist has its own voice agent and we're in voice mode, reconnect. */
    if (p.voiceAgentId && this.mode === 'voice') {
      this._activeVoiceAgentId = p.voiceAgentId;
      try { this._stopConversation(); this._startConversation(false); } catch (e) {}
    }
    this._log('handoff', { to: key, persona: p.name });
    return p;
  };
  SomaGuide.prototype._restorePersona = function () {
    this._activePersona = null;
    this._activeVoiceAgentId = null;
    var av = this._$('.sg-persona-avatar'); if (av) av.textContent = this.cfg.persona.avatar || '💬';
    var nm = this._$('.sg-persona-name');  if (nm) nm.textContent = this.cfg.persona.name || 'Assistant';
  };

  SomaGuide.prototype._activityOpener = function () {
    var a = this.getRecentActivity(4);
    var err = a.filter(function (x) { return x.type === 'error'; })[0];
    var click = a.filter(function (x) { return x.type === 'click'; })[0];
    var nav = a.filter(function (x) { return x.type === 'nav'; })[0];
    if (err) return 'I noticed an error just popped up on this page — is your report about that?';
    if (click && click.label) return 'I can see you just used “' + click.label + '”. Is this about that?';
    if (nav) return 'Looks like you’re on “' + (nav.title || nav.url) + '”. Is it about something here?';
    return null;
  };

  SomaGuide.prototype._startIntake = function (type, originalText) {
    var p = this._handoffTo('intake');
    this._appendMessage('agent', p.greeting ||
      ('I handle ' + (type === 'bug' ? 'bug reports' : 'change requests') + ' — let me get the details so the team can act on it.'));
    var opener = this._activityOpener();
    if (opener) this._appendMessage('agent', opener);
    this._renderIntakeForm(type, originalText);
  };

  SomaGuide.prototype._renderIntakeForm = function (type, prefill) {
    var self = this;
    var msgs = this._$('.sg-messages'); if (!msgs) return;
    msgs.classList.add('sg-messages--focus');
    var sug = this._$('.sg-suggest'); if (sug) sug.hidden = true;

    var wrap = document.createElement('div');
    wrap.className = 'sg-msg sg-msg--action sg-feedback-form';
    var title = document.createElement('div');
    title.className = 'sg-feedback-form-title';
    title.textContent = type === 'bug' ? '🐛 Report a problem' : '💡 Request a change';
    wrap.appendChild(title);

    var dLbl = document.createElement('label'); dLbl.className = 'sg-feedback-label';
    dLbl.textContent = type === 'bug' ? 'What’s happening?' : 'What would you like changed?';
    wrap.appendChild(dLbl);
    var desc = document.createElement('textarea'); desc.className = 'sg-feedback-textarea'; desc.rows = 3;
    if (prefill && prefill.length > 25) desc.value = prefill;
    wrap.appendChild(desc);

    /* Ask for name only when we don't already know the user. */
    var nameInput = null;
    var known = this._profile && this._profile.display_name;
    if (!known) {
      var nLbl = document.createElement('label'); nLbl.className = 'sg-feedback-label';
      nLbl.textContent = 'Your name (so we can follow up)';
      wrap.appendChild(nLbl);
      nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.className = 'sg-feedback-input';
      nameInput.placeholder = 'e.g. Greg Foster';
      wrap.appendChild(nameInput);
    }
    /* Email — so we can notify when it's done or declined (asked when unknown). */
    var emailInput = null;
    if (!known) {
      var eLbl = document.createElement('label'); eLbl.className = 'sg-feedback-label';
      eLbl.textContent = 'Email (optional — to hear back)';
      wrap.appendChild(eLbl);
      emailInput = document.createElement('input'); emailInput.type = 'email'; emailInput.className = 'sg-feedback-input';
      emailInput.placeholder = 'you@example.com';
      wrap.appendChild(emailInput);
    }

    var row = document.createElement('div'); row.className = 'sg-feedback-btn-row';
    var go = document.createElement('button'); go.className = 'sg-feedback-submit'; go.textContent = 'Next';
    var cancel = document.createElement('button'); cancel.className = 'sg-feedback-cancel'; cancel.textContent = 'Cancel';
    row.appendChild(go); row.appendChild(cancel); wrap.appendChild(row);
    msgs.appendChild(wrap); msgs.scrollTop = msgs.scrollHeight;

    cancel.addEventListener('click', function () {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      msgs.classList.remove('sg-messages--focus');
      self._restorePersona();
      self._appendMessage('agent', 'No problem — let me know if you need anything else.');
    });
    go.addEventListener('click', function () {
      var d = desc.value.trim();
      if (!d) { desc.focus(); return; }
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      msgs.classList.remove('sg-messages--focus');
      var nav = self.getRecentActivity(4).filter(function (x) { return x.type === 'nav'; })[0];
      var req = {
        type: type,
        description: d,
        name: known ? self._profile.display_name : (nameInput ? nameInput.value.trim() : ''),
        email: emailInput ? emailInput.value.trim() : ((self._profile && self._profile.email) || ''),
        page: nav ? (nav.url) : (typeof location !== 'undefined' ? location.href : null),
        recent_activity: self.getRecentActivity(5)
      };
      self._intakeRestate(req);
    });
  };

  /* Restate-to-agreement: echo it back, get a yes before it goes anywhere. */
  SomaGuide.prototype._intakeRestate = function (req) {
    var self = this;
    var msgs = this._$('.sg-messages'); if (!msgs) return;
    var ctx = [];
    var lastClick = (req.recent_activity || []).filter(function (x) { return x.type === 'click'; })[0];
    if (lastClick && lastClick.label) ctx.push('right after you used “' + lastClick.label + '”');
    this._appendMessage('agent',
      'Here’s what I’ve got — “' + req.description + '”' +
      (ctx.length ? ' (' + ctx.join(', ') + ')' : '') + '. Did I get that right?');

    var row = document.createElement('div');
    row.className = 'sg-msg sg-msg--action sg-offer';
    var yes = document.createElement('button'); yes.className = 'sg-offer-do'; yes.textContent = '✓ That’s right';
    yes.addEventListener('click', function () {
      if (row.parentNode) row.parentNode.removeChild(row);
      self._finishIntake(req);
    });
    var edit = document.createElement('button'); edit.className = 'sg-offer-show'; edit.textContent = 'Let me fix it';
    edit.addEventListener('click', function () {
      if (row.parentNode) row.parentNode.removeChild(row);
      self._renderIntakeForm(req.type, req.description);
    });
    row.appendChild(yes); row.appendChild(edit);
    msgs.appendChild(row); msgs.scrollTop = msgs.scrollHeight;
  };

  SomaGuide.prototype._finishIntake = function (req) {
    var self = this;
    this._log('intake_complete', req);
    var who = req.name ? (', ' + req.name.split(' ')[0]) : '';
    var payload = {
      source: 'bill',
      type: req.type,
      description: req.description,
      requester_name: req.name || (this._profile && this._profile.display_name) || null,
      requester_email: req.email || null,
      page: req.page,
      context: { recent_activity: req.recent_activity, session: this._session && this._session.id }
    };
    /* Submit into the unified change-request queue; the daemon vets + routes it. */
    if (this.cfg.intakeUrl) {
      fetch(this.cfg.intakeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.ok ? r.json().catch(function () { return {}; }) : Promise.reject(); })
        .then(function () {
          self._appendMessage('agent', 'Got it' + who + '. I’ve queued this with the full context — the team will pick it up, and you’ll hear back when it’s done.');
        })
        .catch(function () {
          self._appendMessage('agent', 'Got it' + who + '. I’ve noted it (couldn’t reach the queue just now — it’s saved in this session).');
        });
    } else {
      this._appendMessage('agent', 'Got it' + who + '. I’ve logged this with the context.');
    }
    this._restorePersona();
  };

  SomaGuide.prototype._startFeedbackFlow = function (type, originalText) {
    var label = type === 'bug' ? 'bug report' : 'feature request';
    this._appendMessage('agent',
      "Sure — I'll log that " + label + " for Greg. Fill in the details below.");
    /* Pre-fill description only when the original message clearly is the description
     * (i.e. not just a trigger phrase like "report a bug" with no description). */
    var prefill = '';
    if (originalText && originalText.length > 30 && this._classifyFeedback(originalText)) {
      prefill = originalText;
    }
    this._appendFeedbackForm(type, prefill);
  };

  /* Append an inline feedback capture form to the chat messages area. */
  SomaGuide.prototype._appendFeedbackForm = function (type, prefill) {
    var self = this;
    var msgs = this._$('.sg-messages');
    if (!msgs) return;

    /* Focus the panel on the form: hide chat scrollback + suggestion chips so the
     * form isn't buried below history. Restored on submit-success or cancel. */
    msgs.classList.add('sg-messages--focus');
    var sug = this._$('.sg-suggest'); if (sug) sug.hidden = true;
    var unfocus = function () { msgs.classList.remove('sg-messages--focus'); };

    var wrapper = document.createElement('div');
    wrapper.className = 'sg-msg sg-msg--action sg-feedback-form';

    var titleEl = document.createElement('div');
    titleEl.className = 'sg-feedback-form-title';
    titleEl.textContent = type === 'bug' ? '🐛 Bug Report' : '💡 Feature Request';
    wrapper.appendChild(titleEl);

    var descLabel = document.createElement('label');
    descLabel.className = 'sg-feedback-label';
    descLabel.textContent = type === 'bug' ? "What's broken?" : 'What would you like to see?';
    wrapper.appendChild(descLabel);

    var descInput = document.createElement('textarea');
    descInput.className = 'sg-feedback-textarea';
    descInput.placeholder = type === 'bug'
      ? 'Describe the issue — what page, what happened, what you expected…'
      : 'Describe the feature idea…';
    descInput.rows = 3;
    if (prefill) descInput.value = prefill;
    wrapper.appendChild(descInput);

    var nameLabel = document.createElement('label');
    nameLabel.className = 'sg-feedback-label';
    nameLabel.textContent = 'Your name (optional)';
    wrapper.appendChild(nameLabel);

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'sg-feedback-input';
    nameInput.placeholder = 'e.g. Greg Foster';
    wrapper.appendChild(nameInput);

    var btnRow = document.createElement('div');
    btnRow.className = 'sg-feedback-btn-row';

    var submitBtn = document.createElement('button');
    submitBtn.className = 'sg-feedback-submit';
    submitBtn.textContent = 'Submit';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'sg-feedback-cancel';
    cancelBtn.textContent = 'Cancel';

    btnRow.appendChild(submitBtn);
    btnRow.appendChild(cancelBtn);
    wrapper.appendChild(btnRow);

    var statusDiv = document.createElement('div');
    statusDiv.className = 'sg-feedback-status';
    wrapper.appendChild(statusDiv);

    submitBtn.addEventListener('click', function () {
      var desc = descInput.value.trim();
      if (!desc) {
        statusDiv.textContent = 'Please describe the ' + (type === 'bug' ? 'issue' : 'feature') + '.';
        statusDiv.className = 'sg-feedback-status sg-feedback-status--error';
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      statusDiv.textContent = '';
      statusDiv.className = 'sg-feedback-status';

      var pageCtx = (typeof location !== 'undefined') ? location.href : null;
      var assistantId = self.cfg.tenantId || self.cfg.persona.id || self.cfg.persona.name || 'unknown';

      fetch(self.cfg.feedbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type,
          description: desc,
          member_name: nameInput.value.trim() || null,
          page_context: pageCtx,
          assistant_id: assistantId
        })
      }).then(function (res) {
        return res.json().then(function (d) { return { status: res.status, data: d }; });
      }).then(function (result) {
        if (result.status === 200) {
          if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
          unfocus();
          var confirmMsg = type === 'bug'
            ? "Bug report logged — Greg will review it. Thanks for the heads-up!"
            : "Feature request logged — Greg will review it. Great idea!";
          self._appendMessage('agent', confirmMsg);
        } else {
          statusDiv.textContent = (result.data && result.data.error) || 'Submission failed — please try again.';
          statusDiv.className = 'sg-feedback-status sg-feedback-status--error';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit';
        }
      }).catch(function () {
        statusDiv.textContent = 'Network error — please try again.';
        statusDiv.className = 'sg-feedback-status sg-feedback-status--error';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      });
    });

    cancelBtn.addEventListener('click', function () {
      if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
      unfocus();
      self._appendMessage('agent', "No problem — let me know if you need anything else.");
    });

    msgs.appendChild(wrapper);
    msgs.scrollTop = msgs.scrollHeight;
  };

  /* Classify a user message as 'factual', 'howto', or 'other'.
   * howto  → walkthrough/navigation intent ("how do I…", "where do I…")
   * factual → answer-from-context intent ("who is…", "what is…", "is there…")
   * other  → falls through to ElevenLabs conversation */
  SomaGuide.prototype._classifyQuestion = function (text) {
    var lower = text.trim().toLowerCase();

    var howTo = ['how do i', 'how do you', 'how to ', 'how can i', 'how would i', 'how should i',
                 'where do i', 'where can i', 'where should i', 'show me how'];
    for (var i = 0; i < howTo.length; i++) {
      if (lower.slice(0, howTo[i].length) === howTo[i]) return 'howto';
    }

    var factual = ['who ', "who's ", "who are ", 'what ', "what's ", "what are ",
                   'when ', "when's ", 'why ', 'which ', 'where ',
                   'is ', 'are ', 'was ', 'were ', 'does ', 'do ', 'did ',
                   'has ', 'have ', 'can ', 'could ', 'would ', 'should ',
                   'tell me ', 'explain ', 'describe '];
    for (var j = 0; j < factual.length; j++) {
      if (lower.slice(0, factual[j].length) === factual[j]) return 'factual';
    }

    if (lower.charAt(lower.length - 1) === '?') return 'factual';

    return 'other';
  };

  /* POST to cfg.inferenceUrl, render the grounded answer in the chat. */
  SomaGuide.prototype._askInference = function (text) {
    var self = this;

    /* Show typing indicator */
    var msgs = this._$('.sg-messages');
    var thinkingDiv = null;
    if (msgs) {
      thinkingDiv = document.createElement('div');
      thinkingDiv.className = 'sg-msg sg-msg--agent sg-msg--thinking';
      thinkingDiv.textContent = '…';
      msgs.appendChild(thinkingDiv);
      msgs.scrollTop = msgs.scrollHeight;
    }

    /* Gather page context */
    var pageText = '';
    try {
      var mainEl = document.querySelector('main') || document.body;
      pageText = ((mainEl.innerText || mainEl.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
    } catch (_) {}

    var navText = (this.cfg.siteMap || []).map(function (s) {
      return s.label + ': ' + s.description;
    }).join('\n');

    var scopeCtx  = (this.cfg.scopeGuard && this.cfg.scopeGuard.contextNote) ? this.cfg.scopeGuard.contextNote : '';
    var knowledge = typeof this.cfg.knowledge === 'string' ? this.cfg.knowledge : '';
    var context   = [scopeCtx, knowledge, navText, pageText].filter(Boolean).join('\n\n').slice(0, 8000);

    var persona  = this.cfg.persona.name || 'Assistant';
    var url      = this.cfg.inferenceUrl;

    var appId = self.cfg.tenantId || self.cfg.persona.id || self.cfg.persona.name || 'unknown';

    fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        question: text,
        context:  context,
        persona:  persona,
        allowWeb: self._webSearchEnabled,
        app_id:   appId
      })
    }).then(function (res) {
      return res.json();
    }).then(function (data) {
      if (thinkingDiv && thinkingDiv.parentNode) thinkingDiv.parentNode.removeChild(thinkingDiv);

      var pName  = self.cfg.persona.name || 'I';
      var answer = (data && typeof data.answer === 'string' && data.answer)
        ? data.answer
        : pName + " doesn't see that in the site content. Try asking me to show you around!";

      self._appendMessage('agent', answer);

      if (self._ttsEnabled()) self._ttsSpeak(answer);

      /* Offer "show me" if a related walkthrough exists */
      var related = self._matchWalkthrough(text);
      if (related) self._appendShowMeBtn(related);

    }).catch(function (err) {
      if (thinkingDiv && thinkingDiv.parentNode) thinkingDiv.parentNode.removeChild(thinkingDiv);
      var name = self.cfg.persona.name || 'I';
      self._appendMessage('agent',
        name + " can't reach the knowledge base right now. Try voice chat, or ask me to show you around the site.");
      console.warn('[SomaGuide] inference error', err);
    });
  };

  /* Append a "Want me to show you where?" button after an inferred answer. */
  SomaGuide.prototype._appendShowMeBtn = function (wt) {
    var self = this;
    var msgs = this._$('.sg-messages');
    if (!msgs) return;
    var div = document.createElement('div');
    div.className = 'sg-msg sg-msg--action';
    var btn = document.createElement('button');
    btn.className = 'sg-show-me-btn';
    btn.textContent = 'Want me to show you where?';
    btn.addEventListener('click', function () {
      if (div.parentNode) div.parentNode.removeChild(div);
      self._wtStart(wt.id, 0, -1);
    });
    div.appendChild(btn);
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  };

  SomaGuide.prototype._appendMessage = function (role, text) {
    var msgs = this._$('.sg-messages');
    if (!msgs) return;
    /* Once the user actually engages, retire the onboarding scaffolding — the
     * suggestion chips and the prominent voice affordance. */
    if (role === 'user') {
      var sug = this._$('.sg-suggest'); if (sug) sug.hidden = true;
      this._retireVoiceIntro();
    }
    this._log(role === 'user' ? 'user_message' : 'agent_message', { text: text });
    var div = document.createElement('div');
    div.className = 'sg-msg sg-msg--' + role;
    var span = document.createElement('span');
    span.className = 'sg-msg-text';
    span.textContent = text;
    div.appendChild(span);
    if (role === 'agent') {
      var btn = document.createElement('button');
      btn.className = 'sg-copy-btn';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy message');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            btn.textContent = 'Copied!';
            btn.classList.add('sg-copy-btn--copied');
            setTimeout(function () {
              btn.textContent = 'Copy';
              btn.classList.remove('sg-copy-btn--copied');
            }, 1800);
          }).catch(function () {
            btn.textContent = '✗';
            setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
          });
        } else {
          /* Fallback for older browsers */
          try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.textContent = 'Copied!';
            btn.classList.add('sg-copy-btn--copied');
            setTimeout(function () {
              btn.textContent = 'Copy';
              btn.classList.remove('sg-copy-btn--copied');
            }, 1800);
          } catch (_) {}
        }
      });
      div.appendChild(btn);
    }
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  };

  /* ── TTS narration ──────────────────────────────────────────────────────────── */

  SomaGuide.prototype._ttsEnabled = function () {
    return !!(this.cfg.ttsProxyUrl && this.cfg.voiceAgentId) && !this._ttsMuted;
  };

  /* Stable djb2-xor hash of voiceAgentId + '|' + narration → 8-char hex string.
   * MUST match the identical function in scripts/gen-tour-audio.mjs. */
  SomaGuide.prototype._tourAudioHash = function (agentId, narration) {
    var s = (agentId || '') + '|' + (narration || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
    }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  };

  SomaGuide.prototype._ttsStop = function () {
    if (this._ttsAudio) {
      this._ttsAudio.pause();
      this._ttsAudio.src = '';
      this._ttsAudio = null;
    }
  };

  /* _ttsSpeak(text, onEnded?)
   *
   * onEnded: called when audio finishes (or fallback fires when muted/unavailable).
   *          Never called before audio actually ends; fallback is computed to be
   *          generous enough to never truncate real narration.
   *
   * Playback order:
   *  1. Pre-generated static clip at /audio/tour/<hash>.mp3 (instant CDN hit).
   *  2. Prefetch cache for live TTS (populated by _ttsPrefetchNext).
   *  3. Live TTS fetch from the proxy.
   *
   * Robust timing:
   *  - Muted/no TTS: fallback = max(TTS_FLOOR_MS, chars * TTS_MS_PER_CHAR).
   *  - TTS enabled: pre-play fallback = chars * TTS_MS_PER_CHAR + TTS_BUFFER_MS.
   *    Replaced with duration-based timer once loadedmetadata fires.
   *    Cancelled entirely when 'ended' fires naturally.
   */
  SomaGuide.prototype._ttsSpeak = function (text, onEnded) {
    var self = this;
    this._ttsStop();

    var fallbackMs = Math.max(TTS_FLOOR_MS, (text || '').length * TTS_MS_PER_CHAR);

    if (!this._ttsEnabled() || !text) {
      if (onEnded) self._autoTimer = setTimeout(onEnded, fallbackMs);
      /* Arm cursor immediately for the muted / no-TTS path — no audio to lead into */
      if (self._pendingCursorTarget && self._pendingCursorDemo) {
        var pt0 = self._pendingCursorTarget;
        var pd0 = self._pendingCursorDemo;
        if (self._cursorLeadTimer) clearTimeout(self._cursorLeadTimer);
        self._cursorLeadTimer = setTimeout(function () {
          self._cursorLeadTimer = null;
          self._demoMoveTo(pt0, pd0);
        }, 0);
      }
      return;
    }

    var ttsAppId = this.cfg.tenantId || this.cfg.persona.id || this.cfg.persona.name || 'unknown';
    var liveUrl = this.cfg.ttsProxyUrl +
      '?action=tts' +
      '&text=' + encodeURIComponent(text) +
      '&agent_id=' + encodeURIComponent(this.cfg.voiceAgentId) +
      '&app_id=' + encodeURIComponent(ttsAppId);

    /* Snapshot prefetch cache before _ttsPrefetchNext may clear it. */
    var cached = (self._ttsPrefetchCache && self._ttsPrefetchCache.url === liveUrl)
      ? self._ttsPrefetchCache : null;

    /* Kick off next-step live-TTS prefetch in parallel for use as fallback. */
    this._ttsPrefetchNext();

    var staticUrl = '/audio/tour/' + this._tourAudioHash(this.cfg.voiceAgentId, text) + '.mp3';
    var fetchFn   = (typeof global !== 'undefined' && global.fetch) || fetch;

    function playBlob(blob) {
      if (!blob || !self._ttsEnabled()) {
        if (onEnded) self._autoTimer = setTimeout(onEnded, fallbackMs);
        return;
      }
      var objUrl = (typeof URL !== 'undefined' && URL.createObjectURL)
        ? URL.createObjectURL(blob) : null;
      if (!objUrl) {
        if (onEnded) self._autoTimer = setTimeout(onEnded, fallbackMs);
        return;
      }
      self._ttsPlayBlob(objUrl, fallbackMs, onEnded);
    }

    /* Try pre-generated static clip first; fall through to live TTS on miss. */
    fetchFn(staticUrl).then(function (r) {
      if (r.ok) return r.blob().then(playBlob);

      /* Static miss — use prefetch cache if available, else fetch live TTS. */
      if (cached) {
        self._ttsPrefetchCache = null;
        self._ttsPrefetchUrl   = null;
        self._ttsPlayBlob(cached.blobUrl, fallbackMs, onEnded);
        return;
      }
      return fetchFn(liveUrl).then(function (r2) {
        return r2.ok ? r2.blob() : null;
      }).then(playBlob);
    }).catch(function (e) {
      console.warn('[SomaGuide] TTS error', e);
      if (onEnded) self._autoTimer = setTimeout(onEnded, fallbackMs);
    });
  };

  /* Attach an Audio element and manage timing via ended + loadedmetadata. */
  SomaGuide.prototype._ttsPlayBlob = function (objUrl, fallbackMs, onEnded) {
    var self  = this;
    var audio = new Audio(objUrl);
    self._ttsAudio = audio;

    if (onEnded) {
      /* Pre-play fallback — replaced when metadata arrives */
      self._autoTimer = setTimeout(onEnded, fallbackMs + TTS_BUFFER_MS);

      audio.addEventListener('loadedmetadata', function () {
        if (self._ttsAudio !== audio) return;
        clearTimeout(self._autoTimer);
        var durationMs = Math.ceil(audio.duration * 1000);
        self._autoTimer = setTimeout(onEnded, durationMs + TTS_BUFFER_MS);
      }, { once: true });

      audio.addEventListener('ended', function () {
        if (self._ttsAudio !== audio) return;
        clearTimeout(self._autoTimer);
        self._autoTimer = null;
        onEnded();
      }, { once: true });
    }

    audio.play().then(function () {
      /* Arm cursor lead-in now that audio has actually started playing */
      var pt = self._pendingCursorTarget;
      var pd = self._pendingCursorDemo;
      if (pt && pd) {
        var li = (self.cfg.cursorLeadIn !== undefined) ? self.cfg.cursorLeadIn : CURSOR_LEAD_IN;
        if (self._cursorLeadTimer) clearTimeout(self._cursorLeadTimer);
        self._cursorLeadTimer = setTimeout(function () {
          self._cursorLeadTimer = null;
          self._demoMoveTo(pt, pd);
        }, li);
      }
      self._ttsPrefetchNext();
    }).catch(function () {
      /* Autoplay blocked — fall back to timer, no cursor */
      if (onEnded) {
        clearTimeout(self._autoTimer);
        self._autoTimer = setTimeout(onEnded, fallbackMs);
      }
    });
  };

  /* Pre-fetch the next step's audio blob in the background during current playback. */
  SomaGuide.prototype._ttsPrefetchNext = function () {
    var self = this;
    if (!this._ttsEnabled() || !this.wt) return;
    var wt = this._wtById(this.wt.id);
    if (!wt) return;

    var stepIdx  = this.wt.stepIndex;
    var subIdx   = this.wt.subStepIndex != null ? this.wt.subStepIndex : -1;
    var topStep  = wt.steps[stepIdx];
    var substeps = (topStep && topStep.substeps) ? topStep.substeps : [];
    var nextStep = null;

    if (subIdx === -1 && substeps.length > 0) {
      nextStep = substeps[0];
    } else if (subIdx >= 0 && subIdx + 1 < substeps.length) {
      nextStep = substeps[subIdx + 1];
    } else if (stepIdx + 1 < wt.steps.length) {
      nextStep = wt.steps[stepIdx + 1];
    }

    if (!nextStep || !nextStep.narration || nextStep.page) return; /* skip if navigates */

    var prefetchAppId = this.cfg.tenantId || this.cfg.persona.id || this.cfg.persona.name || 'unknown';
    var url = this.cfg.ttsProxyUrl +
      '?action=tts' +
      '&text=' + encodeURIComponent(nextStep.narration) +
      '&agent_id=' + encodeURIComponent(this.cfg.voiceAgentId) +
      '&app_id=' + encodeURIComponent(prefetchAppId);

    if (self._ttsPrefetchUrl === url) return;           /* in-flight dedup */
    if (self._ttsPrefetchCache && self._ttsPrefetchCache.url === url) return; /* already cached */
    self._ttsPrefetchUrl = url;
    self._ttsPrefetchCache = null;

    var fetchFn = (typeof global !== 'undefined' && global.fetch) || fetch;
    fetchFn(url).then(function (r) {
      if (!r.ok) return null;
      return r.blob();
    }).then(function (blob) {
      if (!blob || self._ttsPrefetchUrl !== url) return;
      var objUrl = (typeof URL !== 'undefined' && URL.createObjectURL)
        ? URL.createObjectURL(blob) : null;
      if (objUrl) self._ttsPrefetchCache = { url: url, blobUrl: objUrl };
      self._ttsPrefetchUrl = null;
    }).catch(function () {
      if (self._ttsPrefetchUrl === url) self._ttsPrefetchUrl = null;
    });
  };

  SomaGuide.prototype._ttsMuteToggle = function () {
    this._ttsMuted = !this._ttsMuted;
    this._lsSet('tts-muted', this._ttsMuted ? '1' : '0');
    this._updateMuteBtn();
    if (this._ttsMuted) {
      this._ttsStop();
    } else if (this.mode === 'walkthrough' && this.wt) {
      var step = this._wtCurrentStep();
      if (step) this._ttsSpeak(step.narration || '');
    }
  };

  SomaGuide.prototype._ttsReplay = function () {
    if (!this.wt) return;
    var step = this._wtCurrentStep();
    if (step) this._ttsSpeak(step.narration || '');
  };

  SomaGuide.prototype._updateMuteBtn = function () {
    var btn = this._$('.sg-btn-mute');
    if (!btn) return;
    btn.textContent = this._ttsMuted ? '🔇' : '🔊';
    btn.setAttribute('title',      this._ttsMuted ? 'Unmute narration' : 'Mute narration');
    btn.setAttribute('aria-label', this._ttsMuted ? 'Unmute narration' : 'Mute narration');
  };

  /* ── Dev: verify a config's selectors and narration ─────────────────────── */
  SomaGuide.verify = function (config) {
    var issues = [];
    if (typeof document === 'undefined') {
      return [{ message: 'verify() requires a DOM environment' }];
    }
    function checkStep(wtId, stepPath, step) {
      if (!step.narration) {
        issues.push({ walkthrough: wtId, step: stepPath, issue: 'empty narration' });
      }
      if (step.target) {
        var el = document.querySelector(step.target);
        if (!el) issues.push({ walkthrough: wtId, step: stepPath, issue: 'target not found: ' + step.target });
      }
      if (step.requires && step.requires.dropdown) {
        var dp = document.querySelector(step.requires.dropdown);
        if (!dp) issues.push({ walkthrough: wtId, step: stepPath, issue: 'requires.dropdown not found: ' + step.requires.dropdown });
      }
    }
    (config.walkthroughs || []).forEach(function (wt) {
      (wt.steps || []).forEach(function (step, i) {
        checkStep(wt.id, i, step);
        (step.substeps || []).forEach(function (sub, j) {
          checkStep(wt.id, i + '.' + j, sub);
        });
      });
    });
    return issues;
  };

  /* ── Public API ── */
  SomaGuide.prototype.open    = function () {
    if (this.cfg.conversationalShell) {
      if (this._lsGet('io-mode') === 'voice' && this.cfg.voiceAgentId) { this._openVoice(); }
      else { this._openShell(); }
    } else { this._openIdle(false); }
  };
  SomaGuide.prototype.minimize = function () { this._minimize(); };
  SomaGuide.prototype.startWalkthrough = function (id, step) { this._wtStart(id, step || 0, -1); };

  /* ── Auto-init ── */
  global.SomaGuide = SomaGuide;

  if (typeof document !== 'undefined') {
    var init = function () {
      var cfg = global.SomaGuideConfig;
      if (cfg && !global.somaGuide) {
        global.somaGuide = new SomaGuide(cfg);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
