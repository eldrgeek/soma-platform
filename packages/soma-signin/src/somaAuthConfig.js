/**
 * @typedef {Object} SomaAuthMethods
 * @property {boolean} magicLink
 * @property {boolean} emailOtp
 * @property {boolean} password
 * @property {boolean} phone
 * @property {string[]} oauth
 */

/**
 * @typedef {Object} SomaAuthConfig
 * @property {string} url
 * @property {string} anonKey
 * @property {SomaAuthMethods} methods
 * @property {string} [googleClientId] Google OAuth Web client ID. When set, the
 *   Google button uses Google's own sign-in (Google Identity Services) and hands
 *   the ID token to Supabase, so Google's screen shows the app's site instead of
 *   the Supabase project address. Must be the same client ID configured on the
 *   Supabase Google provider (or listed in its authorized client IDs).
 */

/**
 * The sign-in providers SOMA offers, in display order. Google is always first
 * (Mike, 2026-11-03: "Sign in with Google should have the Google logo and
 * first"). Ids are Supabase's provider ids: Microsoft is `azure`.
 */
export const SOMA_OAUTH_PROVIDERS = Object.freeze(['google', 'github', 'azure', 'apple', 'facebook']);

/**
 * Shown when the live provider check cannot run (offline, settings endpoint
 * down). Google is the one provider known to be on in the shared project, so
 * the screen never shows buttons that would fail.
 */
export const FALLBACK_ENABLED_PROVIDERS = Object.freeze(['google']);

/** Names people type for a provider, mapped to the Supabase id. */
const PROVIDER_ALIASES = { microsoft: 'azure', linkedin: 'linkedin_oidc', x: 'twitter' };

/** @type {SomaAuthMethods} */
export const DEFAULT_SOMA_AUTH_METHODS = {
  magicLink: true,
  emailOtp: false,
  password: true,
  phone: false,
  // Every SOMA provider; the screen shows only those Supabase reports enabled,
  // so turning one on in Supabase adds its button to every app with no deploy.
  oauth: [...SOMA_OAUTH_PROVIDERS],
};

/**
 * @param {string} provider
 * @returns {string}
 */
export function normalizeProvider(provider) {
  const id = String(provider ?? '').trim().toLowerCase();
  return PROVIDER_ALIASES[id] ?? id;
}

/**
 * Normalize, de-duplicate and sort providers: SOMA's order first (Google
 * leads), then any others in the order given.
 *
 * @param {string[]} providers
 * @returns {string[]}
 */
export function orderProviders(providers) {
  const seen = new Set();
  const ids = [];
  for (const raw of providers ?? []) {
    const id = normalizeProvider(raw);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  const rank = (id) => {
    const i = SOMA_OAUTH_PROVIDERS.indexOf(id);
    return i === -1 ? SOMA_OAUTH_PROVIDERS.length : i;
  };
  return ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i)
    .map((x) => x.id);
}

/**
 * Keep the wanted providers that Supabase's public settings report enabled.
 * `settings` is the JSON from GET /auth/v1/settings (`{ external: { github: true } }`).
 * With no usable settings, falls back to FALLBACK_ENABLED_PROVIDERS.
 *
 * @param {string[]} wanted
 * @param {{ external?: Record<string, boolean> } | null | undefined} settings
 * @returns {string[]}
 */
export function enabledProviders(wanted, settings) {
  const ordered = orderProviders(wanted);
  const external = settings && typeof settings === 'object' ? settings.external : null;
  if (!external || typeof external !== 'object') {
    return ordered.filter((id) => FALLBACK_ENABLED_PROVIDERS.includes(id));
  }
  return ordered.filter((id) => external[id] === true);
}

/**
 * Ask the Supabase project which providers are switched on. Public endpoint;
 * needs only the anon key. Never throws: returns null on any failure.
 *
 * @param {{ url: string; anonKey: string; fetchImpl?: typeof fetch; timeoutMs?: number }} options
 * @returns {Promise<{ external?: Record<string, boolean> } | null>}
 */
export async function fetchAuthSettings({ url, anonKey, fetchImpl, timeoutMs = 4000 }) {
  const f = fetchImpl ?? globalThis.fetch;
  if (!url || !anonKey || typeof f !== 'function') return null;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await f(`${url.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      signal: ctrl?.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Extra signInWithOAuth options a provider needs. Microsoft (azure) only
 * returns the user's email when the `email` scope is asked for, and without an
 * email the account cannot link to the same somaId as the person's other
 * sign-ins.
 *
 * @param {string} provider
 * @returns {{ scopes?: string }}
 */
export function providerOAuthOptions(provider) {
  if (normalizeProvider(provider) === 'azure') return { scopes: 'email' };
  return {};
}

/**
 * @param {object} options
 * @param {string} [options.url]
 * @param {string} [options.anonKey]
 * @param {Partial<SomaAuthMethods>} [options.methods]
 * @param {string} [options.googleClientId]
 * @returns {SomaAuthConfig}
 */
export function createSomaAuthConfig(options = {}) {
  const methods = { ...DEFAULT_SOMA_AUTH_METHODS, ...(options.methods ?? {}) };
  methods.oauth = orderProviders(options.methods?.oauth ?? methods.oauth);
  return {
    url: options.url ?? '',
    anonKey: options.anonKey ?? '',
    methods,
    ...(options.googleClientId ? { googleClientId: String(options.googleClientId).trim() } : {}),
  };
}

// Colors follow each provider's published button guidance: Google's light
// button (#fff, #747775 border, #1f1f1f text), Microsoft's light button
// (#fff, #8c8c8c border, #5e5e5e text), Apple's black button, GitHub's dark
// button and Facebook blue.
/** @type {Record<string, { label: string; color: string; text: string; border: string }>} */
const PROVIDER_META = {
  google: { label: 'Google', color: '#ffffff', text: '#1f1f1f', border: '#747775' },
  apple: { label: 'Apple', color: '#000000', text: '#ffffff', border: '#000000' },
  github: { label: 'GitHub', color: '#24292f', text: '#ffffff', border: '#24292f' },
  facebook: { label: 'Facebook', color: '#1877f2', text: '#ffffff', border: '#1877f2' },
  azure: { label: 'Microsoft', color: '#ffffff', text: '#5e5e5e', border: '#8c8c8c' },
  twitter: { label: 'X / Twitter', color: '#000000', text: '#ffffff', border: '#000000' },
  discord: { label: 'Discord', color: '#5865f2', text: '#ffffff', border: '#5865f2' },
  linkedin_oidc: { label: 'LinkedIn', color: '#0a66c2', text: '#ffffff', border: '#0a66c2' },
};

/**
 * @param {string} provider
 */
export function providerMeta(provider) {
  return (
    PROVIDER_META[normalizeProvider(provider)] ?? {
      label: provider.charAt(0).toUpperCase() + provider.slice(1).replace(/_/g, ' '),
      color: '#ffffff',
      text: '#3c4043',
      border: '#dadce0',
    }
  );
}
