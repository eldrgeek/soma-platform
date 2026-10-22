/* soma-play server/stage-read.js: the server half of Stage Read.
 *
 * It speaks one line of a scene the caller has already been allowed to read. The caller (the Puppet
 * runtime's API) finds the row under its read rules and passes the scene text; this module never takes
 * words from a page. In order:
 *   1. find the line (by its number among the scene's spoken lines) and its character's voice;
 *   2. count the request against the person's lines for today, cached or not;
 *   3. replay it from this person's audio cache if this voice has said these words for them before;
 *   4. otherwise reserve the line's characters from the person's allowance and the app's allowance for
 *      today, before calling the voice service; a refused or failed call gives them back;
 *   5. only then call ElevenLabs, and keep the audio in the person's cache.
 * The cache is per person, so a cache hit can never tell anyone what another writer's scenes say.
 *
 *   const speak = createStageReader({
 *     apiKey, fetch,
 *     store: {
 *       reserve(key, amount, limit) -> true | false,   // atomic: adds amount unless that passes limit
 *       release(key, amount),                          // gives amount back
 *       getAudio(key) -> bytes | null, setAudio(key, bytes),
 *     },
 *     limits: { perLine: 600, perPerson: 3000, perApp: 8000, linesPerPerson: 400 },
 *   });
 *   const out = await speak({ who, scope, text, line });   // { status, body?, headers?, error? }
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-u4x. The ElevenLabs call is
 * PlayMaker's (netlify/functions/lib/tts.ts), on the cheaper eleven_turbo_v2_5 model because the
 * shared budget is small. Order of checks and per-person cache: Brain Trust review of v0.4.
 */
import { createHash } from 'node:crypto';

import { castVoices, parseScript, spokenLines } from '../src/script.js';

export const MODEL = 'eleven_turbo_v2_5';
export const DEFAULT_LIMITS = { perLine: 600, perPerson: 3000, perApp: 8000, linesPerPerson: 400 };

const sha = (text) => createHash('sha256').update(text).digest('hex');

export function createStageReader({
  apiKey,
  fetch = globalThis.fetch,
  store,
  limits = DEFAULT_LIMITS,
  now = () => new Date(),
} = {}) {
  return async function speak({ who, scope = 'app', text, line }) {
    if (!who) return { status: 401, error: 'Sign in to hear the scene' };
    const blocks = parseScript(text);
    const entry = Number.isInteger(line) && line >= 0 ? spokenLines(blocks)[line] : undefined;
    if (!entry) return { status: 404, error: 'No such line in this scene' };
    const chars = entry.text.length;
    if (chars > limits.perLine) return { status: 413, error: `A line may be at most ${limits.perLine} characters` };
    const voice = castVoices(blocks)[entry.character.toUpperCase()];
    const today = now().toISOString().slice(0, 10);
    const person = sha(String(who)).slice(0, 32);
    const headers = { 'content-type': 'audio/mpeg', 'x-stage-read-voice': voice.name };

    if (!(await store.reserve(`lines/${today}/${person}`, 1, limits.linesPerPerson))) {
      return { status: 429, error: 'Too many lines read today' };
    }
    const audioKey = `audio/${person}/${sha(`${MODEL}\n${voice.id}\n${entry.text}`)}`;
    const cached = await store.getAudio(audioKey);
    if (cached) return { status: 200, body: cached, headers: { ...headers, 'x-stage-read-cached': 'yes' } };

    const personKey = `chars/${today}/${person}`;
    const appKey = `chars/${today}/${sha(String(scope)).slice(0, 32)}`;
    if (!(await store.reserve(personKey, chars, limits.perPerson))) {
      return { status: 402, error: "Today's reading allowance is used up" };
    }
    if (!(await store.reserve(appKey, chars, limits.perApp))) {
      await store.release(personKey, chars);
      return { status: 402, error: "Today's reading allowance is used up" };
    }
    const giveBack = () => Promise.all([store.release(personKey, chars), store.release(appKey, chars)]);
    if (!apiKey) {
      await giveBack();
      return { status: 503, error: 'Stage Read is not configured' };
    }

    let response;
    try {
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify({ text: entry.text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
        },
      );
    } catch {
      await giveBack();
      return { status: 502, error: 'The voice service could not be reached' };
    }
    if (!response.ok) {
      await giveBack();
      return { status: 502, error: `The voice service refused (${response.status})` };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await store.setAudio(audioKey, bytes);
    return { status: 200, body: bytes, headers: { ...headers, 'x-stage-read-cached': 'no' } };
  };
}
