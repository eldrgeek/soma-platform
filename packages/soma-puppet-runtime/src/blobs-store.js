import { getStore } from '@netlify/blobs';

import { parse } from './parser.js';
import {
  applyEdit,
  applyPull,
  applyStatus,
  checkRemove,
  isPrivate,
  newRow,
  PuppetParseError,
  rememberPrivacy,
  StoreAdapter,
} from './store.js';

function emptyApp() {
  return {
    versions: [],
    currentVersionId: null,
    approvalHistory: [],
    rows: {},
    private: {},
    nextVersionId: 1,
    nextRowId: 1,
  };
}

// Deployed Netlify Blobs reads are eventually consistent by default: a read
// right after a write can return the old value for up to a minute. Every read
// here is strong, so a write is visible to the next request.
const STRONG = { consistency: 'strong' };

// Two function instances can update the same app at once. A write only lands
// if the blob is unchanged since it was read, and otherwise the update is
// re-run on fresh data, at most this many times.
const MAX_WRITE_ATTEMPTS = 5;

export class BlobsStore extends StoreAdapter {
  #appConfigs;
  #blobs;
  #updates = new Map();

  constructor(appConfigs = {}, { blobStore } = {}) {
    super();
    this.#appConfigs = appConfigs.apps ?? appConfigs;
    this.#blobs = blobStore ?? getStore({ name: 'soma-puppet-runtime', ...STRONG });
  }

  async getCurrent(appId) {
    const app = await this.#load(appId);
    const version = app.versions.find(({ id }) => id === app.currentVersionId);
    return version ? structuredClone(version) : null;
  }

  async listVersions(appId) {
    const app = await this.#load(appId);
    return structuredClone(app.versions);
  }

  async propose(appId, { source, author, reason }) {
    const parsed = parse(source);
    if (parsed.errors.length) throw new PuppetParseError(parsed.errors);

    return this.#update(appId, (app) => {
      const version = {
        id: `v${app.nextVersionId++}`,
        source,
        author,
        reason,
        status: 'proposed',
      };
      app.versions.push(version);
      return version.id;
    });
  }

  async approve(appId, versionId, approver) {
    this.#requireHost(appId, approver);
    return this.#update(appId, (app) => {
      const version = app.versions.find(({ id }) => id === versionId);
      if (!version) throw new Error(`Unknown version: ${versionId}`);
      const isUndone =
        version.status === 'approved' && !app.approvalHistory.includes(version.id);
      if (version.status !== 'proposed' && !isUndone) {
        throw new Error(`Version ${versionId} is not proposed`);
      }

      version.status = 'approved';
      version.approver = approver;
      app.currentVersionId = version.id;
      app.approvalHistory.push(version.id);
      rememberPrivacy(app, parse(version.source).sketch);
      return structuredClone(version);
    });
  }

  async undo(appId, approver) {
    this.#requireHost(appId, approver);
    return this.#update(appId, (app) => {
      if (app.approvalHistory.length < 2) {
        throw new Error(`App ${appId} has no previous approved version`);
      }
      app.approvalHistory.pop();
      app.currentVersionId = app.approvalHistory.at(-1);
      return structuredClone(
        app.versions.find(({ id }) => id === app.currentVersionId),
      );
    });
  }

  async list(appId, data, { author } = {}) {
    const app = await this.#load(appId);
    return this.#rows(app, data)
      .filter((entry) => author === undefined || entry.author === author)
      .map(({ id, row }) => ({
        ...structuredClone(row),
        id,
      }));
  }

  async add(appId, data, row, author) {
    return this.#update(appId, (app) => {
      const current = app.versions.find(({ id }) => id === app.currentVersionId);
      if (!current) throw new Error(`App ${appId} has no current version`);

      const parsed = parse(current.source);
      if (parsed.errors.length) throw new PuppetParseError(parsed.errors);
      const declaration = parsed.sketch.data[data];
      if (!declaration) throw new Error(`Unknown data: ${data}`);
      const undeclared = Object.keys(row).filter(
        (field) => !declaration.fields.includes(field),
      );
      if (undeclared.length) {
        throw new Error(`Undeclared field(s) for ${data}: ${undeclared.join(', ')}`);
      }

      const entry = newRow(app, row, author, {
        privateRow: isPrivate(app, parsed.sketch, data),
        approval: declaration.fields.includes('status'),
      });
      this.#rows(app, data).push(entry);
      return { ...structuredClone(entry.row), id: entry.id };
    });
  }

  async remove(appId, data, rowId, actor) {
    return this.#update(appId, (app) => {
      const rows = this.#rows(app, data);
      const index = rows.findIndex(({ id }) => id === rowId);
      if (index === -1) throw new Error(`Unknown row: ${rowId}`);
      checkRemove(rows[index], actor, this.#appConfigs[appId]?.hostId, isPrivate(app, this.#sketch(app), data));
      const [{ id, row }] = rows.splice(index, 1);
      return { ...structuredClone(row), id };
    });
  }

  async edit(appId, data, rowId, field, value, actor) {
    return this.#update(appId, (app) => {
      const entry = this.#rows(app, data).find(({ id }) => id === rowId);
      if (!entry) throw new Error(`Unknown row: ${rowId}`);
      const sketch = this.#sketch(app);
      return applyEdit(entry, sketch, data, field, value, isPrivate(app, sketch, data), actor);
    });
  }

  async setStatus(appId, data, rowId, status, actor) {
    this.#requireHost(appId, actor);
    return this.#update(appId, (app) => {
      const entry = this.#rows(app, data).find(({ id }) => id === rowId);
      if (!entry) throw new Error(`Unknown row: ${rowId}`);
      const sketch = this.#sketch(app);
      return applyStatus(entry, sketch, data, status, isPrivate(app, sketch, data), actor);
    });
  }

  async privateData(appId) {
    return Object.keys((await this.#load(appId)).private ?? {});
  }

  async privacyLevels(appId) {
    return structuredClone((await this.#load(appId)).private ?? {});
  }

  async pullDoc(appId, data, author, pull) {
    return this.#update(appId, (app) => {
      const sketch = this.#sketch(app);
      if (!sketch) throw new Error(`App ${appId} has no current version`);
      return applyPull(app, this.#rows(app, data), sketch, data, author, pull);
    });
  }

  async docPull(appId, data, author) {
    return structuredClone((await this.#load(appId)).pulls?.[data]?.[author] ?? null);
  }

  #sketch(app) {
    const current = app.versions.find(({ id }) => id === app.currentVersionId);
    return current ? parse(current.source).sketch : null;
  }

  async #load(appId) {
    return (await this.#blobs.get(this.#key(appId), { type: 'json', ...STRONG })) ?? emptyApp();
  }

  async #update(appId, change) {
    const previous = this.#updates.get(appId) ?? Promise.resolve();
    const update = previous.catch(() => {}).then(async () => {
      const key = this.#key(appId);
      for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
        const stored = await this.#blobs.getWithMetadata(key, { type: 'json', ...STRONG });
        const app = stored?.data ?? emptyApp();
        const result = await change(app);
        // The netlify dev sandbox returns no etag on reads, so an existing
        // entry without one is written unconditionally. Deployed Blobs
        // always return one.
        let conditions = { onlyIfNew: true };
        if (stored) conditions = stored.etag ? { onlyIfMatch: stored.etag } : {};
        const { modified } = await this.#blobs.setJSON(key, app, conditions);
        if (modified) return result;
      }
      throw new Error(`App ${appId} changed during ${MAX_WRITE_ATTEMPTS} attempts to update it; try again`);
    });
    this.#updates.set(appId, update);
    try {
      return await update;
    } finally {
      if (this.#updates.get(appId) === update) this.#updates.delete(appId);
    }
  }

  #requireHost(appId, actor) {
    const hostId = this.#appConfigs[appId]?.hostId;
    if (!hostId || actor !== hostId) {
      throw new Error(`Only the host of ${appId} may perform this action`);
    }
  }

  #rows(app, data) {
    app.rows[data] ??= [];
    return app.rows[data];
  }

  #key(appId) {
    return `apps/${encodeURIComponent(appId)}.json`;
  }
}

export function createBlobsStore(appConfigs, options) {
  return new BlobsStore(appConfigs, options);
}
