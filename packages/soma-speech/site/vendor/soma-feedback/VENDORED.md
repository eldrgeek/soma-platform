# Vendored feedback chip

Copied unchanged on 2026-10-21 from `eldrgeek/soma` `standards/soma-feedback/`
(last change to that folder: `920d63a`; `origin/main` was `9773284`).

Files: `soma-chip-loader.js`, `soma-feedback.js`, `soma-feedback.css`.

The page loads only the loader. The loader reads `/soma-chip/channels/stable.json`
(proxied to the central chip host in `netlify.toml`) and uses these files as its
fallback if that host cannot answer. Do not edit them here: change the canonical
copy and re-copy. Reference: `SOMA/standards/soma-feedback/FRESH-BUILD-ADOPTION.md`.
