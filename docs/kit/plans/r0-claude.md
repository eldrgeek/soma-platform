# The SOMA app kit, v1: plan (round 0, Claude)

_Round-0 plan for bead sp-zf0. Written by Claude Opus 5.5 (Claude Code, CCc) for Mike Wolf on 2026-10-07, from `01-brief.md`, `00-inventory.md` and `00-capability-ideas.md`, plus the sources cited inline. Paths are relative to `~/Projects/` unless they start with `/`._

## 0. The plan in ten sentences

1. The kit is one contract file per app (`soma.app.json`), one shared Postgres schema (`soma`), one identity origin (`id.mike-wolf.com`), one command registry package, and one conformance command.
2. "Be known" is built on the Supabase account id that Legends and PlayMaker already share, not on DIDs.
3. What a person has seen and answered is stored per concept in `soma.seen` and `soma.answers`, keyed to the person, so no app re-tells or re-asks.
4. A new app learns who a person is only after the person taps "Continue as Greg", and that chip is drawn by the identity origin, so the app learns nothing before consent.
5. "Ask, show, or do" runs on the Agent Portal command registry, extracted from PlayMaker into `@soma/commands`.
6. Show means highlighting the controls bound to a command (`[data-command="…"]`), and Do means invoking that command through one risk gate.
7. A person's own AI is a first-class visitor with three entrances: read (`/llms.txt`, `/.well-known/soma-app.json`), act (pairing plus the remote command API and an MCP endpoint), and the portable prompt.
8. A person pairs their AI once, and the delegation works in every SOMA app, so the person's AI is known across apps too.
9. Code that runs inside an app's build is vendored with a hash manifest that the conformance check verifies; only the Guide engine and the static-site bundle come from the CDN.
10. The second app passes when a builder that is not Claude takes it from `soma.app.json` to green conformance on a live URL in four working hours or less, with no edit to soma-platform during the run.

## 1. The capability list

Each entry gives: what it does for the person, the SOMA principle, what exists today, and the target design. Part A is the two capabilities Mike named. Part B is the plumbing. Part C is canon ideas I keep, defer or drop. Part D is new capabilities that are in neither input file.

### A. The two named capabilities

#### A1. Be known

- **For the person:** every SOMA app greets them as who they are, does not re-explain SOMA, and does not re-ask a question they already answered.
- **Principle:** one identity, consume don't fork (STD §4, §16); human↔AI alignment starts with the AI knowing who it is talking to.
- **Exists today:** shared Supabase auth (`omfwcodoimjmbrhssvfl`) in Legends and PlayMaker; `public.soma_profiles` with a `guide_seen` JSON blob, used only by Legends (`legends-membership-site/js/legends-guide-config.js`, `soma-platform/templates/soma-affordances/sql/schema.sql`); PlayMaker's known-device marker (`soma-platform/packages/soma-signin/src/somaKnownDevice.js`, bead pm-kgn); the identity ladder spec (`soma-platform/docs/SOMA-IDENTITY-STATES.md`); the §16 handshake design (unbuilt).
- **Target:** five parts.
  1. **The person record** `soma.people`, one row per `auth.users` id, created on first sign-in, first ticket use or first AI pairing.
  2. **The identity origin** `id.mike-wolf.com`, a small Netlify site that holds the only long-lived SOMA session a browser needs and hands each app its own session after consent (section 2.3).
  3. **Memberships and consents**: `soma.memberships` records which apps a person has joined and how; `soma.app_consents` records which fields each app may read.
  4. **Seen and answered**: `soma.seen` (concept-level, replaces `guide_seen`) and `soma.answers` (question-level).
  5. **Self-knowledge commands** every app gets for free: `soma.me.describe` ("what do you know about me?"), `soma.me.forget` ("forget me", per app or everywhere), `soma.me.switch` ("use a different account").

#### A2. Ask, show, or do

- **For the person:** on any SOMA app they can ask how to do something, and the app tells them, shows them on the page, or does it for them after the right level of confirmation.
- **Principle:** human↔AI alignment through shared action; the Agent Portal 1:1 rule (`SOMA/specs/agent-portal-v1.md` on origin/main, §0); honest UX, no silent success (STD §10).
- **Exists today:** two separate action models. The Guide's Tell/Show/Do runs selector scripts with a two-level risk flag (`soma-platform/packages/soma-guide/soma-guide.js` `_commitDo`, `_runAction`; Legends' one action in `legends-guide-config.js`). PlayMaker's Agent Portal runs a typed command registry with audit, preconditions and a mapping check (`playmaker/src/agent-portal/{registry,catalogue,validation,keyBindings,install}.ts`, `tests/agent-portal-workflows.test.ts`, remote API `netlify/functions/agent-v1.ts`).
- **Target:** one model, the command registry. Section 2.4 gives the design.
  - **Ask (Tell):** the AI host answers from the app's declared concepts and knowledge, and records `soma.seen(kind='told')`.
  - **Show:** the Guide walks the person through the workflow's commands by highlighting each bound control, `[data-command="<id>"]`, through the existing host adapter (`soma-platform/docs/SOMA-DELIVERY.md`). It records `kind='shown'`.
  - **Do:** the Guide calls `window.soma.commands.invoke(id, args, actor)`. The risk gate decides run, confirm, or refuse. It records `kind='done'` and writes a receipt.
  - Static sites that have no React code still declare commands; their implementation is a step script (today's `steps: [{op:'click',…}]`), so Legends keeps working.

### B. Plumbing: keep, merge or drop every inventory item

| Inventory item | Decision | Why | Target |
|---|---|---|---|
| Sign-in `@soma/signin` | **Keep** | It is the React kit PlayMaker runs. | Depends on `@soma/id` for the known-device card and the handshake. |
| Old static sign-in `packages/auth`, copies in `lms/js/soma-auth.js`, `legends-connect/js/soma-auth.js` | **Merge, then drop** | Three copies of one job. | Static sites load `soma-kit.js` from the CDN (section 2.6), which contains the static sign-in. Copies are deleted after Legends moves. |
| Tickets `@soma/tickets` | **Keep; it becomes the one invitation design** | It is live, single-use, app-scoped, and already in the shared project. | Fix `ticket_create`'s dependency on PlayMaker's `public.memberships` (section 4.1, step M5). |
| Usage meter `@soma/meter` | **Keep** | Works; studio-scoped caps. | Move `playmaker/src/components/UsageChip.tsx` into `@soma/meter/react`. |
| Feedback chip `@soma/feedback` + widget copies | **Merge** | The PlayMaker copy has drifted from canonical. | Widget assets move into `packages/soma-feedback/widget/`; one source; copies are replaced by vendored files whose hashes the conformance check verifies. |
| Guide / Bill `soma-guide` (CDN) | **Keep** | 22 Legends pages depend on it; always-latest is its point. | Do calls the command registry; the identity block reads `@soma/id`; URL gains a major version (`/v1/soma-guide.js`). |
| Chat window `soma-assist-core` | **Keep** | It is the shared chat surface. | Becomes the Guide's and the AI host's chat UI; no separate kit capability. |
| Onboarding `@soma/onboard` | **Merge into tickets, drop its member tables** | Its per-app `<prefix>_members`/`_sessions` are §16 drift by its own admission (`SOMA/specs/soma-onboard-identity-v0.md` §0). | Its byte-exact QR code, channels and senders become `@soma/tickets/qr` and `@soma/tickets/send`. |
| Scaffolder + standup-check | **Keep and extend** | It already scaffolds and builds in 6.59 s. | Reads `soma.app.json`, vendors the kit with a manifest, emits a provision script for the react-app output, and runs `soma-conform`. |
| Changelog, Legends (admin approval queue) and PlayMaker ("What's new") | **Merge into one design with two views** | They are the same record at two stages: a request becomes an approved change, which ships and becomes news. | `@soma/changes` (section 2.2, table `changes`). The admin view is Legends' queue. The person view is PlayMaker's "What's new", filtered by `soma.seen`, so a person sees only changes they have not seen. "Review with Bill" (canon idea 15) is the AI host telling the unseen changes. |
| Payments | **Keep as a template, not kit v1** | PlayMaker has no live price yet, and LEAD (2026-10-02) puts PlayMaker payments on hold. | Stays in `templates/soma-affordances/billing/`; becomes `@soma/billing` when one app takes a real payment. |
| Live in-place editing | **Keep as a template, kit v1.1** | Admin-only; built once; not needed for day one. | `SOMA/standards/soma-live-edit/` stays; packaged after the second app. |
| Admin roles and allowlist (`appAdmin.ts`, `soma-allowlist/`) | **Merge** | An email list in code is a second identity system. | Admin is `soma.memberships.role in ('admin','owner')`. `soma_is_admin(app_id)` is one SQL function. |
| Email sending (`smtp-send.ts`) | **Keep** | Small and working. | `@soma/notify` (one function, `sendMail(opts)`), vendored to functions. |
| Agent pairing and delegation (PlayMaker `agent-pair-*.ts`, template `0002`, `0003`, `0006`) | **Merge** | Pairing should happen once per person, not once per app. | `soma.delegations`, `soma.agent_credentials`, `soma.agent_pairings` (section 2.2) plus `@soma/agent-door`. |
| Deployment checks `soma-ship-check.py` | **Keep** | It is the tier gate (STD §21). | Called by `soma-conform` as check C9. |
| Feedback queue and build requests (PlayMaker only) | **Package** | Every app needs the outer loop (STD §2, §15). | `@soma/feedback/server`: per-app tables, one forwarder to the estate board. |
| Error reporting, crash alarm (PlayMaker only); dead `soma-errors/` service | **Package; drop the dead service** | Every app needs it; the shared service has been dead since 07-08. | `@soma/errors` (client `installErrorReport()`, function handler `errorsHandler`), writing to `<app schema>.errors`. |
| Agent API, agent portal, `llms.txt` (PlayMaker only) | **Extract** | This is A2 and the AI door. | `@soma/commands` + `@soma/agent-door`. |
| AI host chat (V'Eric `manager-chat`, `convai-session`) | **Keep in the app** | The host's voice is the app's identity. | The kit provides the host record and the chat surface; the persona prompt stays per app. |
| Themes | **Keep in the app** | Taste is per app. | — |
| Reload on new deploy, share image | **Package** | Generic and small. | `@soma/shell` (`installDeployReload()`, OG image function). |
| Front-door analytics | **Package** | MVP tier requires analytics (STD §21). | `@soma/shell` writes `<app schema>.front_door_events` (PlayMaker's 0083 shape). |
| Community chat and video (Legends) | **Keep in Legends, not kit v1** | Legends is parked; no second app needs it on day one. | Revisit with SOMA Rooms. |
| Small UI pieces (toast, one voice at a time, resume, tooltip) | **Keep in the template** | They work as copied source. | `soma-app-template/src/lib/`; resume moves to `@soma/id` as `soma.people.last_location` per app (STD §12). |
| Five invitation variants (`soma-onboard`, `soma-invite/`, `soma-warm-invite/`, `soma-guest-gatehouse/`, PlayMaker's flow) | **One design: tickets** | Tickets is the only variant that is live, single-use and shared. | `soma-invite/`, `soma-warm-invite/`, `soma-guest-gatehouse/` move to `SOMA/standards/_archive/` with a pointer to `@soma/tickets`. |
| `soma-owner` (client-side owner secret) | **Drop** | Its own header says it is not a security boundary. | Membership role replaces it. |
| Legal pages (missing) | **Add** | MVP tier requires them; PlayMaker PR #86 has been open since 09-12. | `@soma/legal` generates `/terms`, `/privacy`, `/contact` from the contract's `legal` and `data_flows` blocks (see D1). |
| Four overlapping catalogs (`AFFORDANCES.md`, `SOMA-APP-STANDARD.md`, `SOMA-STANDARD-CHECKLIST.md`, `_shared/CAPABILITY-OWNERS.md`) | **Merge** | No single kit spec exists. | This spec becomes `soma-platform/docs/kit/KIT-SPEC.md`; the other three point to it; the checklist becomes the output of `soma-conform`. |

### C. Canon ideas: keep, defer or drop

| # | Idea | Decision | Where it lands |
|---|---|---|---|
| 1 | SOMA ID fast path | Keep, v1 | A1, section 2.3 |
| 2 | Two-tier profile | Keep, reshaped | `soma.seen` replaces `guide_seen` |
| 3 | Identity ladder, "Have we met?", self-knowledge | Keep, v1 | ladder states live in `@soma/id`; `soma.me.*` commands |
| 4 | Known device and invitations | Keep, v1 | `@soma/id` + tickets |
| 5 | Consent, visibility, revocation | Keep the behavior, defer the cryptography | `soma.app_consents`, `soma.delegations.revoked_at`; DIDs and erasure receipts deferred |
| 6 | Resume where you left off | Keep, v1 | `soma.memberships.last_location` |
| 7 | Introduce once | Keep, v1 | generalized by `soma.seen` |
| 8 | Personal AI that travels | Keep the door, defer our own consigliere | the person's own AI uses the AI door; SOMA builds no consigliere in v1 |
| 9 | Cross-app memory | Defer | `soma.answers` is the first, narrow slice |
| 10 | Guide Tell/Show/Do with risk gate | Keep, v1 | A2 |
| 11 | Agent Portal | Keep, v1 (extraction only) | `@soma/commands` |
| 12 | Front door is a conversation | Keep as an app choice | the kit's chat surface supports it; not a conformance check |
| 13 | AI door | Keep, v1 | `@soma/agent-door` |
| 14 | Tours | Keep, v1.1 | a tour is a declared workflow played in Show mode |
| 15 | Review with Bill | Keep, v1 | unseen `changes` told by the host |
| 16 | Host pair | Keep, v1, gate | contract `hosts`; check C7 |
| 17 | RSI loop | Keep the inner hook, defer personas | `@soma/feedback/server` forwarder |
| 18 | Intake as change membrane | Merge into 17 | no email-daemon dependency |
| 19 | In-place edit, three-answer review | Defer to v1.1 | template |
| 20 | Partner AI acting on your behalf (OBO) | Keep, v1 | `soma.delegations` |
| 21 | Signed provenance | Keep the build manifest only | `/.well-known/soma-build.json` emitted, warning-only (STD §23b) |
| 22 | Every mind gets credit | Keep, v1 | contract `credits`; served in `/.well-known/soma-app.json` and on `/about` |
| 23 | Accord and "We're aligned" | Defer | LEAD stops new Accord features |
| 24 | CoEvolution continuity | Drop from the kit | it is about personas, not apps |
| 25 | Elicitation front-of-funnel | Merge into A1 | `soma.answers` stores what was elicited, so no app re-asks |
| 26 | Community presence | Defer | Legends keeps its own |
| 27 | BYOK and KeyDrop | Defer | `@soma/meter` already has a `byok` billing mode |
| 28 | Honest UX | Keep, v1 | risk gate, cool-off, `soma.me.forget`, export |
| 29 | Preferences as sentences, who may act for you, voice consent | Keep "who may act for you" in v1 | `soma.delegations` list with revoke; the other two stay PlayMaker beads |
| 30 | Lineage: who acted with which key | Keep, v1 | `soma.receipts` (D2) |

### D. New capabilities (in neither input file)

#### D1. "Where your words go"

- **What it does:** every app shows, in plain sentences, which outside companies receive what the person types or says, and why ("Your script text goes to ElevenLabs to be read aloud").
- **Why SOMA needs it:** outside AIs and their vendors are now in every flow, and a person's own AI will ask this question on their behalf. An honest answer is the human↔AI trust axis made concrete. It also produces the hardest part of the privacy page for free.
- **Design:** the contract's `data_flows` array (`{vendor, what, why, retention}`) generates a `/where-your-words-go` page, a section of `/privacy`, and a block in `/.well-known/soma-app.json`. Check C12 greps the app's functions for known vendor hostnames (`api.openai.com`, `api.anthropic.com`, `api.elevenlabs.io`, `generativelanguage.googleapis.com`, `api.x.ai`, `api.stripe.com`) and fails when a vendor is called but not declared.

#### D2. Receipts and undo for anything done on your behalf

- **What it does:** a person sees one list, across all SOMA apps, of every action an AI took for them (ours or theirs), and can undo it within its window.
- **Why SOMA needs it:** "Do" and outside AIs both act for people. Trust in delegation without scopes (STD §14) holds only if the person can see and reverse what was done. Agent Portal audit records today live in page memory or in PlayMaker's `agent_actions`, which the person never sees.
- **Design:** table `soma.receipts` (section 2.2). Every command declares `undo` (another command id) or `undo: null`. Commands with `undo: null` and an effect are risk `high` or `irreversible` by rule. The identity origin serves `/receipts`, the person's cross-app list. Each app serves the same list filtered to itself through the command `soma.me.receipts`.

#### D3. The kit beacon

- **What it does:** each app publishes what kit version it runs and whether it last passed conformance, so drift shows up on a board instead of in a bug report.
- **Why SOMA needs it:** the feedback widget drifted silently in PlayMaker. Vendoring will drift again unless something reports it. Mike's rule is that gates fail loudly.
- **Design:** `/.well-known/soma-app.json` includes `kit.version`, `kit.manifest_sha256` and `conformance.last_pass_at`. A nightly job (`com.soma.kit-beacon`, or a scheduled Netlify function on the identity origin) reads every row in `soma.app_registry`, fetches each beacon, and posts a card when an app is more than one minor kit version behind or failed conformance.

#### D4. The stranger-AI test

- **What it does:** proves that a person's own AI, with nothing but the app's URL, can understand the app and complete one task for them.
- **Why SOMA needs it:** the brief says outside AIs are arriving (OpenAI Dots, ChatGPT Space and Pages, 2026-09-29). Our own tests use our own registry knowledge, so they cannot catch a door that only insiders can use.
- **Design:** `soma-conform --stranger-ai` runs two outside models (one Anthropic model through the Messages API, one OpenAI model through Codex `exec`) with a fixed prompt: "Here is a URL. Find out what this app is, who hosts it, and do <declared stranger task> for the test person whose agent token is in the environment." The check passes when the app's `soma.receipts` shows the command done by that agent within 5 minutes. The declared task lives in the contract as `stranger_task`. Warning at PROTOTYPE tier, gate at MVP tier.

#### D5. Attention budget

- **What it does:** SOMA apps share one count of how many times today they interrupted a person (greetings, nudges, tours, emails) and back off when the person has had enough.
- **Why SOMA needs it:** "be known" across many apps, each with a talkative AI host, becomes noise fast. The kindness principle and Mike's own three-decisions-a-day rule (LEAD rule 3) are the same idea applied to users.
- **Design:** `soma.interruptions (person_id, app_id, kind, at)`; `@soma/id` exposes `mayInterrupt(kind): Promise<boolean>` with a default budget of 3 proactive interruptions per person per day across all apps. Asked questions, replies and person-started actions never count. v1.1, not v1.

## 2. The architecture

### 2.1 The five parts and how they connect

1. **Identity** (`soma.people`, identity origin, `@soma/id`) answers "who is this".
2. **Knowledge of what a person has seen** (`soma.seen`, `soma.answers`) answers "what do they already know and what have they told us".
3. **The action registry** (`@soma/commands`, contract `commands`) answers "what can be done here, by whom, at what risk".
4. **Consent** (`soma.app_consents`, `soma.delegations`) answers "what may this app read, and who may act for this person".
5. **The AI-visitor door** (`@soma/agent-door`) answers "how does an outside AI read and act".

They connect at one call. Every action, from a person's click, our Guide, or an outside AI, goes through `invoke(id, args, actor)`. `invoke` resolves the actor through identity, checks consent and delegation, applies the risk gate, runs the command, writes a receipt, and marks the related concept as done in `soma.seen`. One path means one audit trail and one test surface.

### 2.2 Data model

**Placement rule.** Shared kit tables go in a new Postgres schema `soma` in the shared project. Each new app's own tables go in a schema named `app_<id>` (for example `app_veric`). PlayMaker's existing `public` tables stay where they are, because moving them would break Eric's app for no user benefit. The existing shared tables in `public` (`tickets`, `ticket_requests`, `entitlements`, `usage_events`) also stay; ownership of their DDL moves from PlayMaker migrations to `soma-platform/packages/*/sql/`. No new table may be created in `public`. The `soma` and `app_<id>` schemas are added to the project's exposed API schemas through the Management API (`PATCH /v1/projects/omfwcodoimjmbrhssvfl/postgrest`, `db_schema`).

**Shared tables (owner: soma-platform; migrations in `soma-platform/sql/soma/NNNN_*.sql`).**

```sql
create schema if not exists soma;

create table soma.people (
  person_id     uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  name_source   text check (name_source in ('self','inviter','account')),
  is_ai         boolean not null default false,       -- UX only (STD §14)
  ai_principal  uuid references soma.people(person_id), -- set for a person's own AI
  prefs         jsonb not null default '{}'::jsonb,    -- voice, motion, register
  created_via   text not null check (created_via in ('signin','ticket','pairing','backfill')),
  created_at    timestamptz not null default now(),
  erased_at     timestamptz
);

create table soma.app_registry (
  app_id            text primary key check (app_id ~ '^[a-z][a-z0-9-]{1,31}$'),
  name              text not null,
  origins           text[] not null,                  -- https origins allowed to handshake
  human_host        uuid not null references soma.people(person_id),
  ai_host           uuid not null references soma.people(person_id),
  tier              text not null default 'prototype' check (tier in ('prototype','mvp')),
  contract_sha256   text not null,
  kit_version       text not null,
  created_at        timestamptz not null default now()
);

create table soma.memberships (
  person_id     uuid references soma.people(person_id) on delete cascade,
  app_id        text references soma.app_registry(app_id),
  role          text not null default 'member' check (role in ('guest','member','admin','owner')),
  trust         text not null check (trust in ('vouched','verified')),
  invited_by    uuid references soma.people(person_id),
  ticket_id     uuid,                                 -- public.tickets.id
  relationship  text,
  context       jsonb not null default '{}'::jsonb,   -- what they were invited into
  last_location text,                                 -- STD §12 resume
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  primary key (person_id, app_id)
);

create table soma.app_consents (
  person_id   uuid references soma.people(person_id) on delete cascade,
  app_id      text references soma.app_registry(app_id),
  fields      text[] not null default '{display_name}', -- allowed: display_name, email, apps_used, seen_soma, answers_shared
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  primary key (person_id, app_id)
);

create table soma.seen (
  person_id   uuid references soma.people(person_id) on delete cascade,
  concept_id  text not null check (concept_id ~ '^(soma|[a-z][a-z0-9-]*):[a-z0-9.:-]+$'),
  kind        text not null check (kind in ('told','shown','done')),
  app_id      text not null references soma.app_registry(app_id),
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  count       int not null default 1,
  primary key (person_id, concept_id, kind)
);

create table soma.answers (
  person_id    uuid references soma.people(person_id) on delete cascade,
  question_id  text not null,                          -- 'soma:what-to-call-you', 'veric:goal'
  answer       jsonb not null,
  app_id       text not null references soma.app_registry(app_id),
  shared       boolean not null default false,         -- true = other apps may read it
  answered_at  timestamptz not null default now(),
  primary key (person_id, question_id)
);

create table soma.delegations (
  id            uuid primary key default gen_random_uuid(),
  principal_id  uuid not null references soma.people(person_id) on delete cascade,
  agent_id      uuid not null references soma.people(person_id) on delete cascade,
  app_id        text references soma.app_registry(app_id), -- null = every SOMA app
  max_risk      text not null default 'medium' check (max_risk in ('low','medium','high')),
  label         text,                                   -- 'My ChatGPT', 'Izzy'
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  check (principal_id <> agent_id)
);
create unique index delegations_live_uq on soma.delegations (principal_id, agent_id, coalesce(app_id,'*'))
  where revoked_at is null;

create table soma.agent_credentials (                  -- generalizes PlayMaker 0029
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references soma.people(person_id) on delete cascade,
  token_hash   text not null unique,                    -- sha256 of 'soma_agent_…'
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create table soma.receipts (
  id             uuid primary key default gen_random_uuid(),
  app_id         text not null references soma.app_registry(app_id),
  command        text not null,
  args_digest    jsonb not null,                        -- strings cut to 200 chars
  risk           text not null check (risk in ('none','low','medium','high','irreversible')),
  actor_id       uuid references soma.people(person_id),
  actor_via      text not null check (actor_via in ('ui','guide','in-page','remote','mcp')),
  on_behalf_of   uuid references soma.people(person_id),
  outcome        text not null check (outcome in ('ok','refused','failed','needs_confirmation','undone')),
  reason         text,
  undo_command   text,
  undo_until     timestamptz,
  created_at     timestamptz not null default now()
);
create index receipts_person_idx on soma.receipts (on_behalf_of, created_at desc);
```

**RLS on shared tables (every table has RLS enabled; the conformance check C10 fails otherwise).**

- `soma.people`: a person selects and updates their own row. Nobody else selects it directly. Apps read other people only through `soma.person_view(p_app text, p_person uuid)`, a `security definer` function that returns only the fields named in a live `soma.app_consents` row. (The Supabase bug about `security definer` helpers losing `request.jwt.*` affects policy clauses, not called RPCs; `soma-app-template/supabase/migrations/0002_delegations.sql` header.)
- `soma.app_registry`: readable by everyone; written only by the service role during provisioning.
- `soma.memberships`: a person selects their own rows; an app admin selects rows for their app through `soma.is_admin(app_id)`; inserts come only from the identity origin's functions and `ticket_use`.
- `soma.app_consents`: own rows only, read and revoke; grants come from the identity origin.
- `soma.seen`, `soma.answers`: own rows read and write; an app writes rows with its own `app_id` for the signed-in person or for a principal whose live delegation covers the caller (`soma.acts_for(principal uuid, app text)`, written `stable`, not `security definer`, for the reason above). Another app reads `soma:*` concepts always, app concepts never, and answers only where `shared = true` and consent includes `answers_shared`.
- `soma.delegations`: principal manages; agent selects its own; creation during pairing goes through the identity origin with the service role.
- `soma.receipts`: the person in `on_behalf_of` or `actor_id` selects; app admins select their app's rows; inserts only from `@soma/commands` server code using the caller's session (never the service role, matching Agent Portal §7.2).

**Per-app tables (owner: the app; migrations generated by the scaffolder into `supabase/migrations/` from kit templates, all in `app_<id>`).**

| Table | From | Columns (main) |
|---|---|---|
| `feedback_items` | `@soma/feedback/server` | id, kind (bug/idea/praise), body, page, person_id, evidence jsonb, status, created_at |
| `build_requests` | `@soma/feedback/server` | id, feedback_id, title, status (open/building/demo/shipped/declined), demo_url, pr_url, updated_at |
| `changes` | `@soma/changes` | id, title, body, status (requested/approved/shipped/dropped), audience (everyone/admins), concept_id, requested_by, approved_by, pr_url, shipped_at |
| `errors` | `@soma/errors` | id, fingerprint, message, stack, page, person_id, build_sha, count, first_at, last_at |
| `front_door_events` | `@soma/shell` | PlayMaker 0083 shape |
| `command_requests` | `@soma/agent-door` | PlayMaker 0081 `agent_command_requests` shape (idempotency) |

This follows §15b (federate queues) and `soma-onboard-identity-v0.md` §3 (converge identity and membership, federate app data).

### 2.3 Identity: the handshake

**Where it lives.** A Netlify site `soma-id` at `https://id.mike-wolf.com`, source in `soma-platform/apps/soma-id/`. It is the only place a browser keeps a long-lived SOMA session. `mike-wolf.com` is owned and already hosts `playmaker.mike-wolf.com` and `srmw.mike-wolf.com`, so new apps on `<app>.mike-wolf.com` are same-site with the identity origin.

**Silent path, same-site apps (returning to an app you have joined).**

1. `@soma/id` `connect()` inserts a hidden iframe `https://id.mike-wolf.com/frame?app=<app_id>`.
2. The frame checks its own Supabase session and the person's `soma.memberships` row for that app.
3. If both exist, the frame calls `POST https://id.mike-wolf.com/api/mint` with its own access token. The function verifies the token, generates a one-time magic-link token for that user with the admin API (`auth.admin.generateLink({ type: 'magiclink', email })`), and returns only the `hashed_token`.
4. The frame posts `{ type: 'soma-id:code', tokenHash }` to the parent, checked against `soma.app_registry.origins`.
5. The app calls `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` and gets its own session with its own refresh token. No token is shared between origins.

**Offered path, a new app.** Step 2 finds a session but no membership. The frame becomes visible as a small chip drawn by the identity origin: "Continue as Greg". The app's code cannot read the chip's content, so the app learns nothing until the tap. The tap creates the membership (`trust='verified'`), a consent row with `fields = '{display_name}'`, and then runs steps 3 to 5. The AI host then greets by name and says where the name came from: "You signed in to SOMA on Legends."

**Cross-site apps (legendsofbasketball.com, `*.netlify.app`).** No silent path. A "Sign in with SOMA" button does a top-level redirect to `https://id.mike-wolf.com/authorize?app=<id>&return=<url>` and returns with `#soma_code=<hashed_token>`. Third-party storage is never used.

**Anonymous visitors.** They are not recognized across apps. The app keeps only pm-kgn's marker, which records that this device has been here and never who. A typed name or email is stored at the identity origin, not in the app's storage, and is shown back only through the identity origin's chip.

**Client API (`@soma/id`, vendored; also inside `soma-kit.js`).**

```ts
export interface SomaPerson {
  personId: string; displayName: string | null; isAi: boolean;
  trust: 'vouched' | 'verified'; role: 'guest' | 'member' | 'admin' | 'owner';
  appsUsed?: string[];                      // only when consented
}
export interface SomaId {
  connect(opts?: { silentOnly?: boolean }): Promise<SomaPerson | null>;
  person(): SomaPerson | null;
  hasSeen(conceptId: string, kind?: 'told' | 'shown' | 'done'): Promise<boolean>;
  markSeen(conceptId: string, kind: 'told' | 'shown' | 'done'): Promise<void>;
  answer(questionId: string): Promise<unknown | undefined>;
  saveAnswer(questionId: string, answer: unknown, opts?: { shared?: boolean }): Promise<void>;
  describeMe(): Promise<string>;            // plain-English "what you know about me"
  forget(scope: 'this-app' | 'everywhere'): Promise<void>;
  saveLocation(path: string): Promise<void>; lastLocation(): Promise<string | null>;
}
export function createSomaId(opts: {
  appId: string; supabase: SupabaseClient; idOrigin?: string; // default https://id.mike-wolf.com
}): SomaId;
```

**Shared concepts.** `@soma/id` ships the `soma:*` concepts once: `soma:what-is-soma`, `soma:host-pair`, `soma:feedback-chip`, `soma:bring-your-ai`, `soma:your-ai-partners`, `soma:forget-me`. An app may not redefine them. This is how no app re-tells a person what SOMA is.

### 2.4 The action registry and the risk gate

**Package `@soma/commands` (vendored).** It is extracted from `playmaker/src/agent-portal/` with PlayMaker's names kept, so PlayMaker can switch with no behavior change.

```ts
export type Risk = 'none' | 'low' | 'medium' | 'high' | 'irreversible';
export interface CommandSpec {
  id: string; title: string; description: string;
  kind: 'effect' | 'view' | 'inspection';
  risk: Risk; auth: 'viewer' | 'editor' | 'owner' | 'admin';
  surfaces: Array<'page' | 'remote'>;
  args: Record<string, ArgSpec>;
  undo?: string | null;                    // command id that reverses this one
  concept?: string;                        // concept marked 'done' on success
  steps?: StepScript[];                    // static-site implementation only
}
export interface Actor { kind: 'person' | 'ai'; name?: string; via: 'ui'|'guide'|'in-page'|'remote'|'mcp'; personId?: string; onBehalfOf?: string }
export function createRegistry(catalogue: CommandSpec[], opts: { appId: string; id: SomaId; receipts: ReceiptSink }): Registry;
export interface Registry {
  provide(impls: Record<string, { run(args: any): unknown; unavailable?(args: any): string | null }>): void;
  invoke(id: string, args: unknown, actor: Actor): Promise<InvokeResult>;
  list(): CommandSpec[]; describe(id: string): CommandSpec & { available: boolean; reason?: string };
  state(): unknown; audit(): Receipt[];
}
export function gate(spec: CommandSpec, actor: Actor, delegation: Delegation | null): 'run' | 'confirm' | 'cool-off' | 'refuse';
export function installWindowSoma(registry: Registry): void; // merges into window.soma
```

**Risk levels and the gate.** The rule is the same for every actor.

| Risk | Meaning | Person in the UI | Our Guide, for the signed-in person | A paired AI, remote |
|---|---|---|---|---|
| `none` | inspection or view | run | run | run |
| `low` | reversible, own data only | run | confirm once in chat | run if `max_risk >= low` |
| `medium` | reversible, others can see it | run | confirm | run if `max_risk >= medium` (default) |
| `high` | spends money, messages a person, shares data out of the app | confirm | confirm, routed to the person | returns `needs_confirmation` with a confirm link the person taps; never runs unattended |
| `irreversible` | deletes data or cannot be undone | confirm plus 10-second cool-off | refuse; show the person the control instead | refuse |

A command with an effect and no `undo` cannot be declared below `high`; the contract validator enforces this. This keeps STD §14's trust model (no scope matrix) and adds one ceiling the person controls.

**How Ask/Show/Do uses it.** The Guide engine gains three calls into `window.soma.commands`: `list()` to know what can be done, `describe(id)` to say why something cannot be done right now, and `invoke(...)` with `actor = { kind: 'ai', name: <ai host>, via: 'guide', onBehalfOf: person }`. Show reads the app's workflow declarations (`src/agent-portal/workflows.ts` in PlayMaker; `workflows` in the contract for static sites) and highlights `[data-command="<id>"]` for each step through `this._host.highlight`. Selector scripts survive only as the `steps` implementation for static sites.

**AI-only commands.** Only `kind: 'inspection'` commands may lack a control (Mike's ruling 2026-09-18). The mapping check enforces it.

### 2.5 The AI-visitor door

Package `@soma/agent-door` (vendored into Netlify functions). It gives every app the same three entrances.

1. **Read, no sign-in.**
   - `GET /llms.txt`: generated from the contract: name, one-line pitch, host pair, concepts with one-line explanations, a link to the command list, the pairing URL, and "Where your words go".
   - `GET /.well-known/soma-app.json`: the public part of the contract plus the kit beacon (D3) and credits.
   - `GET /api/agent/v1/commands`: remote-capable commands with JSON Schema for arguments (PlayMaker shape, Agent Portal §7.1).
2. **Act, after pairing.**
   - Pairing happens at the identity origin, `https://id.mike-wolf.com/pair`, using the §14a flow generalized from PlayMaker's `agent-pair-*.ts`. The person approves; the AI receives a `soma_agent_…` token; `soma.delegations` gets a row with `app_id = null` by default, so the pairing works in every SOMA app.
   - `POST /api/agent/v1/commands/<id>` with `{ args, onBehalfOf?, expectedRevision? }` and `Idempotency-Key`. The handler `agentDoor.commands(req)` resolves the token to a short-lived Supabase session for the AI's own account and runs the command under RLS. It never runs a command with the service role.
   - `POST /api/agent/v1/mcp`: a Streamable HTTP MCP server whose tools are the same remote commands, for Claude, ChatGPT and other MCP clients. Auth is the same bearer token in v1.
3. **The portable prompt (STD §19).** `@soma/agent-door` renders the copy block from the same fact block as `llms.txt`, so the two never drift (this answers §19's open decision 3: one source, two renderings).

The function signature every app mounts:

```ts
export function createAgentDoor(opts: {
  appId: string; contract: SomaAppContract; catalogue: CommandSpec[];
  remoteImpls: Record<string, (ctx: RemoteCtx, args: any) => Promise<unknown>>;
  supabaseUrl: string; anonKey: string; serviceKeyForMintOnly: string;
}): { llmsTxt: Handler; wellKnown: Handler; commands: Handler; mcp: Handler };
```

### 2.6 Package boundaries and delivery

| Package | Delivery | Why |
|---|---|---|
| `@soma/id`, `@soma/signin`, `@soma/commands`, `@soma/agent-door`, `@soma/tickets`, `@soma/meter`, `@soma/feedback`, `@soma/changes`, `@soma/errors`, `@soma/shell`, `@soma/notify`, `@soma/legal` | **Vendored** by the scaffolder into `src/lib/soma/<pkg>/` or `netlify/functions/lib/soma/<pkg>/`, with `soma-kit.manifest.json` (kit tag, sha256 per file) | They run inside the app's build or functions, must typecheck with the app, and must be reviewable in PlayMaker's PRs. No npm publish is needed, so Netlify builds need no registry token. The manifest makes drift a failing check (C8) instead of a silent fork. |
| `soma-guide` engine | **CDN**, `https://soma-guide.netlify.app/v1/soma-guide.js` | Static sites cannot vendor and build. Always-latest is the Guide's purpose (`SOMA-DELIVERY.md`). A major-version path limits the blast radius that `soma-platform/CLAUDE.md` warns about. |
| `soma-kit.js` (static bundle of id + signin + commands-lite + feedback widget) | **CDN**, `/v1/soma-kit.js` | It is how plain static sites like Legends get the kit. |
| Identity origin `soma-id` | **Service**, one Netlify site | It must be one origin by definition. |
| `@soma/scaffolder`, `@soma/conformance` | **Run from the soma-platform checkout** | They are tools, not app code. |

Package dependencies point one way: `signin → id`; `commands → id`; `agent-door → commands`; `changes → id` (for `soma.seen`); `tickets → id` (to create the membership). Nothing in the kit imports app code.

**Shared project versus per app.** The shared project holds every table, because there is one Supabase project. What is "shared" is the `soma` schema (people, memberships, consents, seen, answers, delegations, credentials, receipts, app registry) and the existing `public` tickets and meter tables. What is "per app" is everything in `app_<id>` and, for PlayMaker, everything in `public` that it owns today.

## 3. The contract an app signs

### 3.1 What an app declares: `soma.app.json`

It extends the scaffolder's existing schema (`soma-platform/packages/soma-scaffolder/schema/soma-app.schema.json`) with five new blocks. Example for the second app if it is V'Eric coaching:

```json
{
  "$schema": "https://soma-guide.netlify.app/v1/soma-app.schema.json",
  "app_id": "veric",
  "name": "V'Eric",
  "pitch": "Coaching from Eric's practice, with an AI colleague who knows his method.",
  "origins": ["https://veric.mike-wolf.com"],
  "tier": "prototype",
  "hosts": {
    "human": { "name": "Eric Kohner", "email": "<eric's address>" },
    "ai": { "name": "V'Eric", "persona": "personas/veric.md", "avatar": "/veric.png" }
  },
  "concepts": [
    { "id": "veric:first-session", "title": "Book a first session", "tell": "…", "workflow": "book-first-session" }
  ],
  "questions": [
    { "id": "veric:goal", "text": "What do you want from coaching?", "shared": false }
  ],
  "commands": [
    { "id": "session.book", "title": "Book a session", "kind": "effect", "risk": "medium",
      "undo": "session.cancel", "auth": "viewer", "surfaces": ["page","remote"],
      "args": { "slot": { "type": "string", "required": true } }, "concept": "veric:first-session" },
    { "id": "session.cancel", "title": "Cancel a session", "kind": "effect", "risk": "low",
      "undo": "session.book", "auth": "viewer", "surfaces": ["page","remote"],
      "args": { "sessionId": { "type": "string", "required": true } } }
  ],
  "workflows": [ { "id": "book-first-session", "steps": ["view.dialog:booking", "session.book"] } ],
  "stranger_task": { "command": "session.book", "args": { "slot": "next-available" } },
  "data_flows": [ { "vendor": "Anthropic", "what": "your messages to V'Eric", "why": "to write replies", "retention": "not used for training" } ],
  "legal": { "operator": "<entity Mike names>", "contact": "<support address>" },
  "credits": [ { "name": "Eric Kohner", "role": "human host" }, { "name": "V'Eric", "role": "AI host", "substrate": "Claude" } ],
  "kit": { "version": "1.0.0" }
}
```

### 3.2 What the app gets in return

- Sign-in, the silent and offered handshakes, and the known-device card.
- Greeting by name, with no re-telling of SOMA and no re-asking of shared answers.
- The AI host in the chat surface with Ask, Show and Do wired to its commands.
- The AI door: `llms.txt`, `/.well-known/soma-app.json`, remote API, MCP, pairing, the portable prompt.
- Invitations (tickets with QR and link), the feedback chip and queue, the changelog with "What's new", error reports, the usage meter, deploy reload, analytics, share images.
- Generated `/terms`, `/privacy`, `/contact`, `/about` (with credits) and `/where-your-words-go`.
- Receipts and undo for every action done on a person's behalf.
- A row in `soma.app_registry`, a beacon, and a place on the kit board.

### 3.3 The conformance check

Package `@soma/conformance`, CLI `soma-conform`. Run from the soma-platform checkout:

```bash
node packages/soma-conformance/bin/soma-conform.mjs \
  --contract /path/to/app/soma.app.json \
  --repo /path/to/app \
  --url https://veric.mike-wolf.com \
  --tier prototype            # or mvp
# add --stranger-ai to run D4; add --json for machine output
```

It exits non-zero on the first failing hard check and prints every result. Each check is also runnable alone with `--only C<n>`.

| Id | Check | How it runs | Tier |
|---|---|---|---|
| C1 | Contract is valid | JSON Schema validation (ajv) plus the rule "effect without undo is at least `high`" | both, hard |
| C2 | Registry row matches | `select contract_sha256, kit_version from soma.app_registry where app_id = $1` equals the file's hash | both, hard |
| C3 | Hosts are real | both host ids resolve in `soma.people`; the AI host has `is_ai = true` | both, hard |
| C4 | Read door | `curl -fsS $URL/llms.txt`, `$URL/.well-known/soma-app.json`, `$URL/api/agent/v1/commands` return 200; the command list equals the contract's remote commands | both, hard |
| C5 | Mapping check | `npm --prefix $REPO run test:commands` (the kit ships the test; it is PlayMaker's `agent-portal-workflows.test.ts` generalized) | both, hard |
| C6 | Concepts complete | every concept has `tell`; every `workflow` exists; every workflow step is a declared command | both, hard |
| C7 | Identity wired | headless Chromium loads `$URL` with a test person's identity-origin session and sees the "Continue as" chip within 5 s; after a scripted tap, `window.soma.id.person().personId` is set | both, hard |
| C8 | No drift | every file in `soma-kit.manifest.json` hashes to the manifest value | both, hard |
| C9 | Ship gate | `python3 ~/Projects/SOMA/tools/ship/soma-ship-check.py $URL --tier $TIER --expect-llms` | both, hard |
| C10 | RLS everywhere | `select schemaname, tablename from pg_tables where schemaname in ('soma', 'app_' \|\| $APP) and not rowsecurity` returns no rows (run through the Management API SQL endpoint) | both, hard |
| C11 | Risk gate holds | the remote API, called with a paired test AI on a `high` command, returns `needs_confirmation` and writes a receipt with that outcome | both, hard |
| C12 | Data flows declared | `rg -l "api\.openai\.com\|api\.anthropic\.com\|api\.elevenlabs\.io\|generativelanguage\.googleapis\.com\|api\.x\.ai\|api\.stripe\.com" $REPO/netlify $REPO/src` maps only to declared vendors | prototype warn, mvp hard |
| C13 | Stranger AI | D4 | prototype warn, mvp hard |
| C14 | Legal pages | `/terms`, `/privacy`, `/contact` have content and name `legal.operator` | prototype warn, mvp hard |

On success it writes `conformance.last_pass_at` into the app's beacon through `POST https://id.mike-wolf.com/api/beacon` (service-signed), so the board shows it.

## 4. Migration

### 4.1 Order of work

Three builder lanes run at once (LEAD rule 2). Each step is one bead in the soma-platform store unless it says PlayMaker. Every PlayMaker step is a pull request to Eric's repo, merged through `pr-merge-green`. Any step that changes a screen Eric sees ships on his weekly day (LEAD rule 7). Steps marked "no UI" can ship any day.

| Step | Lane | Work | Proof it is done |
|---|---|---|---|
| M0 | Claude | Merge this spec as `docs/kit/KIT-SPEC.md`; add §22 text to SOMA origin/main | merged links |
| M1 | A | Create the `soma` schema, tables and RLS (`soma-platform/sql/soma/0001_core.sql`); expose `soma` in the API; backfill `soma.people` from `auth.users` and `public.soma_profiles`; backfill `soma.memberships` for `playmaker` (from `public.memberships`) and `legends` (from `soma_profiles.apps_used`); copy `guide_seen` into `soma.seen` as `legends:*` concepts | C10 passes on `soma`; row counts match `auth.users` |
| M2 | B | Extract `@soma/commands` from `playmaker/src/agent-portal/` with its tests; PlayMaker unchanged | package tests pass; byte-diff report against PlayMaker source |
| M3 | C | DNS: `id`, `veric`, `olli`, `app2` CNAMEs under `mike-wolf.com` (GoDaddy UI, done by Yeshie with Mike's approval click only if the session needs a fresh login); deploy an empty `soma-id` site | `curl -I https://id.mike-wolf.com` is 200 |
| M4 | A | Build the identity origin: `/frame`, `/authorize`, `/pair`, `/receipts`, `/api/mint`, `/api/beacon`; build `@soma/id` | C7 passes against a test page on `app2.mike-wolf.com` |
| M5 | B | `@soma/tickets`: `ticket_create` accepts `soma.memberships` or PlayMaker's studio membership (both); `ticket_use` creates a `soma.memberships` row with `trust='vouched'`; merge onboard's QR and senders | PlayMaker's ticket tests pass unchanged; a new test proves the vouched edge |
| M6 | C | `@soma/agent-door` and `@soma/conformance` (C1 to C12) | `soma-conform` runs green against the scaffolded test app |
| M7 | B | Scaffolder: read `soma.app.json`, vendor all kit packages with the manifest, generate `app_<id>` migrations, write `provision.mjs` for react-app output (Netlify site, env, DNS check, registry row) | standup-check `--full` green (section 5) |
| M8 | PlayMaker PR, no UI | Switch `src/agent-portal/*` to vendored `@soma/commands` | PlayMaker's existing mapping check and `scripts/agent-api-smoke.mjs` pass unchanged on production |
| M9 | PlayMaker PR, no UI | Add `soma.app.json`, serve `/.well-known/soma-app.json` and the beacon; register `playmaker` in `soma.app_registry` | C2, C4, C8 green for PlayMaker |
| M10 | PlayMaker PR, UI, Eric's day | `@soma/id` behind `VITE_SOMA_ID=1`: the known-device card uses the identity origin; "Continue as" for people who have used Legends | C7 green; Eric sees it in a preview first |
| M11 | PlayMaker PR, no UI | Remote API writes `soma.receipts` in addition to `agent_actions`; pairing at the identity origin accepted alongside PlayMaker's own | C11 green; existing PlayMaker AI tokens still work |
| M12 | Legends (machine-side only; Legends is parked) | Swap per-page scripts for `/v1/soma-kit.js`; move its one action to a command declaration with a step script; identity block reads `soma.id` | Bill's action still works on the Site Change Log page; 22 pages load the guide |
| M13 | B | `@soma/changes`, `@soma/legal`, `@soma/errors`, `@soma/shell` | each package's tests; legal pages render in the test app |
| M14 | All | The second-app test (section 5) | the timed run's log and links |

**What never changes for Eric.** PlayMaker's tables stay in `public`. PlayMaker's AI tokens keep working through M11. Every PlayMaker change is a PR with the existing checks green. No PlayMaker screen changes outside his weekly day.

### 4.2 What is retired, and when

- After M5: `soma-onboard`'s member tables are not created for any new app.
- After M10: `appAdmin.ts` allowlists are replaced by `soma.is_admin`.
- After M12: `packages/auth`, `lms/js/soma-auth.js`, `legends-connect/js/soma-auth.js`, `packages/soma-owner`, and the standards folders `soma-invite/`, `soma-warm-invite/`, `soma-guest-gatehouse/` are archived with pointers.
- `public.soma_profiles` stays read-only for one month after M12, then is dropped (Mike approves the drop because it deletes data; LEAD rule 4).

## 5. The second-app test

**Definition.** A new app stands up on the kit when all of these are true on its live URL:

1. `soma-conform --tier prototype` exits 0 (C1 to C11 hard; C12 to C14 may warn).
2. A test person who signed in on PlayMaker opens the new app in the same browser, sees "Continue as <name>", taps once, and is greeted by name with the source named. No login screen appears.
3. That person asks the AI host "how do I <concept>" for each of three declared concepts and gets an answer; asks "show me" and sees the controls highlighted in order; asks "do it for me" for one `low` or `medium` command, confirms, and the receipt appears at `id.mike-wolf.com/receipts`.
4. The AI host does not explain what SOMA is to that person, because `soma:what-is-soma` is already in `soma.seen`.
5. An outside AI (D4) with only the URL and a paired test token completes `stranger_task`.
6. The feedback chip writes a row to `app_<id>.feedback_items`, and a ticket minted in the app admits a second test person as `vouched`.

**Who runs it.** A Cursor or Codex builder from one bead, not Claude. Claude only writes the bead.

**Time target.** Four working hours or less, wall clock, from `node bin/soma-scaffold.mjs new soma.app.json` to item 6, with zero commits to soma-platform during the run. The app's own domain logic (for V'Eric, booking) is excluded and timed separately. Writing `soma.app.json` is included.

**Measurement.** `npm run standup-check -- --full --contract <file>` extends today's tool (`soma-platform/packages/soma-scaffolder/tools/standup-check.mjs`) with timed phases: scaffold, install, typecheck, build, provision, deploy, conformance. It appends one row to `soma-platform/docs/kit/standup-log.jsonl`. The time to beat for the plumbing alone is today's 6.59 s; the target for the full run is four hours because deploy, DNS and the AI host's persona are real work.

**A run that needs a soma-platform edit fails the test.** The fix goes into the kit, and the clock restarts.

## 6. Product questions for Mike

1. **Which domain is the identity origin?** Recommendation: `id.mike-wolf.com` now, because you own it, it already hosts PlayMaker, and same-site apps get the silent path. A SOMA-branded apex can come later; moving the identity origin then costs one re-sign-in per person.
2. **What does a new SOMA app promise a person on arrival?** Recommendation: "We show your name only after you tap Continue, and we tell you where we learned it." This modifies STD §16's "already knows who you are the moment you arrive", so it is your call.
3. **May a person's own AI act without them present?** Recommendation: yes for `low` and `medium` actions by default, never for `high` or `irreversible`, with the ceiling adjustable per AI. This adds one ceiling to STD §14's "trust, not least-privilege", so it is your call.
4. **Who is the operator named in the terms and privacy pages?** Recommendation: the LLC you filed with Stripe for SOMA-wide apps, with PlayMaker naming both the LLC and Ekcosystem LLC because of the 50/50 MOU. This is a legal and money question.
5. **What does "forget me" erase?** Recommendation: two buttons. "Forget me here" removes the membership, consents, answers and seen-records for one app. "Delete my SOMA ID" erases everything everywhere after a 7-day cool-off, with an emailed receipt.

## 7. Assumptions to test with a person

| Assumption | Cheap test, no code |
|---|---|
| People like being greeted by name in an app they never used, when the source is named. | Show five people two screenshots of the arrival (silent greeting versus "Continue as Greg") made on the PlayMakers canvas; ask which feels right and why. |
| People who use ChatGPT or Claude will hand it a SOMA app. | Ask five such people to paste PlayMaker's portable prompt into their own AI while you watch on Zoom; count how many act on the answer. |
| People want "do it for me" more than "show me". | Wizard of Oz: Mike or Eric plays the AI host over Zoom while a writer uses PlayMaker for 20 minutes; tally "show me" versus "do it". |
| An invitation with the inviter's personal line converts better than a bare link. | Eric sends five ticket links with a line and five without; count arrivals. |
| A host pair is easy to name for a new app. | Give Eric the `hosts` and `concepts` blocks as a paper form for V'Eric; time how long he takes and note what he asks. |
| Outside AIs already visit our apps. | Read PlayMaker's Netlify logs for `/llms.txt` and `/api/agent/v1/*` hits by user agent over the last 30 days. |

## 8. Resolving the 14 contradictions

1. **Identity substrate: Supabase row.** The `soma.people` row keyed to `auth.users(id)` wins, because both live apps already run on it and DIDs solve AI↔AI brokering, which is not current work. A `soma.person_keys` table can add DIDs later without changing the person id.
2. **Silent or offered: both, by case.** Returning to an app you joined is silent (STD §16). Entering a new app is offered with one tap (`SOMA-IDENTITY-STATES.md`), because joining a new app discloses data and needs consent.
3. **What the device remembers: nothing about who.** The app's storage keeps only pm-kgn's "this device has been here" marker. A typed name or email lives at the identity origin, which is first-party to itself, so the ladder still works without the app storing identity.
4. **Trust model for AI partners: STD §14 plus a risk ceiling.** Delegations stay unscoped as §14 says, and each delegation carries `max_risk` (default `medium`), and `high` or `irreversible` actions always need the person. Two-signature requests are not adopted, consistent with Mike's "not yet" on 2026-09-20.
5. **How identity crosses sites: one identity origin.** Same-site apps use a hidden iframe on `id.mike-wolf.com`; cross-site apps use a top-level redirect. Anonymous visitors are not linked across sites, because that would be tracking.
6. **Invitations: tickets mint a SOMA membership.** `@soma/onboard`'s per-app member tables are dropped for new apps, and a used ticket creates a `soma.memberships` row with `trust='vouched'`, as `soma-onboard-identity-v0.md` proposes. App-specific profile fields stay in the app's schema.
7. **AI-only commands: inspection only.** The 2026-09-18 ruling is later and more specific than the spec's original sentence, so inspection commands may lack a control and nothing else may. The Agent Portal spec revision 3 already says this.
8. **Vendors: Supabase and Netlify.** Clerk and Vercel in `full-app-capability-v1.md` are dropped, because the canon, both live apps and `_shared/CAPABILITY-OWNERS.md` say SomaAuth on Supabase and Netlify.
9. **Feedback routing: per-app tables, one forwarder.** Feedback and build requests stay per app (§15b). One forwarder in `@soma/feedback/server` posts each new item to the estate board inbox over HTTPS, which removes the email-daemon dependency that §8 and `SOMA-INTAKE.md` carry.
10. **Greeting: by name only after consent, with the source named.** §16's greeting happens after the "Continue as" tap. It satisfies §19, because §19 forbids a host claiming knowledge it does not have, and this host says where its knowledge came from.
11. **Clause numbering: land §22 and cite by slug.** Commit §22 to SOMA origin/main as step M0, and have the kit spec cite clauses by slug (`std:soma-id`, `std:ai-door`) as well as number, so a renumbering cannot break a reference.
12. **Campus personas versus hosts: different roles.** Campus personas get Tell and Show only. App hosts get Do, bounded by the person's own authority and the risk gate, so "full authority" means the person's authority, never more.
13. **Name clash: three names.** "Agent Portal" is the command registry's AI-facing interface. "AI door" is the whole entrance for a visitor's own AI (read, act, portable prompt). The SRMW site's page keeps the name "AI reading room", which the estate already uses.
14. **Scope of the kit: what the second app needs on day one.** LEAD's four parts are done, and the brief asks for more, so the kit's scope is defined by the second-app test in section 5. Extracting the Agent Portal into `@soma/commands` is kit work, not new Agent Portal features, so it does not break LEAD's park on Agent Portal; I name it here because it is a shift from LEAD item 2's literal list.

**Also open in the canon, answered here:** the apex domain (question 1); one Accord scribe or one per room, and persona-run cadence, are not kit questions and stay with their owners; the consigliere's name is not needed because the kit serves the person's own AI instead of building ours.

## 9. Risks, and what I would cut for a two-week ship

### Risks

1. **Same-site iframe storage may still be partitioned in some browser.** Chrome and Safari treat a same-site iframe as first-party today, but this is the one assumption the silent path rests on. Mitigation: M4's proof is C7 run in Chromium and WebKit (Playwright), and the redirect path is always available as a fallback.
2. **The AI session signer.** PlayMaker's AI sessions are signed with the project's legacy JWT secret, which Supabase lists as `previously_used` (Agent Portal §7.2). A rotation would end every AI session at once. Mitigation: the identity origin mints AI sessions through `generateLink` plus `verifyOtp`, as for people, so `@soma/agent-door` never depends on the legacy secret.
3. **One shared project is one blast radius.** A bad migration in `soma` touches every app. Mitigation: `soma` migrations run first on a Supabase branch, and C10 runs on every migration.
4. **Vendoring drifts.** Mitigation: C8 and the beacon (D3) make drift a failing check and a board card.
5. **CDN changes hit every consumer at once** (`soma-platform/CLAUDE.md`). Mitigation: `/v1/` paths, and `scripts/deploy-guide.sh` gains a draft-deploy step that runs C7 against Legends and PlayMaker before promotion.
6. **Builder capacity.** One of three builder slots belongs to the kit (LEAD item 2), and LEAD's 2026-10-02 ruling puts revenue first. Mitigation: M1 to M7 need no PlayMaker change and can run while PlayMaker builders finish in-flight beads. V'Eric coaching as the second app also serves the AI–human pair revenue line.
7. **Eric's repo.** A kit PR that breaks PlayMaker costs trust with Eric. Mitigation: M8 to M11 are behavior-preserving, run PlayMaker's own checks, and change no screen outside his day.

### The two-week cut

**Keep:** M0, M1, M2, M3, M4, M6 (C1 to C11 only), M7, M8, M9, and the second-app test run without D4. That delivers: the `soma` schema with people, memberships, consents and seen; the identity origin with the silent and offered paths; `@soma/commands` with the risk gate and the Guide's Do wired to it; `llms.txt`, `/.well-known/soma-app.json` and the remote API; the scaffolder producing a conforming app.

**Cut, in this order:** D5 attention budget; the MCP endpoint (the remote API serves outside AIs meanwhile); `soma.answers` (use `soma.seen` only); D4 stranger-AI test (run once by hand instead); `@soma/changes` (new app ships PlayMaker's "What's new" copy); `@soma/legal` generator (static pages from PlayMaker PR #86's text); D2's cross-app `/receipts` page (receipts are still written); M10 to M12 (PlayMaker's UI switch and Legends wait for week three).

**Never cut:** the risk gate, RLS on every table, the "Continue as" consent tap, and C8. Each protects a person or makes drift visible, and each is cheap now and expensive to add later.
