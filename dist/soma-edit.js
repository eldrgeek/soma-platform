/* SOMA Edit v20260611 — in-place editable canonical content + frictionless feedback
 *
 * Integration (put both scripts in <head>, config before soma-edit.js):
 *
 *   <script src="https://soma-guide.netlify.app/soma-owner.js"></script>
 *   <script>
 *     window.SomaEditConfig = {
 *       siteId: 'my-site',                  // required — unique key for this site
 *       feedbackUrl: 'https://…/feedback',  // optional — POST endpoint for suggestions
 *     };
 *   </script>
 *   <script src="https://soma-guide.netlify.app/soma-edit.js"></script>
 *
 * Editable elements:
 *   <p data-soma-editable="hero-text">Default content shown until store loads</p>
 *
 * How it works:
 *   • All visitors: on load, canonical content is fetched from the store and
 *     injected into [data-soma-editable] elements (replaces default HTML).
 *   • Owners (SomaOwner.isOwner() === true): click any editable element to edit
 *     inline; Cmd/Ctrl+Enter or "Save" button persists to the store. Escape cancels.
 *   • Non-owners: a "Suggest a change" FAB posts to feedbackUrl (soma-guide pattern).
 */
(function (global) {
  'use strict';

  var cfg = global.SomaEditConfig || {};
  var STORE_URL = cfg.contentStoreUrl ||
    'https://soma-guide.netlify.app/.netlify/functions/soma-content';
  var SITE_ID = cfg.siteId || (
    typeof location !== 'undefined'
      ? location.hostname.replace(/[^a-z0-9-]/gi, '-')
      : 'unknown'
  );
  var FEEDBACK_URL = cfg.feedbackUrl || null;
  var FEEDBACK_LABEL = cfg.feedbackLabel || 'Suggest a change';

  /* ── Helpers ────────────────────────────────────────────────────────────── */

  function _ownerToken() {
    try { return localStorage.getItem('soma_owner'); } catch (e) { return null; }
  }

  function _isOwner() {
    if (global.SomaOwner && typeof global.SomaOwner.isOwner === 'function') {
      return global.SomaOwner.isOwner();
    }
    return false;
  }

  function _toast(msg, isError) {
    if (typeof document === 'undefined') return;
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = [
      'position:fixed', 'bottom:76px', 'left:50%', 'transform:translateX(-50%)',
      'background:' + (isError ? '#5c1a1a' : '#1a1714'),
      'color:#e8ddd0',
      'border:1px solid ' + (isError ? '#c84a3a' : '#c8933a'),
      'border-radius:999px', 'padding:10px 22px',
      'font:14px/1.4 system-ui,sans-serif',
      'z-index:2147483647', 'pointer-events:none',
      'box-shadow:0 4px 16px rgba(0,0,0,.45)',
      'opacity:1', 'transition:opacity .4s',
    ].join(';');
    document.body.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
    }, 3000);
  }

  /* ── Content store ──────────────────────────────────────────────────────── */

  function _fetchContent(key) {
    return fetch(
      STORE_URL +
        '?site=' + encodeURIComponent(SITE_ID) +
        '&key=' + encodeURIComponent(key)
    )
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.content != null) ? d.content : null; })
      .catch(function () { return null; });
  }

  function _saveContent(key, content) {
    return fetch(STORE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site: SITE_ID,
        key: key,
        content: content,
        token: _ownerToken(),
      }),
    }).then(function (r) { return r.json(); });
  }

  /* ── Load canonical content for all editable elements ───────────────────── */

  function _loadAllContent(elements) {
    if (!elements.length) return Promise.resolve();
    var promises = elements.map(function (el) {
      var key = el.dataset ? el.dataset.somaEditable : el.getAttribute('data-soma-editable');
      if (!key) return Promise.resolve();
      return _fetchContent(key).then(function (content) {
        if (content !== null) el.innerHTML = content;
        el.style.opacity = '';
        el.style.transition = '';
      });
    });
    return Promise.all(promises);
  }

  /* ── Owner inline editing ───────────────────────────────────────────────── */

  function _enableOwnerEditing(elements) {
    var style = document.createElement('style');
    style.textContent =
      '[data-soma-editable]{outline:2px dashed #c8933a!important;outline-offset:3px;cursor:text}' +
      '[data-soma-editable]:hover{outline-color:#d4a04a!important}' +
      '[data-soma-editable][data-soma-editing]{outline:2px solid #6366f1!important}' +
      '.soma-edit-hint{position:absolute;top:-24px;right:0;font:11px system-ui,sans-serif;' +
        'background:#c8933a;color:#fff;padding:2px 7px;border-radius:3px;pointer-events:none;' +
        'white-space:nowrap;z-index:2147483647}' +
      '.soma-save-bar{position:fixed;bottom:16px;right:16px;display:flex;gap:8px;z-index:2147483647}' +
      '.soma-save-bar button{padding:8px 18px;border:none;border-radius:6px;' +
        'font:600 14px system-ui,sans-serif;cursor:pointer;letter-spacing:.01em}' +
      '.soma-save-btn{background:#6366f1;color:#fff}' +
      '.soma-save-btn:hover{background:#4f46e5}' +
      '.soma-cancel-btn{background:#2a2720;color:#b8ad9e;border:1px solid #3a3733}' +
      '.soma-cancel-btn:hover{background:#3a3733}';
    document.head.appendChild(style);

    var activeEl = null;
    var savedHTML = null;
    var saveBar = null;
    var hint = null;

    function _showSaveBar() {
      if (saveBar) return;
      saveBar = document.createElement('div');
      saveBar.className = 'soma-save-bar';
      saveBar.innerHTML =
        '<button class="soma-cancel-btn">Cancel</button>' +
        '<button class="soma-save-btn">Save changes</button>';
      document.body.appendChild(saveBar);
      saveBar.querySelector('.soma-save-btn').addEventListener('click', _doSave);
      saveBar.querySelector('.soma-cancel-btn').addEventListener('click', _doCancel);
    }

    function _hideSaveBar() {
      if (saveBar && saveBar.parentNode) saveBar.parentNode.removeChild(saveBar);
      saveBar = null;
    }

    function _showHint(el) {
      if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
      hint = document.createElement('span');
      hint.className = 'soma-edit-hint';
      hint.textContent = '✏ click to edit';
      var wrapper = document.createElement('span');
      wrapper.style.cssText = 'position:relative;display:contents';
      el.parentNode.insertBefore(wrapper, el);
      wrapper.appendChild(el);
      wrapper.appendChild(hint);
    }

    function _removeHint() {
      if (hint && hint.parentNode) {
        var wrapper = hint.parentNode;
        if (wrapper.style && wrapper.style.position === 'relative') {
          wrapper.parentNode && wrapper.parentNode.insertBefore(activeEl || wrapper.firstChild, wrapper);
          wrapper.parentNode && wrapper.parentNode.removeChild(wrapper);
        } else {
          hint.parentNode.removeChild(hint);
        }
      }
      hint = null;
    }

    function _doSave() {
      if (!activeEl) return;
      var key = activeEl.dataset
        ? activeEl.dataset.somaEditable
        : activeEl.getAttribute('data-soma-editable');
      var content = activeEl.innerHTML;
      activeEl.contentEditable = 'false';
      activeEl.removeAttribute('data-soma-editing');
      _hideSaveBar();
      var el = activeEl;
      activeEl = null;
      savedHTML = null;

      _saveContent(key, content)
        .then(function (res) {
          if (res && res.ok) {
            _toast('Saved');
          } else {
            _toast('Save failed: ' + ((res && res.error) || 'unknown error'), true);
          }
        })
        .catch(function () { _toast('Save failed — network error', true); });
    }

    function _doCancel() {
      if (!activeEl) return;
      activeEl.innerHTML = savedHTML;
      activeEl.contentEditable = 'false';
      activeEl.removeAttribute('data-soma-editing');
      _hideSaveBar();
      activeEl = null;
      savedHTML = null;
    }

    elements.forEach(function (el) {
      el.style.position = el.style.position || 'relative';

      el.addEventListener('mouseenter', function () {
        if (activeEl === el) return;
        _showHint(el);
      });
      el.addEventListener('mouseleave', function () {
        if (activeEl === el) return;
        _removeHint();
      });

      el.addEventListener('click', function () {
        if (activeEl === el) return;
        if (activeEl) _doCancel();
        _removeHint();
        activeEl = el;
        savedHTML = el.innerHTML;
        el.contentEditable = 'true';
        el.setAttribute('data-soma-editing', '');
        el.focus();

        /* move cursor to end */
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        _showSaveBar();
      });

      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); _doSave(); }
        if (e.key === 'Escape') { e.preventDefault(); _doCancel(); }
      });
    });

    /* Click outside any editable element cancels the active edit */
    document.addEventListener('mousedown', function (e) {
      if (!activeEl) return;
      if (!activeEl.contains(e.target) && (!saveBar || !saveBar.contains(e.target))) {
        _doCancel();
      }
    });
  }

  /* ── Frictionless feedback affordance ───────────────────────────────────── */

  function _addFeedbackAffordance() {
    var style = document.createElement('style');
    style.textContent =
      '.soma-fb-fab{position:fixed;bottom:20px;right:20px;z-index:2147483646;' +
        'background:#1a1714;color:#c8933a;border:1px solid #c8933a;border-radius:999px;' +
        'padding:9px 18px;font:13px system-ui,sans-serif;cursor:pointer;' +
        'box-shadow:0 2px 12px rgba(0,0,0,.4);transition:background .15s,box-shadow .15s}' +
      '.soma-fb-fab:hover{background:#2a2420;box-shadow:0 4px 18px rgba(0,0,0,.5)}' +
      '.soma-fb-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);' +
        'z-index:2147483647;align-items:center;justify-content:center}' +
      '.soma-fb-overlay.open{display:flex}' +
      '.soma-fb-box{background:#1e1c1a;border:1px solid #3a3733;border-radius:12px;' +
        'padding:24px;width:min(420px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.5)}' +
      '.soma-fb-box h3{margin:0 0 12px;color:#e8ddd0;font:600 16px system-ui,sans-serif}' +
      '.soma-fb-box p{margin:0 0 12px;color:#a09585;font:13px/1.5 system-ui,sans-serif}' +
      '.soma-fb-box textarea{width:100%;box-sizing:border-box;min-height:96px;' +
        'background:#14120f;color:#e8ddd0;border:1px solid #3a3733;border-radius:8px;' +
        'padding:10px;font:14px/1.5 system-ui,sans-serif;resize:vertical;margin-bottom:12px}' +
      '.soma-fb-box textarea:focus{outline:none;border-color:#c8933a}' +
      '.soma-fb-actions{display:flex;gap:8px;justify-content:flex-end}' +
      '.soma-fb-submit{background:#c8933a;color:#1a1714;border:none;border-radius:6px;' +
        'padding:9px 18px;font:600 14px system-ui,sans-serif;cursor:pointer}' +
      '.soma-fb-submit:hover{background:#d4a04a}' +
      '.soma-fb-submit:disabled{opacity:.5;cursor:default}' +
      '.soma-fb-close{background:transparent;color:#888;border:none;' +
        'padding:9px 12px;font:14px system-ui,sans-serif;cursor:pointer}';
    document.head.appendChild(style);

    var fab = document.createElement('button');
    fab.className = 'soma-fb-fab';
    fab.setAttribute('aria-label', FEEDBACK_LABEL);
    fab.textContent = '✏ ' + FEEDBACK_LABEL;
    document.body.appendChild(fab);

    var overlay = document.createElement('div');
    overlay.className = 'soma-fb-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="soma-fb-box">' +
        '<h3>' + FEEDBACK_LABEL + '</h3>' +
        '<p>Your suggestion goes directly to the site owner.</p>' +
        '<textarea placeholder="What would you change or improve?"></textarea>' +
        '<div class="soma-fb-actions">' +
          '<button class="soma-fb-close">Cancel</button>' +
          '<button class="soma-fb-submit">Send suggestion</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var textarea = overlay.querySelector('textarea');
    var submitBtn = overlay.querySelector('.soma-fb-submit');

    function _open() { overlay.classList.add('open'); textarea.focus(); }
    function _close() { overlay.classList.remove('open'); textarea.value = ''; }

    fab.addEventListener('click', _open);
    overlay.querySelector('.soma-fb-close').addEventListener('click', _close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) _close();
    });

    submitBtn.addEventListener('click', function () {
      var text = textarea.value.trim();
      if (!text) { textarea.focus(); return; }

      submitBtn.textContent = 'Sending…';
      submitBtn.disabled = true;

      /* No endpoint: fallback to clipboard copy */
      if (!FEEDBACK_URL) {
        var clip = '[SOMA Feedback] ' + location.href + '\n\n' + text;
        (navigator.clipboard
          ? navigator.clipboard.writeText(clip)
          : Promise.reject()
        ).catch(function () {});
        _close();
        submitBtn.textContent = 'Send suggestion';
        submitBtn.disabled = false;
        _toast('Copied to clipboard (no feedback endpoint configured)');
        return;
      }

      /* POST — matches soma-guide feedback body schema */
      fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'feature',
          description: text,
          member_name: null,
          page_context: location.href,
          assistant_id: SITE_ID,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function () {
          _close();
          _toast('Suggestion sent — thanks!');
        })
        .catch(function () {
          _toast('Failed to send — check your connection', true);
        })
        .finally(function () {
          submitBtn.textContent = 'Send suggestion';
          submitBtn.disabled = false;
        });
    });
  }

  /* ── Init ───────────────────────────────────────────────────────────────── */

  function _init() {
    var els = document.querySelectorAll('[data-soma-editable]');
    var elements = Array.prototype.slice.call(els);

    /* Subtle fade while fetching canonical content (prevents jarring swap) */
    elements.forEach(function (el) {
      el.style.opacity = '0.72';
      el.style.transition = 'opacity 0.15s';
    });

    _loadAllContent(elements).then(function () {
      if (_isOwner()) {
        if (elements.length) _enableOwnerEditing(elements);
        /* Owners: no feedback FAB — they edit directly */
      } else {
        /* Non-owners: show feedback affordance regardless of editable elements */
        _addFeedbackAffordance();
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _init);
    } else {
      _init();
    }
  }

  /* Public API */
  global.SomaEdit = {
    version: '20260611',
    reload: _init,
  };

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
