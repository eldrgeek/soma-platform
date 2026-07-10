/**
 * Adrian MV3 service worker — toolbar toggle + optional full guide engine inject.
 */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'adrian-toggle' });
  } catch (err) {
    /* Content script may not be injected yet (e.g. chrome:// pages). */
    console.warn('[Adrian] toggle failed:', err && err.message);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'adrian-inject-guide' && sender.tab?.id) {
    injectGuideEngine(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
});

async function injectGuideEngine(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    files: ['adrian-config.js', 'vendor/soma-guide.js'],
  });
}
