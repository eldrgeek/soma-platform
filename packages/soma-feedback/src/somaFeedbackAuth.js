/**
 * Install `window.somaFeedbackAuthHeader` — returns `Bearer <access_token>` from
 * the live session, or null when signed out or on any error. Never throws.
 *
 * @param {{ supabase: { auth: { getSession: () => Promise<{ data: { session: { access_token?: string } | null }; error: unknown }> } } }} options
 */
export function installSomaFeedbackAuthHook({ supabase }) {
  window.somaFeedbackAuthHeader = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) return null;
      return `Bearer ${data.session.access_token}`;
    } catch {
      return null;
    }
  };
}
