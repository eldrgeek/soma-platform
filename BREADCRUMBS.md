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

**The site is NOT linked to the GitHub repo** (verified 2026-07-03:
`build_settings.repo_url: None` via the Netlify API). There is no push-to-deploy;
`git push` changes nothing on the CDN. THE deploy path is:

```bash
scripts/deploy-guide.sh            # sync package → dist, deploy, verify CDN
scripts/deploy-guide.sh --dry-run  # everything except deploy + verification
```

The script hardcodes the site id (`f549d1d9-...`) so it can never cross-deploy,
then polls the CDN until the new `SOMA_GUIDE_VERSION` appears (fails loudly at
~2 min). Commit + push afterward for history.

**Deliberate future decision, not an oversight:** linking the repo in Netlify
would restore push-to-deploy, but it changes account-level settings and makes
every push auto-ship to all consuming sites. Manual deploy is the current gate —
one command, human-invoked. Revisit only as an explicit decision with Mike.

## Environment variables (on soma-guide Netlify site)
None required — this is a pure static CDN. No API keys, no functions.

## Related projects
- `~/Projects/legends-membership-site/` — per-site config at `js/legends-guide-config.js`
- `~/Projects/bill-talk/` — standalone ElevenLabs voice agent UI (separate Netlify site)
