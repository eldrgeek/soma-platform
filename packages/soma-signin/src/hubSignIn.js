// Google sign-in through the SOMA sign-in hub (soma-auth-relay `/google`).
//
// Why a hub: Google caps an unverified OAuth client at 10 authorized domains
// and SOMA has ~50 apps; with Supabase's own redirect, Google's picker shows
// "<project>.supabase.co". The hub is the one address Google sees. It checks
// the app against the SOMA allow-list, signs in to Supabase with Google's ID
// token, and returns here with the session in the URL fragment.

/**
 * Where the Google button sends the browser.
 * @param {string} hub  e.g. "https://soma-auth-relay.netlify.app"
 * @param {string} returnTo  this app's sign-in URL (must be on the allow-list)
 */
export function hubGoogleUrl(hub, returnTo) {
  return `${String(hub).replace(/\/+$/, '')}/google?to=${encodeURIComponent(returnTo)}`;
}

/**
 * The session the hub put in the fragment, or null. Only a fragment that the
 * hub shaped (provider=google plus both tokens) counts.
 * @param {string} hash  location.hash
 * @returns {{ access_token: string; refresh_token: string } | null}
 */
export function readHubSession(hash) {
  if (!hash || hash.length < 2) return null;
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (!access_token || !refresh_token || p.get('provider') !== 'google') return null;
  return { access_token, refresh_token };
}

/** True when the Google button should go through the hub. */
export function shouldUseGoogleHub(config) {
  return Boolean(config && config.googleHub);
}
