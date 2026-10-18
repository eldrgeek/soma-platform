import { getStore } from '@netlify/blobs';
import { readFile } from 'node:fs/promises';

import { createBlobsStore } from '../../src/blobs-store.js';
import { parse, walk } from '../../src/parser.js';
import { PuppetParseError } from '../../src/store.js';
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
  if (identity.id !== config.hostId) {
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
function templatePattern(template, identity) {
  const token = /\{([^}]+)\}/g;
  let pattern = '^';
  let offset = 0;
  for (const match of String(template).matchAll(token)) {
    pattern += escapeRegex(String(template).slice(offset, match.index));
    const name = match[1];
    const count = name.match(/^([\w-]+)\.count$/);
    if (name === 'me.name') {
      pattern += escapeRegex(Object.hasOwn(identity, 'name') ? identity.name : '');
    } else if (name.startsWith('form.')) {
      pattern += '[\\s\\S]*?';
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
  return new RegExp(pattern);
}

function matchesAction(input, action, identity) {
  const templates = action.row ?? {};
  const fields = Object.keys(templates);
  const inputFields = Object.keys(input);
  if (
    fields.length !== inputFields.length ||
    fields.some((field) => !Object.hasOwn(input, field))
  ) {
    return false;
  }
  return fields.every(
    (field) =>
      typeof input[field] === 'string' &&
      input[field].length <= MAX_FIELD_LENGTH &&
      templatePattern(templates[field], identity).test(input[field]),
  );
}

async function prepareDataRow(store, appId, name, input, identity) {
  const current = await store.getCurrent(appId);
  if (!current) throw new HttpError(400, `App ${appId} has no current version`);

  const parsed = parse(current.source);
  if (parsed.errors.length) throw new PuppetParseError(parsed.errors);
  const declaration = parsed.sketch.data[name];
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
  for (const owner of [...parsed.sketch.screens, ...parsed.sketch.dialogs]) {
    for (const element of walk(owner.children)) {
      for (const action of element.hook ?? []) {
        if (action.type !== 'add' || action.target !== name) continue;
        if (matchesAction(input, action, identity)) matched = true;
      }
    }
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
  async function seed(appId, config) {
    const versions = await store.listVersions(appId);
    if (versions.length) return;
    let source;
    try {
      source = await readSeed(appId);
    } catch {
      throw new HttpError(404, `No seed description for ${appId}`);
    }
    const versionId = await store.propose(appId, {
      source,
      author: config.hostId,
      reason: 'Initial seed',
    });
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
      let identity = null;
      if (isWrite || !config.publicRead || route === 'feedback') {
        identity = await verifyIdentity(request);
      }

      if (request.method === 'GET' && route === 'current') {
        await seed(appId, config);
        const current = await store.getCurrent(appId);
        if (!current) throw new HttpError(404, `App ${appId} has no current version`);
        return json({
          versionId: current.id,
          source: current.source,
          hostId: config.hostId,
        });
      }

      if (request.method === 'GET' && route === 'versions') {
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
          return json(await store.list(appId, name));
        }
        if (request.method === 'POST' && !rowId) {
          const row = await prepareDataRow(
            store,
            appId,
            name,
            await body(request),
            identity,
          );
          return json(await store.add(appId, name, row, identity.id), 201);
        }
        if (request.method === 'DELETE' && rowId) {
          return json(await store.remove(appId, name, rowId, identity.id));
        }
      }

      throw new HttpError(404, 'Unknown API route');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      if (error instanceof PuppetParseError) {
        return json({ error: error.message, details: error.errors }, 400);
      }
      const message = error instanceof Error ? error.message : 'Request failed';
      const status = /Only the /.test(message) ? 403 : 400;
      return json({ error: message }, status);
    }
  };
}

let defaultApi;

async function makeDefaultApi() {
  const apps = JSON.parse(
    await readFile(new URL('../apps.json', import.meta.url), 'utf8'),
  );
  return createApiHandler({
    apps,
    store: createBlobsStore(apps),
    verifyIdentity: createIdentityVerifier(),
    readSeed: (appId) =>
      readFile(new URL(`../../examples/${appId}.puppet`, import.meta.url), 'utf8'),
    feedbackStore: getStore('soma-puppet-feedback'),
  });
}

export default async function handler(request) {
  defaultApi ??= makeDefaultApi();
  return (await defaultApi)(request);
}
