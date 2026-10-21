// SOMA Studio's API (packages/soma-studio), served from this site so the
// studio page and the app it shows share one sign-in session.
import { getStore } from '@netlify/blobs';

import { createStudioApi, resolveStudios, supabaseBroadcast } from '../../../soma-studio/src/api.js';
import studios from '../../../soma-studio/studios.js';
import { createIdentityVerifier } from '../lib/auth.mjs';

let api;

export default async function handler(request) {
  api ??= createStudioApi({
    studios: resolveStudios(studios),
    blobs: getStore({ name: 'soma-studio', consistency: 'strong' }),
    verifyIdentity: createIdentityVerifier(),
    // The team listener on Mike's Mac signs its requests with this key; it
    // also keys the realtime topic names.
    teamKey: process.env.STUDIO_TEAM_KEY ?? '',
    broadcast: supabaseBroadcast({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY }),
  });
  return api(request);
}
