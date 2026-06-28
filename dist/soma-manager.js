/* soma-manager.js — SOMA AI Manager widget v1.0
 * Reads window.SomaManagerConfig. No external deps.
 *
 * Config shape:
 *   window.SomaManagerConfig = {
 *     persona:   { name, avatar, greeting },
 *     domain:    { name },
 *     theme:     { primary },
 *     endpoints: { ask, feedback },   // default: /.netlify/functions/{ask,feedback}
 *   }
 *
 * Owner hook (future): if soma-owner.js is loaded and window.SomaOwner.isOwner()
 * returns true, an "Owner Panel" link appears in the footer. No other owner
 * features are exposed until soma-owner.js is present.
 */
(function () {
  'use strict';

  var cfg      = window.SomaManagerConfig || {};
  var persona  = Object.assign({ name: 'Assistant', avatar: '✦', greeting: 'Hi! Ask me anything about this site, or submit a bug or feature request.' }, cfg.persona || {});
  var domain   = Object.assign({ name: 'this site' }, cfg.domain || {});
  var theme    = Object.assign({ primary: '#5b6af0' }, cfg.theme || {});
  var ep       = Object.assign({ ask: '/.netlify/functions/ask', feedback: '/.netlify/functions/feedback' }, cfg.endpoints || {});

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var p = theme.primary;

  var css = [
    /* FAB */
    '.smgr-fab{position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;background:' + p + ';border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;box-shadow:0 2px 14px rgba(0,0,0,0.28);z-index:9998;transition:transform 0.15s,box-shadow 0.15s;}',
    '.smgr-fab:hover{transform:scale(1.08);box-shadow:0 4px 20px rgba(0,0,0,0.36);}',
    /* Panel */
    '.smgr-panel{position:fixed;bottom:88px;right:24px;width:340px;max-width:calc(100vw - 48px);background:#fff;border-radius:16px;box-shadow:0 8px 48px rgba(0,0,0,0.18);z-index:9999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;overflow:hidden;transform:translateY(14px) scale(0.96);opacity:0;transition:opacity 0.2s ease,transform 0.2s ease;pointer-events:none;}',
    '.smgr-panel.smgr-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}',
    /* Header */
    '.smgr-head{background:' + p + ';color:#fff;padding:14px 16px 12px;display:flex;align-items:center;gap:10px;}',
    '.smgr-head-avatar{font-size:20px;line-height:1;flex-shrink:0;}',
    '.smgr-head-info{flex:1;min-width:0;}',
    '.smgr-head-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.smgr-head-sub{font-size:10px;opacity:0.72;margin-top:1px;}',
    '.smgr-close{background:none;border:none;color:rgba(255,255,255,0.65);cursor:pointer;font-size:22px;line-height:1;padding:0 0 2px;display:flex;align-items:center;flex-shrink:0;}',
    '.smgr-close:hover{color:#fff;}',
    /* Tabs */
    '.smgr-tabs{display:flex;border-bottom:1px solid #eee;}',
    '.smgr-tab{flex:1;padding:10px 8px;font-size:12px;font-weight:500;background:none;border:none;cursor:pointer;color:#999;border-bottom:2px solid transparent;margin-bottom:-1px;transition:color 0.15s,border-color 0.15s;}',
    '.smgr-tab.smgr-active{color:' + p + ';border-bottom-color:' + p + ';}',
    /* Body */
    '.smgr-body{padding:14px 16px 10px;}',
    '.smgr-greeting{font-size:12px;color:#666;line-height:1.65;margin-bottom:10px;}',
    /* Response area */
    '.smgr-response{font-size:12px;color:#333;line-height:1.75;background:#f5f6fa;border-radius:8px;padding:10px 12px;margin-bottom:10px;display:none;}',
    '.smgr-response.smgr-visible{display:block;}',
    '.smgr-response.smgr-error{background:#fff3f3;color:#c0392b;}',
    /* Textarea */
    '.smgr-textarea{width:100%;resize:vertical;border:1px solid #e0e0e0;border-radius:8px;padding:8px 10px;font-size:12px;font-family:inherit;line-height:1.55;min-height:60px;box-sizing:border-box;outline:none;transition:border-color 0.15s;}',
    '.smgr-textarea:focus{border-color:' + p + ';}',
    /* Select */
    '.smgr-select{width:100%;border:1px solid #e0e0e0;border-radius:8px;padding:7px 10px;font-size:12px;font-family:inherit;margin-bottom:8px;background:#fff;outline:none;box-sizing:border-box;}',
    /* Button */
    '.smgr-btn{width:100%;margin-top:8px;padding:9px;background:' + p + ';color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:opacity 0.15s;}',
    '.smgr-btn:disabled{opacity:0.45;cursor:default;}',
    /* Confirmation */
    '.smgr-confirm{font-size:11px;color:#27ae60;text-align:center;margin-top:8px;display:none;}',
    '.smgr-confirm.smgr-visible{display:block;}',
    /* Panes */
    '.smgr-pane{display:none;}',
    '.smgr-pane.smgr-active{display:block;}',
    /* Footer */
    '.smgr-footer{text-align:center;font-size:10px;color:#ccc;padding:7px 16px 12px;border-top:1px solid #f0f0f0;}',
    '.smgr-footer a{color:#ccc;text-decoration:none;}',
    '.smgr-footer a:hover{color:#999;}',
  ].join('');

  var html = [
    '<button class="smgr-fab" id="smgr-fab" aria-label="Open SOMA Assistant">' + esc(persona.avatar) + '</button>',
    '<div class="smgr-panel" id="smgr-panel" role="dialog" aria-label="SOMA AI Manager">',
      '<div class="smgr-head">',
        '<span class="smgr-head-avatar">' + esc(persona.avatar) + '</span>',
        '<div class="smgr-head-info">',
          '<div class="smgr-head-name">' + esc(persona.name) + '</div>',
          '<div class="smgr-head-sub">Scoped to ' + esc(domain.name) + ' + SOMA</div>',
        '</div>',
        '<button class="smgr-close" id="smgr-close" aria-label="Close">&times;</button>',
      '</div>',
      '<div class="smgr-tabs">',
        '<button class="smgr-tab smgr-active" data-pane="ask">Ask</button>',
        '<button class="smgr-tab" data-pane="report">Report</button>',
      '</div>',
      '<div class="smgr-body">',
        '<div class="smgr-pane smgr-active" id="smgr-pane-ask">',
          '<p class="smgr-greeting">' + esc(persona.greeting) + '</p>',
          '<div class="smgr-response" id="smgr-ask-response"></div>',
          '<textarea class="smgr-textarea" id="smgr-ask-input" placeholder="Ask a question…" rows="2"></textarea>',
          '<button class="smgr-btn" id="smgr-ask-btn">Ask</button>',
        '</div>',
        '<div class="smgr-pane" id="smgr-pane-report">',
          '<p class="smgr-greeting">Found something broken, or have an idea? Let Mike know.</p>',
          '<select class="smgr-select" id="smgr-report-type">',
            '<option value="bug">Bug — something is broken</option>',
            '<option value="feature">Feature request — something to add</option>',
            '<option value="other">Other feedback</option>',
          '</select>',
          '<textarea class="smgr-textarea" id="smgr-report-input" placeholder="Describe the issue or idea…" rows="3"></textarea>',
          '<button class="smgr-btn" id="smgr-report-btn">Submit</button>',
          '<div class="smgr-confirm" id="smgr-report-confirm">✓ Received — thank you!</div>',
        '</div>',
      '</div>',
      '<div class="smgr-footer">',
        'Powered by <a href="https://siliconchildren.org" target="_blank" rel="noopener">SOMA</a>',
        '<span id="smgr-owner-link"></span>',
      '</div>',
    '</div>',
  ].join('');

  function mount() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);

    var fab     = document.getElementById('smgr-fab');
    var panel   = document.getElementById('smgr-panel');
    var close   = document.getElementById('smgr-close');
    var tabs    = document.querySelectorAll('.smgr-tab');
    var panes   = document.querySelectorAll('.smgr-pane');

    fab.addEventListener('click', function () {
      panel.classList.toggle('smgr-open');
    });
    close.addEventListener('click', function () {
      panel.classList.remove('smgr-open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') panel.classList.remove('smgr-open');
    });

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-pane');
        tabs.forEach(function (t) { t.classList.remove('smgr-active'); });
        panes.forEach(function (p2) { p2.classList.remove('smgr-active'); });
        tab.classList.add('smgr-active');
        var pane = document.getElementById('smgr-pane-' + target);
        if (pane) pane.classList.add('smgr-active');
      });
    });

    /* ── Ask ── */
    var askInput = document.getElementById('smgr-ask-input');
    var askBtn   = document.getElementById('smgr-ask-btn');
    var askResp  = document.getElementById('smgr-ask-response');

    function doAsk() {
      var q = askInput.value.trim();
      if (!q) return;
      askBtn.disabled = true;
      askBtn.textContent = 'Thinking…';
      askResp.textContent = '';
      askResp.classList.remove('smgr-visible', 'smgr-error');

      fetch(ep.ask, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          askResp.textContent = d.answer || d.error || 'No answer returned.';
          if (d.error) askResp.classList.add('smgr-error');
          askResp.classList.add('smgr-visible');
        })
        .catch(function () {
          askResp.textContent = 'Something went wrong — please try again.';
          askResp.classList.add('smgr-visible', 'smgr-error');
        })
        .then(function () {
          askBtn.disabled = false;
          askBtn.textContent = 'Ask';
        });
    }

    askBtn.addEventListener('click', doAsk);
    askInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAsk(); }
    });

    /* ── Report ── */
    var reportType  = document.getElementById('smgr-report-type');
    var reportInput = document.getElementById('smgr-report-input');
    var reportBtn   = document.getElementById('smgr-report-btn');
    var reportConf  = document.getElementById('smgr-report-confirm');

    reportBtn.addEventListener('click', function () {
      var msg = reportInput.value.trim();
      if (!msg) return;
      reportBtn.disabled = true;
      reportBtn.textContent = 'Sending…';

      fetch(ep.feedback, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reportType.value,
          message: msg,
          page: window.location.href,
        }),
      })
        .then(function () {
          reportConf.textContent = '✓ Received — thank you!';
          reportConf.classList.add('smgr-visible');
          reportInput.value = '';
          setTimeout(function () { reportConf.classList.remove('smgr-visible'); }, 4000);
        })
        .catch(function () {
          reportConf.textContent = 'Error — please try again.';
          reportConf.classList.add('smgr-visible');
        })
        .then(function () {
          reportBtn.disabled = false;
          reportBtn.textContent = 'Submit';
        });
    });

    /* ── Owner hook — soma-owner.js integration point ── */
    setTimeout(function () {
      try {
        if (window.SomaOwner && typeof window.SomaOwner.isOwner === 'function' && window.SomaOwner.isOwner()) {
          var link = document.getElementById('smgr-owner-link');
          if (link) {
            link.innerHTML = ' · <a href="/soma-owner.html" style="color:' + esc(p) + '">Owner Panel</a>';
          }
        }
      } catch (_) {}
    }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
}());
