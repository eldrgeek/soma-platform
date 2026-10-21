// The demo site's token endpoint: POST /api/speech-token.
// Who may ask: anyone who sends the demo code (env SPEECH_DEMO_CODE) in the
// x-soma-speech-code header. The demo has no sign-in and is not on the shared
// SOMA sign-in allow-list, so a code is the gate. Apps with SOMA sign-in use
// supabaseAuthorize from server/speech-token.js instead.
// Env: ELEVENLABS_API_KEY, SPEECH_DEMO_CODE. Counters live in Netlify Blobs.
import { getStore } from '@netlify/blobs';
import speech from '../../server/speech-token.js';

const { createSpeechTokenHandler, demoCodeAuthorize } = speech;

const store = {
  // Read then write, strongly consistent. Two requests in the same instant can
  // both count once; that overshoots a limit by one, which is acceptable here.
  async incr(key) {
    const blobs = getStore({ name: 'speech-token-counts', consistency: 'strong' });
    const next = Number((await blobs.get(key)) || 0) + 1;
    await blobs.set(key, String(next));
    return next;
  }
};

export default async (request) => {
  const handle = createSpeechTokenHandler({
    apiKey: process.env.ELEVENLABS_API_KEY,
    authorize: demoCodeAuthorize(process.env.SPEECH_DEMO_CODE),
    store,
    limits: { perPerson: 150, global: 300 }
  });
  const headers = {};
  request.headers.forEach((value, key) => { headers[key] = value; });
  const out = await handle({ method: request.method, headers });
  return new Response(out.body || null, { status: out.status, headers: out.headers });
};

export const config = { path: '/api/speech-token' };
