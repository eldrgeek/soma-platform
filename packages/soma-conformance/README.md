# `@soma/conformance`

Local, read-only conformance checks for a `soma.app/1` repository. This M1
slice makes no network or database calls.

## Checks in this slice

- **C1** validates the manifest with `@soma/contracts`.
- **C3 (static)** checks concept and question IDs, versions, and namespaces.
  Platform-registry definition hashes report `not_run` because no registry
  exists yet.
- **C4 (static)** checks action fields, executor compatibility, effect safety
  fields, and that input/output schema paths resolve safely and contain JSON.
  Whether an RPC is applied in a database reports `not_run`.
- **C5** requires each effect action to expose a UI surface or a reasoned
  exception. Exceptions are accepted only for reversible actions.
- **C13 (local)** checks the canonical contract hash, all referenced source
  paths, and vendored package hashes from `soma-kit.lock.json`. Guide integrity
  over the network and template-commit provenance report `not_run`.
- **C15 (local)** checks the vendored feedback chip: `index.html` loads the
  widget script (with `data-no-google` and `data-site` set to the manifest app
  id), `public/vendor/soma-feedback/*` files exist, and their SHA-256 hashes match
  `soma-kit.lock.json` `feedback_chip.widget_files`. Repositories whose lock
  predates `feedback_chip` report `not_run`.

Every C-table check not implemented here is still emitted as `not_run` with
the reason `not built in M1 slice 2`; omitted coverage is never reported as a
pass.

Vendored lock entries use `vendor/soma/<unscoped-package-name>/`. A package
hash is SHA-256 over the canonical JSON map from each package-relative file
path to that file's SHA-256. This makes any added, removed, renamed, symlinked,
or byte-changed vendored file fail C13. Every package directory directly under
`vendor/soma/` must have a corresponding `@soma/<name>` lock entry; omitted
entries and lock entries whose directories are missing both fail C13.

## Run

From the repository root:

```sh
node packages/soma-conformance/bin/soma-conform.mjs \
  --contract /path/to/app/soma-app.json \
  --repo /path/to/app \
  --tier prototype
```

Add `--json` for one JSON object containing `contract_sha256` and the same
ordered check results. Text mode prints one line per check. The command exits
zero only when no check fails.

Only local mode is supported. Live URLs, journeys, staging, generation, and
broker checks are later slices.

## Test

Install `@soma/contracts` and this package, then run the Node test suite:

```sh
cd packages/soma-contracts
npm install
cd ../soma-conformance
npm install
npm test
```
