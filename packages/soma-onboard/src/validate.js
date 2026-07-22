/**
 * Input validation shared by every handler.
 *
 * The relationship rule is the fussy one and it earns its fussiness: the label
 * an inviter types ("wife", "cousin", "point guard") is rendered back into HTML
 * on the landing page and into SVG text in the network graph. Allowing letters,
 * digits, spaces and a short punctuation set keeps it expressive in any script
 * while refusing markup, control characters and symbol soup.
 */

import { RELATIONSHIP_MAX_LENGTH } from './invite-link.js';

export { RELATIONSHIP_MAX_LENGTH };

const NAME_MIN = 2;
const NAME_MAX = 120;
const EMAIL_MAX = 254;

/**
 * @param {unknown} value
 * @returns {{ value: string|null, error?: undefined } | { error: string, value?: undefined }}
 */
export function relationshipValue(value) {
  if (value == null || String(value).trim() === '') return { value: null };
  if (typeof value !== 'string') return { error: 'Invalid relationship' };

  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} &'’./-]*$/u.test(normalized)) {
    return { error: 'Invalid relationship' };
  }
  const safe = Array.from(normalized).slice(0, RELATIONSHIP_MAX_LENGTH).join('').trim();
  return { value: safe || null };
}

/**
 * Cheap bot/garbage filter on the two fields every spam script fills in.
 * @param {unknown} name
 * @param {unknown} email
 */
export function looksLikeBot(name, email) {
  const n = String(name || '');
  const e = String(email || '');
  if (!n.trim() || n.trim().length < NAME_MIN) return true;
  if (n.length > NAME_MAX) return true;
  if (e.length > EMAIL_MAX) return true;
  if (/\bhttps?:\/\//i.test(n)) return true;
  return false;
}

/** @param {unknown} value */
export function nameValue(value) {
  const name = value == null ? '' : String(value).trim();
  if (name.length < NAME_MIN) return { error: 'Name is required' };
  if (name.length > NAME_MAX) return { error: 'Name is too long' };
  return { value: name };
}

/** Deliberately permissive: we are not the authority on valid addresses. */
export function emailValue(value) {
  if (value == null || String(value).trim() === '') return { value: null };
  const email = String(value).trim();
  if (email.length > EMAIL_MAX) return { error: 'Email is too long' };
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return { error: 'Invalid email' };
  return { value: email };
}

export function phoneValue(value) {
  if (value == null || String(value).trim() === '') return { value: null };
  const phone = String(value).trim();
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return { error: 'Invalid phone number' };
  return { value: phone };
}

/**
 * @param {import('./config.js').OnboardConfig} cfg
 * @param {unknown} value
 */
export function roleValue(cfg, value) {
  const role = value == null ? '' : String(value).trim();
  if (!role) return { value: cfg.roles[0] };
  if (!cfg.roles.includes(role)) return { error: 'Unknown role' };
  return { value: role };
}
