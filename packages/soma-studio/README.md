# `@soma/studio` — SOMA Studio v1

SOMA Studio is where people and the AI team talk about an app while it is built (Mike Wolf's ruling of
2026-10-21; running brief `SOMA/specs/forge-room-brief.md`). A **studio** is one project's lasting place.
A **session** is one sitting in it. This package is v1, built by hand on the app-kit stack; it is to be
rewritten in Puppet once Puppet has chat and sidebar components.

Live: <https://soma-forge.netlify.app/studio/> (sign in with SOMA Auth).

## What the page does

- **Chat.** Every signed-in member of a studio sees the same chat. Text first; the composer holds a
  `<soma-mic for="composer">` slot for the speech-to-text component (`packages/soma-speech`, workstream
  B), which the build copies in when it exists.
- **The team answers in the chat.** A listener on Mike's Mac (`~/Projects/_estate/studio-team/`) gets a
  Supabase Realtime push about a second after a person posts, asks a read-only Claude copy on the
  subscription, and posts one reply. Mike's work requests are passed to the team with cc-dispatch. The
  line above the composer says what the team is doing and how long pickup and answers took.
- **Agreements** (left). The team records each decision with a link to the message it came from. A
  host can correct one (the old wording is kept) or remove one (kept under "Removed").
- **Open questions** (right). Numbered. Click one, or write `3: yes` in the chat, to answer it; the
  answer becomes an agreement. The team can highlight a question that now matters; highlighted
  questions come first with the reason.
- **Live app** (far right). The studio's Puppet app from this same site (`/?app=<id>`), so it shares
  the sign-in. When a host approves or undoes a version there, the studio tells every other page in the
  studio to redraw its app at once.
- **Sessions.** A new sitting starts after three hours of silence, or when a host clicks "New
  session". The team's copy starts fresh for each sitting, with the agreements and open questions.

## Where it runs

The soma-forge site (`packages/soma-puppet-runtime`, Netlify site 21478abb, deploys from `master`)
serves it, because the shared sign-in allow-list has no room for a new origin and the app pane needs the
same origin anyway:

- build command `node ../soma-studio/scripts/install.mjs site/public/studio` copies `public/` to
  `/studio/` (and `../soma-speech` to `/studio/vendor/soma-speech/` when present);
- `site/functions/studio.mjs` wraps `src/api.js`; `/api/studio/*` is routed to it.

Environment on the site: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (already set for the runtime) and
`STUDIO_TEAM_KEY` (the same value as `~/.config/soma-studio/team.key` on Mike's Mac).

## Storage

Netlify Blobs store `soma-studio`, every read strong, every write conditional on the entry's etag:

- `studios/<id>/state.json`: sessions, agreements, questions, the team's cursor and status, the app
  version counter;
- `studios/<id>/messages/<n>.json`: messages in blocks of 100.

## HTTP API (`/api/studio`)

| Method | Route | Who | Result |
|---|---|---|---|
| `GET` | `/` | signed in | the studios you are a member of |
| `GET` | `/:id/feed?after=N&version=V` | member | new messages, the state when it changed, the realtime topic |
| `POST` | `/:id/messages` | member | post `{ text }`; `N: answer` lines answer open questions |
| `PATCH` / `DELETE` | `/:id/agreements/:n` | host | correct / remove an agreement |
| `DELETE` | `/:id/questions/:n` | host | drop an open question |
| `POST` | `/:id/sessions` | host | start a new session |
| `POST` | `/:id/app-changed` | member | the app pane changed; others redraw |
| `GET` | `/team/inbox` | team key | each studio's state and waiting messages |
| `POST` | `/:id/team` | team key | `working`, `reply`, `note` or `skip` |

Studios and their members are in `studios.js` (a change is a deploy). Members are matched by the
email they sign in with. Read `_estate/studio-team/README.md` before adding anyone other than Mike.

## Tests

```sh
node --test
```

```sh
node scripts/mutation-check.mjs
```

The second proves the suite fails on 22 broken copies of the rules (membership, host rights, the team
key, answer-by-number, strong reads, etag writes, escaping, and more).

_Written 2026-10-21 by Claude Opus 5.5 (CCc, SOMA Studio workstream A) for Mike Wolf; bead sp-exe._
