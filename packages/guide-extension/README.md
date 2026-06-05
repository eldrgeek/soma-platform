# SOMA Guide — Ariadne (Chrome Extension)

Injects the SOMA guide widget into **any** web page on toolbar click. UC2 of Bill-as-product.

## What it does

Click the 🧵 toolbar button → Ariadne appears on the current tab. She greets you and offers to help navigate the page. Click again → she dismisses. Works on any site without pre-configuration.

## How to load (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this folder: `packages/guide-extension/`
5. The SOMA Guide icon appears in your toolbar

Suggested first test: navigate to **wolfeducationalconsulting.com**, click the toolbar button, confirm Ariadne's widget appears.

## How to rename the persona

Open `ariadne-config.js`. Change the one constant at the top:

```js
const PERSONA_NAME = 'Ariadne';   // ← change this
```

Reload the extension in `chrome://extensions`. Done.

## Bundle vs CDN

The engine (`soma-guide.js` + `soma-guide.css`) is **bundled** in `vendor/` for robustness — avoids page CSP and CORS issues with external script tags. Trade-off: you must manually copy updated engine files here when `packages/soma-guide/` changes.

Alternative: load from `https://soma-guide.netlify.app/soma-guide.js` via `scripting.executeScript({ func: ... })` with a dynamic `<script>` injection. This auto-updates but requires the page's CSP to allow that origin.

## Follow-ups

- **Distinct Ariadne voice**: provision her own ElevenLabs voice agent; update `voiceAgentId` in `ariadne-config.js`
- **Auto-mapper**: port Yeshie's perceive engine to scan a page's headings/links/roles and build a real `siteMap` + `walkthroughs` at runtime — inject before the engine
- **Site-aware hand-off**: if `window.SomaGuideConfig` already exists on the page (e.g. Bill on Legends, Proteus on Levinese), skip injection and let the native guide take over

## Architecture

```
toolbar click
  → background.js (service worker)
      → scripting.executeScript(ariadne-config.js, MAIN world)   # sets window.SomaGuideConfig
      → scripting.insertCSS(vendor/soma-guide.css)
      → scripting.executeScript(vendor/soma-guide.js, MAIN world) # mounts the widget
```

Permissions: `activeTab` + `scripting` only — no background host access, no `<all_urls>`.
