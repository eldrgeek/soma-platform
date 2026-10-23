# @soma/discovery

Pure functions that compile a validated **soma.app/1** manifest into the static AI visitor door:

- `public/.well-known/soma-app.json`
- `public/llms.txt`
- `public/api/soma/v1/openapi.json`

Only actions whose `surfaces` include `remote` appear in the machine-readable action list and OpenAPI action paths. Human-only approval and consent routes are excluded (kit plan §2.7).

Tests: `npm test` and `npm run mutation-check`.
