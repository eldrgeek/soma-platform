/**
 * @typedef {{ name?: string; email?: string }} SomaFeedbackIdentity
 */

/**
 * Install `window.somaFeedbackIdentity` — reads the Supabase session fresh on
 * every call (no caching). Returns null when signed out or when neither name
 * nor email is available.
 *
 * @param {{ supabase: { auth: { getSession: () => Promise<{ data: { session: { user?: { email?: string | null; user_metadata?: Record<string, unknown> } | null } | null }; error: unknown }> } } }} options
 */
export function installSomaFeedbackIdentityHook({ supabase }) {
  window.somaFeedbackIdentity = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) return null;
    const user = data.session.user;
    if (!user) return null;
    const meta = user.user_metadata || {};
    const name =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      undefined;
    const email = user.email || undefined;
    if (!name && !email) return null;
    return { name, email };
  };
}
