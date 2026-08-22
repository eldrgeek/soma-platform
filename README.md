# SOMA Platform Monorepo

This is the SOMA platform monorepo — the canonical home for shared UI widget engines used across SOMA-affiliated sites.

## Packages

- **`packages/soma-assist-core/`** — Shared Shadow DOM chip/chat window used by Adrian and Yeshie.
- **`packages/soma-guide/`** — The Adrian tour/assistant engine (internal package name retained). Per-site configs (`*-guide-config.js`) and audio (`audio/tour/*.mp3`) live in each consuming site.
- **`packages/adrian-extension/`** — Minimal MV3 wrapper that installs Adrian on HTTP(S) pages.
- **`packages/soma-onboard/`** — `@soma/onboard`. Join a new person to a SOMA app by invitation: QR phone-to-phone plus email / text / social. Server engine + `<soma-invite-sheet>` custom element + a dependency-free QR encoder. Extracted 2026-07-22 from `vegas-connect` and `r1x1-app`. Unlike soma-guide this is **not** a CDN artifact — apps consume the package and keep their own federated tables (§15b). See its [README](packages/soma-onboard/README.md); run the demo with `npx http-server packages/soma-onboard -p 4181 -c-1` → `/demo/`.
- **`packages/soma-scaffolder/`** — The Soma Forge engine: validate a `*.soma.json` app spec, scaffold static or React apps (react-app mode clones `soma-app-template`), and provision. KB in `docs/soma-apps/`.

## Dist

The `dist/` directory contains the latest built artifacts ready for CDN/static hosting.

- `dist/soma-guide.js`
- `dist/soma-guide.css`

## Sites using soma-guide

| Site | Netlify ID | Notes |
|------|-----------|-------|
| legends-membership-site | 47a0da43 | Points to CDN URL |
| Levinese | 2ab17854 | Points to CDN URL |

## Contributing

Update the engine in `packages/soma-guide/` (bump `SOMA_GUIDE_VERSION`), then run:

```bash
scripts/deploy-guide.sh   # syncs package → dist, deploys, verifies the CDN
```

**`git push` does NOT deploy.** The soma-guide Netlify site is not linked to this repo (verified 2026-07-03: `build_settings.repo_url: None`). The only thing that updates the CDN is `netlify deploy --prod --dir dist`, which the script wraps with the site id pinned and a post-deploy CDN version check. Commit and push after deploying, for history.
