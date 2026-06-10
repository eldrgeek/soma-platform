# SOMA Platform Monorepo

This is the SOMA platform monorepo — the canonical home for shared UI widget engines used across SOMA-affiliated sites.

## Packages

- **`packages/soma-guide/`** — The SOMA Guide tour overlay widget. Canonical engine; per-site configs (`*-guide-config.js`) and audio (`audio/tour/*.mp3`) live in each consuming site.
- **`packages/soma-owner/`** — Lightweight owner-mode identification. Device-bound localStorage gate exposing `SomaOwner.isOwner()`. See below for activation.
- **`packages/auth/`** — Supabase-based multi-tenant auth (the full gate — separate from owner mode).

## Dist

The `dist/` directory contains the latest built artifacts ready for CDN/static hosting.

- `dist/soma-guide.js`
- `dist/soma-guide.css`
- `dist/soma-owner.js` — rebuilt via `node packages/soma-owner/build.mjs`

## Owner Mode

`soma-owner.js` is a Mac-tied convenience gate for owner/admin features. It is **not** a security boundary — use `packages/auth` for anything server-enforced.

### How to add owner mode to a SOMA app

```html
<!-- In <head>, before other scripts -->
<script src="https://soma-guide.netlify.app/soma-owner.js"></script>
```

Gate markup with `data-owner-only` (hidden from visitors automatically):
```html
<button data-owner-only>Admin Panel</button>
```

Gate JS features:
```js
if (SomaOwner.isOwner()) {
  // show rep tour, admin panel, AI manager, etc.
}
```

### How Mike activates owner mode (once per browser/domain)

1. Open the activation URL for that domain:
   ```
   https://<soma-app-domain>/?soma_owner_key=<OWNER_SECRET>
   ```
   The secret is in `soma-platform/.env` (gitignored). Do NOT share it publicly.
2. A toast "🔓 Owner mode activated" appears. The key is stripped from the URL.
3. Owner mode persists in `localStorage` on that browser/device. No login required.

### How to revoke

- **Per-device:** Open browser console on any SOMA app page and run `SomaOwner.revoke()`.
- **Global (all devices):** Rotate the secret — `echo "SOMA_OWNER_SECRET=$(openssl rand -hex 20)" > .env`, then `node packages/soma-owner/build.mjs`, commit `dist/soma-owner.js`, push. All stored tokens invalidate on next page load.

### Rebuilding after secret rotation

```sh
cd ~/Projects/soma-platform
echo "SOMA_OWNER_SECRET=$(openssl rand -hex 20)" > .env
node packages/soma-owner/build.mjs
git add dist/soma-owner.js && git commit -m "rotate owner secret"
git push
```

## Sites using soma-guide

| Site | Netlify ID | Notes |
|------|-----------|-------|
| legends-membership-site | 47a0da43 | Points to CDN URL |
| Levinese | 2ab17854 | Points to CDN URL |

## Contributing

Update the engine in `packages/soma-guide/`, copy to `dist/`, commit and push. The CDN picks up the new dist automatically.
