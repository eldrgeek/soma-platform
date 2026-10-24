/* soma-video video-editor.js: one storyboard as an editing suite, script, picture and song on one screen (v4).
 *
 *   import { mountVideoEditor } from './video-editor.js';
 *   const editor = mountVideoEditor(container, { board, api, host, objectUrl, onBoard, onClose });
 *
 * Mike asked for VideoMaker v4 "modeled after Descript or some other editing platform": the full width of the
 * screen, the script as editable text, a scrubber, the effects and transitions shown, and the waveform to edit
 * against. The design and its mockup: https://claude.ai/artifact/KfXhTG7i5WM5izRT1aCRgh.
 *
 * - The script (left) is the board written as Fountain (board-script.js). What is typed becomes the same ops the
 *   scene cards send; a script with a problem sends nothing and says why. The line of the scene playing is lit.
 * - The preview (middle) is an animatic drawn here: each scene's picture with its motion, the transition into it
 *   and its lyric as a caption, over the song. "Last render" plays the cut's real video instead.
 * - The inspector (right) is the selected scene: motion, transition, prompt, redo note, Redo / Reroll / Keep,
 *   add a scene after it, and its earlier pictures.
 * - The timeline (bottom) is the whole board over the song: pictures with a transition chip on each seam (click
 *   to change), captions, motion (click to change), the song's waveform decoded here, and the notes. Drag a seam
 *   to retime two scenes; drag the ruler or the waveform to scrub; the strip above it is the whole song.
 *
 * The timeline is always the board in song order. A cut chosen at the top sets the picture's shape, what Render
 * renders, and which scenes are lit; a short's own shot order and lengths are still set on the cards.
 *
 * api: the storyboard api (video-storyboard.js): changeBoard(id, ops), createJob(id, job).
 * objectUrl(name): a Promise of an object URL for one of the board's files (shared with the cards' cache).
 * onBoard(board): told of every board this editor saved. onClose(): back to the cards.
 * The returned update(board) takes a board that changed elsewhere (another person, the team's new pictures).
 *
 * Written 2026-10-23 by Claude Opus 5.5 (CCc) for Mike Wolf.
 */
import { boardToScript, opBatches, readScript, scriptToOps, timeText } from './board-script.js';
import { ASPECT_LABEL, clockOf, cutScenes, cutState, MOTIONS, TRANSITIONS } from './storyboard.js';

/** What a click on a transition chip or a motion clip moves through; '' is the renderer's own choice. */
export const TRANSITION_CYCLE = ['', ...TRANSITIONS];
export const MOTION_CYCLE = ['', ...MOTIONS];
/** Seconds a transition takes in the animatic. */
export const TRANSITION_SECONDS = 0.7;
/** How long a scene with no time in the song lasts on the timeline, after the scene before it. */
const UNTIMED_SECONDS = 5;

/**
 * Every scene placed on the song's clock: [{ scene, start, end, timed }]. A scene with no time follows the one
 * before it for a few seconds, so an untimed board can still be laid out and timed by dragging.
 */
export function layoutScenes(scenes) {
  let clock = 0;
  return scenes.map((scene) => {
    const timed = typeof scene.start === 'number' && typeof scene.end === 'number' && scene.end > scene.start;
    const start = timed ? scene.start : clock;
    const end = timed ? scene.end : start + UNTIMED_SECONDS;
    clock = end;
    return { scene, start, end, timed };
  });
}

/** The index of the placed scene showing at t (the last one after the end, the first before the start). */
export function sceneAtTime(placed, t) {
  if (!placed.length) return -1;
  const i = placed.findIndex((p) => t >= p.start && t < p.end);
  if (i >= 0) return i;
  return t >= placed[placed.length - 1].end ? placed.length - 1 : 0;
}

/**
 * What the picture shows at t: { index, progress (0..1 through the scene), from (the scene it is coming in
 * from, or -1), mix (0..1 through the transition), transition }. A scene's transition plays over its first
 * TRANSITION_SECONDS; cut and the renderer's default ('') are drawn as a cut.
 */
export function frameAt(placed, t) {
  const index = sceneAtTime(placed, t);
  if (index < 0) return { index, progress: 0, from: -1, mix: 1, transition: '' };
  const p = placed[index];
  const into = t - p.start;
  const progress = Math.min(1, Math.max(0, into / (p.end - p.start)));
  const transition = p.scene.transition;
  const moving = index > 0 && ['dissolve', 'fade', 'wipe', 'push'].includes(transition) && into >= 0 && into < TRANSITION_SECONDS;
  return { index, progress, from: moving ? index - 1 : -1, mix: moving ? into / TRANSITION_SECONDS : 1, transition: moving ? transition : '' };
}

/** The caption at t: which of the scene's lyric lines (split on " / ") is sung, evenly over the scene. */
export function captionAt(placedScene, t) {
  const lines = String(placedScene.scene.lyric ?? '').split(' / ').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  const per = (placedScene.end - placedScene.start) / lines.length;
  return lines[Math.min(lines.length - 1, Math.max(0, Math.floor((t - placedScene.start) / per)))];
}

/** The song's loudness, `perSecond` peaks a second (0..1), from decoded channel data. */
export function songPeaks(channels, sampleRate, perSecond = 50) {
  const length = channels[0]?.length ?? 0;
  const step = Math.max(1, Math.floor(sampleRate / perSecond));
  const out = new Float32Array(Math.ceil(length / step));
  let max = 0;
  for (let b = 0; b < out.length; b += 1) {
    let peak = 0;
    for (const data of channels) for (let i = b * step, end = Math.min(length, i + step); i < end; i += 1) peak = Math.max(peak, Math.abs(data[i]));
    out[b] = peak;
    max = Math.max(max, peak);
  }
  if (max > 0) for (let b = 0; b < out.length; b += 1) out[b] /= max;
  return out;
}

/** How a picture moves through its scene, as a zoom and an offset (fractions of the frame). */
export function motionAt(motion, progress) {
  const p = progress;
  switch (motion) {
    case 'in': return { scale: 1.02 + 0.14 * p, dx: 0, dy: 0 };
    case 'out': return { scale: 1.16 - 0.14 * p, dx: 0, dy: 0 };
    case 'panr': return { scale: 1.14, dx: -0.06 + 0.12 * p, dy: 0 };
    case 'panl': return { scale: 1.14, dx: 0.06 - 0.12 * p, dy: 0 };
    case 'up': return { scale: 1.14, dx: 0, dy: 0.06 - 0.12 * p };
    case 'down': return { scale: 1.14, dx: 0, dy: -0.06 + 0.12 * p };
    default: return { scale: 1, dx: 0, dy: 0 };
  }
}

const STYLE_ID = 'soma-video-editor-style';
const CSS = `
.sve { --sve-bg: #121417; --sve-panel: #1a1d22; --sve-panel-2: #22262c; --sve-line: #2e333b; --sve-fg: #e7e9ec; --sve-muted: #8d95a1;
  --sve-accent: #f2b544; --sve-accent-ink: #1b1406; --sve-pic: #4f8fd6; --sve-cap: #c98bd9; --sve-fx: #5fc2a8; --sve-song: #7c8aa0; --sve-note: #ef7f66; --sve-ok: #7ccf86;
  color-scheme: dark; color: var(--sve-fg); background: var(--sve-bg); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  position: fixed; inset: 0; z-index: 2147483000; overflow: auto; box-sizing: border-box; padding: 10px; }
.sve:fullscreen { padding: 0; }
.sve * { box-sizing: border-box; }
.sve button, .sve select, .sve input, .sve textarea { font: inherit; color: inherit; }
.sve button { cursor: pointer; }
.sve :focus-visible { outline: 2px solid var(--sve-accent); outline-offset: 2px; }
.sve-suite { display: grid; gap: 1px; background: var(--sve-line); border-radius: 9px; overflow: hidden;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr) minmax(0, 300px); grid-template-rows: auto minmax(340px, 1fr) auto; min-height: 100%;
  grid-template-areas: "top top top" "script preview inspect" "tl tl tl"; }
.sve-suite > * { background: var(--sve-panel); min-width: 0; min-height: 0; }
.sve-top { grid-area: top; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 8px 12px; }
.sve-title { font-weight: 700; font-size: 16px; }
.sve-grow { flex: 1; }
.sve-msg { color: var(--sve-muted); font-size: 12px; }
.sve-btn { border: 1px solid var(--sve-line); background: var(--sve-panel-2); border-radius: 6px; padding: 5px 11px; font-size: 13px; line-height: 1.3; }
.sve-btn:hover { border-color: var(--sve-muted); }
.sve-btn:disabled { opacity: .5; cursor: default; }
.sve-primary { background: var(--sve-accent); color: var(--sve-accent-ink); border-color: var(--sve-accent); font-weight: 600; }
.sve select, .sve input, .sve textarea { background: var(--sve-panel-2); border: 1px solid var(--sve-line); border-radius: 6px; padding: 5px 8px; max-width: 100%; }
.sve-pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; border: 1px solid var(--sve-line); background: var(--sve-panel-2); }
.sve-pill::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--sve-ok); }
.sve-pill[data-state="stale"]::before { background: var(--sve-note); } .sve-pill[data-state="never"]::before { background: var(--sve-muted); }
.sve-pane-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 12px; border-bottom: 1px solid var(--sve-line);
  font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--sve-muted); }
.sve-script { grid-area: script; display: flex; flex-direction: column; overflow: hidden; }
.sve-scroll { position: relative; overflow: auto; flex: 1 1 0; min-height: 0; }
.sve-stack { position: relative; }
.sve-stack pre, .sve-stack textarea { margin: 0; padding: 12px 14px 40px; font: 14px/1.55 "Courier Prime", "Courier New", Courier, monospace;
  white-space: pre-wrap; overflow-wrap: anywhere; border: 0; border-radius: 0; width: 100%; tab-size: 2; }
.sve-stack pre { position: absolute; inset: 0; pointer-events: none; color: var(--sve-fg); }
.sve-stack textarea { position: relative; display: block; background: transparent; color: transparent; caret-color: var(--sve-accent); resize: none; overflow: hidden; outline: none; min-height: 100%; }
.sve-stack textarea[readonly] { cursor: progress; }
.sve-ln { display: block; border-left: 3px solid transparent; margin-left: -14px; padding-left: 11px; }
.sve-ln.sve-live { background: rgb(242 181 68 / .09); border-left-color: var(--sve-accent); }
.sve-ln.sve-sel:not(.sve-live) { background: rgb(79 143 214 / .08); border-left-color: var(--sve-pic); }
.sve-ln.sve-bad { background: rgb(239 127 102 / .14); border-left-color: var(--sve-note); }
.sve-t-head { color: #fff; font-weight: 700; } .sve-t-time { color: var(--sve-accent); font-weight: 400; } .sve-t-tr { color: var(--sve-fx); }
.sve-t-shot { color: var(--sve-pic); } .sve-t-lyr { color: var(--sve-cap); } .sve-t-note { color: var(--sve-note); } .sve-t-meta { color: var(--sve-muted); }
.sve-checks { border-top: 1px solid var(--sve-line); padding: 7px 12px; font-size: 12px; color: var(--sve-muted); max-height: 90px; overflow: auto; }
.sve-checks b { color: var(--sve-note); }
.sve-preview { grid-area: preview; display: flex; flex-direction: column; overflow: hidden; }
.sve-stage { flex: 1 1 0; min-height: 0; display: flex; align-items: center; justify-content: center; background: #0b0c0e; padding: 12px; overflow: hidden; }
.sve-stage canvas, .sve-stage video { max-width: 100%; max-height: 100%; background: #000; box-shadow: 0 0 0 1px var(--sve-line); }
.sve-stage canvas.sve-v { height: 100%; width: auto; } .sve-stage canvas.sve-h { width: 100%; height: auto; }
.sve-transport { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 7px 12px; border-top: 1px solid var(--sve-line); }
.sve-play { width: 34px; height: 34px; border-radius: 50%; border: 0; background: var(--sve-accent); color: var(--sve-accent-ink); font-size: 14px; }
.sve-tc { font: 13px ui-monospace, Menlo, monospace; font-variant-numeric: tabular-nums; } .sve-tc span { color: var(--sve-muted); }
.sve-seg { display: inline-flex; border: 1px solid var(--sve-line); border-radius: 6px; overflow: hidden; }
.sve-seg button { border: 0; background: transparent; padding: 4px 10px; font-size: 12px; color: var(--sve-muted); }
.sve-seg button[aria-pressed="true"] { background: var(--sve-panel-2); color: var(--sve-fg); }
.sve-inspect { grid-area: inspect; overflow: auto; }
.sve-insp { padding: 12px; display: grid; gap: 11px; }
.sve-insp h3 { margin: 0; font-size: 15px; }
.sve-sub { color: var(--sve-muted); font: 12px ui-monospace, Menlo, monospace; }
.sve-thumb { width: 100%; border-radius: 6px; display: block; box-shadow: 0 0 0 1px var(--sve-line); background: #0b0c0e; object-fit: contain; max-height: 240px; }
.sve-field { display: grid; gap: 4px; }
.sve-field > span { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--sve-muted); }
.sve-field textarea { resize: vertical; min-height: 60px; }
.sve-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sve-acts { display: flex; flex-wrap: wrap; gap: 6px; }
.sve-hist { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; }
.sve-hist button { padding: 0; border: 1px solid var(--sve-line); border-radius: 4px; background: #0b0c0e; overflow: hidden; aspect-ratio: 16 / 9; }
.sve-hist img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sve-tl { grid-area: tl; }
.sve-tl-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 7px 12px; border-bottom: 1px solid var(--sve-line); font-size: 12px; color: var(--sve-muted); }
.sve-tl-bar label { display: inline-flex; align-items: center; gap: 6px; }
.sve-overview { display: block; width: 100%; height: 26px; cursor: pointer; border-bottom: 1px solid var(--sve-line); }
.sve-tl-body { display: grid; grid-template-columns: 86px minmax(0, 1fr); }
.sve-labels > div { display: flex; align-items: center; padding: 0 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--sve-muted); border-bottom: 1px solid var(--sve-line); }
.sve-tscroll { overflow-x: auto; overflow-y: hidden; position: relative; }
.sve-tracks { position: relative; }
.sve-trk { position: relative; border-bottom: 1px solid var(--sve-line); }
.sve-h-ruler { height: 24px; } .sve-h-pic { height: 60px; } .sve-h-cap { height: 32px; } .sve-h-fx { height: 28px; } .sve-h-song { height: 70px; } .sve-h-note { height: 28px; }
.sve-ruler { cursor: ew-resize; background: var(--sve-panel-2); }
.sve-tick { position: absolute; top: 0; bottom: 0; border-left: 1px solid var(--sve-line); font: 10px ui-monospace, Menlo, monospace; color: var(--sve-muted); padding: 5px 0 0 4px; pointer-events: none; }
.sve-clip { position: absolute; top: 4px; bottom: 4px; border-radius: 5px; overflow: hidden; cursor: pointer; }
.sve-clip.sve-pic { border: 1px solid rgb(255 255 255 / .14); background: #0b0c0e; }
.sve-clip.sve-pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .8; }
.sve-clip.sve-pic .sve-cl { position: absolute; left: 6px; bottom: 4px; right: 6px; font: 11px ui-monospace, Menlo, monospace; color: #fff; text-shadow: 0 1px 2px #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sve-clip.sve-pic.sve-on { box-shadow: 0 0 0 2px var(--sve-accent); }
.sve-clip.sve-pic.sve-untimed { border-style: dashed; }
.sve-clip.sve-pic.sve-out { opacity: .35; }
.sve-clip.sve-pic[data-status="redo"]::after, .sve-clip.sve-pic[data-status="new"]::after { content: attr(data-status); position: absolute; top: 3px; right: 4px; font: 600 10px ui-monospace, Menlo, monospace; background: var(--sve-note); color: #1b0d08; border-radius: 3px; padding: 0 4px; }
.sve-clip.sve-cap { background: rgb(201 139 217 / .18); border: 1px solid rgb(201 139 217 / .5); color: #f1dcf6; font-size: 11px; padding: 3px 6px; white-space: nowrap; text-overflow: ellipsis; cursor: default; }
.sve-clip.sve-fx { background: rgb(95 194 168 / .16); border: 1px solid rgb(95 194 168 / .45); color: #c9f0e5; font: 11px ui-monospace, Menlo, monospace; padding: 3px 6px; white-space: nowrap; text-align: left; }
.sve-clip.sve-fx.sve-auto { background: transparent; border-style: dashed; color: var(--sve-muted); }
.sve-seam { position: absolute; top: 0; bottom: 0; width: 12px; margin-left: -6px; cursor: col-resize; z-index: 3; touch-action: none; }
.sve-seam::before { content: ""; position: absolute; left: 5px; top: 8px; bottom: 8px; width: 2px; background: rgb(255 255 255 / .25); border-radius: 1px; }
.sve-seam:hover::before { background: var(--sve-accent); }
.sve-chip { position: absolute; top: 50%; transform: translate(-50%, -50%); z-index: 4; border: 1px solid var(--sve-fx); background: #12302a; color: #c9f0e5; border-radius: 4px; font: 10px ui-monospace, Menlo, monospace; padding: 2px 5px; white-space: nowrap; }
.sve-chip.sve-auto { width: 10px; height: 10px; padding: 0; border-radius: 50%; font-size: 0; border-color: var(--sve-muted); background: var(--sve-panel-2); }
.sve-chip.sve-auto:hover { width: auto; height: auto; padding: 2px 5px; border-radius: 4px; font-size: 10px; }
.sve-wave { position: absolute; left: 0; top: 0; height: 70px; }
.sve-wave-msg { position: absolute; left: 12px; top: 26px; font-size: 12px; color: var(--sve-muted); }
.sve-marker { position: absolute; top: 4px; display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--sve-note); white-space: nowrap; cursor: pointer; background: none; border: 0; padding: 0; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
.sve-marker::before { content: ""; flex: none; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 10px solid var(--sve-note); }
.sve-shade { position: absolute; top: 0; bottom: 0; background: rgb(0 0 0 / .45); pointer-events: none; z-index: 2; }
.sve-playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--sve-accent); z-index: 6; pointer-events: none; }
.sve-playhead::before { content: ""; position: absolute; top: 0; left: -5px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid var(--sve-accent); }
@media (max-width: 1100px) {
  .sve-suite { grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); grid-template-rows: auto 480px auto auto; grid-template-areas: "top top" "script preview" "inspect inspect" "tl tl"; }
}
@media (max-width: 720px) {
  .sve-suite { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto 340px auto auto; grid-template-areas: "top" "preview" "script" "inspect" "tl"; }
  .sve-stage { flex: none; height: 300px; }
}
`;

function installStyle(document) {
  if (!document.head || document.getElementById?.(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortClock = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`.replace(/:60$/, ':59');

/** One script line, coloured by what it is. */
function colourLine(line) {
  const e = esc(line);
  const trimmed = line.trim();
  if (/^\.[^.\s]/.test(trimmed)) return `<span class="sve-t-head">${e.replace(/(\d[\d:.]*\s*(?:-|–|to)\s*\d[\d:.]*)\s*$/, '<span class="sve-t-time">$1</span>')}</span>`;
  if (/^(CUT|DISSOLVE|WIPE|PUSH) TO:$|^FADE (TO BLACK|OUT|IN)\.?$/.test(trimmed)) return `<span class="sve-t-tr">${e}</span>`;
  if (/^SHOT\s/.test(trimmed)) return `<span class="sve-t-shot">${e}</span>`;
  if (trimmed.startsWith('~')) return `<span class="sve-t-lyr">${e}</span>`;
  if (/^\[\[/.test(trimmed)) return `<span class="sve-t-note">${e}</span>`;
  if (/^Title:/i.test(trimmed)) return `<span class="sve-t-meta">${e}</span>`;
  return e;
}

export function mountVideoEditor(container, { board: initial, api, host = false, objectUrl, onBoard = () => {}, onClose = () => {}, document = container.ownerDocument, window = document.defaultView }) {
  installStyle(document);
  let board = initial;
  let placed = layoutScenes(board.scenes);
  let duration = 0;
  let time = 0;
  let playing = false;
  let selected = 0;
  let pps = 12;
  let source = 'anim';
  let cutId = board.cuts.find((c) => c.all)?.id ?? board.cuts[0]?.id ?? null;
  let lineScene = [];
  let headLines = [];
  let badLines = new Set();
  let peaks = null;
  let audio = null;
  let raf = 0;
  let last = 0;
  let gone = false;
  let typing = null;
  let saving = false;
  let again = false;
  const images = new Map();
  const role = board.role === 'owner' ? 'owner' : 'artist';

  const root = document.createElement('section');
  root.className = 'sve';
  root.innerHTML = `
  <div class="sve-suite">
    <header class="sve-top">
      <button type="button" class="sve-btn" data-r="close">← Cards</button>
      <span class="sve-title" data-r="title"></span>
      <span class="sve-msg" data-r="msg" role="status"></span>
      <span class="sve-grow"></span>
      <label class="sve-msg">Cut <select data-r="cut" aria-label="Cut"></select></label>
      <span class="sve-pill" data-r="state"></span>
      <button type="button" class="sve-btn sve-primary" data-r="render">Render this cut</button>
      <button type="button" class="sve-btn" data-r="full" title="Use the whole screen">Full screen</button>
    </header>
    <section class="sve-script" aria-label="Script">
      <div class="sve-pane-h"><span>Script</span><span>type here, the timeline follows</span></div>
      <div class="sve-scroll" data-r="scroll"><div class="sve-stack"><pre data-r="backdrop" aria-hidden="true"></pre><textarea data-r="text" spellcheck="false" aria-label="Script"></textarea></div></div>
      <div class="sve-checks" data-r="checks"></div>
    </section>
    <section class="sve-preview" aria-label="Preview">
      <div class="sve-pane-h"><span>Preview</span><span class="sve-seg" role="group" aria-label="Preview source">
        <button type="button" data-r="anim" aria-pressed="true">Animatic</button><button type="button" data-r="last" aria-pressed="false">Last render</button></span></div>
      <div class="sve-stage" data-r="stage"><canvas data-r="screen" width="960" height="540"></canvas></div>
      <div class="sve-transport">
        <button type="button" class="sve-play" data-r="play" aria-label="Play">▶</button>
        <span class="sve-tc" data-r="tc"></span>
        <span class="sve-msg">Space plays · ← → one second · Esc back to the cards</span>
      </div>
    </section>
    <aside class="sve-inspect" aria-label="Scene"><div class="sve-pane-h"><span>Scene</span><span data-r="sid"></span></div><div class="sve-insp" data-r="insp"></div></aside>
    <section class="sve-tl" aria-label="Timeline">
      <div class="sve-tl-bar"><label>Zoom <input type="range" min="4" max="48" value="12" data-r="zoom" aria-label="Zoom"></label>
        <span>Drag a seam to retime · click a transition or a motion to change it · drag the ruler or the song to scrub</span></div>
      <canvas class="sve-overview" data-r="overview" height="26" aria-label="The whole song"></canvas>
      <div class="sve-tl-body">
        <div class="sve-labels"><div class="sve-h-ruler"></div><div class="sve-h-pic">Pictures</div><div class="sve-h-cap">Captions</div><div class="sve-h-fx">Motion</div><div class="sve-h-song">Song</div><div class="sve-h-note">Notes</div></div>
        <div class="sve-tscroll" data-r="tscroll"><div class="sve-tracks" data-r="tracks">
          <div class="sve-trk sve-h-ruler sve-ruler" data-r="ruler"></div>
          <div class="sve-trk sve-h-pic" data-r="tpic"></div>
          <div class="sve-trk sve-h-cap" data-r="tcap"></div>
          <div class="sve-trk sve-h-fx" data-r="tfx"></div>
          <div class="sve-trk sve-h-song" data-r="tsong"><canvas class="sve-wave" data-r="wave" height="70"></canvas></div>
          <div class="sve-trk sve-h-note" data-r="tnote"></div>
          <div class="sve-playhead" data-r="playhead"></div>
        </div></div>
      </div>
    </section>
  </div>`;
  // The editor covers the whole window (an editing suite, not a panel in the page), so no page layout clips it.
  (document.body ?? container).append(root);
  const $ = (name) => root.querySelector(`[data-r="${name}"]`);
  const ta = $('text');
  const backdrop = $('backdrop');
  const screen = $('screen');
  const ctx = screen.getContext?.('2d') ?? null;
  const off = document.createElement('canvas');
  const say = (text) => { $('msg').textContent = text; };
  const fail = (error) => say(error?.message ?? String(error));

  const cut = () => board.cuts.find((c) => c.id === cutId) ?? null;
  const aspect = () => cut()?.aspect ?? (board.cuts[0]?.aspect || '16x9');
  const inCut = () => {
    const c = cut();
    return c ? new Set(cutScenes(board, c)) : null;
  };

  // ---------- the board's files ----------
  function image(name) {
    if (!name || !objectUrl) return null;
    if (!images.has(name)) {
      const img = new window.Image();
      images.set(name, img);
      objectUrl(name).then((url) => {
        if (!url || gone) return;
        img.onload = () => { draw(); };
        img.src = url;
      }).catch(() => {});
    }
    return images.get(name);
  }
  const pictureName = (scene, a = aspect()) => scene.pictures?.[a] ?? scene.pictures?.[a === '9x16' ? '16x9' : '9x16'] ?? null;

  async function loadSong() {
    if (!board.song?.file || !objectUrl) {
      $('tsong').insertAdjacentHTML('beforeend', '<span class="sve-wave-msg">No song on this storyboard yet.</span>');
      return;
    }
    const url = await objectUrl(board.song.file).catch(() => null);
    if (!url || gone) return;
    audio = new window.Audio();
    audio.preload = 'auto';
    audio.src = url;
    audio.addEventListener('ended', () => setPlaying(false));
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      const bytes = await (await window.fetch(url)).arrayBuffer();
      const ac = new AC();
      const decoded = await ac.decodeAudioData(bytes);
      ac.close?.();
      const channels = Array.from({ length: Math.min(2, decoded.numberOfChannels) }, (_, i) => decoded.getChannelData(i));
      peaks = { data: songPeaks(channels, decoded.sampleRate, 50), perSecond: 50 };
      if (!board.song.duration) duration = Math.max(duration, decoded.duration);
      drawTimeline();
    } catch {
      $('tsong').insertAdjacentHTML('beforeend', '<span class="sve-wave-msg">This browser could not draw the song\'s waveform; it still plays.</span>');
    }
  }

  // ---------- saving ----------
  async function send(ops, done) {
    if (!ops.length) return board;
    say('Saving…');
    let next = board;
    for (const batch of opBatches(ops)) next = await api.changeBoard(board.id, batch);
    setBoard(next);
    onBoard(next);
    say(done ?? 'Saved.');
    return next;
  }
  async function change(ops, done) {
    try {
      await send(ops, done);
      writeScript();
    } catch (error) {
      fail(error);
    }
  }
  async function ask(job, sent) {
    try {
      await api.createJob(board.id, job);
      say(host ? `${sent} The team on the Mac picks it up within a minute.` : `${sent} It waits for the host to let it run on the Mac.`);
    } catch (error) {
      fail(error);
    }
  }

  // The script saves itself a moment after typing stops. Adding or removing a scene rewrites the script (a new
  // scene gets its SHOT id), so the box is held for that moment; other changes leave the typed text alone.
  async function saveScript() {
    if (saving) { again = true; return; }
    const text = ta.value;
    const { ops, problems, warnings } = scriptToOps(board, text, { role });
    showChecks(problems, warnings);
    if (problems.length || !ops.length) return;
    const reshapes = ops.some((o) => o.op === 'add-after' || o.op === 'remove' || o.op === 'move');
    saving = true;
    if (reshapes) ta.readOnly = true;
    try {
      await send(ops);
      if (reshapes || ta.value === text) writeScript({ keepCaret: true });
    } catch (error) {
      fail(error);
    } finally {
      saving = false;
      ta.readOnly = false;
      if (again) { again = false; saveScript(); }
    }
  }

  function setBoard(next) {
    board = next;
    placed = layoutScenes(board.scenes);
    duration = Math.max(board.song?.duration ?? 0, placed.at(-1)?.end ?? 0, peaks ? peaks.data.length / peaks.perSecond : 0, 1);
    if (!board.cuts.some((c) => c.id === cutId)) cutId = board.cuts[0]?.id ?? null;
    selected = Math.min(selected, Math.max(0, board.scenes.length - 1));
    drawTop();
    drawTimeline();
    drawInspector();
    draw();
  }

  // ---------- the script ----------
  function writeScript({ keepCaret = false } = {}) {
    const text = boardToScript(board);
    if (text !== ta.value) {
      const at = ta.selectionStart ?? 0;
      const before = ta.value.slice(0, at).split('\n');
      ta.value = text;
      if (keepCaret) {
        const lines = text.split('\n');
        const row = Math.min(before.length - 1, lines.length - 1);
        const col = Math.min(before.at(-1).length, lines[row].length);
        const pos = lines.slice(0, row).reduce((n, l) => n + l.length + 1, 0) + col;
        ta.setSelectionRange?.(pos, pos);
      }
    }
    const read = readScript(ta.value);
    lineScene = read.lineScene;
    headLines = read.scenes.map((s) => s.line - 1);
    showChecks(read.problems, read.warnings);
    grow();
    paintScript();
  }
  function grow() {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }
  function paintScript() {
    const live = sceneAtTime(placed, time);
    backdrop.innerHTML = ta.value.split('\n').map((line, n) => {
      const s = lineScene[n];
      const cls = badLines.has(n + 1) ? ' sve-bad' : s >= 0 && s === live ? ' sve-live' : s >= 0 && s === selected ? ' sve-sel' : '';
      return `<span class="sve-ln${cls}" data-n="${n}">${colourLine(line) || ' '}</span>`;
    }).join('');
  }
  function showChecks(problems, warnings = []) {
    badLines = new Set(problems.map((p) => p.line));
    const lines = (list) => list.map((p) => `<b>Line ${p.line}</b> ${esc(p.message)}`).join('<br>');
    $('checks').innerHTML = problems.length
      ? `${lines(problems)}<br>Nothing is saved until ${problems.length === 1 ? 'this is' : 'these are'} fixed.`
      : `${warnings.length ? `${lines(warnings)}<br>` : ''}${board.scenes.length} scene${board.scenes.length === 1 ? '' : 's'} · ${clockOf(placed.at(-1)?.end ?? 0)} of picture · saved as you type`;
  }
  function scrollScriptTo(index) {
    const n = headLines[index];
    const line = n == null ? null : backdrop.querySelector(`[data-n="${n}"]`);
    const box = $('scroll');
    if (!line || !box) return;
    if (line.offsetTop < box.scrollTop || line.offsetTop > box.scrollTop + box.clientHeight - 80) box.scrollTo?.({ top: line.offsetTop - 12, behavior: 'smooth' });
  }
  ta.addEventListener('input', () => {
    grow();
    const read = readScript(ta.value);
    lineScene = read.lineScene;
    headLines = read.scenes.map((s) => s.line - 1);
    paintScript();
    window.clearTimeout(typing);
    typing = window.setTimeout(saveScript, 700);
  });
  ta.addEventListener('blur', () => {
    window.clearTimeout(typing);
    saveScript();
  });
  ta.addEventListener('click', () => {
    const n = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
    const index = lineScene[n];
    if (!(index >= 0) || !placed[index]) return;
    const p = placed[index];
    // A lyric line goes to its own moment in the scene; any other line to the scene's start.
    const lines = ta.value.split('\n');
    const lyricLines = lines.map((l, k) => k).filter((k) => lineScene[k] === index && lines[k].trim().startsWith('~'));
    const which = lyricLines.indexOf(n);
    const per = (p.end - p.start) / Math.max(1, lyricLines.length);
    select(index, false);
    seek(which >= 0 ? p.start + which * per + 0.05 : p.start);
  });

  // ---------- the preview ----------
  function setShape() {
    const vertical = aspect() === '9x16';
    screen.width = vertical ? 540 : 960;
    screen.height = vertical ? 960 : 540;
    screen.className = vertical ? 'sve-v' : 'sve-h';
  }
  function drawPicture(target, p, t, W, H) {
    const scene = p.scene;
    const img = image(pictureName(scene));
    target.fillStyle = '#0b0c0e';
    target.fillRect(0, 0, W, H);
    if (!img?.complete || !img.naturalWidth) {
      target.fillStyle = '#8d95a1';
      target.font = '600 24px system-ui, sans-serif';
      target.textAlign = 'center';
      target.fillText(`${scene.id} · ${pictureName(scene) ? 'loading…' : 'no picture yet'}`, W / 2, H / 2);
      target.textAlign = 'start';
      return;
    }
    const progress = Math.min(1, Math.max(0, (t - p.start) / (p.end - p.start)));
    const m = motionAt(scene.motion, progress);
    const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight) * m.scale;
    const w = img.naturalWidth * cover;
    const h = img.naturalHeight * cover;
    target.drawImage(img, (W - w) / 2 + m.dx * W, (H - h) / 2 + m.dy * H, w, h);
  }
  function draw() {
    if (!ctx || gone) return;
    const W = screen.width;
    const H = screen.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const f = frameAt(placed, time);
    if (f.index < 0) {
      ctx.fillStyle = '#8d95a1';
      ctx.font = '600 24px system-ui, sans-serif';
      ctx.fillText('No scenes yet. Write a heading in the script.', 40, H / 2);
      return;
    }
    const p = placed[f.index];
    if (f.from >= 0) {
      off.width = W;
      off.height = H;
      const o = off.getContext('2d');
      const prev = placed[f.from];
      drawPicture(o, prev, prev.end, W, H);
      const k = f.mix;
      if (f.transition === 'dissolve') {
        ctx.drawImage(off, 0, 0);
        ctx.globalAlpha = k;
        drawPicture(ctx, p, time, W, H);
      } else if (f.transition === 'fade') {
        if (k < 0.5) { ctx.globalAlpha = 1 - k * 2; ctx.drawImage(off, 0, 0); } else { ctx.globalAlpha = (k - 0.5) * 2; drawPicture(ctx, p, time, W, H); }
      } else if (f.transition === 'wipe') {
        ctx.drawImage(off, 0, 0);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W * k, H);
        ctx.clip();
        drawPicture(ctx, p, time, W, H);
        ctx.restore();
      } else if (f.transition === 'push') {
        ctx.drawImage(off, -W * k, 0);
        ctx.save();
        ctx.translate(W * (1 - k), 0);
        drawPicture(ctx, p, time, W, H);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    } else {
      drawPicture(ctx, p, time, W, H);
    }
    const line = captionAt(p, time);
    if (line) {
      const vertical = H > W;
      const size = vertical ? 38 : 34;
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const y = vertical ? H * 0.78 : H - 54;
      const width = Math.min(W - 40, ctx.measureText(line).width + 36);
      ctx.fillStyle = 'rgba(10,10,12,.55)';
      ctx.fillRect((W - width) / 2, y - size, width, size * 1.5);
      ctx.fillStyle = '#fff';
      ctx.fillText(line, W / 2, y + 4, W - 60);
      ctx.textAlign = 'start';
    }
  }
  function showSource(next) {
    source = next;
    $('anim').setAttribute('aria-pressed', String(next === 'anim'));
    $('last').setAttribute('aria-pressed', String(next === 'last'));
    const stage = $('stage');
    stage.querySelector('video')?.remove();
    screen.hidden = next === 'last';
    if (next !== 'last') return draw();
    setPlaying(false);
    const c = cut();
    if (!c?.render?.file) {
      screen.hidden = false;
      showSource('anim');
      return say('This cut has not been rendered yet.');
    }
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    stage.append(video);
    objectUrl(c.render.file).then((url) => { if (url) video.src = url; }).catch(fail);
    say(`Last render of ${c.name}, ${String(c.render.at).slice(0, 16).replace('T', ' ')}.`);
  }

  // ---------- the clock ----------
  function setPlaying(on) {
    playing = on;
    $('play').textContent = on ? '❚❚' : '▶';
    $('play').setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (!on) {
      audio?.pause?.();
      window.cancelAnimationFrame?.(raf);
      return;
    }
    if (source === 'last') showSource('anim');
    if (time >= duration - 0.05) time = 0;
    if (audio) {
      audio.currentTime = time;
      audio.play?.().catch(() => setPlaying(false));
    }
    last = window.performance?.now?.() ?? Date.now();
    raf = window.requestAnimationFrame?.(tick);
  }
  function tick(now) {
    if (!playing || gone) return;
    const before = sceneAtTime(placed, time);
    if (audio && !audio.paused) time = audio.currentTime;
    else time += Math.min(0.1, (now - last) / 1000);
    last = now;
    if (time >= duration) { time = duration; setPlaying(false); }
    moved(before);
    if (playing) raf = window.requestAnimationFrame(tick);
  }
  function moved(before) {
    $('playhead').style.left = `${X(time)}px`;
    $('tc').innerHTML = `${clockOf(time)} <span>/ ${clockOf(duration)}</span>`;
    draw();
    drawOverview();
    follow();
    const now = sceneAtTime(placed, time);
    if (now !== before) {
      paintScript();
      if (playing) scrollScriptTo(now);
    }
  }
  function seek(t) {
    const before = sceneAtTime(placed, time);
    time = Math.max(0, Math.min(duration, t));
    if (audio) audio.currentTime = time;
    moved(before);
  }
  function follow() {
    const box = $('tscroll');
    const x = X(time);
    if (x < box.scrollLeft + 30 || x > box.scrollLeft + box.clientWidth - 30) box.scrollLeft = x - box.clientWidth * 0.3;
  }

  // ---------- the timeline ----------
  const X = (t) => t * pps + 12;
  const T = (x) => Math.max(0, Math.min(duration, (x - 12) / pps));
  function drawTimeline() {
    const W = X(duration) + 40;
    $('tracks').style.width = `${W}px`;
    const step = pps >= 30 ? 5 : pps >= 12 ? 10 : pps >= 6 ? 20 : 30;
    let ticks = '';
    for (let t = 0; t <= duration; t += step) ticks += `<span class="sve-tick" style="left:${X(t)}px">${shortClock(t)}</span>`;
    $('ruler').innerHTML = ticks;
    const pic = $('tpic');
    const cap = $('tcap');
    const fx = $('tfx');
    const note = $('tnote');
    pic.replaceChildren();
    cap.replaceChildren();
    fx.replaceChildren();
    note.replaceChildren();
    const shown = inCut();
    placed.forEach((p, i) => {
      const { scene } = p;
      const left = X(p.start);
      const width = Math.max(4, X(p.end) - left - 2);
      const clip = document.createElement('div');
      clip.className = `sve-clip sve-pic${i === selected ? ' sve-on' : ''}${p.timed ? '' : ' sve-untimed'}${shown && !shown.has(scene.id) ? ' sve-out' : ''}`;
      clip.dataset.status = scene.status;
      clip.style.left = `${left}px`;
      clip.style.width = `${width}px`;
      clip.title = `${scene.id}${scene.lyric ? `: ${scene.lyric}` : ''}${p.timed ? '' : ' (no time in the song yet)'}`;
      const name = pictureName(scene);
      if (name) {
        const img = document.createElement('img');
        img.alt = '';
        const cached = image(name);
        if (cached?.src) img.src = cached.src;
        else objectUrl(name).then((url) => { if (url) img.src = url; }).catch(() => {});
        clip.append(img);
      }
      const label = document.createElement('span');
      label.className = 'sve-cl';
      label.textContent = `${scene.id}${scene.section ? ` · ${scene.section}` : ''}`;
      clip.append(label);
      clip.addEventListener('click', () => { select(i); seek(p.start); });
      pic.append(clip);

      const lines = String(scene.lyric ?? '').split(' / ').map((l) => l.trim()).filter(Boolean);
      const per = (p.end - p.start) / Math.max(1, lines.length);
      lines.forEach((line, k) => {
        const c = document.createElement('div');
        c.className = 'sve-clip sve-cap';
        c.style.left = `${X(p.start + k * per)}px`;
        c.style.width = `${Math.max(4, per * pps - 3)}px`;
        c.textContent = line;
        c.title = line;
        cap.append(c);
      });

      const m = document.createElement('button');
      m.type = 'button';
      m.className = `sve-clip sve-fx${scene.motion ? '' : ' sve-auto'}`;
      m.style.left = `${left}px`;
      m.style.width = `${width}px`;
      m.textContent = scene.motion ? `motion ${scene.motion}` : 'motion auto';
      m.title = `How ${scene.id}'s picture moves${scene.motion ? '' : ' (auto: the renderer chooses)'}. Click to change.`;
      m.addEventListener('click', () => {
        const value = MOTION_CYCLE[(MOTION_CYCLE.indexOf(scene.motion) + 1) % MOTION_CYCLE.length];
        select(i);
        change([{ op: 'set', scene: scene.id, field: 'motion', value }], `${scene.id}: motion ${value || 'left to the renderer'}.`);
      });
      fx.append(m);

      if (scene.note || scene.status === 'redo') {
        const k = document.createElement('button');
        k.type = 'button';
        k.className = 'sve-marker';
        k.style.left = `${left + 2}px`;
        k.textContent = `${scene.id}${scene.noteBy ? ` · ${scene.noteBy}` : ''}: ${scene.status === 'redo' ? 'redo ' : ''}${scene.note}`;
        k.title = k.textContent;
        k.addEventListener('click', () => { select(i); seek(p.start); });
        note.append(k);
      }

      if (i > 0) {
        const seam = document.createElement('div');
        seam.className = 'sve-seam';
        seam.style.left = `${left}px`;
        seam.title = `Drag to retime ${placed[i - 1].scene.id} and ${scene.id}`;
        seam.addEventListener('pointerdown', (event) => dragSeam(event, i));
        pic.append(seam);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `sve-chip${scene.transition ? '' : ' sve-auto'}`;
        chip.style.left = `${left}px`;
        chip.textContent = scene.transition || 'auto';
        chip.title = `How ${scene.id} comes in${scene.transition ? '' : ' (auto: the renderer\'s default)'}. Click to change.`;
        chip.addEventListener('click', (event) => {
          event.stopPropagation();
          const value = TRANSITION_CYCLE[(TRANSITION_CYCLE.indexOf(scene.transition) + 1) % TRANSITION_CYCLE.length];
          select(i);
          change([{ op: 'set', scene: scene.id, field: 'transition', value }], `${scene.id} comes in by ${value || 'the renderer\'s default'}.`);
        });
        pic.append(chip);
      }
    });
    drawWave(W);
    root.querySelectorAll('.sve-shade').forEach((n) => n.remove());
    const c = cut();
    if (c && !c.all && c.audio?.length === 1) {
      const [a, b] = c.audio[0];
      if (a > 0) $('tracks').insertAdjacentHTML('beforeend', `<div class="sve-shade" style="left:0;width:${X(a)}px"></div>`);
      if (b < duration) $('tracks').insertAdjacentHTML('beforeend', `<div class="sve-shade" style="left:${X(b)}px;width:${W - X(b)}px"></div>`);
    }
    $('playhead').style.left = `${X(time)}px`;
    $('tc').innerHTML = `${clockOf(time)} <span>/ ${clockOf(duration)}</span>`;
    drawOverview();
  }
  function drawWave(W) {
    const wave = $('wave');
    const g = wave.getContext?.('2d');
    if (!g) return;
    wave.width = Math.min(W, 32000);
    wave.style.width = `${wave.width}px`;
    g.clearRect(0, 0, wave.width, 70);
    if (!peaks) return;
    g.fillStyle = '#7c8aa0';
    for (let x = 12; x < Math.min(X(duration), wave.width); x += 2) {
      const a = Math.floor(T(x) * peaks.perSecond);
      const b = Math.max(a + 1, Math.floor(T(x + 2) * peaks.perSecond));
      let peak = 0;
      for (let k = a; k < b && k < peaks.data.length; k += 1) peak = Math.max(peak, peaks.data[k]);
      const h = Math.max(0.5, peak * 30);
      g.fillRect(x, 35 - h, 1.4, h * 2);
    }
  }
  function drawOverview() {
    const c = $('overview');
    const g = c.getContext?.('2d');
    if (!g) return;
    const W = c.clientWidth || 800;
    c.width = W;
    g.clearRect(0, 0, W, 26);
    placed.forEach((p, i) => {
      g.fillStyle = i === selected ? '#f2b544' : i % 2 ? '#3a5f8c' : '#4f8fd6';
      g.globalAlpha = i === selected ? 0.8 : 0.55;
      g.fillRect((p.start / duration) * W, 4, Math.max(1, ((p.end - p.start) / duration) * W - 1), 18);
    });
    g.globalAlpha = 1;
    const box = $('tscroll');
    const total = X(duration) + 40;
    const a = (box.scrollLeft / total) * W;
    const b = ((box.scrollLeft + box.clientWidth) / total) * W;
    g.strokeStyle = '#e7e9ec';
    g.lineWidth = 1.5;
    g.strokeRect(a + 1, 1.5, Math.max(6, b - a - 2), 23);
    g.fillStyle = '#f2b544';
    g.fillRect((time / duration) * W - 1, 0, 2, 26);
  }
  function dragSeam(event, i) {
    event.preventDefault();
    event.stopPropagation();
    const a = placed[i - 1];
    const b = placed[i];
    const lo = a.start + 0.5;
    const hi = b.end - 0.5;
    let at = b.start;
    const seam = event.currentTarget;
    const move = (e) => {
      const r = $('tracks').getBoundingClientRect();
      at = Math.round(Math.max(lo, Math.min(hi, T(e.clientX - r.left))) * 10) / 10;
      seam.style.left = `${X(at)}px`;
      seek(at);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (Math.abs(at - b.start) < 0.05 && a.timed && b.timed) return;
      change([
        { op: 'set', scene: a.scene.id, field: 'start', value: a.start },
        { op: 'set', scene: a.scene.id, field: 'end', value: at },
        { op: 'set', scene: b.scene.id, field: 'start', value: at },
        { op: 'set', scene: b.scene.id, field: 'end', value: b.end },
      ].filter((op) => placed.find((p) => p.scene.id === op.scene).scene[op.field] !== op.value), `${a.scene.id} now ends and ${b.scene.id} starts at ${timeText(at)}.`);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ---------- the inspector ----------
  function drawInspector() {
    const box = $('insp');
    const p = placed[selected];
    if (!p) {
      $('sid').textContent = '';
      box.textContent = 'No scenes yet. Write a heading in the script, such as .INTRO 0:00-0:12';
      return;
    }
    const { scene } = p;
    const has = Object.keys(scene.pictures ?? {}).length > 0;
    $('sid').textContent = scene.id;
    const state = cut() ? cutState(board, cut()) : null;
    const stale = state?.changed?.includes(scene.id);
    box.innerHTML = `
      <img class="sve-thumb" alt="${esc(scene.id)}" data-r="ithumb" hidden>
      <div><h3>${esc(scene.section || scene.id)}${scene.lyric ? ` · ${esc(scene.lyric.split(' / ')[0])}` : ''}</h3>
        <div class="sve-sub">${p.timed ? `${clockOf(p.start)} to ${clockOf(p.end)} · ${(p.end - p.start).toFixed(1)} s` : 'no time in the song yet'} · ${esc(scene.status)}${stale ? ' · <span style="color:var(--sve-note)">changed since the render</span>' : ''}</div></div>
      <div class="sve-row2">
        <label class="sve-field"><span>Motion</span><select data-r="imotion">${MOTION_CYCLE.map((m) => `<option value="${m}"${m === scene.motion ? ' selected' : ''}>${m || 'renderer\'s choice'}</option>`).join('')}</select></label>
        <label class="sve-field"><span>Comes in by</span><select data-r="itrans"${selected === 0 ? ' disabled' : ''}>${TRANSITION_CYCLE.map((m) => `<option value="${m}"${m === scene.transition ? ' selected' : ''}>${m || 'default'}</option>`).join('')}</select></label>
      </div>
      <label class="sve-field"><span>Prompt</span><textarea data-r="iprompt" rows="3">${esc(scene.prompt)}</textarea></label>
      <label class="sve-field"><span>Redo note</span><input data-r="inote" value="${esc(scene.note)}" placeholder="What should change in the picture"></label>
      <div class="sve-acts">
        <button type="button" class="sve-btn sve-primary" data-r="iredo">${has ? 'Redo with note' : 'Make the pictures'}</button>
        ${has ? '<button type="button" class="sve-btn" data-r="ireroll" title="Another take of the same prompt, in one click">Reroll</button>' : ''}
        <button type="button" class="sve-btn" data-r="ikeep">Keep</button>
        <button type="button" class="sve-btn" data-r="iadd">Add scene after</button>
      </div>
      ${scene.history?.length ? `<div class="sve-field"><span>Earlier pictures (${scene.history.length})</span><div class="sve-hist" data-r="ihist"></div></div>` : ''}`;
    const thumb = $('ithumb');
    const name = pictureName(scene);
    if (name) objectUrl(name).then((url) => { if (url) { thumb.src = url; thumb.hidden = false; } }).catch(() => {});
    const hist = $('ihist');
    scene.history?.forEach((old, at) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = `Use this one (${String(old.at).slice(0, 10)}${old.by ? `, ${old.by}` : ''})`;
      const img = document.createElement('img');
      img.alt = `${scene.id} earlier`;
      const file = old.pictures?.[aspect()] ?? Object.values(old.pictures ?? {})[0];
      if (file) objectUrl(file).then((url) => { if (url) img.src = url; }).catch(() => {});
      b.append(img);
      b.addEventListener('click', () => change([{ op: 'use-picture', scene: scene.id, history: at }], `Put back an earlier picture for ${scene.id}.`));
      hist.append(b);
    });
    $('imotion').addEventListener('change', (e) => change([{ op: 'set', scene: scene.id, field: 'motion', value: e.target.value }]));
    $('itrans').addEventListener('change', (e) => change([{ op: 'set', scene: scene.id, field: 'transition', value: e.target.value }]));
    $('iprompt').addEventListener('change', (e) => change([{ op: 'set', scene: scene.id, field: 'prompt', value: e.target.value }]));
    $('inote').addEventListener('change', (e) => change([{ op: 'set', scene: scene.id, field: 'note', value: e.target.value }]));
    $('iredo').addEventListener('click', async () => {
      const note = $('inote').value;
      if (has && !note.trim()) return say('Say what should change first, or use Reroll.');
      if (!has && !$('iprompt').value.trim()) return say('Say what the picture shows (the prompt) first.');
      await change([
        { op: 'set', scene: scene.id, field: 'note', value: note },
        { op: 'set', scene: scene.id, field: 'prompt', value: $('iprompt').value },
        { op: 'set', scene: scene.id, field: 'status', value: has ? 'redo' : 'new' },
      ]);
      await ask({ step: has ? 'redo' : 'add', scene: scene.id }, `Asked for new pictures for ${scene.id}.`);
    });
    $('ireroll')?.addEventListener('click', async () => {
      await change([{ op: 'set', scene: scene.id, field: 'status', value: 'redo' }]);
      await ask({ step: 'redo', scene: scene.id, ...(scene.note ? {} : { note: 'Reroll: same prompt, a different take.' }) }, `Asked for another take of ${scene.id}.`);
    });
    $('ikeep').addEventListener('click', () => change([{ op: 'set', scene: scene.id, field: 'note', value: '' }, { op: 'set', scene: scene.id, field: 'status', value: 'keep' }], `${scene.id} marked keep.`));
    $('iadd').addEventListener('click', async () => {
      // The new scene takes the second half of this one's time; its pictures are asked for once it has a prompt.
      const mid = Math.round(((p.start + p.end) / 2) * 10) / 10;
      const ops = p.timed ? [{ op: 'set', scene: scene.id, field: 'end', value: mid }] : [];
      ops.push({ op: 'add-after', after: scene.id, scene: p.timed ? { section: scene.section, start: mid, end: p.end } : { section: scene.section } });
      try {
        const next = await send(ops);
        writeScript();
        const added = next.added?.[0];
        const index = next.scenes.findIndex((s) => s.id === added);
        if (index >= 0) select(index);
        say(`Added ${added} after ${scene.id}. Write its prompt, then Make the pictures.`);
      } catch (error) {
        fail(error);
      }
    });
  }

  // ---------- the top bar ----------
  function drawTop() {
    $('title').textContent = board.title;
    const pick = $('cut');
    pick.innerHTML = board.cuts.length
      ? board.cuts.map((c) => `<option value="${esc(c.id)}"${c.id === cutId ? ' selected' : ''}>${esc(c.name)} · ${ASPECT_LABEL[c.aspect]}</option>`).join('')
      : '<option value="">No cuts yet</option>';
    const c = cut();
    const state = c ? cutState(board, c) : null;
    const pill = $('state');
    pill.dataset.state = state?.state ?? 'never';
    pill.textContent = !c ? 'No cut to render' : state.state === 'current' ? 'Up to date'
      : state.state === 'never' ? 'Not rendered yet'
        : `Needs a new render${state.changed.length ? `: ${state.changed.slice(0, 6).join(', ')}${state.changed.length > 6 ? '…' : ''} changed` : ''}`;
    $('render').disabled = !c;
  }

  function select(index, scroll = true) {
    selected = index;
    drawInspector();
    drawTimeline();
    paintScript();
    if (scroll) scrollScriptTo(index);
  }

  // ---------- wiring ----------
  $('close').addEventListener('click', () => onClose());
  $('play').addEventListener('click', () => setPlaying(!playing));
  $('anim').addEventListener('click', () => showSource('anim'));
  $('last').addEventListener('click', () => showSource('last'));
  $('cut').addEventListener('change', (e) => {
    cutId = e.target.value;
    setShape();
    drawTop();
    drawTimeline();
    drawInspector();
    if (source === 'last') showSource('last');
    else draw();
  });
  $('render').addEventListener('click', () => {
    const c = cut();
    if (c) ask({ step: 'render', cut: c.id }, `Asked for a render of ${c.name}.`);
  });
  $('full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else root.requestFullscreen?.().catch(() => say('This browser will not go full screen here.'));
  });
  $('zoom').addEventListener('input', (e) => {
    pps = Number(e.target.value);
    drawTimeline();
    follow();
  });
  const scrub = (e) => {
    const r = $('tracks').getBoundingClientRect();
    seek(T(e.clientX - r.left));
  };
  const scrubDrag = (e) => {
    scrub(e);
    const up = () => {
      window.removeEventListener('pointermove', scrub);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', scrub);
    window.addEventListener('pointerup', up);
  };
  $('ruler').addEventListener('pointerdown', scrubDrag);
  $('tsong').addEventListener('pointerdown', scrubDrag);
  $('overview').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * duration;
    seek(t);
    $('tscroll').scrollLeft = X(t) - $('tscroll').clientWidth / 2;
    drawOverview();
  });
  $('tscroll').addEventListener('scroll', drawOverview);
  const keys = (e) => {
    if (gone || !root.isConnected || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName ?? '')) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing); }
    if (e.key === 'ArrowRight') seek(time + 1);
    if (e.key === 'ArrowLeft') seek(time - 1);
    if (e.key === 'Escape' && !document.fullscreenElement) onClose();
  };
  document.addEventListener('keydown', keys);
  window.addEventListener('resize', drawOverview);

  setBoard(board);
  setShape();
  // Open with the whole song across the timeline; the zoom goes in from there.
  const fit = Math.round(Math.max(4, Math.min(48, (($('tscroll').clientWidth || 800) - 52) / duration)));
  if (fit !== pps) {
    pps = fit;
    $('zoom').value = String(fit);
    drawTimeline();
  }
  writeScript();
  seek(0);
  loadSong();

  return {
    get board() { return board; },
    /** A board that changed elsewhere. What is being typed is kept; the script catches up when the box is left. */
    update(next) {
      if (gone || next.version === board.version) return;
      setBoard(next);
      if (document.activeElement !== ta && !saving) writeScript();
    },
    destroy() {
      gone = true;
      setPlaying(false);
      window.clearTimeout(typing);
      document.removeEventListener('keydown', keys);
      window.removeEventListener('resize', drawOverview);
      audio?.pause?.();
      root.remove();
    },
  };
}
