// soma-stripe/lib/stripeClient.ts
//
// The ONE place a Stripe secret key is read. Per SOMA-STD-billing.md and the
// Playmaker Netlify Functions boundary (playmaker/netlify/functions/README.md):
// "Netlify Functions — the only place secrets live." Browser code never sees
// STRIPE_SECRET_KEY; it only ever gets a publishable key (pk_...).
//
// STRIPE_SECRET_KEY is read from Netlify env at runtime. Test mode = a key
// starting with `sk_test_`. Live mode = `sk_live_...` — swapping the env var
// value is the *entire* test→live migration; no code change.

import Stripe from 'stripe';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ConfigError(
      'STRIPE_SECRET_KEY is not set. Add a Stripe test-mode secret key ' +
        '(sk_test_...) to this site\'s Netlify env — see soma-stripe/README.md §Setup.'
    );
  }
  if (!key.startsWith('sk_test_') && !key.startsWith('sk_live_')) {
    throw new ConfigError('STRIPE_SECRET_KEY does not look like a Stripe secret key (expected sk_test_... or sk_live_...).');
  }

  cached = new Stripe(key, {
    apiVersion: '2024-06-20',
  });
  return cached;
}

export function isLiveMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live_');
}

export class ConfigError extends Error {
  status = 500;
}
