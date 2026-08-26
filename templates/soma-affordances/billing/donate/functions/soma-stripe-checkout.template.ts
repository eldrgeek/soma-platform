// ─────────────────────────────────────────────────────────────────────────────
// POST /api/soma-stripe-checkout — create a Stripe Checkout Session for a
// one-time donation, v1 of the soma-stripe portable component.
//
// Contract (SOMA-STD-billing.md-adjacent, but deliberately smaller — this is
// the "one-time donation" slice, not entitlements/metering/BYOK):
//   Request  JSON: { amountUsd: number, siteName?: string, note?: string }
//   Response JSON: { url: string }  — redirect the browser to this Checkout URL.
//
// Secrets never leave this function. The browser never sees STRIPE_SECRET_KEY.
// ─────────────────────────────────────────────────────────────────────────────

import { getStripe, ConfigError } from './lib/stripeClient';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MIN_USD = 1;
const MAX_USD = 10000; // sanity ceiling; adjust per app if needed

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

  const amountUsd = Number(body.amountUsd);
  if (!Number.isFinite(amountUsd) || amountUsd < MIN_USD || amountUsd > MAX_USD) {
    return json(400, { error: `amountUsd must be a number between ${MIN_USD} and ${MAX_USD}` });
  }

  const siteName = typeof body.siteName === 'string' && body.siteName.trim()
    ? body.siteName.trim().slice(0, 80)
    : 'this site';
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined;

  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888';

  try {
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Donation to ${siteName}`,
              description: note || undefined,
            },
            unit_amount: Math.round(amountUsd * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/`,
      metadata: {
        soma_component: 'soma-stripe/v1',
        site_name: siteName,
      },
    });

    return json(200, { url: session.url });
  } catch (err: any) {
    if (err instanceof ConfigError) {
      console.error('soma-stripe-checkout config error:', err.message);
      return json(err.status || 500, { error: err.message });
    }
    console.error('soma-stripe-checkout error:', err);
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
