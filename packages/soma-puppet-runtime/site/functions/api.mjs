import { getStore } from '@netlify/blobs';
import { readFile } from 'node:fs/promises';

import { createBlobsStore } from '../../src/blobs-store.js';
import { PuppetParseError } from '../../src/store.js';
import { createIdentityVerifier, HttpError } from './auth.mjs';

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
      if (isWrite || !config.publicRead) identity = await verifyIdentity(request);

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

      const dataMatch = route.match(/^data\/([^/]+)(?:\/([^/]+))?$/);
      if (dataMatch) {
        const name = decodeURIComponent(dataMatch[1]);
        const rowId = dataMatch[2] ? decodeURIComponent(dataMatch[2]) : null;
        if (request.method === 'GET' && !rowId) {
          return json(await store.list(appId, name));
        }
        if (request.method === 'POST' && !rowId) {
          return json(await store.add(appId, name, await body(request), identity.id), 201);
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
