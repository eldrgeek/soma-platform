import { getStore } from '@netlify/blobs';
import { readFile } from 'node:fs/promises';

import { createBlobsStore } from '../../src/blobs-store.js';
import { DAYS, guestSource, parse, walk } from '../../src/parser.js';
import { createStageReader, DEFAULT_LIMITS } from '../../../soma-play/server/stage-read.js';
import { createVideoReader, VIDEO_LIMITS } from '../../../soma-video/server/video-read.js';
import { createVideoStudio } from '../../../soma-video/server/studio.js';
import { BoardError, createBoardStore } from '../../../soma-video/server/boards.js';
import { ASPECTS, BOARD_STEP_NAMES, jobBrief, LIMITS as BOARD_LIMITS, OWN_PICTURE_TYPES, roleOf } from '../../../soma-video/src/storyboard.js';
import { notesOps, notesToRedo, parseNotes } from '../../../soma-video/src/notes.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PuppetParseError, STATUSES, stricter } from '../../src/store.js';
import { createIdentityVerifier, HttpError } from '../lib/auth.mjs';

const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store' },
  });

async function body(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Body must be an object');
    }
    return value;
  } catch {
    throw new HttpError(400, 'A JSON object body is required');
  }
}

// The SOMA Studio team key (STUDIO_TEAM_KEY), compared in constant time. Both sides are hashed first,
// so keys of different lengths compare without leaking the length.
export function keyMatches(given, expected) {
  if (!expected || typeof given !== 'string' || !given) return false;
  const digest = (value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}


// The elements that let a reader ask the route `kind` to speak a line: its own element, and for Stage Read
// also line-run (v0.8), which reads every part but the reader's own.
const speaks = (element, kind) => element.kind === kind || (kind === 'stage-read' && element.kind === 'line-run');
function requireHost(config, identity) {
  if (identity?.id !== config.hostId) {
    throw new HttpError(403, 'Only the app host may perform this action');
  }
}

// A field longer than this is refused before matching, so a hostile body
// cannot make a template with several {form.*} tokens backtrack for long.
const MAX_FIELD_LENGTH = 10000;
// A script-editor saves a whole script, so an edit may be longer than a new row's field. No pattern is
// matched against an edit.
export const MAX_EDIT_LENGTH = 40000;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Mirrors interpolate() in src/render.js, the code the browser uses to fill
// a row: {me.name} is the verified name, {form.*} is typed text, a
// {Name.count} is a number (or the token itself), and any other token is sent as literal text.
// Each {form.*} token is captured, so the field it names can check it: a
// @date field takes an ISO date or nothing, and a @required field may not be empty.
function templatePattern(template, identity, fields = {}) {
  const token = /\{([^}]+)\}/g;
  const checks = [];
  let pattern = '^';
  let offset = 0;
  for (const match of String(template).matchAll(token)) {
    pattern += escapeRegex(String(template).slice(offset, match.index));
    const name = match[1];
    const count = name.match(/^([\w-]+)\.count$/);
    if (name === 'me.name') {
      pattern += escapeRegex(Object.hasOwn(identity, 'name') ? identity.name : '');
    } else if (name.startsWith('form.')) {
      const field = fields[name.slice(5)]?.[0];
      pattern += field?.roles.includes('@date') ? '(\\d{4}-\\d{2}-\\d{2}|)' : '([\\s\\S]*?)';
      checks.push(field);
    } else if (count) {
      // The browser fills a count only when that data is loaded; otherwise
      // it sends the token as written.
      pattern += `(?:\\d+|${escapeRegex(match[0])})`;
    } else {
      pattern += escapeRegex(match[0]);
    }
    offset = match.index + match[0].length;
  }
  pattern += `${escapeRegex(String(template).slice(offset))}$`;
  return { pattern: new RegExp(pattern), checks };
}

// A real calendar date in YYYY-MM-DD form, on one of the field's days: if it names any.
export function validDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return days === undefined || [].concat(days).includes(DAYS[date.getUTCDay()]);
}

function fieldValueOk(field, value) {
  if (!field) return true;
  if (field.roles.includes('@required') && !value.trim()) return false;
  if (field.roles.includes('@date') && value) return validDate(value, field.props.days);
  // A choice list takes one of its items (or nothing, when it is not @required).
  if (field.roles.includes('@select') && field.props.items !== undefined && value) {
    return [].concat(field.props.items).map(String).includes(value);
  }
  return true;
}

function matchesAction(input, action, identity, fields) {
  const templates = action.row ?? {};
  const keys = Object.keys(templates);
  const inputFields = Object.keys(input);
  if (
    keys.length !== inputFields.length ||
    keys.some((field) => !Object.hasOwn(input, field))
  ) {
    return false;
  }
  return keys.every((key) => {
    if (typeof input[key] !== 'string' || input[key].length > MAX_FIELD_LENGTH) return false;
    const { pattern, checks } = templatePattern(templates[key], identity, fields);
    const match = pattern.exec(input[key]);
    return Boolean(match) && checks.every((field, index) => fieldValueOk(field, match[index + 1]));
  });
}

// The fields of a screen or dialog by label: a {form.*} token names the field
// with that label on the same screen or dialog as its button.
function fieldsOf(owner) {
  const fields = {};
  for (const element of walk(owner.children)) {
    if (element.kind === 'field' && element.label != null) (fields[element.label] ??= []).push(element);
  }
  return fields;
}

// The actions this reader can see: a host-only screen or dialog counts only for the host.
function* visibleActions(sketch, isHost) {
  for (const owner of [...sketch.screens, ...sketch.dialogs]) {
    if (owner.hostOnly && !isHost) continue;
    const fields = fieldsOf(owner);
    for (const element of walk(owner.children)) {
      for (const action of element.hook ?? []) yield { action, element, fields };
    }
  }
}

async function liveSketch(store, appId) {
  const current = await store.getCurrent(appId);
  if (!current) throw new HttpError(400, `App ${appId} has no current version`);
  const parsed = parse(current.source);
  if (parsed.errors.length) throw new PuppetParseError(parsed.errors);
  return parsed.sketch;
}

async function prepareDataRow(store, appId, name, input, identity, isHost) {
  const sketch = await liveSketch(store, appId);
  const declaration = sketch.data[name];
  if (!declaration) throw new HttpError(400, `Unknown data: ${name}`);

  const undeclared = Object.keys(input).filter(
    (field) => !declaration.fields.includes(field),
  );
  if (undeclared.length) {
    throw new HttpError(
      400,
      `Undeclared field(s) for ${name}: ${undeclared.join(', ')}`,
    );
  }

  let matched = false;
  for (const { action, fields } of visibleActions(sketch, isHost)) {
    if (action.type !== 'add' || action.target !== name) continue;
    if (matchesAction(input, action, identity, fields)) matched = true;
  }
  if (!matched) {
    throw new HttpError(400, `Body does not match any adds to ${name} action`);
  }
  return input;
}

export function createApiHandler({
  apps,
  store,
  verifyIdentity,
  readSeed,
  feedbackStore,
  stageReader,
  videoReader,
  videoStudio,
  videoBoards,
  teamKey = '',
}) {
  // Puppet v0.7: an artist's notes (pasted on the board, or sent from the Mac when they came by email or
  // text) go onto the cards they name as redo notes, and one batch request redoes those scenes. Unless the
  // host asked, the request is held until the host lets it run.
  async function takeNotes(appId, boardId, input, { by, role, held }) {
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20000) throw new HttpError(400, 'Send the notes as "text", at most 20000 characters');
    const board = await videoBoards.get(appId, boardId);
    if (!board) throw new HttpError(404, `Unknown board: ${boardId}`);
    const found = parseNotes(board, input.text);
    const ops = notesOps(board, found, { replace: input.replace === true });
    const next = ops.length ? (await videoBoards.change(appId, boardId, ops, { by, role })).board : board;
    const scenes = notesToRedo(found);
    const job = scenes.length && input.ask !== false
      ? await videoStudio.createBoardJob(appId, { board: boardId, step: 'batch', scenes: scenes.slice(0, BOARD_LIMITS.batch), note: '', by: by.name || by.id, held })
      : null;
    return { board: next, notes: found.notes, general: found.general, job, left: scenes.slice(BOARD_LIMITS.batch) };
  }

  // Seeding is two writes, propose then approve. If a request stops between
  // them, the next request finds the seed still proposed and approves it,
  // instead of leaving the app with no current version.
  async function seed(appId, config) {
    if (await store.getCurrent(appId)) return;
    const versions = await store.listVersions(appId);
    const pending = versions.find(
      (version) => version.reason === 'Initial seed' && version.status === 'proposed',
    );
    if (versions.length && !pending) return;
    let versionId = pending?.id;
    if (!versionId) {
      let source;
      try {
        source = await readSeed(appId);
      } catch {
        throw new HttpError(404, `No seed description for ${appId}`);
      }
      versionId = await store.propose(appId, {
        source,
        author: config.hostId,
        reason: 'Initial seed',
      });
    }
    await store.approve(appId, versionId, config.hostId);
  }

  return async function api(request) {
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/api/config') {
        return json({
          supabaseUrl: process.env.SUPABASE_URL ?? '',
          supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
          devIdentity: process.env.NETLIFY_DEV === 'true',
        });
      }

      const match = url.pathname.match(/\/api\/app\/([^/]+)(?:\/(.*))?$/);
      if (!match) throw new HttpError(404, 'Unknown API route');
      const appId = decodeURIComponent(match[1]);
      const route = match[2] ?? '';
      const config = apps[appId];
      if (!config) throw new HttpError(404, `Unknown app: ${appId}`);

      // Puppet v0.6: the team on Mike's Mac (the VideoMaker worker) signs with the SOMA Studio team
      // key, not as a person. It reads the open jobs with the script each one is for, reports on a job,
      // and stores the assets it made. Nothing else answers to the key.
      const teamMatch = route.match(/^video-team\/(jobs|assets|boards)(?:\/(.*))?$/);
      if (teamMatch) {
        if (!videoStudio) throw new HttpError(503, 'The video studio is not configured');
        if (!keyMatches(request.headers.get('x-studio-team-key'), teamKey)) throw new HttpError(401, 'The team key is required');
        const [, kind, rest = ''] = teamMatch;
        if (kind === 'jobs' && request.method === 'GET' && !rest) {
          const jobs = await videoStudio.listJobs(appId, { open: true });
          // v0.7: storyboard jobs go only to a worker that says it knows them (?boards=1), so an older worker
          // leaves them queued instead of failing them for want of a script.
          const withBoards = url.searchParams.get('boards') === '1';
          const out = [];
          for (const job of jobs) {
            if (job.board) {
              if (!withBoards || !videoBoards) continue;
              const board = await videoBoards.get(appId, job.board);
              out.push({ ...job, title: board?.title ?? '', board: board ?? null, brief: board ? jobBrief(board, job, { site: url.origin, app: appId }) : '' });
              continue;
            }
            const rows = await store.list(appId, job.data, {});
            const row = rows.find((candidate) => candidate.id === job.rowId);
            out.push({ ...job, title: row?.title ?? '', text: typeof row?.[job.field] === 'string' ? row[job.field] : null });
          }
          return json(out);
        }
        if (kind === 'jobs' && request.method === 'POST' && rest) {
          return json(await videoStudio.updateJob(appId, decodeURIComponent(rest), await body(request)));
        }
        const assetPath = rest.match(/^([^/]+)\/([^/]+)\/([^/]+)$/);
        if (kind === 'assets' && assetPath) {
          const [, name, rowId, file] = assetPath.map(decodeURIComponent);
          if (request.method === 'PUT') {
            let meta = {};
            try {
              meta = JSON.parse(request.headers.get('x-asset-meta') || '{}');
            } catch {
              throw new HttpError(400, 'x-asset-meta must be JSON');
            }
            const bytes = new Uint8Array(await request.arrayBuffer());
            return json(await videoStudio.putAsset(appId, name, rowId, file, bytes, { ...meta, type: request.headers.get('content-type') }), 201);
          }
          if (request.method === 'DELETE') return json(await videoStudio.removeAsset(appId, name, rowId, file));
        }
        // v0.7: the team seeds a storyboard (PUT the whole board; its owner is the app's host), sends its
        // files, and reports on it with ops (new pictures, a render, the song).
        const boardPath = kind === 'boards' && rest.match(/^([^/]+)(?:\/files\/([^/]+)|\/(notes))?$/);
        if (boardPath) {
          if (!videoBoards) throw new HttpError(503, 'Storyboards are not configured');
          const [, boardId, file, notes] = boardPath.map((part) => (part === undefined ? part : decodeURIComponent(part)));
          // Notes that reached the Mac by email or text (bin/vm-board-notes.mjs). They are the artist's words, not
          // the host's click, so the batch they ask for is always held for the host.
          if (notes && request.method === 'POST') {
            const input = await body(request);
            if (typeof input.by !== 'string' || !input.by.trim() || input.by.length > 120) throw new HttpError(400, 'Say whose notes these are as "by"');
            try {
              return json(await takeNotes(appId, boardId, input, { by: { name: input.by.trim() }, role: 'team', held: true }), 201);
            } catch (error) {
              if (error instanceof BoardError) throw new HttpError(400, error.message);
              throw error;
            }
          }
          // A picture someone uploaded (v0.7 editor) has no path on the Mac; the team fetches it from here.
          if (file && request.method === 'GET') {
            const found = await videoBoards.getFile(appId, boardId, file);
            if (!found) throw new HttpError(404, `Unknown file: ${file}`);
            return new Response(found.bytes, { status: 200, headers: { 'content-type': found.metadata?.type ?? 'application/octet-stream' } });
          }
          if (file && request.method === 'PUT') {
            const bytes = new Uint8Array(await request.arrayBuffer());
            return json(await videoBoards.putFile(appId, boardId, file, bytes, { type: request.headers.get('content-type') }), 201);
          }
          if (!file && request.method === 'GET') {
            const board = await videoBoards.get(appId, boardId);
            if (!board) throw new HttpError(404, `Unknown board: ${boardId}`);
            return json(board);
          }
          if (!file && request.method === 'PUT') {
            const input = await body(request);
            return json(await videoBoards.put(appId, { ...input, id: boardId }, { owner: config.hostId, by: 'the team' }), 201);
          }
          if (!file && request.method === 'POST') {
            const { ops } = await body(request);
            return json((await videoBoards.change(appId, boardId, ops, { by: { name: 'the team' }, role: 'team' })).board);
          }
        }
        throw new HttpError(404, 'Unknown team route');
      }

      const isWrite = request.method !== 'GET';
      // A publicRead app still identifies a reader who sends credentials, so
      // its host gets the host's view; routes that need a reader ask for one.
      const credentials =
        request.headers.has('authorization') || request.headers.has('x-dev-user');
      let identity = null;
      if (isWrite || !config.publicRead || route === 'feedback' || credentials) {
        identity = await verifyIdentity(request);
      }
      const signedIn = async () => (identity ??= await verifyIdentity(request));
      const isHost = identity?.id === config.hostId;

      // The rows of a collection this reader may read, by the strictest read
      // rule the live version or any approved version gave it. GET and Stage
      // Read both use this, so they cannot disagree.
      const readable = async (sketch, name) => {
        const declaration = sketch.data[name];
        if (!declaration) throw new HttpError(404, `Unknown data: ${name}`);
        const level = stricter(declaration.read, (await store.privacyLevels(appId))[name]);
        let rows;
        if (level === 'private') {
          rows = await store.list(appId, name, { author: (await signedIn()).id });
        } else if (level === 'own') {
          const reader = await signedIn();
          rows = await store.list(appId, name, reader.id === config.hostId ? {} : { author: reader.id });
        } else {
          rows = await store.list(appId, name);
        }
        if (declaration.fields.includes('status')) {
          rows = rows.map((row) => ({ ...row, status: row.status ?? 'pending' }));
        }
        return { rows, level };
      };

      if (request.method === 'GET' && route === 'current') {
        await seed(appId, config);
        const current = await store.getCurrent(appId);
        if (!current) throw new HttpError(404, `App ${appId} has no current version`);
        let source = current.source;
        if (!isHost) {
          try {
            source = guestSource(current.source);
          } catch {
            // Fail closed: a reader who is not the host never gets the full text.
            throw new HttpError(500, 'The live description could not be prepared for this reader');
          }
        }
        return json({
          versionId: current.id,
          source,
          hostId: config.hostId,
        });
      }

      if (request.method === 'GET' && route === 'versions') {
        requireHost(config, await signedIn());
        return json(await store.listVersions(appId));
      }

      if (request.method === 'POST' && route === 'propose') {
        requireHost(config, identity);
        const input = await body(request);
        if (typeof input.source !== 'string' || !input.source.trim()) {
          throw new HttpError(400, 'source is required');
        }
        const versionId = await store.propose(appId, {
          source: input.source,
          author: identity.id,
          reason: typeof input.reason === 'string' ? input.reason : '',
        });
        return json({ versionId }, 201);
      }

      if (request.method === 'POST' && route === 'approve') {
        requireHost(config, identity);
        const input = await body(request);
        if (typeof input.versionId !== 'string') {
          throw new HttpError(400, 'versionId is required');
        }
        return json(await store.approve(appId, input.versionId, identity.id));
      }

      if (request.method === 'POST' && route === 'undo') {
        requireHost(config, identity);
        return json(await store.undo(appId, identity.id));
      }

      if (request.method === 'POST' && route === 'feedback') {
        const input = await body(request);
        if (typeof input.text !== 'string' || !input.text.trim()) {
          throw new HttpError(400, 'text is required');
        }
        const item = {
          id: crypto.randomUUID(),
          text: input.text.trim(),
          page: typeof input.page === 'string' ? input.page : '',
          author: {
            id: identity.id,
            name: identity.name,
          },
          createdAt: new Date().toISOString(),
        };
        await feedbackStore.setJSON(
          `apps/${encodeURIComponent(appId)}/${item.createdAt}-${item.id}.json`,
          item,
        );
        return json({
          status: 'accepted',
          id: item.id,
          filedAt: item.createdAt,
          kind: input.kind === 'review' ? 'review' : 'request',
          kindInferred: false,
        }, 201);
      }

      if (request.method === 'GET' && route === 'feedback') {
        requireHost(config, identity);
        const prefix = `apps/${encodeURIComponent(appId)}/`;
        const { blobs } = await feedbackStore.list({ prefix });
        const items = (
          await Promise.all(
            blobs.map(({ key }) => feedbackStore.get(key, { type: 'json' })),
          )
        )
          .filter(Boolean)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        return json(items);
      }

      if (request.method === 'POST' && (route === 'stage-read' || route === 'video-read')) {
        // Checks in order: signed in; a stage-read (or, v0.5, a video-read)
        // of this field on a screen from this data that the reader can see;
        // the row is one the reader may read (otherwise the same answer as a
        // missing row); then the spend allowance, inside the reader. A line-run (v0.8) offers Stage Read
        // too, with the same allowance; it never offers the narration read.
        const kind = route;
        const speaker = kind === 'stage-read' ? stageReader : videoReader;
        const reader = await signedIn();
        const input = await body(request);
        const { data: name, rowId, field, line } = input;
        if (typeof name !== 'string' || typeof rowId !== 'string' || typeof field !== 'string' || !Number.isInteger(line)) {
          throw new HttpError(400, 'Body must be { data, rowId, field, line }');
        }
        const sketch = await liveSketch(store, appId);
        const offered = [...sketch.screens, ...sketch.dialogs].some(
          (owner) =>
            owner.from === name &&
            (!owner.hostOnly || reader.id === config.hostId) &&
            walk(owner.children).some((element) => speaks(element, kind) && element.field === field),
        );
        if (!offered) throw new HttpError(404, `No ${kind} of ${name}.${field} here`);
        const { rows } = await readable(sketch, name);
        const row = rows.find((candidate) => candidate.id === rowId);
        if (!row || typeof row[field] !== 'string') throw new HttpError(404, `Unknown row: ${rowId}`);
        if (!speaker) throw new HttpError(503, `${kind} is not configured`);
        const out = await speaker({ who: reader.id, scope: appId, text: row[field], line });
        if (out.status !== 200) return json({ error: out.error }, out.status);
        return new Response(out.body, {
          status: 200,
          headers: { ...out.headers, 'cache-control': 'private, no-store' },
        });
      }

      // Puppet v0.6: a script's assets and jobs, for a reader of the row. Checks in order: signed in; a
      // video-assets (or video-jobs) element of this data on a screen the reader can see; the row is one
      // the reader may read (otherwise the same answer as a missing row). Asking for a job also needs
      // the host, because a job runs with Claude Code on the host's own Mac.
      const videoMatch = route.match(/^video\/([^/]+)\/([^/]+)\/(assets|jobs)(?:\/([^/]+))?$/);
      if (videoMatch) {
        if (!videoStudio) throw new HttpError(503, 'The video studio is not configured');
        const [, name, rowId, kind, file] = videoMatch.map((part) => (part === undefined ? part : decodeURIComponent(part)));
        const reader = await signedIn();
        const element = kind === 'assets' ? 'video-assets' : 'video-jobs';
        const sketch = await liveSketch(store, appId);
        const offered = [...sketch.screens, ...sketch.dialogs].flatMap((owner) =>
          owner.from === name && (!owner.hostOnly || reader.id === config.hostId)
            ? walk(owner.children).filter((candidate) => candidate.kind === element)
            : [],
        );
        if (!offered.length) throw new HttpError(404, `No ${element} of ${name} here`);
        const visible = (await readable(sketch, name)).rows;
        if (!visible.some((candidate) => candidate.id === rowId)) throw new HttpError(404, `Unknown row: ${rowId}`);
        if (kind === 'assets' && request.method === 'GET' && !file) {
          return json(await videoStudio.listAssets(appId, name, rowId));
        }
        if (kind === 'assets' && request.method === 'GET' && file) {
          const found = await videoStudio.getAsset(appId, name, rowId, file);
          if (!found) throw new HttpError(404, `Unknown asset: ${file}`);
          return new Response(found.bytes, {
            status: 200,
            headers: { 'content-type': found.metadata?.type ?? 'application/octet-stream', 'cache-control': 'private, max-age=300' },
          });
        }
        if (kind === 'jobs' && request.method === 'GET' && !file) {
          return json(await videoStudio.listJobs(appId, { rowId }));
        }
        if (kind === 'jobs' && request.method === 'POST' && !file) {
          requireHost(config, reader);
          const input = await body(request);
          const { step, note = '' } = input;
          if (typeof step !== 'string' || Object.keys(input).some((key) => !['step', 'note'].includes(key))) {
            throw new HttpError(400, 'Body must be { "step": "...", "note": "..." }');
          }
          return json(await videoStudio.createJob(appId, { data: name, rowId, field: offered[0].field, step, note, by: reader.id }), 201);
        }
        throw new HttpError(404, 'Unknown API route');
      }

      // Puppet v0.7: storyboards. Checks in order: signed in; a video-storyboards element on a screen the
      // reader can see; then the reader's role on the board (roleOf): its owner and the app's host may do
      // anything, its artists (by the email they sign in with) may view and change it, and anyone else is
      // answered as if it did not exist. Only the host starts a board. A job asked by anyone but the host
      // waits (held) until the host lets it run, because it runs with Claude Code on the host's Mac.
      const boardMatch = route.match(/^video-boards(?:\/([^/]+)(?:\/(files|jobs|notes|pictures)(?:\/([^/]+))?)?)?$/);
      if (boardMatch) {
        if (!videoBoards || !videoStudio) throw new HttpError(503, 'Storyboards are not configured');
        const [, boardId, kind, item] = boardMatch.map((part) => (part === undefined ? part : decodeURIComponent(part)));
        const reader = await signedIn();
        const sketch = await liveSketch(store, appId);
        const boardsOffered = [...sketch.screens, ...sketch.dialogs].some(
          (owner) => (!owner.hostOnly || reader.id === config.hostId) && walk(owner.children).some((element) => element.kind === 'video-storyboards'),
        );
        if (!boardsOffered) throw new HttpError(404, 'No storyboards here');
        const roleIn = (board) => roleOf(board, reader, { hostId: config.hostId });
        const by = { id: reader.id, name: reader.name, email: reader.email };
        try {
          if (!boardId) {
            if (request.method === 'GET') {
              const boards = (await videoBoards.list(appId)).filter(roleIn);
              return json(boards.map((board) => ({
                id: board.id, title: board.title, role: roleIn(board), scenes: board.scenes.length, cuts: board.cuts.length,
                updatedAt: board.updatedAt, updatedBy: board.updatedBy,
              })));
            }
            if (request.method === 'POST') {
              requireHost(config, reader); // only the host starts a board
              const input = await body(request);
              if (typeof input.title !== 'string' || Object.keys(input).some((key) => !['title', 'project'].includes(key))) {
                throw new HttpError(400, 'Body must be { "title": "...", "project": "..." }');
              }
              return json(await videoBoards.put(appId, { title: input.title, project: input.project ?? '', scenes: [], cuts: [] }, { owner: reader.id, by: reader.name }), 201);
            }
            throw new HttpError(404, 'Unknown API route');
          }
          const board = await videoBoards.get(appId, boardId);
          const role = board ? roleIn(board) : null;
          if (!role) throw new HttpError(404, `Unknown board: ${boardId}`);
          if (!kind && request.method === 'GET') return json({ ...board, role });
          if (!kind && request.method === 'PATCH') {
            const input = await body(request);
            if (!Array.isArray(input.ops) || Object.keys(input).length !== 1) throw new HttpError(400, 'Body must be { "ops": [...] }');
            const { board: next, added } = await videoBoards.change(appId, boardId, input.ops, { by, role });
            return json({ ...next, role, added });
          }
          if (!kind && request.method === 'DELETE') {
            if (role !== 'owner') throw new HttpError(403, 'Only the board\'s owner may delete it');
            return json(await videoBoards.remove(appId, boardId));
          }
          if (kind === 'files' && item && request.method === 'GET') {
            const found = await videoBoards.getFile(appId, boardId, item);
            if (!found) throw new HttpError(404, `Unknown file: ${item}`);
            return new Response(found.bytes, {
              status: 200,
              headers: { 'content-type': found.metadata?.type ?? 'application/octet-stream', 'cache-control': 'private, max-age=3600' },
            });
          }
          // A picture of your own for a scene: anyone who may change the board uploads it, the server names the
          // file (up-…, so no one can point a scene at a file the team made for another), and it goes on the
          // scene as an own-picture change, so the same rules decide it as every other change.
          if (kind === 'pictures' && item && request.method === 'POST') {
            const aspect = url.searchParams.get('aspect');
            if (!ASPECTS.includes(aspect)) throw new HttpError(400, 'Say ?aspect=9x16 or ?aspect=16x9');
            if (!board.scenes.some((s) => s.id === item)) throw new HttpError(400, 'Name a scene on this board');
            const type = (request.headers.get('content-type') ?? '').split(';')[0].trim();
            const ext = OWN_PICTURE_TYPES[type];
            if (!ext) throw new HttpError(400, 'A picture is a JPEG, PNG or WebP');
            const bytes = new Uint8Array(await request.arrayBuffer());
            const name = `up-${item}-${aspect}-${Date.now().toString(36)}${createHash('sha256').update(bytes).digest('hex').slice(0, 6)}.${ext}`.slice(0, 99);
            await videoBoards.putFile(appId, boardId, name, bytes, { type });
            const { board: next } = await videoBoards.change(appId, boardId, [{ op: 'own-picture', scene: item, aspect, file: name }], { by, role });
            return json({ ...next, role, file: name }, 201);
          }
          if (kind === 'jobs' && !item && request.method === 'GET') {
            return json(await videoStudio.listJobs(appId, { board: boardId }));
          }
          if (kind === 'notes' && !item && request.method === 'POST') {
            const input = await body(request);
            if (Object.keys(input).some((key) => !['text', 'replace', 'ask'].includes(key))) throw new HttpError(400, 'Body must be { "text": "...", "replace"?: true, "ask"?: false }');
            return json(await takeNotes(appId, boardId, input, { by, role, held: reader.id !== config.hostId }), 201);
          }
          if (kind === 'jobs' && !item && request.method === 'POST') {
            const input = await body(request);
            const { step, scene, scenes, cut, note = '' } = input;
            if (typeof step !== 'string' || Object.keys(input).some((key) => !['step', 'scene', 'scenes', 'cut', 'note'].includes(key))) {
              throw new HttpError(400, 'Body must be { "step": "...", "scene"?: "...", "scenes"?: [...], "cut"?: "...", "note"?: "..." }');
            }
            if (!BOARD_STEP_NAMES.includes(step)) throw new HttpError(400, `A storyboard job's step is one of ${BOARD_STEP_NAMES.join(', ')}`);
            if (step === 'batch') {
              if (!Array.isArray(scenes) || !scenes.length || scenes.length > BOARD_LIMITS.batch || scenes.some((id) => !board.scenes.some((s) => s.id === id))) {
                throw new HttpError(400, `Name 1 to ${BOARD_LIMITS.batch} scenes on this board`);
              }
            } else if (step === 'render' ? !board.cuts.some((c) => c.id === cut) : !board.scenes.some((s) => s.id === scene)) {
              throw new HttpError(400, step === 'render' ? 'Name a cut on this board' : 'Name a scene on this board');
            }
            return json(await videoStudio.createBoardJob(appId, {
              board: boardId, ...(step === 'render' ? { cut } : step === 'batch' ? { scenes } : { scene }), step, note, by: reader.name || reader.id,
              held: reader.id !== config.hostId,
            }), 201);
          }
          if (kind === 'jobs' && item && request.method === 'POST') {
            requireHost(config, reader); // only the host lets a job run on the Mac
            const input = await body(request);
            if (typeof input.release !== 'boolean' || Object.keys(input).length !== 1) throw new HttpError(400, 'Body must be { "release": true or false }');
            const job = (await videoStudio.listJobs(appId, { board: boardId })).find((candidate) => candidate.id === item);
            if (!job) throw new HttpError(404, `Unknown job: ${item}`);
            return json(await videoStudio.decideJob(appId, item, { release: input.release, by: reader.name || reader.id }));
          }
        } catch (error) {
          if (error instanceof BoardError) throw new HttpError(400, error.message);
          throw error;
        }
        throw new HttpError(404, 'Unknown API route');
      }

      const dataMatch = route.match(/^data\/([^/]+)(?:\/([^/]+))?$/);
      if (dataMatch) {
        const name = decodeURIComponent(dataMatch[1]);
        const rowId = dataMatch[2] ? decodeURIComponent(dataMatch[2]) : null;
        if (request.method === 'GET' && !rowId) {
          return json((await readable(await liveSketch(store, appId), name)).rows);
        }
        if (request.method === 'POST' && !rowId) {
          const row = await prepareDataRow(
            store,
            appId,
            name,
            await body(request),
            identity,
            isHost,
          );
          return json(await store.add(appId, name, row, identity.id), 201);
        }
        if (request.method === 'DELETE' && rowId) {
          // Someone other than the host removes a row only through a
          // removes-from action they can see in the live description; a
          // private row needs one even for the host, and only its author may.
          const sketch = await liveSketch(store, appId);
          const level = stricter(sketch.data[name]?.read, (await store.privacyLevels(appId))[name]);
          if (!isHost || level === 'private') {
            const visible = [...visibleActions(sketch, isHost)].some(
              ({ action }) => action.type === 'remove' && action.target === name,
            );
            if (!visible) throw new HttpError(403, `No action lets you remove rows from ${name}`);
          }
          return json(await store.remove(appId, name, rowId, identity.id));
        }
        if (request.method === 'PUT' && rowId) {
          // Puppet v0.5: the live version has a script-editor of this field
          // on a screen from this data that the reader can see; the value is
          // text of at most MAX_EDIT_LENGTH characters; and the store lets
          // only the row's author change it.
          const input = await body(request);
          const { field, value } = input;
          if (typeof field !== 'string' || typeof value !== 'string' || Object.keys(input).length !== 2) {
            throw new HttpError(400, 'Body must be { "field": "...", "value": "..." }');
          }
          if (value.length > MAX_EDIT_LENGTH) {
            throw new HttpError(413, `A script may be at most ${MAX_EDIT_LENGTH} characters`);
          }
          const sketch = await liveSketch(store, appId);
          const editable = [...sketch.screens, ...sketch.dialogs].some(
            (owner) =>
              owner.from === name &&
              (!owner.hostOnly || isHost) &&
              walk(owner.children).some((element) => element.kind === 'script-editor' && element.field === field),
          );
          if (!editable) throw new HttpError(403, `No script editor of ${name}.${field} here`);
          return json(await store.edit(appId, name, rowId, field, value, identity.id));
        }
        if (request.method === 'PATCH' && rowId) {
          requireHost(config, identity);
          const input = await body(request);
          if (!STATUSES.includes(input.status) || Object.keys(input).length !== 1) {
            throw new HttpError(400, `Body must be { "status": "${STATUSES.join('" or "')}" }`);
          }
          const sketch = await liveSketch(store, appId);
          const allowed = [...visibleActions(sketch, true)].some(
            ({ action, element }) =>
              action.type === 'set-status' &&
              action.status === input.status &&
              element.rowOf === name &&
              element.hostOnly,
          );
          if (!allowed) {
            throw new HttpError(400, `No sets status "${input.status}" action on ${name}`);
          }
          return json(await store.setStatus(appId, name, rowId, input.status, identity.id));
        }
      }

      throw new HttpError(404, 'Unknown API route');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof PuppetParseError) {
        return json({ error: error.message, details: error.errors }, 400);
      }
      const message = error instanceof Error ? error.message : 'Request failed';
      const status = /Only the /.test(message) ? 403 : /^Unknown row/.test(message) ? 404 : 400;
      return json({ error: message }, status);
    }
  };
}

// Under `netlify dev` the x-dev-user identities are made up, so the real
// host's account id can never sign in there. An app may name a devHostId for
// that case. It applies only when NETLIFY_DEV is exactly 'true', the same
// rule that gates x-dev-user, so the live site always uses hostId.
export function resolveApps(apps, env = process.env) {
  if (env.NETLIFY_DEV !== 'true') return apps;
  return Object.fromEntries(
    Object.entries(apps).map(([appId, config]) => [
      appId,
      config.devHostId ? { ...config, hostId: config.devHostId } : config,
    ]),
  );
}

// The Blobs stores are made for each request, never kept on a warm instance:
// getStore() takes the invocation's Blobs token, and that token expires, so a
// store kept across requests fails with "Failed to decode token: Token
// expired" (seen live, 2026-10-21). The app configuration is kept.
// Stage Read's counters and audio cache in Netlify Blobs. A reservation lands
// only if the counter is unchanged since it was read (etag), and is retried on
// fresh data otherwise, so parallel lines cannot all pass one allowance. The
// netlify dev sandbox returns no etags; there a counter is written as read.
export function blobCounters(blobs) {
  async function change(key, delta, limit) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const stored = await blobs.getWithMetadata(key, { type: 'json', consistency: 'strong' });
      const next = Number(stored?.data ?? 0) + delta;
      if (limit !== undefined && next > limit) return false;
      let conditions = { onlyIfNew: true };
      if (stored) conditions = stored.etag ? { onlyIfMatch: stored.etag } : {};
      const { modified } = await blobs.setJSON(key, Math.max(0, next), conditions);
      if (modified) return true;
    }
    return false;
  }
  return {
    reserve: (key, amount, limit) => change(key, amount, limit),
    release: (key, amount) => change(key, -amount),
    async getAudio(key) {
      const buffer = await blobs.get(key, { type: 'arrayBuffer', consistency: 'strong' });
      return buffer ? new Uint8Array(buffer) : null;
    },
    setAudio: (key, bytes) => blobs.set(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

export function createApiFunction({
  getStoreImpl = getStore,
  env = process.env,
  fetchImpl = globalThis.fetch,
  stageReadLimits = DEFAULT_LIMITS,
  videoReadLimits = VIDEO_LIMITS,
} = {}) {
  let apps;
  const verifyIdentity = createIdentityVerifier({ env });
  return async function handler(request) {
    apps ??= resolveApps(JSON.parse(
      await readFile(new URL('../apps.json', import.meta.url), 'utf8'),
    ), env);
    return createApiHandler({
      apps,
      store: createBlobsStore(apps, {
        blobStore: getStoreImpl({ name: 'soma-puppet-runtime', consistency: 'strong' }),
      }),
      verifyIdentity,
      readSeed: (appId) =>
        readFile(new URL(`../../examples/${appId}.puppet`, import.meta.url), 'utf8'),
      feedbackStore: getStoreImpl({ name: 'soma-puppet-feedback', consistency: 'strong' }),
      stageReader: createStageReader({
        apiKey: env.ELEVENLABS_API_KEY,
        fetch: fetchImpl,
        store: blobCounters(getStoreImpl({ name: 'soma-stage-read', consistency: 'strong' })),
        limits: stageReadLimits,
      }),
      // The narration read (v0.5) shares Stage Read's store; its keys start video/.
      videoReader: createVideoReader({
        apiKey: env.ELEVENLABS_API_KEY,
        fetch: fetchImpl,
        store: blobCounters(getStoreImpl({ name: 'soma-stage-read', consistency: 'strong' })),
        limits: videoReadLimits,
      }),
      // Puppet v0.6: VideoMaker's assets and jobs, and the team key the Mac's worker signs with.
      videoStudio: createVideoStudio({ blobs: getStoreImpl({ name: 'soma-video-studio', consistency: 'strong' }) }),
      // Puppet v0.7: storyboards, in the same store.
      videoBoards: createBoardStore({ blobs: getStoreImpl({ name: 'soma-video-studio', consistency: 'strong' }) }),
      teamKey: env.STUDIO_TEAM_KEY ?? '',
    })(request);
  };
}

export default createApiFunction();
