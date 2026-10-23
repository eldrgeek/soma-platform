/* soma-video server/boards.js: storyboards and their files, kept in Netlify Blobs (Puppet v0.7).
 *
 *   import { createBoardStore } from './boards.js';
 *   const boards = createBoardStore({ blobs, now });
 *
 * A storyboard (src/storyboard.js) is one JSON document; its pictures, the song and the rendered cuts are
 * files beside it. The same store as the video studio (soma-video-studio):
 *   boards/<app>/<boardId>.json            the board
 *   boardfiles/<app>/<boardId>/<name>      a file, with metadata { type, size, updatedAt }
 *
 * Who may do what is the caller's check (site/functions/api.mjs) with roleOf(): the board's owner and the
 * app's host may do anything, its artists (by the email they sign in with) may view and change it, and the
 * team on the Mac (the team key) sends pictures, renders and the song. Changes land only when the board is
 * unchanged since it was read (etag), and are retried on fresh data otherwise, so two people editing at
 * once both land.
 *
 * Written 2026-10-23 by Claude Opus 5.5 (CCc) for Mike Wolf.
 */
import { applyOps, BoardError, cleanBoard, FILE_NAME } from '../src/storyboard.js';
import { ASSET_TYPES, MAX_ASSET_BYTES } from './studio.js';

export { BoardError };

const segment = (value) => String(value).replace(/[^A-Za-z0-9._-]/g, '_');
const boardKey = (app, id) => `boards/${segment(app)}/${segment(id)}.json`;
const filePrefix = (app, id) => `boardfiles/${segment(app)}/${segment(id)}/`;

export function createBoardStore({ blobs, now = () => new Date(), newId = () => `b-${crypto.randomUUID()}` }) {
  async function read(app, id) {
    const stored = await blobs.getWithMetadata(boardKey(app, id), { type: 'json', consistency: 'strong' });
    return stored?.data ? { board: stored.data, etag: stored.etag } : null;
  }

  return {
    async get(app, id) {
      return (await read(app, id))?.board ?? null;
    },

    /** Every board, newest change first. The caller keeps those the reader may open. */
    async list(app) {
      const { blobs: found } = await blobs.list({ prefix: `boards/${segment(app)}/` });
      const out = [];
      for (const { key } of found) {
        const board = await blobs.get(key, { type: 'json', consistency: 'strong' });
        if (board) out.push(board);
      }
      return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    },

    /** A new board owned by `owner`, or (seed, team only) a whole board put in place under its own id. */
    async put(app, raw, { owner, by = '' } = {}) {
      const at = now().toISOString();
      const old = raw.id ? await read(app, raw.id) : null;
      const board = cleanBoard({ ...raw, id: raw.id ?? newId(), owner: owner ?? old?.board.owner ?? raw.owner, version: (old?.board.version ?? 0) + 1, updatedBy: by }, { at });
      if (old) board.createdAt = old.board.createdAt;
      await blobs.setJSON(boardKey(app, board.id), board);
      return board;
    },

    /** The board after ops (src/storyboard.js applyOps). Throws BoardError for a refused change. */
    async change(app, id, ops, { by, role }) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const found = await read(app, id);
        if (!found) throw new BoardError(`Unknown board: ${id}`);
        const next = applyOps(found.board, ops, { by, role, at: now().toISOString() });
        const added = next.added;
        delete next.added;
        const { modified } = await blobs.setJSON(boardKey(app, id), next, found.etag ? { onlyIfMatch: found.etag } : {});
        if (modified !== false) return { board: next, added };
      }
      throw new BoardError('The board kept changing; try again');
    },

    async remove(app, id) {
      const { blobs: files } = await blobs.list({ prefix: filePrefix(app, id) });
      for (const { key } of files) await blobs.delete(key);
      await blobs.delete(boardKey(app, id));
      return { removed: id };
    },

    async getFile(app, id, name) {
      if (!FILE_NAME.test(name)) return null;
      const found = await blobs.getWithMetadata(filePrefix(app, id) + name, { type: 'arrayBuffer', consistency: 'strong' });
      return found ? { bytes: found.data, metadata: found.metadata } : null;
    },

    /** Store a picture, the song or a render; same rules as an asset (name, type, at most MAX_ASSET_BYTES). */
    async putFile(app, id, name, bytes, { type }) {
      if (!FILE_NAME.test(name)) throw new BoardError('A file name is letters, digits, dot, dash and underscore');
      if (!ASSET_TYPES.has(type)) throw new BoardError(`A file's type must be one of ${[...ASSET_TYPES].join(', ')}`);
      if (!bytes?.byteLength) throw new BoardError('A file may not be empty');
      if (bytes.byteLength > MAX_ASSET_BYTES) throw new BoardError(`A file may be at most ${MAX_ASSET_BYTES} bytes`);
      if (!(await read(app, id))) throw new BoardError(`Unknown board: ${id}`);
      const metadata = { type, size: bytes.byteLength, updatedAt: now().toISOString() };
      await blobs.set(filePrefix(app, id) + name, bytes, { metadata });
      return { name, ...metadata };
    },

    async listFiles(app, id) {
      const prefix = filePrefix(app, id);
      const { blobs: found } = await blobs.list({ prefix });
      return found.map(({ key }) => key.slice(prefix.length)).sort();
    },
  };
}
