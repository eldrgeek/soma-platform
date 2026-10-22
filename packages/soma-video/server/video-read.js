/* soma-video server/video-read.js: the server half of the narration read.
 *
 * soma-play's Stage Read server (createStageReader) with a video script's lines and voices: the same
 * checks in the same order, the same per-person cache, and its own allowance, counted apart from Stage
 * Read's under the key prefix `video/`.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-go2.
 */
import { createStageReader } from '../../soma-play/server/stage-read.js';
import { filmVoices, parseFilm, spokenLines } from '../src/film.js';

/** A narration read runs longer than a scene, so its allowance is twice Stage Read's. */
export const VIDEO_LIMITS = { perLine: 600, perPerson: 6000, perApp: 16000, linesPerPerson: 400 };

export function readFilm(text) {
  const blocks = parseFilm(text);
  const voices = filmVoices(blocks);
  return { lines: spokenLines(blocks), voiceOf: (character) => voices[character.toUpperCase()] };
}

export function createVideoReader(options = {}) {
  return createStageReader({ limits: VIDEO_LIMITS, ...options, readScript: readFilm, prefix: 'video/' });
}
