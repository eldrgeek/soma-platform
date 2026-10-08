# soma-platform BREADCRUMBS

## What this project is
CDN host for the soma-guide widget. Netlify site: **soma-guide.netlify.app**
Netlify site ID: `be7dc842-106c-4aaa-8898-a46e36954b85` (created 2026-09-16; the old site f549d1d9 was deleted)
GitHub: https://github.com/eldrgeek/soma-platform

## Critical layout (Chesterton's fence)

```
soma-platform/
  dist/               ← Netlify PUBLISHES THIS DIRECTORY (publish = "dist")
    soma-guide.js     ← the widget engine served at soma-guide.netlify.app/soma-guide.js
    soma-guide.css    ← styles served at soma-guide.netlify.app/soma-guide.css
    _headers          ← CORS: Access-Control-Allow-Origin: *
  netlify.toml        ← MUST specify publish = "dist" (repo root is NOT published)
  packages/soma-guide/ ← source code; build output → dist/
```

**Never delete or misplace netlify.toml** — without it, Netlify defaults to publishing
the repo root, which doesn't have soma-guide.js, causing 404s on all consuming sites.

## Consuming sites
| Site | How it loads soma-guide |
|------|------------------------|
| legends-membership-site | `<script type="module" src="https://soma-guide.netlify.app/soma-guide.js">` |
| Levinese (Netlify ID 2ab17854) | same CDN URL |

## Deployment

**The site is git-linked to eldrgeek/soma-platform master** (site be7dc842,
created 2026-09-16, publish dir `dist`). Every push to master deploys the
committed `dist/` to every consuming site at once. The 2026-07-03 note that the
site was not linked described the old site f549d1d9, which has since been
deleted (corrected 2026-10-08, bead es-ymg). The release path is:

```bash
scripts/deploy-guide.sh               # build + sync packages -> dist; no deploy
scripts/deploy-guide.sh --draft       # sync, then deploy a draft URL to test on a consumer page
# commit dist/ and push to master: the push deploys it
scripts/deploy-guide.sh --verify-only # poll the CDN for the committed SOMA_GUIDE_VERSION
scripts/deploy-guide.sh --dry-run     # sync + show site id and version
```

The script pins the site id so a draft can never go to another site.

## Environment variables (on soma-guide Netlify site)
None required — this is a pure static CDN. No API keys, no functions.

## Related projects
- `~/Projects/legends-membership-site/` — per-site config at `js/legends-guide-config.js`
- `~/Projects/bill-talk/` — standalone ElevenLabs voice agent UI (separate Netlify site)
