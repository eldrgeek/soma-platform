/**
 * True while Supabase is mid-round-trip on an auth link (PKCE OAuth / magic-link
 * return, or a password-recovery hop). During this window the router must NOT
 * redirect or branch on session yet — the sign-in screen must finish the hop.
 *
 * @param {string} search
 * @param {string} hash
 * @returns {boolean}
 */
export function inAuthRoundTrip(search, hash) {
  const params = new URLSearchParams(search);
  return (
    params.get('recovery') === '1' ||
    params.has('code') ||
    hash.includes('access_token')
  );
}
