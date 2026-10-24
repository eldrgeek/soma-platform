/* soma-play line-run.js: run lines. The actor picks their part; every other character's lines are read
 * aloud by Stage Read, and on each of the actor's own lines the reading stops with the line hidden until
 * they say it and tap Next (or Show line, to check).
 *
 *   import { mountLineRun } from './line-run.js';
 *   mountLineRun(container, {
 *     text,                                   // the scene, as play-view reads it
 *     speak: (lineIndex) => fetch(...),       // Stage Read's route: resolves to a Response with the audio
 *     onActive: (blockIndex) => {},           // the block being run, or null when the run stops
 *     hint: 'none' | 'initials',              // what of the actor's own line shows before Show line
 *   });
 *
 * Only the other characters' lines are asked for, by number; the page never sends the words. The server
 * checks a line-run exactly as it checks a stage-read and counts it against the same allowance.
 *
 * Written 2026-10-24 by Claude Opus 5.5 for Mike Wolf, from the component scouts' top theatre idea
 * ("an actor learning a monologue the night before an audition"). The player loop follows stage-read.js.
 */
import { parseScript, spokenLines } from './script.js';

const MESSAGES = {
  401: 'Sign in to run lines.',
  402: "Today's reading allowance is used up. It starts again tomorrow.",
  403: 'You cannot run this scene.',
  404: 'This line is no longer in the scene.',
  413: 'A line is too long to read aloud.',
};

/** The characters who speak, in the order they first speak. */
export function characters(lines) {
  return [...new Set(lines.map((line) => line.character))];
}

/** Each spoken line with mine: true when it is the actor's part. */
export function runPlan(lines, part) {
  return lines.map((line) => ({ ...line, mine: line.character === part }));
}

/** The first letter of each word, keeping punctuation: "Then take it and go." becomes "T t i a g." */
export function initials(text) {
  return String(text)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/^([^\p{L}\p{N}]*)([\p{L}\p{N}])[\p{L}\p{N}'’-]*/u, '$1$2'))
    .join(' ');
}

export function mountLineRun(container, {
  text,
  speak,
  onActive = () => {},
  hint = 'none',
  document = container.ownerDocument,
  createAudio = (url) => new document.defaultView.Audio(url),
  createUrl = (blob) => document.defaultView.URL.createObjectURL(blob),
} = {}) {
  const lines = spokenLines(parseScript(text));
  const parts = characters(lines);
  const el = (tag, className, words) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (words !== undefined) node.textContent = words;
    return node;
  };

  const root = el('div', 'soma-line-run');
  const bar = el('div', 'soma-line-run-bar');
  const choose = el('select', 'soma-line-run-part');
  choose.setAttribute('aria-label', 'Your part');
  for (const name of parts) {
    const option = el('option', '', name);
    option.value = name;
    choose.append(option);
  }
  choose.value = parts[0] ?? '';
  const start = el('button', 'puppet-runtime-button puppet-runtime-primary');
  start.type = 'button';
  const status = el('span', 'soma-line-run-status');
  status.setAttribute('role', 'status');
  bar.append(choose, start, status);

  const cue = el('div', 'soma-line-run-cue');
  cue.hidden = true;
  const who = el('p', 'soma-line-run-who');
  const line = el('p', 'soma-line-run-line');
  const show = el('button', 'puppet-runtime-button', 'Show line');
  show.type = 'button';
  const next = el('button', 'puppet-runtime-button puppet-runtime-primary', 'Next');
  next.type = 'button';
  cue.append(who, line, show, next);
  root.append(bar, cue);
  container.append(root);

  let run = 0;
  let audio = null;
  let current = null;
  let resume = null;

  const idle = (message) => {
    start.textContent = 'Run lines';
    choose.disabled = false;
    cue.hidden = true;
    current = null;
    resume = null;
    status.textContent = message ?? (lines.length ? '' : 'No lines to run yet.');
    onActive(null);
  };

  async function fetchLine(index) {
    const response = await speak(index);
    if (!response.ok) {
      const error = new Error(MESSAGES[response.status] ?? `Run lines failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return createUrl(await response.blob());
  }

  async function play(token, plan) {
    // Fetch each other character's line one step ahead, as Stage Read does.
    const ahead = new Map();
    const want = (from) => {
      const step = plan.slice(from).find((p) => !p.mine);
      if (step && !ahead.has(step.index)) {
        const pending = fetchLine(step.index);
        pending.catch(() => {});
        ahead.set(step.index, pending);
      }
    };
    want(0);
    for (let i = 0; i < plan.length; i += 1) {
      const step = plan[i];
      onActive(step.blockIndex);
      if (step.mine) {
        want(i + 1);
        current = step;
        cue.hidden = false;
        who.textContent = `Your line, ${step.character}`;
        line.textContent = hint === 'initials' ? initials(step.text) : '…';
        status.textContent = `Line ${i + 1} of ${plan.length}: say it, then Next`;
        await new Promise((resolve) => { resume = resolve; });
        if (token !== run) return;
        cue.hidden = true;
        continue;
      }
      const url = await ahead.get(step.index);
      if (token !== run) return;
      want(i + 1);
      status.textContent = `${step.character} · line ${i + 1} of ${plan.length}`;
      await new Promise((resolve) => {
        audio = createAudio(url);
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play?.()?.catch?.(resolve);
      });
      if (token !== run) return;
    }
    run += 1;
    idle('Finished. Run it again?');
  }

  const stop = (message) => {
    run += 1;
    audio?.pause?.();
    resume?.();
    idle(message);
  };

  start.addEventListener('click', () => {
    if (start.textContent === 'Stop') return stop('Stopped.');
    if (!lines.length) return;
    const plan = runPlan(lines, choose.value);
    run += 1;
    const token = run;
    start.textContent = 'Stop';
    choose.disabled = true;
    status.textContent = 'Starting…';
    play(token, plan).catch((error) => {
      if (token === run) stop(error.message);
    });
  });
  show.addEventListener('click', () => {
    if (current) line.textContent = current.text;
  });
  next.addEventListener('click', () => resume?.());

  idle();
  return {
    lines,
    parts,
    stop: () => stop(),
    destroy() {
      run += 1;
      audio?.pause?.();
      resume?.();
      root.remove();
    },
  };
}
