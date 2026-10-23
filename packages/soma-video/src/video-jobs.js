/* soma-video video-jobs.js: the panel that asks the team on Mike's Mac to work on a script (Puppet v0.6).
 *
 *   import { mountVideoJobs } from './video-jobs.js';
 *   const panel = mountVideoJobs(container, { listJobs, createJob, onDone });
 *
 * One button per step (JOB_STEPS in jobs.js) and a box to ask the team anything in words. Each request
 * becomes a job that the VideoMaker worker on the Mac runs with Claude Code, in the script's project
 * folder, with the estate's skills (kinetic-lyric-video, image-panel). The list below shows each job's
 * state, the last lines of its log and, when it ends, the team's report. While a job is open the panel
 * asks again every 10 seconds; onDone() runs when a job finishes, so the page can load new assets.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-h3i.
 */
import { JOB_STEPS } from './jobs.js';

const STYLE_ID = 'soma-video-jobs-style';
const CSS = `
.svj { font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1d2433; border: 1px solid #d9dfe8; border-radius: 8px; background: #fff; padding: 12px; margin: 0 0 14px; }
.svj h2 { margin: 0 0 4px; font-size: 20px; }
.svj-lead { margin: 0 0 10px; color: #5d6b82; font-size: 13px; }
.svj-steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; margin: 0 0 10px; }
.svj-step { text-align: left; border: 1px solid #d9dfe8; border-radius: 8px; background: #f7f9fc; padding: 8px 10px; cursor: pointer; font: inherit; color: inherit; }
.svj-step:hover { border-color: #6b4fa0; }
.svj-step b { display: block; font-size: 14px; }
.svj-step span { display: block; font-size: 12px; color: #5d6b82; }
.svj-ask { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 10px; }
.svj-ask textarea { flex: 1; min-height: 52px; font: 14px/1.4 system-ui, sans-serif; padding: 6px 8px; border: 1px solid #c9d2df; border-radius: 6px; }
.svj-ask button { background: #6b4fa0; color: #fff; border: 0; border-radius: 6px; padding: 8px 14px; font-weight: 600; cursor: pointer; }
.svj-msg { font-size: 13px; color: #8a4b00; margin: 0 0 8px; min-height: 1em; }
.svj-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.svj-job { border-top: 1px solid #e7edf3; padding: 6px 0 0; }
.svj-job-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.svj-job-head b { font-size: 14px; }
.svj-when { color: #5d6b82; font-size: 12px; }
.svj-status { font: 600 11px/1.6 ui-monospace, Menlo, monospace; padding: 0 6px; border-radius: 4px; background: #e8edf5; }
.svj-status-running { background: #fff1c2; } .svj-status-done { background: #d9f2df; } .svj-status-failed { background: #fbd9d9; }
.svj-note { margin: 2px 0 0; font-size: 13px; white-space: pre-wrap; }
.svj-log { margin: 4px 0 0; font: 12px/1.45 ui-monospace, Menlo, monospace; color: #44506a; white-space: pre-wrap; background: #f4f6fa; border-radius: 4px; padding: 4px 6px; }
.svj-job details { margin-top: 4px; font-size: 13px; } .svj-job details div { white-space: pre-wrap; margin-top: 4px; }
`;

function installStyle(document) {
  if (!document.head || document.getElementById?.(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

function el(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const label = (step) => JOB_STEPS.find((s) => s.step === step)?.label ?? step;
const isOpen = (job) => job.status === 'queued' || job.status === 'running';

/** "just now", "4 min ago", "2 h ago", or the date. */
export function ago(iso, now = Date.now()) {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return String(iso).slice(0, 10);
}

export function mountVideoJobs(container, { listJobs, createJob, onDone = () => {}, document = container.ownerDocument, window = document.defaultView, every = 10_000 }) {
  installStyle(document);
  const root = el(document, 'section', 'svj');
  container.append(root);
  root.append(el(document, 'h2', '', 'Make it'));
  root.append(el(document, 'p', 'svj-lead', 'Each request goes to the team on Mike\'s Mac, which works with Claude Code in this script\'s project folder. Results arrive below and in Assets.'));
  const steps = el(document, 'div', 'svj-steps');
  const ask = el(document, 'div', 'svj-ask');
  const note = el(document, 'textarea');
  note.setAttribute('aria-label', 'Ask the team');
  note.placeholder = 'Ask the team, for example: make the Verse 1 pictures colder, or move the title card to 0:05';
  const send = el(document, 'button', '', 'Send');
  send.type = 'button';
  ask.append(note, send);
  const message = el(document, 'p', 'svj-msg');
  message.setAttribute('role', 'status');
  const list = el(document, 'ul', 'svj-list');
  root.append(steps, ask, message, list);

  let jobs = [];
  let timer = null;
  let gone = false;
  const seenOpen = new Set();

  async function request(step, text = '') {
    message.textContent = 'Sending…';
    try {
      await createJob({ step, note: text });
      message.textContent = `Sent: ${label(step)}. The team picks it up within a minute.`;
      if (step === 'ask') note.value = '';
      await load();
    } catch (error) {
      message.textContent = error?.message ?? 'Could not send';
    }
  }

  for (const s of JOB_STEPS.filter((x) => !x.needsNote)) {
    const button = el(document, 'button', 'svj-step');
    button.type = 'button';
    button.append(el(document, 'b', '', s.label), el(document, 'span', '', s.about));
    button.addEventListener('click', () => request(s.step));
    steps.append(button);
  }
  send.addEventListener('click', () => request('ask', note.value));

  function draw() {
    list.replaceChildren();
    if (!jobs.length) list.append(el(document, 'li', 'svj-when', 'No requests yet.'));
    for (const job of jobs.slice(0, 12)) {
      const item = el(document, 'li', 'svj-job');
      const head = el(document, 'div', 'svj-job-head');
      head.append(el(document, 'b', '', label(job.step)), el(document, 'span', `svj-status svj-status-${job.status}`, job.status), el(document, 'span', 'svj-when', ago(job.updatedAt || job.createdAt)));
      item.append(head);
      if (job.note) item.append(el(document, 'p', 'svj-note', job.note));
      if (job.log?.length && isOpen(job)) item.append(el(document, 'pre', 'svj-log', job.log.slice(-4).join('\n')));
      if (job.report) {
        const details = el(document, 'details');
        if (jobs.indexOf(job) === 0) details.open = true;
        details.append(el(document, 'summary', '', 'The team\'s report'), el(document, 'div', '', job.report));
        item.append(details);
      }
      list.append(item);
    }
  }

  async function load() {
    if (gone) return;
    try {
      jobs = await listJobs();
    } catch (error) {
      message.textContent = `Could not load the requests: ${error?.message ?? error}`;
    }
    let finished = false;
    for (const job of jobs) {
      if (isOpen(job)) seenOpen.add(job.id);
      else if (seenOpen.delete(job.id)) finished = true;
    }
    draw();
    if (finished) onDone();
    window?.clearTimeout?.(timer);
    if (!gone && jobs.some(isOpen)) timer = window?.setTimeout?.(load, every);
  }

  const ready = load();
  return {
    ready,
    refresh: load,
    update() {},
    destroy() {
      gone = true;
      window?.clearTimeout?.(timer);
      root.remove();
    },
  };
}
