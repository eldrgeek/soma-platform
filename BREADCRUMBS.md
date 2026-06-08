# soma-platform BREADCRUMBS

## What this project is
CDN host for the soma-guide widget. Netlify site: **soma-guide.netlify.app**
Netlify site ID: `f549d1d9-b1d5-4995-92af-df78e5721c2a`
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
```
git push origin fix/ask-bill  # then open PR → merge → Netlify auto-deploys
# OR if on main already:
git push origin main
```
Netlify auto-deploys on push to the connected branch.

## Environment variables (on soma-guide Netlify site)
None required — this is a pure static CDN. No API keys, no functions.

## Related projects
- `~/Projects/legends-membership-site/` — per-site config at `js/legends-guide-config.js`
- `~/Projects/bill-talk/` — standalone ElevenLabs voice agent UI (separate Netlify site)
