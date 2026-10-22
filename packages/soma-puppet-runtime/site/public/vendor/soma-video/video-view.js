/* soma-video video-view.js: a video script drawn read-only as a two-column AV script.
 *
 *   import { mountVideoView } from './video-view.js';
 *   const view = mountVideoView(container, scriptText);
 *   view.highlight(blockIndex);   // the narration read's spotlight; null clears it
 *   view.update(scriptText);      // redraw from new text (the script editor's live preview)
 *
 * The AV script is the video writer's standard layout: picture on the left, sound on the right, one
 * row per moment. It is to a video script what Diana's format (soma-play's play-view) is to a play.
 * A visual plays under the narration line that follows it (SCRIPT-FORMAT.md §6), so each CARD, CLIP or
 * other performer is drawn in the same row as the next narrator turn. MUSIC and SFX cues are sound.
 * Each scene shows its number, heading and estimated length; the top shows the cast with each narrator's
 * voice, the film's estimated length, and the checks a writer should fix before rendering.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-go2.
 */
import { checks, clock, estimate, filmInfo, filmVoices, parseFilm } from './film.js';

const STYLE_ID = 'soma-video-style';
const CSS = `
.soma-video { --sv-ink: #1d2433; --sv-muted: #5d6b82; --sv-line: #d9dfe8; --sv-paper: #fff; --sv-pic: #f3f6fb;
  font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--sv-ink); }
.soma-video-head { margin: 0 0 14px; }
.soma-video-title { margin: 0; font-size: 22px; }
.soma-video-meta { margin: 2px 0 8px; color: var(--sv-muted); }
.soma-video-cast { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.soma-video-chip { border: 1px solid var(--sv-line); border-left: 4px solid var(--sv-chip, #888); border-radius: 6px; padding: 2px 8px; background: var(--sv-paper); font-size: 13px; }
.soma-video-chip b { font-weight: 600; }
.soma-video-checks { margin: 10px 0 0; padding: 8px 12px; border-radius: 6px; background: #fff7e6; border: 1px solid #f3d38b; font-size: 13px; }
.soma-video-checks ul { margin: 4px 0 0 18px; padding: 0; }
.soma-video-scene { margin: 0 0 16px; border: 1px solid var(--sv-line); border-radius: 8px; background: var(--sv-paper); overflow: hidden; }
.soma-video-scene-head { display: flex; justify-content: space-between; gap: 8px; padding: 8px 12px; background: #eef2f8; border-bottom: 1px solid var(--sv-line); font-weight: 600; }
.soma-video-scene-head span:last-child { color: var(--sv-muted); font-weight: 400; white-space: nowrap; }
.soma-video-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); }
.soma-video-colhead { padding: 4px 12px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--sv-muted); border-bottom: 1px solid var(--sv-line); }
.soma-video-pic, .soma-video-sound { padding: 8px 12px; border-bottom: 1px solid var(--sv-line); min-width: 0; }
.soma-video-pic { background: var(--sv-pic); border-right: 1px solid var(--sv-line); }
.soma-video-shot { margin: 0 0 6px; }
.soma-video-shot:last-child { margin-bottom: 0; }
.soma-video-kind { display: inline-block; font: 600 11px/1.6 ui-monospace, Menlo, monospace; padding: 0 6px; border-radius: 4px; background: #dbe4f3; margin-right: 6px; }
.soma-video-args { font: 12px/1.5 ui-monospace, Menlo, monospace; overflow-wrap: anywhere; }
.soma-video-body { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
.soma-video-cue { font-weight: 700; letter-spacing: .03em; border-left: 4px solid var(--sv-chip, #888); padding-left: 6px; }
.soma-video-voice { color: var(--sv-muted); font-weight: 400; font-size: 12px; margin-left: 6px; }
.soma-video-paren { font-style: italic; color: var(--sv-muted); }
.soma-video-track { font: 12px/1.5 ui-monospace, Menlo, monospace; color: #6b4fa0; }
.soma-video-direction, .soma-video-transition, .soma-video-note { grid-column: 1 / -1; padding: 6px 12px; border-bottom: 1px solid var(--sv-line); font-style: italic; color: var(--sv-muted); }
.soma-video-transition { text-align: right; font-style: normal; font-size: 12px; letter-spacing: .05em; }
.soma-video-spotlight { background: rgb(245 158 11 / 0.14); box-shadow: inset 3px 0 0 rgb(245 158 11 / 0.9); }
.soma-video-empty { color: var(--sv-muted); }
.soma-video-settings { margin: 6px 0 0; font: 12px/1.5 ui-monospace, Menlo, monospace; color: var(--sv-muted); }
@media (max-width: 640px) {
  .soma-video-cols { grid-template-columns: 1fr; }
  .soma-video-colhead { display: none; }
  .soma-video-pic { border-right: 0; border-bottom: 0; }
  .soma-video-pic:empty { display: none; }
}
`;

const COLORS = ['#e8a27c', '#c7a6ff', '#8ab4f8', '#7fd1b9', '#ffd84d', '#f28fb0', '#9aa5b1', '#e57373', '#81c784', '#4fc3f7'];

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

function shotNode(document, block) {
  const shot = el(document, 'div', 'soma-video-shot');
  shot.append(el(document, 'span', 'soma-video-kind', block.kind));
  if (block.args) shot.append(el(document, 'span', 'soma-video-args', block.args));
  if (block.body.length) shot.append(el(document, 'p', 'soma-video-body', block.body.join('\n')));
  return shot;
}

function draw(document, root, text) {
  const blocks = parseFilm(text);
  const { title, settings } = filmInfo(blocks);
  const voices = filmVoices(blocks);
  const colors = Object.fromEntries(Object.keys(voices).map((name, i) => [name, COLORS[i % COLORS.length]]));
  const { scenes, total } = estimate(blocks);
  const rowsByBlock = new Map();
  root.replaceChildren();

  const head = el(document, 'header', 'soma-video-head');
  head.append(el(document, 'h2', 'soma-video-title', title.Title || 'Untitled video'));
  const meta = [title.Credit, title['Draft date'] && `draft ${title['Draft date']}`, scenes.length && `${scenes.length} scenes`, total && `about ${clock(total)}`].filter(Boolean);
  if (meta.length) head.append(el(document, 'p', 'soma-video-meta', meta.join(' · ')));
  const cast = el(document, 'ul', 'soma-video-cast');
  cast.setAttribute('aria-label', 'Cast and voices');
  for (const [name, voice] of Object.entries(voices)) {
    const chip = el(document, 'li', 'soma-video-chip');
    chip.style.setProperty?.('--sv-chip', colors[name]);
    chip.append(el(document, 'b', '', name), el(document, 'span', '', ` · ${voice.name}`));
    cast.append(chip);
  }
  if (cast.children.length) head.append(cast);
  if (Object.keys(settings).length) {
    head.append(el(document, 'p', 'soma-video-settings', Object.entries(settings).map(([k, v]) => `${k}: ${v}`).join(' · ')));
  }
  const problems = checks(blocks);
  if (problems.length) {
    const box = el(document, 'div', 'soma-video-checks');
    box.append(el(document, 'strong', '', 'Before you render'));
    const list = el(document, 'ul');
    for (const problem of problems) list.append(el(document, 'li', '', problem));
    box.append(list);
    head.append(box);
  }
  root.append(head);

  let grid = null;
  let pending = [];
  const openScene = (heading, seconds) => {
    const section = el(document, 'section', 'soma-video-scene');
    const bar = el(document, 'div', 'soma-video-scene-head');
    bar.append(el(document, 'span', '', heading), el(document, 'span', '', seconds ? `about ${clock(seconds)}` : ''));
    grid = el(document, 'div', 'soma-video-cols');
    grid.append(el(document, 'div', 'soma-video-colhead', 'Picture'), el(document, 'div', 'soma-video-colhead', 'Sound'));
    section.append(bar, grid);
    root.append(section);
  };
  const row = (pictures, sound) => {
    const pic = el(document, 'div', 'soma-video-pic');
    for (const block of pictures) pic.append(shotNode(document, block));
    const cell = el(document, 'div', 'soma-video-sound');
    if (sound) cell.append(sound);
    grid.append(pic, cell);
    return [pic, cell];
  };
  const flush = () => {
    if (pending.length) row(pending, null);
    pending = [];
  };

  blocks.forEach((block, index) => {
    if (block.type === 'title' || block.type === 'settings' || block.type === 'cast') return;
    if (block.type === 'scene') {
      if (grid) flush();
      openScene(`${block.scene}. ${block.text}`, scenes[block.scene - 1]?.seconds);
      return;
    }
    if (!grid) openScene('Opening', 0);
    if (block.type === 'visual' && block.track) {
      flush();
      row([], el(document, 'div', 'soma-video-track', `${block.kind} ${block.args}`.trim()));
      return;
    }
    if (block.type === 'visual') {
      pending.push(block);
      return;
    }
    if (block.type === 'speech') {
      const sound = el(document, 'div');
      const cue = el(document, 'div', 'soma-video-cue', block.character);
      cue.style.setProperty?.('--sv-chip', colors[block.character.toUpperCase()]);
      const voice = voices[block.character.toUpperCase()];
      if (voice) cue.append(el(document, 'span', 'soma-video-voice', voice.name));
      sound.append(cue);
      for (const line of block.lines) {
        sound.append(el(document, 'div', line.kind === 'parenthetical' ? 'soma-video-paren' : 'soma-video-words', line.text));
      }
      rowsByBlock.set(index, row(pending, sound));
      pending = [];
      return;
    }
    flush();
    grid.append(el(document, 'div', `soma-video-${block.type}`, block.text));
  });
  if (grid) flush();
  if (!blocks.some((b) => b.type !== 'title')) root.append(el(document, 'p', 'soma-video-empty', 'Nothing in this script yet.'));
  return { blocks, rowsByBlock };
}

export function mountVideoView(container, text, { document = container.ownerDocument } = {}) {
  installStyle(document);
  const root = el(document, 'div', 'soma-video');
  container.append(root);
  let state = draw(document, root, text);
  let lit = [];
  const view = {
    get blocks() {
      return state.blocks;
    },
    highlight(blockIndex) {
      for (const node of lit) node.className = node.className.replace(/ soma-video-spotlight$/, '');
      lit = state.rowsByBlock.get(blockIndex) ?? [];
      for (const node of lit) node.className += ' soma-video-spotlight';
      lit[1]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    },
    update(next) {
      lit = [];
      state = draw(document, root, next);
    },
    destroy() {
      root.remove();
    },
  };
  return view;
}
