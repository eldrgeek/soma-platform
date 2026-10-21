// POST /api/speech-token: a single-use ElevenLabs token for the Punctuated
// voice of the studio's mic button (packages/soma-speech). The page never holds
// the ElevenLabs key; it asks here, then talks to ElevenLabs directly.
//
// Who may ask: someone signed in with SOMA sign-in (the same Supabase access
// token as the rest of the studio) who is a host or member of a studio in
// packages/soma-studio/studios.js, by the studio API's own access() rules. Each person gets a daily number of tokens
// and everyone together get a daily number too; the handler is
// packages/soma-speech/server/speech-token.js.
//
// Env: ELEVENLABS_API_KEY (and SUPABASE_URL, SUPABASE_ANON_KEY, as for the
// studio). Counters live in Netlify Blobs.
import { getStore } from '@netlify/blobs';

import speech from '../../../soma-speech/server/speech-token.js';
import { access, resolveStudios } from '../../../soma-studio/src/api.js';
import studios from '../../../soma-studio/studios.js';
import { createIdentityVerifier } from '../lib/auth.mjs';

const { createSpeechTokenHandler } = speech;

// The Blobs store is made for each call, never kept on a warm instance: its
// token expires with the invocation (soma-platform #22, seen live 2026-10-21).
export function createSpeechTokenFunction({
  getStoreImpl = getStore,
  env = process.env,
  fetchImpl = globalThis.fetch,
  studiosMap = studios,
  limits = { perPerson: 120, global: 300 },
} = {}) {
  const verifyIdentity = createIdentityVerifier({ env, fetchImpl });
  // The studio's own membership rules (email or id, lower case, dev ids only
  // under NETLIFY_DEV), not a copy of them.
  const resolved = Object.values(resolveStudios(studiosMap, env));

  const store = {
    async incr(key) {
      const blobs = getStoreImpl({ name: 'speech-token-counts', consistency: 'strong' });
      // Read then write, strongly consistent. Two requests in the same instant
      // can both count once; that overshoots a limit by one, which is fine here.
      const next = Number((await blobs.get(key)) || 0) + 1;
      await blobs.set(key, String(next));
      return next;
    },
  };

  const handle = createSpeechTokenHandler({
    apiKey: env.ELEVENLABS_API_KEY,
    authorize: async (headers) => {
      let who;
      try {
        who = await verifyIdentity(new Request('https://speech-token.invalid/', { headers }));
      } catch {
        return { ok: false, status: 401 };
      }
      if (!resolved.some((studio) => access(studio, who).isMember)) return { ok: false, status: 403 };
      return { ok: true, id: who.id, email: who.email };
    },
    store,
    limits,
    fetch: fetchImpl,
  });

  return async function handler(request) {
    const headers = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const out = await handle({ method: request.method, headers });
    return new Response(out.body || null, { status: out.status, headers: out.headers });
  };
}

export default createSpeechTokenFunction();
