/* soma-video storyboard.js: a video's storyboard, the editable plan its pictures and cuts are made from (Puppet v0.7).
 *
 *   import { newBoard, applyOps, cutState, jobBrief } from './storyboard.js';
 *
 * One storyboard per song or video. Each scene card holds its pictures (9:16 and 16:9), the lyric line and
 * its time range in the song, the prompt and reference photos the pictures were made from, and a status:
 * keep, redo or new. A redo note asks the team on Mike's Mac for new pictures; "Add scene after" adds a
 * scene and asks for its pictures. Old pictures stay in the scene's history and can be put back.
 *
 * A cut (the full song, a 60-second cut, each short) is a named list of scenes plus the stretches of the
 * song it uses. A cut whose scenes changed after its last render needs rendering again (cutState).
 *
 * Shared by the page (video-storyboard.js), the server (server/boards.js) and the seed (bin/vm-board-seed.mjs),
 * so all three accept and refuse the same changes. Every change is an op; applyOps never changes its input.
 *
 * Written 2026-10-23 by Claude Opus 5.5 (CCc) for Mike Wolf, who asked: "turn the Eric Album into a
 * storyboard that we can change, and this is the way that we do the videos in the future", and "Eric or
 * another Artist can change".
 */

export const SCENE_STATUSES = ['keep', 'redo', 'new'];
export const ASPECTS = ['9x16', '16x9'];
/** How a scene's picture moves (the music-video renderer's words); '' leaves it to the renderer. */
export const MOTIONS = ['in', 'out', 'panl', 'panr', 'up', 'down'];
/** How a scene comes in from the one before (soma-cut's vocabulary, SCRIPT-FORMAT.md §5); '' is the renderer's default. */
export const TRANSITIONS = ['cut', 'dissolve', 'fade', 'wipe', 'push'];
export const ASPECT_LABEL = { '9x16': '9:16', '16x9': '16:9' };
/** What a storyboard asks the team on the Mac to do. Each is a job (server/studio.js). */
export const BOARD_STEPS = [
  { step: 'redo', label: 'Redo the pictures', about: 'New pictures for one scene, from its prompt, its reference photos and the redo note.' },
  { step: 'add', label: 'Make the new scene', about: 'Pictures for a scene that has none yet.' },
  { step: 'render', label: 'Render the cut', about: 'Build one cut from the storyboard: its scenes, in order, over its stretches of the song.' },
  { step: 'batch', label: 'Redo several scenes', about: 'New pictures for several scenes in one run on the Mac: one generator session, one request to let run.' },
];
export const BOARD_STEP_NAMES = BOARD_STEPS.map((s) => s.step);

export const LIMITS = { scenes: 200, cuts: 40, history: 30, artists: 20, text: 4000, short: 300, refs: 12, shots: 200, audio: 20, spec: 20000, batch: 24 };
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
/** A board file is one path segment, as an asset name is. */
export const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
/** Fields a person may set on a scene, and how each is checked. */
const SCENE_FIELDS = {
  status: (v) => (SCENE_STATUSES.includes(v) ? v : bad('A status is keep, redo or new')),
  note: (v) => text(v, LIMITS.text),
  prompt: (v) => text(v, LIMITS.text),
  lyric: (v) => text(v, LIMITS.short),
  section: (v) => text(v, LIMITS.short),
  shot: (v) => text(v, 60),
  start: (v) => seconds(v),
  end: (v) => seconds(v),
  refs: (v) => refs(v),
  motion: (v) => (v === '' || MOTIONS.includes(v) ? v : bad(`A motion is one of ${MOTIONS.join(', ')}`)),
  transition: (v) => (v === '' || TRANSITIONS.includes(v) ? v : bad(`A transition is one of ${TRANSITIONS.join(', ')}`)),
  // Script lines the board has no field for (a CARD, a narrator), kept on their scene so the editor loses nothing.
  extra: (v) => text(v, LIMITS.text),
};
/** Fields that change what a render shows. A change to one of them makes the scene's cuts stale. */
const VISIBLE = new Set(['lyric', 'start', 'end', 'motion', 'transition', 'extra']);

export class BoardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BoardError';
  }
}
function bad(message) {
  throw new BoardError(message);
}
function text(value, max) {
  if (typeof value !== 'string') bad('Expected text');
  if (value.length > max) bad(`Text may be at most ${max} characters`);
  return value;
}
function seconds(value) {
  if (value === null) return null;
  const n = typeof value === 'string' ? parseClock(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 6 * 3600) bad('A time is seconds into the song, such as 18.1 or 0:18.1');
  return Math.round(n * 100) / 100;
}
function refs(value) {
  const list = (Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/)).map((r) => String(r).trim()).filter(Boolean);
  if (list.length > LIMITS.refs) bad(`At most ${LIMITS.refs} reference photos`);
  for (const r of list) if (!ID.test(r)) bad(`A reference photo is named like o47 or opa, not ${r}`);
  return [...new Set(list)];
}
function id(value, what) {
  if (typeof value !== 'string' || !ID.test(value)) bad(`${what} is letters, digits, dash and underscore`);
  return value;
}
function file(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !FILE_NAME.test(value)) bad('A file name is letters, digits, dot, dash and underscore');
  return value;
}
/** "0:18.5", "1:02" or "18.5" to seconds; NaN for anything else. */
export function parseClock(value) {
  const m = String(value).trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : NaN;
}
/** Seconds as m:ss.s (0:18.1), or '' for none. */
export function clockOf(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const m = Math.floor(value / 60);
  const s = value - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
/** "0:00-0:30, 1:40-2:10" to [[0, 30], [100, 130]]. */
export function parseRanges(value) {
  const out = [];
  for (const part of String(value ?? '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const [a, b] = part.split(/\s*(?:-|–|to)\s*/);
    const start = parseClock(a);
    const end = parseClock(b);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) bad(`"${part}" is not a stretch of the song, such as 1:40-2:10`);
    out.push([start, end]);
  }
  return out;
}
export const rangesText = (ranges) => (ranges ?? []).map(([a, b]) => `${clockOf(a)}-${clockOf(b)}`).join(', ');

function cleanScene(raw, at) {
  const scene = {
    id: id(raw.id, 'A scene id'),
    section: '', lyric: '', shot: '', prompt: '', refs: [], start: null, end: null, motion: '', transition: '', extra: '', status: 'keep', note: '', noteBy: text(String(raw.noteBy ?? ''), LIMITS.short),
    pictures: {}, source: {}, history: [], changedAt: raw.changedAt ?? at, updatedAt: at,
  };
  for (const [field, check] of Object.entries(SCENE_FIELDS)) if (raw[field] !== undefined) scene[field] = check(raw[field]);
  for (const aspect of ASPECTS) {
    if (raw.pictures?.[aspect]) scene.pictures[aspect] = file(raw.pictures[aspect]);
    if (raw.source?.[aspect]) scene.source[aspect] = text(raw.source[aspect], LIMITS.short);
  }
  scene.history = (raw.history ?? []).slice(-LIMITS.history).map((h) => ({
    at: String(h.at ?? at), by: text(String(h.by ?? ''), LIMITS.short), prompt: text(String(h.prompt ?? ''), LIMITS.text),
    pictures: Object.fromEntries(ASPECTS.filter((a) => h.pictures?.[a]).map((a) => [a, file(h.pictures[a])])),
    source: Object.fromEntries(ASPECTS.filter((a) => h.source?.[a]).map((a) => [a, text(h.source[a], LIMITS.short)])),
  }));
  return scene;
}

function cleanCut(raw, sceneIds, at) {
  const cut = {
    id: id(raw.id, 'A cut id'),
    name: text(raw.name ?? '', LIMITS.short).trim() || bad('A cut needs a name'),
    aspect: ASPECTS.includes(raw.aspect) ? raw.aspect : bad('A cut is 9x16 or 16x9'),
    // all: the cut is every scene of the board, in the board's order (the full song).
    all: raw.all === true,
    shots: [],
    audio: [],
    spec: null,
    render: null,
    renderedAt: raw.renderedAt ?? null,
    changedAt: raw.changedAt ?? at,
  };
  if (!cut.all) {
    const shots = raw.shots ?? [];
    if (!Array.isArray(shots) || shots.length > LIMITS.shots) bad(`A cut has at most ${LIMITS.shots} shots`);
    cut.shots = shots.map((s) => {
      const shot = typeof s === 'string' ? { scene: s } : s;
      if (!sceneIds.has(shot?.scene)) bad(`The cut names a scene that is not on the board: ${shot?.scene}`);
      const out = { scene: shot.scene };
      if (shot.seconds !== undefined && shot.seconds !== null) {
        if (typeof shot.seconds !== 'number' || !(shot.seconds > 0) || shot.seconds > 600) bad('A shot lasts more than 0 and at most 600 seconds');
        out.seconds = Math.round(shot.seconds * 100) / 100;
      }
      return out;
    });
  }
  const audio = raw.audio ?? [];
  if (!Array.isArray(audio) || audio.length > LIMITS.audio) bad(`A cut has at most ${LIMITS.audio} stretches of song`);
  cut.audio = audio.map((r) => {
    if (!Array.isArray(r) || r.length !== 2) bad('A stretch of song is [start, end]');
    const [a, b] = [seconds(r[0]), seconds(r[1])];
    if (a === null || b === null || b <= a) bad('A stretch of song ends after it starts');
    return [a, b];
  });
  if (raw.spec !== undefined && raw.spec !== null) {
    if (typeof raw.spec !== 'object' || Array.isArray(raw.spec) || JSON.stringify(raw.spec).length > LIMITS.spec) bad('A cut\'s spec is an object of at most 20000 characters');
    cut.spec = structuredClone(raw.spec);
  }
  if (raw.render) cut.render = { file: file(raw.render.file), at: String(raw.render.at ?? at), note: text(String(raw.render.note ?? ''), LIMITS.text) };
  return cut;
}

/** A whole board, checked: what the seed sends and what the server keeps. */
export function cleanBoard(raw, { at = new Date().toISOString() } = {}) {
  if (!raw || typeof raw !== 'object') bad('A board is an object');
  const scenes = (raw.scenes ?? []).map((s) => cleanScene(s, at));
  if (scenes.length > LIMITS.scenes) bad(`A board has at most ${LIMITS.scenes} scenes`);
  const ids = new Set();
  for (const s of scenes) {
    if (ids.has(s.id)) bad(`Two scenes are called ${s.id}`);
    ids.add(s.id);
  }
  const cuts = (raw.cuts ?? []).map((c) => cleanCut(c, ids, at));
  if (cuts.length > LIMITS.cuts) bad(`A board has at most ${LIMITS.cuts} cuts`);
  if (new Set(cuts.map((c) => c.id)).size !== cuts.length) bad('Two cuts have the same id');
  return {
    id: id(raw.id, 'A board id'),
    title: text(raw.title ?? '', LIMITS.short).trim() || bad('A board needs a title'),
    project: text(raw.project ?? '', LIMITS.short),
    owner: String(raw.owner ?? ''),
    artists: cleanArtists(raw.artists ?? []),
    song: raw.song ? { file: file(raw.song.file ?? null), duration: seconds(raw.song.duration ?? null) } : { file: null, duration: null },
    scenes,
    cuts,
    orderChangedAt: raw.orderChangedAt ?? at,
    version: Number.isInteger(raw.version) ? raw.version : 1,
    createdAt: raw.createdAt ?? at,
    updatedAt: at,
    updatedBy: String(raw.updatedBy ?? ''),
  };
}

function cleanArtists(list) {
  if (!Array.isArray(list) || list.length > LIMITS.artists) bad(`A board has at most ${LIMITS.artists} artists`);
  const out = list.map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  for (const e of out) if (!EMAIL.test(e)) bad(`Not an email address: ${e}`);
  return [...new Set(out)];
}

/** Who someone is to a board: 'owner' (its owner or the app's host), 'artist', or null. */
export function roleOf(board, who, { hostId } = {}) {
  if (!who?.id) return null;
  if (who.id === board.owner || (hostId && who.id === hostId)) return 'owner';
  if (who.email && board.artists.includes(String(who.email).toLowerCase())) return 'artist';
  return null;
}

/** A new scene id after `after`: e05 → e05a, e05a → e05b; a board with no scenes starts s01. */
export function nextSceneId(board, after) {
  const taken = new Set(board.scenes.map((s) => s.id));
  const base = after ?? 's';
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const candidate = `${base}${letter}`.slice(0, 40);
    if (!taken.has(candidate) && ID.test(candidate)) return candidate;
  }
  let n = taken.size + 1;
  while (taken.has(`s${String(n).padStart(2, '0')}`)) n += 1;
  return `s${String(n).padStart(2, '0')}`;
}

const sceneOf = (board, sceneId) => board.scenes.find((s) => s.id === sceneId) ?? bad(`No scene ${sceneId} on this board`);
const cutOf = (board, cutId) => board.cuts.find((c) => c.id === cutId) ?? bad(`No cut ${cutId} on this board`);

/**
 * The board after the ops, made by `by` ({ id, name }) in `role` ('owner', 'artist' or 'team'). Refuses
 * (BoardError) the whole list when one op is wrong. Ops:
 *   { op: 'set', scene, field, value }        field: status, note, prompt, lyric, section, shot, start, end, refs, motion, transition, extra
 *   { op: 'move', scene, to }                 to: the scene's new index on the board
 *   { op: 'add-after', after, scene: {...} }  after: a scene id, or null for the start; returns the new id in board.added
 *   { op: 'remove', scene }                   a scene, and its shots in every cut
 *   { op: 'use-picture', scene, history }     put back earlier pictures (the history index); the current ones go to history
 *   { op: 'cut', cut: {...} }                 add or replace a cut (keeps its last render)
 *   { op: 'remove-cut', cut }
 *   { op: 'title', value }
 *   { op: 'artists', artists: [emails] }      owner only
 *   { op: 'pictures', scene, pictures, source, prompt? }   team only: new pictures for a scene
 *   { op: 'rendered', cut, file, note? }      team only: a cut was rendered
 *   { op: 'song', file, duration }            team only
 */
export function applyOps(board, ops, { by = {}, role, at = new Date().toISOString() } = {}) {
  if (!Array.isArray(ops) || !ops.length || ops.length > 50) bad('Send 1 to 50 changes');
  if (!['owner', 'artist', 'team'].includes(role)) bad('Only the board\'s owner, its artists and the team change a board');
  const next = structuredClone(board);
  const who = by.name || by.email || by.id || role;
  next.added = [];
  for (const change of ops) {
    const op = change?.op;
    if (op === 'set') {
      const scene = sceneOf(next, change.scene);
      const check = SCENE_FIELDS[change.field] ?? bad(`A scene has no field ${change.field} to set`);
      scene[change.field] = check(change.value);
      scene.updatedAt = at;
      if (change.field === 'note') scene.noteBy = change.value ? who : '';
      if (VISIBLE.has(change.field)) scene.changedAt = at;
    } else if (op === 'move') {
      const from = next.scenes.findIndex((s) => s.id === change.scene);
      if (from < 0) bad(`No scene ${change.scene} on this board`);
      if (!Number.isInteger(change.to) || change.to < 0 || change.to >= next.scenes.length) bad('Move a scene to a place on the board');
      const [scene] = next.scenes.splice(from, 1);
      next.scenes.splice(change.to, 0, scene);
      if (from !== change.to) next.orderChangedAt = at;
    } else if (op === 'add-after') {
      if (next.scenes.length >= LIMITS.scenes) bad(`A board has at most ${LIMITS.scenes} scenes`);
      const index = change.after == null ? 0 : next.scenes.findIndex((s) => s.id === change.after) + 1;
      if (index === 0 && change.after != null) bad(`No scene ${change.after} on this board`);
      const before = next.scenes[index - 1];
      const fields = { ...(change.scene ?? {}) };
      for (const key of Object.keys(fields)) if (!['lyric', 'prompt', 'refs', 'section', 'shot', 'start', 'end', 'note', 'motion', 'transition', 'extra'].includes(key)) bad(`A new scene has no field ${key}`);
      const scene = cleanScene({
        id: nextSceneId(next, change.after ?? null),
        section: before?.section ?? '', refs: before?.refs ?? [], start: before?.end ?? null, end: next.scenes[index]?.start ?? null,
        ...fields, status: 'new',
      }, at);
      next.scenes.splice(index, 0, scene);
      next.orderChangedAt = at;
      next.added.push(scene.id);
    } else if (op === 'remove') {
      sceneOf(next, change.scene);
      next.scenes = next.scenes.filter((s) => s.id !== change.scene);
      for (const cut of next.cuts) {
        if (cut.shots.some((s) => s.scene === change.scene)) {
          cut.shots = cut.shots.filter((s) => s.scene !== change.scene);
          cut.changedAt = at;
        }
      }
      next.orderChangedAt = at;
    } else if (op === 'use-picture') {
      const scene = sceneOf(next, change.scene);
      const old = scene.history[change.history] ?? bad('No such earlier picture');
      scene.history.splice(change.history, 1);
      scene.history.push({ at, by: who, prompt: scene.prompt, pictures: scene.pictures, source: scene.source });
      scene.history = scene.history.slice(-LIMITS.history);
      Object.assign(scene, { pictures: old.pictures, source: old.source, prompt: old.prompt || scene.prompt, changedAt: at, updatedAt: at });
    } else if (op === 'cut') {
      const old = next.cuts.find((c) => c.id === change.cut?.id);
      const cut = cleanCut({ ...change.cut, render: old?.render ?? null, renderedAt: old?.renderedAt ?? null, changedAt: at }, new Set(next.scenes.map((s) => s.id)), at);
      if (old) next.cuts[next.cuts.indexOf(old)] = cut;
      else if (next.cuts.length >= LIMITS.cuts) bad(`A board has at most ${LIMITS.cuts} cuts`);
      else next.cuts.push(cut);
    } else if (op === 'remove-cut') {
      cutOf(next, change.cut);
      next.cuts = next.cuts.filter((c) => c.id !== change.cut);
    } else if (op === 'title') {
      next.title = text(change.value, LIMITS.short).trim() || bad('A board needs a title');
    } else if (op === 'artists') {
      if (role !== 'owner') bad('Only the board\'s owner chooses its artists');
      next.artists = cleanArtists(change.artists);
    } else if (op === 'pictures') {
      if (role !== 'team') bad('Only the team on the Mac sends pictures');
      const scene = sceneOf(next, change.scene);
      const pictures = Object.fromEntries(ASPECTS.filter((a) => change.pictures?.[a]).map((a) => [a, file(change.pictures[a])]));
      if (!Object.keys(pictures).length) bad('Send at least one picture');
      if (Object.keys(scene.pictures).length) scene.history.push({ at, by: who, prompt: scene.prompt, pictures: scene.pictures, source: scene.source });
      scene.history = scene.history.slice(-LIMITS.history);
      scene.pictures = { ...scene.pictures, ...pictures };
      scene.source = { ...scene.source, ...Object.fromEntries(ASPECTS.filter((a) => change.source?.[a]).map((a) => [a, text(change.source[a], LIMITS.short)])) };
      if (typeof change.prompt === 'string' && change.prompt.trim()) scene.prompt = text(change.prompt, LIMITS.text);
      Object.assign(scene, { status: 'keep', note: '', noteBy: '', changedAt: at, updatedAt: at });
    } else if (op === 'rendered') {
      if (role !== 'team') bad('Only the team on the Mac reports a render');
      const cut = cutOf(next, change.cut);
      cut.render = { file: file(change.file ?? null), at, note: text(String(change.note ?? ''), LIMITS.text) };
      cut.renderedAt = change.startedAt && !Number.isNaN(Date.parse(change.startedAt)) ? change.startedAt : at;
    } else if (op === 'song') {
      if (role !== 'team') bad('Only the team on the Mac sends the song');
      next.song = { file: file(change.file ?? null), duration: seconds(change.duration ?? null) };
    } else {
      bad(`Unknown change: ${op}`);
    }
  }
  // Cuts that name every scene follow the board; others keep their own order.
  next.version = (board.version ?? 0) + 1;
  next.updatedAt = at;
  next.updatedBy = who;
  return next;
}

/** The scene ids a cut shows, in its order. */
export function cutScenes(board, cut) {
  return cut.all ? board.scenes.map((s) => s.id) : cut.shots.map((s) => s.scene);
}

/**
 * Whether a cut's last render still shows the board: { state: 'never' | 'stale' | 'current', changed: [scene ids] }.
 * A cut is stale when, after its render started, one of its scenes got new pictures, lyric or times, its own
 * list or song stretches changed, or (for a cut of every scene) the board's order changed.
 */
export function cutState(board, cut) {
  if (!cut.renderedAt) return { state: 'never', changed: [] };
  const ids = new Set(cutScenes(board, cut));
  const changed = board.scenes.filter((s) => ids.has(s.id) && s.changedAt > cut.renderedAt).map((s) => s.id);
  const listChanged = cut.changedAt > cut.renderedAt || (cut.all && board.orderChangedAt > cut.renderedAt);
  return { state: changed.length || listChanged ? 'stale' : 'current', changed, listChanged };
}

/** Seconds of song a cut uses. */
export const cutLength = (cut) => (cut.audio ?? []).reduce((sum, [a, b]) => sum + (b - a), 0);

/** The motion and transitions people set in the editor, for a render: one line per scene that has either. */
function onScreen(board, shots) {
  const set = shots.map((s) => board.scenes.find((x) => x.id === s.scene)).filter((s) => s && (s.motion || s.transition));
  if (!set.length) return [];
  return [
    'Motion and transitions set on the board (use these; a scene not listed is the renderer\'s choice. If the renderer',
    'cannot do one, render without it and name it in your report):',
    ...set.map((s) => `  ${s.id}: ${[s.motion && `motion ${s.motion}`, s.transition && `comes in by ${s.transition}`].filter(Boolean).join(', ')}`),
  ];
}

/** What the team needs to know about one scene, headed by what to make of it. */
function sceneLines(scene, what = 'Scene') {
  const out = [
    `${what}: ${scene.id}.`,
    `Section: ${scene.section || '(none)'}. Lyric line: ${scene.lyric || '(none)'}. Song time: ${clockOf(scene.start) || '?'} to ${clockOf(scene.end) || '?'}.`,
    `Shot: ${scene.shot || '(any)'}. Reference photos: ${scene.refs.join(', ') || '(none)'}.`,
    ...(scene.motion || scene.transition ? [`On screen: motion ${scene.motion || '(renderer\'s choice)'}, comes in by ${scene.transition || '(renderer\'s default)'}.`] : []),
    `Prompt: ${scene.prompt || '(none yet: write one that fits the lyric and the scenes around it)'}`,
  ];
  if (scene.note) out.push(`Redo note from ${scene.noteBy || 'the artist'}: ${scene.note}`);
  else out.push('No redo note: a reroll. Keep the prompt and make a different take of it.');
  return out;
}

/**
 * The words the team on the Mac works from for a storyboard job: the worker passes them to Claude Code in
 * the board's project folder, where it has also written the board as storyboard.json. Kept here so the
 * page can show what will be asked and the tests can read it.
 */
export function jobBrief(board, job) {
  const lines = [
    `Storyboard: "${board.title}" (board ${board.id}). The board, as it is now, is storyboard.json in this folder.`,
    'Picture paths in a scene\'s "source" are relative to this folder. Reference photo ids (o47, opa) name the',
    'project\'s reference photos; README.md or the album\'s own notes say where they are.',
  ];
  if (job.step === 'batch') {
    const scenes = (job.scenes ?? []).map((id) => board.scenes.find((s) => s.id === id)).filter(Boolean);
    const gone = (job.scenes ?? []).filter((id) => !board.scenes.some((s) => s.id === id));
    if (!scenes.length) return `${lines.join('\n')}\n\nNone of the scenes ${(job.scenes ?? []).join(', ')} is still on the board. Report that and stop.`;
    lines.push('', `Job: make new pictures for ${scenes.length} scene${scenes.length === 1 ? '' : 's'} in this one run: ${scenes.map((s) => s.id).join(', ')}.`);
    if (gone.length) lines.push(`(No longer on the board, so skip them: ${gone.join(', ')}.)`);
    for (const scene of scenes) lines.push('', ...sceneLines(scene, Object.keys(scene.pictures).length ? 'New pictures' : 'Pictures for the new scene'));
    if (job.note) lines.push('', `Also asked, for every scene: ${job.note}`);
    lines.push(
      '',
      'For each scene make one picture in each of 9:16 and 16:9 with the same generator, rules and reference photos',
      'the board\'s other pictures were made with. Keep one generator session open for the whole list instead of',
      'starting over for each scene, and keep the earlier pictures: write new files, never over old ones.',
      `After each scene is made, rewrite storyboard-out/${job.id}.json in this folder with every scene done so far:`,
      '{"scenes": [{"scene": "<id>", "pictures": {"9x16": "<path>", "16x9": "<path>"}, "prompt": "<the prompt you used>"}, ...]}',
      'with paths relative to this folder, so the scenes already made reach the board even if a later one fails.',
      'The worker sends them to the board from that file. Name in your report any scene you could not make, and why.',
    );
    return lines.join('\n');
  }
  if (job.step === 'redo' || job.step === 'add') {
    const scene = board.scenes.find((s) => s.id === job.scene);
    if (!scene) return `${lines.join('\n')}\n\nThe scene ${job.scene} is no longer on the board. Report that and stop.`;
    lines.push(
      '',
      job.step === 'redo' ? `Job: make new pictures for scene ${scene.id}.` : `Job: make the pictures for the new scene ${scene.id}.`,
      ...sceneLines(scene).slice(1),
    );
    if (job.note) lines.push(`Also asked: ${job.note}`);
    lines.push(
      '',
      'Make one picture in each of 9:16 and 16:9 with the same generator, rules and reference photos the board\'s',
      'other pictures were made with, and keep the earlier pictures: write new files, never over old ones.',
      `When the pictures are made, write storyboard-out/${job.id}.json in this folder:`,
      `{"scene": "${scene.id}", "pictures": {"9x16": "<path>", "16x9": "<path>"}, "prompt": "<the prompt you used>"}`,
      'with paths relative to this folder. The worker sends them to the board from that file.',
    );
  } else if (job.step === 'render') {
    const cut = board.cuts.find((c) => c.id === job.cut);
    if (!cut) return `${lines.join('\n')}\n\nThe cut ${job.cut} is no longer on the board. Report that and stop.`;
    const shots = cut.all ? board.scenes.map((s) => ({ scene: s.id })) : cut.shots;
    lines.push(
      '',
      `Job: render the cut "${cut.name}" (${cut.id}), ${ASPECT_LABEL[cut.aspect]}, from the storyboard.`,
      `Scenes, in order: ${shots.map((s) => (s.seconds ? `${s.scene} (${s.seconds}s)` : s.scene)).join(', ')}.`,
      `Song: ${rangesText(cut.audio) || 'the whole song'}.`,
      ...(cut.spec ? [`The cut's spec (the renderer's own settings, kept from before): ${JSON.stringify(cut.spec)}`] : []),
      ...onScreen(board, shots),
      '',
      'Use the picture each scene has now on the board (its "source" for this aspect) and the renderer this project',
      'already uses for a cut of this kind; update that renderer\'s input from the board, never by hand.',
      `When it is built, write storyboard-out/${job.id}.json: {"cut": "${cut.id}", "video": "<path to the mp4>"}.`,
      'Do not upload the video anywhere.',
    );
    if (job.note) lines.push(`Also asked: ${job.note}`);
  }
  return lines.join('\n');
}
