/**
 * Adrian content script — primary surface is soma-assist-core chip/chat.
 * Optionally boots the full guide engine (tours/voice) in the page MAIN world.
 */
(function () {
  'use strict';

  if (window.__adrianAssist) return;

  var create = window.createAssistChip;
  if (typeof create !== 'function') {
    console.warn('[Adrian] soma-assist-core not loaded');
    return;
  }

  var guideCss = window.__ADRIAN_GUIDE_CSS__ || '';

  var api = create({
    appId: 'adrian-extension',
    title: 'Adrian',
    avatar: '🧭',
    chipLabel: 'Ask Adrian',
    placeholder: 'Ask Adrian anything…',
    extraCss: guideCss ? ('.sac-msg--assistant{border-color:#c7d2fe;}') : '',
    initialMessages: [
      {
        role: 'assistant',
        content: "Hi — I'm Adrian. Ask me anything about this page, or request a walkthrough."
      }
    ],
    onUserMessage: function (text, chipApi) {
      chipApi.setStatus('Thinking…');
      /* Lightweight local reply; full guide engine can take over when injected. */
      setTimeout(function () {
        chipApi.setStatus('');
        var reply = localReply(text);
        chipApi.addMessage('assistant', reply);
      }, 280);
    }
  });

  window.__adrianAssist = api;

  function localReply(text) {
    var t = (text || '').toLowerCase();
    if (t.indexOf('hello') >= 0 || t.indexOf('hi') >= 0) {
      return "Hello! I'm Adrian, your on-page assistant. Try dragging my window or resizing from a corner.";
    }
    if (t.indexOf('tour') >= 0 || t.indexOf('walkthrough') >= 0) {
      return 'I can guide you around this site. Open me anytime via the chip in the corner.';
    }
    if (t.indexOf('help') >= 0) {
      return 'Type a question, drag the header to move me, resize from the edges, or hit − to minimize back to the chip. Position and size stick across reloads.';
    }
    return 'Got it: "' + text + '". (Full knowledge base answers are available when the Adrian guide engine is configured for this host.)';
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== 'adrian-toggle') return;
    if (api.isOpen()) api.close();
    else api.open();
  });
})();
