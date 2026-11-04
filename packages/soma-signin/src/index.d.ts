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
export function createNoncePair(options?: { crypto?: Crypto }): Promise<{ raw: string; hashed: string }>;
export function loadGoogleIdentity(options?: { document?: Document; timeoutMs?: number }): Promise<any | null>;
export function shouldUseGoogleIdentity(config: { googleClientId?: string }, shownProviders: string[]): boolean;
export const GSI_SCRIPT_SRC: string;
