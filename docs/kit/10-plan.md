# SOMA App Kit v1 — the living plan

_Paths are relative to `~/Projects/` unless stated otherwise._

## 0. Decisions

| Question | Decision | Reason |
|---|---|---|
| `soma.app.yaml`, `soma.app.json`, or `soma.config.ts` | Use JSON in `soma-app.json`, the file name the scaffolder already writes into generated apps. | JSON is inert, portable, and does not require executing app code. The v1 document is a new shape; the v0 spec (`soma_app` root) converts to it through `soma-scaffold migrate-spec`. |
| Existing `soma_profiles`, a new relational model, or DIDs | Add a relational `soma` schema backed by Supabase Auth. | `soma_profiles` is too small for consent, pairwise identity, answers, and delegation. DIDs do not solve a current v1 problem. |
| Shared person IDs or pairwise app IDs | Keep one private `person_id`, but expose a different `app_person_id` to each app. | SOMA can recognize one person without giving every app a correlatable global identifier. |
| Silent iframe recognition or explicit redirect | Use a top-level authorization-code flow with PKCE. | It works across domains, makes consent visible, and avoids browser third-party-storage behavior. |
| When recognition may be silent | Only an app with an existing valid membership and session may resume silently. | A first visit to another app discloses identity and therefore requires a visible offer. |
| What the browser remembers before sign-in | Store only an opaque “known device” marker. | A browser marker should not contain a name, email, person ID, or access token. |
| Which invitation implementation survives | Keep `@soma/tickets` and merge onboarding features into it. | It already has live single-use tokens and shared RPCs. Renaming it would add migration work without adding capability. |
| Which changelog survives | Keep both experiences over one `app_changes` ledger. | Legends’ approval queue and PlayMaker’s “What’s new” view serve different users at different stages of the same change. |
| Unscoped trust or least privilege for outside AIs | Require scopes, expiry, and a risk ceiling. | A person may deliberately grant `*`, but omitted scope must never mean unlimited authority. |
| Pair an AI once globally or once per app | Register the AI partner once, but grant authority per app by default. | Identity may travel across SOMA. Authority should not silently travel with it. |
| Central feedback queue or per-app queues | Keep the per-app queue canonical and forward through a transactional outbox. | Apps retain their domain context, while the estate still receives every item reliably. |
| CDN or vendoring for static-site plumbing | Vendor static adapters and runtime files. | The brief makes the Guide the CDN exception. Identity, consent, feedback, and action enforcement must remain pinned with the app. |
| Always-latest Guide or pinned Guide | Publish immutable semantic versions with Subresource Integrity hashes. | One unpinned Guide release can otherwise break every consumer simultaneously. |
| OpenAPI, MCP, or both in v1 | Ship vendor-neutral HTTP and OpenAPI in v1. Add generated MCP as a later adapter. | OpenAPI is sufficient for the first outside-AI test and avoids making MCP availability a prerequisite. |
| Migrate Legends or PlayMaker first | Build the shared foundation, then migrate a Legends preview before changing PlayMaker behavior. | Legends exercises the static path without disturbing Eric’s active writing workflow. |
| Fifteen minutes, two hours, or four hours for a new app | Require a local build in 15 minutes, a deploy preview in 30 minutes, and the complete Golden Journey in four working hours. | These measure three different outcomes and preserve the useful challenge in each source plan. |
| Shared or per-app billing | Keep metering in the core and billing as an optional per-app recipe. | No current evidence supports one SOMA-wide commercial model. |
| Required tours or deferred tours | Require one Show workflow, not a produced film. | Show must work on day one, but video production is not plumbing. |
| Legal pages at prototype time | Warn at prototype and fail at public MVP. | Templates can create routes, but only the operator can ratify legal promises. |
| AI hosts as auth users or app attributes | Give every host an actor record. Give an AI host credentials only if it actually acts independently. | Credit and identity do not require pretending every named AI is a login account. |

## 1. The capability list

### 1.1 Required capabilities

| Capability | What it does for the person | SOMA principle | What exists today | Target design |
|---|---|---|---|---|
| Host pair and human handoff | The person always knows which human and AI host the app, how to reach the human, and how soon to expect a human reply. | Named minds remain accountable. | `SOMA/SOMA-APP-STANDARD.md`; `soma-app-template/src/lib/hostPair.ts`. | Declare both hosts, their roles, one escalation route, and the human host's expected response time in `soma-app.json`. Expose them in the UI and discovery document. |
| Be known | A returning person is recognized without being exposed to an unfamiliar app first. | One identity, consumed rather than forked. | `soma-platform/packages/soma-signin`; PlayMaker’s known-device flow; `soma-platform/docs/SOMA-IDENTITY-STATES.md`. | Use the shared identity broker, pairwise app IDs, an opaque device marker, and a one-tap recognition offer on first cross-app entry. |
| Learn once, answer once, resume | An app does not repeat concepts or questions already settled and returns the person to useful context. | Respect accumulated understanding. | Guide `_recordSeen`; `soma-app-template/supabase/migrations/0005_last_location.sql`; Legends’ `guide_seen`. | Store versioned concept state and explicitly shareable answers centrally. Keep the last app location in the app's own schema, because it is app-internal and changes on every navigation. |
| Invitations | A personal or shared invitation admits the person without creating another identity system. | Relationships precede accounts. | `packages/soma-tickets`; `packages/soma-onboard`; three standards folders; PlayMaker’s flow. | Make `@soma/tickets` canonical. Add personal/shared presentation, QR, channels, abuse controls, and membership creation. |
| Ask, Show, and Do | The person can ask for an explanation, see the relevant controls, or ask the host to act. | Alignment joins understanding with agency. | `packages/soma-guide`; PlayMaker `src/agent-portal/`; Legends Guide actions. | Make one typed action registry serve the UI, Guide, and outside AIs. Bind controls with `data-soma-action="<id>"`. In-app Ask runs on the app's ElevenLabs Conversational AI agent, grounded in knowledge compiled from the manifest's concepts. An outside AI's Ask needs no SOMA inference: it reads `/llms.txt` and `/knowledge/*.md`. |
| Consent and action receipts | The person sees expected effects before consequential acts and receives a durable result afterward. | Authority must be visible, bounded, and reviewable. | Guide risk flag; PlayMaker audit and pairing code; template delegation migrations. | Enforce risk, scope, expiry, confirmation, idempotency, and undo on the server. Write one receipt for every attempt. |
| AI visitor door | A person’s own AI can discover, understand, pair with, and use the app without vendor-specific instructions. | Outside AIs are first-class visitors. | PlayMaker `netlify/functions/agent-v1.ts`, `public/llms.txt`, pairing functions, and Agent Portal. | Publish `/.well-known/soma-app.json`, `/llms.txt`, and OpenAPI. Use device-code pairing and per-app grants. |
| Feedback and improvement loop | A person can report a problem or request a change and later see its disposition. | The user participates in the outer RSI loop. | `packages/soma-feedback`; PlayMaker’s feedback queue and build requests. | Make the package the widget’s source of truth. Keep per-app records and send retryable outbox events through the broker to the durable estate inbox. |
| Changes and review | Stewards approve changes, while participants see only relevant shipped changes they have not seen. | Change remains legible to every participant. | Legends admin changelog; PlayMaker `Changelog` and `WhatsNewList`. | Use one per-app `app_changes` ledger with admin and participant views. |
| Honest operation and recovery | The person sees started, succeeded, failed, retryable, and reversible states. | No silent success and no concealed failure. | PlayMaker error/crash code; template toast and reload helpers. | Standardize action status and error capture. Require a declared fallback for unavailable shared dependencies. |
| Data control and context export | The person can inspect, export, revoke, and erase the information SOMA holds about them. | The person remains the principal of their data. | Consent and erasure specifications exist, but implementation is incomplete. | Provide “What do you know?”, Markdown/JSON export, per-app forget, global erasure request, and AI-grant revocation. |
| Where your words go | The person can see which outside providers receive their text, audio, or files and why. | Honest human–AI relationships require visible data flow. | Privacy material is fragmented; legal pages are mostly missing. | Declare data flows in the manifest and render them in `/privacy`, `/where-your-words-go`, and machine-readable discovery. |
| Credits and provenance | The person can see which human or AI created or changed an artifact. | Every mind receives credit and remains accountable. | `SOMA/standards/SIGNATURES-AND-BYLINES.md`; `SOMA/standards/SOMA-STD-credits.md`. | Store actor, principal, app, action, model or substrate when known, artifact, and time. Use server-signed receipts in v1. |
| Usage and optional billing | The person sees limits and prices before consuming a metered resource. | Cost belongs to the principal who benefits. | `packages/soma-meter`; PlayMaker `UsageChip.tsx`; billing templates. | Keep metering in the core. Add a generic usage component. Enable billing only through an app-specific declaration. |
| Proof and drift beacon | A person or steward can verify which kit version the app runs and when its live journey last passed. | A claim of done is a demonstration. | `soma-ship-check.py`; scaffolder stand-up check. | Publish release SHA, contract hash (section 3.1), kit lock hash, and last live conformance result through `/api/soma/v1/status`. |

### 1.2 Inventory disposition

| Inventory item | Decision |
|---|---|
| `soma-platform/packages/soma-signin` | Keep as canonical. Add React and static adapters. |
| `soma-platform/packages/auth` | Deprecate after static consumers migrate. |
| `legends-membership-site/js/soma-auth.js` and `legends-connect/js/soma-auth.js` | Remove only after the vendored static adapter passes the old journeys. |
| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation implementation. Add `ticket_create_v2`, which takes the app from the broker JWT's `app_id` claim (or from the broker for legacy-global apps) and admits the inviter by `soma.memberships` role under that app's invitation policy. Restrict the existing `ticket_create(p_app, …)` to `p_app = 'playmaker'` until PlayMaker moves to v2, then retire it. |
| `soma-platform/packages/soma-meter` | Keep. Add a generic client chip based on `playmaker/src/components/UsageChip.tsx`. |
| `soma-platform/packages/soma-feedback` | Keep. Promote `packages/soma-feedback/widget/` from a documented copy to the canonical widget source, then replace the other copies. |
| `soma-platform/packages/soma-guide` | Keep on the CDN. Publish immutable semantic-version paths and SRI hashes. Bundle a pinned `@elevenlabs/client` into each release instead of importing `esm.sh/@elevenlabs/client@latest` at runtime. Keep the root path as the moving channel for non-kit consumers. |
| `soma-platform/packages/soma-assist-core` | Keep the chat shell as an internal Guide dependency. Do not create a second public chat contract. Its feedback and heartbeat clients stay only for the Adrian and Yeshie browser extensions. A SOMA app never loads them: app feedback goes through `@soma/feedback`, and app health goes through `/api/soma/v1/status`. |
| `soma-platform/packages/soma-onboard` | Merge QR, channel, privacy, and abuse behavior into `@soma/tickets`; stop generating its member tables. |
| `soma-platform/packages/soma-scaffolder` | Keep as the only supported generator and updater. |
| Legends admin changelog | Keep as the steward view of `app_changes`. |
| PlayMaker “What’s new” | Keep as the participant view of `app_changes`. |
| Billing templates | Keep as an optional recipe. Do not make Stripe part of core stand-up. |
| Live in-place editing | Keep as an optional v1.1 recipe with take, drop, and revise review. |
| Admin roles and allowlists | Replace with app membership roles. Keep `ADMIN_EMAILS` only as a time-limited first-owner bootstrap. |
| SMTP sending | Keep as an optional notification adapter. Do not make email the durable invitation or feedback transport. |
| Agent pairing and delegation | Keep as core. Separate global agent registration from per-app grants. |
| Deployment checks | Wrap inside `@soma/conformance`. Keep `SOMA/tools/ship/soma-ship-check.py` as a compatibility check. |
| Feedback queue and build requests | Extract their schema and lifecycle into the kit. Keep records logically per app. |
| Error reporting and crash alarm | Extract into `@soma/errors`. Do not revive the dead shared service. |
| Agent API, Agent Portal, and `llms.txt` | Merge into `@soma/actions` and the AI visitor door. |
| AI host chat | Keep the persona and inference adapter app-specific behind a shared host-chat interface. |
| Themes | Keep app-specific. Generate only common design-token plumbing. |
| Reload on deploy | Keep in the React template and static adapter. Package it only after another independent consumer needs an API. |
| Front-door analytics | Keep as an optional, consent-aware adapter. |
| Share images | Keep as an optional build recipe. |
| Community chat and video | Keep in Legends. Exclude Rooms and video from kit v1. |
| Toast, exclusive voice, resume, and tooltip | Keep in the template. Keep resume state in the app's own schema; do not create a UI package prematurely. |
| Five invitation variants | Resolve to `@soma/tickets`. Archive the other standards only after migration links and compatibility tests exist. |
| Legal pages | Add required routes. Prototype may warn on incomplete ratified copy; public MVP must fail. |
| Four overlapping app catalogs | Replace their normative role with this spec, the JSON Schema, and generated conformance output. Keep them as explanatory history where useful. |

### 1.3 Canon disposition

| # | Canon idea | Decision |
|---|---|---|
| 1 | SOMA ID fast path | Core. Use the identity broker and pairwise app IDs. |
| 2 | Two-tier profile and what was seen | Core. Normalize it into versioned concept state. |
| 3 | Identity ladder and self-knowledge | Core. Provide describe, switch, export, and forget operations. |
| 4 | Known device and invitations | Core. Merge into identity and tickets. |
| 5 | Consent, visibility, and revocation | Core behavior. Defer DIDs and cryptographic erasure receipts. |
| 6 | Resume where left off | Core for apps with persistent work. |
| 7 | Introduce once | Merge into concept state. |
| 8 | Traveling personal AI | Serve the person’s existing AI first. Do not build a SOMA-only consigliere in v1. |
| 9 | Cross-app memory | Limit v1 to identity, declared preferences, concept state, and explicitly shared answers. |
| 10 | Tell/Show/Do | Core. |
| 11 | Agent Portal | Extract the registry and remote contract. Do not add unrelated PlayMaker commands. |
| 12 | Conversational front door | Supported presentation choice, not a universal navigation rule. |
| 13 | AI door | Core. |
| 14 | Tours | Require one Show workflow. Produced films remain optional. |
| 15 | Review with Bill | Generalize to “review with the AI host” over unseen changes. |
| 16 | Host pair and kin-bond | Require the host pair and escalation. Defer kin-bond machinery. |
| 17 | RSI loop | Require feedback, disposition, and closure evidence. Defer market-persona automation. |
| 18 | Intake as change membrane | Merge into feedback and changes. |
| 19 | In-place editing | Optional v1.1 capability. |
| 20 | Partner AI acting on behalf | Core with app-scoped grants, expiry, risk ceilings, and receipts. |
| 21 | Signed provenance | Use server-signed receipts. Defer client-held signing keys. |
| 22 | Every mind gets credit | Core. |
| 23 | Accord and “We’re aligned” | Provide an integration link. Do not embed another Accord implementation. |
| 24 | CoEvolution continuity | Exclude from the kit. |
| 25 | Elicitation front-of-funnel | Optional workflow. Store only answers the person explicitly allows to travel. |
| 26 | Community presence | Optional module outside v1 core. |
| 27 | BYOK and KeyDrop | Defer until custody rules are ratified and one app needs them. |
| 28 | Honest UX | Core. |
| 29 | Preferences, acting authority, and voice consent | Acting authority is core. Preferences are declared. Voice consent is required only for voice-enabled apps. |
| 30 | Action lineage | Core through receipts and provenance. |

## 2. The architecture

### 2.1 System shape

The canonical product contract is `soma-app.json`.

The scaffolder compiles the contract into vendored runtime code, discovery files, legal-page shells, database migrations, tests, and `soma-kit.lock.json`.

The Guide loads from an immutable CDN URL.

The app UI, Guide, and outside AIs use one action registry.

The identity broker owns cross-app recognition and consent.

The shared Supabase project stores authentication and cross-app records.

Each app owns its domain records, detailed feedback, changes, errors, and unpublished content.

No new app receives a service-role credential that can read the entire shared project. M11 removes the legacy credentials from PlayMaker and Legends.

### 2.2 Identity flow

1. The app reads only its own opaque marker, `soma.known.device`, which `@soma/signin` already writes. The marker means only “this browser has signed in to this app before.”
2. An app with an existing valid membership and session resumes silently. An app with the marker but no session shows “Come back in.”
3. Every other visitor sees the same neutral “Continue with SOMA” control. An unvisited app cannot tell whether a visitor is known to SOMA. Only the identity origin, which keeps its own first-party session, can recognize the person.
4. Selecting it opens `https://id.<SOMA_APEX>/authorize` as a top-level navigation.
5. The request includes `app_id`, an allowlisted redirect URI, a PKCE challenge, and a nonce.
6. The identity origin authenticates the person.
7. The identity origin shows the person’s name, the destination app, and the fields that will be disclosed. When the app declares `soma:` concepts, the list includes “SOMA basics you have already seen.”
8. Acceptance creates or updates membership and consent.
9. The origin returns a single-use authorization code.
10. The app's Netlify Function, not the browser, exchanges the code. It presents the PKCE verifier and the app's installation credential.
11. The function sets a rotating refresh token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie on the app's origin. It returns a 15-minute access JWT, the pairwise `app_person_id`, and only consented profile fields to the browser.
12. The app may now greet the person by name and state where it learned the name.

The authorization code must be short-lived and single-use.

The redirect URI must exactly match a registered origin.

The app must not receive a global `person_id`.

### 2.3 Authentication boundary for apps

Shared-table writes must not trust a browser-supplied `app_id`.

Each deployed app receives an installation credential stored only in Netlify Functions.

Only the identity broker stores the Supabase service-role credential.

The broker validates the app credential, binds the request to one `app_id`, validates the person or AI session, and calls narrow database functions.

Every pairwise app, React or static, receives short-lived Supabase JWTs minted by the broker after authorization.

Each JWT has `sub = app_person_id`, `role = "authenticated"`, an `app_id` claim, and no email. Supabase's `auth.uid()` reads `sub`, so ordinary RLS idioms keep working and return the pairwise ID. The JWT lets the browser call PostgREST directly against its own app's RLS-protected `app_<app_id>` tables.

The broker's signing key can mint a token for any database role, so it is as powerful as the service-role key. The broker refuses to mint any role other than `authenticated`, and the key exists only in the broker's environment.

The broker signs these JWTs with a key the shared project trusts, such as a registered third-party issuer or the project's current signing keys. It does not use the legacy shared JWT secret.

RLS policies in `app_<app_id>` tables must match both the `app_id` claim and the row's `app_person_id`.

The JWT grants no direct access to the `soma` schema. Shared records remain reachable only through the broker's narrow functions.

Browser code never receives an installation credential or service-role key.

This boundary must replace existing app-held service-role access incrementally because one shared Supabase project otherwise creates an estate-wide breach path.

### 2.3a Apps that predate the broker

PlayMaker and Legends sign people in directly against Supabase Auth in the shared project.

PlayMaker's tables key on `auth.users.id`, so PlayMaker already holds a global identifier for every person.

Rekeying PlayMaker to pairwise IDs would change its domain model, which section 4.2 forbids.

Therefore the manifest gains `identity.subject`, with two values:

- `"pairwise"`: the app receives only `app_person_id`. Every new app must declare this, and conformance fails a new app that declares anything else.
- `"legacy-global"`: `app_person_id` equals `auth_user_id`. Only PlayMaker and Legends may declare it, and `soma.apps` records which apps hold it.

A legacy-global app still receives cross-app data (shared answers, `soma:` concept state) only after consent, exactly like a pairwise app.

PlayMaker's Netlify Functions hold the shared project's secret key (`playmaker/netlify/functions/lib/agentIngress.ts`, `lib/metering.ts`) and mint agent sessions with the legacy JWT secret (`lib/agentJwt.ts`).

`soma-app-template` does the same (`netlify/functions/lib/supabaseAdmin.ts`, `lib/agentJwt.ts`, `.env.example`), so every app the scaffolder generates today inherits both secrets.

Until migration phase M11 completes, the isolation described in section 2.3 holds for new apps only. A compromised PlayMaker function can still read every shared table. The kit's status page and evidence bundle must say so rather than claim estate-wide isolation.

Interim control in week one: give each app that still holds a secret key its own `sb_secret_…` key. The shared project already uses the new key format, so one app's key can then be revoked without rotating every other consumer.

The shared project must not revoke the legacy JWT secret or rotate to asymmetric signing keys until PlayMaker's agent seam has moved to broker-issued agent tokens (M8). Otherwise every paired PlayMaker agent stops working at once.

A pairwise app has no local sign-in fallback. Signing in directly to Supabase Auth inside the app would give it a global `auth.uid()` and skip the consent screen. During a broker outage, existing access tokens run to expiry, public pages and Ask over public knowledge keep working, and the sign-in control states the outage and shows the human host's contact route.

### 2.4 Data model

Migrations live under `soma-platform/sql/soma/`.

New app migrations live under the generated app’s `supabase/migrations/`.

PlayMaker’s current domain tables remain in `public` during migration.

Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tables remain in place until their package owners can migrate them without breaking consumers.

#### Shared schema

| Table | Essential fields | Ownership and access |
|---|---|---|
| `soma.people` | `person_id`, `auth_user_id`, `display_name`, `locale`, `timezone`, `is_test`, `created_at`, `erased_at` | The person owns the row. Apps never receive `person_id`. |
| `soma.actors` | `actor_id`, `kind`, `name`, `substrate`, `person_id`, `created_at` | Represents humans, AI hosts, and external AIs for credit and lineage. |
| `soma.apps` | `app_id`, `name`, `origins`, `contract_sha256`, `identity_subject`, `kit_version`, `status` | Platform-managed. Public reads expose only active metadata. |
| `soma.app_hosts` | `app_id`, `actor_id`, `role`, `escalation_url`, `expected_response` | Public for active apps. Writes are platform-managed. |
| `soma.app_installations` | `app_id`, `credential_hash`, `created_at`, `last_used_at`, `revoked_at` | Broker-only. Raw credentials are never stored. |
| `soma.memberships` | `person_id`, `app_id`, `app_person_id`, `role`, `trust`, `joined_at`, `last_seen_at`, `left_at` | The person reads their rows. App admins use a narrow broker call. |
| `soma.consents` | `person_id`, `app_id`, `fields`, `purpose`, `policy_version`, `granted_at`, `revoked_at` | The person reads and revokes. The broker enforces disclosure. |
| `soma.concept_state` | `person_id`, `concept_id`, `concept_version`, `state`, `source_app_id`, `first_at`, `last_at`, `evidence` | An app may read and write only `soma:*` concepts and concepts in its own `<app_id>:` namespace. `soma:*` state reaches an app only after consent. |
| `soma.answers` | `person_id`, `question_id`, `schema_version`, `answer`, `source_app_id`, `sharing`, `answered_at`, `revoked_at` | Cross-app reads require `sharing='soma'` and current consent. |
| `soma.agent_partners` | `agent_id`, `principal_id`, `label`, `refresh_credential_hash`, `created_at`, `last_used_at`, `revoked_at` | Registers an AI relationship without granting app authority. Only the broker ever sees the refresh credential. |
| `soma.agent_grants` | `grant_id`, `agent_id`, `principal_id`, `app_id`, `scopes`, `risk_ceiling`, `purpose`, `expires_at`, `revoked_at` | The principal controls the grant. App scope is required unless `app_id='*'` was explicitly chosen. |
| `soma.receipt_index` | `receipt_id`, `app_id`, `person_id`, `actor_id`, `action_id`, `risk`, `status`, `created_at` | Fed by each app's outbox. Holds no input, output, or effect text. Powers the person's cross-app receipt list and AI-grant audit. |
| `soma.erasure_requests` | `request_id`, `person_id`, `scope`, `status`, `requested_at`, `effective_at`, `completed_at`, `receipt` | The person reads their requests. Platform workers update status. |
| `soma.conformance_runs` | `run_id`, `app_id`, `release_sha`, `contract_sha256`, `tier`, `result`, `failed_checks`, `evidence_url`, `runner_actor_id`, `ran_at` | Written by the conformance runner through the broker with the steward's conformance credential. Read by `/api/soma/v1/status`. |
| `soma.estate_inbox` | `event_id`, `app_id`, `kind`, `payload`, `received_at`, `claimed_at` | Written only by the broker. The Mac-side board importer reads and claims rows, so apps never depend on the Mac being up. |

### 2.4a Registering an app in the shared project

`soma-scaffold register <soma-app.json>` registers an app. The platform steward seat runs it, because it needs the Supabase Management API token. The builder never holds that token.

Registration is idempotent and does five things:

1. Inserts or updates `soma.apps`, `soma.app_hosts`, and the registered origins. When the Guide is enabled and the manifest does not yet name an agent, it creates the agent from the persona file through the ElevenLabs API and records the resulting `guide_agent` value.
2. Creates schema `app_<app_id>` with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`), grants `usage` to `authenticated`, and appends the schema to PostgREST's exposed schemas through the Management API. It reads the current list and appends; it never replaces the list, because the setting is project-wide.
3. Applies the app's migrations with `soma-scaffold migrate`, which records history in `app_<app_id>.schema_migrations`. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's `0001`–`0087` and a second repository's `0001_…` would collide.
4. Mints the installation credential and sets it in the app's Netlify environment with the command's output redirected, so the secret is never printed.
5. Registers exactly two redirect origins at prototype tier: the production origin and one fixed branch-deploy alias, `https://preview--<site>.netlify.app`. Per-deploy URLs are not registrable, and no wildcard is ever accepted.

Running `register` is not an edit to `soma-platform`, so it does not fail the second-app test. Its time counts toward the 30-minute deploy-preview target.

#### Per-app schema

New apps receive an `app_<app_id>` schema.

| Table | Purpose |
|---|---|
| `feedback_items` | The canonical user report and its evidence. |
| `build_requests` | The report-to-build lifecycle and demonstration links. |
| `feedback_outbox` | Retryable delivery to `soma.estate_inbox` through the broker. A Netlify scheduled function in each app drains it every five minutes with exponential backoff. An event undelivered after 24 hours is marked dead-lettered, and the status endpoint reports the count. |
| `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `input_hash`, `actor_id`, `principal` (`app_person_id`), `grant_id`, `risk`, `status`, `effect_summary`, `output`, `undo_of`, `created_at`, `completed_at`. The canonical receipt and idempotency record. |
| `receipt_outbox` | Retryable delivery of receipt index rows to `soma.receipt_index`. |
| `last_location` | The person's resume point in this app (from `soma-app-template/supabase/migrations/0005_last_location.sql`). |
| `app_changes` | Proposed, accepted, building, shipped, and rejected changes. |
| `error_reports` | Fingerprinted client and function failures. |
| `front_door_events` | Consent-aware arrival and conversion events. |
| Domain tables | The app’s actual product data. |

Every table has RLS enabled.

Every `SECURITY DEFINER` function sets `search_path`, validates the caller, binds the app from authenticated context, and returns explicit columns.

A conformance test must prove that one person cannot read another person’s rows.

`action_receipts` has a unique constraint on `(action_id, principal, idempotency_key)`. Scoping the key to the principal means one person cannot block another person's action by guessing their key.

`status` is one of `pending`, `succeeded`, `failed`, `refused`, `approval_required`, or `undone`.

Execution claims the key by inserting a `pending` row, runs the effect, then settles the row with its `output`. When the effect is a database change, the claim, effect, and settlement share one transaction. This is the pattern PlayMaker already runs in `agent_command_requests`; M8 generalizes it rather than adding a second one.

- A repeated key with the same `input_hash` and a settled row returns the stored `output` without repeating the effect.
- A repeated key while the row is `pending` returns HTTP 409 with `code: "idempotency_pending"` and `Retry-After`.
- A repeated key with a different `input_hash` returns HTTP 422 with `code: "idempotency_conflict"`.
- A `pending` row older than the action's declared timeout is reconciled using the action's recovery rule. It may be marked `failed` and retried with the same input only after the system proves the effect did not occur; otherwise it remains blocked for operator reconciliation. External side effects cannot be made exactly-once by the receipt alone.

Erasure keeps the receipt's existence for the retention period but deletes `effect_summary` and `output` and replaces `principal` with a tombstone. Erasure deletes the person's `soma.receipt_index` rows.

### 2.5 Concept and answer semantics

A concept ID is namespaced, such as `soma:host-pair` or `playmaker:stage-read`.

A concept state is one of `told`, `shown`, `done`, or `acknowledged`.

A new concept version is not automatically treated as understood.

Declaring a concept outside `soma:` and the app's own namespace fails C3.

`told` suppresses the unprompted introduction of the concept.

`shown` and `acknowledged` also suppress the automatic start of its Show workflow. `acknowledged` means the person said they already know it.

`done` means the person completed the concept's action at least once.

No state suppresses an explicit request. Ask and Show always answer when the person asks.

The manifest may declare that version `2` supersedes version `1`.

A question has a stable ID and answer schema version.

An answer is private to its source app unless the person explicitly marks it shareable across SOMA.

An app may suppress a question only when the stored answer matches the declared question ID and a compatible schema version.

### 2.6 Action registry

```ts
export type SomaRisk =
  | "observe"
  | "reversible"
  | "consequential"
  | "irreversible";

export interface SomaAction<I, O> {
  id: string;
  version: string;
  title: string;
  description: string;
  kind: "view" | "observe" | "effect";
  risk?: Exclude<SomaRisk, "observe">; // required when kind is "effect"
  requiredScopes: string[];
  requiredRole: "visitor" | "member" | "editor" | "owner" | "admin";
  surfaces: Array<"ui" | "guide" | "remote">;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  effects: string[];
  concept?: { id: string; version: string };
  prepare?: (
    context: ActionContext,
    input: I
  ) => Promise<ActionPreview>;
  execute: (
    context: ActionContext,
    input: I
  ) => Promise<O>;
  undo?: (
    context: ActionContext,
    receipt: ActionReceipt
  ) => Promise<ActionReceipt>;
}

export function registerAction<I, O>(
  action: SomaAction<I, O>
): void;

export function executeAction<I>(
  request: {
    actionId: string;
    actionVersion: string;
    input: I;
    idempotencyKey?: string;
    approvalToken?: string;
  },
  context: ActionContext
): Promise<ActionReceipt>;
```

The server enforces the risk gate.

`kind` maps one-to-one onto PlayMaker's registry: `view` is PlayMaker's `view`, `observe` is `inspection`, and `effect` is `effect` with a declared risk.

A `view` action changes only what is on the person's screen. It runs in the browser, writes no receipt, needs no idempotency key, and may list only the `ui` and `guide` surfaces, because a remote AI must not drive a person's screen.

`requiredRole: "visitor"` is allowed only for `view` and `observe` actions over public data. Every `effect` action requires a person session or an agent access token.

The in-app AI host acts inside the person's current session under an implicit session grant capped at `reversible`. Its receipts record the AI host's `actor_id` and the person as principal.

| Risk | Person in current UI | AI host or paired outside AI |
|---|---|---|
| `observe` | Run immediately. | Run with the matching read scope. |
| `reversible` | Run and show receipt plus undo when available. | Run only within a live grant and risk ceiling. |
| `consequential` | Show an effect preview and require confirmation. | Require a fresh approval token bound to the action, version, input hash, principal, and expiry. Without one, return `approval_required` with an `approval_url` the AI relays to the person. |
| `irreversible` | Require explicit final wording and a cool-off step. | Never run from standing authority. Require fresh human approval through the same `approval_url` flow, including the cool-off step. |

An outside AI has no screen of SOMA's own, so approval is asynchronous.

When a consequential or irreversible request arrives without a valid approval token, the server returns HTTP 403 with `error: "approval_required"`, an `approval_id`, an `approval_url`, an expiry, and the ID of an `approval_required` receipt.

The AI relays the `approval_url` to the person through whatever channel it already uses with them.

The `approval_url` opens the app's own effect preview, which the person confirms or declines while signed in.

The AI polls `GET /api/soma/v1/approvals/:id`. After the person confirms, that call returns the approval token once.

The AI then repeats the execute request with the same `Idempotency-Key` and the token.

Every effect request requires `Idempotency-Key`.

Every outcome writes a receipt, including refusal and failure.

UI controls use the same action definition as the Guide and remote API.

AI-only actions are permitted only when the action has no honest visual equivalent and is either an `observe` action or a `reversible` effect action.

An AI-only `reversible` action must declare a `ui_exception` with a reason in the manifest, and that exception is reviewed under C5.

Its receipts must appear in the person's receipt view with an undo control, so the person can see and reverse the effect without the AI.

`consequential` and `irreversible` actions are never AI-only.

### 2.7 AI visitor door

Every conforming app publishes:

```text
GET /.well-known/soma-app.json
GET /llms.txt
GET /api/soma/v1/openapi.json
GET /api/soma/v1/actions
POST /api/soma/v1/actions/:id/prepare
POST /api/soma/v1/actions/:id/execute
GET /api/soma/v1/approvals/:id
GET /api/soma/v1/receipts/:id
GET /api/soma/v1/status
```

Every conforming app also publishes person-facing routes. Each one is an app function that authenticates the person or agent and calls a narrow broker function, so browser code never touches the `soma` schema.

```text
GET    /api/soma/v1/me                         membership, role, consented fields, and where the app learned the name
GET    /api/soma/v1/me/concepts?ids=…          state of declared concepts
POST   /api/soma/v1/me/concepts/:id            record told, shown, done, or acknowledged
GET    /api/soma/v1/me/answers?ids=…           compatible answers this app may read
PUT    /api/soma/v1/me/answers/:question_id    store an answer with its sharing level
GET    /api/soma/v1/me/export?format=md|json   context export
POST   /api/soma/v1/me/forget                  leave this app and erase its copy
GET    /api/soma/v1/me/grants                  AI grants that reach this app
DELETE /api/soma/v1/me/grants/:id              revoke one grant
GET    /api/soma/v1/me/receipts                this person's receipts in this app
POST   /api/soma/v1/receipts/:id/undo          run the action's undo
```

The vendored identity adapter binds the Guide's existing `cfg.identity.recordSeen` hook to `POST /me/concepts/:id`. The Guide itself needs no change.

Pairing and token issuance live on the identity origin, not on the app:

```text
GET  https://id.<SOMA_APEX>/.well-known/oauth-authorization-server
POST https://id.<SOMA_APEX>/agents/device-code      (RFC 8628 device authorization)
POST https://id.<SOMA_APEX>/agents/token            (device_code and refresh_token grants)
GET  https://id.<SOMA_APEX>/.well-known/jwks.json
```

The app's `/.well-known/soma-app.json` names these URLs, so the AI still starts from the app's own URL.

The AI's long-lived refresh credential is presented only to the broker.

The broker exchanges it for an access token that lives at most 10 minutes. The token carries `aud = "app:<app_id>"`, `grant_id`, `scopes`, and `risk_ceiling`.

An app accepts an agent token only when its signature verifies against the broker's JWKS and its `aud` names that app. A token captured by one app is therefore useless at any other app.

The broker publishes RFC 8414 metadata so that the v1.1 MCP adapter can reuse the same authorization server instead of adding a second auth design.

The unauthenticated device-code endpoint uses a database-backed rate limit per IP address and per app. PlayMaker's current in-memory, per-instance throttle (`playmaker/netlify/functions/agent-pair-start.ts`) does not hold across function instances.

An approval has three bindings:

- The `approval_url` must be on the app's registered origin or the identity origin. The page shows the requesting AI's label and the grant's principal.
- Only the grant's principal, signed in, can confirm. Anyone else sees a refusal.
- `GET /api/soma/v1/approvals/:id` returns the approval token only to an access token for the same `grant_id`. The token is single-use and expires within 10 minutes.

Public discovery and public knowledge require no authentication.

Effect actions require a person session or broker-issued agent access token. Public `view` and `observe` actions may allow visitors when the manifest says so.

The device-code screen shows the AI label, destination app, requested scopes, risk ceiling, purpose, and expiry.

The person may narrow the request before approval.

The broker returns the long-lived refresh credential once and stores only its hash. Apps see only short-lived, app-audience access tokens.

Revocation invalidates new agent sessions immediately.

Outside AIs fall into two classes. A chat AI that can only fetch pages can read discovery, `/llms.txt`, and public knowledge, and can tell its person how to connect an AI that can act. An AI with an HTTP or code tool can pair, receive grants, and act. M0 records which current assistants fall in each class.

A generated MCP adapter is the first v1.1 feature. It is generated from the same action registry and uses the broker's OAuth metadata and per-app grants from this section, because Claude and ChatGPT connectors speak MCP rather than OpenAPI.

### 2.8 Package boundaries and delivery

| Component | Delivery | Reason |
|---|---|---|
| `packages/soma-contracts` | Vendored types; schema used at build time | The manifest schema and generated types need one owner. |
| `packages/soma-signin` | Vendored React and static adapters | Sign-in must match the app and remain available during CDN failure. |
| `packages/soma-identity` | Vendored client adapter plus central `apps/soma-id` service | Cross-app recognition needs one broker and app-local integration. |
| `packages/soma-tickets` | Vendored | Invitation routes, UI, and migrations belong to the app release. |
| `packages/soma-actions` | Vendored client and server code | Enforcement must be pinned with the app that executes the action. |
| `packages/soma-feedback` | Vendored | The widget and hooks must have one versioned source. |
| `packages/soma-meter` | Vendored server and client adapters | Metering participates in the app’s transaction boundary. |
| `packages/soma-errors` | Vendored | Error capture must still work when shared presentation services fail. |
| `packages/soma-guide` | Immutable CDN version with SRI | One maintained Guide serves React and static apps, but each app pins a release. |
| `packages/soma-assist-core` | Bundled into the Guide release | It is a Guide implementation detail. |
| `packages/soma-scaffolder` | Build-time tool | It creates and updates applications. |
| `packages/soma-conformance` | Development and CI tool | It proves the manifest and live behavior agree. |
| Template recipes | Copied by the scaffolder | Changelog views, legal routes, notifications, analytics, UI helpers, and optional billing do not justify runtime packages yet. |

The lock file is:

```json
{
  "kit_version": "1.0.0",
  "source_commit": "<soma-platform-sha>",
  "contract_sha256": "<canonical-contract-hash>",
  "guide": {
    "version": "1.0.0",
    "url": "https://soma-guide.netlify.app/v1.0.0/soma-guide.js",
    "integrity": "sha384-..."
  },
  "packages": {
    "@soma/signin": {
      "version": "1.0.0",
      "sha256": "..."
    },
    "@soma/actions": {
      "version": "1.0.0",
      "sha256": "..."
    }
  }
}
```

The updater must refuse to overwrite locally modified vendored files.

React-app mode already vendors `@soma/signin`, `@soma/tickets`, `@soma/meter`, and `@soma/feedback`, with `VENDORED.md` recording the source commit (`packages/soma-scaffolder/README.md`). `soma-kit.lock.json` replaces `VENDORED.md`; it does not create a second provenance record.

The Guide's package name is `@soma-platform/soma-guide`, while its delivery remains the immutable CDN asset above.

A Guide release loads no code from outside its own immutable version path. `deploy-guide.sh` fails a release whose bundle contains a remote `import()` URL, and the Guide refuses a `voiceAgentEsmUrl` override unless the lock file lists it with an integrity hash.

`deploy-guide.sh` publishes each release twice: to `/v<semver>/` with `Cache-Control: public, max-age=31536000, immutable`, and to the root path that existing non-kit consumers load. Kit apps load only the versioned path. `dist/releases.json` maps each semver to its `SOMA_GUIDE_VERSION` date string and integrity hash.

## 3. The contract an app signs

### 3.1 Canonical manifest

Move the canonical schema to:

```text
soma-platform/packages/soma-contracts/schema/soma-app-v1.schema.json
```

Keep a compatibility entry point at:

```text
soma-platform/packages/soma-scaffolder/schema/soma-app.schema.json
```

That path keeps the **v0** schema unchanged. It is not an entry point for v1.

The v1 manifest is a new document shape, not an extension of v0. The v0 spec has a root `soma_app` object with `slug`, `targets`, `affordances`, and `meta`, and forbids other root keys, so it cannot validate a v1 manifest.

The scaffolder dispatches on the document:

- A document with `"schema_version": "soma.app/1"` validates against `soma-app-v1.schema.json` with Ajv (draft 2020-12). Ajv becomes a scaffolder and conformance development dependency; it is never vendored into apps.
- A document with a root `soma_app` is accepted only by `soma-scaffold migrate-spec <v0.json> > soma-app.json`. The converter emits a v1 manifest and prints every v0 field it could not map. The three existing examples (`examples/legends.soma.json`, `legends-billing.soma.json`, `soma-forge.soma.json`) are its test fixtures.

The contract hash, `contract_sha256`, is the SHA-256 of the RFC 8785 (JSON Canonicalization Scheme) form of `{ "manifest": <manifest>, "files": { "<path>": "<sha256 of file bytes>" } }`, where `files` lists every path the manifest references. Reformatting the manifest does not change the hash. Changing a referenced schema, persona, or knowledge file does.

`soma.apps.contract_sha256`, the status endpoint, the lock file checks, and the evidence bundle all use this contract hash.

`expected_response` states how soon the human host normally replies. It is a stated expectation shown to the person, not a contractual service-level agreement.

A minimal contract looks like:

```json
{
  "$schema": "./vendor/soma/soma-app-v1.schema.json",
  "schema_version": "soma.app/1",
  "app": {
    "id": "veric-coaching",
    "name": "V'Eric Coaching",
    "tier": "prototype",
    "origins": ["https://preview--veric-coaching.netlify.app"],
    "repository": "eldrgeek/veric-coaching"
  },
  "hosts": {
    "human": {
      "id": "eric",
      "name": "Eric",
      "role": "Human host",
      "escalation_url": "/contact",
      "expected_response": "Within two working days"
    },
    "ai": {
      "id": "veric",
      "name": "V'Eric",
      "role": "AI host",
      "persona": "personas/veric.md",
      "guide_agent": "elevenlabs:<agent_id>"
    }
  },
  "identity": {
    "mode": "shared-soma",
    "subject": "pairwise",
    "first_cross_app_visit": "offer",
    "device_storage": "opaque-marker",
    "profile_fields": ["display_name", "locale"]
  },
  "concepts": [
    {
      "id": "soma:host-pair",
      "version": "1",
      "title": "Who hosts this app",
      "tell": "/knowledge/host-pair.md",
      "show": "meet-the-hosts"
    }
  ],
  "questions": [
    {
      "id": "veric:coaching-goal",
      "schema_version": "1",
      "sharing_default": "private"
    }
  ],
  "actions": [
    {
      "id": "coaching.inspect-agenda",
      "version": "1",
      "kind": "observe",
      "required_scopes": ["agenda:read"],
      "required_role": "member",
      "surfaces": ["ui", "guide", "remote"],
      "input_schema": "schemas/inspect-agenda.input.json",
      "output_schema": "schemas/inspect-agenda.output.json",
      "effects": []
    },
    {
      "id": "coaching.save-reflection",
      "version": "1",
      "kind": "effect",
      "risk": "reversible",
      "required_scopes": ["reflection:write"],
      "required_role": "member",
      "surfaces": ["ui", "guide", "remote"],
      "input_schema": "schemas/save-reflection.input.json",
      "output_schema": "schemas/reflection.output.json",
      "effects": ["Creates a private reflection"],
      "undoable": true
    }
  ],
  "workflows": [
    {
      "id": "meet-the-hosts",
      "steps": [
        {
          "target": "[data-soma=human-host]",
          "text": "Eric is the human host."
        },
        {
          "target": "[data-soma=ai-host]",
          "text": "V'Eric is the AI host."
        }
      ]
    }
  ],
  "ai_visitors": {
    "enabled": true,
    "default_grant_minutes": 60,
    "maximum_standing_risk": "reversible",
    "stranger_test_action": "coaching.inspect-agenda"
  },
  "promises": [
    {
      "id": "identity.no-name-before-consent",
      "text": "This app will not receive your name until you choose to continue.",
      "check": "identity/no-name-before-consent"
    },
    {
      "id": "actions.no-silent-success",
      "text": "Every action will show a result or failure.",
      "check": "actions/receipt-required"
    }
  ],
  "data_flows": [
    {
      "vendor": "ElevenLabs",
      "what": "Questions typed or spoken to the Guide",
      "why": "Run the in-app AI host's conversation",
      "retention": "Declared by the operator"
    },
    {
      "vendor": "Anthropic",
      "what": "Messages sent to V'Eric",
      "why": "Generate the AI host's reply",
      "retention": "Declared by the operator"
    }
  ],
  "legal": {
    "operator": "Mike-ratified entity",
    "privacy": "/privacy",
    "terms": "/terms",
    "data_export": "/settings/export",
    "account_erasure": "/settings/delete",
    "agent_revocation": "/settings/agents"
  },
  "credits": {
    "page": "/credits",
    "require_artifact_byline": true
  },
  "dependencies": {
    "identity_broker": {
      "required": true,
      "fallback": "existing-sessions-and-public-pages"
    },
    "guide_cdn": {
      "required": false,
      "fallback": "/help"
    }
  }
}
```

### 3.2 What the app gets

A conforming app receives:

- Shared sign-in and offered cross-app recognition.
- Pairwise app identity and an opaque known-device marker.
- Versioned concept state, shareable answers, and resume state.
- A named host pair and human escalation route.
- Ask, Show, and Do over one typed action registry.
- Server-enforced risk gates, idempotency, receipts, and undo.
- Outside-AI discovery, pairing, grants, and revocation.
- Personal and shared invitation flows.
- The feedback chip, per-app queue, and estate outbox.
- Admin and participant changelog views.
- Error capture and dependency fallbacks.
- Usage metering and optional billing hooks.
- Privacy, terms, data-flow, export, erasure, revocation, and credits routes.
- React and static-site adapters.
- Local and live conformance tests.
- A version and proof beacon.

### 3.3 Conformance command

Add:

```text
soma-platform/packages/soma-conformance/
├── bin/soma-conform.mjs
├── checks/
├── journeys/
│   ├── anonymous-visitor.spec.ts
│   ├── known-person.spec.ts
│   ├── outside-ai.spec.ts
│   ├── revoked-agent.spec.ts
│   └── degraded-mode.spec.ts
└── package.json
```

Run locally:

```bash
cd ~/Projects/soma-platform
node packages/soma-conformance/bin/soma-conform.mjs \
  --contract /path/to/app/soma-app.json \
  --repo /path/to/app \
  --tier prototype
```

Run against a deploy preview:

```bash
cd ~/Projects/soma-platform
node packages/soma-conformance/bin/soma-conform.mjs \
  --contract /path/to/app/soma-app.json \
  --repo /path/to/app \
  --url "$DEPLOY_PREVIEW_URL" \
  --tier prototype \
  --journeys
```

The gate must check:

| ID | Check |
|---|---|
| C1 | The manifest passes JSON Schema validation. |
| C2 | Both hosts, their roles, human escalation, and the human host's expected response time are declared and rendered. |
| C3 | Every concept and question has an ID and version. Every concept is in `soma:` or the app's own namespace. |
| C4 | Every action has schemas, scopes, kind, effects, and, for effect actions, risk and whether it is undoable. |
| C5 | Every `effect` action has a UI binding or a reviewed `ui_exception`. An exception is allowed only for `reversible` actions whose receipts offer undo in the UI. |
| C6 | Consequential and irreversible actions cannot bypass confirmation. A remote request without a valid approval token returns `approval_required` with an `approval_url`. |
| C7 | Repeated idempotency keys do not repeat effects, and conflicting input hashes fail. An action with `undoable: true` implements `undo`, and the check calls `POST /receipts/:id/undo` once. |
| C8 | A paired AI cannot exceed its app, scope, expiry, or risk ceiling. |
| C9 | A revoked AI grant fails on the next request. |
| C10 | The device marker contains no PII, user ID, or credential. |
| C11 | An unvisited app cannot learn or display the person’s name before consent. |
| C12 | Cross-person and cross-app RLS probes fail, including direct PostgREST probes made with a broker-minted JWT for another person, another app, or the `soma` schema. |
| C12a | Every `SECURITY DEFINER` function the app can call derives its app from authenticated context. A probe passing another app's ID as an argument fails. |
| C13 | Vendored files and the Guide asset match `soma-kit.lock.json`. |
| C14 | Discovery, OpenAPI, runtime actions, and manifest actions agree. |
| C15 | Feedback creates both the app record and a retryable outbox event. |
| C16 | User-visible actions end in success, failure, refusal, or pending approval and produce receipts. |
| C17 | Declared dependency failures expose the declared fallback. |
| C18 | Required routes exist. Public MVP also requires ratified content. |
| C19 | Credits name human and AI contributors and record model or substrate when known. |
| C19a | When the Guide is enabled, `data_flows` declares the Guide's conversation vendor, and the compiled Guide knowledge contains every concept's `tell` file. |
| C20 | The live status endpoint reports the tested release SHA, contract hash, result, and timestamp. |
| C21 | Every Golden Journey page has no serious or critical axe-core violations at 1280 px and 375 px. Every Show step's target is reachable by keyboard, and the step's text is announced through an `aria-live` region. |

Live journeys run against the shared production project, so they use only test people (`soma.people.is_test = true`).

The broker exposes a test sign-in that works only for test people and only with the conformance credential the steward seat holds. Automated journeys never wait for a magic-link email.

A permanently registered fixture app, `soma-fixture`, gives each test person a prior membership, so the known-person journey always has an “other SOMA app.”

Each run deletes its test memberships, grants, answers, and receipts when it finishes. Metrics and the estate board exclude test people.

Existing package checks remain runnable:

```bash
cd ~/Projects/soma-platform
npm --prefix packages/soma-signin test
npm --prefix packages/soma-tickets test
npm --prefix packages/soma-meter test
npm --prefix packages/soma-feedback test
npm --prefix packages/soma-onboard test
npm --prefix packages/soma-guide test
npm --prefix packages/soma-scaffolder test
node packages/soma-scaffolder/tools/standup-check.mjs
npm --prefix packages/soma-conformance test
```

## 4. Migration

### 4.1 Order of work

| Phase | Work | Demonstration |
|---|---|---|
| M0: Freeze evidence | Record current package APIs. Generate a fixture from PlayMaker’s current action catalogue. Capture PlayMaker invitation, sign-in, feedback, and Agent API journeys. Capture all 22 Legends Guide configurations. Record which current outside AIs are fetch-only and which have an HTTP or code tool. | The old journeys run before kit code changes. The fixture records the actual action count rather than trusting a prose count. The outside-AI evidence names each AI and its available tool class. |
| M1: Contract and conformance | Create `@soma/contracts` with the v1 schema, add Ajv validation, add `soma-scaffold migrate-spec` for v0 specs, add `soma-kit.lock.json`, and build C1–C5 and C13–C14. | A disposable generated app builds and fails when a host, action binding, or vendored file is altered. All three v0 examples convert to valid v1 manifests. |
| M2: Action foundation | Extract PlayMaker’s registry, catalogue validation, workflow validation, and mapping checks into `@soma/actions`. Add risk, scopes, idempotency, and receipt interfaces without changing PlayMaker. | Package fixtures remain behaviorally equivalent to the frozen PlayMaker fixtures. |
| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template` and its functions; a generated app receives only `SOMA_APP_INSTALLATION_KEY`. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. A freshly generated app's environment contains no shared-project secret. |
| M4: AI door | Generate discovery and OpenAPI from the manifest. Add device-code pairing, app grants, revocation, and C8–C9. | A stranger AI receives only the URL and completes an allowed inspection. A revoked token then fails. |
| M5: Consolidate plumbing | Expand `@soma/tickets`. Make `@soma/feedback` canonical. Add static adapters, versioned Guide assets, meter UI, and the feedback outbox. | Package tests pass. A generated React app and generated static fixture use the same contracts. |
| M6: Legends preview | Generate `legends-membership-site/soma-app.json`. Vendor static identity and action adapters. Pin the Guide. Adapt its changelog and concept state behind flags. | Existing anonymous, member, admin, Guide, and degraded-CDN journeys pass on a deploy preview. |
| M7: PlayMaker manifest PR | Add the manifest, lock file, discovery documents, status endpoint, and conformance report without changing product behavior. | PlayMaker’s existing tests and live smoke checks remain green. |
| M8: PlayMaker action PRs | Replace internal registry imports with the vendored package. Generalize the existing `agent_command_requests` idempotency into receipts, in shadow mode. Move the agent seam from the legacy JWT secret to broker-issued agent tokens. | Existing UI and Agent API produce equivalent outcomes. Shadow receipts agree before cutover. Paired agents keep working through the alias routes. |
| M9: PlayMaker identity and plumbing PRs | Adopt identity, tickets, feedback, concept state, and changelog through separate flagged adapters. | Eric’s current workflow passes with each flag off and on. Each flag ships off and is flipped only after Eric or Mike has seen the screen. |
| M10: Second-app test | Run the timed build from an approved manifest without editing `soma-platform`. | Section 5 passes on a live Netlify preview. |
| M11: Retire app-held shared secrets | Move PlayMaker's metering, agent ingress, and admin functions behind broker calls or PlayMaker-scoped `SECURITY DEFINER` functions. Do the same for Legends. Remove both apps' shared secret keys. Then revoke the legacy JWT secret and rotate the shared project to asymmetric signing keys. | A scan of every SOMA Netlify site's environment finds no shared-project secret key outside the broker. PlayMaker's and Legends' journeys pass after the legacy secret is revoked. |

### 4.2 PlayMaker safeguards

PlayMaker remains Eric’s repository.

Every PlayMaker change arrives as a reviewable pull request.

Database migrations stay additive until old and new readers have completed the compatibility window.

Existing invitations remain redeemable until they expire.

Existing paired agents remain valid during a published transition window.

Existing action implementations are wrapped before they are rewritten.

No migration renames PlayMaker concepts or changes its domain model.

PlayMaker ships straight to production after `pr-merge-green`, gated on typecheck, build, and the full test suite (its default branch is `master`). A kit change that alters a screen lands behind a flag that defaults off. Flipping the flag is the user-visible release, and it happens only after Eric or Mike has seen the screen. A deploy preview is used only where tests cannot cover the risk, and then with a test login that works only outside production, because saved passwords autofill only on the production domain.

PlayMaker's existing AI routes (`/api/agent/v1/*`, `/api/agent-pair-start`, `/api/agent-pair-poll`, `/api/agent-pair-approve`) keep working as aliases for at least 90 days after the `/api/soma/v1/*` routes ship. `public/llms.txt` lists both during that window.

Every feature flag has a tested rollback path.

### 4.3 Retirement rules

`@soma/onboard` stops generating member tables after the ticket migration passes.

Old auth copies retire after the Legends static journey passes in production.

Invitation standards folders archive only after their behavior is represented in tests and their paths point to `@soma/tickets`.

`public.soma_profiles` becomes a compatibility view before any caller is removed.

Dropping a table, column, credential, or compatibility view requires separate approval and a restore proof.

## 5. The second-app test

The test uses a new repository.

The recommended subject is V’Eric coaching.

The timer begins when an approved `soma-app.json` is handed to one Cursor or Codex builder.

The manifest must already contain:

- The app name and allowed preview origin.
- Both hosts and the human escalation path.
- The AI host's Guide agent, created by `soma-scaffold register` from the persona file through the ElevenLabs API, or its manual creation time counted inside the four hours.
- Three concepts.
- One Show workflow.
- One `observe` action.
- One `reversible` action.
- One `consequential` action.
- One outside-AI test task.
- One app promise.
- Data-flow declarations.
- Legal-content owners.

### Time targets

| Milestone | Target |
|---|---|
| Scaffold, install, typecheck, and local production build | 15 minutes |
| Live Netlify deploy preview | 30 minutes |
| Complete Golden Journey and evidence bundle | Four working hours |

A run that requires an edit to `soma-platform` fails.

The defect is fixed in the kit.

The timed run then restarts.

### Golden Journey

The test must demonstrate:

1. An unknown visitor sees both named hosts, the human handoff, and the expected human response time.
2. The visitor signs in and receives one app membership.
3. A person already known to another SOMA app sees the same neutral offer a stranger sees. One tap on the identity origin then recognizes them without re-entering credentials.
4. The new app does not receive or display the person’s name before acceptance.
5. The accepted person is greeted by name with the source identified.
6. A previously understood SOMA concept is not re-taught.
7. A private answer from another app is not visible.
8. An explicitly shared compatible answer prevents a repeated question.
9. Ask returns an answer grounded in declared knowledge.
10. Show highlights the controls for the declared workflow.
11. Do performs a reversible action and returns an undoable receipt.
12. A consequential action stops for fresh confirmation. When an outside AI requests it, the AI receives an `approval_url`, and the action runs only after the person approves.
13. An outside AI with an HTTP tool discovers the app from its URL without vendor-specific instructions. The evidence names the AI and its tool.
13a. A chat AI that can only fetch pages explains the app correctly from `/llms.txt` and tells the person how to connect an AI that can act.
14. The AI pairs without a copied secret.
15. The AI performs one permitted inspection and one permitted reversible action.
16. The same AI is denied an undeclared scope.
17. Revoking the grant blocks its next request.
18. Feedback creates a per-app record and an estate outbox event.
19. Context export produces readable Markdown and complete machine-readable JSON.
20. Disabling the Guide exposes the declared help fallback.
21. The status endpoint reports the tested release and passing journey.
22. The evidence bundle contains the live URL, release SHA, contract hash, conformance output, screenshots, and receipts.

## 6. Product questions for Mike

1. **Which domain should own SOMA identity?**  
   Recommendation: use a neutral SOMA-controlled apex for the permanent identity, and decide it before the first real person signs in, because sessions, saved passwords, and passkeys bind to that origin and moving it later forces everyone to sign in again. Until then, the preview broker runs on a Netlify subdomain with test accounts only, so the two-week release needs no DNS change. If the answer is `id.mike-wolf.com`, the DNS record is a GoDaddy step only Mike can perform.

2. **Will you ask Eric to accept the PlayMaker kit sequence, and who flips flags on screens he uses?**
   Recommendation: ask Eric once to approve the M7–M9 sequence as a batch. Claude merges each pull request under the existing direct-to-production rule with its flag off. Eric flips each flag that changes a screen he uses; Mike flips it if Eric has not responded within a week.

3. **What standing authority may a person grant to their own AI?**  
   Recommendation: default to named read scopes and reversible writes for 60 minutes. Require fresh human approval for consequential or irreversible actions.

4. **Which entity and retention promise appear in the standard legal pages?**  
   Recommendation: name the SOMA operating entity Mike filed, with any app-specific partner named where required. Retain raw AI-host conversations for 30 days, feedback until disposition plus 90 days, and action receipts for one year unless law or payment records require longer.

5. **Which product is the timed second-app test?**  
   Recommendation: V’Eric coaching. It exercises the host pair, identity, concepts, outside-AI participation, and the current AI–human-pair revenue direction without waiting for OLLI’s institutional decisions.

## 7. Assumptions to test with a person

| Assumption | Cheap test without code | Pass condition |
|---|---|---|
| Offered recognition feels helpful rather than invasive. | Show five people paper versions of silent greeting, named offer, and neutral offer. | At least four prefer the neutral offer and understand what acceptance reveals. |
| Ask, Show, and Do are distinct and understandable. | Give five people three task cards and ask what response they expect from each verb. | At least four distinguish explanation, demonstration, and execution. |
| People can judge an AI grant. | Show a paper grant with app, scopes, expiry, risk ceiling, and revoke control. | The person can state what the AI can do, where, for how long, and how to stop it. |
| Pairing once but granting per app feels coherent. | Walk five AI users through two app-entry scenarios. | At least four understand why their AI is recognized but not automatically authorized. |
| Personal and shared invitations need different disclosure. | Show matched message mockups with personal and shared links. | Recipients correctly identify who may use each link and what the inviter will learn. |
| Compact receipts increase trust. | Show receipts for success, refusal, failure, and undoable action. | The person can identify the outcome and next step in one glance. |
| The host pair clarifies responsibility. | Show the host card and ask who handles product judgment, app help, and escalation. | At least four of five assign each responsibility correctly. |
| Concept IDs can safely prevent repeated teaching. | Ask two hosts to classify ten concepts as equivalent, revised, or app-specific. | Disagreements produce separate IDs or new versions before implementation. |
| People value portable context export. | Show a sample Markdown export and ask what they would remove, add, or hand to their own AI. | Most participants identify at least one realistic use and no unexpected private field. |
| Outside AIs can use the neutral contract within their tool limits. | Give participants a static discovery fixture and ask them to hand only its URL to a fetch-only chat AI and to an AI with an HTTP or code tool. | The fetch-only AI explains the app and the acting requirement; the tool-capable AI independently finds the pairing instructions and prepares a valid inspection request. |

## 8. Risks and what to cut for a two-week ship

### 8.1 Principal risks

| Risk | Control |
|---|---|
| The kit becomes every SOMA idea at once. | Hold the core to identity, hosts, concept state, Ask/Show/Do, consent, AI access, feedback, receipts, and conformance. |
| One shared Supabase project becomes an estate-wide breach boundary. | New apps never hold a shared secret. PlayMaker and Legends get separately revocable `sb_secret_…` keys in week one and lose them in M11. Until M11 the evidence bundle states that isolation covers new apps only. Test cross-app and cross-person isolation. |
| Cross-app recognition feels like surveillance. | Keep PII out of the device marker. Require consent on the first visit to another app. Provide describe, export, and forget controls. |
| The broker becomes a single point of failure. | Keep existing sessions running to expiry, keep public pages and public-knowledge Ask working, and show the outage with the human contact route. Test broker failure in the live journey. Never fall back to in-app Supabase Auth sign-in for a pairwise app. |
| An outside AI receives excessive authority. | Require app scope, named scopes, expiry, risk ceiling, idempotency, receipts, and fresh approval for consequential acts. |
| A manifest claims enforcement that runtime code does not perform. | Generate OpenAPI from the registered runtime actions and compare it with the manifest during conformance. |
| Vendored code drifts. | Hash every vendored file and report drift through the beacon. |
| A Guide release breaks every site. | Pin immutable versions and SRI hashes. Test a real consumer before promotion. |
| Shared concept IDs suppress teaching that was actually needed. | Version concepts and require hosts to review cross-app equivalence. |
| Feedback disappears during forwarding. | Keep the app record canonical and publish through a retryable transactional outbox to `soma.estate_inbox`; report dead letters through status. |
| Legal templates create false confidence. | Require ratified operator, retention, and data-flow content before public MVP. |
| PlayMaker migration disrupts Eric’s work. | Use small PRs, feature flags that ship off, shadow writes, existing tests, and the established direct-to-production gate. Flip screen flags only after Eric or Mike has seen them. |
| “Done” becomes a checklist claim. | Require the live Golden Journey and evidence bundle. |

### 8.2 Two-week release

The two-week release must include:

- `soma.app/1` JSON Schema and updated examples.
- `soma-kit.lock.json`.
- Contract-driven discovery and OpenAPI generation.
- `@soma/actions` with the four risk levels.
- Server-side idempotency and receipts.
- Core conformance checks C1–C14, C19a, C20, and C21.
- A preview identity broker with offered recognition and pairwise app IDs.
- Concept state and private-by-default answers.
- Broker-hosted outside-AI device-code pairing with app-scoped grants and app-audience access tokens.
- The canonical feedback widget.
- A generated React reference app.
- A generated static reference fixture.
- An immutable Guide release path.
- `soma-scaffold register` and `soma-scaffold migrate`.
- The `soma-fixture` app and test people for live journeys.
- Separate revocable secret keys for PlayMaker and Legends.
- One manifest-only PlayMaker pull request.
- One manually witnessed outside-AI journey.
- A published evidence bundle.

The two-week release cuts:

- The Legends deploy preview, which moves to week three.
- Production PlayMaker identity migration.
- Full PlayMaker action cutover.
- Changelog data migration.
- The cross-app receipts UI.
- Automated legal prose.
- Automated global erasure execution.
- MCP generation.
- DIDs and holder-of-key proofs.
- Client-held signing keys.
- Free-form cross-app memory.
- A SOMA-owned traveling consigliere.
- Attention-budget enforcement.
- CoEvolution continuity.
- Accord UI.
- Rooms, community chat, and video.
- Voice conversation.
- Billing and BYOK.
- Live in-place editing.
- Produced tour films.
- Full error-service extraction.
- Automated Stripe, OAuth, DNS, or domain-account creation.

The release must not cut:

- The consent boundary before cross-app identity disclosure.
- RLS and broker isolation for new apps, plus truthful disclosure of the legacy exception until M11.
- The server-side action gate.
- App-scoped AI authority.
- Idempotency and receipts.
- Vendored-file verification.
- Ask, Show, or Do.
- The live demonstration.

### 8.3 Two-week build sequence

| Days | Builder A | Builder B | Builder C |
|---|---|---|---|
| 1–2 | Contract, lock file, and generator | Action-registry extraction and fixtures | Shared schema, broker threat model, and RLS tests |
| 3–5 | Conformance C1–C7 and C13–C14 | Risk gate, idempotency, and receipts | Authorization-code identity flow and pairwise IDs |
| 6–8 | React and static reference fixtures | AI discovery, pairing, grants, and revocation | Concept state, answers, and tickets integration |
| 9–10 | Feedback canonicalization and outbox | Immutable Guide release and degraded mode | Cross-app and outside-AI Golden Journeys |
| 11–12 | `register`, `migrate`, the fixture app, and test people | PlayMaker manifest-only PR and per-app secret keys | Security, privacy, and accessibility review |
| 13 | Integrated deploy preview | Failure injection | Evidence collection and compatibility audit |
| 14 | Timed second-app rehearsal | Fixes from rehearsal | Final live demonstration |

Claude reviews and merges bounded work.

Cursor and Codex build from self-contained beads.

The release is complete only when the generated React reference app and the generated static reference fixture pass the same live conformance command.

## Appendix A: Merge notes

### What I took from OpenAI Sol

- The kit is a constitutional runtime, not a catalog of every SOMA idea.
- The app manifest should declare promises, failure modes, actions, concepts, and hosts.
- Actions need typed inputs, server-enforced risk gates, idempotency, receipts, and compensation.
- The Guide should use immutable CDN releases, while code executing inside an app should be vendored and hash-locked.
- Migration should use adapters, additive database changes, feature flags, and Golden Journeys instead of rewrites.

### What I took from Anthropic Claude Opus

- The current `soma-app.json` and scaffolder are the correct starting point.
- “Do not re-ask” requires a versioned answer store in addition to concept-seen state.
- PlayMaker’s command registry is the strongest implementation source for Ask, Show, and Do.
- “Where your words go” and the kit beacon turn abstract trust and drift concerns into visible product behavior.
- Four working hours is a credible full stand-up target when deployment and host configuration are included.

### What I took from Google Gemini 3.1 Pro

- Its shorter plan made three sharp product calls: guaranteed human handoff, portable context export, and a universal activity log.
- Cross-app recognition should always be offered before an unvisited app receives identity.
- An outside AI may read public discovery material anonymously, but it must authenticate before acting.
- A fifteen-minute scaffold-to-local-build milestone is useful inside the broader four-hour stand-up test.

### Rejected from the source plans

- I rejected direct browser writes to shared tables that trust a caller-supplied `app_id`. A malicious client could impersonate another app.
- I rejected distributing the Supabase service-role key to app runtimes. One compromised app would expose the shared project.
- I rejected globally reusable AI authority as the default. Pairing and authorization are separate decisions.
- I rejected generated legal prose as a substitute for an operator’s ratified terms.
- I rejected “working Vite app” as the complete stand-up definition. The test must demonstrate identity, Ask/Show/Do, outside-AI access, feedback, and revocation.
- I rejected cutting Do from a two-week release. Ask, Show, and Do is one of the two capabilities Mike explicitly required.
- I rejected a package for every small helper. Toasts, tooltips, deploy reload, and share-image recipes stay in the template until two independent apps need the same maintained API.

_Authorship: Mike Wolf, principal and product owner; source plans by OpenAI Sol, Anthropic Claude Opus, and Google Gemini 3.1 Pro; merged by OpenAI Codex for the SOMA brain trust, 2026-10-07._
