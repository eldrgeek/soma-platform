export { inAuthRoundTrip } from './authRoundTrip.js';
export { safeNext, loginHref } from './safeNext.js';
export {
  createSomaKnownDevice,
  readSomaKnownDevice,
  readSomaKnownDeviceMarker,
  markSomaKnownDevice,
  clearSomaKnownDevice,
  DEFAULT_SOMA_KNOWN_DEVICE_STORAGE_KEY,
} from './somaKnownDevice.js';
export {
  createSomaAuthConfig,
  DEFAULT_SOMA_AUTH_METHODS,
  providerMeta,
  SOMA_OAUTH_PROVIDERS,
  FALLBACK_ENABLED_PROVIDERS,
  normalizeProvider,
  orderProviders,
  enabledProviders,
  fetchAuthSettings,
  providerOAuthOptions,
} from './somaAuthConfig.js';
export function hubGoogleUrl(hub: string, returnTo: string): string;
export function readHubSession(hash: string): { access_token: string; refresh_token: string } | null;
export function shouldUseGoogleHub(config: { googleHub?: string }): boolean;
