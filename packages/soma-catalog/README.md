# `@soma/catalog`: the SOMA component catalog

One machine-readable record per Puppet Script word, so a Designer AI can choose words and write an app
skeleton quickly, and so a person can see in one place what each word does and what it is allowed to do.

_Written 2026-10-24 by Claude Opus 5.5 for Mike Wolf, who asked for "a way to keep the metadata for
components so a Designer AI could make choices and build the app skeleton rapidly". The pin shape was
agreed with the SOMA component versioning work (soma-platform PR #55)._

## What a record holds

`components/<word>.json`, checked against `schema/soma-component-v1.schema.json`:

| Field | Meaning |
|---|---|
| `word`, `summary`, `since` | The element kind, one or two sentences, the first grammar version that has it |
| `rendering` | `drawn`, or `placeholder` when the renderer only draws a labelled box |
| `component`, `export` | The shared package that draws it (`soma-play`, `soma-video`) and its mount function; `null` when it moves with the runtime |
| `placement`, `label` | `any`, `row` (a screen from data) or `screen` (not from data); whether the label is text, exactly one `{row.field}`, or none |
| `template` | A snippet that parses. `$data`, `$field` and `$rowScreen` are filled in |
| `params` | Label, props, roles and hook, each with whether it is required |
| `data` | What it reads and writes |
| `routes` | Method, path, who may call it, and the server's checks in order |
| `permissions`, `enforcement` | Who may do what, and whether that is enforced by the `server`, is `display` only (hiding is not a permission), or `none` |
| `cost` | Paid service, the server-only key name, and the allowance |
| `runsOn` | `browser`, `browser+server`, or `browser+server+mac` (jobs that need Mike's Mac) |
| `tags`, `replaces`, `limits` | For search, the hand-written code it saves, and what it does not do yet |
| `docs`, `source`, `tests` | Where to read more, the files, and the tests that cover it |

## Pins

A record with a `component` gains `pin: { component, hash, uses }` when the catalog is built with pins: the
latest build in the component store (`packages/soma-puppet-runtime/site/public/vendor/manifest.json`,
written by `scripts/vendor-store.mjs`). `uses` is the line to put in a description to pin that build. The
committed `catalog.json` carries no pins, so it changes only when a record does; read pins live with
`show` or `buildCatalog()`.

## Use

```sh
cd packages/soma-catalog && npm install
node bin/soma-catalog.mjs show            # the whole catalog with live pins
node bin/soma-catalog.mjs show voice      # only words matching every term (word, tag or summary)
node bin/soma-catalog.mjs skeleton spec.json
node bin/soma-catalog.mjs build           # rewrite catalog.json after changing a record
```

A skeleton spec names one collection and the words for the list screen and the row screen:

```json
{
  "title": "Audition pieces",
  "data": { "name": "pieces", "fields": ["title", "play", "text"], "read": "private" },
  "home": ["text"],
  "row": ["play-view", "stage-read"],
  "pin": true
}
```

It writes a list screen with a form and Add, a row screen with the chosen words and Delete, and the
version the newest word needs, then runs the real parser and prints any errors. A word placed where it
cannot go is refused before anything is written.

## Adding a word

A new Puppet word needs a record in the same PR. The tests fail otherwise: the catalog must hold exactly
the parser's `KINDS`, every template must parse where its record says it goes, a `row` word must be
refused elsewhere, `since` must match the version the parser enforces, `rendering` must match the
renderer, every named component must be pinnable, and every path must exist. CI runs them in the `kit`
workflow whenever the parser, renderer, component store or catalog changes.
