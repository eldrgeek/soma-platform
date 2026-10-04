/**
 * @param {string} search
 * @returns {string | null}
 */
export function safeNext(search) {
  let raw = null;
  try {
    raw = new URLSearchParams(search).get('next');
  } catch {
    return null;
  }
  if (!raw) return null;
  const value = raw.trim();
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  return value;
}

/**
 * @param {string} path
 * @returns {string}
 */
export function loginHref(path) {
  return `/login?next=${encodeURIComponent(path)}`;
}
