import { getStore } from '@netlify/blobs';
import { readFile } from 'node:fs/promises';

import { createBlobsStore } from '../../src/blobs-store.js';
import { DAYS, guestSource, parse, walk } from '../../src/parser.js';
import { PuppetParseError, STATUSES } from '../../src/store.js';
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

function requireHost(config, identity) {
  if (identity?.id !== config.hostId) {
    throw new HttpError(403, 'Only the app host may perform this action');
  }
}

// A field longer than this is refused before matching, so a hostile body
// cannot make a template with several {form.*} tokens backtrack for long.
const MAX_FIELD_LENGTH = 10000;

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
}) {
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

      const dataMatch = route.match(/^data\/([^/]+)(?:\/([^/]+))?$/);
      if (dataMatch) {
        const name = decodeURIComponent(dataMatch[1]);
        const rowId = dataMatch[2] ? decodeURIComponent(dataMatch[2]) : null;
        if (request.method === 'GET' && !rowId) {
          const sketch = await liveSketch(store, appId);
          const declaration = sketch.data[name];
          if (!declaration) throw new HttpError(404, `Unknown data: ${name}`);
          let rows;
          if (declaration.read === 'own' || (await store.privateData(appId)).includes(name)) {
            const reader = await signedIn();
            rows = await store.list(
              appId,
              name,
              reader.id === config.hostId ? {} : { author: reader.id },
            );
          } else {
            rows = await store.list(appId, name);
          }
          if (declaration.fields.includes('status')) {
            rows = rows.map((row) => ({ ...row, status: row.status ?? 'pending' }));
          }
          return json(rows);
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
          // removes-from action they can see in the live description.
          if (!isHost) {
            const sketch = await liveSketch(store, appId);
            const visible = [...visibleActions(sketch, false)].some(
              ({ action }) => action.type === 'remove' && action.target === name,
            );
            if (!visible) throw new HttpError(403, `No action lets you remove rows from ${name}`);
          }
          return json(await store.remove(appId, name, rowId, identity.id));
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
export function createApiFunction({ getStoreImpl = getStore, env = process.env } = {}) {
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
    })(request);
  };
}

export default createApiFunction();
