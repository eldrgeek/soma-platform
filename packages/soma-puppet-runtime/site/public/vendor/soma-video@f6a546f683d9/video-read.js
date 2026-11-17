/* soma-video video-read.js: a video script's narration read aloud, each narrator in their own voice.
 *
 *   import { mountVideoRead } from './video-read.js';
 *   mountVideoRead(container, { text, speak: (lineIndex) => fetch(...), onActive: (blockIndex) => {} });
 *
 * This is soma-play's Stage Read player (PlayMaker's), given a video script's spoken lines instead of a
 * play's: the narrator turns in order, with CARD, CLIP and the other performers left silent. The page
 * names a line by its number; the server reads the script itself (server/video-read.js), with each
 * narrator's voice from the script's CAST. The page imports the player from /vendor/soma-play/.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-go2.
 */
import { parseFilm, spokenLines } from './film.js';

export function mountVideoRead(container, { text, speak, onActive, mountStageRead, ...rest } = {}) {
  return mountStageRead(container, {
    ...rest,
    text,
    speak,
    onActive,
    lines: spokenLines(parseFilm(text)),
    label: 'Hear the narration',
  });
}
