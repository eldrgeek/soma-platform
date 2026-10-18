import { getStore } from '@netlify/blobs';

import { parse } from './parser.js';
import { PuppetParseError, StoreAdapter } from './store.js';

function emptyApp() {
  return {
    versions: [],
    currentVersionId: null,
    approvalHistory: [],
    rows: {},
    nextVersionId: 1,
    nextRowId: 1,
  };
}

export class BlobsStore extends StoreAdapter {
  #appConfigs;
  #blobs;
  #updates = new Map();

  constructor(appConfigs = {}, { blobStore } = {}) {
    super();
    this.#appConfigs = appConfigs.apps ?? appConfigs;
    this.#blobs = blobStore ?? getStore('soma-puppet-runtime');
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

  async list(appId, data) {
    const app = await this.#load(appId);
    return this.#rows(app, data).map(({ id, row }) => ({
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

      const entry = {
        id: `r${app.nextRowId++}`,
        row: structuredClone(row),
        author,
      };
      this.#rows(app, data).push(entry);
      return { ...structuredClone(entry.row), id: entry.id };
    });
  }

  async remove(appId, data, rowId, actor) {
    return this.#update(appId, (app) => {
      const rows = this.#rows(app, data);
      const index = rows.findIndex(({ id }) => id === rowId);
      if (index === -1) throw new Error(`Unknown row: ${rowId}`);
      if (rows[index].author !== actor && this.#appConfigs[appId]?.hostId !== actor) {
        throw new Error('Only the row author or app host may remove this row');
      }
      const [{ id, row }] = rows.splice(index, 1);
      return { ...structuredClone(row), id };
    });
  }

  async #load(appId) {
    return (await this.#blobs.get(this.#key(appId), { type: 'json' })) ?? emptyApp();
  }

  async #update(appId, change) {
    const previous = this.#updates.get(appId) ?? Promise.resolve();
    const update = previous.catch(() => {}).then(async () => {
      const app = await this.#load(appId);
      const result = await change(app);
      await this.#blobs.setJSON(this.#key(appId), app);
      return result;
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
