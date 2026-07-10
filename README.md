# SOMA Platform Monorepo

This is the SOMA platform monorepo — the canonical home for shared UI widget engines used across SOMA-affiliated sites.

## Packages

- **`packages/soma-assist-core/`** — Shared Shadow DOM chip/chat window used by Adrian and Yeshie.
- **`packages/soma-guide/`** — The Adrian tour/assistant engine (internal package name retained). Per-site configs and audio live in each consuming site.
- **`packages/adrian-extension/`** — Minimal MV3 wrapper that installs Adrian on HTTP(S) pages.

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
