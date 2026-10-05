import type { SupabaseClient } from '@supabase/supabase-js';

export interface SomaFeedbackIdentity {
  name?: string;
  email?: string;
}

export function installSomaFeedbackIdentityHook(options: {
  supabase: SupabaseClient;
}): void;

export function installSomaFeedbackAuthHook(options: {
  supabase: SupabaseClient;
}): void;

export function installSomaFeedbackHooks(options: {
  supabase: SupabaseClient;
}): void;

declare global {
  interface Window {
    somaFeedbackIdentity?: () => Promise<SomaFeedbackIdentity | null>;
    somaFeedbackAuthHeader?: () => Promise<string | null>;
  }
}
