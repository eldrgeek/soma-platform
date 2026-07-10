# Assist Fleet

SOMA Auth-gated console for Yeshie / Adrian (soma-guide) / common assist feedback.

## Pages

- `login.html` — magic-link gate (SOMA Auth on shared project `omfwcodoimjmbrhssvfl`)
- `instances.html` — install heartbeats (`assist_heartbeats`)
- `review.html` — unified filterable feedback + build-request review

## Run locally

```bash
cd packages/assist-fleet
python3 -m http.server 4177
# open http://127.0.0.1:4177/login.html
```

## Tests

```bash
npm test
```

Authorship: Mike Wolf + OpenAI Codex, 2026-07-10 WP3.
