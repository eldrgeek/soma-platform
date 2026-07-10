/**
 * Shared auth gate + shell chrome for Assist Fleet pages.
 */
(function (global) {
  'use strict';

  function requireSession(onReady) {
    document.documentElement.style.visibility = 'hidden';
    if (!global.SomaAuth) {
      location.replace('login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() || 'instances.html'));
      return;
    }
    SomaAuth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') {
        location.replace('login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() || 'instances.html'));
        return;
      }
      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return;
      if (!session || !session.user) {
        location.replace('login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() || 'instances.html'));
        return;
      }
      document.documentElement.style.visibility = '';
      onReady(session);
    });
    SomaAuth.init();
  }

  function renderShell(active, userEmail) {
    var top = document.querySelector('[data-fleet-topbar]');
    if (!top) return;
    top.innerHTML = [
      '<div class="brand"><strong>Assist Fleet</strong><span>Yeshie · Adrian · Common</span></div>',
      '<nav class="nav">',
      '  <a href="instances.html"' + (active === 'instances' ? ' class="active"' : '') + '>Instances</a>',
      '  <a href="review.html"' + (active === 'review' ? ' class="active"' : '') + '>Review</a>',
      '  <button type="button" class="btn" data-fleet-signout>Sign out</button>',
      '</nav>',
      '<div class="userchip" data-fleet-user></div>'
    ].join('');
    var userEl = top.querySelector('[data-fleet-user]');
    if (userEl) userEl.textContent = userEmail || '';
    var btn = top.querySelector('[data-fleet-signout]');
    if (btn) {
      btn.addEventListener('click', function () {
        SomaAuth.signOut().then(function () {
          location.replace('login.html');
        });
      });
    }
  }

  function createDataClient(session) {
    var cfg = global.SOMA_AUTH_CONFIG || {};
    return global.AssistFleetData.createFleetDataClient({
      url: cfg.url,
      anonKey: cfg.anonKey,
      getAccessToken: function () {
        return Promise.resolve(session && session.access_token);
      }
    });
  }

  global.AssistFleetGate = {
    requireSession: requireSession,
    renderShell: renderShell,
    createDataClient: createDataClient
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
