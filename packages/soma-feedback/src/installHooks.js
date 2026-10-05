import { installSomaFeedbackIdentityHook } from './somaFeedbackIdentity.js';
import { installSomaFeedbackAuthHook } from './somaFeedbackAuth.js';

/**
 * Install both soma-feedback window hooks (identity + auth header).
 *
 * @param {{ supabase: import('@supabase/supabase-js').SupabaseClient }} options
 */
export function installSomaFeedbackHooks({ supabase }) {
  installSomaFeedbackIdentityHook({ supabase });
  installSomaFeedbackAuthHook({ supabase });
}

export { installSomaFeedbackIdentityHook } from './somaFeedbackIdentity.js';
export { installSomaFeedbackAuthHook } from './somaFeedbackAuth.js';
