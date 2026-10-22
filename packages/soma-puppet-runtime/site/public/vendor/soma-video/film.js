/* soma-video film.js: a video script in the SOMA script format, read the way the soma-cut engine reads it.
 *
 *   import { parseFilm, spokenLines, filmVoices, estimate, checks, toSomaCut } from './film.js';
 *
 * The SOMA script format (~/Projects/soma-cut/SCRIPT-FORMAT.md, skill soma-script-format) is Fountain:
 * a title page, a SETTINGS block, scenes headed `.HEADING`, narrators as character cues, and the
 * non-vocal performers CARD, CLIP, GIF, RECUT, CREDITS, CHROME plus the spanning tracks MUSIC and SFX.
 * VideoMaker adds one block, CAST, so a script that lives in one row of an app carries its own voices:
 *
 *   CAST
 *   CLAUDE: Chris
 *   SUNO: Charlie
 *
 * soma-cut reads voices from a `<film>.cast.json` sidecar instead, so toSomaCut() removes the CAST block
 * and returns the sidecar beside the script. Everything else in the text is passed to soma-cut as written.
 * Shared by the page and the server, so the line the page highlights is the line the server speaks.
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-go2.
 */

/** The performers that are not narrators (SCRIPT-FORMAT.md §3 and §4). */
export const VISUALS = ['CARD', 'CLIP', 'GIF', 'RECUT', 'CREDITS', 'CHROME', 'MUSIC', 'SFX'];
const TRACKS = new Set(['MUSIC', 'SFX']);
const BLOCK_WORDS = new Set(['SETTINGS', 'CAST']);

/**
 * ElevenLabs premade voices: PlayMaker's Stage Read roster (soma-play) plus the voices the Song Studio
 * making-of tracks use (garage-door-song/narration.json), and soma-cut's default narrator (George).
 */
export const VOICES = [
  { name: 'Chris', id: 'iP95p4xoKVk53GoZ742B' },
  { name: 'Charlie', id: 'IKne3meq5aSn9XLyUdCD' },
  { name: 'Callum', id: 'N2lVS1w4EtoT3dr4eOWO' },
  { name: 'Matilda', id: 'XrExE9yKIg1WjnnlVkGX' },
  { name: 'Eric', id: 'cjVigY5qzO86Huf0OWal' },
  { name: 'Liam', id: 'TX3LPaxmHKxFdv7VOQHJ' },
  { name: 'Laura', id: 'FGY2WhTYpPnrIDTdsKH5' },
  { name: 'Lily', id: 'pFZP5JQG7iQjIQuC4Bku' },
  { name: 'Jessica', id: 'cgSgspJ2msm6clMCkdW9' },
  { name: 'George', id: 'JBFqnCBsd6RMkjVDRZzb' },
  { name: 'Rachel', id: '21m00Tcm4TlvDq8ikWAM' },
  { name: 'Adam', id: 'pNInz6obpgDQGcFmaJgB' },
  { name: 'Elli', id: 'MF3mGyEYCl7XYWbV9V6O' },
];

const isBlank = (line) => !line.trim();
const isTransition = (line) => /^[A-Z][A-Z .-]*TO:$/.test(line) || /^FADE (OUT|IN|TO BLACK)\.?$/.test(line);
const firstWord = (line) => (line.match(/^([A-Z]+)(?:\s|$)/) || [])[1];
const isVisual = (line) => VISUALS.includes(firstWord(line));
const isCue = (line) =>
  /^[A-Z0-9][A-Z0-9 .'&-]*(\s*\([^)]*\))?$/.test(line) && /[A-Z]/.test(line) && line.split(/\s+/).length <= 6 && !isTransition(line);
const isParen = (line) => /^\(.*\)$/.test(line);
const stripComment = (line) => line.replace(/\s+#\s.*$/, '');

/**
 * The script as blocks, in order. Each block has a type: 'title' (the title page), 'settings', 'cast',
 * 'scene' (a heading), 'transition', 'speech' (a narrator's turn: character and lines of kind 'words' or
 * 'parenthetical'), 'visual' (kind, args and body lines), 'direction' or 'note'. Every block after the
 * first heading carries the number of its scene, from 1.
 */
export function parseFilm(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let scene = 0;
  let i = 0;
  const push = (block) => blocks.push(scene ? { ...block, scene } : block);
  const paragraph = () => {
    const out = [];
    while (i < lines.length && !isBlank(lines[i])) out.push(lines[i++].trimEnd());
    return out;
  };

  // The title page: Key: value lines at the very top (Title:, Credit:, Draft date:), up to a blank line.
  while (i < lines.length && isBlank(lines[i])) i += 1;
  if (/^[A-Z][a-z][\w ]*:/.test(lines[i] ?? '')) {
    const fields = {};
    for (const line of paragraph()) {
      const m = line.match(/^([^:]+):\s*(.*)$/);
      if (m) fields[m[1].trim()] = m[2].trim();
    }
    push({ type: 'title', fields });
  }

  while (i < lines.length) {
    if (isBlank(lines[i])) {
      i += 1;
      continue;
    }
    const line = lines[i].trim();
    if (BLOCK_WORDS.has(line)) {
      i += 1;
      const entries = {};
      for (const raw of paragraph()) {
        const m = stripComment(raw).match(/^\s*([^:]+?)\s*:\s*(.*?)\s*$/);
        if (m) entries[line === 'CAST' ? m[1].toUpperCase() : m[1]] = m[2];
      }
      push({ type: line === 'CAST' ? 'cast' : 'settings', entries });
      continue;
    }
    if (/^\.[^.\s]/.test(line) || /^(INT|EXT|EST|INT\.\/EXT|I\/E)[. ]/.test(line)) {
      scene += 1;
      push({ type: 'scene', text: line.replace(/^\./, '').trim() });
      i += 1;
      continue;
    }
    if (isTransition(line)) {
      push({ type: 'transition', text: line });
      i += 1;
      continue;
    }
    if (/^\[\[.*\]\]$/.test(line)) {
      push({ type: 'note', text: line.slice(2, -2).trim() });
      i += 1;
      continue;
    }
    if (isVisual(line)) {
      const kind = firstWord(line);
      const args = line.slice(kind.length).trim();
      i += 1;
      // A track cue is one line; the other performers own the lines under them, up to a blank line.
      const body = TRACKS.has(kind) ? [] : paragraph().map((x) => x.trim());
      push({ type: 'visual', kind, args, body, track: TRACKS.has(kind) });
      continue;
    }
    if (isCue(line) && i + 1 < lines.length && !isBlank(lines[i + 1])) {
      const cue = line.replace(/\s*\([^)]*\)\s*$/, '').trim();
      i += 1;
      const speech = paragraph().map((x) => x.trim()).map((x) => ({ kind: isParen(x) ? 'parenthetical' : 'words', text: x }));
      push({ type: 'speech', character: cue, lines: speech });
      continue;
    }
    push({ type: 'direction', text: paragraph().map((x) => x.trim()).join(' ') });
  }
  return blocks;
}

/** The title page fields, SETTINGS and CAST of a parsed script. */
export function filmInfo(blocks) {
  const title = blocks.find((b) => b.type === 'title')?.fields ?? {};
  const settings = Object.assign({}, ...blocks.filter((b) => b.type === 'settings').map((b) => b.entries));
  const cast = Object.assign({}, ...blocks.filter((b) => b.type === 'cast').map((b) => b.entries));
  return { title, settings, cast };
}

/** The lines a reading speaks, in order: each narrator turn that has words. Parentheticals are not read. */
export function spokenLines(blocks) {
  const lines = [];
  blocks.forEach((block, blockIndex) => {
    if (block.type !== 'speech') return;
    const words = block.lines.filter((line) => line.kind === 'words').map((line) => line.text).join(' ').trim();
    if (words) lines.push({ index: lines.length, blockIndex, character: block.character, text: words });
  });
  return lines;
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0), 16777619) >>> 0;
  return value;
}

export const voiceByName = (name) => VOICES.find((voice) => voice.name.toLowerCase() === String(name ?? '').trim().toLowerCase());

/**
 * A voice for each narrator. A narrator named in CAST with a voice from the roster gets that voice.
 * Every other narrator starts from the voice its name hashes to and moves to the next voice nobody in
 * this script has, so narrators sound different until the roster runs out.
 */
export function filmVoices(blocks) {
  const { cast } = filmInfo(blocks);
  const names = [...new Set(blocks.filter((b) => b.type === 'speech').map((b) => b.character.toUpperCase()))];
  const voices = {};
  const taken = new Set();
  for (const name of names) {
    const chosen = voiceByName(cast[name]);
    if (chosen) {
      voices[name] = chosen;
      taken.add(chosen.name);
    }
  }
  for (const name of names.filter((n) => !voices[n]).sort()) {
    let slot = hash(name) % VOICES.length;
    for (let tries = 0; tries < VOICES.length && taken.has(VOICES[slot].name); tries += 1) slot = (slot + 1) % VOICES.length;
    voices[name] = VOICES[slot];
    taken.add(VOICES[slot].name);
  }
  return voices;
}

const WORDS_PER_SECOND = 2.6;
const seconds = (value) => {
  const m = String(value ?? '').match(/^(?:(\d+):)?(\d+(?:\.\d+)?)s?$/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : 0;
};

/** How long a visual holds by itself: a CLIP's in to out, or a `hold:` the block names. */
export function visualSeconds(block) {
  const text = [block.args, ...block.body].join(' ');
  const inOut = text.match(/\bin\s+([\d:.]+)\s+out\s+([\d:.]+)/);
  if (inOut) return Math.max(0, seconds(inOut[2]) - seconds(inOut[1]));
  const hold = text.match(/\bhold:?\s*([\d:.]+)s?/);
  if (hold) return seconds(hold[1]);
  return 0;
}

/**
 * About how long each scene runs, in seconds: the longer of its narration (at 2.6 words a second, about
 * 156 words a minute) and its footage laid end to end. The film is the sum. soma-cut's real clock is the
 * spoken audio, so this is a writer's estimate, not the render's length.
 */
export function estimate(blocks) {
  const scenes = [];
  for (const block of blocks) {
    if (block.type === 'scene') scenes.push({ title: block.text, speech: 0, footage: 0 });
    const current = scenes.at(-1);
    if (!current) continue;
    if (block.type === 'speech') {
      current.speech += block.lines.filter((l) => l.kind === 'words').map((l) => l.text).join(' ').split(/\s+/).filter(Boolean).length / WORDS_PER_SECOND;
    }
    if (block.type === 'visual' && !block.track) current.footage += visualSeconds(block);
  }
  const out = scenes.map((s) => ({ title: s.title, seconds: Math.round(Math.max(s.speech, s.footage)) }));
  return { scenes: out, total: out.reduce((sum, s) => sum + s.seconds, 0) };
}

export const clock = (total) => `${Math.floor(total / 60)}:${String(Math.round(total) % 60).padStart(2, '0')}`;

/**
 * What a writer should fix before rendering, as plain sentences: narrators with no voice in CAST, CAST
 * voices that are not on the roster, CAST names that never speak, scenes with nothing to look at, and
 * CLIP blocks with no source.
 */
export function checks(blocks) {
  const out = [];
  const { cast } = filmInfo(blocks);
  const speakers = new Set(blocks.filter((b) => b.type === 'speech').map((b) => b.character.toUpperCase()));
  for (const name of speakers) if (!cast[name]) out.push(`${name} has no voice in CAST, so a voice is chosen for them.`);
  for (const [name, voice] of Object.entries(cast)) {
    if (!voiceByName(voice)) out.push(`CAST gives ${name} the voice "${voice}", which is not on the roster (${VOICES.map((v) => v.name).join(', ')}).`);
    if (!speakers.has(name)) out.push(`${name} is in CAST but never speaks.`);
  }
  let current = null;
  const report = () => {
    if (current && !current.picture) out.push(`Scene ${current.n} (${current.title}) has nothing to look at: add a CARD or a CLIP.`);
  };
  for (const block of blocks) {
    if (block.type === 'scene') {
      report();
      current = { n: block.scene, title: block.text, picture: false };
    }
    if (block.type === 'visual' && !block.track && current) current.picture = true;
    if (block.type === 'visual' && block.kind === 'CLIP' && !/^\S+:\S/.test(block.args)) out.push(`A CLIP in scene ${block.scene ?? '?'} has no source, such as file:~/movie.mp4.`);
  }
  report();
  if (!blocks.some((b) => b.type === 'scene')) out.push('The script has no scenes yet: start one with a line such as .THE SONG');
  return out;
}

/**
 * The script as soma-cut renders it: the same text without the CAST block, and the cast sidecar
 * (`<film>.cast.json`, an array of { name, voiceId, note }) for every narrator.
 */
export function toSomaCut(text) {
  const blocks = parseFilm(text);
  const voices = filmVoices(blocks);
  const kept = [];
  let skipping = false;
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    if (line.trim() === 'CAST') skipping = true;
    else if (skipping && !line.trim()) skipping = false;
    if (!skipping) kept.push(line);
  }
  const fountain = kept.join('\n').replace(/\n{3,}/g, '\n\n');
  const cast = Object.entries(voices).map(([name, voice]) => ({ name, voiceId: voice.id, note: `${voice.name} (VideoMaker CAST)` }));
  return { fountain, cast };
}
