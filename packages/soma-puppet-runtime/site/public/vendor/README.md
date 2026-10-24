# Vendored browser files

- `puppet/` mirrors `src/parser.js` and `src/render.js` for direct browser use.
- `soma-signin/somaAuthConfig.js` comes from `packages/soma-signin/src/`.
- `soma-feedback/` starts from the standard central-with-fallback loader and
  `packages/soma-feedback/widget/`. Its local fallback has one deliberate
  runtime fork: `window.somaFeedbackHeaders` supplies the same identity headers
  as the app API helper, including `x-dev-user` under `netlify dev`. Dev
  identities pin this fallback because the central chip does not expose a
  general headers hook.

- `manifest.json` and the `soma-play@<hash>/` and `soma-video@<hash>/` folders
  are the component store: every published build of a shared component, never
  changed once written. `scripts/vendor-store.mjs` writes them; see the
  package README, "Component pins".

The runtime site has no build step, so these files are committed as static
assets.
