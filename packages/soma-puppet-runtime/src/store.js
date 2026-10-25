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

  edit(_appId, _data, _rowId, _field, _value, _actor) {
    throw new Error('Not implemented');
  }

  setStatus(_appId, _data, _rowId, _status, _actor) {
    throw new Error('setStatus is not implemented');
  }

  privateData(_appId) {
    throw new Error('privateData is not implemented');
  }

  privacyLevels(_appId) {
    throw new Error('privacyLevels is not implemented');
  }

  pullDoc(_appId, _data, _author, _pull) {
    throw new Error('pullDoc is not implemented');
  }

  docPull(_appId, _data, _author) {
    throw new Error('docPull is not implemented');
  }
}

export class PuppetParseError extends Error {
  constructor(errors) {
    super(`Puppet Script was refused with ${errors.length} parse error(s)`);
    this.name = 'PuppetParseError';
    this.errors = structuredClone(errors);
  }
}

// Puppet v0.3 and v0.4 row rules, shared by MemoryStore and BlobsStore.
export const STATUSES = ['confirmed', 'declined'];

// Who reads a collection, from least to most private: everyone, read: own
// (each person their own rows, the host all), read: private (each person
// their own rows, the host included).
const LEVELS = [undefined, 'own', 'private'];
export const stricter = (a, b) => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);

// Privacy only tightens: the strictest read: an approved version ever gave a
// collection name stays, through undo, redo and declaring the name again.
export function rememberPrivacy(app, sketch) {
  for (const [name, declaration] of Object.entries(sketch.data)) {
    if (declaration.read) (app.private ??= {})[name] = stricter(app.private?.[name], declaration.read);
  }
}

// The read rule in force for a collection: 'private', 'own', or undefined.
export function isPrivate(app, sketch, data) {
  return stricter(sketch?.data[data]?.read, app.private?.[data]);
}

// A private row's id is unguessable and does not reveal how many rows exist.
export function newRow(app, row, author, { privateRow, approval }) {
  return {
    id: privateRow ? `r-${crypto.randomUUID()}` : `r${app.nextRowId++}`,
    row: approval ? { ...structuredClone(row), status: 'pending' } : structuredClone(row),
    author,
  };
}

export function checkRemove(entry, actor, hostId, privateRow) {
  // A read: private row is its author's alone: anyone else, the host included,
  // is answered as if it did not exist.
  if (privateRow === 'private' && entry.author !== actor) throw new Error(`Unknown row: ${entry.id}`);
  if (entry.author !== actor && hostId !== actor) {
    // Someone else's private row answers like a missing one.
    if (privateRow) throw new Error(`Unknown row: ${entry.id}`);
    throw new Error('Only the row author or app host may remove this row');
  }
  if (entry.doc) throw new Error(PEN);
  if (actor !== hostId && entry.row.status !== undefined && entry.row.status !== 'pending') {
    throw new Error('Only the host may remove a row that is already confirmed or declined');
  }
}

// v0.10: a row brought in from a Google Doc changes only by its writer's next pull.
export const PEN = 'This scene comes from your Google Doc. Change it in the Doc, then pull again.';

// One pull, in one write: every row this writer brought in from a Doc into this data is replaced by
// the new scenes, in the Doc's order, after the rows they added in the app. The server marks them
// (entry.doc); a client never sets that. Returns the writer's pull record.
export function applyPull(app, rows, sketch, data, author, { doc, scenes }, now = new Date()) {
  const declaration = sketch?.data[data];
  if (!declaration) throw new Error(`Unknown data: ${data}`);
  for (const scene of scenes) {
    const undeclared = Object.keys(scene).filter((field) => !declaration.fields.includes(field));
    if (undeclared.length) throw new Error(`Undeclared field(s) for ${data}: ${undeclared.join(', ')}`);
  }
  const kept = rows.filter((entry) => !(entry.doc && entry.author === author));
  const fresh = scenes.map((scene) => ({ ...newRow(app, scene, author, { privateRow: true, approval: false }), doc: true }));
  rows.splice(0, rows.length, ...kept, ...fresh);
  const record = { id: doc.id, name: doc.name, pulledAt: now.toISOString(), scenes: scenes.length };
  ((app.pulls ??= {})[data] ??= {})[author] = record;
  return structuredClone(record);
}

export function applyStatus(entry, sketch, data, status, level, actor) {
  if (level === 'private' && entry.author !== actor) throw new Error(`Unknown row: ${entry.id}`);
  if (!sketch?.data[data]?.fields?.includes('status')) {
    throw new Error(`Data ${data} has no status field`);
  }
  if (!STATUSES.includes(status)) {
    throw new Error(`Status must be ${STATUSES.join(' or ')}`);
  }
  entry.row.status = status;
  return { ...structuredClone(entry.row), id: entry.id };
}

// Puppet v0.5: a script-editor changes one declared field of a row, and only the row's author may.
// Status is never edited (only the host sets it). Someone else's private or own-only row answers like a
// missing one, as everywhere else.
export function applyEdit(entry, sketch, data, field, value, level, actor) {
  if (entry.author !== actor) {
    if (level) throw new Error(`Unknown row: ${entry.id}`);
    throw new Error('Only the row author may edit this row');
  }
  if (entry.doc) throw new Error(PEN);
  if (field === 'status') throw new Error('Only the host sets status');
  if (!sketch?.data[data]?.fields?.includes(field)) throw new Error(`Undeclared field for ${data}: ${field}`);
  if (typeof value !== 'string') throw new Error('The value must be text');
  entry.row[field] = value;
  return { ...structuredClone(entry.row), id: entry.id };
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
    rememberPrivacy(app, version.sketch);
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

  async list(appId, data, { author } = {}) {
    return this.#rows(this.#app(appId), data)
      .filter((entry) => author === undefined || entry.author === author)
      .map(({ id, row }) => ({
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

    const entry = newRow(app, row, author, {
      privateRow: isPrivate(app, current.sketch, data),
      approval: declaration.fields.includes('status'),
    });
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
    const current = app.versions.find(({ id }) => id === app.currentVersionId);
    checkRemove(rows[index], actor, this.#appConfigs[appId]?.hostId, isPrivate(app, current?.sketch, data));

    const [{ id, row }] = rows.splice(index, 1);
    return { ...structuredClone(row), id };
  }

  async edit(appId, data, rowId, field, value, actor) {
    const app = this.#app(appId);
    const current = app.versions.find(({ id }) => id === app.currentVersionId);
    const entry = this.#rows(app, data).find(({ id }) => id === rowId);
    if (!entry) throw new Error(`Unknown row: ${rowId}`);
    return applyEdit(entry, current?.sketch, data, field, value, isPrivate(app, current?.sketch, data), actor);
  }

  async setStatus(appId, data, rowId, status, actor) {
    this.#requireHost(appId, actor);
    const app = this.#app(appId);
    const current = app.versions.find(({ id }) => id === app.currentVersionId);
    const entry = this.#rows(app, data).find(({ id }) => id === rowId);
    if (!entry) throw new Error(`Unknown row: ${rowId}`);
    return applyStatus(entry, current?.sketch, data, status, isPrivate(app, current?.sketch, data), actor);
  }

  async privateData(appId) {
    return Object.keys(this.#app(appId).private ?? {});
  }

  async privacyLevels(appId) {
    return structuredClone(this.#app(appId).private ?? {});
  }

  async pullDoc(appId, data, author, pull) {
    const app = this.#app(appId);
    const current = app.versions.find(({ id }) => id === app.currentVersionId);
    if (!current) throw new Error(`App ${appId} has no current version`);
    return applyPull(app, this.#rows(app, data), current.sketch, data, author, pull);
  }

  async docPull(appId, data, author) {
    return structuredClone(this.#app(appId).pulls?.[data]?.[author] ?? null);
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
