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
  // Browsers strip tabs and newlines from URLs, so '/\t/evil' would become '//evil'.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/**
 * @param {string} path
 * @returns {string}
 */
export function loginHref(path) {
  return `/login?next=${encodeURIComponent(path)}`;
}
