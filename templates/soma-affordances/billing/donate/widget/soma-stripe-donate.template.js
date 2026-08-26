/*!
 * soma-stripe-donate.js — SOMA App Standard billing extension, v1 slice
 * (one-time donation via Stripe Checkout, test-mode by default)
 * v1 — 2026-08-05, built by Dee (Sonnet) for Mike Wolf, in response to
 * James Crook / Triquetra wanting a donate button on his own site.
 *
 * A single embeddable, framework-free donate button. Zero dependencies,
 * zero Stripe.js load — Checkout is server-created and the browser just
 * redirects to the URL Stripe returns. This keeps the browser bundle from
 * ever touching a Stripe key at all (not even the publishable one is
 * required for this flow — see README "Why no Stripe.js").
 *
 * Copy this file + soma-stripe-donate.css into any static site, then add:
 *
 *   <link rel="stylesheet" href="/vendor/soma-stripe/soma-stripe-donate.css">
 *   <script src="/vendor/soma-stripe/soma-stripe-donate.js"
 *           data-site="my-site-name"
 *           data-endpoint="/api/soma-stripe-checkout"
 *           data-amounts="5,10,25,50"
 *           defer></script>
 *   <button data-soma-donate>Donate</button>
 *
 * Config via data-* attributes on the script tag:
 *   data-endpoint   optional; defaults to "/api/soma-stripe-checkout"
 *                   (works out of the box with the standard Netlify
 *                   /api/* -> /.netlify/functions/:splat redirect).
 *   data-site       optional; short app/site identifier shown on the
 *                   Stripe Checkout line item ("Donation to <site>").
 *   data-amounts    optional; comma-separated preset USD amounts,
 *                   default "5,10,25,50".
 *   data-label      optional; button label, default "Donate".
 *
 * Any element with [data-soma-donate] on the page opens the widget's modal
 * (amount picker -> redirect to Stripe Checkout). No global CSS/JS
 * collisions — everything is scoped under .soma-stripe-*.
 */
(function () {
  'use strict';

  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  var script =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  var ENDPOINT = script.getAttribute('data-endpoint') || '/api/soma-stripe-checkout';
  var SITE = script.getAttribute('data-site') || document.title || 'this site';
  var LABEL = script.getAttribute('data-label') || 'Donate';
  var AMOUNTS = (script.getAttribute('data-amounts') || '5,10,25,50')
    .split(',')
    .map(function (s) { return parseFloat(s.trim()); })
    .filter(function (n) { return Number.isFinite(n) && n > 0; });

  var modal = null;

  function buildModal() {
    var overlay = document.createElement('div');
    overlay.className = 'soma-stripe-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', LABEL + ' — ' + SITE);

    var panel = document.createElement('div');
    panel.className = 'soma-stripe-panel';

    var title = document.createElement('div');
    title.className = 'soma-stripe-title';
    title.textContent = LABEL + ' to ' + SITE;
    panel.appendChild(title);

    var sub = document.createElement('div');
    sub.className = 'soma-stripe-sub';
    sub.textContent = 'One-time, via Stripe. Pick an amount or enter your own.';
    panel.appendChild(sub);

    var amountsRow = document.createElement('div');
    amountsRow.className = 'soma-stripe-amounts';
    var selected = AMOUNTS.length ? AMOUNTS[Math.min(1, AMOUNTS.length - 1)] : 10;

    var customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.min = '1';
    customInput.step = '1';
    customInput.className = 'soma-stripe-custom';
    customInput.placeholder = 'Custom $';

    function markSelected(el) {
      var buttons = amountsRow.querySelectorAll('.soma-stripe-amount-btn');
      for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('is-selected');
      if (el) el.classList.add('is-selected');
    }

    AMOUNTS.forEach(function (amt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'soma-stripe-amount-btn';
      b.textContent = '$' + amt;
      b.addEventListener('click', function () {
        selected = amt;
        customInput.value = '';
        markSelected(b);
      });
      amountsRow.appendChild(b);
      if (amt === selected) markSelected(b);
    });
    panel.appendChild(amountsRow);

    customInput.addEventListener('input', function () {
      var v = parseFloat(customInput.value);
      if (Number.isFinite(v) && v > 0) {
        selected = v;
        markSelected(null);
      }
    });
    panel.appendChild(customInput);

    var error = document.createElement('div');
    error.className = 'soma-stripe-error';
    error.style.display = 'none';
    panel.appendChild(error);

    var actions = document.createElement('div');
    actions.className = 'soma-stripe-actions';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'soma-stripe-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);
    actions.appendChild(cancelBtn);

    var goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'soma-stripe-go';
    goBtn.textContent = 'Continue to Stripe';
    goBtn.addEventListener('click', function () {
      startCheckout(selected, goBtn, error);
    });
    actions.appendChild(goBtn);

    panel.appendChild(actions);
    overlay.appendChild(panel);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape' && modal) closeModal();
    });

    return overlay;
  }

  function startCheckout(amountUsd, goBtn, errorEl) {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      showError(errorEl, 'Pick or enter an amount first.');
      return;
    }
    goBtn.disabled = true;
    goBtn.textContent = 'Redirecting…';
    errorEl.style.display = 'none';

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountUsd: amountUsd, siteName: SITE }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Checkout could not be created.');
          return data;
        });
      })
      .then(function (data) {
        if (!data.url) throw new Error('No Checkout URL returned.');
        window.location.href = data.url;
      })
      .catch(function (err) {
        goBtn.disabled = false;
        goBtn.textContent = 'Continue to Stripe';
        showError(errorEl, err.message || 'Something went wrong. Try again.');
      });
  }

  function showError(errorEl, msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }

  function openModal() {
    if (modal) return;
    modal = buildModal();
    document.body.appendChild(modal);
    requestAnimationFrame(function () {
      modal.classList.add('is-open');
    });
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove('is-open');
    var toRemove = modal;
    modal = null;
    setTimeout(function () {
      if (toRemove.parentNode) toRemove.parentNode.removeChild(toRemove);
    }, 150);
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest ? e.target.closest('[data-soma-donate]') : null;
    if (trigger) {
      e.preventDefault();
      openModal();
    }
  });
})();
