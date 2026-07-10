# SOMA Assist Core

Framework-free floating assistant shell shared by Adrian and Yeshie. It mounts
inside an open Shadow DOM, starts as a compact chip, and expands into a movable,
resizable chat window. Geometry is stored in `localStorage` under
`soma-assist:<appId>:geometry`.

```js
const assist = SomaAssistCore.createAssistChip({
  appId: 'my-assistant',
  title: 'My Assistant',
  avatar: '✨',
  onUserMessage(text) {
    return `Received: ${text}`;
  }
});

assist.open();
assist.addMessage('Welcome!', 'assistant');
assist.setStatus('Ready');
```

Build and test with `npm run build` and `npm test`. The build produces
`dist/soma-assist-core.js` (self-contained IIFE) and
`dist/soma-assist-core.css` (the corresponding standalone stylesheet).

`SomaScriptRuntime` is the companion dependency-free registry/runtime API used
by browser assistants. It provides a Supabase hostname client with a 15-minute
cache, lightweight version validation, offline fallback, and a storage-backed
multi-page flow state machine suitable for MV3 service workers.

Authorship update: Mike Wolf + OpenAI Codex, 2026-07-10 WP2 Supabase scripts
and multi-page navigation pass.

Authorship: Mike Wolf, implemented with OpenAI Codex on 2026-07-10 for WP1.
