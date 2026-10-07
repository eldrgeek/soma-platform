# SOMA App Kit v1 — the living plan

_Paths are relative to `~/Projects/` unless stated otherwise._

## Merge notes

### What I took from OpenAI Sol

- The kit is a constitutional runtime, not a catalog of every SOMA idea.
- The app manifest should declare promises, failure modes, actions, concepts, and hosts.
- Actions need typed inputs, server-enforced risk gates, idempotency, receipts, and compensation.
- The Guide should use immutable CDN releases, while code executing inside an app should be vendored and hash-locked.
- Migration should use adapters, additive database changes, feature flags, and Golden Journeys instead of rewrites.

### What I took from Anthropic Claude Opus

- The current `soma.app.json` and scaffolder are the correct starting point.
- “Do not re-ask” requires a versioned answer store in addition to concept-seen state.
- PlayMaker’s command registry is the strongest implementation source for Ask, Show, and Do.
- “Where your words go” and the kit beacon turn abstract trust and drift concerns into visible product behavior.
- Four working hours is a credible full stand-up target when deployment and host configuration are included.

### What I took from Google Gemini 3.1 Pro

- Its shorter plan made three sharp product calls: guaranteed human handoff, portable context export, and a universal activity log.
- Cross-app recognition should always be offered before an unvisited app receives identity.
- An outside AI may read public discovery material anonymously, but it must authenticate before acting.
- A fifteen-minute scaffold-to-local-build milestone is useful inside the broader four-hour stand-up test.

### Disagreements resolved

| Question | Decision | Reason |
|---|---|---|
| `soma.app.yaml`, `soma.app.json`, or `soma.config.ts` | Use `soma.app.json`. | The scaffolder already validates JSON through `packages/soma-scaffolder/schema/soma-app.schema.json`. JSON is inert, portable, and does not require executing app code. |
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

### Rejected from the source plans

- I rejected direct browser writes to shared tables that trust a caller-supplied `app_id`. A malicious client could impersonate another app.
- I rejected distributing the Supabase service-role key to app runtimes. One compromised app would expose the shared project.
- I rejected globally reusable AI authority as the default. Pairing and authorization are separate decisions.
- I rejected generated legal prose as a substitute for an operator’s ratified terms.
- I rejected “working Vite app” as the complete stand-up definition. The test must demonstrate identity, Ask/Show/Do, outside-AI access, feedback, and revocation.
- I rejected cutting Do from a two-week release. Ask, Show, and Do is one of the two capabilities Mike explicitly required.
- I rejected a package for every small helper. Toasts, tooltips, deploy reload, and share-image recipes stay in the template until two independent apps need the same maintained API.

## 1. The capability list

### 1.1 Required capabilities

| Capability | What it does for the person | SOMA principle | What exists today | Target design |
|---|---|---|---|---|
| Host pair and human handoff | The person always knows which human and AI host the app and how to reach the human. | Named minds remain accountable. | `SOMA/SOMA-APP-STANDARD.md`; `soma-app-template/src/lib/hostPair.ts`. | Declare both hosts, their roles, and one escalation route in `soma.app.json`. Expose them in the UI and discovery document. |
| Be known | A returning person is recognized without being exposed to an unfamiliar app first. | One identity, consumed rather than forked. | `soma-platform/packages/soma-signin`; PlayMaker’s known-device flow; `soma-platform/docs/SOMA-IDENTITY-STATES.md`. | Use the shared identity broker, pairwise app IDs, an opaque device marker, and a one-tap recognition offer on first cross-app entry. |
| Learn once, answer once, resume | An app does not repeat concepts or questions already settled and returns the person to useful context. | Respect accumulated understanding. | Guide `_recordSeen`; `soma-app-template/supabase/migrations/0005_last_location.sql`; Legends’ `guide_seen`. | Store versioned concept state and explicitly shareable answers centrally. Keep the last app location in the app membership. |
| Invitations | A personal or shared invitation admits the person without creating another identity system. | Relationships precede accounts. | `packages/soma-tickets`; `packages/soma-onboard`; three standards folders; PlayMaker’s flow. | Make `@soma/tickets` canonical. Add personal/shared presentation, QR, channels, abuse controls, and membership creation. |
| Ask, Show, and Do | The person can ask for an explanation, see the relevant controls, or ask the host to act. | Alignment joins understanding with agency. | `packages/soma-guide`; PlayMaker `src/agent-portal/`; Legends Guide actions. | Make one typed action registry serve the UI, Guide, and outside AIs. Bind controls with `data-soma-action="<id>"`. |
| Consent and action receipts | The person sees expected effects before consequential acts and receives a durable result afterward. | Authority must be visible, bounded, and reviewable. | Guide risk flag; PlayMaker audit and pairing code; template delegation migrations. | Enforce risk, scope, expiry, confirmation, idempotency, and compensation on the server. Write one receipt for every attempt. |
| AI visitor door | A person’s own AI can discover, understand, pair with, and use the app without vendor-specific instructions. | Outside AIs are first-class visitors. | PlayMaker `netlify/functions/agent-v1.ts`, `public/llms.txt`, pairing functions, and Agent Portal. | Publish `/.well-known/soma-app.json`, `/llms.txt`, and OpenAPI. Use device-code pairing and per-app grants. |
| Feedback and improvement loop | A person can report a problem or request a change and later see its disposition. | The user participates in the outer RSI loop. | `packages/soma-feedback`; PlayMaker’s feedback queue and build requests. | Make the package the widget’s source of truth. Keep per-app records and send retryable outbox events to the estate board. |
| Changes and review | Stewards approve changes, while participants see only relevant shipped changes they have not seen. | Change remains legible to every participant. | Legends admin changelog; PlayMaker `Changelog` and `WhatsNewList`. | Use one per-app `app_changes` ledger with admin and participant views. |
| Honest operation and recovery | The person sees started, succeeded, failed, retryable, and reversible states. | No silent success and no concealed failure. | PlayMaker error/crash code; template toast and reload helpers. | Standardize action status and error capture. Require a declared fallback for unavailable shared dependencies. |
| Data control and context export | The person can inspect, export, revoke, and erase the information SOMA holds about them. | The person remains the principal of their data. | Consent and erasure specifications exist, but implementation is incomplete. | Provide “What do you know?”, Markdown/JSON export, per-app forget, global erasure request, and AI-grant revocation. |
| Where your words go | The person can see which outside providers receive their text, audio, or files and why. | Honest human–AI relationships require visible data flow. | Privacy material is fragmented; legal pages are mostly missing. | Declare data flows in the manifest and render them in `/privacy`, `/where-your-words-go`, and machine-readable discovery. |
| Credits and provenance | The person can see which human or AI created or changed an artifact. | Every mind receives credit and remains accountable. | `SOMA/standards/SIGNATURES-AND-BYLINES.md`; `SOMA-STD-credits.md`. | Store actor, principal, app, action, model or substrate when known, artifact, and time. Use server-signed receipts in v1. |
| Usage and optional billing | The person sees limits and prices before consuming a metered resource. | Cost belongs to the principal who benefits. | `packages/soma-meter`; PlayMaker `UsageChip.tsx`; billing templates. | Keep metering in the core. Add a generic usage component. Enable billing only through an app-specific declaration. |
| Proof and drift beacon | A person or steward can verify which kit version the app runs and when its live journey last passed. | A claim of done is a demonstration. | `soma-ship-check.py`; scaffolder stand-up check. | Publish release SHA, manifest hash, kit lock hash, and last live conformance result through `/api/soma/v1/status`. |

### 1.2 Inventory disposition

| Inventory item | Decision |
|---|---|
| `soma-platform/packages/soma-signin` | Keep as canonical. Add React and static adapters. |
| `soma-platform/packages/auth` | Deprecate after static consumers migrate. |
| `legends-membership-site/js/soma-auth.js` and `legends-connect/js/soma-auth.js` | Remove only after the vendored static adapter passes the old journeys. |
| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation implementation. Preserve its existing API for one compatibility release. |
| `soma-platform/packages/soma-meter` | Keep. Add a generic client chip based on `playmaker/src/components/UsageChip.tsx`. |
| `soma-platform/packages/soma-feedback` | Keep. Promote `packages/soma-feedback/widget/` from a documented copy to the canonical widget source, then replace the other copies. |
| `soma-platform/packages/soma-guide` | Keep on the CDN. Publish immutable semantic-version paths and SRI hashes. |
| `soma-platform/packages/soma-assist-core` | Keep as an internal Guide dependency. Do not create a second public chat contract. |
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
| Toast, exclusive voice, resume, and tooltip | Keep in the template. Move resume state into membership; do not create a UI package prematurely. |
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

The canonical product contract is `soma.app.json`.

The scaffolder compiles the contract into vendored runtime code, discovery files, legal-page shells, database migrations, tests, and `soma-kit.lock.json`.

The Guide loads from an immutable CDN URL.

The app UI, Guide, and outside AIs use one action registry.

The identity broker owns cross-app recognition and consent.

The shared Supabase project stores authentication and cross-app records.

Each app owns its domain records, detailed feedback, changes, errors, and unpublished content.

No app receives a service-role credential that can read the entire shared project.

### 2.2 Identity flow

1. The app detects only an opaque local marker such as `soma_known_device_v1`.
2. An app with an existing valid membership and session resumes silently.
3. An unvisited app displays a neutral “Continue with SOMA” control.
4. Selecting it opens `https://id.<SOMA_APEX>/authorize` as a top-level navigation.
5. The request includes `app_id`, an allowlisted redirect URI, a PKCE challenge, and a nonce.
6. The identity origin authenticates the person.
7. The identity origin shows the person’s name, the destination app, and the fields that will be disclosed.
8. Acceptance creates or updates membership and consent.
9. The origin returns a single-use authorization code.
10. The app exchanges the code with the PKCE verifier.
11. The result contains an app-scoped session, pairwise `app_person_id`, and only consented profile fields.
12. The app may now greet the person by name and state where it learned the name.

The authorization code must be short-lived and single-use.

The redirect URI must exactly match a registered origin.

The app must not receive a global `person_id`.

### 2.3 Authentication boundary for apps

Shared-table writes must not trust a browser-supplied `app_id`.

Each deployed app receives an installation credential stored only in Netlify Functions.

Only the identity broker stores the Supabase service-role credential.

The broker validates the app credential, binds the request to one `app_id`, validates the person or AI session, and calls narrow database functions.

Static apps receive short-lived app-scoped broker tokens after authorization.

Browser code never receives an installation credential or service-role key.

This boundary must replace existing app-held service-role access incrementally because one shared Supabase project otherwise creates an estate-wide breach path.

### 2.4 Data model

Migrations live under `soma-platform/sql/soma/`.

New app migrations live under the generated app’s `supabase/migrations/`.

PlayMaker’s current domain tables remain in `public` during migration.

Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tables remain in place until their package owners can migrate them without breaking consumers.

#### Shared schema

| Table | Essential fields | Ownership and access |
|---|---|---|
| `soma.people` | `person_id`, `auth_user_id`, `display_name`, `locale`, `timezone`, `created_at`, `erased_at` | The person owns the row. Apps never receive `person_id`. |
| `soma.actors` | `actor_id`, `kind`, `name`, `substrate`, `person_id`, `created_at` | Represents humans, AI hosts, and external AIs for credit and lineage. |
| `soma.apps` | `app_id`, `name`, `origins`, `manifest_sha256`, `kit_version`, `status` | Platform-managed. Public reads expose only active metadata. |
| `soma.app_hosts` | `app_id`, `actor_id`, `role`, `escalation_url` | Public for active apps. Writes are platform-managed. |
| `soma.app_installations` | `app_id`, `credential_hash`, `created_at`, `last_used_at`, `revoked_at` | Broker-only. Raw credentials are never stored. |
| `soma.memberships` | `person_id`, `app_id`, `app_person_id`, `role`, `trust`, `joined_at`, `last_seen_at`, `last_location`, `left_at` | The person reads their rows. App admins use a narrow broker call. |
| `soma.consents` | `person_id`, `app_id`, `fields`, `purpose`, `policy_version`, `granted_at`, `revoked_at` | The person reads and revokes. The broker enforces disclosure. |
| `soma.concept_state` | `person_id`, `concept_id`, `concept_version`, `state`, `source_app_id`, `first_at`, `last_at`, `evidence` | Apps may query only concepts declared in their manifest. |
| `soma.answers` | `person_id`, `question_id`, `schema_version`, `answer`, `source_app_id`, `sharing`, `answered_at`, `revoked_at` | Cross-app reads require `sharing='soma'` and current consent. |
| `soma.agent_partners` | `agent_id`, `principal_id`, `label`, `credential_hash`, `created_at`, `last_used_at`, `revoked_at` | Registers an AI relationship without granting app authority. |
| `soma.agent_grants` | `grant_id`, `agent_id`, `principal_id`, `app_id`, `scopes`, `risk_ceiling`, `purpose`, `expires_at`, `revoked_at` | The principal controls the grant. App scope is required unless `app_id='*'` was explicitly chosen. |
| `soma.action_receipts` | `receipt_id`, `app_id`, `action_id`, `version`, `idempotency_key`, `input_hash`, `actor_id`, `principal_id`, `grant_id`, `risk`, `status`, `effect_summary`, `reversal`, `created_at`, `completed_at` | Principal and actor read their rows. App admins receive redacted app rows. |
| `soma.erasure_requests` | `request_id`, `person_id`, `scope`, `status`, `requested_at`, `effective_at`, `completed_at`, `receipt` | The person reads their requests. Platform workers update status. |

The receipt table must have a unique constraint on `(app_id, action_id, idempotency_key)`.

Reusing an idempotency key with a different `input_hash` must fail.

#### Per-app schema

New apps receive an `app_<app_id>` schema.

| Table | Purpose |
|---|---|
| `feedback_items` | The canonical user report and its evidence. |
| `build_requests` | The report-to-build lifecycle and demonstration links. |
| `feedback_outbox` | Retryable delivery to the estate board. |
| `app_changes` | Proposed, accepted, building, shipped, and rejected changes. |
| `error_reports` | Fingerprinted client and function failures. |
| `front_door_events` | Consent-aware arrival and conversion events. |
| Domain tables | The app’s actual product data. |

Every table has RLS enabled.

Every `SECURITY DEFINER` function sets `search_path`, validates the caller, binds the app from authenticated context, and returns explicit columns.

A conformance test must prove that one person cannot read another person’s rows.

### 2.5 Concept and answer semantics

A concept ID is namespaced, such as `soma:host-pair` or `playmaker:stage-read`.

A concept state is one of `told`, `shown`, `done`, or `acknowledged`.

A new concept version is not automatically treated as understood.

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
  risk: SomaRisk;
  requiredScopes: string[];
  requiredRole: "visitor" | "member" | "editor" | "owner" | "admin";
  surfaces: Array<"ui" | "guide" | "remote">;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  effects: string[];
  idempotent: boolean;
  concept?: { id: string; version: string };
  prepare?: (
    context: ActionContext,
    input: I
  ) => Promise<ActionPreview>;
  execute: (
    context: ActionContext,
    input: I
  ) => Promise<O>;
  compensate?: (
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
    idempotencyKey: string;
    approvalToken?: string;
  },
  context: ActionContext
): Promise<ActionReceipt>;
```

The server enforces the risk gate.

| Risk | Person in current UI | AI host or paired outside AI |
|---|---|---|
| `observe` | Run immediately. | Run with the matching read scope. |
| `reversible` | Run and show receipt plus undo when available. | Run only within a live grant and risk ceiling. |
| `consequential` | Show an effect preview and require confirmation. | Require a fresh approval token bound to the action, version, input hash, principal, and expiry. |
| `irreversible` | Require explicit final wording and a cool-off step. | Never run from standing authority. Require fresh human approval. |

Every mutating request requires `Idempotency-Key`.

Every outcome writes a receipt, including refusal and failure.

UI controls use the same action definition as the Guide and remote API.

AI-only actions are permitted only when `risk="observe"` and the action exposes machine-useful inspection with no honest visual equivalent.

### 2.7 AI visitor door

Every conforming app publishes:

```text
GET /.well-known/soma-app.json
GET /llms.txt
GET /api/soma/v1/openapi.json
GET /api/soma/v1/actions
POST /api/soma/v1/agents/device-code
POST /api/soma/v1/agents/token
POST /api/soma/v1/actions/:id/prepare
POST /api/soma/v1/actions/:id/execute
POST /api/soma/v1/actions/:id/compensate
GET /api/soma/v1/receipts/:id
GET /api/soma/v1/status
```

Public discovery and public knowledge require no authentication.

Actions require a person session or paired-agent session.

The device-code screen shows the AI label, destination app, requested scopes, risk ceiling, purpose, and expiry.

The person may narrow the request before approval.

The raw credential is returned once and stored only as a hash.

Revocation invalidates new agent sessions immediately.

A generated MCP adapter is a v1.1 feature.

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

A minimal contract looks like:

```json
{
  "$schema": "./vendor/soma/soma-app-v1.schema.json",
  "schema_version": "soma.app/1",
  "app": {
    "id": "veric-coaching",
    "name": "V'Eric Coaching",
    "tier": "prototype",
    "origins": ["https://deploy-preview.example.netlify.app"],
    "repository": "eldrgeek/veric-coaching"
  },
  "hosts": {
    "human": {
      "id": "eric",
      "name": "Eric",
      "role": "Human host",
      "escalation_url": "/contact"
    },
    "ai": {
      "id": "veric",
      "name": "V'Eric",
      "role": "AI host",
      "persona": "personas/veric.md"
    }
  },
  "identity": {
    "mode": "shared-soma",
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
      "risk": "observe",
      "required_scopes": ["agenda:read"],
      "required_role": "member",
      "surfaces": ["ui", "guide", "remote"],
      "input_schema": "schemas/inspect-agenda.input.json",
      "output_schema": "schemas/inspect-agenda.output.json",
      "effects": [],
      "idempotent": true
    },
    {
      "id": "coaching.save-reflection",
      "version": "1",
      "risk": "reversible",
      "required_scopes": ["reflection:write"],
      "required_role": "member",
      "surfaces": ["ui", "guide", "remote"],
      "input_schema": "schemas/save-reflection.input.json",
      "output_schema": "schemas/reflection.output.json",
      "effects": ["Creates a private reflection"],
      "idempotent": true,
      "compensation": "coaching.delete-reflection"
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
      "fallback": "local-sign-in"
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
  --contract /path/to/app/soma.app.json \
  --repo /path/to/app \
  --tier prototype
```

Run against a deploy preview:

```bash
cd ~/Projects/soma-platform
node packages/soma-conformance/bin/soma-conform.mjs \
  --contract /path/to/app/soma.app.json \
  --repo /path/to/app \
  --url "$DEPLOY_PREVIEW_URL" \
  --tier prototype \
  --journeys
```

The gate must check:

| ID | Check |
|---|---|
| C1 | The manifest passes JSON Schema validation. |
| C2 | Both hosts, their roles, and human escalation are declared and rendered. |
| C3 | Every concept and question has an ID and version. |
| C4 | Every action has schemas, scopes, risk, effects, and idempotency behavior. |
| C5 | Every non-inspection action has a UI binding or an explicit reviewed exception. |
| C6 | Consequential and irreversible actions cannot bypass confirmation. |
| C7 | Repeated idempotency keys do not repeat effects, and conflicting input hashes fail. |
| C8 | A paired AI cannot exceed its app, scope, expiry, or risk ceiling. |
| C9 | A revoked AI grant fails on the next request. |
| C10 | The device marker contains no PII, user ID, or credential. |
| C11 | An unvisited app cannot learn or display the person’s name before consent. |
| C12 | Cross-person and cross-app RLS probes fail. |
| C13 | Vendored files and the Guide asset match `soma-kit.lock.json`. |
| C14 | Discovery, OpenAPI, runtime actions, and manifest actions agree. |
| C15 | Feedback creates both the app record and a retryable outbox event. |
| C16 | User-visible actions end in success, failure, refusal, or pending approval and produce receipts. |
| C17 | Declared dependency failures expose the declared fallback. |
| C18 | Required routes exist. Public MVP also requires ratified content. |
| C19 | Credits name human and AI contributors and record model or substrate when known. |
| C20 | The live status endpoint reports the tested release SHA, manifest hash, result, and timestamp. |

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
| M0: Freeze evidence | Record current package APIs. Generate a fixture from PlayMaker’s current action catalogue. Capture PlayMaker invitation, sign-in, feedback, and Agent API journeys. Capture all 22 Legends Guide configurations. | The old journeys run before kit code changes. The fixture records the actual action count rather than trusting a prose count. |
| M1: Contract and conformance | Create `@soma/contracts`, extend the existing JSON format, add `soma-kit.lock.json`, and build C1–C5 and C13–C14. | A disposable generated app builds and fails when a host, action binding, or vendored file is altered. |
| M2: Action foundation | Extract PlayMaker’s registry, catalogue validation, workflow validation, and mapping checks into `@soma/actions`. Add risk, scopes, idempotency, and receipt interfaces without changing PlayMaker. | Package fixtures remain behaviorally equivalent to the frozen PlayMaker fixtures. |
| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. |
| M4: AI door | Generate discovery and OpenAPI from the manifest. Add device-code pairing, app grants, revocation, and C8–C9. | A stranger AI receives only the URL and completes an allowed inspection. A revoked token then fails. |
| M5: Consolidate plumbing | Expand `@soma/tickets`. Make `@soma/feedback` canonical. Add static adapters, versioned Guide assets, meter UI, and the feedback outbox. | Package tests pass. A generated React app and generated static fixture use the same contracts. |
| M6: Legends preview | Generate `legends-membership-site/soma.app.json`. Vendor static identity and action adapters. Pin the Guide. Adapt its changelog and concept state behind flags. | Existing anonymous, member, admin, Guide, and degraded-CDN journeys pass on a deploy preview. |
| M7: PlayMaker manifest PR | Add the manifest, lock file, discovery documents, status endpoint, and conformance report without changing product behavior. | PlayMaker’s existing tests and live smoke checks remain green. |
| M8: PlayMaker action PRs | Replace internal registry imports with the vendored package. Add receipts and idempotency in shadow mode. | Existing UI and Agent API produce equivalent outcomes. Shadow receipts agree before cutover. |
| M9: PlayMaker identity and plumbing PRs | Adopt identity, tickets, feedback, concept state, and changelog through separate flagged adapters. | Eric’s current workflow passes before and after each flag. Screen changes appear in preview before the weekly ship day. |
| M10: Second-app test | Run the timed build from an approved manifest without editing `soma-platform`. | Section 5 passes on a live Netlify preview. |

### 4.2 PlayMaker safeguards

PlayMaker remains Eric’s repository.

Every PlayMaker change arrives as a reviewable pull request.

Database migrations stay additive until old and new readers have completed the compatibility window.

Existing invitations remain redeemable until they expire.

Existing paired agents remain valid during a published transition window.

Existing action implementations are wrapped before they are rewritten.

No migration renames PlayMaker concepts or changes its domain model.

A screen Eric uses ships only after preview and on the agreed weekly day.

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

The timer begins when an approved `soma.app.json` is handed to one Cursor or Codex builder.

The manifest must already contain:

- The app name and allowed preview origin.
- Both hosts and the human escalation path.
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

1. An unknown visitor sees both named hosts and the human handoff.
2. The visitor signs in and receives one app membership.
3. A person already known to another SOMA app sees a neutral recognition offer.
4. The new app does not receive or display the person’s name before acceptance.
5. The accepted person is greeted by name with the source identified.
6. A previously understood SOMA concept is not re-taught.
7. A private answer from another app is not visible.
8. An explicitly shared compatible answer prevents a repeated question.
9. Ask returns an answer grounded in declared knowledge.
10. Show highlights the controls for the declared workflow.
11. Do performs a reversible action and returns an undoable receipt.
12. A consequential action stops for fresh confirmation.
13. An outside AI discovers the app from its URL without vendor-specific instructions.
14. The AI pairs without a copied secret.
15. The AI performs one permitted inspection and one permitted reversible action.
16. The same AI is denied an undeclared scope.
17. Revoking the grant blocks its next request.
18. Feedback creates a per-app record and an estate outbox event.
19. Context export produces readable Markdown and complete machine-readable JSON.
20. Disabling the Guide exposes the declared help fallback.
21. The status endpoint reports the tested release and passing journey.
22. The evidence bundle contains the live URL, release SHA, manifest hash, conformance output, screenshots, and receipts.

## 6. Product questions for Mike

1. **Which domain should own SOMA identity?**  
   Recommendation: use a neutral SOMA-controlled apex for the permanent identity. Use `id.mike-wolf.com` only as a reversible v1 host if no neutral apex is ready.

2. **May an unvisited app display a recognized person’s name before they accept?**  
   Recommendation: no. The identity origin may show the name inside the consent screen, but the destination app receives it only after acceptance.

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
| Outside AIs can use the neutral contract. | Give participants a static discovery fixture and ask them to hand only its URL to their own AI. | ChatGPT, Claude, Gemini, or Grok independently finds the pairing instructions and prepares the same valid inspection request. |

## 8. Risks and what to cut for a two-week ship

### 8.1 Principal risks

| Risk | Control |
|---|---|
| The kit becomes every SOMA idea at once. | Hold the core to identity, hosts, concept state, Ask/Show/Do, consent, AI access, feedback, receipts, and conformance. |
| One shared Supabase project becomes an estate-wide breach boundary. | Remove service-role credentials from app runtimes. Put privileged shared access behind the broker. Test cross-app and cross-person isolation. |
| Cross-app recognition feels like surveillance. | Keep PII out of the device marker. Require consent on the first visit to another app. Provide describe, export, and forget controls. |
| The broker becomes a single point of failure. | Declare local sign-in and static help fallbacks. Test broker failure in the live journey. |
| An outside AI receives excessive authority. | Require app scope, named scopes, expiry, risk ceiling, idempotency, receipts, and fresh approval for consequential acts. |
| A manifest claims enforcement that runtime code does not perform. | Generate OpenAPI from the registered runtime actions and compare it with the manifest during conformance. |
| Vendored code drifts. | Hash every vendored file and report drift through the beacon. |
| A Guide release breaks every site. | Pin immutable versions and SRI hashes. Test a real consumer before promotion. |
| Shared concept IDs suppress teaching that was actually needed. | Version concepts and require hosts to review cross-app equivalence. |
| Feedback disappears during forwarding. | Keep the app record canonical and publish through a retryable transactional outbox. |
| Legal templates create false confidence. | Require ratified operator, retention, and data-flow content before public MVP. |
| PlayMaker migration disrupts Eric’s work. | Use small PRs, feature flags, shadow writes, previews, existing tests, and weekly screen releases. |
| “Done” becomes a checklist claim. | Require the live Golden Journey and evidence bundle. |

### 8.2 Two-week release

The two-week release must include:

- `soma.app/1` JSON Schema and updated examples.
- `soma-kit.lock.json`.
- Contract-driven discovery and OpenAPI generation.
- `@soma/actions` with the four risk levels.
- Server-side idempotency and receipts.
- Core conformance checks C1–C14 and C20.
- A preview identity broker with offered recognition and pairwise app IDs.
- Concept state and private-by-default answers.
- Outside-AI device-code pairing with app-scoped grants.
- The canonical feedback widget.
- A generated React reference app.
- A generated static reference fixture.
- An immutable Guide release path.
- One Legends deploy preview.
- One manifest-only PlayMaker pull request.
- One manually witnessed outside-AI journey.
- A published evidence bundle.

The two-week release cuts:

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
- RLS and broker isolation.
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
| 11–12 | Legends preview migration | PlayMaker manifest-only PR | Security, privacy, and accessibility review |
| 13 | Integrated deploy preview | Failure injection | Evidence collection and compatibility audit |
| 14 | Timed second-app rehearsal | Fixes from rehearsal | Final live demonstration |

Claude reviews and merges bounded work.

Cursor and Codex build from self-contained beads.

The release is complete only when the reference app and Legends preview pass the same live conformance command.

_Authorship: Mike Wolf, principal and product owner; source plans by OpenAI Sol, Anthropic Claude Opus, and Google Gemini 3.1 Pro; merged by OpenAI Codex for the SOMA brain trust, 2026-10-07._