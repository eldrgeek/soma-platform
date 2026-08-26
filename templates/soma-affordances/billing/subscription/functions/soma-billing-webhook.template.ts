// ─────────────────────────────────────────────────────────────────────────────
// POST /api/soma-billing-webhook — signature-verified, idempotent Stripe
// webhook. The SINGLE writer of subscription entitlement status
// (SOMA-STD-billing.md §8: "Webhook handlers are the single writer of
// entitlement.status. Verify webhook signatures; make handlers idempotent.")
//
// Minimal implementable slice — B0-B2 only. This function answers exactly one
// question per subscriber: is their subscription active, past_due, or
// canceled? It does NOT implement metering (B4), BYOK (B3), or the pre-call
// spend gate (§4) — see SETUP.md "Billing" section.
//
// Security:
//   - constructEvent() verifies the Stripe-Signature header against
//     STRIPE_WEBHOOK_SECRET. An unverified body is never trusted or parsed.
//   - Idempotency: every event.id is inserted into public.stripe_events
//     (primary key = event.id) BEFORE any side effect. A duplicate Stripe
//     delivery (Stripe retries on anything but a 2xx) hits the primary-key
//     conflict and is a no-op, not a double-write.
//
// Setup:
//   1. Run sql/schema.sql (creates `subscriptions` + `stripe_events`).
//   2. Stripe Dashboard -> Developers -> Webhooks -> Add endpoint
//        URL: https://<your-site>/.netlify/functions/soma-billing-webhook
//        Events: checkout.session.completed, customer.subscription.updated,
//                customer.subscription.deleted, invoice.payment_failed
//   3. Copy the "Signing secret" (whsec_...) into Netlify env as
//      STRIPE_WEBHOOK_SECRET.
// ─────────────────────────────────────────────────────────────────────────────

import { getStripe } from './lib/stripeClient';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://{{SUPABASE_PROJECT_REF}}.supabase.co';

// Same PLANS map as soma-billing-checkout.ts — kept in sync at scaffold time
// from soma-app.json's billing.plans. Used to resolve a Stripe Price id back
// to this app's plan id when Stripe's event payload doesn't carry it directly.
const PLANS: Record<string, { priceId: string; monthlyUsd: number }> = {{BILLING_PLANS_JSON}};

function planIdForPrice(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  for (const [id, p] of Object.entries(PLANS)) {
    if (p.priceId === priceId) return id;
  }
  return null;
}

// Stripe subscription.status -> this app's simplified entitlement.status.
// (SOMA-STD-billing.md §1 defines the full entitlement shape; this collapses
// it to the three values an app actually needs to gate access at B0-B2.)
function mapStatus(stripeStatus: string): 'active' | 'past_due' | 'canceled' {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      // past_due, unpaid, incomplete, paused, etc. — all "not currently
      // entitled but not definitively gone" collapse to past_due.
      return 'past_due';
  }
}

async function supabaseRequest(path: string, init: any) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

// Returns true if this event.id was already recorded — i.e. this is a
// duplicate delivery and the caller must NOT reprocess it.
async function alreadyProcessed(eventId: string, eventType: string): Promise<boolean> {
  const res = await supabaseRequest('/rest/v1/stripe_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id: eventId, type: eventType }),
  });
  if (res.status === 409) return true; // primary-key conflict = seen before
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('23505') || text.toLowerCase().includes('duplicate key')) return true;
    console.error('soma-billing-webhook: stripe_events insert failed:', res.status, text);
    // Fail closed: better to let Stripe retry than risk a double-write on an
    // ambiguous DB error.
    throw new Error(`stripe_events insert failed: ${res.status}`);
  }
  return false;
}

async function upsertSubscription(row: Record<string, unknown>) {
  const res = await supabaseRequest('/rest/v1/subscriptions?on_conflict=stripe_subscription_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('soma-billing-webhook: subscriptions upsert failed:', res.status, text);
    throw new Error(`subscriptions upsert failed: ${res.status}`);
  }
}

export async function handler(event: any) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const signature = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('soma-billing-webhook: STRIPE_WEBHOOK_SECRET not set — refusing to process unverified webhook.');
    return { statusCode: 500, body: 'Webhook not configured' };
  }
  if (!signature) {
    return { statusCode: 400, body: 'Missing Stripe-Signature header' };
  }

  const stripe = getStripe();
  let stripeEvent: any;

  try {
    // Netlify Functions may base64-encode the raw body; Stripe's signature
    // check needs the exact raw bytes, not a re-serialized JSON.parse().
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.error('soma-billing-webhook: signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook signature verification failed: ${err.message}` };
  }

  try {
    if (await alreadyProcessed(stripeEvent.id, stripeEvent.type)) {
      return { statusCode: 200, body: JSON.stringify({ received: true, duplicate: true }) };
    }
  } catch {
    // Could not confirm dedup state — do not process; Stripe will retry.
    return { statusCode: 500, body: 'Dedup check failed' };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as any;
        if (session.mode !== 'subscription' || !session.subscription) break;
        const sub = await stripe.subscriptions.retrieve(session.subscription as string);
        const planId =
          planIdForPrice(sub.items.data[0]?.price?.id) || (session.metadata && session.metadata.plan_id) || 'unknown';
        await upsertSubscription({
          stripe_customer_id: sub.customer as string,
          stripe_subscription_id: sub.id,
          customer_email: session.customer_details?.email || null,
          plan_id: planId,
          status: mapStatus(sub.status),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        });
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object as any;
        const planId = planIdForPrice(sub.items?.data?.[0]?.price?.id);
        const row: Record<string, unknown> = {
          stripe_customer_id: sub.customer as string,
          stripe_subscription_id: sub.id,
          status: stripeEvent.type === 'customer.subscription.deleted' ? 'canceled' : mapStatus(sub.status),
          current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        };
        // Only set plan_id when resolved — omitting it leaves the existing
        // row's plan_id untouched (merge-duplicates only writes provided keys).
        if (planId) row.plan_id = planId;
        await upsertSubscription(row);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object as any;
        if (invoice.subscription) {
          await upsertSubscription({
            stripe_customer_id: invoice.customer as string,
            stripe_subscription_id: invoice.subscription as string,
            status: 'past_due',
          });
        }
        break;
      }
      default:
        // Unhandled event types are expected and fine to ignore.
        break;
    }
  } catch (err: any) {
    console.error('soma-billing-webhook: handler error:', err);
    return { statusCode: 500, body: 'Handler error' };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
