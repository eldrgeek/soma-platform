// ─────────────────────────────────────────────────────────────────────────────
// POST /api/soma-billing-checkout — create a Stripe Checkout Session in
// mode:'subscription' for one of this app's manifest-declared plans.
//
// Minimal implementable slice of SOMA-STD-billing.md (§9, phases B0-B2 only):
//   B0 — manifest (billing.plans in soma-app.json, baked into PLANS below)
//   B1 — this function IS the entitlement/spend boundary for now: the only
//        thing a subscriber can buy is a plan whose id is in PLANS.
//   B2 — hosted Checkout Session; soma-billing-webhook.ts reacts to the
//        lifecycle events and is the single writer of entitlement status.
// NOT implemented here — see SETUP.md "Billing" section:
//   B3 BYOK, B4 metered inference, the pre-call spend gate (§4).
//
// Request  JSON: { planId: string, customerEmail?: string }
// Response JSON: { url: string }  — redirect the browser to this Checkout URL.
//
// Secrets never leave this function. The browser never sees STRIPE_SECRET_KEY.
// ─────────────────────────────────────────────────────────────────────────────

import { getStripe, ConfigError } from './lib/stripeClient';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Baked in at scaffold time from soma-app.json's affordances.billing.plans.
// Keys are plan ids; values carry the Stripe Price id and the display price.
// To add/change a plan: edit the spec and re-scaffold, or edit this map
// directly (it is generated once, then owned by the app like any other file).
const PLANS: Record<string, { priceId: string; monthlyUsd: number }> = {{BILLING_PLANS_JSON}};

export async function handler(event: any) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  let body: any;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const planId = typeof body.planId === 'string' ? body.planId.trim() : '';
  const plan = PLANS[planId];
  if (!plan) {
    return json(400, {
      error: `Unknown planId "${planId}". Known plans: ${Object.keys(PLANS).join(', ') || '(none configured — add billing.plans to soma-app.json and re-scaffold)'}`,
    });
  }

  const customerEmail =
    typeof body.customerEmail === 'string' && body.customerEmail.trim()
      ? body.customerEmail.trim().slice(0, 255)
      : undefined;

  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: plan.priceId, quantity: 1 }],
      customer_email: customerEmail,
      success_url: `${siteUrl}/billing-thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/`,
      metadata: {
        soma_component: 'soma-billing/subscription-v0',
        plan_id: planId,
        site_name: '{{SITE_NAME}}',
      },
    });

    return json(200, { url: session.url });
  } catch (err: any) {
    if (err instanceof ConfigError) {
      console.error('soma-billing-checkout config error:', err.message);
      return json(err.status || 500, { error: err.message });
    }
    console.error('soma-billing-checkout error:', err);
    return json(502, { error: err?.message || 'Could not create Checkout Session' });
  }
}

function json(statusCode: number, obj: unknown) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
