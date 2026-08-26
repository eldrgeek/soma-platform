/*!
 * soma-billing-subscribe.js — SOMA billing widget, subscription mode
 * (B0-B2 slice of SOMA-STD-billing.md: manifest -> hosted Checkout ->
 * webhook-driven entitlement.status; no metering, no BYOK, no spend gate.)
 *
 * Zero-dependency frontend widget: renders one button per plan declared via
 * data-plans, POSTs { planId } to the checkout endpoint, and redirects the
 * browser to the Stripe-hosted Checkout URL it returns. No Stripe.js, no
 * publishable key needed — Checkout Session creation is entirely
 * server-driven (same pattern as soma-stripe-donate.js's donate widget).
 *
 * Copy this file + soma-billing-subscribe.css into any static site, then add:
 *
 *   <link rel="stylesheet" href="/vendor/soma-billing/soma-billing-subscribe.css">
 *   <script src="/vendor/soma-billing/soma-billing-subscribe.js"
 *           data-endpoint="/api/soma-billing-checkout"
 *           data-plans="pro:Pro:10;team:Team:25"
 *           defer></script>
 *   <div data-soma-subscribe></div>
 *
 * Config via data-* attributes on the script tag:
 *   data-endpoint   optional; defaults to "/api/soma-billing-checkout"
 *                   (works out of the box with the standard Netlify
 *                   /api/* -> /.netlify/functions/:splat redirect).
 *   data-plans      required; "<id>:<label>:<monthlyUsd>" triples,
 *                   semicolon-separated, e.g. "pro:Pro:10;team:Team:25".
 *                   ids must match soma-app.json's billing.plans[].id.
 *
 * Every element with [data-soma-subscribe] on the page is replaced with a
 * plan picker (one button per plan). Clicking a plan disables it, POSTs
 * {planId} to the endpoint, and redirects to the returned Checkout URL.
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

  var ENDPOINT = script.getAttribute('data-endpoint') || '/api/soma-billing-checkout';
  var PLANS = (script.getAttribute('data-plans') || '')
    .split(';')
    .map(function (s) { return s.trim(); })
    .filter(Boolean)
    .map(function (triple) {
      var parts = triple.split(':');
      return { id: parts[0], label: parts[1] || parts[0], monthlyUsd: parts[2] };
    });

  function startCheckout(planId, btn, errorEl) {
    btn.disabled = true;
    var original = btn.textContent;
    btn.textContent = 'Redirecting…';
    errorEl.style.display = 'none';

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: planId }),
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
        btn.disabled = false;
        btn.textContent = original;
        errorEl.textContent = err.message || 'Something went wrong. Try again.';
        errorEl.style.display = 'block';
      });
  }

  function render(container) {
    var wrap = document.createElement('div');
    wrap.className = 'soma-billing-plans';

    var errorEl = document.createElement('div');
    errorEl.className = 'soma-billing-error';
    errorEl.style.display = 'none';

    PLANS.forEach(function (plan) {
      var card = document.createElement('div');
      card.className = 'soma-billing-plan';

      var label = document.createElement('div');
      label.className = 'soma-billing-plan-label';
      label.textContent = plan.label + (plan.monthlyUsd ? ' — $' + plan.monthlyUsd + '/mo' : '');
      card.appendChild(label);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'soma-billing-plan-btn';
      btn.textContent = 'Subscribe';
      btn.addEventListener('click', function () {
        startCheckout(plan.id, btn, errorEl);
      });
      card.appendChild(btn);

      wrap.appendChild(card);
    });

    wrap.appendChild(errorEl);
    container.appendChild(wrap);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var containers = document.querySelectorAll('[data-soma-subscribe]');
    for (var i = 0; i < containers.length; i++) render(containers[i]);
  });
})();
