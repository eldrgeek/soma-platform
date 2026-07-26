/* soma-edit.js — SOMA admin-gated in-place content editor v2.0
 *
 * When the visitor is a SOMA admin OR the device-bound owner, this surfaces an
 * unobtrusive "Edit page" toggle that makes text on the page contenteditable,
 * with a page-level Save all / Cancel. For everyone else it is a complete no-op,
 * safe to load on every public page. (SOMA-APP-STANDARD §17.)
 *
 * v2.0 changes from v1.0 (2026-07-23, Mike directive "an admin can tweak the site
 * by making all text areas contenteditable"):
 *   1. GATE — now activates for a verified admin, not only the device-bound owner.
 *      The client gate is optimistic; the SAVE is what's authoritative: every edit
 *      POSTs the app's admin token and the SERVER decides whether it becomes a
 *      queued build request (§15 routing — client never self-certifies admin).
 *   2. SCOPE — edits ALL leaf text blocks by default (h1-h6, p, li, blockquote,
 *      figcaption, dd/dt, summary, caption, th/td) plus any [data-soma-editable],
 *      not just tagged elements. Opt an element out with [data-soma-noedit]; the
 *      widget's own UI, nav/interactive controls, and the SOMA guide/feedback
 *      widgets are always excluded. Set cfg.editAll=false to require opt-in.
 *
 * No external dependencies. Self-contained, like soma-manager.js.
 *
 * ── Config (optional) ──────────────────────────────────────────────────────
 *   window.SomaEditConfig = {
 *     siteId:     'karl-friston',                    // identifies the property
 *     endpoint:   '/.netlify/functions/feedback',    // where edits are filed (§8/§15)
 *     editAll:    true,                              // default: all leaf text blocks
 *     saveLabel:  'Lock this down',                  // save-button label (default "Save all")
 *     selector:   'h1,h2,p,[data-soma-editable]',    // override the default target set
 *     // How this app proves the editor is an admin. Any ONE of these is enough for the
 *     // CLIENT affordance; the SERVER re-verifies on save. Wire to whatever auth the
 *     // app already has (mirrors §15's somaFeedbackAuthHeader):
 *     isAdmin:    function () { return false; },     // predicate the app supplies
 *     authHeader: function () { return null; },      // returns e.g. 'Bearer <jwt>'
 *   }
 *   // Also honored: window.SOMA_IS_ADMIN === true, window.somaFeedbackIdentity
 *   // (a {googleIdToken,isAdmin} the §8 feedback widget publishes), and SomaOwner.isOwner().
 *
 * ── Persistence contract (§15 build-request) ───────────────────────────────
 * On save, POST one request per changed block to the configured endpoint:
 *   {
 *     type:    'content-edit',
 *     siteId:  '<siteId>',
 *     key:     '<data-soma-editable value | computed DOM path>',
 *     hint:    '<human-readable locator: tag + first words of original>',
 *     newHTML, oldHTML,
 *     page:    location.href,
 *     googleIdToken: '<if window.somaFeedbackIdentity has one>',
 *     // legacy-compatible so existing /feedback fns accept it and the §8 clarity
 *     // classifier + §15 admin routing treat it as an admin build request:
 *     message: 'Content edit [<hint>] on <siteId>: "<old>" -> "<new>"',
 *   }
 * The endpoint's own admin check (server-verified token) decides queued-vs-review.
 * Edits are ALSO mirrored to a localStorage draft so nothing is ever lost, with a
 * "Copy changes" affordance that yields a JSON diff to paste anywhere.
 */
(function () {
  'use strict';

  if (typeof document === 'undefined') return;

  /* ── Config ──────────────────────────────────────────────────────────────── */
  var cfg = (typeof window !== 'undefined' && window.SomaEditConfig) || {};
  var siteId    = cfg.siteId || (typeof location !== 'undefined' ? location.hostname : 'unknown');
  var endpoint  = cfg.feedbackUrl || cfg.endpoint || null;
  var editLabel = cfg.feedbackLabel || 'Edit page';
  var saveLabel = cfg.saveLabel || 'Save all';        /* e.g. "Lock this down" */
  var editAll   = cfg.editAll !== false;              /* default: all leaf text blocks */
  var DRAFT_KEY = 'soma_edit_draft:' + siteId;

  /* Default target set: leaf text blocks. Chosen so an admin can fix wording without
   * the chaos of a contenteditable container that wraps other editable blocks. */
  var DEFAULT_TAGS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dd,dt,summary,caption,th,td,span[data-soma-editable]';
  var EXPLICIT_SEL = '[data-soma-editable]';
  var TARGET_SEL   = cfg.selector || (editAll ? DEFAULT_TAGS + ',' + EXPLICIT_SEL : EXPLICIT_SEL);

  /* Never edit our own UI, other SOMA widgets, or interactive controls. */
  var EXCLUDE_SEL = '[data-soma-noedit],.se-bar,.se-toast,.sg-widget,[id^="sg-"],[class^="smgr-"],' +
    '[class*="soma-feedback"],[class*="society-bar"],[class*="join-bar"],script,style,a,button,' +
    'input,textarea,select,label,nav';

  /* ── State ───────────────────────────────────────────────────────────────── */
  var editing = false;
  var mounted = false;
  var originals = new WeakMap();   /* el -> original innerHTML (captured on edit-on) */
  var keyCache = new WeakMap();    /* el -> stable key */

  /* ── Editor gate — admin OR device owner ─────────────────────────────────── */
  function isAdmin() {
    try {
      if (window.SOMA_IS_ADMIN === true) return true;
      if (typeof cfg.isAdmin === 'function' && cfg.isAdmin()) return true;
      if (window.somaFeedbackIdentity && window.somaFeedbackIdentity.isAdmin === true) return true;
    } catch (_) {}
    return false;
  }
  function isOwner() {
    try {
      return !!(window.SomaOwner && typeof window.SomaOwner.isOwner === 'function' && window.SomaOwner.isOwner());
    } catch (_) { return false; }
  }
  function isEditor() { return isAdmin() || isOwner(); }

  function authHeader() {
    try { if (typeof cfg.authHeader === 'function') return cfg.authHeader() || null; } catch (_) {}
    return null;
  }
  function googleIdToken() {
    try { return (window.somaFeedbackIdentity && window.somaFeedbackIdentity.googleIdToken) || null; } catch (_) { return null; }
  }

  /* ── Target collection ───────────────────────────────────────────────────── */
  function isExcluded(el) { return !!el.closest(EXCLUDE_SEL); }
  /* A "leaf text block" has no descendant that is itself an editable block — editing
   * a paragraph is safe; editing a section that contains paragraphs is not. */
  function isLeafText(el) {
    if (el.hasAttribute('data-soma-editable')) return true;   /* explicit always wins */
    return !el.querySelector(DEFAULT_TAGS);
  }
  function targets() {
    var out = [];
    var els = document.querySelectorAll(TARGET_SEL);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (isExcluded(el)) continue;
      if (!el.textContent || !el.textContent.trim()) continue;   /* nothing to edit */
      if (!isLeafText(el)) continue;
      out.push(el);
    }
    return out;
  }
  function each(fn) { targets().forEach(fn); }

  /* Stable-ish locator so the dev fleet can find the source line. Explicit key wins;
   * otherwise a bounded nth-of-type path from the nearest id'd ancestor. */
  function keyOf(el) {
    var explicit = el.getAttribute('data-soma-editable');
    if (explicit) return explicit;
    if (keyCache.has(el)) return keyCache.get(el);
    var parts = [];
    var node = el;
    for (var depth = 0; node && node.nodeType === 1 && depth < 6; depth++) {
      if (node.id) { parts.unshift('#' + node.id); break; }
      var tag = node.tagName.toLowerCase();
      var idx = 1, sib = node;
      while ((sib = sib.previousElementSibling)) { if (sib.tagName === node.tagName) idx++; }
      parts.unshift(tag + ':nth-of-type(' + idx + ')');
      node = node.parentElement;
    }
    var key = parts.join('>');
    keyCache.set(el, key);
    return key;
  }
  function hintOf(el) {
    var t = (el.textContent || '').trim().replace(/\s+/g, ' ');
    return el.tagName.toLowerCase() + ' "' + t.slice(0, 40) + (t.length > 40 ? '…' : '') + '"';
  }

  function lsGet() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; } }
  function lsSet(o) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(o)); } catch (_) {} }
  function lsDel() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }

  /* ── Styles (scoped, prefixed se-; AGI-26 palette) ───────────────────────── */
  var css = [
    '.se-bar{position:fixed;bottom:24px;left:24px;z-index:2147483646;display:flex;gap:8px;align-items:center;' +
      'font:13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}',
    '.se-btn{border:1px solid #3C6CDD;background:#0F141F;color:#E9EAED;border-radius:999px;padding:9px 18px;' +
      'cursor:pointer;font:inherit;box-shadow:0 4px 16px rgba(0,0,0,.45);transition:background .15s,opacity .15s;}',
    '.se-btn:hover{background:#151B2B;}',
    '.se-btn[disabled]{opacity:.5;cursor:default;}',
    '.se-btn.se-primary{background:#3C6CDD;color:#fff;border-color:#3C6CDD;font-weight:600;}',
    '.se-btn.se-primary:hover{background:#4D7AE8;}',
    '.se-btn.se-ghost{background:transparent;color:#6f9bff;}',
    'html.soma-edit-on .se-editable{outline:1px dashed rgba(60,108,221,.55);outline-offset:3px;' +
      'cursor:text;border-radius:3px;transition:outline-color .15s,background .15s;}',
    'html.soma-edit-on .se-editable:hover{outline-color:#3C6CDD;background:rgba(60,108,221,.06);}',
    'html.soma-edit-on .se-editable:focus{outline:2px solid #3C6CDD;background:rgba(60,108,221,.08);}',
    'html.soma-edit-on .se-editable.se-dirty{outline-color:#5fa463;background:rgba(95,164,99,.10);}',
    '.se-toast{position:fixed;bottom:78px;left:24px;z-index:2147483647;background:#0F141F;color:#E9EAED;' +
      'border:1px solid #3C6CDD;border-radius:10px;padding:10px 16px;max-width:340px;' +
      'font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.45);opacity:0;transition:opacity .3s;}',
    '.se-toast.se-show{opacity:1;}',
    '.se-toast.se-err{border-color:#c0392b;}'
  ].join('');

  function injectStyle() {
    if (document.getElementById('soma-edit-style')) return;
    var s = document.createElement('style');
    s.id = 'soma-edit-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── Toast ───────────────────────────────────────────────────────────────── */
  var toastEl = null, toastTimer = null;
  function toast(msg, isErr) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'se-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.toggle('se-err', !!isErr);
    void toastEl.offsetWidth;
    toastEl.classList.add('se-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('se-show'); }, 3600);
  }

  /* ── Persistence ─────────────────────────────────────────────────────────── */
  function stripTags(h) { var d = document.createElement('div'); d.innerHTML = h; return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
  function persistRemote(change) {
    if (!endpoint) return Promise.resolve(false);
    var payload = {
      type:   'content-edit',
      siteId: siteId,
      key:    change.key,
      hint:   change.hint,
      newHTML: change.newHTML,
      oldHTML: change.oldHTML,
      page:   (typeof location !== 'undefined' ? location.href : ''),
      googleIdToken: googleIdToken() || undefined,
      message: 'Content edit [' + change.hint + '] on ' + siteId + ':\n' +
               '- was: ' + stripTags(change.oldHTML).slice(0, 200) + '\n' +
               '- now: ' + stripTags(change.newHTML).slice(0, 200)
    };
    var headers = { 'Content-Type': 'application/json' };
    var ah = authHeader();
    if (ah) headers['Authorization'] = ah;
    return fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
      .then(function (r) { return r.ok; }).catch(function () { return false; });
  }
  function persistDraft(change) {
    var d = lsGet();
    d[change.key] = { hint: change.hint, newHTML: change.newHTML, oldHTML: change.oldHTML,
      page: (typeof location !== 'undefined' ? location.href : ''), ts: new Date().toISOString() };
    lsSet(d);
  }

  /* ── Edit lifecycle ──────────────────────────────────────────────────────── */
  function markDirty(el) {
    var o = originals.get(el);
    if (o !== undefined && el.innerHTML !== o) el.classList.add('se-dirty');
    else el.classList.remove('se-dirty');
    refreshSaveState();
  }
  function dirtyChanges() {
    var out = [];
    each(function (el) {
      var o = originals.get(el);
      if (o !== undefined && el.innerHTML !== o) out.push({ key: keyOf(el), hint: hintOf(el), newHTML: el.innerHTML, oldHTML: o, el: el });
    });
    return out;
  }
  function enterEdit() {
    editing = true;
    document.documentElement.classList.add('soma-edit-on');
    each(function (el) {
      if (!originals.has(el)) originals.set(el, el.innerHTML);
      el.classList.add('se-editable');
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      if (!el.__seBound) { el.addEventListener('input', function () { markDirty(el); }); el.__seBound = true; }
    });
    setBar('editing');
    toast('Editing as admin — click any highlighted text to change it. Save when done.');
  }
  function exitEdit(revert) {
    if (revert) dirtyChanges().forEach(function (c) { c.el.innerHTML = originals.get(c.el); c.el.classList.remove('se-dirty'); });
    editing = false;
    document.documentElement.classList.remove('soma-edit-on');
    each(function (el) { el.removeAttribute('contenteditable'); el.classList.remove('se-dirty', 'se-editable'); });
    setBar('idle');
  }
  function saveAll() {
    var changes = dirtyChanges();
    if (!changes.length) { toast('No changes to save.'); return; }
    var btnSave = document.getElementById('se-save');
    if (btnSave) { btnSave.disabled = true; btnSave.textContent = 'Filing…'; }
    changes.forEach(persistDraft);                 /* never lose an edit */
    Promise.all(changes.map(persistRemote)).then(function (results) {
      var ok = results.filter(Boolean).length, n = changes.length;
      changes.forEach(function (c) { originals.set(c.el, c.newHTML); c.el.classList.remove('se-dirty'); });
      var hhmm = new Date().toTimeString().slice(0, 5);
      if (!endpoint) toast('Saved ' + n + ' edit' + (n === 1 ? '' : 's') + ' to a local draft (no endpoint). Use "Copy changes."');
      else if (ok === n) toast('Filed ' + n + ' edit' + (n === 1 ? '' : 's') + ' to ship (' + hhmm + '). Draft kept as backup.');
      else toast('Saved locally; ' + (n - ok) + ' of ' + n + ' failed to file. Use "Copy changes."', true);
      exitEdit(false);
    }).then(function () { if (btnSave) { btnSave.disabled = false; btnSave.textContent = saveLabel; } });
  }
  function copyChanges() {
    var draft = lsGet(), keys = Object.keys(draft);
    if (!keys.length) { toast('No saved draft to copy.'); return; }
    var text = JSON.stringify({ siteId: siteId, page: (typeof location !== 'undefined' ? location.href : ''), changes: draft }, null, 2);
    var done = function () { toast('Copied ' + keys.length + ' change' + (keys.length === 1 ? '' : 's') + ' to clipboard.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    try { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done();
    } catch (_) { toast('Could not copy — draft is in localStorage key ' + DRAFT_KEY, true); }
  }
  function clearDraft() { lsDel(); refreshSaveState(); toast('Local draft cleared.'); }

  /* ── Toolbar ─────────────────────────────────────────────────────────────── */
  var bar = null;
  function mountBar() { if (mounted) return; mounted = true; bar = document.createElement('div'); bar.className = 'se-bar'; document.body.appendChild(bar); setBar('idle'); }
  function hasDraft() { return Object.keys(lsGet()).length > 0; }
  function setBar(mode) {
    if (!bar) return;
    if (mode === 'editing') {
      bar.innerHTML = '<button class="se-btn se-primary" id="se-save">' + escapeHtml(saveLabel) + '</button><button class="se-btn se-ghost" id="se-cancel">Cancel</button>';
      document.getElementById('se-save').addEventListener('click', saveAll);
      document.getElementById('se-cancel').addEventListener('click', function () { exitEdit(true); toast('Edits reverted.'); });
    } else {
      var draftBtns = hasDraft() ? '<button class="se-btn" id="se-copy">Copy changes</button><button class="se-btn se-ghost" id="se-clear">Clear draft</button>' : '';
      bar.innerHTML = '<button class="se-btn" id="se-edit">✎ ' + escapeHtml(editLabel) + '</button>' + draftBtns;
      document.getElementById('se-edit').addEventListener('click', enterEdit);
      var copy = document.getElementById('se-copy'); if (copy) copy.addEventListener('click', copyChanges);
      var clear = document.getElementById('se-clear'); if (clear) clear.addEventListener('click', clearDraft);
    }
  }
  function refreshSaveState() { if (!editing) setBar('idle'); }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ── Bootstrap (editor-gated) ────────────────────────────────────────────── */
  function activate() {
    if (mounted) return;
    if (!targets().length) return;   /* nothing editable on this page */
    injectStyle();
    mountBar();
  }
  function tryActivate() { if (isEditor()) { activate(); return true; } return false; }
  function boot() {
    if (tryActivate()) return;
    window.addEventListener('soma-owner:activated', activate);
    window.addEventListener('soma-admin:activated', activate);   /* apps fire this once Google verifies */
    var tries = 0, iv = setInterval(function () { if (tryActivate() || ++tries > 20) clearInterval(iv); }, 250);  /* ~5s */
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ── Public API ──────────────────────────────────────────────────────────── */
  window.SomaEdit = {
    version: '2.0',
    isActive: function () { return mounted; },
    isEditor: isEditor,
    targets: function () { return targets(); },
    enter: function () { if (isEditor()) { activate(); enterEdit(); } },
    exit: function () { exitEdit(false); },
    draft: lsGet, clearDraft: clearDraft, copyChanges: copyChanges
  };
}());
