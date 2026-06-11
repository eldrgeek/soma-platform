/* soma-content — content store API for soma-edit.js
 *
 * GET  ?site=<siteId>&key=<contentKey>        → { content, versionCount }
 * PUT  { site, key, content, token }           → { ok } | { error }
 *
 * Storage: Netlify Blobs (keyed by site__key)
 * Auth: token must equal SHA-256(SOMA_OWNER_SECRET) env var
 * Versioned: keeps last 10 prior versions per key
 */

const { getStore } = require('@netlify/blobs');
const crypto = require('crypto');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const store = getStore('soma-content');

  /* ── GET: read canonical content ─────────────────────────────────────────── */
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const { site, key } = params;
    if (!site || !key) return json(400, { error: 'site and key required' });

    const blobKey = site + '__' + key;
    const raw = await store.get(blobKey).catch(() => null);
    if (!raw) return json(200, { content: null, versionCount: 0 });

    let data;
    try { data = JSON.parse(raw); } catch (e) { return json(200, { content: null, versionCount: 0 }); }

    return json(200, {
      content: data.current !== undefined ? data.current : null,
      versionCount: Array.isArray(data.versions) ? data.versions.length : 0,
    });
  }

  /* ── PUT: save canonical content (owner-only) ────────────────────────────── */
  if (event.httpMethod === 'PUT') {
    const secret = process.env.SOMA_OWNER_SECRET;
    if (!secret) return json(503, { error: 'content store not configured (missing SOMA_OWNER_SECRET)' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (e) {
      return json(400, { error: 'invalid JSON body' });
    }

    const { site, key, content, token } = body;
    if (!site || !key || content === undefined) {
      return json(400, { error: 'site, key, content required' });
    }

    /* Verify owner token = SHA-256(SOMA_OWNER_SECRET) */
    const expected = crypto.createHash('sha256').update(secret).digest('hex');
    if (!token || token !== expected) {
      return json(403, { error: 'unauthorized' });
    }

    const blobKey = site + '__' + key;
    const raw = await store.get(blobKey).catch(() => null);
    let existing = null;
    if (raw) { try { existing = JSON.parse(raw); } catch (e) {} }

    const versions = existing && Array.isArray(existing.versions) ? existing.versions.slice() : [];
    if (existing && existing.current !== undefined) {
      versions.push({ content: existing.current, savedAt: existing.updatedAt || null });
    }

    const newData = {
      current: content,
      updatedAt: new Date().toISOString(),
      versions: versions.slice(-10), /* keep last 10 for rollback */
    };

    await store.set(blobKey, JSON.stringify(newData));
    return json(200, { ok: true });
  }

  return json(405, { error: 'method not allowed' });
};
