/**
 * Code + token generation.
 *
 * Extracted from vegas-connect/netlify/functions/lib/codes.js — unchanged
 * semantics, because live Vegas Connect and Revolution 1x1 member codes were
 * minted by exactly this alphabet and length. Changing either would break
 * existing printed/QR-encoded invite codes.
 */

/**
 * Web Crypto rather than `node:crypto`, so the same engine runs in a Netlify
 * function, a Deno edge worker, and a browser. That last one is not a
 * hypothetical: the demo at demo/ runs these exact handlers client-side, which
 * means the thing being demonstrated is the shipped code and not a mock of it.
 */
const webcrypto = globalThis.crypto;
if (!webcrypto?.getRandomValues) {
  throw new Error(
    'soma-onboard: no Web Crypto available. Node 18+, Deno, or a browser is required — ' +
      'invite codes must not fall back to Math.random().'
  );
}

function randomBytes(n) {
  return webcrypto.getRandomValues(new Uint8Array(n));
}

/** No 0/O/1/I — these codes get read aloud and hand-typed. */
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Short opaque invite code.
 * @param {number} [len]
 * @returns {string}
 */
export function generateCode(len = 8) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * A code that is not already taken in the store. Bounded retries: at 8 chars
 * over a 32-char alphabet the space is 2^40, so a collision means something is
 * wrong with the RNG and we want to fail loudly rather than spin.
 *
 * @param {{ getMemberByCode: (code: string) => Promise<unknown> }} store
 * @param {number} [len]
 * @returns {Promise<string>}
 */
export async function uniqueCode(store, len = 8) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode(len);
    const existing = await store.getMemberByCode(code);
    if (!existing) return code;
  }
  throw new Error('soma-onboard: could not mint a unique member code in 8 attempts');
}

export function newId() {
  if (webcrypto.randomUUID) return webcrypto.randomUUID();
  // Safari < 15.4 and non-secure contexts lack randomUUID; build a v4 by hand
  // from the same CSPRNG rather than reaching for a weaker source.
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newToken() {
  return base64url(randomBytes(32));
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Order a pair so member_a < member_b (uuid string compare), matching the
 * `check (member_a < member_b)` constraint in the schema.
 * @param {string} a
 * @param {string} b
 * @returns {[string, string]}
 */
export function orderPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

export function nowIso() {
  return new Date().toISOString();
}
