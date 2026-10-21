// SOMA Studio's API (packages/soma-studio), served from this site so the
// studio page and the app it shows share one sign-in session.
import { getStore } from '@netlify/blobs';

import { createStudioApi, resolveStudios, supabaseBroadcast } from '../../../soma-studio/src/api.js';
import studios from '../../../soma-studio/studios.js';
import { createIdentityVerifier } from '../lib/auth.mjs';

// The Blobs store is made for each request, never kept on a warm instance:
// getStore() takes the invocation's Blobs token, and that token expires, so a
// store kept across requests fails with "Failed to decode token: Token
// expired" (seen live by Mike, 2026-10-21).
export function createStudioFunction({ getStoreImpl = getStore, env = process.env } = {}) {
  const resolved = resolveStudios(studios, env);
  const verifyIdentity = createIdentityVerifier({ env });
  const broadcast = supabaseBroadcast({ url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY });
  return async function handler(request) {
    return createStudioApi({
      studios: resolved,
      blobs: getStoreImpl({ name: 'soma-studio', consistency: 'strong' }),
      verifyIdentity,
      // The team listener on Mike's Mac signs its requests with this key; it
      // also keys the realtime topic names.
      teamKey: env.STUDIO_TEAM_KEY ?? '',
      broadcast,
    })(request);
  };
}

export default createStudioFunction();
