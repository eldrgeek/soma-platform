/**
 * SPINE: identity stub.
 * Placeholder for SOMA auth (packages/auth). Returns hardcoded scopes until
 * the real auth service issues tokens. Replace resolveAuth() body with a
 * call to the auth verifier; the signature is the stable seam.
 *
 * Swap criteria (Phase 4): SOMA Auth validates token, returns subscriber_id.
 */

/**
 * Resolve an auth token to a scope and subscriber identity.
 * Stub behavior:
 *   - no token                  -> anonymous
 *   - token "stub-subscriber-*" -> subscriber (id = suffix)
 *   - token "stub-admin-*"      -> tenant-admin (id = suffix)
 *   - unknown token shape       -> anonymous (stub policy; real auth would reject)
 * @param {string|undefined} token
 * @returns {Promise<{authScope: 'anonymous'|'subscriber'|'tenant-admin', subscriberId: string|null}>}
 */
export async function resolveAuth(token) {
  if (!token) {
    return { authScope: 'anonymous', subscriberId: null };
  }
  if (token.startsWith('stub-admin-')) {
    return { authScope: 'tenant-admin', subscriberId: token.slice('stub-admin-'.length) };
  }
  if (token.startsWith('stub-subscriber-')) {
    return { authScope: 'subscriber', subscriberId: token.slice('stub-subscriber-'.length) };
  }
  return { authScope: 'anonymous', subscriberId: null };
}
