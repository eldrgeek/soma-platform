/* soma-content — content store API for soma-edit.js
 *
 * Storage: GitHub Gist (keyed JSON, no SDK required)
 *   GITHUB_CONTENT_TOKEN  — Personal access token with gist scope
 *   SOMA_CONTENT_GIST_ID  — ID of the private gist holding the store
 *   SOMA_OWNER_SECRET     — The plain secret; SHA-256 of it is the write token
 *
 * GET  ?site=<siteId>&key=<contentKey>          → { content, versionCount }
 * PUT  { site, key, content, token }             → { ok } | { error }
 *
 * Versioned: keeps last 10 prior values per key
 */

const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function reply(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

/* Read the full gist store as a parsed object */
async function readStore(gistId, token) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'soma-content-function',
    },
  });
  if (!res.ok) throw new Error('gist read failed: ' + res.status);
  const gist = await res.json();
  const raw = gist.files['soma-content.json'] && gist.files['soma-content.json'].content;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

/* Write the full store object back to the gist */
async function writeStore(gistId, token, store) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'soma-content-function',
    },
    body: JSON.stringify({
      files: {
        'soma-content.json': { content: JSON.stringify(store, null, 2) },
      },
    }),
  });
  if (!res.ok) throw new Error('gist write failed: ' + res.status);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const gistId = process.env.SOMA_CONTENT_GIST_ID;
  const ghToken = process.env.GITHUB_CONTENT_TOKEN;
  const ownerSecret = process.env.SOMA_OWNER_SECRET;

  if (!gistId || !ghToken) {
    return reply(503, { error: 'content store not configured (missing SOMA_CONTENT_GIST_ID or GITHUB_CONTENT_TOKEN)' });
  }

  /* ── GET: read canonical content ──────────────────────────────────────── */
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const { site, key } = params;
    if (!site || !key) return reply(400, { error: 'site and key required' });

    let store;
    try { store = await readStore(gistId, ghToken); } catch (e) {
      return reply(502, { error: 'store read failed: ' + e.message });
    }

    const blobKey = site + '__' + key;
    const entry = store[blobKey];
    if (!entry) return reply(200, { content: null, versionCount: 0 });

    return reply(200, {
      content: entry.current !== undefined ? entry.current : null,
      versionCount: Array.isArray(entry.versions) ? entry.versions.length : 0,
    });
  }

  /* ── PUT: save canonical content (owner-only) ─────────────────────────── */
  if (event.httpMethod === 'PUT') {
    if (!ownerSecret) return reply(503, { error: 'owner auth not configured' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) {
      return reply(400, { error: 'invalid JSON body' });
    }

    const { site, key, content, token } = body;
    if (!site || !key || content === undefined) {
      return reply(400, { error: 'site, key, content required' });
    }

    /* Verify: token must be SHA-256(SOMA_OWNER_SECRET) */
    const expected = crypto.createHash('sha256').update(ownerSecret).digest('hex');
    if (!token || token !== expected) {
      return reply(403, { error: 'unauthorized' });
    }

    let store;
    try { store = await readStore(gistId, ghToken); } catch (e) {
      return reply(502, { error: 'store read failed: ' + e.message });
    }

    const blobKey = site + '__' + key;
    const existing = store[blobKey] || {};
    const versions = Array.isArray(existing.versions) ? existing.versions.slice() : [];
    if (existing.current !== undefined) {
      versions.push({ content: existing.current, savedAt: existing.updatedAt || null });
    }

    store[blobKey] = {
      current: content,
      updatedAt: new Date().toISOString(),
      versions: versions.slice(-10), /* keep last 10 for rollback */
    };

    try { await writeStore(gistId, ghToken, store); } catch (e) {
      return reply(502, { error: 'store write failed: ' + e.message });
    }

    return reply(200, { ok: true });
  }

  return reply(405, { error: 'method not allowed' });
};
