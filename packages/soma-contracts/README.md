# `@soma/contracts`

Contract primitives for SOMA app kit v1.

Exports:

- `validateManifest(doc)` and `validateLock(doc)` — strict Ajv 2020-12 validation.
- `readLock(path)` — parse and validate a `soma-kit.lock.json`.
- `canonicalize(value)` and `contractSha256(manifest, readFile)` — RFC 8785 JSON
  canonicalization and the contract hash.
- `validateSourcePath(path)`, `readSourceFile(root, path, { maxBytes })`, and
  `referencedSourcePaths(manifest)` — safe repository source-file handling.
- `manifestSchema` and `lockSchema` — the parsed JSON Schemas.

Validation functions return `{ valid, errors }`. `contractSha256` accepts an
async or synchronous `readFile(path)` callback that returns a `Uint8Array`
(or the result of `readSourceFile`, whose `bytes` member is used).

Run the tests:

```sh
npm install
npm test
```
