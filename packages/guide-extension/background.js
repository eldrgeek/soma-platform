/**
 * Background service worker — handles toolbar click.
 *
 * On click:
 *   1. perceive.js (MAIN world) — runs perceive() on the live page, builds a
 *      site-aware SomaGuideConfig (dynamic greeting + walkthrough), and sets
 *      window.SomaGuideConfig. If the widget is already running, perceive.js
 *      handles the toggle (open ↔ minimize) and returns early.
 *   2. vendor/soma-guide.css — injected once (idempotent; browser deduplicates).
 *   3. vendor/soma-guide.js (MAIN world) — auto-inits from window.SomaGuideConfig
 *      only if window.somaGuide doesn't already exist (engine's own guard).
 *
 * The config sets autoStartWalkthrough so the engine opens straight into the
 * generated tour and speaks the first narration, giving audio on first open.
 */

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    // 1. Perceive page + set dynamic config (or toggle widget if already running).
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['perceive.js'],
    });

    // 2. Inject CSS (idempotent; no world concept for CSS).
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['vendor/soma-guide.css'],
    });

    // 3. Inject engine — creates window.somaGuide if not already present.
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
