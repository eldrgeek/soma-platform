# @soma/scaffolder

Turns an approved **Soma app spec** into a scaffolded app. The build engine behind
the "team of specialists" — see `docs/soma-apps/BUILD-MODEL.md`. Zero runtime
dependencies (Node ≥ 18, ESM).

## What it does

1. **Validate** a spec against the contract (`schema/soma-app.schema.json`; a
   dependency-free structural check lives in `src/spec.mjs`).
2. **Scaffold** (static-site mode) — for each *enabled* affordance, copy its template
   from `templates/soma-affordances/`, fill the `{{PLACEHOLDERS}}` from the spec, strip
   lines/blocks for disabled features, and emit a new app directory plus a generated
   `SETUP.md` listing the manual steps that remain (Supabase SQL, Netlify env, page
   includes, anything unresolved). Aimed at Legends-style static HTML sites.
3. **react-app** (full-app mode) — clone `~/Projects/soma-app-template` (the
   SOMA-APP-STANDARD reference implementation: Vite/React/TS/Tailwind/Supabase/Netlify
   Functions, every numbered standard wired by default — see its own
   `SOMA-STANDARD-CHECKLIST.md`) and substitute the spec's identity, host-pair, and
   guide-persona values into it. Produces a **runnable app**, not a pile of static
   snippets — `npm install && npm run dev` works immediately in the output dir.
4. **Provision** — emit a reviewable, **dry-run-by-default** `provision.sh` into the
   app dir: create the GitHub repo and push, create + link the Netlify site and set
   env, connect for push-to-rebuild CD, and apply the Supabase schema. The scaffolder
   never runs provisioning itself or inlines secrets — secrets are referenced as
   guarded `${ENV_VARS}`. You review the script, then run it.

## Usage

```bash
node bin/soma-scaffold.mjs validate  examples/legends.soma.json
node bin/soma-scaffold.mjs scaffold  examples/legends.soma.json /tmp/out        # static-site affordance files
node bin/soma-scaffold.mjs react-app examples/legends.soma.json /tmp/out-app    # full runnable app
node bin/soma-scaffold.mjs provision examples/legends.soma.json /tmp/out       # writes /tmp/out/provision.sh
```

### `react-app` mode — what gets substituted, what doesn't

Copies the whole `soma-app-template` tree (minus `node_modules`/`dist`/`.git`) and
rewrites, from the same spec fields `scaffold` uses (`buildValues()` in
`src/scaffold.mjs`, shared by both modes so there's one templating engine, not two):

- `src/lib/appConfig.ts` + `netlify/functions/lib/appConfig.ts` — `APP_ID`/`APP_NAME`
  (SOMA-APP-STANDARD §15b's "fork = change 2 constants").
- `src/lib/hostPair.ts` — human host name (`human_manager` or `owner`), AI host
  name/avatar (`affordances.guide.persona`).
- `public/js/soma-guide-config.js` + `knowledge.js` — filled from the SAME
  `templates/soma-affordances/bill/*.template.js` files the static-site mode uses.
- `package.json` name/description, `index.html` `<title>`.

Everything else — the Supabase migrations, the Netlify functions for feedback/
build-queue/agent-ingress, the toast/voice-manager/resume-location primitives, the
favicon, the tooltip component — ships as-is from the template; there is nothing
app-specific to substitute in them yet. `SETUP.md` in the output lists what's left
to do by hand (provision Supabase, run migrations, fill env vars, regenerate the
favicon for the new app's own mark).

Verified round-trip (2026-07-09): `examples/legends.soma.json` → `react-app` →
`npm install && npm run build` succeeds with no edits.

Or programmatically:

```js
import { loadSpec, validate } from "@soma/scaffolder/spec";
import { scaffold } from "@soma/scaffolder";

const doc = loadSpec("acme.soma.json");
const errors = validate(doc);          // [] = valid
if (!errors.length) scaffold(doc, { outDir: "./acme-soma" });
```

## The meta-app (dogfood)

`examples/soma-builder.soma.json` is the spec for **Soma Builder itself** — the
app-for-building-Soma-apps, expressed as a Soma app (guide "Ada" + auth + identity +
intake + changelog + feedback). It scaffolds like any other app, which is the proof
that the meta-app is a Soma app.

`tools/build-guide-knowledge.mjs` compiles `docs/soma-apps/*.md` + the schema into a
`window.SiteKnowledge` `knowledge.js` so Ada is grounded in the full knowledge base
(what a Soma app is, the affordance menu, the choices, the exact spec fields):

```bash
node tools/build-guide-knowledge.mjs /path/to/soma-builder/js/knowledge.js
```

Still the human/next step for the meta-app: the ElevenLabs ConvAI agent for Ada, the
intake→app-spec conversation logic, and the HTML pages.

## Spec format

JSON (YAML authorable, converts 1:1). The canonical contract is
`schema/soma-app.schema.json`; the human-readable explanation and worked example are
in `docs/soma-apps/APP-SPEC.md`. `examples/legends.soma.json` is a complete instance
used as the round-trip test fixture.

## Status (v0)

- Solo affordances (static-site mode): guide, auth (config wiring noted, bundle not
  generated), identity, intake (routing noted), changelog, feedback — scaffolded.
- **react-app mode (added 2026-07-09):** clones `soma-app-template` end-to-end;
  round-trips through `npm install && npm run build` with no manual edits. Source:
  `src/scaffoldReactApp.mjs`.
- Provisioning: `provision.sh` emitted (dry-run); execution is the human's, not
  auto-run yet. Not yet wired for the react-app output (still Legends-static-site
  shaped — a Supabase-project-for-a-fresh-app step is the main gap).
- Room (community tier): flagged in `SETUP.md`, not auto-scaffolded (converging).
- Next: wire `provision.sh` for react-app output (Supabase project creation +
  migrations apply, not just schema.sql); intent→action expansion for the Do
  registry; ajv-backed validation; YAML input.
