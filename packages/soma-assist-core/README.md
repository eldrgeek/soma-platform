# @soma-platform/soma-assist-core

Shared floating **chip → chat window** UI for SOMA assistants (Yeshie, Adrian).

- Vanilla JS, no framework, no CDN deps
- Renders inside **Shadow DOM** (host styles cannot bleed in either direction)
- Works as an MV3 content script **and** a `<script>` embed
- Position + size persisted in `localStorage` under `soma-assist:<appId>:*`

## Build

```bash
cd packages/soma-assist-core
npm install
npm run build   # → dist/soma-assist-core.js + dist/soma-assist-core.css
npm test
```

## API

```js
const api = createAssistChip({
  appId: 'yeshie',           // storage namespace
  title: 'Yeshie',
  avatar: '✨',              // emoji or image URL
  placeholder: 'Ask…',
  onUserMessage(text, api) {
    api.addMessage('assistant', 'Got: ' + text);
  },
  // mount: document.body,   // optional
  // open: true | 'restore',
  // renderBody(mountEl, api) { … },  // custom body (hides default input)
});

api.open();
api.close();                 // minimize back to chip
api.addMessage('user' | 'assistant' | 'system', text);
api.setStatus('Thinking…');
api.destroy();
api.isOpen();
api.getState();              // { open, width, height, left, top, appId }
api.getMountEl();            // custom body container
```

Global exports: `window.createAssistChip`, `window.SomaAssistCore`.
