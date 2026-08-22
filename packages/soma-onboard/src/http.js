/**
 * Transport-shaped helpers. The handlers speak a normalized
 * `{ httpMethod, headers, queryStringParameters, body }` request and return
 * `{ statusCode, headers, body }` — which is the Netlify Function shape, and
 * also trivially adaptable to Express/Hono/Deno (see netlify.js).
 */

export function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export const ok = (body) => json(200, body);
export const created = (body) => json(201, body);
export const badRequest = (message, extra = {}) => json(400, { error: message, ...extra });
export const unauthorized = (message = 'Unauthorized') => json(401, { error: message });
export const forbidden = (message = 'Forbidden') => json(403, { error: message });
export const notFound = (message = 'Not found') => json(404, { error: message });
export const methodNotAllowed = (allow = 'GET, POST') =>
  json(405, { error: 'Method not allowed' }, { Allow: allow });
export const tooManyRequests = (message = 'Too many requests', retryAfter = 60) =>
  json(429, { error: message }, { 'Retry-After': String(retryAfter) });
export const serverError = (message = 'Internal server error') => json(500, { error: message });

export function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? decodeBase64(event.body) : event.body);
  } catch {
    return null;
  }
}

/** Netlify base64-encodes binary bodies; browsers have atob, Node has Buffer. */
function decodeBase64(b64) {
  if (typeof atob === 'function') {
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function getBearerToken(headers = {}) {
  const auth = headers.authorization || headers.Authorization || headers.AUTHORIZATION || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(auth).trim());
  return m ? m[1].trim() : null;
}

export function isBlank(s) {
  return !s || !String(s).trim();
}

/**
 * Public projection of a member. Contact details are NOT in here — the network
 * graph, the invite landing page, and every unauthenticated seam use this, and
 * a leak there is a leak of someone's phone number to strangers.
 */
export function publicMember(m) {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    city: m.city ?? null,
    role: m.role,
    bio: m.bio ?? null,
    photo_url: m.photo_url ?? null,
    invited_by: m.invited_by ?? null,
    status: m.status,
    onboarding_complete: !!m.onboarding_complete,
    consent_at: m.consent_at ?? null,
    created_at: m.created_at,
  };
}

/** Self / inviter / admin views only. */
export function privateMember(m) {
  return { ...publicMember(m), email: m.email ?? null, phone: m.phone ?? null, is_admin: !!m.is_admin };
}
