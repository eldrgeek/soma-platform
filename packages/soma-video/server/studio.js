/* soma-video server/studio.js: a video script's assets and the jobs that make them (Puppet v0.6).
 *
 *   import { createVideoStudio, JOB_STEPS } from './studio.js';
 *   const studio = createVideoStudio({ blobs, now });
 *
 * VideoMaker shows each script's assets (pictures, cut pieces, the song) and lets its author ask the team
 * on Mike's Mac to make them. The page cannot reach the Mac, so it leaves a job here; the Mac's worker
 * (_estate/videomaker-worker in ~/Projects) reads the open jobs with the team key, runs each one with
 * Claude Code, uploads what it made as assets, and writes the outcome back on the job.
 *
 * Storage is one Netlify Blobs store:
 *   assets/<app>/<data>/<rowId>/<name>   the file, with metadata { type, size, kind, section, caption, ... }
 *   jobs/<app>/<jobId>                   JSON { id, data, rowId, field, step, note, by, status, log, report, ... }
 *
 * Written 2026-10-22 by Claude Opus 5.5 (CCc) for Mike Wolf, bead sp-h3i.
 */

import { JOB_STATUSES, JOB_STEPS, MAX_NOTE, STEP_NAMES } from '../src/jobs.js';

export { JOB_STATUSES, JOB_STEPS, MAX_NOTE, STEP_NAMES };

/** Asset names are one path segment: letters, digits, dot, dash and underscore. */
export const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
export const ASSET_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'video/mp4', 'application/json', 'text/plain']);
/** Netlify's synchronous functions take and return at most 6 MB; stay under it. */
export const MAX_ASSET_BYTES = 4_500_000;
const MAX_LOG_LINES = 40;
const META_FIELDS = ['kind', 'section', 'caption', 'prompter', 'maker', 'parent', 'piece', 'start', 'end'];

const segment = (value) => String(value).replace(/[^A-Za-z0-9._-]/g, '_');
const assetPrefix = (app, data, rowId) => `assets/${segment(app)}/${segment(data)}/${segment(rowId)}/`;
const jobKey = (app, id) => `jobs/${segment(app)}/${segment(id)}`;

function cleanMeta(meta = {}) {
  const out = {};
  for (const key of META_FIELDS) {
    const value = meta[key];
    if (typeof value === 'string') out[key] = value.slice(0, 500);
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * How far a running job has got: { label, done, total } (whole numbers, done at most total), or null to
 * clear it. A finished job keeps its last progress. Anything else is refused.
 */
export function cleanProgress(progress) {
  if (progress === null) return null;
  const { label = '', done, total } = progress ?? {};
  if (typeof label !== 'string' || !Number.isInteger(done) || !Number.isInteger(total) || total < 1 || done < 0 || done > total) {
    throw new Error('progress is { label, done, total } with whole numbers, 0 <= done <= total, or null');
  }
  return { label: label.slice(0, 200), done, total };
}

export function createVideoStudio({ blobs, now = () => new Date(), id = () => `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }) {
  async function listKeys(prefix) {
    const { blobs: found } = await blobs.list({ prefix });
    return found.map((entry) => entry.key);
  }

  return {
    async listAssets(app, data, rowId) {
      const prefix = assetPrefix(app, data, rowId);
      const keys = await listKeys(prefix);
      const out = [];
      for (const key of keys) {
        const found = await blobs.getMetadata(key, { consistency: 'strong' });
        if (found) out.push({ name: key.slice(prefix.length), ...found.metadata });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },

    async getAsset(app, data, rowId, name) {
      if (!ASSET_NAME.test(name)) return null;
      const found = await blobs.getWithMetadata(assetPrefix(app, data, rowId) + name, { type: 'arrayBuffer', consistency: 'strong' });
      return found ? { bytes: found.data, metadata: found.metadata } : null;
    },

    /** Store a file; refuses a bad name, an unknown type or a file over MAX_ASSET_BYTES. */
    async putAsset(app, data, rowId, name, bytes, { type, ...meta } = {}) {
      if (!ASSET_NAME.test(name)) throw new Error('An asset name is letters, digits, dot, dash and underscore');
      if (!ASSET_TYPES.has(type)) throw new Error(`Asset type must be one of ${[...ASSET_TYPES].join(', ')}`);
      if (!bytes?.byteLength) throw new Error('An asset may not be empty');
      if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error(`An asset may be at most ${MAX_ASSET_BYTES} bytes`);
      const metadata = { type, size: bytes.byteLength, updatedAt: now().toISOString(), ...cleanMeta(meta) };
      await blobs.set(assetPrefix(app, data, rowId) + name, bytes, { metadata });
      return { name, ...metadata };
    },

    async removeAsset(app, data, rowId, name) {
      if (!ASSET_NAME.test(name)) throw new Error('Unknown asset');
      await blobs.delete(assetPrefix(app, data, rowId) + name);
      return { removed: name };
    },

    /** A new job, queued. The caller has checked who may ask. */
    async createJob(app, { data, rowId, field, step, note = '', by }) {
      if (!STEP_NAMES.includes(step)) throw new Error(`A job's step is one of ${STEP_NAMES.join(', ')}`);
      if (typeof note !== 'string' || note.length > MAX_NOTE) throw new Error(`A note is text of at most ${MAX_NOTE} characters`);
      if (JOB_STEPS.find((s) => s.step === step).needsNote && !note.trim()) throw new Error('Say what you would like the team to do');
      const at = now().toISOString();
      const job = { id: id(), app, data, rowId, field, step, note: note.trim(), by, status: 'queued', log: [], report: '', createdAt: at, updatedAt: at };
      await blobs.setJSON(jobKey(app, job.id), job);
      return job;
    },

    async listJobs(app, { rowId, open } = {}) {
      const out = [];
      for (const key of await listKeys(`jobs/${segment(app)}/`)) {
        const job = await blobs.get(key, { type: 'json', consistency: 'strong' });
        if (!job) continue;
        if (rowId && job.rowId !== rowId) continue;
        if (open && !['queued', 'running'].includes(job.status)) continue;
        out.push(job);
      }
      return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    /** The worker's update: a status, log lines to add, a report. A finished job is not changed again. */
    async updateJob(app, jobId, { status, log, report, progress } = {}) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const stored = await blobs.getWithMetadata(jobKey(app, jobId), { type: 'json', consistency: 'strong' });
        if (!stored?.data) throw new Error(`Unknown job: ${jobId}`);
        const job = stored.data;
        if (['done', 'failed'].includes(job.status)) throw new Error(`Job ${jobId} is already ${job.status}`);
        if (status !== undefined && !JOB_STATUSES.includes(status)) throw new Error(`A status is one of ${JOB_STATUSES.join(', ')}`);
        const next = {
          ...job,
          ...(status ? { status } : {}),
          log: [...job.log, ...[].concat(log ?? []).map((line) => String(line).slice(0, 500))].slice(-MAX_LOG_LINES),
          ...(typeof report === 'string' ? { report: report.slice(0, 20000) } : {}),
          ...(progress !== undefined ? { progress: cleanProgress(progress) } : {}),
          updatedAt: now().toISOString(),
        };
        const { modified } = await blobs.setJSON(jobKey(app, jobId), next, stored.etag ? { onlyIfMatch: stored.etag } : {});
        if (modified !== false) return next;
      }
      throw new Error(`Job ${jobId} kept changing; try again`);
    },
  };
}
