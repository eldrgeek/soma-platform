# `@soma/puppet-runtime`

The runtime for applications described in Puppet Script. It parses and
validates Puppet Script v0.1/v0.2, renders it directly in the browser, and
provides memory and Netlify Blobs stores for versioned descriptions and
declared application data.

This package implements the ruling in
`SOMA/specs/puppet-spec-of-record-v0.md` §1a: apps made in SOMA Forge run from
their Puppet Script description at runtime. An app changes when its host
approves a new, undoable description version; changing it does not require a
deploy.

## Store adapter

`StoreAdapter` defines asynchronous methods that persistent adapters implement:

- `getCurrent(appId)`
- `listVersions(appId)`
- `propose(appId, { source, author, reason })`
- `approve(appId, versionId, approver)`
- `undo(appId, approver)`
- `list(appId, data)`
- `add(appId, data, row, author)`
- `remove(appId, data, rowId, actor)`

`MemoryStore` and `createMemoryStore()` implement that contract in process.
`BlobsStore` and `createBlobsStore()` implement the same rules over
`@netlify/blobs`. Pass app configuration keyed by app id, for example:

```js
const store = createMemoryStore({
  'sunday-supper': { hostId: 'rosa' },
});
```

Proposals are parsed before storage and remain non-live until the configured
host approves them. Only that host can approve or undo. Writes accept only
fields declared by the current version's `data` block, and rows can be removed
only by their author or the host. Before storing a row, the API requires it to
match an `adds to` action exactly: `{me.*}` values must match the verified
identity, `{form.*}` values remain client-supplied, and literals must match the
description. Undo removes the latest approval from the live history; the host
can re-approve that undone version as redo.

## Browser renderer

`src/render.js` exports:

- `render(sketch, { root, data, me, onAction })`
- `interpolate(template, context)`
- `mapFormToRow(template, form, me)`

The renderer has no framework or build step. It draws screen tabs and the
standard hero, text, button, field, list/table, badge, card, and toast elements.
Add and remove hooks are sent to `onAction`, while field and identity tokens
are resolved in the browser.

## Run locally

Install this package's one runtime dependency:

```sh
cd packages/soma-puppet-runtime
npm install
```

Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your shell or Netlify environment.
The shared SOMA identity URL is
`https://omfwcodoimjmbrhssvfl.supabase.co`; use its public anon key, never a
service-role key.

Because this package lives inside a monorepo, pass the package-local paths to
the CLI explicitly:

```sh
timeout 600 netlify dev --skip-gitignore \
  --dir site/public --functions site/functions --port 8899
```

Open <http://localhost:8899/?app=sunday-supper>. The page offers Supabase magic
link and Google sign-in. It polls the current version every 10 seconds and
re-renders a newly approved description without a page reload.

To run the development-identity end-to-end proof in another terminal:

```sh
timeout 120 node scripts/e2e.mjs
```

`netlify dev` supplies `NETLIFY_DEV=true`, which is the only context where the
API accepts the script's `x-dev-user: id:name` headers.

`site/apps.json` names each app's host twice. `hostId` is the real SOMA account
id that hosts the app on the live site. `devHostId` is the made-up identity
that hosts it under `netlify dev`, because the dev identities are not real
accounts. `devHostId` counts only when `NETLIFY_DEV` is exactly `true`, the
same rule that gates `x-dev-user`.

## Live site

The runtime is live at <https://soma-forge.netlify.app/?app=sunday-supper>,
hosted by Mike Wolf's personal SOMA account (mw.personalmail@gmail.com). The site deploys from `master` of this
repository with base directory `packages/soma-puppet-runtime`, so a merge to
`master` publishes it. `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the shared
project's publishable key) are set on the site. Its address is on the shared
SOMA sign-in allow-list (`SOMA/tools/auth/README.md`).

To check the live protections without signing in:

```sh
timeout 120 node scripts/live-check.mjs https://soma-forge.netlify.app
```

It proves that requests without a real Supabase token are refused, that
`x-dev-user` is refused, and that SOMA sign-in redirects back to the site. The
host steps (propose, approve, undo) need the host signed in, so they run in a
browser on the live page.

## HTTP API

All routes are under `/api/app/:appId`.

| Method | Route | Result |
|---|---|---|
| `GET` | `/current` | Current description source, version id, and host id; seeds `examples/:appId.puppet` when no versions exist |
| `GET` | `/versions` | Version history |
| `POST` | `/propose` | Host proposes `{ source, reason }` without changing the live version |
| `POST` | `/approve` | Host approves `{ versionId }` |
| `POST` | `/undo` | Host restores the previous approved version |
| `GET` | `/data/:name` | Rows in a declared collection |
| `POST` | `/data/:name` | Add a declared row |
| `DELETE` | `/data/:name/:rowId` | Remove a row as its author or the host |
| `GET` | `/feedback` | Host-only list of stored feedback |
| `POST` | `/feedback` | Store `{ text, page }` plus the verified author in Blobs |

`GET /api/config` returns only the public Supabase URL and anon key needed by
the static sign-in client.

Every write requires `Authorization: Bearer <Supabase access token>`. The
Function verifies that token with `${SUPABASE_URL}/auth/v1/user` and
`SUPABASE_ANON_KEY`; it never reads or uses a service-role key. Reads require
the same identity unless `site/apps.json` sets `publicRead: true`. Proposal,
approval, and undo additionally require the verified user id to match the
app's configured `hostId`.

The site proxies `/soma-chip/*` to the central SOMA chip and keeps a vendored
fallback. Its endpoint is the selected app's `/feedback` route and it reuses
the current Supabase bearer token.

Run the tests with:

```sh
timeout 120 node --test
```

## Out of scope for runtime v1

- Invitations
- AI host chat
- Payments
- The Forge studio UI
- SEO pre-rendering
