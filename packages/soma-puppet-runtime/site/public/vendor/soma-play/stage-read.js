/* soma-play stage-read.js: Stage Read, a scene read aloud with a voice per character.
 *
 *   import { mountStageRead } from './stage-read.js';
 *   mountStageRead(container, {
 *     text,                                   // the scene, as play-view reads it
 *     speak: (lineIndex) => fetch(...),       // resolves to a Response with the line's audio
 *     onActive: (blockIndex) => {},           // the block being read, or null when reading stops
 *   });
 *
 * The page never sends the words: speak() names a line by its number, and the server reads the
 * scene itself (server/stage-read.js). Lines are fetched one ahead of the one playing. A refusal
 * (402: the day's allowance is used up) stops the reading and says so.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-u4x. The sequencing follows
 * PlayMaker's StageReadPlayer (src/lib/stageRead.ts): fetch ahead, play in order, spotlight the line.
 */
import { parseScript, spokenLines } from './script.js';

const MESSAGES = {
  401: 'Sign in to hear the scene.',
  402: "Today's reading allowance is used up. It starts again tomorrow.",
  403: 'You cannot hear this scene.',
  404: 'This line is no longer in the scene.',
  413: 'A line is too long to read aloud.',
};

export function mountStageRead(container, {
  text,
  speak,
  onActive = () => {},
  document = container.ownerDocument,
  createAudio = (url) => new document.defaultView.Audio(url),
  createUrl = (blob) => document.defaultView.URL.createObjectURL(blob),
} = {}) {
  const lines = spokenLines(parseScript(text));
  const root = document.createElement('div');
  root.className = 'soma-stage-read';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'puppet-runtime-button puppet-runtime-primary';
  const status = document.createElement('span');
  status.className = 'soma-stage-read-status';
  status.setAttribute('role', 'status');
  root.append(button, status);
  container.append(root);

  let run = 0;
  let audio = null;
  const idle = (message) => {
    button.textContent = 'Hear this scene';
    status.textContent = message ?? (lines.length ? '' : 'No lines to read yet.');
    onActive(null);
  };

  async function fetchLine(index) {
    const response = await speak(index);
    if (!response.ok) {
      const error = new Error(MESSAGES[response.status] ?? `Stage Read failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return createUrl(await response.blob());
  }

  async function play(token) {
    let next = fetchLine(0);
    for (let index = 0; index < lines.length; index += 1) {
      const url = await next;
      if (token !== run) return;
      if (index + 1 < lines.length) next = fetchLine(index + 1);
      next?.catch?.(() => {});
      status.textContent = `${lines[index].character} · line ${index + 1} of ${lines.length}`;
      onActive(lines[index].blockIndex);
      await new Promise((resolve) => {
        audio = createAudio(url);
        audio.onended = resolve;
        audio.onerror = resolve;
        const started = audio.play?.();
        started?.catch?.(resolve);
      });
      if (token !== run) return;
    }
    run += 1;
    idle('Finished.');
  }

  button.addEventListener('click', () => {
    if (button.textContent === 'Stop') {
      run += 1;
      audio?.pause?.();
      idle('Stopped.');
      return;
    }
    if (!lines.length) return;
    run += 1;
    const token = run;
    button.textContent = 'Stop';
    status.textContent = 'Starting…';
    play(token).catch((error) => {
      if (token !== run) return;
      run += 1;
      idle(error.message);
    });
  });

  idle();
  return {
    lines,
    stop() {
      run += 1;
      audio?.pause?.();
      idle();
    },
    destroy() {
      run += 1;
      audio?.pause?.();
      root.remove();
    },
  };
}
