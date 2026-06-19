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

# Tier 2 — Community affordances: Atlas + Room

> **Status: the model is locked (SOMA architecture session, 2026-06-18); the
> renderers are live; the shared room-state service is the key not-yet-built piece.**
> Two things exist today and converge into one primitive:
> - **Campus** — a React+Vite app (`soma-campus` branch → **soma-campus.netlify.app**)
>   built in the SOMA office app (a FrontRow worktree, `office/` with `Campus.tsx`,
>   per-building components, desks, `scripts/sync-canon.mjs`). It's a **2D SVG map**
>   of buildings; each houses personas at desks; **all 24 personas have per-character
>   ElevenLabs ConvAI dialogue (voice orb + text)** openable from the map, a desk, or
>   the org chart (The Atrium). "Meet the character, anywhere" is live. Persona chat
>   uses the persona `.md` as system prompt via a server-side proxy, with a strict
>   **no-tasks guardrail** (personas converse, they don't act).
> - **FrontRow** — the **3D venue** (`front-row-vite/`, R3F/Three.js, LiveKit A/V on
>   the VPS `wss://`, Socket.io presence): real 3D rooms with seats, presence, and a
>   *reconfigurable* layout (Theater ↔ Round-Table switch live; cabaret/classroom
>   stubbed), plus async message drops.
>
> The unification: **state is dimension-agnostic; dimension is a client.** The campus
> SVG and the FrontRow R3F scene are two *views* over the same room state.

## Room (the single primitive)
**What.** A persistent, named, gated place. Properties: **dimensionality**
(`2D | 3D | dual` — a rendering choice over shared state, not different objects);
**participants** (humans, AI personas, or both); **tools** (an optional mounted app
surface keyed to the room's purpose); **access + schedule** (auth-gated; runs sync
and async).

**Why / when.** Apps that are gatherings or workspaces, not just sites: live events,
cohorts, communities, multi-persona spaces — and the build observation surface
(BUILD-MODEL.md). The campus building you can talk to becomes a **workroom** when it
mounts a tool: Booth = audio (Sona), Studio = editing (Drew), Library = canon/RAG
(Mem), Forge = estimation (Cal/Skip/Sol). That's the shift from "campus as showcase"
to "campus as where work happens."

**Choices.** Dimensionality (2D/3D/dual); which personas are resident; mounted tool
(if any); participants/capacity; access (public vs gated) + schedule.

**Requirements.** Identity/Auth for gating; the persona registry (canonical
`~/Projects/SOMA/personas/`, synced via `sync-canon.mjs`); ElevenLabs ConvAI per
persona for voice+text; for 3D: LiveKit + the FrontRow renderer. **The not-yet-built
piece:** a shared **room-state service** extracted out of both apps (who's here,
what's said, what's scheduled, what's on screen) so 2D and 3D are clients of it.

**Source.** `soma-campus` branch / office app (`office/src/components/Campus.tsx`);
`FrontRow/front-row-vite/`; SOMA architecture session 2026-06-18 (Room/Atlas model).

## Atlas (the place graph)
**What.** The place registry + scene graph that Rooms hang on — game-engine prefab
typing applied to a persistent multi-app world, and a SOMA component in its own right
alongside guide/auth/changelog. A **type catalog** (Room types: Theater, Round-Table,
Booth, Library, Forge; container types: Campus, Village, Town, City, Country) plus an
**instance tree** (the live world). A `Place` node is recursive — a `scale` tag, a
type reference, and children down to rooms and areas — so "an area within a room"
(backstage, breakout table) is the same machinery at a smaller scale. Addressing is a
**path**: `soma/campus/booth/iso-booth`. Dimensionality and access live at *every*
enterable node, so a campus can have a 2D map and a 3D flythrough of the same node.

**Why / when.** Any app that has more than one place, or wants the campus/overworld
model. A standalone app can be a single Room with no Atlas above it; SOMA fills the
campus level.

**Choices.** Which levels you instantiate (vocabulary, not a mandatory ladder); the
type for each place; shared-live-state vs overworld-with-enterable-rooms (the former
needs the room-state service first — prove it on one room).

**Source.** SOMA architecture session 2026-06-18 ("Atlas" is the working name).

## Dyad / consigliere
**What.** The unit of attendance: the atom is **a human + their consigliere** (an AI
that attends *with* them), not a lone human. The consigliere is what carries memory
**across** rooms — the through-line that makes the Atlas feel like one place rather
than 24 disconnected chat widgets.

**Choices (open design decisions, per the 2026-06-18 session).** Does the dyad occupy
one seat or two? Is the consigliere a visible second body or a private earpiece? Per-
room configurable? These are **schema** decisions (one occupant vs two), not polish.

**Source.** SOMA architecture session 2026-06-18.

---

## Platform packages (advanced / internal)

Present in `soma-platform/packages` but not v1 menu items; noted so the Guide doesn't
mis-offer them and the agents know they exist:

- **`guide-extension/`** (Ariadne) — a browser extension (perceive/gate/watch). For
  cross-site / host-page reach beyond the embedded widget.
- **`soma-owner/`** — owner-side build (`soma-owner.template.js`).
- **`auto-mapper/`** — jsdom-based crawler; useful at **build time** to auto-generate
  a `siteMap` for the Bill config rather than hand-authoring it.
