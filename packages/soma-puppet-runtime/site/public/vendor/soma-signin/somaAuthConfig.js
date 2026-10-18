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
 */

/** @type {SomaAuthMethods} */
export const DEFAULT_SOMA_AUTH_METHODS = {
  magicLink: true,
  emailOtp: false,
  password: true,
  phone: false,
  oauth: ['google'],
};

/**
 * @param {object} options
 * @param {string} [options.url]
 * @param {string} [options.anonKey]
 * @param {Partial<SomaAuthMethods>} [options.methods]
 * @returns {SomaAuthConfig}
 */
export function createSomaAuthConfig(options = {}) {
  const methods = { ...DEFAULT_SOMA_AUTH_METHODS, ...(options.methods ?? {}) };
  if (options.methods?.oauth) {
    methods.oauth = [...options.methods.oauth];
  }
  return {
    url: options.url ?? '',
    anonKey: options.anonKey ?? '',
    methods,
  };
}

/** @type {Record<string, { label: string; color: string; text: string; border: string }>} */
const PROVIDER_META = {
  google: { label: 'Google', color: '#ffffff', text: '#3c4043', border: '#dadce0' },
  apple: { label: 'Apple', color: '#000000', text: '#ffffff', border: '#000000' },
  github: { label: 'GitHub', color: '#24292f', text: '#ffffff', border: '#24292f' },
  facebook: { label: 'Facebook', color: '#1877f2', text: '#ffffff', border: '#1877f2' },
  azure: { label: 'Microsoft', color: '#ffffff', text: '#5e5e5e', border: '#dadce0' },
  twitter: { label: 'X / Twitter', color: '#000000', text: '#ffffff', border: '#000000' },
  discord: { label: 'Discord', color: '#5865f2', text: '#ffffff', border: '#5865f2' },
  linkedin_oidc: { label: 'LinkedIn', color: '#0a66c2', text: '#ffffff', border: '#0a66c2' },
};

/**
 * @param {string} provider
 */
export function providerMeta(provider) {
  return (
    PROVIDER_META[provider] ?? {
      label: provider.charAt(0).toUpperCase() + provider.slice(1).replace(/_/g, ' '),
      color: '#ffffff',
      text: '#3c4043',
      border: '#dadce0',
    }
  );
}
