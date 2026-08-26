// ─────────────────────────────────────────────────────────────────────────────
// POST /api/soma-stripe-webhook — Stripe webhook receiver, skeleton.
//
// v1 (donation-only) does NOT require this to be wired up — the Checkout
// success_url + thank-you page is enough for a one-time donation, since there
// is no entitlement to unlock and no subscription to reconcile. This file
// exists so an adopting app can turn it on with zero new plumbing the moment
// it needs server-confirmed fulfillment (e.g. crediting a ledger, sending a
// receipt email, or — per SOMA-STD-billing.md — writing a `meter` event).
//
// Verifies the Stripe signature (never trust an unverified POST body) and
// dispatches on event.type. Fulfillment logic is intentionally a stub —
// each adopting app fills in what "fulfillment" means for it.
//
// Setup once you want this live:
//   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
//        URL: https://<your-site>/.netlify/functions/soma-stripe-webhook
//        Events: checkout.session.completed (minimum)
//   2. Copy the "Signing secret" (whsec_...) into Netlify env as
//      STRIPE_WEBHOOK_SECRET.
// ─────────────────────────────────────────────────────────────────────────────

import { getStripe } from './lib/stripeClient';

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const signature = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('soma-stripe-webhook: STRIPE_WEBHOOK_SECRET not set — refusing to process unverified webhook.');
    return { statusCode: 500, body: 'Webhook not configured' };
  }
  if (!signature) {
    return { statusCode: 400, body: 'Missing Stripe-Signature header' };
  }

  const stripe = getStripe();
  let stripeEvent;

  try {
    // Netlify Functions may base64-encode the raw body; event.isBase64Encoded
    // tells you which. Stripe's signature check needs the exact raw bytes.
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body;
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('soma-stripe-webhook: signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook signature verification failed: ${err.message}` };
  }

  switch (stripeEvent.type) {
    case 'checkout.session.completed': {
      const session = stripeEvent.data.object as any;
      // STUB — adopting app fills this in. Examples:
      //   - append a `meter`/donation row to its own store
      //   - send a receipt email
      //   - if soma-relay: increment a public "total raised" counter
      console.log('soma-stripe-webhook: checkout.session.completed', {
        id: session.id,
        amount_total: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
      });
      break;
    }
    default:
      // Unhandled event types are expected and fine to ignore.
      break;
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
