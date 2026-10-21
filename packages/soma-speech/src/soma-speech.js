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
 *   An engine may also call onnotice(text) to tell the person something while it
 *   is listening (for example "using standard voice instead").
 *
 * Two voices (version 2) — the app builder chooses, the person just sees a mic
 *   voice: 'standard' (default) uses the browser's engine. voice: 'punctuated'
 *   (data-voice="punctuated") uses ElevenLabs Scribe v2 Realtime, which adds
 *   punctuation and capital letters and decides where sentences end. It needs
 *   scribe: { tokenUrl } (data-scribe-token-url), the address of a token
 *   endpoint on your server. If Punctuated cannot start for someone (not signed
 *   in, daily limit, offline), their mic uses Standard and says so. See
 *   DESIGN-v2.md and server/speech-token.js.
 *
 * Written 2026-10-21 (Mike Wolf; Claude Sonnet 5.5, CCc) for SOMA Studio's chat
 * box, reusable by PlayMaker and any SOMA app. Beads sp-hih (v1), sp-zu0 (v2).
 */
(function (root) {
  'use strict';

  var VERSION = '2.0.0';
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
      case 'scribe-unavailable':
        if (message === 'not-signed-in') return 'Punctuated voice needs you to be signed in.';
        if (message === 'capped') return "Today's limit for punctuated voice has been used.";
        if (message === 'network') return "Punctuated voice couldn't connect. Check your internet connection.";
        return 'Punctuated voice is not available right now.';
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

  // ---------------------------------------------------------------- the Scribe engine (punctuated voice)

  var SCRIBE_URL = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';
  var SCRIBE_RATE = 16000;
  var CHUNK_SAMPLES = 1600;      // 100 ms of audio per message
  var QUEUE_LIMIT = 100;         // audio held while the socket opens: 10 seconds
  var COMMIT_WAIT_MS = 2500;     // how long stop() waits for the last committed text
  // Messages from Scribe that are not failures.
  var SCRIBE_QUIET = { warning: 1, commit_throttled: 1, insufficient_audio_activity: 1 };
  var SCRIBE_FAILURE = /error|exceeded|rate_limited|resource_exhausted|queue_overflow|unaccepted|invalid_request|throttled/;

  // Box-filter downsampler: Float32 samples at inRate in, Int16 samples at outRate out.
  // Streaming: call push() with each buffer in turn; the position carries over.
  function makeResampler(inRate, outRate) {
    var ratio = Math.max(1, inRate / outRate);
    var pos = 0;                 // input samples consumed so far
    var edge = ratio;            // where the current output sample ends
    var acc = 0;
    var weight = 0;
    function toInt16(v) {
      v = Math.max(-1, Math.min(1, v));
      return Math.round(v < 0 ? v * 32768 : v * 32767);
    }
    return {
      push: function (input) {
        var out = [];
        for (var i = 0; i < input.length; i++) {
          var s = input[i];
          var from = pos;
          var to = pos + 1;
          pos = to;
          while (to > edge + 1e-9) {            // this sample straddles the end of an output sample
            var part = edge - from;
            acc += s * part;
            weight += part;
            out.push(toInt16(acc / weight));
            from = edge;
            edge += ratio;
            acc = 0;
            weight = 0;
          }
          acc += s * (to - from);
          weight += to - from;
          if (Math.abs(to - edge) < 1e-9) {
            out.push(toInt16(acc / weight));
            edge += ratio;
            acc = 0;
            weight = 0;
          }
        }
        return out;
      }
    };
  }

  function toBase64(int16) {
    var bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    var text = '';
    for (var i = 0; i < bytes.length; i += 0x2000) {
      text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x2000));
    }
    return btoa(text);
  }

  // Runs in an audio worklet: hands the main thread 2048 samples at a time.
  var WORKLET_SOURCE =
    'class C extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(2048);this.n=0}' +
    'process(i){var c=i[0]&&i[0][0];if(!c)return true;' +
    'for(var k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===2048){this.port.postMessage(this.b.slice(0));this.n=0}}' +
    'return true}}registerProcessor("soma-speech-capture",C)';

  // Opens the microphone and hands 100 ms chunks of 16 kHz Int16 audio to onChunk.
  // Called straight from the click so the browser still counts it as a user gesture
  // (Safari keeps an audio context suspended otherwise).
  function openMic(onChunk, o) {
    var getStream = o && o.getStream ? o.getStream : function () {
      return root.navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    };
    var AudioCtx = root.AudioContext || root.webkitAudioContext;
    var ctx = new AudioCtx();
    var streamPromise;
    try { streamPromise = Promise.resolve(getStream()); } catch (e) { streamPromise = Promise.reject(e); }
    return streamPromise.then(function (stream) {
      var resampler = makeResampler(ctx.sampleRate, SCRIBE_RATE);
      var pending = [];
      var stopped = false;
      var undo = [];
      function feed(floats) {
        if (stopped) return;
        var ints = resampler.push(floats);
        for (var i = 0; i < ints.length; i++) pending.push(ints[i]);
        while (pending.length >= CHUNK_SAMPLES) onChunk(Int16Array.from(pending.splice(0, CHUNK_SAMPLES)));
      }
      var source = ctx.createMediaStreamSource(stream);
      var ready;
      if (ctx.audioWorklet && root.Blob && root.URL && root.AudioWorkletNode) {
        var url = root.URL.createObjectURL(new root.Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
        ready = ctx.audioWorklet.addModule(url).then(function () {
          root.URL.revokeObjectURL(url);
          var node = new root.AudioWorkletNode(ctx, 'soma-speech-capture');
          node.port.onmessage = function (e) { feed(e.data); };
          source.connect(node);
          undo.push(function () { node.port.onmessage = null; source.disconnect(node); });
        });
      } else {
        ready = Promise.reject(new Error('no audio worklet'));
      }
      return ready.catch(function () {
        // ScriptProcessor is deprecated but works everywhere an audio worklet does not.
        var node = ctx.createScriptProcessor(4096, 1, 1);
        var mute = ctx.createGain();
        mute.gain.value = 0;
        node.onaudioprocess = function (e) { feed(new Float32Array(e.inputBuffer.getChannelData(0))); };
        source.connect(node);
        node.connect(mute);
        mute.connect(ctx.destination);
        undo.push(function () { node.onaudioprocess = null; source.disconnect(node); node.disconnect(); mute.disconnect(); });
      }).then(function () {
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        return {
          stop: function () {
            if (stopped) return;
            if (pending.length) onChunk(Int16Array.from(pending));   // the last words, under 100 ms
            pending = [];
            stopped = true;
            undo.forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
            stream.getTracks().forEach(function (t) { t.stop(); });
            try { ctx.close(); } catch (e) { /* ignore */ }
          }
        };
      });
    }, function (err) {
      try { ctx.close(); } catch (e) { /* ignore */ }
      throw err;
    });
  }

  function scribeProblem(reason, detail) {
    return { code: 'scribe-unavailable', message: reason, detail: detail };
  }

  function micProblem(err) {
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') return { code: 'not-allowed' };
    return { code: 'audio-capture', message: err && err.message };
  }

  // ElevenLabs Scribe v2 Realtime over a WebSocket. The page never sees the API
  // key: it asks opts.tokenUrl (server/speech-token.js) for a single-use token.
  // Options: tokenUrl, getHeaders() (sign-in headers for the token call),
  //   commit 'vad' (default) or 'manual', silenceSeconds (vad, default 3),
  //   languageCode (default: Scribe detects it), idleSeconds (default 30),
  //   getStream() (a MediaStream, for tests and demos), and test hooks:
  //   WebSocket, fetch, openAudio, timers, wsUrl.
  function createScribeEngine(opts) {
    opts = opts || {};
    var WS = opts.WebSocket || root.WebSocket;
    var doFetch = opts.fetch || (root.fetch ? root.fetch.bind(root) : null);
    var openAudio = opts.openAudio || openMic;
    var nav = root.navigator;
    var haveMic = !!(opts.openAudio ||
      (nav && nav.mediaDevices && nav.mediaDevices.getUserMedia && (root.AudioContext || root.webkitAudioContext)));
    var secure = !(root && root.isSecureContext === false);
    var manual = opts.commit === 'manual';
    var silence = opts.silenceSeconds || 3;
    var idleMs = (opts.idleSeconds === undefined ? 30 : opts.idleSeconds) * 1000;
    var timers = opts.timers || {
      set: function (fn, ms) { return setTimeout(fn, ms); },
      clear: function (t) { clearTimeout(t); }
    };
    var sess = null;

    var engine = {
      name: 'scribe',
      supported: !!(opts.tokenUrl && WS && doFetch && haveMic && secure),
      onstart: null, onresult: null, onerror: null, onend: null, onnotice: null,

      start: function (o) {
        if (sess) return;
        var s = sess = {
          ws: null, audio: null, queue: [], open: false, started: false,
          stopping: false, awaitingCommit: false, dead: false, ended: false, idle: null, endTimer: null
        };
        var audioPromise;
        try {
          audioPromise = Promise.resolve(openAudio(function (chunk) { onChunk(s, chunk); }, opts));
        } catch (e) { audioPromise = Promise.reject(e); }
        audioPromise.then(function (a) {
          if (s.dead || s.stopping) a.stop();
          else s.audio = a;
        }, function (err) { fail(s, micProblem(err)); });
        getToken().then(function (token) {
          if (!s.dead) connect(s, token);
        }, function (err) { fail(s, err); });
      },

      stop: function () {
        var s = sess;
        if (!s || s.dead || s.stopping) return;
        stopping(s);
      },

      abort: function () {
        var s = sess;
        if (!s) return;
        s.dead = true;
        if (engine.onerror) engine.onerror({ code: 'aborted' });
        finish(s);
      }
    };

    function getToken() {
      var headers;
      try { headers = opts.getHeaders ? opts.getHeaders() : (root.somaSpeechAuthHeader ? root.somaSpeechAuthHeader() : {}); } catch (e) { headers = {}; }
      return Promise.resolve(headers).then(function (h) {
        return doFetch(opts.tokenUrl, {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, h || {})
        });
      }).then(function (res) {
        if (res.status === 401 || res.status === 403) throw scribeProblem('not-signed-in');
        if (res.status === 429) throw scribeProblem('capped');
        if (!res.ok) throw scribeProblem('service', 'HTTP ' + res.status);
        return res.json();
      }).then(function (body) {
        if (!body || !body.token) throw scribeProblem('service', 'no token');
        return body.token;
      }, function (err) {
        throw err && err.code === 'scribe-unavailable' ? err : scribeProblem('network', err && err.message);
      });
    }

    function connect(s, token) {
      var url = (opts.wsUrl || SCRIBE_URL) +
        '?model_id=scribe_v2_realtime&audio_format=pcm_16000' +
        '&commit_strategy=' + (manual ? 'manual' : 'vad') +
        (manual ? '' : '&vad_silence_threshold_secs=' + silence) +
        (opts.languageCode ? '&language_code=' + encodeURIComponent(opts.languageCode) : '') +
        '&token=' + encodeURIComponent(token);
      var ws;
      try { ws = new WS(url); } catch (e) { fail(s, scribeProblem('network', e && e.message)); return; }
      s.ws = ws;
      ws.onopen = function () {
        if (s.dead) return;
        s.open = true;
        while (s.queue.length) send(s, s.queue.shift());
      };
      ws.onmessage = function (ev) { if (!s.dead) onMessage(s, ev); };
      ws.onerror = function () { if (!s.dead && !s.started) fail(s, scribeProblem('network')); };
      ws.onclose = function () {
        if (s.dead) return;
        if (!s.started && !s.stopping) fail(s, scribeProblem('network'));
        else finish(s);                       // the server ended the session; the controller may restart it
      };
    }

    function send(s, chunk, commit) {
      var msg = { message_type: 'input_audio_chunk', audio_base_64: chunk ? toBase64(chunk) : '', sample_rate: SCRIBE_RATE };
      if (commit) msg.commit = true;
      try { s.ws.send(JSON.stringify(msg)); } catch (e) { /* the close handler reports it */ }
    }

    function onChunk(s, chunk) {
      if (s.dead || s.stopping) return;
      if (s.open) send(s, chunk);
      else {
        s.queue.push(chunk);                  // the socket is still opening; keep the first words
        if (s.queue.length > QUEUE_LIMIT) s.queue.shift();
      }
    }

    function onMessage(s, ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      var type = m && m.message_type;
      if (type === 'session_started') {
        s.started = true;
        armIdle(s);
        if (engine.onstart) engine.onstart();
      } else if (type === 'partial_transcript') {
        if (m.text) armIdle(s);
        if (engine.onresult) engine.onresult({ type: 'interim', text: m.text || '' });
      } else if (type === 'committed_transcript') {
        if (clean(m.text)) {
          armIdle(s);
          if (engine.onresult) {
            engine.onresult({ type: 'final', text: m.text });
            engine.onresult({ type: 'interim', text: '' });
          }
        }
        if (s.awaitingCommit) finish(s);
      } else if (type === 'session_time_limit_exceeded') {
        finish(s);
      } else if (SCRIBE_QUIET[type]) {
        if (s.awaitingCommit) finish(s);      // nothing to commit: the wait is over
      } else if (type && SCRIBE_FAILURE.test(type)) {
        fail(s, scribeProblem('service', m.error || type));
      }
    }

    // Ask Scribe for the text it is still holding, then end once it arrives.
    function stopping(s) {
      clearTimer(s, 'idle');
      if (s.audio) { s.audio.stop(); s.audio = null; }   // sends the last words first
      s.stopping = true;
      if (s.ws && s.open) {
        send(s, null, true);
        s.awaitingCommit = true;
        s.endTimer = timers.set(function () { finish(s); }, COMMIT_WAIT_MS);
      } else finish(s);                       // never connected: nothing to wait for
    }

    function armIdle(s) {
      clearTimer(s, 'idle');
      if (idleMs > 0 && !s.stopping) s.idle = timers.set(function () { if (!s.dead && !s.stopping) stopping(s); }, idleMs);
    }

    function clearTimer(s, name) {
      if (s[name] !== null) { timers.clear(s[name]); s[name] = null; }
    }

    function teardown(s) {
      clearTimer(s, 'idle');
      clearTimer(s, 'endTimer');
      if (s.audio) { try { s.audio.stop(); } catch (e) { /* ignore */ } s.audio = null; }
      if (s.ws) {
        var ws = s.ws;
        s.ws = null;
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        try { ws.close(); } catch (e) { /* ignore */ }
      }
    }

    function finish(s) {
      if (s.ended) return;
      s.ended = true;
      s.dead = true;
      teardown(s);
      if (sess === s) sess = null;
      if (engine.onend) engine.onend();
    }

    function fail(s, problem) {
      if (s.dead) return;
      s.dead = true;
      teardown(s);
      if (engine.onerror) engine.onerror({ code: problem.code, message: problem.message, detail: problem.detail });
      finish(s);
    }

    return engine;
  }

  // ---------------------------------------------------------------- the person's choice

  // Presents the browser engine and the Scribe engine as one engine. The person's
  // choice (getChoice) decides which one starts. If Scribe cannot start, the
  // browser engine starts instead and the person is told why.
  function createChoiceEngine(o) {
    var browser = o.browser;
    var scribe = o.scribe;
    var current = null;
    var started = false;

    var choice = {
      name: 'choice',
      get supported() { return !!(browser.supported || scribe.supported); },
      onstart: null, onresult: null, onerror: null, onend: null, onnotice: null,
      start: function (opts) {
        var wantsScribe = o.getChoice() === 'scribe';
        if (wantsScribe && !scribe.supported && browser.supported) {
          notice('Punctuated voice is not available here, so standard voice is being used.');
        }
        var useScribe = scribe.supported && (wantsScribe || !browser.supported);
        begin(useScribe ? scribe : browser, opts);
      },
      stop: function () { if (current) current.stop(); },
      abort: function () { if (current && current.abort) current.abort(); }
    };

    function notice(text) { if (choice.onnotice) choice.onnotice(text); }

    function begin(engine, opts) {
      current = engine;
      started = false;
      engine.onstart = function () { if (current === engine) { started = true; if (choice.onstart) choice.onstart(); } };
      engine.onresult = function (r) { if (current === engine && choice.onresult) choice.onresult(r); };
      engine.onend = function () { if (current === engine && choice.onend) choice.onend(); };
      engine.onnotice = function (t) { if (current === engine) notice(t); };
      engine.onerror = function (e) {
        if (current !== engine) return;
        if (engine === scribe && e && e.code === 'scribe-unavailable' && !started && browser.supported) {
          notice(friendlyError('scribe-unavailable', e.message) + ' Using standard voice.');
          engine.onstart = engine.onresult = engine.onerror = engine.onend = engine.onnotice = null;
          begin(browser, opts);               // the failed session's own end is ignored
          return;
        }
        if (choice.onerror) choice.onerror(e);
      };
      engine.start(opts);
    }

    return choice;
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
    var info = { state: 'idle', interim: '', code: '', message: '', notice: '' };
    var want = false;          // the person wants listening to continue
    var gotResult = false;     // this engine session produced words
    var emptyCycles = 0;       // sessions in a row that produced none
    var stopTimer = null;
    var dead = false;

    function snapshot() {
      return { state: info.state, interim: info.interim, code: info.code, message: info.message, notice: info.notice };
    }
    function emit() {
      if (o.onChange) o.onChange(snapshot());
    }
    function set(state, interim, code, message) {
      info.state = state;
      info.interim = interim || '';
      info.code = code || '';
      info.message = message || '';
      // A notice ("using standard voice") lives only while listening.
      if (state !== 'starting' && state !== 'listening') info.notice = '';
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
    engine.onnotice = function (text) {
      if (dead) return;
      info.notice = clean(text);
      emit();
    };
    engine.onresult = function (ev) {
      if (dead || !ev) return;
      if (clean(ev.text)) info.notice = '';
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
      get info() { return snapshot(); },
      start: function () {
        if (dead) return;
        if (info.state === 'starting' || info.state === 'listening' || info.state === 'stopping') return;
        if (!engine || !engine.supported) { fail('unsupported'); return; }
        if (target.isLocked && target.isLocked()) { fail('read-only'); return; }
        if (target.prepare) target.prepare();
        want = true;
        emptyCycles = 0;
        info.notice = '';
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
        engine.onstart = engine.onresult = engine.onerror = engine.onend = engine.onnotice = null;
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
  // options: lang, mount (element or selector), onChange(info),
  //   voice ('standard' | 'punctuated': the app builder's choice of voice; default 'standard'),
  //   scribe ({ tokenUrl, getHeaders, ... }: what 'punctuated' needs),
  //   engine (factory or engine object: your own engine, instead of either voice),
  //   browserEngine (an engine to use as "standard", for tests).
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
    var voice = 'standard';
    if (!engine && opts.voice === 'punctuated') {
      if (opts.scribe && opts.scribe.tokenUrl) {
        voice = 'punctuated';
        // The builder chose Punctuated. If it cannot start for this person, the mic
        // uses Standard and says why, so they are never left with a dead button.
        engine = createChoiceEngine({
          browser: opts.browserEngine || createBrowserEngine(),
          scribe: createScribeEngine(opts.scribe),
          getChoice: function () { return 'scribe'; }
        });
      } else {
        warn("voice: 'punctuated' needs scribe.tokenUrl (the address of your token endpoint). Using standard voice.");
      }
    }
    if (!engine) engine = opts.browserEngine || createBrowserEngine();

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
      wrap.setAttribute('data-voice', voice);
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
      if (info.notice && listening && !info.interim) { text = info.notice; italic = false; }

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
      if (e.key !== 'Escape') return;
      if (ctl.state === 'listening' || ctl.state === 'starting') ctl.stop();
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
      get voice() { return voice; },
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
    var tokenUrl = source.getAttribute('data-scribe-token-url');
    try {
      attach(el, {
        lang: source.getAttribute('data-lang') || undefined,
        mount: source.getAttribute('data-mount') || undefined,
        voice: source.getAttribute('data-voice') || undefined,
        scribe: tokenUrl ? { tokenUrl: tokenUrl } : undefined
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
    createScribeEngine: createScribeEngine,
    createChoiceEngine: createChoiceEngine,
    makeResampler: makeResampler,
    toBase64: toBase64,
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
