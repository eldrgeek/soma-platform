import { parse } from './parser.js';

export class StoreAdapter {
  getCurrent(_appId) {
    throw new Error('getCurrent is not implemented');
  }

  listVersions(_appId) {
    throw new Error('listVersions is not implemented');
  }

  propose(_appId, _proposal) {
    throw new Error('propose is not implemented');
  }

  approve(_appId, _versionId, _approver) {
    throw new Error('approve is not implemented');
  }

  undo(_appId, _approver) {
    throw new Error('undo is not implemented');
  }

  list(_appId, _data) {
    throw new Error('list is not implemented');
  }

  add(_appId, _data, _row, _author) {
    throw new Error('add is not implemented');
  }

  remove(_appId, _data, _rowId, _actor) {
    throw new Error('remove is not implemented');
  }
}

export class PuppetParseError extends Error {
  constructor(errors) {
    super(`Puppet Script was refused with ${errors.length} parse error(s)`);
    this.name = 'PuppetParseError';
    this.errors = structuredClone(errors);
  }
}

export class MemoryStore extends StoreAdapter {
  #appConfigs;
  #apps = new Map();

  constructor(appConfigs = {}) {
    super();
    this.#appConfigs = appConfigs.apps ?? appConfigs;
  }

  async getCurrent(appId) {
    const app = this.#app(appId);
    const version = app.versions.find(({ id }) => id === app.currentVersionId);
    return version ? this.#publicVersion(version) : null;
  }

  async listVersions(appId) {
    return this.#app(appId).versions.map((version) => this.#publicVersion(version));
  }

  async propose(appId, { source, author, reason }) {
    const parsed = parse(source);
    if (parsed.errors.length) {
      throw new PuppetParseError(parsed.errors);
    }

    const app = this.#app(appId);
    const version = {
      id: `v${app.nextVersionId++}`,
      source,
      author,
      reason,
      status: 'proposed',
      sketch: parsed.sketch,
    };
    app.versions.push(version);
    return version.id;
  }

  async approve(appId, versionId, approver) {
    this.#requireHost(appId, approver);
    const app = this.#app(appId);
    const version = app.versions.find(({ id }) => id === versionId);
    if (!version) {
      throw new Error(`Unknown version: ${versionId}`);
    }
    const isUndone =
      version.status === 'approved' && !app.approvalHistory.includes(version.id);
    if (version.status !== 'proposed' && !isUndone) {
      throw new Error(`Version ${versionId} is not proposed`);
    }

    version.status = 'approved';
    version.approver = approver;
    app.currentVersionId = version.id;
    app.approvalHistory.push(version.id);
    return this.#publicVersion(version);
  }

  async undo(appId, approver) {
    this.#requireHost(appId, approver);
    const app = this.#app(appId);
    if (app.approvalHistory.length < 2) {
      throw new Error(`App ${appId} has no previous approved version`);
    }

    app.approvalHistory.pop();
    app.currentVersionId = app.approvalHistory.at(-1);
    return this.getCurrent(appId);
  }

  async list(appId, data) {
    return this.#rows(this.#app(appId), data).map(({ id, row }) => ({
      ...structuredClone(row),
      id,
    }));
  }

  async add(appId, data, row, author) {
    const app = this.#app(appId);
    const current = app.versions.find(({ id }) => id === app.currentVersionId);
    if (!current) {
      throw new Error(`App ${appId} has no current version`);
    }

    const declaration = current.sketch.data[data];
    if (!declaration) {
      throw new Error(`Unknown data: ${data}`);
    }
    const undeclared = Object.keys(row).filter((field) => !declaration.fields.includes(field));
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
  }

  async remove(appId, data, rowId, actor) {
    const app = this.#app(appId);
    const rows = this.#rows(app, data);
    const index = rows.findIndex(({ id }) => id === rowId);
    if (index === -1) {
      throw new Error(`Unknown row: ${rowId}`);
    }
    if (rows[index].author !== actor && this.#appConfigs[appId]?.hostId !== actor) {
      throw new Error('Only the row author or app host may remove this row');
    }

    const [{ id, row }] = rows.splice(index, 1);
    return { ...structuredClone(row), id };
  }

  #app(appId) {
    if (!this.#apps.has(appId)) {
      this.#apps.set(appId, {
        versions: [],
        currentVersionId: null,
        approvalHistory: [],
        rows: new Map(),
        nextVersionId: 1,
        nextRowId: 1,
      });
    }
    return this.#apps.get(appId);
  }

  #publicVersion({ sketch: _sketch, ...version }) {
    return structuredClone(version);
  }

  #requireHost(appId, actor) {
    const hostId = this.#appConfigs[appId]?.hostId;
    if (!hostId || actor !== hostId) {
      throw new Error(`Only the host of ${appId} may perform this action`);
    }
  }

  #rows(app, data) {
    if (!app.rows.has(data)) {
      app.rows.set(data, []);
    }
    return app.rows.get(data);
  }
}

export function createMemoryStore(appConfigs) {
  return new MemoryStore(appConfigs);
}
