export interface SomaAuthMethods {
  magicLink: boolean;
  emailOtp: boolean;
  password: boolean;
  phone: boolean;
  oauth: string[];
}

export interface SomaAuthConfig {
  url: string;
  anonKey: string;
  methods: SomaAuthMethods;
}

export interface ProviderMeta {
  label: string;
  color: string;
  text: string;
  border: string;
}

export const DEFAULT_SOMA_AUTH_METHODS: SomaAuthMethods;

export function createSomaAuthConfig(options?: {
  url?: string;
  anonKey?: string;
  methods?: Partial<SomaAuthMethods>;
}): SomaAuthConfig;

export function providerMeta(provider: string): ProviderMeta;

export const SOMA_OAUTH_PROVIDERS: readonly string[];
export const FALLBACK_ENABLED_PROVIDERS: readonly string[];
export function normalizeProvider(provider: string): string;
export function orderProviders(providers: string[]): string[];
export function enabledProviders(
  wanted: string[],
  settings: { external?: Record<string, boolean> } | null | undefined,
): string[];
export function fetchAuthSettings(options: {
  url: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<{ external?: Record<string, boolean> } | null>;
export function providerOAuthOptions(provider: string): { scopes?: string };
