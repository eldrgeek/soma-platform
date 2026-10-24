/* soma-play script.js: one scene's plain script text, read the way PlayMaker reads it.
 *
 * Shared by the page (play-view.js, stage-read.js) and the server (server/stage-read.js),
 * so the line the page highlights is the line the server speaks. No dependencies, no DOM.
 *
 * The text is PlayMaker's plain script form (docs/PLAYMAKER-FORMAT.md in the playmaker repo):
 *   OLDER ERIC                a line in capitals by itself is a character cue; the lines under
 *   The lamps are low.        it, up to a blank line, are that character's speech
 *   IZZY: Then read it.       a cue and its speech on one line
 *   (She sits.)               in parentheses: inside a speech a parenthetical, elsewhere a direction
 *   ## Act 1 Scene 2          a heading, as is a line such as ACT ONE, SCENE TWO
 * Any other line outside a speech is a stage direction.
 *
 * The technical-cue rule is ported from PlayMaker's src/lib/dianaLayout.ts (Diana Draft 3,
 * Eric Kohner's Google Doc, Mike's ruling 2026-09-15): lights, music, sound, fades, blackouts
 * and "End of" lines stay at the margin in plain type; narrative directions are italic, 2in in.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-u4x (GCT round 3 prep).
 */

const TECHNICAL_PREFIX = /^(?:lights?|music|sound|black\s*out|blackout|fade|end of|time\s*:|place\s*:)/i;
const TECHNICAL_CUE = /^(?:(?:lights?|lighting)\s+(?:up|down|out|fade(?:s)?|shift(?:s)?|dim(?:s)?|rise(?:s)?|fall(?:s)?|change(?:s)?)|music(?:\s+(?:up|down|under|fade(?:s)?|start(?:s)?|stop(?:s)?|tbd|cue)|\s*:)|sound(?:\s+(?:of|cue|up|down|fade(?:s)?|start(?:s)?|stop(?:s)?)|\s*:)|fade\s+(?:in|out|to|up|down)|end\s+of\s+(?:act|scene|play|show)\b)/i;
const PARENTHESIZED_END_CUE = /^\(\s*(?:black\s*out|blackout)\b[^)]*\bend\s+of\s+(?:act|scene|play|show)\b[^)]*\)\.?$/i;

function unwrap(text) {
  const trimmed = text.trim();
  const candidate = trimmed.endsWith(').') ? trimmed.slice(0, -1) : trimmed;
  if (!candidate.startsWith('(') || !candidate.endsWith(')')) return trimmed;
  let depth = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] === '(') depth += 1;
    if (candidate[index] === ')') depth -= 1;
    if (depth < 0 || (depth === 0 && index < candidate.length - 1)) return trimmed;
  }
  return depth === 0 ? candidate.slice(1, -1).trim() : trimmed;
}

/** A technical cue (lights, sound, music, fade, blackout, "End of"): Diana keeps it at the margin. */
export function isTechnicalCue(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return false;
  if (/^(?:time|place)\s*:/i.test(trimmed)) return true;
  if (PARENTHESIZED_END_CUE.test(trimmed)) return true;
  const cue = unwrap(trimmed);
  if (/^(?:black\s*out|blackout)\.?$/i.test(cue)) return true;
  if (cue.split(/\s+/).filter(Boolean).length > 6) return false;
  return TECHNICAL_CUE.test(cue) || (TECHNICAL_PREFIX.test(cue) && cue.split(/\s+/).length <= 3);
}

const HEADING = /^(?:#{1,3}\s+.+|(?:ACT|SCENE)\b[A-Z0-9 ,.'’-]*)$/;
// A cue is a name in capitals: letters, spaces, apostrophes, hyphens, dots, and an optional
// role in parentheses, as in YOUNGER ERIC (as SILVIO). At most six words.
const CUE = /^([A-Z][A-Z0-9 .'’-]*[A-Z0-9.'’])(\s*\([^)]*\))?$/;
const CUE_WITH_SPEECH = /^([A-Z][A-Z0-9 .'’-]*[A-Z0-9.'’])(\s*\([^)]*\))?\s*:\s*(.+)$/;
const isParenthesized = (line) => /^\(.*\)\.?$/.test(line);

function cueName(text) {
  return text.trim().replace(/\s+/g, ' ');
}

function looksLikeCue(line) {
  const match = line.match(CUE);
  if (!match || HEADING.test(line)) return null;
  if (match[1].split(/\s+/).length > 6 || isTechnicalCue(line)) return null;
  return match;
}

/**
 * Parse a scene into blocks, in order:
 *   { type: 'heading', text }
 *   { type: 'speech', character, role?, lines: [{ kind: 'words' | 'parenthetical', text }] }
 *   { type: 'direction', text, technical }
 */
export function parseScript(source) {
  const blocks = [];
  let speech = null;
  const end = () => { speech = null; };
  for (const raw of String(source ?? '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { end(); continue; }
    if (HEADING.test(line)) {
      end();
      blocks.push({ type: 'heading', text: line.replace(/^#{1,3}\s+/, '') });
      continue;
    }
    const inline = line.match(CUE_WITH_SPEECH);
    if (inline && inline[1].split(/\s+/).length <= 6 && !isTechnicalCue(inline[1])) {
      speech = { type: 'speech', character: cueName(inline[1]), ...(inline[2] ? { role: inline[2].trim() } : {}), lines: [] };
      blocks.push(speech);
      speech.lines.push({ kind: 'words', text: inline[3].trim() });
      continue;
    }
    const cue = looksLikeCue(line);
    if (cue) {
      speech = { type: 'speech', character: cueName(cue[1]), ...(cue[2] ? { role: cue[2].trim() } : {}), lines: [] };
      blocks.push(speech);
      continue;
    }
    // A technical cue in capitals or in parentheses ends a speech: BLACKOUT. is not dialogue.
    if (speech && isTechnicalCue(line) && (isParenthesized(line) || line === line.toUpperCase())) end();
    if (speech) {
      speech.lines.push({ kind: isParenthesized(line) ? 'parenthetical' : 'words', text: line });
      continue;
    }
    blocks.push({ type: 'direction', text: line, technical: isTechnicalCue(line) });
  }
  return blocks;
}

/** The lines Stage Read speaks, in order: each run of words in a speech. Directions are not read. */
export function spokenLines(blocks) {
  const lines = [];
  blocks.forEach((block, blockIndex) => {
    if (block.type !== 'speech') return;
    const words = block.lines.filter((line) => line.kind === 'words').map((line) => line.text).join(' ').trim();
    if (words) lines.push({ index: lines.length, blockIndex, character: block.character, text: words });
  });
  return lines;
}

/** ElevenLabs premade voices, the roster PlayMaker's Stage Read uses (src/lib/voices.ts). */
export const VOICES = [
  { name: 'Charlie', id: 'IKne3meq5aSn9XLyUdCD' },
  { name: 'Rachel', id: '21m00Tcm4TlvDq8ikWAM' },
  { name: 'Adam', id: 'pNInz6obpgDQGcFmaJgB' },
  { name: 'Matilda', id: 'XrExE9yKIg1WjnnlVkGX' },
  { name: 'Elli', id: 'MF3mGyEYCl7XYWbV9V6O' },
];

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0), 16777619) >>> 0;
  return value;
}

/**
 * A voice for each character in the scene. Each name starts from the voice its name hashes to,
 * so a character keeps its voice from one reading to the next; characters are then placed in
 * name order, and one whose voice is already taken in this scene moves to the next free voice,
 * so up to five characters in a scene sound different.
 */
export function castVoices(blocks) {
  const names = [...new Set(blocks.filter((block) => block.type === 'speech').map((block) => block.character.toUpperCase()))].sort();
  const taken = new Set();
  const cast = {};
  for (const name of names) {
    let slot = hash(name) % VOICES.length;
    for (let tries = 0; tries < VOICES.length && taken.has(slot); tries += 1) slot = (slot + 1) % VOICES.length;
    taken.add(slot);
    cast[name] = VOICES[slot];
  }
  return cast;
}
