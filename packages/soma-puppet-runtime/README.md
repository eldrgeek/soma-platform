# `@soma/puppet-runtime`

The runtime for applications described in Puppet Script. It parses and
validates Puppet Script v0.1 to v0.5, renders it directly in the browser, and
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
- `list(appId, data, { author })`: with `author`, only the rows that account added
- `add(appId, data, row, author)`
- `remove(appId, data, rowId, actor)`
- `setStatus(appId, data, rowId, status, actor)`: host only, `confirmed` or `declined` (v0.3)
- `privateData(appId)`: the collections an approved version ever declared `read: own` or `read: private` (v0.3)
- `privacyLevels(appId)`: for each such collection, the strictest rule ever approved (v0.4)

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

### Puppet v0.3: one person's private view

[`GRAMMAR-v0.3.md`](./GRAMMAR-v0.3.md) adds host-only screens
(`requires: host`), rows each person reads only for themselves (`read: own`),
date fields (`@date`, `days:`) and approve or decline (`status` and
`sets status`). The server enforces all of it: a reader who is not the host
receives the description without host-only screens, `read: own` rows are
filtered by the stored author account, privacy only tightens across undo and
redo, and only the host sets a status. The Brain Trust review that shaped it is
[`docs/grammar-v0.3-review.md`](./docs/grammar-v0.3-review.md), and
`examples/sunday-supper-v3.puppet` uses every v0.3 word.

### Puppet v0.4: one writer's private work, read and heard

[`GRAMMAR-v0.4.md`](./GRAMMAR-v0.4.md) adds screens that show the row that
opened them (`screen "Piece" from pieces`, with `{row.field}` and an automatic
Back), dialogs that are drawn, `read: private` (each person, the host
included, reads only their own rows), a parse error for any `{token}` the
renderer will not fill (version 0.4 and later), and two components from
PlayMaker in [`packages/soma-play`](../soma-play/README.md): `play-view`
(Diana's script format) and `stage-read` (the scene read aloud, a voice per
character, through `POST /api/app/:appId/stage-read`). The review that shaped
it is [`docs/grammar-v0.4-review.md`](./docs/grammar-v0.4-review.md), and
`examples/monologues.puppet` uses every v0.4 word.

### Puppet v0.5: write and hear a video script (VideoMaker)

[`GRAMMAR-v0.5.md`](./GRAMMAR-v0.5.md) adds three elements for VideoMaker,
the app for video scripts (`examples/videomaker.puppet`, `?app=videomaker`):
`video-view` (a video script in the SOMA script format drawn as a two-column AV
script), `video-read` (its narration read aloud, a voice per narrator, through
`POST /api/app/:appId/video-read`) and `script-editor` (the row's author changes
its text, through `PUT /api/app/:appId/data/:name/:rowId`). The two video
components are in [`packages/soma-video`](../soma-video/README.md); the screen
layout `writer` puts the editor beside the view.

[`GRAMMAR-v0.6.md`](./GRAMMAR-v0.6.md) adds VideoMaker's "Make it" panel and
asset board (`video-jobs`, `video-assets`), and
[`GRAMMAR-v0.7.md`](./GRAMMAR-v0.7.md) adds `video-storyboards`: a video's
storyboard as scene cards that the host and the artists the host names can
change, with cuts that know when they need rendering again. An artist's request
to the Mac waits until the host lets it run.

### Puppet v0.8: run lines

[`GRAMMAR-v0.8.md`](./GRAMMAR-v0.8.md) adds `line-run "{row.text}"`: the actor picks a part, Stage Read
reads the others, and the run stops on each of the actor's lines with the line hidden (or as initials,
`hint: initials`). It uses Stage Read's route, checks and allowance. `examples/monologues.puppet` has it.

### Puppet v0.9: the evidence ledger

[`GRAMMAR-v0.9.md`](./GRAMMAR-v0.9.md) adds `video-evidence "{row.text}"`: every narrator line and card in a
video script next to its `[[src: ...]]` notes, with the claims that have none marked. No server route.
`examples/videomaker.puppet` has it on the Script screen.

## Browser renderer

`src/render.js` exports:

- `render(sketch, { root, data, me, host, onAction, components })`
- `interpolate(template, context)`
- `mapFormToRow(template, form, me)`

The renderer has no framework or build step. It draws screen tabs and the
standard hero, text, button, field, list/table, badge, card, and toast elements.
Add, remove and set-status hooks are sent to `onAction`, while field and
identity tokens are resolved in the browser. Host-only screens are drawn only
when `host` is true, marked "only you"; a button inside a list or table is
drawn on every row; a `@date` field is a date picker; a `@select` field with
`items:` is a choice list. A screen from data shows one row and a Back button,
a dialog is a panel over the screen, and the tab bar appears only with two or
more tabbed screens. `components` supplies `play-view` and `stage-read` (the
page passes `packages/soma-play`'s; without them the renderer draws plain
text).

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
| `GET` | `/current` | Current description source, version id, and host id; seeds `examples/:appId.puppet` when no versions exist. A reader who is not the host gets the source without host-only parts |
| `GET` | `/versions` | Host-only version history |
| `POST` | `/propose` | Host proposes `{ source, reason }` without changing the live version |
| `POST` | `/approve` | Host approves `{ versionId }` |
| `POST` | `/undo` | Host restores the previous approved version |
| `GET` | `/data/:name` | Rows in a collection the live version declares; `read: own` gives a person only their own rows |
| `POST` | `/data/:name` | Add a row that matches an action the sender can see |
| `PATCH` | `/data/:name/:rowId` | Host sets `{ status }` to `confirmed` or `declined` through a `sets status` action |
| `DELETE` | `/data/:name/:rowId` | Remove a row as the host, or as its author through a visible `removes from` action while it is `pending`; a `read: private` row only by its author |
| `POST` | `/stage-read` | Speak one line `{ data, rowId, field, line }` of a row the caller may read, on a screen they can see, within the daily allowance (audio/mpeg) |
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

The mutation check loosens each server rule on purpose (61 of them, most from
v0.3) and requires a failing test for every one. CI runs it too:

```sh
timeout 1500 npm run mutation
```

## SOMA Studio on this site

Since 2026-10-21 this site also serves SOMA Studio v1 (`packages/soma-studio`) at `/studio/`, so the
studio and the app it shows share one sign-in session and one allow-listed origin. The build command
copies the studio page into `site/public/studio/` (gitignored), and `site/functions/studio.mjs` serves
`/api/studio/*`. Inside the studio this runtime is the live app pane: after a host approves or undoes a
version, `app.js` tells the studio (`postMessage`), and it redraws when the studio asks. Read
`packages/soma-studio/README.md`.

## Component pins

The shared components (`soma-play` and `soma-video`) are published like Nix
store paths: every build lives at `/vendor/<component>@<hash>/`, named by a
sha256 of its files, and is never changed or removed. `/vendor/manifest.json`
lists each build with its date and names the latest. `/vendor/<component>/`
stays the latest build, unhashed.

An app's description may pin a build with a top-level line:

```
puppet "VideoMaker" version "0.7"
uses soma-video@4fc900785602
```

The page then loads that app's `soma-video` from the pinned folder; an app with
no pin loads the latest, exactly as before pins existed. Pins move with the
description, so changing one goes through Propose and Approve, and Undo puts the
old pin back. The page loads the components again only when the pins change, so
an approved pin takes effect at the next check without a reload. A pin the
store does not have falls back to the latest and says so in the status line.

Only shared components are pinnable. The runtime itself (`puppet`), sign-in and
feedback are gate code and always move with the site. The server halves
(Stage Read, the narration read, storyboard rules) also always run the latest
code, so a pinned build must still speak the current API.

After changing a component, copy its `src/` into `site/public/vendor/<component>/`
(the mirror test checks it) and publish the new build:

```sh
node scripts/vendor-store.mjs           # copies the new build to vendor/<component>@<hash>/
node scripts/vendor-store.mjs --check   # what test/component-store.test.js checks
```

Commit the new folder and `manifest.json` with the change. The test fails if the
latest build is not published, or if a published build was edited, removed or
added by hand.

## Out of scope for runtime v1

- Invitations
- AI host chat
- Payments
- SEO pre-rendering

## Example apps

- `examples/sunday-supper.puppet` (and `-v2`): the supper app. Unchanged.
- `examples/monologues.puppet`: every v0.4 word, live as `?app=monologues`
  (`publicRead`). Each actor's audition pieces are private, even from the
  host; a piece opens on its own screen as a script page with Stage Read.
- `examples/sunday-supper-v3.puppet`: the same supper with every v0.3 word,
  live as its own app at `?app=sunday-supper-v3`. Guests ask to bring a guest
  on a Sunday and see only their own requests; Rosa's list (host-only) shows
  every request with Confirm and Decline, and her private notes. It is
  `publicRead`, so `scripts/live-check.mjs` can prove the v0.3 refusals live
  without signing in: public rows are served, private ones are refused.
- `examples/soma-studio.puppet`: SOMA Studio as a Puppet app, `?app=soma-studio`.
  It looks like the `/studio/` page: header, Agreements column, Chat with a
  prompt box and mic slot, Open questions column. Chat is live (`data
  messages`); agreements and questions are sample stubs in this first version.
  It uses two small renderer additions that stay inside the closed grammar: the
  `composer` element (a textarea with `field:` naming its form field, a mic slot
  filled by `soma-speech` when the page has it, and Send running the element's
  hook) and the open screen prop `layout: studio` (three columns).
