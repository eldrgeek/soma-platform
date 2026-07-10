/**
 * soma-assist-core — shared floating chip → chat window UI
 *
 * Vanilla JS, zero network deps. Renders inside Shadow DOM so host-page styles
 * cannot bleed in either direction. Works as:
 *   - MV3 content script injection
 *   - <script> embed on arbitrary sites
 *
 * Public API:
 *   createAssistChip({ appId, title, avatar, onUserMessage, mount, ... })
 *     → { open, close, addMessage, setStatus, destroy, isOpen, getMountEl, el }
 *
 * Storage keys (localStorage): soma-assist:<appId>:{x,y,w,h,open}
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var STORAGE_PREFIX = 'soma-assist:';
  var DEFAULT_W = 360;
  var DEFAULT_H = 480;
  var MIN_W = 280;
  var MIN_H = 300;
  var Z_INDEX = 2147483000;

  /* CSS is injected at build time via __SAC_CSS__ placeholder, or loaded from
   * a sibling style element / global when present. */
  var EMBEDDED_CSS = typeof __SAC_CSS__ !== 'undefined' ? __SAC_CSS__ : '';

  function storageKey(appId, leaf) {
    return STORAGE_PREFIX + String(appId || 'default') + ':' + leaf;
  }

  function lsGet(appId, leaf) {
    try {
      return localStorage.getItem(storageKey(appId, leaf));
    } catch (e) {
      return null;
    }
  }

  function lsSet(appId, leaf, value) {
    try {
      if (value == null || value === '') localStorage.removeItem(storageKey(appId, leaf));
      else localStorage.setItem(storageKey(appId, leaf), String(value));
    } catch (e) { /* private mode / blocked */ }
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function isAvatarUrl(avatar) {
    if (!avatar || typeof avatar !== 'string') return false;
    return /^(https?:|data:|chrome-extension:|moz-extension:|blob:|\/)/i.test(avatar);
  }

  function avatarHtml(avatar, className) {
    var a = avatar || '💬';
    if (isAvatarUrl(a)) {
      return '<span class="' + className + '"><img src="' + escapeAttr(a) + '" alt=""></span>';
    }
    return '<span class="' + className + '">' + escapeHtml(a) + '</span>';
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function resolveMount(mount) {
    if (!mount) {
      if (typeof document === 'undefined') return null;
      return document.body || document.documentElement;
    }
    if (typeof mount === 'function') return mount();
    if (typeof mount === 'string') return document.querySelector(mount);
    return mount;
  }

  function loadCssText(opts) {
    if (opts && opts.cssText) return opts.cssText;
    if (EMBEDDED_CSS) return EMBEDDED_CSS;
    if (typeof document !== 'undefined') {
      var el = document.querySelector('style[data-soma-assist-core], link[data-soma-assist-core]');
      if (el && el.tagName === 'STYLE') return el.textContent || '';
    }
    return '';
  }

  /**
   * @param {object} options
   * @param {string} options.appId           Storage namespace + host id
   * @param {string} [options.title]         Header + chip label
   * @param {string} [options.avatar]        Emoji or image URL
   * @param {function} [options.onUserMessage] (text, api) => void|Promise
   * @param {HTMLElement|string|function} [options.mount] Parent element
   * @param {string} [options.placeholder]   Input placeholder
   * @param {boolean} [options.open]         Start open
   * @param {boolean} [options.hideInput]    Hide built-in input (custom body)
   * @param {function} [options.renderBody]  (mountEl, api) => void — custom body
   * @param {object} [options.defaultSize]   { width, height }
   * @param {object} [options.defaultPosition] { left, top } or { right, bottom }
   * @param {string} [options.cssText]       Override embedded CSS
   * @param {string} [options.chipLabel]     Chip text (defaults to title)
   */
  function createAssistChip(options) {
    options = options || {};
    var appId = options.appId || 'default';
    var title = options.title || 'Assistant';
    var avatar = options.avatar || '💬';
    var onUserMessage = typeof options.onUserMessage === 'function' ? options.onUserMessage : null;
    var placeholder = options.placeholder || 'Type a message…';
    var chipLabel = options.chipLabel || title;
    var customBody = typeof options.renderBody === 'function' || options.hideInput === true;

    var parent = resolveMount(options.mount);
    if (!parent) {
      throw new Error('createAssistChip: no mount target (document.body missing?)');
    }

    /* Host element — light DOM anchor; all UI lives in shadow root */
    var host = document.createElement('div');
    host.className = 'soma-assist-host';
    host.setAttribute('data-soma-assist-app', appId);
    host.setAttribute('data-soma-assist-version', VERSION);
    host.style.cssText = 'all:initial;position:fixed;z-index:' + Z_INDEX + ';pointer-events:none;';

    var shadow;
    try {
      shadow = host.attachShadow({ mode: 'open' });
    } catch (e) {
      /* Extremely old browsers — fall back to light DOM isolation via host */
      shadow = host;
    }

    var styleEl = document.createElement('style');
    styleEl.textContent = loadCssText(options) + (options.extraCss ? ('\n' + options.extraCss) : '');
    shadow.appendChild(styleEl);

    var root = document.createElement('div');
    root.className = 'sac-root' + (customBody ? ' sac--custom-body' : '');
    root.setAttribute('data-app-id', appId);

    root.innerHTML = [
      '<button type="button" class="sac-chip" aria-label="Open ' + escapeAttr(title) + '" data-sac="chip">',
      avatarHtml(avatar, 'sac-chip-avatar'),
      '  <span class="sac-chip-label">' + escapeHtml(chipLabel) + '</span>',
      '</button>',
      '<div class="sac-window" role="dialog" aria-label="' + escapeAttr(title) + '" aria-hidden="true" data-sac="window">',
      '  <div class="sac-header" data-sac="header">',
      '    <div class="sac-header-persona">',
      avatarHtml(avatar, 'sac-header-avatar'),
      '      <span class="sac-header-title">' + escapeHtml(title) + '</span>',
      '    </div>',
      '    <div class="sac-header-actions">',
      '      <button type="button" class="sac-btn sac-btn-min" title="Minimize" aria-label="Minimize" data-sac="min">−</button>',
      '      <button type="button" class="sac-btn sac-btn-close" title="Close" aria-label="Close" data-sac="close">×</button>',
      '    </div>',
      '  </div>',
      '  <div class="sac-status" data-sac="status" hidden></div>',
      '  <div class="sac-body" data-sac="body">',
      '    <div class="sac-messages" role="log" aria-live="polite" data-sac="messages"></div>',
      '    <div class="sac-mount" data-sac="mount"></div>',
      '  </div>',
      customBody ? '' : (
        '  <div class="sac-input-bar" data-sac="input-bar">' +
        '    <input class="sac-input" type="text" placeholder="' + escapeAttr(placeholder) + '" aria-label="Message" data-sac="input">' +
        '    <button type="button" class="sac-send" aria-label="Send" data-sac="send">↑</button>' +
        '  </div>'
      ),
      '  <div class="sac-resize sac-resize-n" data-resize="n"></div>',
      '  <div class="sac-resize sac-resize-s" data-resize="s"></div>',
      '  <div class="sac-resize sac-resize-e" data-resize="e"></div>',
      '  <div class="sac-resize sac-resize-w" data-resize="w"></div>',
      '  <div class="sac-resize sac-resize-nw" data-resize="nw"></div>',
      '  <div class="sac-resize sac-resize-ne" data-resize="ne"></div>',
      '  <div class="sac-resize sac-resize-sw" data-resize="sw"></div>',
      '  <div class="sac-resize sac-resize-se" data-resize="se"></div>',
      '</div>'
    ].join('');

    shadow.appendChild(root);
    parent.appendChild(host);

    var $ = function (sel) { return root.querySelector(sel); };
    var chip = $('[data-sac="chip"]');
    var win = $('[data-sac="window"]');
    var header = $('[data-sac="header"]');
    var messagesEl = $('[data-sac="messages"]');
    var mountEl = $('[data-sac="mount"]');
    var statusEl = $('[data-sac="status"]');
    var inputEl = $('[data-sac="input"]');
    var sendBtn = $('[data-sac="send"]');
    var minBtn = $('[data-sac="min"]');
    var closeBtn = $('[data-sac="close"]');

    var state = {
      open: false,
      destroyed: false,
      width: (options.defaultSize && options.defaultSize.width) || DEFAULT_W,
      height: (options.defaultSize && options.defaultSize.height) || DEFAULT_H,
      left: null,
      top: null
    };

    var listeners = [];
    function on(target, type, handler, opts) {
      target.addEventListener(type, handler, opts);
      listeners.push({ target: target, type: type, handler: handler, opts: opts });
    }

    function applyGeometry() {
      /* Position the light-DOM host (fixed). Shadow root content is relative. */
      host.style.position = 'fixed';
      host.style.pointerEvents = 'none';
      host.style.zIndex = String(Z_INDEX);
      host.style.margin = '0';
      host.style.padding = '0';
      host.style.border = 'none';
      host.style.display = 'block';

      if (state.left != null && state.top != null) {
        host.style.left = Math.round(state.left) + 'px';
        host.style.top = Math.round(state.top) + 'px';
        host.style.right = 'auto';
        host.style.bottom = 'auto';
      } else {
        var right = (options.defaultPosition && options.defaultPosition.right != null)
          ? options.defaultPosition.right : 20;
        var bottom = (options.defaultPosition && options.defaultPosition.bottom != null)
          ? options.defaultPosition.bottom : 20;
        host.style.left = 'auto';
        host.style.top = 'auto';
        host.style.right = right + 'px';
        host.style.bottom = bottom + 'px';
      }

      if (state.open) {
        host.style.width = state.width + 'px';
        host.style.height = state.height + 'px';
        root.style.width = '100%';
        root.style.height = '100%';
        root.style.alignItems = 'stretch';
        win.style.width = '100%';
        win.style.height = '100%';
      } else {
        host.style.width = 'auto';
        host.style.height = 'auto';
        root.style.width = 'max-content';
        root.style.height = 'auto';
        root.style.alignItems = 'flex-end';
        win.style.width = state.width + 'px';
        win.style.height = state.height + 'px';
      }
    }

    function persist() {
      if (state.left != null) lsSet(appId, 'x', Math.round(state.left));
      if (state.top != null) lsSet(appId, 'y', Math.round(state.top));
      lsSet(appId, 'w', Math.round(state.width));
      lsSet(appId, 'h', Math.round(state.height));
      lsSet(appId, 'open', state.open ? '1' : '0');
    }

    function restore() {
      var x = lsGet(appId, 'x');
      var y = lsGet(appId, 'y');
      var w = lsGet(appId, 'w');
      var h = lsGet(appId, 'h');
      if (w) state.width = clamp(parseInt(w, 10) || DEFAULT_W, MIN_W, maxW());
      if (h) state.height = clamp(parseInt(h, 10) || DEFAULT_H, MIN_H, maxH());
      if (x != null && y != null && x !== '' && y !== '') {
        state.left = clamp(parseInt(x, 10) || 0, 0, Math.max(0, viewportW() - 40));
        state.top = clamp(parseInt(y, 10) || 0, 0, Math.max(0, viewportH() - 40));
      } else if (options.defaultPosition && options.defaultPosition.left != null) {
        state.left = options.defaultPosition.left;
        state.top = options.defaultPosition.top != null ? options.defaultPosition.top : 80;
      }
    }

    function viewportW() {
      return window.innerWidth || document.documentElement.clientWidth || 800;
    }
    function viewportH() {
      return window.innerHeight || document.documentElement.clientHeight || 600;
    }
    function maxW() { return Math.min(760, viewportW() - 16); }
    function maxH() { return viewportH() - 16; }

    function syncOpenClass() {
      if (state.open) {
        root.classList.add('sac--open');
        win.setAttribute('aria-hidden', 'false');
        chip.setAttribute('aria-expanded', 'true');
      } else {
        root.classList.remove('sac--open');
        win.setAttribute('aria-hidden', 'true');
        chip.setAttribute('aria-expanded', 'false');
      }
    }

    function captureHostRect() {
      var r = host.getBoundingClientRect();
      /* When using right/bottom, convert to left/top for drag consistency */
      if (state.left == null || state.top == null) {
        state.left = r.left;
        state.top = r.top;
      }
    }

    function open() {
      if (state.destroyed) return api;
      var wasOpen = state.open;
      state.open = true;
      syncOpenClass();
      applyGeometry();
      persist();
      if (inputEl) {
        setTimeout(function () { try { inputEl.focus(); } catch (e) {} }, 30);
      }
      if (!wasOpen && typeof options.onOpen === 'function') {
        try { options.onOpen(api); } catch (e) {}
      }
      return api;
    }

    function close() {
      if (state.destroyed) return api;
      var wasOpen = state.open;
      /* Anchor chip near where the window was */
      captureHostRect();
      var r = host.getBoundingClientRect();
      /* Keep left/top so chip appears where window bottom-right roughly was */
      state.left = Math.max(0, Math.min(r.left + r.width - 120, viewportW() - 120));
      state.top = Math.max(0, Math.min(r.top + r.height - 48, viewportH() - 48));
      state.open = false;
      syncOpenClass();
      applyGeometry();
      persist();
      if (wasOpen && typeof options.onClose === 'function') {
        try { options.onClose(api); } catch (e) {}
      }
      return api;
    }

    function addMessage(role, content) {
      if (state.destroyed || !messagesEl) return api;
      var r = role || 'assistant';
      if (r === 'bot' || r === 'assistant' || r === 'yeshie' || r === 'adrian') r = 'assistant';
      if (r === 'user' || r === 'human') r = 'user';
      if (r !== 'user' && r !== 'assistant' && r !== 'system') r = 'assistant';

      var div = document.createElement('div');
      div.className = 'sac-msg sac-msg--' + r;
      div.textContent = content == null ? '' : String(content);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return api;
    }

    function setStatus(text) {
      if (state.destroyed || !statusEl) return api;
      if (text == null || text === '') {
        statusEl.textContent = '';
        statusEl.hidden = true;
      } else {
        statusEl.textContent = String(text);
        statusEl.hidden = false;
      }
      return api;
    }

    function getMountEl() {
      return mountEl;
    }

    function destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      listeners.forEach(function (l) {
        try { l.target.removeEventListener(l.type, l.handler, l.opts); } catch (e) {}
      });
      listeners = [];
      if (host && host.parentNode) host.parentNode.removeChild(host);
    }

    function submit() {
      if (!inputEl) return;
      var text = (inputEl.value || '').trim();
      if (!text) return;
      inputEl.value = '';
      addMessage('user', text);
      if (onUserMessage) {
        try {
          var result = onUserMessage(text, api);
          if (result && typeof result.then === 'function') {
            setStatus('Thinking…');
            result.then(function () {
              setStatus('');
            }).catch(function (err) {
              setStatus('Error');
              addMessage('system', (err && err.message) || 'Something went wrong');
            });
          }
        } catch (err) {
          addMessage('system', (err && err.message) || 'Something went wrong');
        }
      }
    }

    /* ── Drag (header) ──────────────────────────────────────────────────── */
    var dragging = false, dragOx = 0, dragOy = 0;

    function dragDown(cx, cy) {
      captureHostRect();
      dragging = true;
      dragOx = cx - state.left;
      dragOy = cy - state.top;
      applyGeometry();
    }
    function dragMove(cx, cy) {
      if (!dragging) return;
      state.left = clamp(cx - dragOx, 0, viewportW() - 40);
      state.top = clamp(cy - dragOy, 0, viewportH() - 40);
      applyGeometry();
    }
    function dragUp() {
      if (!dragging) return;
      dragging = false;
      persist();
    }

    on(header, 'mousedown', function (e) {
      if (e.target.closest('button')) return;
      dragDown(e.clientX, e.clientY);
      e.preventDefault();
    });
    on(document, 'mousemove', function (e) { dragMove(e.clientX, e.clientY); });
    on(document, 'mouseup', dragUp);
    on(header, 'touchstart', function (e) {
      if (e.target.closest('button')) return;
      var t = e.touches[0];
      dragDown(t.clientX, t.clientY);
    }, { passive: true });
    on(document, 'touchmove', function (e) {
      if (!dragging) return;
      var t = e.touches[0];
      dragMove(t.clientX, t.clientY);
    }, { passive: true });
    on(document, 'touchend', dragUp);

    /* ── Resize ─────────────────────────────────────────────────────────── */
    var resizeActive = null; /* { edges, sx, sy, sw, sh, sl, st } */

    function resizeDown(edges, cx, cy) {
      captureHostRect();
      resizeActive = {
        edges: edges,
        sx: cx, sy: cy,
        sw: state.width, sh: state.height,
        sl: state.left, st: state.top
      };
      document.body.style.userSelect = 'none';
      applyGeometry();
    }
    function resizeMove(cx, cy) {
      if (!resizeActive) return;
      var dx = cx - resizeActive.sx;
      var dy = cy - resizeActive.sy;
      var edges = resizeActive.edges;
      var w = resizeActive.sw;
      var h = resizeActive.sh;
      var l = resizeActive.sl;
      var t = resizeActive.st;

      if (edges.indexOf('e') >= 0) w = resizeActive.sw + dx;
      if (edges.indexOf('s') >= 0) h = resizeActive.sh + dy;
      if (edges.indexOf('w') >= 0) {
        w = resizeActive.sw - dx;
        l = resizeActive.sl + dx;
      }
      if (edges.indexOf('n') >= 0) {
        h = resizeActive.sh - dy;
        t = resizeActive.st + dy;
      }

      w = clamp(w, MIN_W, maxW());
      h = clamp(h, MIN_H, maxH());

      /* Re-anchor when clamping left/top edges */
      if (edges.indexOf('w') >= 0) l = resizeActive.sl + (resizeActive.sw - w);
      if (edges.indexOf('n') >= 0) t = resizeActive.st + (resizeActive.sh - h);

      state.width = w;
      state.height = h;
      state.left = clamp(l, 0, viewportW() - 40);
      state.top = clamp(t, 0, viewportH() - 40);
      applyGeometry();
    }
    function resizeUp() {
      if (!resizeActive) return;
      resizeActive = null;
      document.body.style.userSelect = '';
      persist();
    }

    root.querySelectorAll('[data-resize]').forEach(function (handle) {
      var edges = handle.getAttribute('data-resize');
      on(handle, 'mousedown', function (e) {
        resizeDown(edges, e.clientX, e.clientY);
        e.preventDefault();
        e.stopPropagation();
      });
      on(handle, 'touchstart', function (e) {
        var t = e.touches[0];
        resizeDown(edges, t.clientX, t.clientY);
      }, { passive: true });
    });
    on(document, 'mousemove', function (e) { resizeMove(e.clientX, e.clientY); });
    on(document, 'mouseup', resizeUp);
    on(document, 'touchmove', function (e) {
      if (!resizeActive) return;
      var t = e.touches[0];
      resizeMove(t.clientX, t.clientY);
    }, { passive: true });
    on(document, 'touchend', resizeUp);

    /* ── Buttons / input ────────────────────────────────────────────────── */
    on(chip, 'click', function () { open(); });
    on(minBtn, 'click', function () { close(); });
    on(closeBtn, 'click', function () { close(); });

    if (sendBtn) on(sendBtn, 'click', submit);
    if (inputEl) {
      on(inputEl, 'keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submit();
        }
        e.stopPropagation();
      });
      /* Keep host page from seeing keystrokes while typing in the chip */
      on(inputEl, 'keyup', function (e) { e.stopPropagation(); });
      on(inputEl, 'keypress', function (e) { e.stopPropagation(); });
    }

    /* Stop pointer events on window from hitting the page underneath */
    on(win, 'mousedown', function (e) { e.stopPropagation(); });
    on(chip, 'mousedown', function (e) { e.stopPropagation(); });

    var api = {
      open: open,
      close: close,
      minimize: close,
      addMessage: addMessage,
      setStatus: setStatus,
      destroy: destroy,
      getMountEl: getMountEl,
      isOpen: function () { return !!state.open; },
      getState: function () {
        return {
          open: state.open,
          width: state.width,
          height: state.height,
          left: state.left,
          top: state.top,
          appId: appId
        };
      },
      el: host,
      shadowRoot: shadow === host ? null : shadow,
      version: VERSION
    };

    restore();
    applyGeometry();
    syncOpenClass();

    if (typeof options.renderBody === 'function') {
      options.renderBody(mountEl, api);
    }

    if (options.initialMessages && options.initialMessages.length) {
      options.initialMessages.forEach(function (m) {
        addMessage(m.role || m.type || 'assistant', m.content || m.text || '');
      });
    }

    var wantOpen = options.open;
    if (wantOpen == null) {
      /* Do not auto-restore open=true by default — chip is the resting state.
       * Callers can pass open:true or open:'restore'. */
      wantOpen = false;
    }
    if (wantOpen === 'restore') {
      wantOpen = lsGet(appId, 'open') === '1';
    }
    if (wantOpen) open();
    else {
      state.open = false;
      syncOpenClass();
      applyGeometry();
    }

    return api;
  }

  /* UMD export — prefer the explicit root passed into the IIFE (window in
   * browsers / jsdom). Avoid binding only to Node's globalThis when eval'd. */
  var exportObj = {
    createAssistChip: createAssistChip,
    VERSION: VERSION,
    STORAGE_PREFIX: STORAGE_PREFIX
  };

  if (global) {
    global.SomaAssistCore = exportObj;
    global.createAssistChip = createAssistChip;
  }
  /* CommonJS for Node require() of the built file */
  if (typeof module !== 'undefined' && module.exports && typeof window === 'undefined') {
    module.exports = exportObj;
  }
}(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this));
