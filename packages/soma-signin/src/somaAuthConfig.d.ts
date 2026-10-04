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
