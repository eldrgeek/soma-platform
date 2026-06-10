/**
 * SOMA Auth — ES module entry.
 * For bundler-based apps. Peer dep: @supabase/supabase-js ^2.
 * Static sites use soma-auth.iife.js instead.
 */
import { createClient } from '@supabase/supabase-js';

let _client = null;

export function init(url, anonKey) {
  if (_client) return _client;
  _client = createClient(url, anonKey);
  return _client;
}

export function signInWithOtp(email, options = {}) {
  return _client.auth.signInWithOtp({ email, options });
}

export function signOut() {
  return _client.auth.signOut();
}

export function getSession() {
  return _client.auth.getSession();
}

export function getUser() {
  return _client.auth.getUser();
}

export function onAuthStateChange(handler) {
  return _client.auth.onAuthStateChange(handler);
}

/**
 * Get effective role for user at a specific app_id (site-scoped roles).
 * Resolves as: roles[appId] ?? default_role ?? 'subscriber'
 * Pass appId=null to get default_role only (e.g. for platform-level checks).
 */
export async function getRole(user, appId = null) {
  if (!user) return null;
  try {
    const { data, error } = await _client
      .from('profiles')
      .select('roles, default_role')
      .eq('id', user.id)
      .single();
    if (error || !data) return 'subscriber';
    const roles = data.roles || {};
    const defaultRole = data.default_role || 'subscriber';
    if (appId && roles[appId]) return roles[appId];
    return defaultRole;
  } catch {
    return 'subscriber';
  }
}
