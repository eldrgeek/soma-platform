---
district: soma-core
status: active
depends_on: [SOMA]
capabilities: [netlify, supabase, auth, elevenlabs]
last_reviewed: 2026-06-23
---

# soma-platform — monorepo of shared widget engines + scaffolding for SOMA sites (CDN-hosted on Netlify)

**Where work happens:** `packages/<pkg>/` (source) → copy build output to `dist/` (Netlify publishes `dist/`, not the repo root). Packages: `soma-guide` (tour overlay, the flagship), `auth`, `soma-onboard`, `soma-owner`, `soma-scaffolder`, `auto-mapper`, `guide-extension`.

**`soma-onboard` does not follow the dist/CDN pattern** — it is a consumed npm package, not a served artifact, so nothing about `dist/` or `deploy-guide.sh` applies to it. Apps import it and keep their own federated tables (SOMA-APP-STANDARD §15b). Tests: `cd packages/soma-onboard && npm install && npm test` (33 tests; the QR suite compares byte-for-byte against the `qrcode` package and is the reason that devDependency exists).

**Key docs** (read in this order):
- [README.md](README.md) — packages + consuming sites overview.
- [BREADCRUMBS.md](BREADCRUMBS.md) — the dist/netlify.toml layout (Chesterton's fence); read before touching build config.
- [docs/BILL-HANDOFF.md](docs/BILL-HANDOFF.md) — Legends review pipeline handoff (Bill/Dana/Quinn ConvAI agents).
- `docs/soma-apps/` + `packages/soma-scaffolder/` — the Soma app-builder KB + engine (validate/scaffold/provision).

**Deploying:** `scripts/deploy-guide.sh` is THE deploy path (syncs package → dist, deploys with the site id pinned, verifies the CDN serves the new `SOMA_GUIDE_VERSION`). **`git push` does not deploy** — soma-guide.netlify.app is not linked to this repo (verified 2026-07-03). Repo-linking for push-to-deploy is a deliberate future decision, not a bug; manual deploy is the current gate.

**Skills**
- the "soma-guide-release" dance (edit package → sync dist → deploy → verify) is codified in `scripts/deploy-guide.sh`; commit + push afterward for history.

**Depends on / used by:** Implements widgets/scaffolding specified in **SOMA** canon; consumed by `legends-membership-site`, `Levinese`, soma-campus, and other Netlify sites via CDN URL.

## Phone behaviour — the guide is a bottom sheet (2026-07-27, v2026-0727a)

At ≤600px the guide does **not** auto-open. It boots as the FAB, and opening it
produces a sheet pinned to the bottom edge, full width, capped at 62vh. Before
this it auto-opened to a 340×460 floating panel positioned at an explicit
left/top — on a 375×812 phone that meant **51% of the viewport covered on
arrival**, across the middle of the page.

Both halves are gated on the same 600px breakpoint and must stay in step:
`isMobileViewport()` in `soma-guide.js` (no auto-open, no drag, no resize, no
remembered desktop panel size, inline geometry cleared on entering the sheet)
and the `@media (max-width: 600px)` block in `soma-guide.css`.

- **Desktop is untouched** — auto-open, floating panel, drag + corner resize all
  behave exactly as before. Verified side by side at 1280 and 375.
- **`cfg.mobileAutoOpen: true`** restores the old auto-open for any consumer that
  genuinely wants it. Nothing sets it today.
- **A viewport of 0 counts as desktop, not mobile.** `(max-width: 600px)` matches
  0, so a hidden tab / prerender / headless pane would otherwise boot as a phone
  and never auto-open for a desktop visitor. Caught in testing, not in the wild.
- **Tours still work on phones** — Legends' Bill opens to the sheet with `▶ Site
  Tour` intact, one tap in. Verified live after the CDN deploy.

**Gotchas**
- Netlify publishes `dist/` (`publish = "dist"` in netlify.toml). Never delete/misplace netlify.toml or the repo root gets published → 404s on every consuming site.
- Changing the guide changes **every consumer at once** (Levinese, Joscha, the 13 AGI-26 properties, legends-membership-site, soma-workspace, Sidekick-android). Draft-deploy first (`netlify deploy` with no `--prod` gives a draft URL), test against a real consumer page, then promote with `scripts/deploy-guide.sh`.
- The widget engine lives in `packages/soma-guide/` but the served artifact is `dist/soma-guide.js` — editing source alone ships nothing, and neither does pushing. Only `scripts/deploy-guide.sh` (wrapping `netlify deploy --prod --dir dist`) updates the CDN.
