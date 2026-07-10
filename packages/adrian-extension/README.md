# Adrian Chrome extension

Minimal Manifest V3 wrapper for the Adrian embed. It loads the shared
`soma-assist-core` artifact and the existing `soma-guide` engine as ordered
content scripts on ordinary HTTP(S) pages.

## Build and load

```bash
cd packages/soma-assist-core && npm run build
cd ../adrian-extension && npm run build
```

Load `packages/adrian-extension/` as an unpacked extension in Chrome.

Authorship: Mike Wolf, implemented with OpenAI Codex on 2026-07-10 for WP1.
