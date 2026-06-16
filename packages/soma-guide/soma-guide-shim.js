/* SOMA Guide host shim — "Bill's hands" for iframe delivery
 *
 * This is the ONLY SOMA script a host page embeds (besides its own
 * window.SomaGuideConfig). Bill's brain + UI run inside a cross-origin
 * <iframe> served from the SOMA origin; a cross-origin iframe cannot touch the
 * host DOM, so this shim:
 *   (a) injects the Bill <iframe> (src ./iframe.html, resolved against this
 *       script's own URL so it always points at the SOMA origin),
 *   (b) on iframe load, posts the host's window.SomaGuideConfig into the iframe,
 *   (c) receives host-adapter commands from the iframe and executes them on the
 *       host DOM (the host-adapter contract: exists/rect/click/setValue/
 *       scrollIntoView/highlight/clearHighlight + demo cursor),
 *   (d) renders the .sg-highlight ring + the demo cursor HOST-side (over the
 *       real host DOM, where the targets live),
 *   (e) posts acks/results back for the requests that need an answer.
 *
 * Message protocol (window.postMessage):
 *   iframe → shim:  { sg:'host-cmd', cmd, args, id? }   (id present => wants a reply)
 *   shim   → iframe: { sg:'host-result', id, result }   (reply to a host-cmd)
 *   shim   → iframe: { sg:'host-config', config }        (sent on iframe load)
 *   iframe → shim:  { sg:'iframe-ready' }                (iframe booted; re-send config)
 *
 * Config note: window.SomaGuideConfig is serialized via structuredClone-style
 * postMessage, so config fields must be JSON-ish. Functions (e.g. identity
 * hooks, RegExp scopeGuard patterns) DO NOT survive the transfer — see
 * docs/SOMA-DELIVERY.md "rough edges". For those, the iframe build should carry
 * its own server-side config or use string patterns.
 */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc) return;

  /* ── Resolve the iframe URL against this script's own location so the iframe
   * is always loaded from the SOMA origin (where soma-guide.js is served). A
   * host can override via window.SomaGuideShim = { iframeUrl, origin }. */
  var shimCfg   = global.SomaGuideShim || {};
  var thisScript = doc.currentScript ||
    (function () { var s = doc.getElementsByTagName('script'); return s[s.length - 1]; })();
  var baseHref = (thisScript && thisScript.src) || global.location.href;
  var iframeUrl = shimCfg.iframeUrl
    ? new URL(shimCfg.iframeUrl, baseHref).href
    : new URL('./iframe.html', baseHref).href;
  /* The origin we accept messages from / post to. Derived from the iframe URL. */
  var iframeOrigin = shimCfg.origin || (function () {
    try { return new URL(iframeUrl).origin; } catch (e) { return '*'; }
  })();
  /* When the iframe is same-origin (local file/http demo), new URL().origin can
   * be "null" (file:) — fall back to '*' so the demo still works locally. */
  if (iframeOrigin === 'null' || !iframeOrigin) iframeOrigin = '*';

  /* ── Inject host-side styles for the highlight ring + demo cursor + ripple.
   * Self-contained so the host page needs nothing but this shim. Mirrors the
   * .sg-highlight / .sg-demo-cursor / .sg-demo-ripple rules in soma-guide.css. */
  function injectStyles() {
    if (doc.getElementById('sg-shim-style')) return;
    var css = [
      '.sg-shim-highlight{outline:3px solid #c9a84c !important;outline-offset:4px;',
      'border-radius:4px !important;box-shadow:0 0 0 8px rgba(201,168,76,0.18),0 0 20px rgba(201,168,76,0.35) !important;',
      'position:relative;z-index:1000;transition:outline .25s ease,box-shadow .25s ease;}',
      '.sg-shim-cursor{position:fixed;pointer-events:none;z-index:2147483646;width:20px;height:24px;opacity:0;',
      'transition:left .7s cubic-bezier(.4,0,.2,1),top .7s cubic-bezier(.4,0,.2,1),opacity .2s;}',
      '.sg-shim-cursor--visible{opacity:1;}',
      '.sg-shim-cursor svg{display:block;filter:drop-shadow(1px 2px 3px rgba(0,0,0,.45));}',
      '.sg-shim-ripple{position:fixed;pointer-events:none;z-index:2147483645;width:28px;height:28px;',
      'border-radius:50%;background:rgba(201,168,76,.55);animation:sg-shim-ripple .65s ease-out forwards;}',
      '@keyframes sg-shim-ripple{to{transform:scale(3.5);opacity:0;}}'
    ].join('');
    var st = doc.createElement('style');
    st.id = 'sg-shim-style';
    st.textContent = css;
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* ── Host-side highlight ─────────────────────────────────────────────────── */
  function clearHighlight() {
    var hl = doc.querySelectorAll('.sg-shim-highlight');
    Array.prototype.forEach.call(hl, function (e) { e.classList.remove('sg-shim-highlight'); });
  }
  function highlight(sel) {
    if (!sel) return;
    clearHighlight();
    var el = doc.querySelector(sel);
    if (el) {
      el.classList.add('sg-shim-highlight');
      try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
    }
  }

  /* ── Host-side demo cursor ───────────────────────────────────────────────── */
  var cursorEl = null, cursorMoveTimer = null;
  function buildCursor() {
    if (cursorEl) return cursorEl;
    cursorEl = doc.createElement('div');
    cursorEl.className = 'sg-shim-cursor';
    cursorEl.innerHTML = '<svg width="20" height="24" viewBox="0 0 20 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 2L2 20L7 15L11 23L14 22L10 14L18 14Z" fill="#c9a84c" stroke="#060e18" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    doc.body.appendChild(cursorEl);
    return cursorEl;
  }
  function demoStop() {
    if (cursorMoveTimer) { clearTimeout(cursorMoveTimer); cursorMoveTimer = null; }
    if (cursorEl) cursorEl.classList.remove('sg-shim-cursor--visible');
  }
  function ripple() {
    if (!cursorEl) return;
    var r = cursorEl.getBoundingClientRect();
    var rp = doc.createElement('div');
    rp.className = 'sg-shim-ripple';
    rp.style.left = (r.left - 6) + 'px';
    rp.style.top  = (r.top  - 6) + 'px';
    doc.body.appendChild(rp);
    setTimeout(function () { if (rp.parentNode) rp.parentNode.removeChild(rp); }, 700);
  }
  function demoCursor(sel, action) {
    var target = sel ? doc.querySelector(sel) : null;
    if (!target) return;
    var cur = buildCursor();
    var rect = target.getBoundingClientRect();
    var destX = Math.round(rect.left + rect.width * 0.5 - 10);
    var destY = Math.round(rect.top - 8);
    if (!cur.classList.contains('sg-shim-cursor--visible')) {
      cur.style.transition = 'none';
      cur.style.left = ((global.innerWidth || 800) - 80) + 'px';
      cur.style.top  = ((global.innerHeight || 600) - 120) + 'px';
      cur.classList.add('sg-shim-cursor--visible');
      cur.getBoundingClientRect(); /* force reflow before animating */
      cur.style.transition = '';
    }
    cur.style.left = destX + 'px';
    cur.style.top  = destY + 'px';
    if (cursorMoveTimer) clearTimeout(cursorMoveTimer);
    cursorMoveTimer = setTimeout(function () {
      cursorMoveTimer = null;
      if (action === 'click' || action === 'openDropdown') ripple();
      /* 'hover' — cursor presence at the target is the visual */
    }, 800);
  }

  /* ── Generic dropdown open (mirrors engine _wtOpenDropdown) ──────────────── */
  var openDropdownContainer = null, openDropdownToggle = null;
  function openDropdown(sel) {
    if (!sel) return;
    var c = doc.querySelector(sel);
    if (!c) return;
    c.classList.add('sg-demo-open');
    openDropdownContainer = c;
    var toggle = c.querySelector('[aria-expanded]');
    if (!toggle && c.matches && c.matches('[aria-expanded]')) toggle = c;
    if (toggle) { toggle.setAttribute('aria-expanded', 'true'); openDropdownToggle = toggle; }
  }

  /* ── Host-adapter command executor ───────────────────────────────────────── */
  function execCommand(cmd, args) {
    args = args || {};
    var sel = args.sel;
    switch (cmd) {
      case 'exists':
        return !!doc.querySelector(sel);
      case 'rect': {
        var el = doc.querySelector(sel);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height,
                 right: r.right, bottom: r.bottom };
      }
      case 'click': {
        var ce = doc.querySelector(sel);
        if (ce) ce.click();
        return !!ce;
      }
      case 'setValue': {
        var fe = doc.querySelector(sel);
        if (!fe) return false;
        fe.value = (args.val == null ? '' : args.val);
        fe.dispatchEvent(new Event(fe.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        return true;
      }
      case 'scrollIntoView': {
        var se = doc.querySelector(sel);
        if (se) { try { se.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
        return true;
      }
      case 'highlight':       highlight(sel);     return true;
      case 'clearHighlight':  clearHighlight();   return true;
      case 'openDropdown':    openDropdown(sel);  return true;
      case 'demoCursor':      demoCursor(sel, args.action); return true;
      case 'demoStop':        demoStop();         return true;
      default:                return null;
    }
  }

  /* ── Iframe injection ────────────────────────────────────────────────────── */
  var iframe = null;
  function injectIframe() {
    if (iframe) return;
    iframe = doc.createElement('iframe');
    iframe.id = 'soma-guide-iframe';
    iframe.title = 'SOMA Guide assistant';
    iframe.setAttribute('allow', 'microphone; autoplay');
    /* Bill's own widget chrome is fixed-positioned INSIDE the iframe; the iframe
     * itself is a fixed, full-viewport, click-through layer so the floating FAB
     * and panel can sit anywhere. pointer-events:none lets host clicks through;
     * the iframe document re-enables pointer events on its own widget element. */
    var s = iframe.style;
    s.position = 'fixed';
    s.top = '0'; s.left = '0';
    s.width = '100%'; s.height = '100%';
    s.border = '0';
    s.background = 'transparent';
    s.zIndex = '2147483647';
    s.pointerEvents = 'none';
    iframe.allowTransparency = 'true';
    iframe.src = iframeUrl;
    iframe.addEventListener('load', function () { sendConfig(); });
    (doc.body || doc.documentElement).appendChild(iframe);
  }

  function sendConfig() {
    if (!iframe || !iframe.contentWindow) return;
    var cfg = global.SomaGuideConfig || {};
    try {
      iframe.contentWindow.postMessage({ sg: 'host-config', config: cfg }, iframeOrigin);
    } catch (e) {
      /* Config carries something non-cloneable (a function/RegExp). Strip to a
       * JSON round-trip and resend so at least the data survives. */
      try {
        var safe = JSON.parse(JSON.stringify(cfg));
        iframe.contentWindow.postMessage({ sg: 'host-config', config: safe }, iframeOrigin);
      } catch (e2) {
        console.warn('[SomaGuide shim] could not transfer config', e2);
      }
    }
  }

  /* ── Message bridge ──────────────────────────────────────────────────────── */
  global.addEventListener('message', function (ev) {
    /* Only trust messages from the iframe window we created. */
    if (iframe && ev.source !== iframe.contentWindow) return;
    if (iframeOrigin !== '*' && ev.origin !== iframeOrigin) return;
    var d = ev.data;
    if (!d) return;

    if (d.sg === 'iframe-ready') { sendConfig(); return; }

    if (d.sg === 'host-cmd') {
      var result = null;
      try { result = execCommand(d.cmd, d.args); } catch (e) {
        console.warn('[SomaGuide shim] command error', d.cmd, e);
      }
      /* Only reply when the iframe expects one (id present). */
      if (d.id != null && iframe && iframe.contentWindow) {
        Promise.resolve(result).then(function (r) {
          try { iframe.contentWindow.postMessage({ sg: 'host-result', id: d.id, result: r }, iframeOrigin); }
          catch (e) {}
        });
      }
    }
  });

  /* ── Boot ────────────────────────────────────────────────────────────────── */
  function boot() {
    injectStyles();
    injectIframe();
  }
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Tiny host-side handle for debugging / programmatic control. */
  global.SomaGuideShimRuntime = {
    iframe: function () { return iframe; },
    resendConfig: sendConfig
  };

}(typeof window !== 'undefined' ? window : this));
