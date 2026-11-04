// Google's own sign-in (Google Identity Services) for SOMA Auth.
//
// Why: with the redirect flow, Google's account picker says "to continue to
// <project>.supabase.co", because Supabase is the OAuth client. With Google
// Identity Services the app's page asks Google for an ID token directly, so
// Google shows the app's own site, and the token is handed to Supabase with
// signInWithIdToken. Same Supabase user, same somaId: no change to linking.
//
// Pure helpers here; the React button lives in react/GoogleSignInButton.tsx.

export const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** @param {ArrayBuffer} buf */
function toHex(buf) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A fresh nonce pair. Google gets the SHA-256 hash; Supabase gets the raw value
 * and checks that the token's nonce is its hash, so a replayed token fails.
 *
 * @param {{ crypto?: Crypto }} [options]
 * @returns {Promise<{ raw: string; hashed: string }>}
 */
export async function createNoncePair(options = {}) {
  const c = options.crypto ?? globalThis.crypto;
  const bytes = new Uint8Array(32);
  c.getRandomValues(bytes);
  const raw = toHex(bytes.buffer);
  const hashed = toHex(await c.subtle.digest('SHA-256', new TextEncoder().encode(raw)));
  return { raw, hashed };
}

/**
 * True when the Google button should use Google Identity Services: a client ID
 * is configured and Google is one of the providers being shown.
 *
 * @param {{ googleClientId?: string }} config
 * @param {string[]} shownProviders
 */
export function shouldUseGoogleIdentity(config, shownProviders) {
  return Boolean(config?.googleClientId) && shownProviders.includes('google');
}

let gsiPromise = null;

/**
 * Load the Google Identity Services script once. Resolves to `google.accounts.id`
 * or null when it can't load (blocked, offline), so callers fall back to the
 * redirect flow.
 *
 * @param {{ document?: Document; timeoutMs?: number }} [options]
 * @returns {Promise<any | null>}
 */
export function loadGoogleIdentity(options = {}) {
  const doc = options.document ?? globalThis.document;
  const win = doc?.defaultView ?? globalThis;
  if (win?.google?.accounts?.id) return Promise.resolve(win.google.accounts.id);
  if (!doc) return Promise.resolve(null);
  if (gsiPromise) return gsiPromise;
  const timeoutMs = options.timeoutMs ?? 6000;
  gsiPromise = new Promise((resolve) => {
    const done = (value) => {
      clearTimeout(timer);
      if (!value) gsiPromise = null;
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    const script = doc.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => done(win.google?.accounts?.id ?? null);
    script.onerror = () => done(null);
    doc.head.appendChild(script);
  });
  return gsiPromise;
}
