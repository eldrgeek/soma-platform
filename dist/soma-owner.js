/* SOMA Owner — lightweight owner-mode identification
 *
 * Device-bound convenience gate for hiding owner UI from visitors.
 * NOT a security boundary — the secret is client-side. Use packages/auth
 * (Supabase) for anything that must be server-enforced.
 *
 * Activation: visit any SOMA app page with ?soma_owner_key=<OWNER_SECRET>
 * The param is stripped from the URL after activation.
 *
 * Integration: <script src="https://soma-guide.netlify.app/soma-owner.js"></script>
 * in <head>, before app scripts. Zero per-site config required.
 *
 * Data-attribute gate: <div data-owner-only> — hidden for visitors automatically.
 * JS gate:             if (SomaOwner.isOwner()) { ... }
 *
 * Build: node packages/soma-owner/build.mjs  → writes dist/soma-owner.js
 */
(function (global) {
  'use strict';

  /* ── Build-time constants (substituted by build.mjs) ───────────────────── */
  var OWNER_SECRET  = '35f0c52608d6a475ce4c4632f978ea22d5e3f2fd';   /* raw secret — for URL param check */
  var OWNER_TOKEN   = '6ee3c18d431ed321609c80295cda2b99b89f9122c4a41e946908fad735b2b679';    /* SHA-256(secret) — stored in localStorage */
  var SOMA_OWNER_VERSION = '20260610';

  /* ── Storage key ────────────────────────────────────────────────────────── */
  var LS_KEY = 'soma_owner';

  /* ── FOUC guard: inject hide rule synchronously ─────────────────────────── */
  /* Visitors never see a flash of owner elements. Owner browsers override below. */
  var _styleEl = null;
  if (typeof document !== 'undefined') {
    _styleEl = document.createElement('style');
    _styleEl.id = 'soma-owner-style';
    _styleEl.textContent = '[data-owner-only]{display:none!important}' +
      'html.soma-owner [data-owner-only]{display:revert!important}';
    var _head = document.head || document.getElementsByTagName('head')[0];
    if (_head) _head.insertBefore(_styleEl, _head.firstChild);
  }

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function _lsGet()    { try { return localStorage.getItem(LS_KEY); } catch(e) { return null; } }
  function _lsSet(v)   { try { localStorage.setItem(LS_KEY, v); }    catch(e) {} }
  function _lsDel()    { try { localStorage.removeItem(LS_KEY); }     catch(e) {} }

  function _setOwnerClass(on) {
    if (typeof document === 'undefined') return;
    if (on) {
      document.documentElement.classList.add('soma-owner');
    } else {
      document.documentElement.classList.remove('soma-owner');
    }
  }

  function _toast(msg) {
    if (typeof document === 'undefined') return;
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
      'background:#1a1714', 'color:#e8ddd0', 'border:1px solid #c8933a',
      'border-radius:999px', 'padding:10px 22px', 'font:14px/1.4 system-ui,sans-serif',
      'z-index:2147483647', 'pointer-events:none', 'box-shadow:0 4px 16px rgba(0,0,0,.45)',
      'transition:opacity .4s', 'opacity:1'
    ].join(';');
    document.body.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { el.parentNode && el.parentNode.removeChild(el); }, 450);
    }, 3000);
  }

  /* ── Core ───────────────────────────────────────────────────────────────── */
  function _isOwner() {
    return _lsGet() === OWNER_TOKEN;
  }

  function _activate() {
    _lsSet(OWNER_TOKEN);
    _setOwnerClass(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('soma-owner:activated'));
    }
    if (typeof document !== 'undefined' && document.body) {
      _toast('🔓 Owner mode activated');
    }
  }

  function _revoke() {
    _lsDel();
    _setOwnerClass(false);
    if (typeof location !== 'undefined') location.reload();
  }

  function _gateEl(el) {
    if (!el) return;
    if (_isOwner()) {
      el.removeAttribute('data-owner-only');
    } else {
      el.setAttribute('data-owner-only', '');
    }
  }

  function _gateEls(selector) {
    if (typeof document === 'undefined') return;
    var els = document.querySelectorAll(selector);
    for (var i = 0; i < els.length; i++) _gateEl(els[i]);
  }

  /* ── Auto-init on DOMContentLoaded ─────────────────────────────────────── */
  function _init() {
    var stored = _lsGet();

    /* Check URL for activation key */
    if (typeof location !== 'undefined') {
      var params = null;
      try { params = new URLSearchParams(location.search); } catch(e) {}
      if (params && params.has('soma_owner_key')) {
        var candidate = params.get('soma_owner_key');
        if (candidate === OWNER_SECRET) {
          /* Strip the param from URL so secret doesn't linger in address bar */
          try {
            params.delete('soma_owner_key');
            var newSearch = params.toString();
            var newUrl = location.pathname + (newSearch ? '?' + newSearch : '') + location.hash;
            history.replaceState(null, '', newUrl);
          } catch(e) {}
          _activate();
          return;
        }
        /* Wrong key — silently ignore (no oracle) */
      }
    }

    /* Validate stored token (handles post-rotation stale tokens) */
    if (stored !== null && stored !== OWNER_TOKEN) {
      _lsDel();
      stored = null;
    }

    if (stored === OWNER_TOKEN) {
      _setOwnerClass(true);
    }
  }

  /* ── Public API ─────────────────────────────────────────────────────────── */
  var SomaOwner = {
    version:  SOMA_OWNER_VERSION,
    isOwner:  _isOwner,
    revoke:   _revoke,
    gateEl:   _gateEl,
    gateEls:  _gateEls
  };

  global.SomaOwner = SomaOwner;

  /* Run immediately so class lands before first paint (avoids FOUC on reload) */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      /* Validate + restore class immediately; activation check waits for body */
      var stored = _lsGet();
      if (stored !== null && stored !== OWNER_TOKEN) { _lsDel(); stored = null; }
      if (stored === OWNER_TOKEN) { _setOwnerClass(true); }
      /* Full init (URL check + toast) after DOM ready */
      document.addEventListener('DOMContentLoaded', _init);
    } else {
      _init();
    }
  }

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
