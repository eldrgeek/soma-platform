# @soma/scaffolder

Turns an approved **Soma app spec** into a scaffolded app. The build engine behind
the "team of specialists" — see `docs/soma-apps/BUILD-MODEL.md`. Zero runtime
dependencies (Node ≥ 18, ESM).

## What it does

1. **Validate** a spec against the contract (`schema/soma-app.schema.json`; a
   dependency-free structural check lives in `src/spec.mjs`).
2. **Scaffold** — for each *enabled* affordance, copy its template from
   `templates/soma-affordances/`, fill the `{{PLACEHOLDERS}}` from the spec, strip
   lines/blocks for disabled features, and emit a new app directory plus a generated
   `SETUP.md` listing the manual steps that remain (Supabase SQL, Netlify env, page
   includes, anything unresolved).

3. **Provision** — emit a reviewable, **dry-run-by-default** `provision.sh` into the
   app dir: create the GitHub repo and push, create + link the Netlify site and set
   env, connect for push-to-rebuild CD, and apply the Supabase schema. The scaffolder
   never runs provisioning itself or inlines secrets — secrets are referenced as
   guarded `${ENV_VARS}`. You review the script, then run it.

## Usage

```bash
node bin/soma-scaffold.mjs validate  examples/legends.soma.json
node bin/soma-scaffold.mjs scaffold  examples/legends.soma.json /tmp/out
node bin/soma-scaffold.mjs provision examples/legends.soma.json /tmp/out   # writes /tmp/out/provision.sh
```

Or programmatically:

```js
import { loadSpec, validate } from "@soma/scaffolder/spec";
import { scaffold } from "@soma/scaffolder";

const doc = loadSpec("acme.soma.json");
const errors = validate(doc);          // [] = valid
if (!errors.length) scaffold(doc, { outDir: "./acme-soma" });
```

## Spec format

JSON (YAML authorable, converts 1:1). The canonical contract is
`schema/soma-app.schema.json`; the human-readable explanation and worked example are
in `docs/soma-apps/APP-SPEC.md`. `examples/legends.soma.json` is a complete instance
used as the round-trip test fixture.

## Status (v0)

- Solo affordances: guide, auth (config wiring noted, bundle not generated),
  identity, intake (routing noted), changelog, feedback — scaffolded.
- Provisioning: `provision.sh` emitted (dry-run); execution is the human's, not
  auto-run yet.
- Room (community tier): flagged in `SETUP.md`, not auto-scaffolded (converging).
- Next: wire `provision.sh` into the dispatch fleet; intent→action expansion for the
  Do registry; ajv-backed validation; YAML input.
