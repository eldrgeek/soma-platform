# The Soma affordance catalog

The menu. Each affordance is a reusable capability an app can include and configure.
Every entry follows the same shape so the Guide can present choices and the build
agents can resolve requirements:

- **What** — one line.
- **Why / when** — when an app wants it.
- **Choices** — the decisions the spec must capture.
- **Requirements** — tables, env vars, services, files it pulls in.
- **Source** — canonical code/docs.

Two tiers: **Solo** (1:1, live and proven) and **Community** (shared presence,
converging). Almost every Soma app includes the engine + at least the Guide; the
rest are opt-in.

---

## Foundation (implicit in every app)

Not menu items — the substrate every affordance assumes.

- **The engine** — `soma-guide.js` loaded from `soma-guide.netlify.app` (embedded
  CDN by default). No site-specific logic; everything is config. Delivery modes
  (embedded / vendored / iframe) are a separate choice — see `docs/SOMA-DELIVERY.md`;
  embedded is the v1 default.
- **Supabase project** — Postgres + auth + RLS. The affordances share one schema
  (`templates/soma-affordances/sql/schema.sql`) of up to 5 tables:
  `changelog_requests`, `changelog_notes`, `bill_feedback`, `bill_transcripts`,
  `soma_profiles`.
- **Netlify site** — one per app, its own repo, push-to-rebuild; Functions dir for
  serverless endpoints.
- **Env vars** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret, Netlify only),
  optional `OWNER_EMAIL`, `ASSISTANT_ID`.

---

# Tier 1 — Solo affordances

## Guide / Bill
**What.** A floating conversational assistant with three rungs: **Tell** (answers
grounded in a per-site knowledge pack), **Show** (animated walkthroughs that
highlight and narrate page elements), **Do** (an actions registry that executes on
the page behind a safety gate). Voice + text via ElevenLabs.

**Why / when.** Almost always. It is the app's front door, tour guide, and
help-desk in one. The minimum viable Soma app is "a site + Bill."

**Choices.**
- Persona: name, avatar, greeting / short-greeting / walkthrough-done text, stable
  `assistant_id`, `app_id`.
- Voice on/off (`voiceAgentId` — ElevenLabs ConvAI agent), narration TTS on/off
  (`ttsProxyUrl`), free-form Ask on/off (`inferenceUrl`).
- Knowledge pack contents (the org, the site sections, Soma itself).
- `siteMap` entries (grounding context).
- Walkthroughs (the Show rung) — at least one.
- `scopeGuard` (deflect off-topic, domain context note).
- `actions` registry (the Do rung) with the **risk gate**: reversible actions get
  `steps` and run after one confirm; high-risk actions get `risk:'high'`, no steps,
  and route to approval. When unsure, mark high.

**Requirements.** Engine script (CDN) loaded last; `js/soma-guide-config.js`;
`js/knowledge.js`; optionally an ElevenLabs agent, a TTS proxy, an inference/LLM
proxy URL. If identity is on, also Auth + `soma_profiles`. Telemetry writes go
through the Feedback functions, not the browser.

**Source.** `packages/soma-guide/`, `templates/soma-affordances/bill/`,
`legends-membership-site/SOMA-GUIDE-README.md` (includes the v1 stub list).

## Auth (SomaAuth)
**What.** Supabase-backed authentication, shared across Soma apps.

**Why / when.** Whenever the app has members, admins, or any gated page (Change Log
requires it; Identity Tier 2 requires it).

**Choices.** Roles (e.g. `admin` | `member`); which pages are gated; admin
allow-list emails.

**Requirements.** `window.SOMA_AUTH_CONFIG = { url, anonKey }`
(`js/soma-auth-config.js`); `SomaAuth` (`js/soma-auth.js`) exposing `init`,
`onAuthStateChange`, `getRole`, `signOut`; a login page.

**Source.** `packages/auth/`.

## Identity / Profile
**What.** Two-tier identity so Bill is loud for newcomers, quiet for veterans —
across every Soma app. Tier 1 = per-browser recognition (`localStorage`). Tier 2 =
per-person account profile (`soma_profiles`), shared across all Soma domains.

**Why / when.** Any app that wants returning-user behavior, cross-app continuity, or
"which walkthroughs has this person already seen."

**Choices.** `appId`; the `getProfile` / `recordSeen` seam (site supplies the
provider; engine stays backend-agnostic); whether cross-domain login-linking is
needed (the one place an iframe helps).

**Requirements.** Auth (for Tier 2); `soma_profiles` table; identity block in the
Bill config. Backward-compatible: no identity config = localStorage-only behavior.
**Decision:** `soma_profiles` lives in the **shared SOMA Supabase project** so a
person's profile follows them across every Soma app. (App-specific data may also be
shared per app — see APP-SPEC `targets.supabase.shared`.)

**Source.** `docs/SOMA-IDENTITY.md`; `soma_profiles` in the shared schema.

## Intake (Bill as change membrane)
**What.** Bill detects a bug/change-request intent in conversation, restates it
until the user agrees, has a strong model vet it (safety / reversibility /
blast-radius), and routes it by requester role — straight to a dev worker for
permitted requesters, to manager approval for everyone else.

**Why / when.** Any app whose owner wants users to request changes conversationally
and have them flow into a real build/approve pipeline. **For the meta-app this is
the affordance that produces the app spec** (change-request → app-spec; same
conversation engine, different output schema).

**Choices.** Observer scope (nav + clicks + JS errors; never input values);
specialist-persona handoff (same Bill, different costume) on/off; screenshot capture
(deferred to a later phase); routing mechanism (recommended: write to a
`change_requests` table the email daemon polls).

**Requirements.** Change Log (queue + approval surface); the `claude-email-daemon`
(`_second_opinion` vet + role-route + notify); `cc-dispatch` (dispatch to a worker);
identity/roles. Phase 1 (observer + handoff + restate-to-structured-request) is done
in preview.

**Source.** `docs/SOMA-INTAKE.md`.

## Change Log
**What.** An admin-gated review/approval page. Requests + change history land in a
queue defaulting to **Awaiting Approval**. Items can be **Approved** (kick off the
build), **Accepted** (sign-off after build), sent back with a **refinement note**,
or **Reverted**. Titles open an inline iframe **preview** of the affected page.
"Review with Bill" walks the owner through what changed.

**Why / when.** The owner-facing back office for any app that takes change requests,
or any app that wants a visible, auditable change history.

**Choices.** Admin emails; `ACCEPT_STORAGE_KEY`; `PUBLISH_AGENT_EMAIL` (build-agent
inbox for publish-approval); login/admin paths; whether to seed historical entries.
Card states → buttons: `awaiting-approval` (Approve/Cancel), `in-progress`
(health/Cancel), `awaiting-review` (Review work/Revert), `accepted` (Revert),
`declined`/`cancelled` (terminal).

**Requirements.** `changelog_requests` + `changelog_notes` tables; `admin-changelog.html`;
Auth admin gate; the inline-preview engine.

**Source.** `templates/soma-affordances/changelog/`,
`legends-membership-site/admin-changelog.html`.

## Feedback + telemetry
**What.** Server-side sinks for Bill feedback and the decision-trace. Two Netlify
Functions write with the service-role key (never from the browser).

**Why / when.** Any app running Bill that wants to capture feedback and an auditable
trace of what Bill did and decided.

**Choices.** `OWNER_EMAIL` (whose feedback auto-approves); default `ASSISTANT_ID`.

**Requirements.** `functions/submit-feedback.js`, `functions/log-bill.js`;
`bill_feedback` + `bill_transcripts` tables; `SUPABASE_SERVICE_ROLE_KEY` in Netlify
env only. A GET to each function returns 405 (alive); missing key returns 503.

**Source.** `templates/soma-affordances/functions/`.

---

# Tier 2 — Community affordances (Room)

> **Status: converging — Room is a target architecture, not yet a unified
> primitive.** Confirmed from FrontRow source (`front-row-vite/` + `server/`):
> FrontRow today models a **theater venue**, not a generalized Room — its concepts
> are seats, stage, shows, a `BackstageRoom`, a `HouseManagerApp`, and Socket.io
> events like `select-seat` / `release-seat` / `start-countdown` / `question-response`
> / WebRTC `offer`. A/V runs on **LiveKit** (`wss://` on the VPS); the backend is
> Socket.io at `:4001`; deploy is `frontrowtheater.netlify.app`. The **campus** is a
> separate branch-deploy off FrontRow that adds **per-persona public ConvAI dialogue**.
> Per the Unified Room model these converge into one **Room** with a public floor
> channel + private channels + the dyad/consigliere pattern. The entries below are
> the intended menu; the FrontRow theater primitives (LiveKit rooms, Socket.io
> presence, the seat/stage/backstage model) are what they generalize from.

## Room
**What.** A shared presence space members enter together — the convergence of
FrontRow's venue and the campus's per-persona spaces. One Room with a public **floor
channel** and **private channels**.

**Why / when.** Apps that are gatherings, not just sites: live events, cohorts,
communities, multi-persona spaces. Also the substrate for the build observation
surface (see BUILD-MODEL.md).

**Choices.** Channels (floor + which private channels); which personas inhabit the
Room; live A/V vs text presence; public vs members-only.

**Requirements (to confirm from source).** LiveKit (`wss://` on the VPS), the
Socket.io backend (`:4001`), the FrontRow frontend; identity/auth for membership.

**Source.** `FrontRow/` (esp. `front-row-vite/`, `server/`); campus branch
(deploys from FrontRow); Unified Room model notes.

## Dyad / consigliere
**What.** A private 1:1 with a persona running alongside the floor — a member can
step into a side channel with a guide/advisor while the shared space continues.

**Choices.** Which persona acts as consigliere; floor-vs-private boundary behavior.

**Source.** Unified Room model; FrontRow channel model (to pull from source).

## Per-persona public dialogue
**What.** The campus pattern: each persona has a public space where anyone can hold a
voice+text ConvAI dialogue with it.

**Choices.** Which personas; public vs gated; voice on/off (ElevenLabs agent per
persona).

**Source.** Campus branch off FrontRow; ties to the same ElevenLabs ConvAI wiring
the Guide uses.

## Presence
**What.** Live "who is here and what they're doing" within a Room — the ambient
awareness layer.

**Choices.** What presence shows (identity, activity, status); privacy defaults.

**Source.** FrontRow real-time layer (Socket.io presence) — confirm from source.

---

## Platform packages (advanced / internal)

Present in `soma-platform/packages` but not v1 menu items; noted so the Guide doesn't
mis-offer them and the agents know they exist:

- **`guide-extension/`** (Ariadne) — a browser extension (perceive/gate/watch). For
  cross-site / host-page reach beyond the embedded widget.
- **`soma-owner/`** — owner-side build (`soma-owner.template.js`).
- **`auto-mapper/`** — jsdom-based crawler; useful at **build time** to auto-generate
  a `siteMap` for the Bill config rather than hand-authoring it.
