# SOMA Platform Monorepo

This is the SOMA platform monorepo — the canonical home for shared UI widget engines used across SOMA-affiliated sites.

## Packages

- **`packages/soma-guide/`** — The SOMA Guide tour overlay widget. Canonical engine; per-site configs (`*-guide-config.js`) and audio (`audio/tour/*.mp3`) live in each consuming site.

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

Update the engine in `packages/soma-guide/`, copy to `dist/`, commit and push. The CDN picks up the new dist automatically.
