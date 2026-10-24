/* soma-video notes.js: an artist's notes, as written in an email, a text or the board's notes box, turned into
 * redo notes on a storyboard's cards (Puppet v0.7).
 *
 *   import { parseNotes, notesOps, redoQueue } from './notes.js';
 *   const found = parseNotes(board, text);      // { notes: [{ scene, note, line }], general: [lines] }
 *   const ops = notesOps(board, found);         // ops for applyOps: the note on each card, and its status redo
 *   redoQueue(board, jobs);                     // the scenes marked redo or new with no request open
 *
 * A note names its scene the way a person would: by id ("e05: older", "E5 - older"), by number ("scene 5",
 * "#5", "card 5", "picture 5"), or by quoting its lyric ("the 'how it ends' one is too dark"). A line that
 * names nothing goes on with the note above it when it follows straight on; otherwise it is a general note,
 * shown to the host and put on no card. Quoted replies ("> ...", "On ... wrote:") and signatures are dropped.
 *
 * Shared by the page (the notes box), the server (the notes routes) and bin/vm-board-notes.mjs (notes that
 * arrive by email or text on the Mac), so all three read a note the same way.
 *
 * Written 2026-10-23 by Claude Opus 5.5 (CCc) for Mike Wolf, who asked for "notes from eric and reroll fast".
 */

import { LIMITS } from './storyboard.js';

/** Lower case, letters and digits only, so a quoted lyric matches whatever its punctuation. */
const words = (text) => String(text ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ENDS = [/^on .{3,200} wrote:\s*$/i, /^-- ?$/, /^_{5,}\s*$/, /^-{5,} ?original message ?-{5,}/i, /^sent from my /i, /^get outlook for /i];
const NUMBERED = /(?:\b(?:scene|card|picture|pic|image|shot|frame|number|no\.?)\s*#?|#)\s*(\d{1,3}[a-z]?)\b/gi;
// "In 22 I look like my brother": a number after in/on/for, at the start of a line only.
const LEADING_NUMBER = /^\s*(?:in|on|for)\s+#?(\d{1,3}[a-z]?)\b(?![:.]\d)/i;
// A note that only says to keep the picture ("Opa is perfect!! keep") marks the card keep, not redo.
const KEEP = /\b(?:keep(?: it| this| as is)?|keeper|perfect|leave (?:it|as is)|no changes?|love (?:it|this|that)|nailed it|good as is)\b/i;
const CHANGE = /\b(?:change|redo|try|lose|make|more|less|too|instead|not|no longer|but|fix|wrong|again|add|remove|older|younger|darker|lighter|brighter|warmer|colder|swap|replace|without|n't)\b|n't\b/i;
export const isKeep = (note) => KEEP.test(note) && !CHANGE.test(note);
const QUOTED = /["“”]([^"“”]{4,200})["“”]|(?:^|\s)['‘]([^'‘’]{4,200})['’](?=\s|[.,;:!?)]|$)/g;
const LEAD = /^\s*(?:[-*•]\s*)?(?:(?:scene|card|picture|pic|image|shot|frame|number|no\.?)\s*#?|#)\s*(\d{1,3}[a-z]?)\b\s*(?:[:.)\]–—-](?!\d)\s*|\s+)|^\s*(?:[-*•]\s*)?([a-z]?\d{1,3}[a-z]?)\s*(?:[:.)\]–—-]|\s+-\s+)(?!\d)\s*/i;

/** The scene a person means by a token such as e05, E5, 5 or 5a: an id first, then a number in ids, then a card's place. */
function sceneFor(board, token) {
  const raw = String(token).toLowerCase();
  const exact = board.scenes.find((s) => s.id.toLowerCase() === raw);
  if (exact) return exact.id;
  const m = raw.match(/^([a-z]?)(\d{1,3})([a-z]?)$/);
  if (!m) return null;
  const [, prefix, digits, suffix] = m;
  const number = Number(digits);
  const byNumber = board.scenes.filter((s) => {
    const p = s.id.toLowerCase().match(/^([a-z]*)(\d+)([a-z]?)$/);
    return p && Number(p[2]) === number && p[3] === suffix && (!prefix || p[1] === prefix);
  });
  if (byNumber.length === 1) return byNumber[0].id;
  if (!prefix && !suffix && number >= 1 && number <= board.scenes.length) return board.scenes[number - 1].id;
  return null;
}

/** The scenes whose lyric a quote is from (at least four words' worth of letters, either way round). */
function scenesQuoted(board, quote) {
  const want = words(quote);
  if (want.length < 4) return [];
  return board.scenes.filter((s) => {
    const lyric = words(s.lyric);
    return lyric && (lyric.includes(want) || (lyric.length >= 8 && want.includes(lyric)));
  }).map((s) => s.id);
}

/** What one line refers to, and the note with its leading reference ("e05:") taken off. */
function readLine(board, line) {
  const found = [];
  let note = line.trim();
  const lead = note.match(LEAD);
  if (lead) {
    const id = sceneFor(board, lead[1] ?? lead[2]);
    if (id) {
      found.push(id);
      note = note.slice(lead[0].length).trim();
    }
  }
  const leading = note.match(LEADING_NUMBER);
  if (leading) {
    const id = sceneFor(board, leading[1]);
    if (id) found.push(id);
  }
  for (const m of note.matchAll(NUMBERED)) {
    const id = sceneFor(board, m[1]);
    if (id) found.push(id);
  }
  // Bare ids anywhere in the line (e03 and e22: too dark), only when they are ids on the board.
  for (const m of note.matchAll(/\b([a-z]\d{1,3}[a-z]?)\b/gi)) {
    const id = board.scenes.find((s) => s.id.toLowerCase() === m[1].toLowerCase())?.id;
    if (id) found.push(id);
  }
  for (const m of note.matchAll(QUOTED)) found.push(...scenesQuoted(board, m[1] ?? m[2]));
  // "e03 and e22: too dark": the note is what follows the list of scenes.
  const list = note.match(/^(?:(?:[a-z]\d{1,3}[a-z]?|scene|card|#?\d{1,3}|and|&|,)\s*)+[:–—-]\s*/i);
  if (list && found.length > 1) note = note.slice(list[0].length).trim();
  return { scenes: [...new Set(found)], note };
}

/**
 * An artist's notes, read against a board: { notes: [{ scene, note, line, keep }], general: [lines] }. A scene
 * named in several lines gets one note, its lines in order; keep is true when the note only says to keep the
 * picture. Nothing is changed; notesOps makes the changes.
 */
export function parseNotes(board, text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const byScene = new Map();
  const general = [];
  let last = null; // the scenes the line above was about, while the note goes straight on
  for (const raw of lines) {
    const line = raw.trim();
    if (ENDS.some((end) => end.test(line))) break;
    if (line.startsWith('>')) continue;
    if (!line) {
      last = null;
      continue;
    }
    const { scenes, note } = readLine(board, line);
    const targets = scenes.length ? scenes : last;
    if (!targets) {
      general.push(line);
      continue;
    }
    for (const scene of targets) {
      const entry = byScene.get(scene) ?? { scene, note: '', lines: [] };
      const add = scenes.length ? note || line : line;
      entry.note = entry.note ? `${entry.note}\n${add}` : add;
      entry.lines.push(line);
      byScene.set(scene, entry);
    }
    last = targets;
  }
  const order = new Map(board.scenes.map((s, i) => [s.id, i]));
  const notes = [...byScene.values()]
    .sort((a, b) => order.get(a.scene) - order.get(b.scene))
    .map(({ scene, note, lines: from }) => ({ scene, note: note.slice(0, LIMITS.text), line: from.join('\n'), keep: isKeep(note) }));
  return { notes, general };
}

/**
 * The ops that put parsed notes on the board: each scene's note (added under the note already on the card,
 * unless replace) and its status, redo for a scene with pictures and new for one without. A keep note marks
 * its card keep and leaves its redo note alone.
 */
export function notesOps(board, { notes }, { replace = false } = {}) {
  const ops = [];
  for (const { scene, note, keep } of notes) {
    const card = board.scenes.find((s) => s.id === scene);
    if (!card || !note.trim()) continue;
    if (keep) {
      ops.push({ op: 'set', scene, field: 'status', value: 'keep' });
      continue;
    }
    const kept = card.note.trim();
    const value = (replace || !kept ? note : kept.includes(note.trim()) ? card.note : `${card.note}\n${note}`).slice(0, LIMITS.text);
    ops.push({ op: 'set', scene, field: 'note', value });
    ops.push({ op: 'set', scene, field: 'status', value: Object.keys(card.pictures).length ? 'redo' : 'new' });
  }
  return ops;
}

const OPEN = ['held', 'queued', 'running'];
/** The scene ids a job is for: one scene, or a batch's list. */
/** The scenes the notes ask to redo (not those they say to keep). */
export const notesToRedo = ({ notes }) => notes.filter((n) => !n.keep).map((n) => n.scene);

export const jobScenes = (job) => (Array.isArray(job?.scenes) ? job.scenes : job?.scene ? [job.scene] : []);

/** The scenes marked redo or new that no open request covers yet, in board order: what one batch would redo. */
export function redoQueue(board, jobs = []) {
  const busy = new Set(jobs.filter((j) => OPEN.includes(j.status)).flatMap(jobScenes));
  return board.scenes.filter((s) => (s.status === 'redo' || s.status === 'new') && !busy.has(s.id)).map((s) => s.id);
}
