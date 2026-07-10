(function (global) {
  'use strict';

  var CORE_CSS = ":host { all: initial; color-scheme: light; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; }\n*, *::before, *::after { box-sizing: border-box; }\nbutton, textarea { font: inherit; }\n.assist-layer { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; }\n.assist-chip { position: fixed; right: 24px; bottom: 24px; display: flex; align-items: center; gap: 9px; min-height: 52px; max-width: min(260px, calc(100vw - 32px)); padding: 8px 17px 8px 9px; border: 1px solid rgba(255,255,255,.5); border-radius: 999px; background: linear-gradient(145deg, #183451, #0b1d30); color: #fff; box-shadow: 0 12px 34px rgba(8,25,43,.28); cursor: pointer; pointer-events: auto; transition: transform .16s ease, box-shadow .16s ease; }\n.assist-chip:hover { transform: translateY(-2px); box-shadow: 0 16px 40px rgba(8,25,43,.34); }\n.assist-chip:focus-visible, .assist-minimize:focus-visible, .assist-send:focus-visible, .assist-input:focus-visible { outline: 3px solid #e2ad4a; outline-offset: 2px; }\n.assist-chip[hidden], .assist-window[hidden] { display: none; }\n.assist-avatar { display: grid; place-items: center; width: 36px; height: 36px; flex: 0 0 36px; overflow: hidden; border-radius: 50%; background: #f0bd58; color: #10283f; font-size: 20px; font-weight: 750; }\n.assist-avatar img { width: 100%; height: 100%; object-fit: cover; }\n.assist-chip-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 680; }\n.assist-window { position: fixed; display: flex; flex-direction: column; width: 380px; height: 520px; min-width: 290px; min-height: 320px; overflow: hidden; border: 1px solid rgba(17,44,69,.16); border-radius: 18px; background: #f8fafc; color: #172434; box-shadow: 0 24px 70px rgba(6,22,38,.3); pointer-events: auto; }\n.assist-header { display: flex; align-items: center; gap: 10px; min-height: 62px; padding: 10px 10px 10px 13px; background: linear-gradient(135deg, #102c47, #173b5c); color: #fff; cursor: move; touch-action: none; user-select: none; }\n.assist-heading { min-width: 0; flex: 1; }\n.assist-title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 720; }\n.assist-status { display: block; margin-top: 2px; color: #b9cad9; font-size: 11px; }\n.assist-minimize, .assist-speaker { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 10px; background: rgba(255,255,255,.09); color: #fff; cursor: pointer; font-size: 22px; line-height: 1; }\n.assist-speaker { font-size: 16px; opacity: 0.6; }\n.assist-speaker[aria-pressed=\"true\"] { opacity: 1; background: rgba(255,255,255,.25); }\n.assist-minimize:hover, .assist-speaker:hover { background: rgba(255,255,255,.18); }\n.assist-speaker[hidden] { display: none !important; }\n.assist-messages { display: flex; flex: 1; flex-direction: column; gap: 10px; min-height: 0; margin: 0; padding: 16px; overflow: auto; list-style: none; }\n.assist-message { max-width: 84%; padding: 10px 12px; border-radius: 13px; font-size: 14px; line-height: 1.42; white-space: pre-wrap; overflow-wrap: anywhere; }\n.assist-message--assistant { align-self: flex-start; border: 1px solid #e2e8ee; border-bottom-left-radius: 4px; background: #fff; color: #27384a; }\n.assist-message--user { align-self: flex-end; border-bottom-right-radius: 4px; background: #173b5c; color: #fff; }\n.assist-message--system { align-self: center; max-width: 94%; padding: 4px 8px; background: transparent; color: #647487; font-size: 12px; text-align: center; }\n.assist-composer { display: flex; align-items: flex-end; gap: 8px; padding: 12px; border-top: 1px solid #e0e7ed; background: #fff; }\n.assist-input { flex: 1; min-height: 42px; max-height: 112px; resize: none; border: 1px solid #cbd6df; border-radius: 12px; padding: 10px 12px; background: #f8fafc; color: #172434; font-size: 14px; line-height: 20px; }\n.assist-input::placeholder { color: #778697; }\n.assist-send { width: 42px; height: 42px; flex: 0 0 42px; border: 0; border-radius: 12px; background: #e5ae44; color: #10283f; cursor: pointer; font-size: 19px; font-weight: 800; }\n.assist-send:hover { background: #efbd5b; }\n.assist-send:disabled { cursor: default; opacity: .55; }\n.assist-resize { position: absolute; z-index: 3; touch-action: none; }\n.assist-resize[data-edge=\"n\"] { top: -4px; left: 12px; right: 12px; height: 9px; cursor: ns-resize; }\n.assist-resize[data-edge=\"s\"] { bottom: -4px; left: 12px; right: 12px; height: 9px; cursor: ns-resize; }\n.assist-resize[data-edge=\"e\"] { top: 12px; right: -4px; bottom: 12px; width: 9px; cursor: ew-resize; }\n.assist-resize[data-edge=\"w\"] { top: 12px; left: -4px; bottom: 12px; width: 9px; cursor: ew-resize; }\n.assist-resize[data-edge=\"ne\"], .assist-resize[data-edge=\"nw\"], .assist-resize[data-edge=\"se\"], .assist-resize[data-edge=\"sw\"] { width: 18px; height: 18px; }\n.assist-resize[data-edge=\"ne\"] { top: -4px; right: -4px; cursor: nesw-resize; }\n.assist-resize[data-edge=\"nw\"] { top: -4px; left: -4px; cursor: nwse-resize; }\n.assist-resize[data-edge=\"se\"] { right: -4px; bottom: -4px; cursor: nwse-resize; }\n.assist-resize[data-edge=\"sw\"] { left: -4px; bottom: -4px; cursor: nesw-resize; }\n@media (max-width: 520px) { .assist-chip { right: 16px; bottom: 16px; } .assist-window { min-width: 260px; min-height: 280px; border-radius: 15px; } }\n@media (prefers-reduced-motion: reduce) { .assist-chip { transition: none; } }\n";
  var MIN_WIDTH = 290;
  var MIN_HEIGHT = 320;
  var VIEWPORT_GAP = 12;

  function safeId(value) {
    return String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  }

  function clamp(value, low, high) {
    return Math.min(Math.max(value, low), Math.max(low, high));
  }

  function viewport() {
    return {
      width: Math.max(320, global.innerWidth || 1024),
      height: Math.max(360, global.innerHeight || 768)
    };
  }

  function defaultGeometry() {
    var vp = viewport();
    var width = Math.min(380, vp.width - VIEWPORT_GAP * 2);
    var height = Math.min(520, vp.height - VIEWPORT_GAP * 2);
    return {
      x: Math.max(VIEWPORT_GAP, vp.width - width - 24),
      y: Math.max(VIEWPORT_GAP, vp.height - height - 24),
      width: width,
      height: height
    };
  }

  function normalizeGeometry(value) {
    var base = defaultGeometry();
    var vp = viewport();
    var width = clamp(Number(value && value.width) || base.width, Math.min(MIN_WIDTH, vp.width - VIEWPORT_GAP * 2), vp.width - VIEWPORT_GAP * 2);
    var height = clamp(Number(value && value.height) || base.height, Math.min(MIN_HEIGHT, vp.height - VIEWPORT_GAP * 2), vp.height - VIEWPORT_GAP * 2);
    var rawX = Number(value && value.x);
    var rawY = Number(value && value.y);
    return {
      x: clamp(Number.isFinite(rawX) && value ? rawX : base.x, VIEWPORT_GAP, vp.width - width - VIEWPORT_GAP),
      y: clamp(Number.isFinite(rawY) && value ? rawY : base.y, VIEWPORT_GAP, vp.height - height - VIEWPORT_GAP),
      width: width,
      height: height
    };
  }

  function storageFor(appId) {
    var key = 'soma-assist:' + appId + ':geometry';
    return {
      key: key,
      read: function () {
        try { return JSON.parse(global.localStorage.getItem(key) || 'null'); }
        catch (_) { return null; }
      },
      write: function (geometry) {
        try { global.localStorage.setItem(key, JSON.stringify(geometry)); }
        catch (_) {}
      }
    };
  }

  function avatarMarkup(avatar) {
    var value = avatar || '✦';
    if (/^(data:|https?:|chrome-extension:|moz-extension:|\/)/.test(value)) {
      var img = document.createElement('img');
      img.src = value;
      img.alt = '';
      return img;
    }
    return document.createTextNode(value);
  }

  function createAssistChip(options) {
    options = options || {};
    var appId = safeId(options.appId);
    if (!appId) throw new Error('createAssistChip requires a non-empty appId');
    if (typeof document === 'undefined') throw new Error('createAssistChip requires a DOM');

    var title = String(options.title || 'Assistant');
    var mount = options.mount || document.body || document.documentElement;
    var existing = document.querySelector('[data-soma-assist-host="' + appId + '"]');
    if (existing && existing.__somaAssistApi) return existing.__somaAssistApi;

    var host = document.createElement('div');
    host.setAttribute('data-soma-assist-host', appId);
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
    var shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = CORE_CSS;
    shadow.appendChild(style);

    var layer = document.createElement('div');
    layer.className = 'assist-layer';
    layer.innerHTML = [
      '<button class="assist-chip" type="button" data-assist-chip aria-expanded="false">',
      '  <span class="assist-avatar" data-assist-chip-avatar></span>',
      '  <span class="assist-chip-label"></span>',
      '</button>',
      '<section class="assist-window" data-assist-window role="dialog" aria-modal="false" hidden>',
      '  <header class="assist-header" data-assist-drag-handle>',
      '    <span class="assist-avatar" data-assist-header-avatar></span>',
      '    <span class="assist-heading"><span class="assist-title"></span><span class="assist-status" role="status">Ready</span></span>',
      '    <button class="assist-speaker" data-assist-speaker type="button" aria-label="Toggle speaker" aria-pressed="false" hidden>🔈</button>',
      '    <button class="assist-minimize" data-assist-minimize type="button" aria-label="Minimize">−</button>',
      '  </header>',
      '  <ol class="assist-messages" data-assist-messages aria-live="polite"></ol>',
      '  <form class="assist-composer" data-assist-composer>',
      '    <textarea class="assist-input" data-assist-input rows="1" aria-label="Message" placeholder="Type a message…"></textarea>',
      '    <button class="assist-send" data-assist-send type="submit" aria-label="Send message">↑</button>',
      '  </form>',
      ['n','s','e','w','ne','nw','se','sw'].map(function (edge) { return '<span class="assist-resize" data-assist-resize data-edge="' + edge + '"></span>'; }).join(''),
      '</section>'
    ].join('');
    shadow.appendChild(layer);
    mount.appendChild(host);

    var chip = shadow.querySelector('[data-assist-chip]');
    var win = shadow.querySelector('[data-assist-window]');
    var header = shadow.querySelector('[data-assist-drag-handle]');
    var input = shadow.querySelector('[data-assist-input]');
    var form = shadow.querySelector('[data-assist-composer]');
    var messages = shadow.querySelector('[data-assist-messages]');
    var status = shadow.querySelector('.assist-status');
    shadow.querySelector('.assist-chip-label').textContent = title;
    shadow.querySelector('.assist-title').textContent = title;
    shadow.querySelector('[data-assist-chip-avatar]').appendChild(avatarMarkup(options.avatar));
    shadow.querySelector('[data-assist-header-avatar]').appendChild(avatarMarkup(options.avatar));

    var store = storageFor(appId);
    var geometry = normalizeGeometry(store.read());
    var opened = false;
    var destroyed = false;
    var gesture = null;

    function applyGeometry() {
      geometry = normalizeGeometry(geometry);
      win.style.left = geometry.x + 'px';
      win.style.top = geometry.y + 'px';
      win.style.width = geometry.width + 'px';
      win.style.height = geometry.height + 'px';
    }

    function persist() { store.write(geometry); }

    function open() {
      if (destroyed) return;
      applyGeometry();
      opened = true;
      chip.hidden = true;
      chip.setAttribute('aria-expanded', 'true');
      win.hidden = false;
      global.setTimeout(function () { if (!destroyed) input.focus(); }, 0);
    }

    function close() {
      if (destroyed) return;
      opened = false;
      win.hidden = true;
      chip.hidden = false;
      chip.setAttribute('aria-expanded', 'false');
      chip.focus();
    }

    function addMessage(message, role) {
      if (destroyed || message == null) return null;
      if (typeof message === 'object') {
        role = message.role;
        message = message.text != null ? message.text : message.content;
      }
      role = role === 'user' || role === 'system' ? role : 'assistant';
      var item = document.createElement('li');
      item.className = 'assist-message assist-message--' + role;
      item.setAttribute('data-assist-message', role);
      item.textContent = String(message == null ? '' : message);
      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
      return item;
    }

    function setStatus(value) { if (!destroyed) status.textContent = String(value || ''); }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      global.removeEventListener('pointermove', onPointerMove);
      global.removeEventListener('pointerup', onPointerUp);
      global.removeEventListener('resize', onViewportResize);
      host.remove();
    }

    function onPointerDown(event, kind, edge) {
      if (event.button != null && event.button !== 0) return;
      gesture = {
        kind: kind,
        edge: edge || '',
        startX: event.clientX,
        startY: event.clientY,
        start: Object.assign({}, geometry)
      };
      if (event.currentTarget && event.currentTarget.setPointerCapture && event.pointerId != null) {
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
      }
      event.preventDefault();
    }

    function onPointerMove(event) {
      if (!gesture) return;
      var dx = event.clientX - gesture.startX;
      var dy = event.clientY - gesture.startY;
      var next = Object.assign({}, gesture.start);
      if (gesture.kind === 'drag') {
        next.x += dx;
        next.y += dy;
      } else {
        if (gesture.edge.indexOf('e') !== -1) next.width += dx;
        if (gesture.edge.indexOf('s') !== -1) next.height += dy;
        if (gesture.edge.indexOf('w') !== -1) { next.x += dx; next.width -= dx; }
        if (gesture.edge.indexOf('n') !== -1) { next.y += dy; next.height -= dy; }
      }
      geometry = normalizeGeometry(next);
      applyGeometry();
      event.preventDefault();
    }

    function onPointerUp() {
      if (!gesture) return;
      gesture = null;
      persist();
    }

    function onViewportResize() { geometry = normalizeGeometry(geometry); applyGeometry(); persist(); }

    chip.addEventListener('click', open);
    shadow.querySelector('[data-assist-minimize]').addEventListener('click', close);
    header.addEventListener('pointerdown', function (event) {
      if (event.target.closest('button')) return;
      onPointerDown(event, 'drag');
    });
    Array.prototype.forEach.call(shadow.querySelectorAll('[data-assist-resize]'), function (handle) {
      handle.addEventListener('pointerdown', function (event) { onPointerDown(event, 'resize', handle.getAttribute('data-edge')); });
    });

    var speakerStore = null;
    var speakerEnabled = false;
    var speakerBtn = shadow.querySelector('[data-assist-speaker]');
    var voiceConfig = options.voice || null;
    var ttsAudio = null;
    var ttsQueue = [];
    var ttsPlaying = false;

    if (voiceConfig && speakerBtn) {
      speakerStore = {
        key: 'soma-assist:' + appId + ':speaker',
        read: function () {
          try { return JSON.parse(global.localStorage.getItem(this.key) || 'false'); }
          catch (_) { return false; }
        },
        write: function (val) {
          try { global.localStorage.setItem(this.key, JSON.stringify(val)); }
          catch (_) {}
        }
      };
      speakerEnabled = !!speakerStore.read();
      speakerBtn.setAttribute('aria-pressed', speakerEnabled ? 'true' : 'false');
      speakerBtn.hidden = false;
      speakerBtn.addEventListener('click', function () {
        speakerEnabled = !speakerEnabled;
        speakerBtn.setAttribute('aria-pressed', speakerEnabled ? 'true' : 'false');
        speakerStore.write(speakerEnabled);
        if (!speakerEnabled && ttsAudio) {
          ttsAudio.pause();
          ttsAudio = null;
          ttsQueue = [];
          ttsPlaying = false;
        }
      });
    }

    function playNextTts() {
      if (!speakerEnabled || ttsPlaying || ttsQueue.length === 0 || !voiceConfig) return;
      var text = ttsQueue.shift();
      ttsPlaying = true;
      var url = (voiceConfig.proxyUrl || 'http://localhost:8888/.netlify/functions/el-proxy') + '?action=tts&app_id=' + encodeURIComponent(appId);
      if (voiceConfig.voiceId) url += '&voice_id=' + encodeURIComponent(voiceConfig.voiceId);
      
      global.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text })
      }).then(function(res) {
        if (!res.ok) throw new Error('TTS failed');
        return res.text();
      }).then(function(base64) {
        if (!speakerEnabled || destroyed) { ttsPlaying = false; return; }
        ttsAudio = new Audio('data:audio/mpeg;base64,' + base64);
        ttsAudio.onended = function() {
          ttsPlaying = false;
          playNextTts();
        };
        ttsAudio.onerror = function() {
          ttsPlaying = false;
          playNextTts();
        };
        ttsAudio.play().catch(function() {
          ttsPlaying = false;
          playNextTts();
        });
      }).catch(function(err) {
        console.error('TTS error', err);
        ttsPlaying = false;
        playNextTts();
      });
    }

    function queueTts(text) {
      if (speakerEnabled && voiceConfig) {
        ttsQueue.push(text);
        playNextTts();
      }
    }

    global.addEventListener('pointermove', onPointerMove);
    global.addEventListener('pointerup', onPointerUp);
    global.addEventListener('resize', onViewportResize);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      addMessage(text, 'user');
      if (typeof options.onUserMessage === 'function') {
        try {
          var result = options.onUserMessage(text, api);
          if (result && typeof result.then === 'function') {
            setStatus('Thinking…');
            Promise.resolve(result).then(function (reply) {
              if (typeof reply === 'string' && reply) {
                addMessage(reply, 'assistant');
                queueTts(reply);
              }
              setStatus('Ready');
            }).catch(function () { setStatus('Could not send'); });
          } else if (typeof result === 'string' && result) {
            addMessage(result, 'assistant');
            queueTts(result);
          }
        } catch (_) { setStatus('Could not send'); }
      }
    });

    applyGeometry();
    var originalClose = close;
    var api = { open: open, close: function() {
      if (ttsAudio) { ttsAudio.pause(); ttsAudio = null; }
      ttsQueue = [];
      ttsPlaying = false;
      originalClose();
    }, addMessage: addMessage, setStatus: setStatus, destroy: destroy };
    Object.defineProperty(api, 'element', { value: host });
    Object.defineProperty(api, 'shadowRoot', { value: shadow });
    host.__somaAssistApi = api;
    if (options.initialMessage) {
      addMessage(options.initialMessage, 'assistant');
      // queueTts(options.initialMessage); // Should it speak the initial message on reload? Probably not unless already open.
    }
    return api;
  }

  global.SomaAssistCore = Object.freeze({ createAssistChip: createAssistChip });
})(typeof globalThis !== 'undefined' ? globalThis : window);
