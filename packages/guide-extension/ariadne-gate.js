/**
 * Ariadne cross-navigation gate — runs in ISOLATED world at document_idle.
 *
 * Registered via chrome.scripting.registerContentScripts for any origin the
 * user has activated Ariadne on. sessionStorage is natively per-tab+origin,
 * so this flag is only '1' in tabs where the user explicitly summoned Ariadne.
 * Other tabs visiting the same domain start clean.
 */
if (sessionStorage.getItem('somaAriadneActive') === '1') {
  chrome.runtime.sendMessage({ type: 'ariadne-resume' });
}
