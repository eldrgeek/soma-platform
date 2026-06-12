/**
 * Background service worker — handles toolbar click + cross-navigation resume.
 *
 * Activation flow (toolbar click):
 *   1. Request host permission for the tab's origin (optional; graceful if denied).
 *   2. If granted, register ariadne-gate.js as a persistent content script for
 *      that origin so it fires on all subsequent same-origin page loads in ANY tab.
 *      sessionStorage gates it to the specific tab where the user activated Ariadne.
 *   3. Inject perceive.js → CSS → engine into the current tab (activeTab handles
 *      the first load regardless of host permission grant/deny).
 *   4. Set sessionStorage['somaAriadneActive']='1' + hook dismiss / mode tracking.
 *
 * Resume flow (subsequent same-domain navigations):
 *   ariadne-gate.js fires, sees active='1', sends {type:'ariadne-resume'}.
 *   background re-injects the engine and restores the saved open/minimized state.
 *
 * Toggle (toolbar click while Ariadne is already running):
 *   perceive.js detects window.somaGuide and toggles open ↔ minimize — no
 *   change needed here beyond the normal injection sequence.
 *
 * Dismiss (× button):
 *   patchAriadneSession hooks the close button to set active='0', so subsequent
 *   same-domain navigations in that tab do NOT re-inject. Toolbar click resets.
 */

/* ── Dev hot-reload ──────────────────────────────────────────────────────────
 * Polls watch.mjs (:27183) every 2s; reloads the extension when version bumps.
 * Fails silently when the watcher isn't running — safe in production.
 * Run `npm run dev` in packages/guide-extension to enable auto-reload.
 */
(function startDevReload() {
  let lastVersion = null;
  function poll() {
    fetch('http://localhost:27183/')
      .then(r => r.json())
      .then(({ version }) => {
        if (lastVersion === null) { lastVersion = version; return; }
        if (version !== lastVersion) { chrome.runtime.reload(); return; }
      })
      .catch(() => { /* watcher not running — no-op */ })
      .finally(() => { setTimeout(poll, 2000); });
  }
  poll();
})();

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function originFromTab(tab) {
  if (!tab || !tab.url) return null;
  try {
    const u = new URL(tab.url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin; // e.g. "https://wolfeducationalconsulting.com"
  } catch (_) { return null; }
}

async function ensureHostPermission(origin) {
  const perm = { origins: [origin + '/*'] };
  const already = await chrome.permissions.contains(perm);
  if (already) return true;
  return chrome.permissions.request(perm).catch(() => false);
}

async function ensureGateRegistered(origin) {
  const scriptId = 'ariadne-gate:' + origin;
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [scriptId] });
  if (existing.length > 0) return;
  await chrome.scripting.registerContentScripts([{
    id: scriptId,
    matches: [origin + '/*'],
    js: ['ariadne-gate.js'],
    world: 'ISOLATED',
    runAt: 'document_idle',
  }]);
}

/**
 * Inject perceive → CSS → engine → session patch into a tab.
 * @param {number} tabId
 * @param {boolean} resume  true when called from the gate (cross-nav), false on first click
 */
async function injectAriadne(tabId, resume) {
  // 1a. auto-mapper.js: exposes window.AutoMapper (rich DOM perception).
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['vendor/auto-mapper.js'],
  });

  // 1b. converter.js: exposes window.AutoMapperConverter (format adapters).
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['vendor/converter.js'],
  });

  // 1c. perceive.js: uses AutoMapper to build SomaGuideConfig, or toggles if already running.
  //     If window.SomaGuideConfig already exists (native/site-specific config), skips generation.
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['perceive.js'],
  });

  // 2. CSS (idempotent).
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ['vendor/soma-guide.css'],
  });

  // 3. Engine (guards itself against double-init via window.somaGuide check).
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['vendor/soma-guide.js'],
  });

  // 4. Set sessionStorage flag + hook dismiss + track open/minimized mode.
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: patchAriadneSession,
    args: [resume],
  });
}

/**
 * Runs in the page's MAIN world after engine injection.
 * Serialized by chrome.scripting — must be self-contained (no background closures).
 *
 * @param {boolean} isResume  true when called via ariadne-gate (cross-nav resume)
 */
function patchAriadneSession(isResume) {
  // Always assert the active flag (toolbar click re-activates after a dismiss).
  sessionStorage.setItem('somaAriadneActive', '1');

  const guide = window.somaGuide;
  if (!guide) return;

  // Avoid re-patching if the engine is already wired (e.g. repeat toolbar click).
  if (guide._ariadnePatched) {
    // Still restore mode if this is a resume to a minimized state.
    if (isResume && sessionStorage.getItem('somaAriadneMode') === 'minimized') {
      guide.minimize();
    }
    return;
  }
  guide._ariadnePatched = true;

  // Restore open/minimized state on cross-nav resume.
  if (isResume && sessionStorage.getItem('somaAriadneMode') === 'minimized') {
    guide.minimize();
  } else if (!isResume) {
    sessionStorage.setItem('somaAriadneMode', 'open');
  }

  // Track minimize so subsequent navs restore the correct state.
  const origMinimize = guide._minimize.bind(guide);
  guide._minimize = function () {
    sessionStorage.setItem('somaAriadneMode', 'minimized');
    return origMinimize();
  };

  // Track open/expand.
  if (typeof guide.open === 'function') {
    const origOpen = guide.open.bind(guide);
    guide.open = function () {
      sessionStorage.setItem('somaAriadneMode', 'open');
      return origOpen();
    };
  }

  // Dismiss (×): sets active='0' → ariadne-gate won't fire on next nav.
  // Minimize-to-chip (─) is handled by _minimize above and does NOT clear active.
  const closeBtn = document.querySelector('.sg-btn-close');
  if (closeBtn) {
    // capture=true so we run before the engine's own click handler.
    closeBtn.addEventListener('click', function () {
      sessionStorage.setItem('somaAriadneActive', '0');
    }, true);
  }
}

/* ── Toolbar click ────────────────────────────────────────────────────────── */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    const origin = originFromTab(tab);

    if (origin) {
      // Request optional host permission for cross-navigation injection.
      // Gracefully degrades: if denied, Ariadne still works on this click via activeTab.
      const granted = await ensureHostPermission(origin);
      if (granted) {
        await ensureGateRegistered(origin);
      }
    }

    await injectAriadne(tab.id, false);
  } catch (err) {
    // Restricted pages (chrome://, extensions store, etc.) — fail silently.
    console.warn('[SOMA Guide] Could not inject into tab:', err.message);
  }
});

/* ── Cross-navigation resume ──────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'ariadne-resume') return;
  if (!sender.tab?.id) return;

  injectAriadne(sender.tab.id, true)
    .catch(err => console.warn('[SOMA Guide] Resume injection failed:', err.message));
});
