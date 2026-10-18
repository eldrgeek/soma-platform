# Vendored browser files

- `puppet/` mirrors `src/parser.js` and `src/render.js` for direct browser use.
- `soma-signin/somaAuthConfig.js` comes from `packages/soma-signin/src/`.
- `soma-feedback/` starts from the standard central-with-fallback loader and
  `packages/soma-feedback/widget/`. Its local fallback has one deliberate
  runtime fork: `window.somaFeedbackHeaders` supplies the same identity headers
  as the app API helper, including `x-dev-user` under `netlify dev`. Dev
  identities pin this fallback because the central chip does not expose a
  general headers hook.

The runtime site has no build step, so these files are committed as static
assets.
