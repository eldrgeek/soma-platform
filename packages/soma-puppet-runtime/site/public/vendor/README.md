# Vendored browser files

- `puppet/` mirrors `src/parser.js` and `src/render.js` for direct browser use.
- `soma-signin/somaAuthConfig.js` comes from `packages/soma-signin/src/`.
- `soma-feedback/soma-chip-loader.js` is the standard central-with-fallback
  loader; its fallback JS and CSS come from `packages/soma-feedback/widget/`.

The runtime site has no build step, so these files are committed as static
assets.
