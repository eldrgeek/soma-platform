/* SOMA Owner — lightweight owner-mode identification
 *
 * Device-bound convenience gate for hiding owner UI from visitors.
 * NOT a security boundary — it runs in the browser. Use packages/auth
 * (Supabase) for anything that must be server-enforced.
 *
 * This file is public (it is committed to a public repo and served from a CDN),
 * so it carries neither the secret nor the value a device stores, only
 * OWNER_CHECK = SHA-256(SHA-256(secret)). A device stores SHA-256(secret) and
 * is the owner when SHA-256(stored) === OWNER_CHECK. Reading this file does not
 * let anyone make that value, so rotating the secret actually revokes.
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
  var OWNER_CHECK   = '__OWNER_CHECK__';    /* SHA-256(SHA-256(secret)), hex */
  var SOMA_OWNER_VERSION = '__VERSION__';

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

  /* ── SHA-256 (sync, so isOwner() stays synchronous) ─────────────────────── */
  var _K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  function _sha256(str) {
    var bytes = [], i, j;
    var utf8 = unescape(encodeURIComponent(String(str)));
    for (i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 0xff);
    var h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var w = new Array(64);
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    for (i = 0; i < bytes.length; i += 64) {
      for (j = 0; j < 16; j++) {
        w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | bytes[i + j * 4 + 3];
      }
      for (j = 16; j < 64; j++) {
        var s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        var s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
      for (j = 0; j < 64; j++) {
        var t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + _K[j] + w[j]) | 0;
        var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + k) | 0;
    }
    var hex = '';
    for (i = 0; i < 8; i++) hex += ('00000000' + (h[i] >>> 0).toString(16)).slice(-8);
    return hex;
  }

  /* A stored value is valid when it hashes to OWNER_CHECK. Memoised: localStorage
   * rarely changes, and gateEls() calls this once per element. */
  var _memoIn = null, _memoOut = false;
  function _valid(stored) {
    if (stored === null || stored === undefined) return false;
    if (stored !== _memoIn) { _memoIn = stored; _memoOut = _sha256(stored) === OWNER_CHECK; }
    return _memoOut;
  }

  /* ── Core ───────────────────────────────────────────────────────────────── */
  function _isOwner() {
    return _valid(_lsGet());
  }

  function _activate(deviceToken) {
    _lsSet(deviceToken);
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
        var deviceToken = _sha256(params.get('soma_owner_key'));
        if (_valid(deviceToken)) {
          /* Strip the param from URL so secret doesn't linger in address bar */
          try {
            params.delete('soma_owner_key');
            var newSearch = params.toString();
            var newUrl = location.pathname + (newSearch ? '?' + newSearch : '') + location.hash;
            history.replaceState(null, '', newUrl);
          } catch(e) {}
          _activate(deviceToken);
          return;
        }
        /* Wrong key — silently ignore (no oracle) */
      }
    }

    /* Validate stored token (handles post-rotation stale tokens) */
    if (stored !== null && !_valid(stored)) {
      _lsDel();
      stored = null;
    }

    if (stored !== null) {
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
      if (stored !== null && !_valid(stored)) { _lsDel(); stored = null; }
      if (stored !== null) { _setOwnerClass(true); }
      /* Full init (URL check + toast) after DOM ready */
      document.addEventListener('DOMContentLoaded', _init);
    } else {
      _init();
    }
  }

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
