/* soma-video jobs.js: what the team on Mike's Mac can be asked to do for a video script (Puppet v0.6).
 * Shared by the page (video-jobs.js) and the server (server/studio.js), so both offer the same steps.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-h3i.
 */

/** The steps, in the order the page offers them. */
export const JOB_STEPS = [
  { step: 'ask', label: 'Ask the team', needsNote: true, about: 'Anything in words: change the script, try a look, fix a picture.' },
  { step: 'analyze', label: 'Time the song', about: 'Separate the voice, find the beats and time every sung word.' },
  { step: 'images', label: 'Make the pictures', about: 'The image team writes and draws the pictures, some cut into pieces.' },
  { step: 'render', label: 'Render the video', about: 'Build the lyric video from the script, the song and the pictures.' },
  { step: 'sync', label: 'Send the assets', about: 'Upload the pictures, cards and song from the project folder.' },
];
export const STEP_NAMES = JOB_STEPS.map((s) => s.step);
/** held (v0.7): a storyboard job someone other than the host asked for, waiting for the host to let it run. */
export const JOB_STATUSES = ['held', 'queued', 'running', 'done', 'failed'];
export const MAX_NOTE = 4000;
