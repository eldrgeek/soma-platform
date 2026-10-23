/* soma-video board-script.js: a storyboard written as a script, and a script read back as storyboard changes (v4 editor).
 *
 *   import { boardToScript, scriptToOps, readScript } from './board-script.js';
 *
 * The v4 editor shows a board as Fountain that a person can type in, the way Descript shows a video as its
 * transcript: change the words and the video follows. The script is a view of the board, not a second copy:
 * scriptToOps turns what was typed into the same ops the scene cards send (storyboard.js applyOps), so the page,
 * the server and the seed still accept and refuse the same changes.
 *
 *   Title: Witness and Stay (Eric)
 *
 *   .INTRO 0:00-0:18.1
 *   SHOT e01 motion: in
 *   ~Izzy, I had that dream again.
 *   [[redo: warmer light]]
 *
 *   DISSOLVE TO:
 *
 *   .INTRO 0:18.1-0:24
 *   SHOT e02
 *   ~So this is how it ends?
 *
 * - A heading is a scene: its section, then its stretch of the song.
 * - `SHOT <id>` names the scene card; `motion:` is how its picture moves (MOTIONS). A heading with no SHOT
 *   line, or a SHOT id the board does not have, is a new scene, added after the one before it.
 * - `~` lines are the lyric (several are joined with " / ").
 * - A transition line before a heading is how that scene comes in (TRANSITIONS, as soma-cut reads them).
 * - `[[redo: …]]` is a redo note and marks the scene redo; any other `[[…]]` is a note. Deleting a redo note
 *   puts the scene back to keep.
 * - Any other line under a heading (a CARD, a narrator) is kept on the scene as written (`extra`).
 * - A scene whose heading is deleted is removed from the board, and from its cuts.
 *
 * Written 2026-10-23 by Claude Opus 5.5 (CCc) for Mike Wolf, who asked for VideoMaker v4 "modeled after
 * Descript or some other editing platform": "The script is editable text."
 */

import { applyOps, MOTIONS, parseClock } from './storyboard.js';

const TRANSITION_LINE = { cut: 'CUT TO:', dissolve: 'DISSOLVE TO:', fade: 'FADE TO BLACK.', wipe: 'WIPE TO:', push: 'PUSH TO:' };
const LYRIC_JOIN = ' / ';
/** The heading of a scene with no section. */
const UNTITLED = 'SCENE';
const TIME = String.raw`\d+:\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?`;
const HEADING = new RegExp(String.raw`^\.(\S.*?)\s+(${TIME})\s*(?:-|–|to)\s*(${TIME})$`);
/** A time as the script writes it: 0:18, 0:18.1 or 0:18.12 (a board keeps hundredths), so it reads back exactly. */
export function timeText(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return '?';
  const m = Math.floor(t / 60);
  const sec = Math.round((t - m * 60) * 100) / 100;
  const [whole, frac] = String(sec).split('.');
  return `${m}:${whole.padStart(2, '0')}${frac ? `.${frac}` : ''}`;
}

/** The board as the editor's script. */
export function boardToScript(board) {
  const out = [`Title: ${board.title}`, ''];
  board.scenes.forEach((scene, i) => {
    if (i > 0 && scene.transition) out.push(TRANSITION_LINE[scene.transition], '');
    const times = scene.start != null && scene.end != null ? ` ${timeText(scene.start)}-${timeText(scene.end)}` : '';
    out.push(`.${scene.section || UNTITLED}${times}`);
    out.push(`SHOT ${scene.id}${scene.motion ? ` motion: ${scene.motion}` : ''}`);
    if (scene.lyric) for (const line of scene.lyric.split(LYRIC_JOIN)) out.push(`~${line}`);
    if (scene.extra) out.push(...scene.extra.split('\n'));
    if (scene.status === 'redo') out.push(`[[redo: ${scene.note}]]`.replace(': ]]', ':]]'));
    else if (scene.note) out.push(`[[${scene.note}]]`);
    out.push('');
  });
  return out.join('\n');
}

/**
 * The script as scenes, without the board: { title, scenes: [{ line, id, section, start, end, motion,
 * transition, lyric, note, redo, extra }], problems: [{ line, message }] (nothing is saved while there are any),
 * warnings: [{ line, message }] (gaps and overlaps, saved anyway), lineScene: [scene index per line] }.
 * Line numbers count from 1. A transition line belongs to the scene it leads into.
 */
export function readScript(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const scenes = [];
  const problems = [];
  // Gaps and overlaps are saved (retiming two scenes passes through one) but named, so they are not forgotten.
  const warnings = [];
  const lineScene = [];
  let title = null;
  let pending = '';
  let cur = null;
  const problem = (n, message) => problems.push({ line: n + 1, message });
  lines.forEach((raw, n) => {
    const line = raw.trim();
    if (!cur && /^Title:/i.test(line)) {
      title = line.replace(/^Title:\s*/i, '');
      lineScene.push(-1);
      return;
    }
    if (/^\.[^.\s]/.test(line)) {
      const m = line.match(HEADING);
      const start = m ? parseClock(m[2]) : NaN;
      const end = m ? parseClock(m[3]) : NaN;
      // A heading may leave out its times (a board not yet timed), but times half-written are a problem.
      if (!m && /\d:\d|\d\s*(?:-|–)\s*$/.test(line)) {
        problem(n, 'Write the stretch of the song as start-end, such as .VERSE 1 0:14-0:48');
      } else if (m && end <= start) {
        problem(n, `${m[1]} ends before it starts`);
      }
      cur = { line: n + 1, id: null, section: m ? m[1].trim() : line.slice(1).trim(), start: Number.isFinite(start) ? start : null, end: Number.isFinite(end) ? end : null, motion: '', transition: scenes.length ? pending : '', lyric: [], note: '', redo: false, extra: [] };
      scenes.push(cur);
      pending = '';
      lineScene.push(scenes.length - 1);
      return;
    }
    const tr = line.match(/^(CUT|DISSOLVE|WIPE|PUSH) TO:$|^FADE (?:TO BLACK|OUT|IN)\.?$/);
    if (tr) {
      pending = tr[1] ? tr[1].toLowerCase() : 'fade';
      lineScene.push(scenes.length);
      return;
    }
    // blank lines after a transition lead into the next scene with it
    lineScene.push(pending && !line ? scenes.length : cur ? scenes.length - 1 : -1);
    if (!line) return;
    if (!cur) {
      // The title page and SETTINGS are read by the renderer, not the board; any other line would be lost.
      if (!/^\w[\w -]*:/.test(line) && !['SETTINGS', 'CAST'].includes(line)) problem(n, 'Lines before the first heading are not part of any scene');
      return;
    }
    const shot = line.match(/^SHOT\s+(\S+)(.*)$/);
    if (shot) {
      cur.id = shot[1];
      const motion = shot[2].match(/motion:\s*(\S+)/);
      if (motion) {
        if (MOTIONS.includes(motion[1])) cur.motion = motion[1];
        else problem(n, `A motion is one of ${MOTIONS.join(', ')}`);
      }
      return;
    }
    if (line.startsWith('~')) {
      cur.lyric.push(line.slice(1).trim());
      return;
    }
    const note = line.match(/^\[\[\s*(.*?)\s*\]\]$/);
    if (note) {
      const redo = note[1].match(/^redo:\s*(.*)$/i);
      cur.redo = Boolean(redo);
      cur.note = redo ? redo[1] : note[1];
      return;
    }
    cur.extra.push(raw.trimEnd());
  });
  for (const scene of scenes) {
    scene.lyric = scene.lyric.join(LYRIC_JOIN);
    scene.extra = scene.extra.join('\n');
  }
  for (let i = 1; i < scenes.length; i += 1) {
    const [a, b] = [scenes[i - 1], scenes[i]];
    if (a.end == null || b.start == null) continue;
    if (b.start < a.end - 0.005) warnings.push({ line: b.line, message: `This scene starts at ${timeText(b.start)}, before the one above ends (${timeText(a.end)})` });
    else if (b.start > a.end + 0.005) warnings.push({ line: b.line, message: `Nothing is on screen from ${timeText(a.end)} to ${timeText(b.start)}` });
  }
  return { title, scenes, problems, warnings, lineScene };
}

/**
 * The ops that make the board match the script: { ops, problems, board } where board is the board after them
 * (applied here as `role` would, so a refusal shows up before anything is sent). Problems that would lose
 * work stop it: when the script has a problem it returns no ops, so a half-typed heading never deletes a scene.
 */
export function scriptToOps(board, text, { role = 'owner', by = {}, at } = {}) {
  const read = readScript(text);
  if (read.problems.length) return { ops: [], problems: read.problems, warnings: read.warnings, board };
  const ops = [];
  let next = board;
  const run = (op) => {
    next = applyOps(next, [op], { role, by, at });
    ops.push(op);
    return next;
  };
  // A SHOT id the board has, used once: that card. Anything else (no SHOT, an unknown id, a pasted copy) is a new scene.
  const seen = new Set();
  const known = new Set(board.scenes.map((s) => s.id));
  for (const scene of read.scenes) {
    scene.keep = scene.id && known.has(scene.id) && !seen.has(scene.id);
    if (scene.keep) seen.add(scene.id);
  }
  if (read.title && read.title.trim() && read.title.trim() !== board.title) run({ op: 'title', value: read.title.trim() });
  for (const scene of board.scenes) if (!seen.has(scene.id)) run({ op: 'remove', scene: scene.id });
  let before = null;
  read.scenes.forEach((scene, index) => {
    const want = {
      section: scene.section, lyric: scene.lyric, start: scene.start, end: scene.end, motion: scene.motion,
      transition: index === 0 ? '' : scene.transition, extra: scene.extra, note: scene.note,
    };
    let id = scene.keep ? scene.id : null;
    if (!id) {
      const fields = Object.fromEntries(Object.entries(want).filter(([k, v]) => v !== '' && v !== null && !(k === 'section' && v === UNTITLED)));
      run({ op: 'add-after', after: before, scene: fields });
      id = next.added[0];
    } else {
      const at = next.scenes.findIndex((s) => s.id === id);
      if (at !== index) run({ op: 'move', scene: id, to: index });
      const card = next.scenes[index];
      for (const [field, value] of Object.entries(want)) {
        if (field === 'section' && value === UNTITLED && !card.section) continue;
        if (card[field] !== value) run({ op: 'set', scene: id, field, value });
      }
      const status = scene.redo ? 'redo' : card.status === 'redo' ? 'keep' : card.status;
      if (status !== next.scenes[index].status) run({ op: 'set', scene: id, field: 'status', value: status });
    }
    before = id;
  });
  return { ops, problems: [], warnings: read.warnings, board: next };
}

/** Ops in the batches the board routes take (applyOps takes 1 to 50 at a time). */
export function opBatches(ops, size = 50) {
  const out = [];
  for (let i = 0; i < ops.length; i += size) out.push(ops.slice(i, i + size));
  return out;
}
