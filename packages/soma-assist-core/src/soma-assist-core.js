(function (global) {
  'use strict';

  var CORE_CSS = __SOMA_ASSIST_CSS_JSON__;
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
      '    <button class="assist-feedback-btn" data-assist-feedback type="button" aria-label="Send feedback" title="Send feedback">✎</button>',
      '    <button class="assist-minimize" data-assist-minimize type="button" aria-label="Minimize">−</button>',
      '  </header>',
      '  <ol class="assist-messages" data-assist-messages aria-live="polite"></ol>',
      '  <form class="assist-feedback-form" data-assist-feedback-form hidden>',
      '    <label class="assist-feedback-label" for="assist-feedback-text-' + appId + '">Feedback for the build queue</label>',
      '    <textarea id="assist-feedback-text-' + appId + '" class="assist-feedback-input" data-assist-feedback-input rows="3" placeholder="Describe a bug or improvement…"></textarea>',
      '    <div class="assist-feedback-actions">',
      '      <button type="button" class="assist-feedback-cancel" data-assist-feedback-cancel>Cancel</button>',
      '      <button type="submit" class="assist-feedback-submit" data-assist-feedback-submit>Submit feedback</button>',
      '    </div>',
      '  </form>',
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
    var feedbackBtn = shadow.querySelector('[data-assist-feedback]');
    var feedbackForm = shadow.querySelector('[data-assist-feedback-form]');
    var feedbackInput = shadow.querySelector('[data-assist-feedback-input]');
    var feedbackCancel = shadow.querySelector('[data-assist-feedback-cancel]');
    shadow.querySelector('.assist-chip-label').textContent = title;
    shadow.querySelector('.assist-title').textContent = title;
    shadow.querySelector('[data-assist-chip-avatar]').appendChild(avatarMarkup(options.avatar));
    shadow.querySelector('[data-assist-header-avatar]').appendChild(avatarMarkup(options.avatar));

    var store = storageFor(appId);
    var geometry = normalizeGeometry(store.read());
    var opened = false;
    var destroyed = false;
    var gesture = null;
    var heartbeatClient = null;

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

    function setFeedbackOpen(open) {
      if (destroyed) return;
      feedbackForm.hidden = !open;
      form.hidden = !!open;
      if (open) {
        global.setTimeout(function () { if (!destroyed) feedbackInput.focus(); }, 0);
      } else {
        feedbackInput.value = '';
      }
    }

    function submitFeedback(text) {
      text = String(text || '').trim();
      if (!text) return Promise.resolve(null);
      setStatus('Submitting feedback…');
      var payload = {
        description: text,
        sourceApp: appId,
        appId: appId,
        pageContext: (global.location && global.location.href) || '',
        area: options.feedbackArea || title,
        type: 'feedback'
      };
      var handler = options.onFeedbackSubmit;
      var result;
      try {
        result = typeof handler === 'function' ? handler(payload, api) : null;
      } catch (err) {
        setStatus('Feedback failed');
        addMessage('Could not submit feedback: ' + (err && err.message ? err.message : err), 'system');
        return Promise.reject(err);
      }
      return Promise.resolve(result).then(function (value) {
        setFeedbackOpen(false);
        setStatus('Feedback submitted');
        var route = value && value.classification && value.classification.route;
        addMessage('Thanks — feedback filed' + (route ? ' → ' + route : '') + '.', 'system');
        return value;
      }).catch(function (err) {
        setStatus('Feedback failed');
        addMessage('Could not submit feedback: ' + (err && err.message ? err.message : err), 'system');
        throw err;
      });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      if (heartbeatClient && typeof heartbeatClient.stop === 'function') {
        try { heartbeatClient.stop(); } catch (_) {}
      }
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
    feedbackBtn.addEventListener('click', function (event) {
      event.stopPropagation();
      setFeedbackOpen(feedbackForm.hidden);
    });
    feedbackCancel.addEventListener('click', function () { setFeedbackOpen(false); });
    feedbackForm.addEventListener('submit', function (event) {
      event.preventDefault();
      submitFeedback(feedbackInput.value);
    });
    header.addEventListener('pointerdown', function (event) {
      if (event.target.closest('button')) return;
      onPointerDown(event, 'drag');
    });
    Array.prototype.forEach.call(shadow.querySelectorAll('[data-assist-resize]'), function (handle) {
      handle.addEventListener('pointerdown', function (event) { onPointerDown(event, 'resize', handle.getAttribute('data-edge')); });
    });
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
              if (typeof reply === 'string' && reply) addMessage(reply, 'assistant');
              setStatus('Ready');
            }).catch(function () { setStatus('Could not send'); });
          } else if (typeof result === 'string' && result) {
            addMessage(result, 'assistant');
          }
        } catch (_) { setStatus('Could not send'); }
      }
    });

    applyGeometry();
    var api = {
      open: open,
      close: close,
      addMessage: addMessage,
      setStatus: setStatus,
      destroy: destroy,
      openFeedback: function () { open(); setFeedbackOpen(true); },
      submitFeedback: submitFeedback
    };
    Object.defineProperty(api, 'element', { value: host });
    Object.defineProperty(api, 'shadowRoot', { value: shadow });
    host.__somaAssistApi = api;
    if (options.initialMessage) addMessage(options.initialMessage, 'assistant');

    // Optional fleet heartbeat: start on mount when supabase config is provided.
    if (options.heartbeat && global.SomaAssistHeartbeat && typeof global.SomaAssistHeartbeat.createHeartbeatClient === 'function') {
      try {
        heartbeatClient = global.SomaAssistHeartbeat.createHeartbeatClient({
          url: options.heartbeat.url,
          anonKey: options.heartbeat.anonKey,
          appId: options.heartbeat.appId || appId,
          version: options.heartbeat.version || options.version || '0.0.0',
          intervalMs: options.heartbeat.intervalMs,
          installUuid: options.heartbeat.installUuid,
          storage: options.heartbeat.storage,
          fetch: options.heartbeat.fetch,
          onError: options.heartbeat.onError
        });
        heartbeatClient.start();
        api.heartbeat = heartbeatClient;
      } catch (_) {
        /* heartbeat is best-effort */
      }
    }
    return api;
  }

  global.SomaAssistCore = Object.freeze({ createAssistChip: createAssistChip });
})(typeof globalThis !== 'undefined' ? globalThis : window);
