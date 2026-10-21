/*!
 * soma-speech.js — a microphone button that turns speech into text in a text box.
 *
 * One script tag, no framework, no build step, no dependencies:
 *
 *   <script src="https://soma-speech.netlify.app/soma-speech.js"
 *           data-target="#chat-input" defer></script>
 *
 * or, from code (for a box that is rendered after the page loads):
 *
 *   SomaSpeech.attach('#chat-input');
 *   SomaSpeech.attach(textareaElement, { lang: 'en-US', mount: '#chat-actions' });
 *
 * What it does
 *   - Adds a mic button after the target <textarea> or <input> (or inside
 *     options.mount). Click to start, click again or press Esc to stop.
 *   - Interim words show in a small bubble above the button while you speak.
 *     They are NOT written into the box, so Enter cannot send half a sentence.
 *   - Final text is inserted at the cursor (replacing any selected text), with
 *     spacing fixed, and the browser's undo history and the page's own `input`
 *     listeners keep working. Anything already typed stays.
 *   - States are visible: idle, listening, finishing, error, and "not supported".
 *     A browser with no speech recognition (Firefox) gets a button that says so.
 *
 * Engines (the adapter interface)
 *   The default engine is the browser's SpeechRecognition / webkitSpeechRecognition.
 *   A server-side service can replace it by passing options.engine, a function
 *   that returns an object with this shape:
 *
 *     {
 *       name: 'my-engine',
 *       supported: true,                  // false shows the "not supported" state
 *       start({ lang }) {},               // begin capturing; called again after onend
 *       stop() {},                        // deliver pending text, then call onend
 *       abort() {},                       // optional: drop everything now
 *       // Assigned by SomaSpeech. The engine calls them:
 *       onstart() {},                     // audio is being captured
 *       onresult({ type, text }) {},      // type 'interim' replaces the last interim
 *                                         // type 'final' commits text
 *       onerror({ code, message }) {},    // codes: not-allowed, service-not-allowed,
 *                                         // audio-capture, network, no-speech, aborted, ...
 *       onend() {}                        // the session ended (stop, error, or silence)
 *     }
 *
 *   See DESIGN-v2.md for the server-side engine that is planned.
 *
 * Written 2026-10-21 (Mike Wolf; Claude Sonnet 5.5, CCc) for SOMA Studio's chat
 * box, reusable by PlayMaker and any SOMA app. Bead sp-hih.
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var MAX_EMPTY_CYCLES = 2;   // silent sessions in a row before listening gives up
  var STOP_GRACE_MS = 3000;   // how long stop() waits for the engine to say it ended
  var NOTICE_MS = 8000;       // how long an error or notice stays on screen

  // ---------------------------------------------------------------- text

  // Voice engines sometimes return stray spaces or newlines. One space between words.
  function clean(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').replace(/^ | $/g, '');
  }

  // Punctuation that attaches to the word before it, and openers that attach to the word after.
  var HUGS_PREVIOUS = /^[.,;:!?)\]}%”’]/;
  var ENDS_WITH_OPENER = /[\s(\[{“‘]$/;
  var STARTS_SPACED_OR_CLOSER = /^[\s.,;:!?)\]}”’]/;

  function clampIndex(n, len) {
    if (typeof n !== 'number' || !isFinite(n)) return len;
    return Math.max(0, Math.min(len, Math.floor(n)));
  }

  // Pure function: where do these words go, and what does the box hold afterwards?
  // Replaces value[start:end] (the selection) with the words, adding a space on
  // either side only where the neighbouring text needs one.
  function computeInsert(value, start, end, text) {
    value = String(value == null ? '' : value);
    var len = value.length;
    start = clampIndex(start, len);
    end = clampIndex(end, len);
    if (end < start) { var swap = start; start = end; end = swap; }
    var words = clean(text);
    if (!words) {
      return { value: value, start: start, end: end, replacement: '', caret: end, changed: false };
    }
    var before = value.slice(0, start);
    var after = value.slice(end);
    var lead = before && !ENDS_WITH_OPENER.test(before) && !HUGS_PREVIOUS.test(words) ? ' ' : '';
    var trail = after && !STARTS_SPACED_OR_CLOSER.test(after) ? ' ' : '';
    var replacement = lead + words + trail;
    return {
      value: before + replacement + after,
      start: start,
      end: end,
      replacement: replacement,
      caret: start + replacement.length,
      changed: true
    };
  }

  // ---------------------------------------------------------------- messages

  function unsupportedMessage() {
    if (root && root.isSecureContext === false) {
      return 'Voice typing only works on a secure (https) page.';
    }
    var ua = (root && root.navigator && root.navigator.userAgent) || '';
    if (/Firefox\//.test(ua)) {
      return "Firefox can't turn speech into text on a web page. Use Chrome, Edge or Safari, or your computer's own dictation.";
    }
    return "This browser can't turn speech into text on a web page. Use Chrome, Edge or Safari, or your computer's own dictation.";
  }

  function friendlyError(code, message) {
    switch (code) {
      case 'unsupported': return unsupportedMessage();
      case 'not-allowed':
        return 'The microphone is blocked. Allow it for this site in the browser address bar, then click the mic again.';
      case 'service-not-allowed':
        return 'Speech recognition is switched off. On a Mac, open System Settings, then Keyboard, then Dictation, and turn Dictation on.';
      case 'audio-capture': return 'No microphone was found.';
      case 'network':
        return 'Speech recognition needs an internet connection, because the browser sends the audio to its speech service.';
      case 'language-not-supported': return "This language isn't available for voice typing.";
      case 'read-only': return 'That box is read-only, so there is nowhere to put the words.';
      case 'no-speech': return 'Nothing was heard, so listening stopped. Click the mic to try again.';
      default: return 'Voice typing stopped (' + (message || code || 'unknown reason') + ').';
    }
  }

  // ---------------------------------------------------------------- the text box

  function setNativeValue(el, value) {
    var proto = Object.getPrototypeOf(el);
    var desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function makeInputEvent(el, data) {
    var win = el.ownerDocument && el.ownerDocument.defaultView;
    try {
      if (win && win.InputEvent) {
        return new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: data });
      }
    } catch (e) { /* fall through */ }
    return win && win.Event ? new win.Event('input', { bubbles: true }) : { type: 'input', bubbles: true, data: data };
  }

  // Wraps a <textarea> or <input>. Anything with these methods can be a target.
  function domTarget(el) {
    var touched = false;
    function mark() { touched = true; }
    el.addEventListener('focus', mark);
    el.addEventListener('input', mark);
    return {
      el: el,
      isLocked: function () { return !!(el.disabled || el.readOnly); },
      getValue: function () { return el.value; },
      getSelection: function () {
        try { return [el.selectionStart, el.selectionEnd]; } catch (e) { return [null, null]; }
      },
      // A box nobody has touched reports its cursor at 0, which would put the
      // words in front of existing text. Start at the end instead.
      prepare: function () {
        if (touched) return;
        try {
          var len = el.value.length;
          if (len && el.selectionStart === 0 && el.selectionEnd === 0) el.setSelectionRange(len, len);
        } catch (e) { /* input types without a selection API */ }
      },
      apply: function (r) {
        var doc = el.ownerDocument;
        var done = false;
        // execCommand keeps the browser's undo history. It needs focus, and we
        // must not steal focus from wherever the person is working.
        try {
          if (doc && doc.activeElement === el && typeof doc.execCommand === 'function') {
            el.setSelectionRange(r.start, r.end);
            done = doc.execCommand('insertText', false, r.replacement) && el.value === r.value;
          }
        } catch (e) { done = false; }
        if (!done) {
          setNativeValue(el, r.value);
          if (el.dispatchEvent) el.dispatchEvent(makeInputEvent(el, r.replacement));
        }
        try { el.setSelectionRange(r.caret, r.caret); } catch (e) { /* ignore */ }
      },
      destroy: function () {
        el.removeEventListener('focus', mark);
        el.removeEventListener('input', mark);
      }
    };
  }

  // ---------------------------------------------------------------- engines

  // The browser's built-in engine. `opts.SpeechRecognition` lets tests pass a fake.
  function createBrowserEngine(opts) {
    opts = opts || {};
    var Ctor = opts.SpeechRecognition ||
      (root && (root.SpeechRecognition || root.webkitSpeechRecognition)) || null;
    var secure = !(root && root.isSecureContext === false);
    var rec = null;
    var engine = {
      name: 'browser',
      supported: !!Ctor && secure,
      onstart: null, onresult: null, onerror: null, onend: null,
      start: function (o) {
        if (!Ctor) return;
        rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.lang = (o && o.lang) || 'en-US';
        rec.onstart = function () { if (engine.onstart) engine.onstart(); };
        rec.onresult = function (e) {
          if (!engine.onresult) return;
          var interim = '';
          for (var i = e.resultIndex; i < e.results.length; i++) {
            var res = e.results[i];
            var text = res[0] ? res[0].transcript : '';
            if (res.isFinal) engine.onresult({ type: 'final', text: text });
            else interim += text;
          }
          engine.onresult({ type: 'interim', text: interim });
        };
        rec.onerror = function (e) {
          if (engine.onerror) engine.onerror({ code: (e && e.error) || 'unknown', message: e && e.message });
        };
        rec.onend = function () { if (engine.onend) engine.onend(); };
        try {
          rec.start();
        } catch (err) {
          if (engine.onerror) engine.onerror({ code: 'start-failed', message: err && err.message });
          if (engine.onend) engine.onend();
        }
      },
      stop: function () { if (rec) rec.stop(); },
      abort: function () { if (rec) rec.abort(); }
    };
    return engine;
  }

  // ---------------------------------------------------------------- the controller

  // Joins an engine to a target. No DOM in here, so it runs under Node for tests.
  function createController(o) {
    var engine = o.engine;
    var target = o.target;
    var timers = o.timers || {
      set: function (fn, ms) { return setTimeout(fn, ms); },
      clear: function (t) { clearTimeout(t); }
    };
    var info = { state: 'idle', interim: '', code: '', message: '' };
    var want = false;          // the person wants listening to continue
    var gotResult = false;     // this engine session produced words
    var emptyCycles = 0;       // sessions in a row that produced none
    var stopTimer = null;
    var dead = false;

    function emit() {
      if (o.onChange) o.onChange({ state: info.state, interim: info.interim, code: info.code, message: info.message });
    }
    function set(state, interim, code, message) {
      info.state = state;
      info.interim = interim || '';
      info.code = code || '';
      info.message = message || '';
      emit();
    }
    function fail(code, message) {
      want = false;
      set('error', '', code, friendlyError(code, message));
    }
    function clearStopTimer() {
      if (stopTimer !== null) { timers.clear(stopTimer); stopTimer = null; }
    }

    function commit(text) {
      var words = clean(text);
      if (!words) return;
      if (target.isLocked && target.isLocked()) {
        try { if (engine.abort) engine.abort(); } catch (e) { /* ignore */ }
        fail('read-only');
        return;
      }
      var sel = target.getSelection();
      target.apply(computeInsert(target.getValue(), sel[0], sel[1], words));
    }

    // Words the person saw in the bubble must not vanish when listening ends.
    function flushInterim() {
      var pending = info.interim;
      info.interim = '';
      if (pending) commit(pending);
    }

    function launch() {
      gotResult = false;
      try {
        engine.start({ lang: o.lang });
      } catch (e) {
        fail('start-failed', e && e.message);
      }
    }

    function ended() {
      if (dead) return;
      clearStopTimer();
      flushInterim();
      if (info.state === 'error') return;          // keep the error on screen
      if (want) {
        emptyCycles = gotResult ? 0 : emptyCycles + 1;
        if (emptyCycles >= MAX_EMPTY_CYCLES) {
          want = false;
          set('idle', '', 'no-speech', friendlyError('no-speech'));
          return;
        }
        launch();                                  // engines end on silence; keep going
        return;
      }
      set('idle');
    }

    engine.onstart = function () {
      if (dead) return;
      if (want && info.state === 'starting') set('listening');
    };
    engine.onresult = function (ev) {
      if (dead || !ev) return;
      if (info.state === 'starting' && want) set('listening');
      if (ev.type === 'final') {
        if (clean(ev.text)) gotResult = true;
        info.interim = '';
        commit(ev.text);
        if (info.state !== 'error') set(info.state, '');
      } else {
        var interim = clean(ev.text);
        if (interim) gotResult = true;
        set(info.state, interim);
      }
    };
    engine.onerror = function (ev) {
      if (dead) return;
      var code = (ev && ev.code) || 'unknown';
      if (code === 'aborted') return;               // that was us
      if (code === 'no-speech') return;             // ended() counts it as a silent session
      flushInterim();
      fail(code, ev && ev.message);
    };
    engine.onend = ended;

    var ctl = {
      get state() { return info.state; },
      get info() { return { state: info.state, interim: info.interim, code: info.code, message: info.message }; },
      start: function () {
        if (dead) return;
        if (info.state === 'starting' || info.state === 'listening' || info.state === 'stopping') return;
        if (!engine || !engine.supported) { fail('unsupported'); return; }
        if (target.isLocked && target.isLocked()) { fail('read-only'); return; }
        if (target.prepare) target.prepare();
        want = true;
        emptyCycles = 0;
        set('starting');
        launch();
      },
      stop: function () {
        if (dead) return;
        if (info.state !== 'starting' && info.state !== 'listening') return;
        want = false;
        set('stopping', info.interim);
        try { engine.stop(); } catch (e) { /* the timer below still ends the session */ }
        if (info.state !== 'stopping') return;     // the engine ended synchronously
        clearStopTimer();
        stopTimer = timers.set(function () {
          stopTimer = null;
          try { if (engine.abort) engine.abort(); } catch (e) { /* ignore */ }
          ended();
        }, STOP_GRACE_MS);
      },
      toggle: function () {
        if (info.state === 'starting' || info.state === 'listening') ctl.stop();
        else ctl.start();
      },
      // Clear an error or notice from the screen.
      dismiss: function () {
        if (info.state === 'error') set('idle');
        else if (info.state === 'idle' && info.message) set('idle');
      },
      destroy: function () {
        if (dead) return;
        dead = true;
        want = false;
        clearStopTimer();
        try { if (engine.abort) engine.abort(); } catch (e) { /* ignore */ }
        engine.onstart = engine.onresult = engine.onerror = engine.onend = null;
      }
    };
    return ctl;
  }

  // ---------------------------------------------------------------- the button

  var CSS = [
    '.soma-speech{position:relative;display:inline-flex;align-items:center;vertical-align:middle;',
    'font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--soma-speech-accent:#d93025}',
    '.soma-speech-btn{box-sizing:border-box;position:relative;width:40px;height:40px;min-width:40px;margin:0 0 0 6px;padding:0;',
    'display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(128,128,128,.6);',
    'border-radius:50%;background:transparent;color:inherit;cursor:pointer;font:inherit}',
    '.soma-speech-btn:hover{background:rgba(128,128,128,.16)}',
    '.soma-speech-btn:focus-visible{outline:2px solid #1a73e8;outline-offset:2px}',
    '.soma-speech-btn svg{width:20px;height:20px;display:block}',
    '.soma-speech-slash{display:none}',
    '.soma-speech[data-supported="false"] .soma-speech-btn{opacity:.55}',
    '.soma-speech[data-supported="false"] .soma-speech-slash{display:block}',
    '.soma-speech[data-state="starting"] .soma-speech-btn,.soma-speech[data-state="listening"] .soma-speech-btn{',
    'background:var(--soma-speech-accent);border-color:var(--soma-speech-accent);color:#fff}',
    '.soma-speech[data-state="listening"] .soma-speech-btn::after{content:"";position:absolute;inset:-5px;border-radius:50%;',
    'border:2px solid var(--soma-speech-accent);opacity:.7;animation:soma-speech-pulse 1.4s ease-out infinite}',
    '.soma-speech[data-state="stopping"] .soma-speech-btn{opacity:.65}',
    '.soma-speech[data-state="error"] .soma-speech-btn{border-color:#b06000;color:#b06000}',
    '.soma-speech-bubble{position:absolute;right:0;bottom:calc(100% + 8px);z-index:1000;box-sizing:border-box;',
    'width:max-content;max-width:min(22rem,80vw);padding:6px 10px;border-radius:8px;',
    'background:Canvas;color:CanvasText;border:1px solid rgba(128,128,128,.6);box-shadow:0 2px 10px rgba(0,0,0,.2);',
    'font-size:13px;pointer-events:none}',
    '.soma-speech-bubble[hidden]{display:none}',
    '.soma-speech[data-state="error"] .soma-speech-bubble{border-color:#b06000}',
    '.soma-speech-bubble em{font-style:italic}',
    '[data-soma-speech-state="listening"],[data-soma-speech-state="starting"]{box-shadow:0 0 0 2px rgba(217,48,37,.45)}',
    '@keyframes soma-speech-pulse{from{transform:scale(.9);opacity:.7}to{transform:scale(1.35);opacity:0}}',
    '@media (prefers-reduced-motion:reduce){.soma-speech-btn::after{animation:none!important}}'
  ].join('');

  function ensureStyle(doc) {
    if (doc.getElementById('soma-speech-style')) return;
    var style = doc.createElement('style');
    style.id = 'soma-speech-style';
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function micIcon(doc) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var mic = doc.createElementNS(ns, 'path');
    mic.setAttribute('fill', 'currentColor');
    mic.setAttribute('d', 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z');
    var slash = doc.createElementNS(ns, 'path');
    slash.setAttribute('class', 'soma-speech-slash');
    slash.setAttribute('d', 'M4 4l16 16');
    slash.setAttribute('stroke', 'currentColor');
    slash.setAttribute('stroke-width', '2.2');
    slash.setAttribute('stroke-linecap', 'round');
    svg.appendChild(mic);
    svg.appendChild(slash);
    return svg;
  }

  var TEXT_TYPES = { '': 1, text: 1, search: 1, url: 1, tel: 1 };

  function resolveElement(ref, doc) {
    if (!ref) return null;
    return typeof ref === 'string' ? doc.querySelector(ref) : ref;
  }

  // Add a mic button to a <textarea> or text <input>. Returns the instance.
  // options: lang, mount (element or selector), engine (factory or engine object),
  //          onChange(info)
  function attach(ref, options) {
    var doc = (root && root.document) || null;
    if (!doc) throw new Error('SomaSpeech.attach needs a browser page');
    var opts = options || {};
    var el = resolveElement(ref, doc);
    if (!el) throw new Error('SomaSpeech.attach: no element found for ' + ref);
    if (el.__somaSpeech) return el.__somaSpeech;
    var isArea = el.tagName === 'TEXTAREA';
    var isInput = el.tagName === 'INPUT' &&
      Object.prototype.hasOwnProperty.call(TEXT_TYPES, (el.getAttribute('type') || '').toLowerCase());
    if (!isArea && !isInput) {
      throw new Error('SomaSpeech.attach: the target must be a <textarea> or a text <input>');
    }

    var engine = opts.engine;
    if (typeof engine === 'function') engine = engine();
    if (!engine) engine = createBrowserEngine();

    ensureStyle(doc);
    var lang = opts.lang || el.getAttribute('lang') || doc.documentElement.lang ||
      (root.navigator && root.navigator.language) || 'en-US';

    var wrap = doc.createElement('span');
    wrap.className = 'soma-speech';
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'soma-speech-btn';
    btn.appendChild(micIcon(doc));
    var bubble = doc.createElement('span');
    bubble.className = 'soma-speech-bubble';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    bubble.hidden = true;
    wrap.appendChild(btn);
    wrap.appendChild(bubble);

    var mount = resolveElement(opts.mount, doc);
    if (mount) mount.appendChild(wrap);
    else el.insertAdjacentElement('afterend', wrap);

    var target = domTarget(el);
    var noticeTimer = null;
    var ctl = null;

    function render(info) {
      var listening = info.state === 'starting' || info.state === 'listening';
      var supported = !!engine.supported;
      wrap.setAttribute('data-state', info.state);
      wrap.setAttribute('data-supported', supported ? 'true' : 'false');
      el.setAttribute('data-soma-speech-state', info.state);
      btn.setAttribute('aria-pressed', listening ? 'true' : 'false');
      var label = !supported ? unsupportedMessage()
        : listening ? 'Stop voice typing' : 'Start voice typing (Esc stops)';
      btn.setAttribute('aria-label', label);
      btn.title = label;

      var text = '';
      var italic = false;
      if (info.state === 'starting') text = 'Starting. If the browser asks, allow the microphone.';
      else if (info.state === 'listening') {
        if (info.interim) {
          text = info.interim.length > 90 ? '…' + info.interim.slice(-90) : info.interim;
          italic = true;
        } else text = 'Listening. Speak now. Click the mic or press Esc to stop.';
      } else if (info.state === 'stopping') text = 'Finishing…';
      else if (info.message) text = info.message;

      bubble.textContent = '';
      if (text) {
        if (italic) {
          var em = doc.createElement('em');
          em.textContent = text;
          bubble.appendChild(em);
        } else bubble.textContent = text;
      }
      bubble.hidden = !text;

      if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
      if (info.message && (info.state === 'error' || info.state === 'idle')) {
        noticeTimer = setTimeout(function () { noticeTimer = null; if (ctl) ctl.dismiss(); }, NOTICE_MS);
      }

      if (opts.onChange) opts.onChange(info);
      try {
        el.dispatchEvent(new root.CustomEvent('soma-speech-state', { bubbles: true, detail: info }));
      } catch (e) { /* old browsers without CustomEvent constructors */ }
    }

    ctl = createController({ engine: engine, target: target, lang: lang, onChange: render });

    // The button must not take focus from the box, or the cursor position is lost.
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function () { ctl.toggle(); });

    function onKey(e) {
      if (e.key === 'Escape' && (ctl.state === 'listening' || ctl.state === 'starting')) ctl.stop();
    }
    function onHidden() {
      if (doc.hidden && (ctl.state === 'listening' || ctl.state === 'starting')) ctl.stop();
    }
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('visibilitychange', onHidden);

    var instance = {
      element: wrap,
      button: btn,
      controller: ctl,
      engine: engine,
      get state() { return ctl.state; },
      start: function () { ctl.start(); },
      stop: function () { ctl.stop(); },
      toggle: function () { ctl.toggle(); },
      destroy: function () {
        ctl.destroy();
        target.destroy();
        if (noticeTimer) clearTimeout(noticeTimer);
        doc.removeEventListener('keydown', onKey, true);
        doc.removeEventListener('visibilitychange', onHidden);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        el.removeAttribute('data-soma-speech-state');
        delete el.__somaSpeech;
      }
    };
    el.__somaSpeech = instance;
    render(ctl.info);
    return instance;
  }

  // ---------------------------------------------------------------- script-tag setup

  function warn(msg) {
    if (root && root.console && root.console.warn) root.console.warn('[soma-speech] ' + msg);
  }

  function attachSafely(el, source) {
    try {
      attach(el, {
        lang: source.getAttribute('data-lang') || undefined,
        mount: source.getAttribute('data-mount') || undefined
      });
    } catch (e) { warn(e.message); }
  }

  // <script data-target="#a, #b"> and <textarea data-soma-speech> both work.
  function autoAttach(script) {
    var doc = root.document;
    function run() {
      var selector = script && script.getAttribute('data-target');
      if (selector) {
        var found = doc.querySelectorAll(selector);
        if (!found.length) warn('no element matches data-target="' + selector + '". Call SomaSpeech.attach() once it exists.');
        for (var i = 0; i < found.length; i++) attachSafely(found[i], script);
      }
      var marked = doc.querySelectorAll('[data-soma-speech]');
      for (var j = 0; j < marked.length; j++) attachSafely(marked[j], marked[j]);
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run);
    else run();
  }

  // ---------------------------------------------------------------- export

  var api = {
    version: VERSION,
    attach: attach,
    autoAttach: autoAttach,
    computeInsert: computeInsert,
    createController: createController,
    createBrowserEngine: createBrowserEngine,
    domTarget: domTarget,
    friendlyError: friendlyError,
    engines: { browser: createBrowserEngine }
  };

  if (typeof module === 'object' && module && module.exports) module.exports = api;

  if (root && root.document) {
    if (root.SomaSpeech && root.SomaSpeech.version) api = root.SomaSpeech;   // loaded twice: keep the first
    else root.SomaSpeech = api;
    var self = root.document.currentScript;
    if (self && self.getAttribute && self.getAttribute('data-target') !== null) api.autoAttach(self);
    else if (root.document.querySelector('[data-soma-speech]')) api.autoAttach(null);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
