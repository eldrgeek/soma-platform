/* soma-edit.js — SOMA owner-gated in-place content editor v1.0
 *
 * Companion to soma-owner.js. When the visitor is the device-bound owner
 * (window.SomaOwner.isOwner() === true), this surfaces an unobtrusive edit
 * affordance on every [data-soma-editable] element: a floating "Edit page"
 * toggle that makes those elements contenteditable, with per-element
 * Save / Revert and a page-level Save all / Cancel.
 *
 * For everyone else it is a complete no-op — safe to load on every public
 * page. It waits for soma-owner.js to report owner status (listens for the
 * 'soma-owner:activated' event and also polls briefly at load).
 *
 * No external dependencies. Self-contained, like soma-manager.js.
 *
 * ── Config (optional) ──────────────────────────────────────────────────────
 *   window.SomaEditConfig = {
 *     siteId:        'silicon-children',          // identifies the property
 *     feedbackUrl:   '/.netlify/functions/feedback', // persistence endpoint
 *     endpoint:      '/.netlify/functions/feedback', // alias for feedbackUrl
 *     feedbackLabel: 'Suggest a change',           // optional toggle-label override
 *   }
 *
 * If no endpoint is configured (or the POST fails), edits are saved to a
 * localStorage draft under key 'soma_edit_draft:<siteId>' and a "Copy
 * changes" affordance lets the owner copy a JSON diff to paste anywhere.
 *
 * ── Persistence contract ────────────────────────────────────────────────────
 * On save, POST to the configured endpoint mirroring the SOMA feedback /
 * change-request shape:
 *   {
 *     type:    'edit',
 *     siteId:  '<siteId>',
 *     key:     '<data-soma-editable value>',
 *     newHTML: '<edited innerHTML>',
 *     oldHTML: '<original innerHTML>',
 *     page:    location.href,
 *     // legacy-compatible feedback fields so existing /feedback fns accept it:
 *     message: 'Edit [<key>] on <siteId>: <newHTML>',
 *   }
 * The /feedback function forwards to soma-infer; a future backend can route
 * type:'edit' into Supabase change_requests for owner review. See FOLLOW-UPS.
 */
(function () {
  'use strict';

  if (typeof document === 'undefined') return;

  /* ── Config ──────────────────────────────────────────────────────────────── */
  var cfg = (typeof window !== 'undefined' && window.SomaEditConfig) || {};
  var siteId      = cfg.siteId || (typeof location !== 'undefined' ? location.hostname : 'unknown');
  var endpoint    = cfg.feedbackUrl || cfg.endpoint || null;
  var editLabel   = cfg.feedbackLabel || 'Edit page';
  var SEL         = '[data-soma-editable]';
  var DRAFT_KEY   = 'soma_edit_draft:' + siteId;

  /* ── State ───────────────────────────────────────────────────────────────── */
  var editing  = false;
  var mounted  = false;
  var originals = {};   /* key -> original innerHTML (captured on first edit-on) */

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function isOwner() {
    try {
      return !!(window.SomaOwner &&
                typeof window.SomaOwner.isOwner === 'function' &&
                window.SomaOwner.isOwner());
    } catch (_) { return false; }
  }

  function each(sel, fn) {
    var els = document.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) fn(els[i], i);
  }

  function keyOf(el) { return el.getAttribute('data-soma-editable'); }

  function lsGet() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; } }
  function lsSet(o) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(o)); } catch (_) {} }
  function lsDel() { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} }

  /* ── Styles (scoped, prefixed se-) ───────────────────────────────────────── */
  var css = [
    '.se-bar{position:fixed;bottom:24px;left:24px;z-index:2147483646;display:flex;gap:8px;align-items:center;' +
      'font:13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}',
    '.se-btn{border:1px solid #c8933a;background:#1a1714;color:#e8ddd0;border-radius:999px;padding:9px 18px;' +
      'cursor:pointer;font:inherit;box-shadow:0 4px 16px rgba(0,0,0,.45);transition:background .15s,opacity .15s;}',
    '.se-btn:hover{background:#2a2420;}',
    '.se-btn[disabled]{opacity:.5;cursor:default;}',
    '.se-btn.se-primary{background:#c8933a;color:#1a1714;border-color:#c8933a;font-weight:600;}',
    '.se-btn.se-primary:hover{background:#d8a34a;}',
    '.se-btn.se-ghost{background:transparent;color:#c8933a;}',
    /* editable affordance while editing */
    'html.soma-edit-on [data-soma-editable]{outline:1px dashed rgba(200,147,58,.55);outline-offset:3px;' +
      'cursor:text;border-radius:3px;transition:outline-color .15s,background .15s;}',
    'html.soma-edit-on [data-soma-editable]:hover{outline-color:#c8933a;background:rgba(200,147,58,.06);}',
    'html.soma-edit-on [data-soma-editable]:focus{outline:2px solid #c8933a;background:rgba(200,147,58,.08);}',
    'html.soma-edit-on [data-soma-editable].se-dirty{outline-color:#5fa463;background:rgba(95,164,99,.10);}',
    /* toast */
    '.se-toast{position:fixed;bottom:78px;left:24px;z-index:2147483647;background:#1a1714;color:#e8ddd0;' +
      'border:1px solid #c8933a;border-radius:10px;padding:10px 16px;max-width:340px;' +
      'font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.45);opacity:0;transition:opacity .3s;}',
    '.se-toast.se-show{opacity:1;}',
    '.se-toast.se-err{border-color:#c0392b;}'
  ].join('');

  function injectStyle() {
    var s = document.createElement('style');
    s.id = 'soma-edit-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── Toast ───────────────────────────────────────────────────────────────── */
  var toastEl = null, toastTimer = null;
  function toast(msg, isErr) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'se-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.toggle('se-err', !!isErr);
    /* reflow so transition fires */
    void toastEl.offsetWidth;
    toastEl.classList.add('se-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('se-show'); }, 3200);
  }

  /* ── Persistence ─────────────────────────────────────────────────────────── */
  /* Returns a Promise that resolves true if the remote POST succeeded. */
  function persistRemote(change) {
    if (!endpoint) return Promise.resolve(false);
    var payload = {
      type:    'edit',
      siteId:  siteId,
      key:     change.key,
      newHTML: change.newHTML,
      oldHTML: change.oldHTML,
      page:    (typeof location !== 'undefined' ? location.href : ''),
      /* legacy-compatible field so existing /feedback functions accept it */
      message: 'Edit [' + change.key + '] on ' + siteId + ':\n' + change.newHTML
    };
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /* Always mirror to a localStorage draft so edits are never lost. */
  function persistDraft(change) {
    var d = lsGet();
    d[change.key] = {
      newHTML: change.newHTML,
      oldHTML: change.oldHTML,
      page:    (typeof location !== 'undefined' ? location.href : ''),
      ts:      new Date().toISOString()
    };
    lsSet(d);
  }

  /* ── Edit lifecycle ──────────────────────────────────────────────────────── */
  function captureOriginals() {
    each(SEL, function (el) {
      var k = keyOf(el);
      if (k && !(k in originals)) originals[k] = el.innerHTML;
    });
  }

  function markDirty(el) {
    var k = keyOf(el);
    if (k && originals[k] !== undefined && el.innerHTML !== originals[k]) {
      el.classList.add('se-dirty');
    } else {
      el.classList.remove('se-dirty');
    }
    refreshSaveState();
  }

  function dirtyChanges() {
    var out = [];
    each(SEL, function (el) {
      var k = keyOf(el);
      if (k && originals[k] !== undefined && el.innerHTML !== originals[k]) {
        out.push({ key: k, newHTML: el.innerHTML, oldHTML: originals[k], el: el });
      }
    });
    return out;
  }

  function enterEdit() {
    editing = true;
    captureOriginals();
    document.documentElement.classList.add('soma-edit-on');
    each(SEL, function (el) {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      if (!el.__seBound) {
        el.addEventListener('input', function () { markDirty(el); });
        el.__seBound = true;
      }
    });
    setBar('editing');
    toast('Edit mode on — click any highlighted text to edit. Save when done.');
  }

  function exitEdit(revert) {
    if (revert) {
      dirtyChanges().forEach(function (c) {
        c.el.innerHTML = originals[c.key];
        c.el.classList.remove('se-dirty');
      });
    }
    editing = false;
    document.documentElement.classList.remove('soma-edit-on');
    each(SEL, function (el) {
      el.removeAttribute('contenteditable');
      el.classList.remove('se-dirty');
    });
    setBar('idle');
  }

  function saveAll() {
    var changes = dirtyChanges();
    if (!changes.length) { toast('No changes to save.'); return; }

    var btnSave = document.getElementById('se-save');
    if (btnSave) { btnSave.disabled = true; btnSave.textContent = 'Saving…'; }

    /* Always write a draft first so nothing is lost. */
    changes.forEach(persistDraft);

    var ops = changes.map(persistRemote);
    Promise.all(ops).then(function (results) {
      var ok = results.filter(Boolean).length;
      var n  = changes.length;
      changes.forEach(function (c) {
        originals[c.key] = c.newHTML;       /* new baseline */
        c.el.classList.remove('se-dirty');
      });
      if (!endpoint) {
        toast('Saved ' + n + ' change' + (n === 1 ? '' : 's') + ' to local draft (no backend configured). Use “Copy changes.”');
      } else if (ok === n) {
        toast('Submitted ' + n + ' change' + (n === 1 ? '' : 's') + ' for review. Local draft kept as backup.');
      } else {
        toast('Saved locally; ' + (n - ok) + ' of ' + n + ' failed to submit. Use “Copy changes.”', true);
      }
      exitEdit(false);
    }).then(function () {
      if (btnSave) { btnSave.disabled = false; btnSave.textContent = 'Save all'; }
    });
  }

  function copyChanges() {
    var draft = lsGet();
    var keys = Object.keys(draft);
    if (!keys.length) { toast('No saved draft to copy.'); return; }
    var out = { siteId: siteId, page: (typeof location !== 'undefined' ? location.href : ''), changes: draft };
    var text = JSON.stringify(out, null, 2);
    var done = function () { toast('Copied ' + keys.length + ' change' + (keys.length === 1 ? '' : 's') + ' to clipboard.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (_) {
      toast('Could not copy — draft is in localStorage key ' + DRAFT_KEY, true);
    }
  }

  function clearDraft() {
    lsDel();
    refreshSaveState();
    toast('Local draft cleared.');
  }

  /* ── Toolbar ─────────────────────────────────────────────────────────────── */
  var bar = null;
  function mountBar() {
    if (mounted) return;
    mounted = true;
    bar = document.createElement('div');
    bar.className = 'se-bar';
    document.body.appendChild(bar);
    setBar('idle');
  }

  function hasDraft() { return Object.keys(lsGet()).length > 0; }

  function setBar(mode) {
    if (!bar) return;
    if (mode === 'editing') {
      bar.innerHTML =
        '<button class="se-btn se-primary" id="se-save">Save all</button>' +
        '<button class="se-btn se-ghost" id="se-cancel">Cancel</button>';
      document.getElementById('se-save').addEventListener('click', saveAll);
      document.getElementById('se-cancel').addEventListener('click', function () {
        exitEdit(true);
        toast('Edits reverted.');
      });
    } else {
      var draftBtns = hasDraft()
        ? '<button class="se-btn" id="se-copy">Copy changes</button>' +
          '<button class="se-btn se-ghost" id="se-clear">Clear draft</button>'
        : '';
      bar.innerHTML =
        '<button class="se-btn" id="se-edit">✎ ' + escapeHtml(editLabel) + '</button>' + draftBtns;
      document.getElementById('se-edit').addEventListener('click', enterEdit);
      var copy = document.getElementById('se-copy');
      if (copy) copy.addEventListener('click', copyChanges);
      var clear = document.getElementById('se-clear');
      if (clear) clear.addEventListener('click', clearDraft);
    }
  }

  function refreshSaveState() {
    /* keep idle-mode draft buttons in sync */
    if (!editing) setBar('idle');
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Bootstrap (owner-gated) ─────────────────────────────────────────────── */
  function activate() {
    if (mounted) return;
    /* No editable targets → nothing to do. */
    if (!document.querySelector(SEL)) return;
    injectStyle();
    mountBar();
  }

  function tryActivate() {
    if (isOwner()) { activate(); return true; }
    return false;
  }

  function boot() {
    if (tryActivate()) return;
    /* soma-owner.js may activate after we load (URL ?soma_owner_key=…). */
    window.addEventListener('soma-owner:activated', function () { activate(); });
    /* Brief poll covers race where soma-owner.js inits just after us. */
    var tries = 0;
    var iv = setInterval(function () {
      if (tryActivate() || ++tries > 20) clearInterval(iv);  /* ~5s max */
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ── Public API (debug / programmatic) ───────────────────────────────────── */
  window.SomaEdit = {
    version: '1.0',
    isActive: function () { return mounted; },
    enter: function () { if (isOwner()) { activate(); enterEdit(); } },
    exit: function () { exitEdit(false); },
    draft: lsGet,
    clearDraft: clearDraft,
    copyChanges: copyChanges
  };
}());
