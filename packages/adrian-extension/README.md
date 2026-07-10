# Adrian Chrome Extension

Minimal MV3 wrapper that injects **Adrian** (chip/chat via `soma-assist-core`) on every page.

## Build / load

```bash
cd packages/adrian-extension
npm install
npm run sync    # vendor core + guide from sibling packages
```

Then Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → this directory.

## Files

| File | Role |
|------|------|
| `content.js` | Mounts `createAssistChip` as Adrian |
| `background.js` | Toolbar toggle |
| `vendor/soma-assist-core.js` | Shared UI core |
| `vendor/soma-guide.js` | Full engine (optional MAIN-world inject) |
