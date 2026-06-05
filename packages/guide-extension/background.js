/**
 * Background service worker — handles toolbar click.
 *
 * On click: inject Ariadne's config, then the CSS and JS engine
 * into the active tab. All injection happens in the MAIN world so
 * window.SomaGuideConfig is readable by the engine.
 *
 * Idempotent: re-clicking while Ariadne is visible toggles her off
 * (the engine checks for an existing #soma-guide root and removes it).
 */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    // 1. Set the persona config in MAIN world before the engine loads.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['ariadne-config.js'],
    });

    // 2. Inject CSS (no world concept for CSS — applies globally).
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['vendor/soma-guide.css'],
    });

    // 3. Inject the engine in MAIN world so it can access window.SomaGuideConfig.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['vendor/soma-guide.js'],
    });
  } catch (err) {
    // Most common failure: restricted page (chrome://, chrome.google.com, etc.)
    console.warn('[SOMA Guide] Could not inject into tab:', err.message);
  }
});
