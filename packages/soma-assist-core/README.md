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

Build and test with `npm run build` and `npm test`. The build produces:

- `dist/soma-assist-core.js` / `.css` — chip/chat shell (now with ✎ feedback form)
- `dist/soma-script-runtime.js` — Supabase script registry + multi-page flows
- `dist/soma-assist-feedback.js` — route classifier + `assist_submit_feedback` client
- `dist/soma-assist-heartbeat.js` — install heartbeat client (`assist_record_heartbeat`)

### Feedback + routing

```js
const client = SomaAssistFeedback.createFeedbackClient({
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  boardWriter: async (card) => { /* optional local inbox write */ }
});

SomaAssistCore.createAssistChip({
  appId: 'yeshie',
  onFeedbackSubmit: (payload) => client.submit(payload),
  heartbeat: { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, appId: 'yeshie', version: '1.0.0' }
});
```

Classification routes each item to `yeshie`, `soma-guide` (Adrian), or `common`.

Authorship update: Mike Wolf + OpenAI Codex, 2026-07-10 WP3 feedback + fleet heartbeats.

Authorship update: Mike Wolf + OpenAI Codex, 2026-07-10 WP2 Supabase scripts
and multi-page navigation pass.

Authorship: Mike Wolf, implemented with OpenAI Codex on 2026-07-10 for WP1.
