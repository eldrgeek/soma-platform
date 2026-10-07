# SOMA App Kit v1 Plan

## Decision

The kit should be a small constitutional runtime, not a catalog of every SOMA idea.

Every app should receive five guarantees on day one:

1. The person is known without being exposed.
2. The human host and AI host are named and reachable.
3. The guide can tell, show, or perform declared actions.
4. A person’s own AI can inspect and use the same actions.
5. Every consequential act produces consent, attribution, and a verifiable result.

The canonical contract should be `soma.app.yaml`.

The canonical implementation should live in `soma-platform`.

The Guide should remain a versioned CDN dependency.

All other runtime packages should be vendored by the scaffolder and recorded in `soma-kit.lock.json`.

PlayMaker and Legends should migrate through compatibility adapters rather than rewrites.

Paths cited below are relative to `~/Projects/`.

## 1. Capability list

### 1.1 Required capabilities

| Capability | What it does for the person | SOMA principle | What exists today | Target design |
|---|---|---|---|---|
| App contract and host pair | The person can see who hosts the app, what the app promises, and where a human decision goes. | Named minds and human–AI accountability. | `SOMA/SOMA-APP-STANDARD.md` §§1 and 6; `soma-app-template/src/lib/hostPair.ts`; `soma-platform/packages/soma-scaffolder/schema/soma-app.schema.json`. | Require a human host, AI host, escalation path, declared capabilities, concepts, actions, promises, and legal URLs in `soma.app.yaml`. |
| Be known | A returning person is recognized across SOMA apps without another identity form or an unexpected disclosure. | Human continuity across the society of minds. | `soma-platform/packages/soma-signin`; `soma-platform/docs/SOMA-IDENTITY.md`; `soma-platform/docs/SOMA-IDENTITY-STATES.md`; PlayMaker’s known-device flow. | Use shared SomaAuth, an identity broker, pairwise app identifiers, an opaque device marker, and an explicit “Continue as Name” handoff on the first visit to another app. |
| Learn once and resume | An app does not repeat concepts already understood and returns the person to their last useful place. | Respect accumulated context. | Guide `_recordSeen` in `soma-platform/packages/soma-guide/soma-guide.js`; `soma-app-template/supabase/migrations/0005_last_location.sql`. | Store versioned concept exposure centrally and app location locally. A concept is skipped only when the new app declares the same concept ID and compatible version. |
| Invitation and front door | A person can arrive through a personal or shared invitation and become a provisional SOMA participant in one step. | Relationships precede accounts. | `@soma/tickets`; `@soma/onboard`; `SOMA/standards/soma-invite/`; `soma-warm-invite/`; `soma-guest-gatehouse/`; PlayMaker invitations. | Replace the five variants with `@soma/invitations`. It keeps the ticket token model, the onboarding channel UI, the known-device behavior, and the guest-gate privacy rules. |
| Tell, Show, Do | The person can ask the host for an explanation, a guided demonstration, or execution of a declared action. | Alignment requires shared understanding and useful agency. | `soma-platform/packages/soma-guide`; Legends’ 22 Guide-enabled pages; `soma-platform/docs/soma-apps/AFFORDANCES.md`. | The Guide reads concepts and actions from the app manifest. Tell returns grounded content. Show runs declared walkthroughs. Do calls the same action endpoint used by the UI and outside AIs. |
| Action and consent runtime | A person can see what will happen before a consequential action and receive a receipt afterward. | Authority must be visible and revocable. | Guide `_runAction`; PlayMaker’s Agent Portal; `soma-app-template/supabase/migrations/0002_delegations.sql`. | Add `@soma/actions` and `@soma/consent`. Every action declares inputs, effects, required scopes, risk, idempotency, and an optional compensating action. |
| AI visitor door | A person’s own AI can discover the app, pair without copied secrets, inspect capabilities, and act within an explicit grant. | Humans and outside AIs are first-class participants. | PlayMaker’s `agent-v1.ts`, Agent Portal, pairing functions, and `public/llms.txt`; `SOMA/standards/SOMA-AGENT-AUTH.md`. | Publish `/.well-known/soma-app.json`, `/llms.txt`, and `/api/soma/v1/openapi.json`. Use a device-code pairing flow and short-lived agent sessions. |
| Feedback and improvement loop | A person can report a problem or request a change and later see what happened to it. | The outer RSI loop includes the people using the app. | `@soma/feedback`; PlayMaker’s `FeedbackQueue.tsx`; `soma-app-template/supabase/migrations/0004_feedback_and_build_queue.sql`. | Package the widget, hooks, receipt, per-app queue, build-request lifecycle, and an outbox to the estate board. Email must not be the durable transport. |
| Changes and review | A reviewer can propose and approve changes while a user can read a concise “What’s new” history. | Change should be legible to both stewards and participants. | Legends’ admin changelog and PlayMaker’s user changelog. | Use one `app_changes` ledger with two views. `status in ('proposed','accepted','building','shipped','rejected')` serves admins. Rows with `published_at` serve the user-facing history. |
| Honest interaction and recovery | The person always sees whether work started, succeeded, failed, or can be undone. | No silent success and no concealed failure. | `soma-app-template/src/lib/toast.tsx`; PlayMaker error and crash reporting; `SOMA/SOMA-APP-STANDARD.md` §§10–12 and 28. | Package action feedback, exclusive voice playback, retry, error capture, crash alarms, idempotency, and an undo or remediation link when one exists. |
| Credits and provenance | The person can see which human or AI created or changed an artifact. | Every mind receives credit and remains accountable. | `SOMA/standards/SIGNATURES-AND-BYLINES.md`; `SOMA/standards/SOMA-STD-credits.md`; proposed signed provenance. | Record actor, principal, model or substrate when known, app, action, artifact, and timestamp. The server signs v1 receipts. Client-held signing keys remain deferred. |
| Legal and data control | The person can read the app’s terms and privacy promise, export their data, revoke access, and request erasure. | Consent must remain inspectable and reversible. | Legal pages are largely missing; data controls appear in `SOMA/redesign/wave0/CONSENT-VISIBILITY-REVOCATION.md`. | Generate app-specific privacy, terms, data export, agent revocation, and erasure pages. A public MVP cannot pass conformance while these remain placeholders. |
| Usage and billing | The person can see the resource limit or price before incurring cost. | Costs belong to the principal who benefits. | `@soma/meter`; `soma-platform/templates/soma-affordances/billing/`; PlayMaker billing functions. | Keep metering in the kit. Enable billing only when declared. Make the current PlayMaker `UsageChip` a generic component. |

### 1.2 New capabilities not present in either input

| New capability | Why SOMA needs it | Target |
|---|---|---|
| Promise registry | Alignment is impossible when an app’s promises exist only in prose or host memory. | Every manifest declares stable promise IDs such as `identity.private-by-default` and links each promise to an executable check or a named human review. |
| Capability negotiation | Outside AIs need a machine-readable way to determine protocol versions, scopes, limits, and supported input formats before attempting work. | `GET /.well-known/soma-app.json` returns contract version, OpenAPI URL, supported auth flows, action schema versions, rate limits, and deprecation dates. |
| Proof of service | A working landing page does not prove that identity, feedback, the Guide, or AI pairing works. | `GET /api/soma/v1/status` publishes the last successful Golden Journey for each required capability without exposing user data. |
| Declared degraded mode | A SOMA app must remain honest when the Guide CDN, inference service, email provider, or identity broker is unavailable. | Each capability declares its dependency, timeout, fallback, and user-facing failure message. The health check deliberately disables dependencies and verifies those fallbacks. |
| Interaction receipts | A person or AI needs a durable result that can be audited, retried safely, or questioned later. | Every Do action returns an `ActionReceipt` containing an idempotency key, actor, principal, effect summary, status, and reversal information. |

### 1.3 Inventory disposition

| Inventory item | Decision |
|---|---|
| `soma-platform/packages/soma-signin` | Keep as the canonical sign-in client. Add static-site bindings beside the React bindings. |
| `soma-platform/packages/auth` | Deprecate after static consumers migrate to `soma-signin`. |
| `lms/js/soma-auth.js` and `legends-connect/js/soma-auth.js` | Remove after the compatibility adapter is live. |
| `soma-platform/packages/soma-tickets` | Keep its single-use token and RPC behavior behind the new `@soma/invitations` API. Preserve its current exports for one migration release. |
| `soma-platform/packages/soma-meter` | Keep as the canonical server meter. Add a generic client usage component. |
| `soma-platform/packages/soma-feedback` | Keep and add the widget source to the package. Stop maintaining copies under `SOMA/standards`, PlayMaker, and the template. |
| `soma-platform/packages/soma-guide` | Keep on the CDN. Publish immutable versioned paths with integrity hashes. |
| `soma-platform/packages/soma-assist-core` | Keep as an internal Guide dependency. Do not expose a second public chat contract. |
| `soma-platform/packages/soma-onboard` | Merge its channel handoff, QR, abuse controls, and privacy tests into `@soma/invitations`. Retire its per-app member tables. |
| `soma-platform/packages/soma-scaffolder` | Keep and make it the only supported generator and updater. |
| Legends admin changelog | Keep the approval workflow as the admin view of `app_changes`. |
| PlayMaker “What’s new” | Keep the user experience as the published view of `app_changes`. |
| Billing templates | Keep as an optional capability. Do not make Stripe a day-one dependency. |
| Live in-place editing | Keep as an optional admin capability. Require the take, drop, or revise review contract. |
| Admin roles and email allowlists | Replace with `soma_app_memberships.role`. Retain `ADMIN_EMAILS` only as a time-limited first-admin bootstrap. |
| SMTP sending | Keep as a provider adapter for scheduled or bulk mail. Invitations should default to the inviter’s own share sheet, mail client, or SMS client. |
| Agent pairing and delegation | Keep as core. Add required scopes, expiry, risk ceiling, token exchange, and revocation. |
| Deployment checks | Absorb into `@soma/conformance`. Keep `SOMA/tools/ship/soma-ship-check.py` as a compatibility wrapper until consumers migrate. |
| Feedback queue and build requests | Extract into the kit but keep each app’s queue logically isolated. |
| Error reporting and crash alarm | Extract into `@soma/errors`. Do not revive the dead `soma-errors/` service without a new owner and live checks. |
| Agent API, Agent Portal, and `llms.txt` | Merge into one action registry and AI visitor door. |
| AI host chat | Keep the conversation transport app-specific behind a shared `HostConversationAdapter`. |
| Themes | Keep as generated design tokens. |
| Reload on new deploy | Keep as a shared runtime primitive. |
| Front-door analytics | Keep as an optional event adapter with consent and data-minimization rules. |
| Share images | Keep as a build-time optional recipe. |
| Community chat and video | Keep as an optional module. Do not place Rooms or video in the v1 core. |
| Toast, exclusive voice, resume location, and tooltip | Keep in `@soma/ui`. |
| Legal pages | Add as a required MVP capability. |
| The overlapping app specifications | Replace with `soma.app.yaml` plus its JSON Schema. Keep older documents as explanatory sources, not competing contracts. |

### 1.4 Canon idea disposition

| Idea | Decision |
|---|---|
| 1. SOMA ID fast path | Core. Implement through the identity broker. |
| 2. Two-tier profile and seen state | Core. Replace unstructured app arrays with normalized concept exposures. |
| 3. Identity ladder and self-knowledge | Keep. Expose “What do you know about me?” and “Forget me.” |
| 4. Known device and invitations | Merge into identity and `@soma/invitations`. |
| 5. Consent, visibility, and revocation | Core in a pragmatic v1 form. Defer DIDs and cryptographic erasure receipts. |
| 6. Resume where left off | Core for authenticated apps. |
| 7. Introduce once | Merge into concept exposures. |
| 8. Traveling personal AI | Implement the interoperable visitor door first. Do not create a SOMA-only consigliere yet. |
| 9. Cross-app memory | Limit v1 to identity, preferences, concept exposure, and notifications. Do not create a shared free-form memory store. |
| 10. Tell, Show, Do | Core. |
| 11. Agent Portal | Core as the action registry. Freeze new PlayMaker-specific commands until the shared contract exists. |
| 12. Conversational front door | Keep as a presentation option. Do not require every app to hide conventional navigation. |
| 13. AI door | Core. |
| 14. Tours | Require one interactive tour. Make produced video conditional on the app’s audience and maturity. |
| 15. Review with Bill | Merge into the changes capability. Any named AI host may perform it. |
| 16. Host pair and kin-bond | Require the host pair. Defer kin-bond machinery. |
| 17. RSI loop | Require feedback, disposition, and proof that a shipped change closes the loop. |
| 18. Intake as change membrane | Merge into feedback and changes. Remove email as the primary durable route. |
| 19. In-place editing | Optional. |
| 20. Partner AI acting on behalf | Core with explicit scopes and expiry. |
| 21. Signed provenance | Ship server-signed receipts. Defer user-managed signing keys. |
| 22. Every mind gets credit | Core. |
| 23. Accord and “We’re aligned” | Expose an integration point. Do not embed a second Accord implementation in the kit. |
| 24. CoEvolution continuity | Drop from v1. |
| 25. Elicitation front-of-funnel | Use for apps that need discovery interviews. Do not make it a universal gate. |
| 26. Community presence | Optional. |
| 27. BYOK and KeyDrop | Defer until one app has a real user demand and a ratified custody model. |
| 28. Honest UX | Core. |
| 29. Preferences and voice consent | Core when the relevant modality or data exists. |
| 30. Action lineage | Core through action receipts and provenance. |

## 2. Architecture

### 2.1 System shape

The manifest is the source of product truth.

The scaffolder compiles the manifest into runtime configuration, static discovery files, legal pages, tests, and package adapters.

The Guide reads the compiled manifest from the app’s origin.

The app’s UI, Guide, and outside AIs call the same action registry.

The identity broker owns cross-app recognition.

The shared Supabase project stores auth and cross-app records.

Each app owns its domain data, feedback details, last location, errors, and unpublished content.

No app receives a service-role credential that can read all shared identity records.

### 2.2 Identity flow

1. The browser stores only an opaque `soma_known_device_v1` installation marker.
2. A returning app with a valid local session resumes without interruption.
3. A new app on a known device offers “Continue with your SOMA identity.”
4. The person chooses the offer.
5. The browser navigates to `id.<SOMA_APEX>/authorize`.
6. The identity origin uses its host-only session to authenticate the person.
7. The identity origin shows the destination app and the identity fields it will disclose.
8. It returns a single-use authorization code.
9. The app exchanges that code for an app-scoped session and pairwise `app_person_id`.
10. The app greets the person by name only after the exchange completes.

The identity flow should use a top-level redirect.

An iframe should not carry identity because browser storage policy is unstable and the consent moment becomes invisible.

An iframe may still host isolated Guide UI if a later product needs it.

### 2.3 Shared data model

The migrations should live under `soma-platform/supabase/migrations/`.

| Table | Required columns | Owner and RLS |
|---|---|---|
| `soma_apps` | `app_id text primary key`, `name text`, `origins text[]`, `manifest_url text`, `manifest_sha256 text`, `status text`, `human_host_name text`, `ai_host_name text`, `created_at`, `updated_at` | Platform writes. Public reads receive only active app metadata. |
| `soma_people` | `id uuid primary key`, `auth_user_id uuid unique`, `display_name text`, `locale text`, `timezone text`, `created_at`, `updated_at`, `erased_at` | A person can select and update their row. Apps receive only fields granted through the broker. |
| `soma_app_memberships` | `app_id text`, `person_id uuid`, `app_person_id uuid`, `role text`, `status text`, `first_seen_at`, `last_seen_at`, `preferences jsonb`, primary key `(app_id, person_id)`, unique `(app_id, app_person_id)` | A person reads their memberships. App admins query allowlisted fields through `soma_list_app_members(app_id)`. |
| `soma_concept_exposures` | `person_id uuid`, `concept_id text`, `concept_version text`, `state text`, `source_app_id text`, `first_seen_at`, `last_seen_at`, `evidence jsonb`, primary key `(person_id, concept_id, concept_version)` | A person reads their record. Apps record only concepts declared in their current manifest. Apps can query only the concepts they declare. |
| `soma_device_grants` | `id uuid`, `person_id uuid`, `device_marker_hash text`, `label text`, `created_at`, `last_used_at`, `expires_at`, `revoked_at` | Broker-only. No browser or app can select this table directly. |
| `soma_invitations` | `id uuid`, `app_id text`, `token_hash text unique`, `kind text`, `inviter_person_id uuid`, `invitee_name text`, `invitee_email_ciphertext text`, `welcome_line text`, `channel text`, `expires_at`, `redeemed_at`, `redeemed_person_id uuid`, `created_at` | Inviter reads their invitations. Public lookup occurs only through a security-definer RPC that hashes the supplied token and returns allowlisted fields. |
| `soma_consent_grants` | `id uuid`, `principal_id uuid`, `grantee_kind text`, `grantee_id text`, `app_id text`, `scopes text[]`, `risk_ceiling text`, `purpose text`, `granted_at`, `expires_at`, `revoked_at`, `policy_version text` | The principal reads and revokes. The grantee can introspect only the grant attached to its authenticated session. |
| `soma_agent_credentials` | `id uuid`, `principal_id uuid`, `agent_user_id uuid`, `app_id text`, `label text`, `token_hash text`, `scopes text[]`, `risk_ceiling text`, `created_at`, `expires_at`, `last_used_at`, `revoked_at` | Broker-only. Raw tokens are never stored. |
| `soma_action_receipts` | `id uuid`, `app_id text`, `action_id text`, `action_version text`, `idempotency_key text`, `actor_kind text`, `actor_id uuid`, `principal_id uuid`, `risk text`, `input_hash text`, `consent_grant_id uuid`, `status text`, `effect_summary jsonb`, `reversal jsonb`, `created_at`, `completed_at` | Principal and actor can read their rows. App admins can read redacted rows for their app. Inserts occur through the action runtime. |
| `soma_provenance` | `id uuid`, `app_id text`, `artifact_type text`, `artifact_id text`, `actor_kind text`, `actor_name text`, `model_or_substrate text`, `principal_id uuid`, `action_receipt_id uuid`, `signature text`, `created_at` | Private by default. Rows become publicly readable only when the artifact is public and the credited actor allowed publication. |
| `soma_erasure_requests` | `id uuid`, `person_id uuid`, `scope text`, `status text`, `requested_at`, `completed_at`, `receipt jsonb` | The person reads their requests. Platform workers update status. |

The broker should expose narrow RPCs rather than table-wide app access:

```sql
soma_get_app_identity(p_app_id text)
soma_record_exposure(p_app_id text, p_concept_id text, p_version text, p_state text)
soma_redeem_invitation(p_app_id text, p_token text)
soma_list_my_agent_partners(p_app_id text)
soma_revoke_grant(p_grant_id uuid)
soma_list_app_members(p_app_id text)
```

Every security-definer function must set `search_path`, validate `auth.uid()`, validate `app_id`, and return an explicit column list.

### 2.4 Per-app data

Each app retains its domain tables.

Each app also receives these kit-owned tables or equivalent namespaced views:

```text
soma_user_state(
  app_person_id uuid primary key,
  path text not null,
  label text,
  detail jsonb,
  updated_at timestamptz not null
)

feedback_items(
  id uuid primary key,
  app_id text not null,
  app_person_id uuid,
  text text not null,
  page text,
  area text,
  source text,
  status text,
  receipt_id uuid,
  created_at timestamptz
)

build_requests(
  id uuid primary key,
  app_id text not null,
  requested_by uuid,
  feedback_ids uuid[],
  status text,
  started_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz,
  notes text
)

app_changes(
  id uuid primary key,
  app_id text not null,
  title text not null,
  details text not null,
  source_type text,
  source_id uuid,
  status text,
  audience text[],
  release_version text,
  proposed_by uuid,
  approved_by uuid,
  proposed_at timestamptz,
  shipped_at timestamptz,
  published_at timestamptz
)

error_reports(
  id uuid primary key,
  app_id text not null,
  release_sha text,
  route text,
  fingerprint text,
  message text,
  context jsonb,
  app_person_id uuid,
  created_at timestamptz
)
```

RLS should use `soma_is_app_admin(app_id)` for review surfaces.

Users should read only their own feedback receipts and state.

Error reports should be service-written and admin-readable.

App domain RLS should use `soma_acts_for(owner_id, action_scope)` in addition to its existing ownership rules.

### 2.5 Action registry

The runtime API should be:

```ts
type ActionRisk =
  | "observe"
  | "reversible"
  | "consequential"
  | "irreversible";

interface SomaAction<I, O> {
  id: string;
  version: string;
  title: string;
  description: string;
  risk: ActionRisk;
  requiredScopes: string[];
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  effects: string[];
  idempotent: boolean;
  prepare?: (ctx: ActionContext, input: I) => Promise<ActionPreview>;
  execute: (ctx: ActionContext, input: I) => Promise<O>;
  compensate?: (ctx: ActionContext, receipt: ActionReceipt) => Promise<ActionReceipt>;
}

function registerAction<I, O>(action: SomaAction<I, O>): void;

function executeAction<I>(
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

Risk enforcement should be server-side:

| Risk | Human in current session | Paired AI |
|---|---|---|
| `observe` | Execute immediately. | Execute with a matching read scope. |
| `reversible` | Execute with immediate receipt and undo when available. | Execute only within an active grant. |
| `consequential` | Show an effect preview and require confirmation. | Require a current human approval token bound to the action and input hash. |
| `irreversible` | Require fresh confirmation, a cool-off step, and an explicit final label. | Never execute from a standing grant. Require a fresh human approval token. |

The public endpoints should be:

```text
GET  /api/soma/v1/actions
POST /api/soma/v1/actions/:id/prepare
POST /api/soma/v1/actions/:id/execute
POST /api/soma/v1/actions/:id/compensate
GET  /api/soma/v1/receipts/:id
```

Mutating requests must require `Idempotency-Key`.

Approval tokens must bind `principal_id`, `app_id`, `action_id`, `action_version`, `input_hash`, and an expiry shorter than ten minutes.

### 2.6 AI visitor door

The discovery document should name the app without assuming a particular AI vendor:

```json
{
  "schema_version": "soma.app/1",
  "app_id": "example",
  "name": "Example",
  "human_host": "Human Name",
  "ai_host": "AI Name",
  "openapi": "/api/soma/v1/openapi.json",
  "actions": "/api/soma/v1/actions",
  "pairing": {
    "device_authorization_endpoint": "/api/soma/v1/agents/pair",
    "token_endpoint": "/api/soma/v1/agents/token"
  },
  "auth_methods": ["anonymous", "soma-user", "soma-agent"],
  "contract_versions": ["soma.actions/1", "soma.receipts/1"],
  "status": "/api/soma/v1/status"
}
```

The pairing flow should be:

1. The AI requests a device code.
2. The AI shows the person a short code and approval URL.
3. The person signs in and sees the AI label, app, requested scopes, risk ceiling, expiry, and purpose.
4. The person approves or narrows the grant.
5. The AI polls once for a raw credential.
6. The server stores only its hash.
7. The credential exchanges for a short-lived agent session.
8. Every action records both the agent and human principal.
9. Revocation invalidates new sessions immediately.

V1 should use server-signed receipts and bearer-token exchange.

DID-based identity, holder-of-key proofs, and two-party cryptographic signatures should wait for v2.

### 2.7 Package boundaries and delivery

| Package | Delivery | Reason |
|---|---|---|
| `packages/soma-contracts` | Vendored | Apps must build against a pinned schema and shared TypeScript types. |
| `packages/soma-signin` | Vendored React and static builds | Auth UI must match each app and remain available if the CDN is down. |
| `packages/soma-identity-client` | Vendored | It contains the broker handoff and identity state machine. |
| `packages/soma-invitations` | Vendored | It includes app routes, UI, token handling, and migrations. |
| `packages/soma-actions` | Vendored client and server code | The app owns execution and must pin the exact enforcement code it deploys. |
| `packages/soma-consent` | Vendored | Consent checks belong beside action execution. |
| `packages/soma-feedback` | Vendored | The widget and hooks must not drift or disappear with a CDN outage. |
| `packages/soma-meter` | Vendored server code | Metering participates in the app’s transaction boundary. |
| `packages/soma-errors` | Vendored | Error capture must work when shared services fail. |
| `packages/soma-ui` | Vendored | Toast, tooltip, voice, resume, and receipt UI should be locally reliable. |
| `packages/soma-guide` | CDN, immutable version URL | The Guide benefits from one maintained engine and does not own domain writes. |
| `packages/soma-assist-core` | Bundled into the Guide release | It is an implementation detail of the Guide. |
| `packages/soma-scaffolder` | Build-time only | It creates and updates apps. |
| `packages/soma-conformance` | Development and CI only | It validates the contract and live behavior. |

Guide URLs should be immutable:

```text
https://soma-guide.netlify.app/v1.0.0/soma-guide.js
https://soma-guide.netlify.app/v1.0.0/soma-guide.css
```

Each manifest should pin the version and Subresource Integrity hash.

The unversioned CDN path may redirect to the current version for demos.

Production apps must not use it.

Every vendored package should be recorded in:

```json
{
  "kit_version": "1.0.0",
  "source_commit": "<soma-platform sha>",
  "packages": {
    "@soma/signin": {"version": "1.0.0", "sha256": "..."},
    "@soma/actions": {"version": "1.0.0", "sha256": "..."}
  }
}
```

The update command should be:

```bash
npx soma-kit update --to 1.0.1
```

It should refuse to overwrite locally modified vendored files.

## 3. The contract an app signs

### 3.1 Canonical manifest

The schema should move to:

```text
soma-platform/packages/soma-contracts/schema/soma-app-v1.schema.json
```

A minimal manifest should look like:

```yaml
schema_version: soma.app/1

app:
  id: veric-coaching
  name: V'Eric Coaching
  tier: prototype
  origins:
    - https://veric-coaching.netlify.app
  repository: eldrgeek/veric-coaching

hosts:
  human:
    id: eric
    name: Eric
    role: Human host
    escalation_url: /contact-eric
  ai:
    id: veric
    name: V'Eric
    role: AI host
    substrates:
      - kind: openai
        model: declared-at-runtime

identity:
  mode: shared-soma
  first_cross_app_visit: offer
  device_storage: opaque-marker
  profile_fields:
    - display_name
    - locale
  retention_policy: /privacy#retention

concepts:
  - id: soma.host-pair
    version: "1"
    title: Who hosts this app
    teaching:
      text: /knowledge/host-pair.md
      walkthrough: meet-the-hosts
  - id: coaching.session-shape
    version: "1"
    title: How a coaching session works
    teaching:
      text: /knowledge/session-shape.md
      walkthrough: first-session

walkthroughs:
  - id: meet-the-hosts
    version: "1"
    entrypoint: /
    steps:
      - target: "[data-soma=human-host]"
        narration: Eric is the human host.
      - target: "[data-soma=ai-host]"
        narration: V'Eric is the AI host.

actions:
  - id: coaching.inspect-agenda
    version: "1"
    title: Read the session agenda
    risk: observe
    scopes: [agenda:read]
    input_schema: schemas/inspect-agenda.json
    output_schema: schemas/agenda.json
  - id: coaching.save-reflection
    version: "1"
    title: Save a reflection
    risk: reversible
    scopes: [reflection:write]
    input_schema: schemas/save-reflection.json
    output_schema: schemas/reflection.json
    compensation: coaching.delete-reflection

ai_visitors:
  enabled: true
  discovery: /.well-known/soma-app.json
  openapi: /api/soma/v1/openapi.json
  default_grant_minutes: 60
  maximum_risk: reversible

invitations:
  enabled: true
  kinds: [personal, shared]
  channels: [link, qr, email-handoff, sms-handoff]

feedback:
  enabled: true
  queue: per-app
  estate_outbox: true

promises:
  - id: identity.no-name-before-consent
    text: A new app will not say your name until you choose to continue as that identity.
    check: identity/no-name-before-consent
  - id: actions.no-silent-success
    text: Every action will show a result or a failure.
    check: actions/receipt-required

legal:
  privacy: /privacy
  terms: /terms
  data_export: /settings/export
  account_erasure: /settings/delete
  agent_revocation: /settings/agents

credits:
  page: /credits
  require_artifact_byline: true

dependencies:
  identity_broker:
    required: true
    fallback: local-sign-in
  guide_cdn:
    required: false
    fallback: help-page
```

### 3.2 What the app gets

A conforming app receives:

- Shared sign-in and cross-app recognition.
- A known-device marker that stores no identity.
- Concept exposure and introduce-once behavior.
- The Guide with Tell, Show, and Do.
- A typed action registry.
- Risk gates and action receipts.
- AI pairing and discovery.
- Invitations.
- Feedback and build-request routing.
- Error reporting and dependency health.
- Standard legal and data-control routes.
- Credits and provenance.
- React and static-site adapters.
- Local and live conformance tests.

### 3.3 Conformance package

Add:

```text
soma-platform/packages/soma-conformance/
├── bin/soma-check.mjs
├── checks/
│   ├── manifest.mjs
│   ├── vendors.mjs
│   ├── rls.mjs
│   ├── identity.mjs
│   ├── actions.mjs
│   ├── ai-door.mjs
│   ├── feedback.mjs
│   ├── legal.mjs
│   ├── accessibility.mjs
│   └── degraded-mode.mjs
├── journeys/
│   ├── anonymous-visitor.spec.ts
│   ├── known-person.spec.ts
│   ├── outside-ai.spec.ts
│   └── revoked-agent.spec.ts
└── package.json
```

The local gate should be:

```bash
node soma-platform/packages/soma-conformance/bin/soma-check.mjs \
  --repo /path/to/app \
  --manifest /path/to/app/soma.app.yaml \
  --profile prototype
```

The live gate should be:

```bash
node soma-platform/packages/soma-conformance/bin/soma-check.mjs \
  --url "$DEPLOY_PREVIEW_URL" \
  --manifest /path/to/app/soma.app.yaml \
  --profile mvp \
  --journeys
```

The complete platform verification should be:

```bash
cd ~/Projects/soma-platform
npm --prefix packages/soma-signin test
npm --prefix packages/soma-tickets test
npm --prefix packages/soma-meter test
npm --prefix packages/soma-feedback test
npm --prefix packages/soma-onboard test
npm --prefix packages/soma-scaffolder test
npm --prefix packages/soma-conformance test
node packages/soma-scaffolder/tools/standup-check.mjs
supabase db lint --linked
supabase test db
```

The conformance gate must fail when:

- Either host is unnamed.
- A concept lacks an ID or version.
- An action lacks a risk level, scope, or input schema.
- A consequential action runs without approval.
- A mutating action accepts a duplicate idempotency key twice.
- An AI can exceed its grant.
- A revoked agent token still works.
- A browser marker contains a name, email, user ID, or access token.
- A private identity is greeted by name before consent.
- A required legal route is missing.
- A generated file contains unresolved placeholders.
- A vendored package differs from its recorded hash.
- An unversioned Guide URL is used in production.
- A user action finishes without visible state or a receipt.
- The Guide, identity broker, or inference service fails without the declared fallback.
- RLS permits a user to read another person’s row.
- `/.well-known/soma-app.json`, `/llms.txt`, OpenAPI, or the status endpoint disagrees with the manifest.

## 4. Contradiction resolutions

| # | Contradiction | Resolution |
|---|---|---|
| 1 | DID identity versus `soma_profiles` | Use Supabase-backed `soma_people` and pairwise `app_person_id` values in v1. Preserve a stable person UUID so a DID can be attached later without changing app-facing identifiers. |
| 2 | Silent reconnection versus recognition offer | Resume silently only on the same app with an existing valid session. On the first visit to another app, offer “Continue as Name” and require one tap. |
| 3 | Name and email in local storage versus a non-identifying marker | Store only an opaque installation marker locally. Resolve identity from a session or broker after consent. |
| 4 | Full-trust AI delegation versus least privilege | Require a closed scope list, expiry, and risk ceiling. A person may explicitly grant `*`, but the system must never treat an omitted scope as full authority. |
| 5 | Iframe storage versus a shared identity origin | Use a top-level authorization redirect through the shared identity origin. Use iframes only for isolated UI, never as the identity transport. |
| 6 | Per-app invitation members versus one SOMA identity | Redeeming an invitation creates or links a provisional SOMA person and an app membership. It must not create another member identity namespace. |
| 7 | No AI-only commands versus allowed AI inspection | Permit AI-only `observe` actions when they expose machine-useful inspection that has no honest UI equivalent. They must still be declared, authorized, logged, and documented. |
| 8 | Clerk and Vercel versus SomaAuth, Supabase, and Netlify | Standardize the kit on SomaAuth, the shared Supabase project, and Netlify. Treat Clerk and Vercel references in `full-app-capability-v1.md` as superseded. |
| 9 | Guide intake, estate board, email daemon, and per-app queues | Keep the canonical feedback record in the per-app queue. Write a transactional outbox event to the estate board. Use email only as an optional notification adapter. |
| 10 | Cross-app greeting versus the false-familiarity anti-pattern | The app may say it recognizes an available SOMA identity, but it must not use the person’s name until they accept the cross-app handoff. |
| 11 | Local-only §22 versus origin/main numbering | Merge the conversational-front-door text into the canonical standard, then assign stable clause IDs independent of Markdown section numbers. Manifests should cite IDs such as `soma.front-door.conversation/1`. |
| 12 | Taskless campus personas versus authoritative hosts | Define two roles. A `host` may perform declared actions. A `social_persona` may converse but receives no action scopes. |
| 13 | Two meanings of “AI portal” | Reserve “Agent Portal” for the action registry and AI API. Rename the SRMW concept to “AI Resource Portal.” |
| 14 | Four packaged utilities versus a much larger kit | Treat sign-in, tickets, meter, and feedback as the completed plumbing seed. The v1 constitutional core adds identity, hosts, action and consent, AI access, receipts, and conformance. CoEvolution, Rooms, community video, and new Accord UI remain outside the core. |

## 5. Migration

### 5.1 Order of work

#### Phase 0: Freeze evidence and compatibility

1. Record the current public APIs of `@soma/signin`, `@soma/tickets`, `@soma/meter`, and `@soma/feedback`.
2. Capture PlayMaker’s 28 Agent Portal commands as a golden fixture.
3. Capture Legends’ 22 Guide configurations as a golden fixture.
4. Add browser journeys for the existing PlayMaker invitation and Legends Guide flows.
5. Require every later migration PR to pass the old journey and the new contract check.

#### Phase 1: Contract and conformance

1. Create `packages/soma-contracts`.
2. Promote the existing scaffolder schema into `soma.app/1`.
3. Add `soma-kit.lock.json`.
4. Add `packages/soma-conformance`.
5. Generate a disposable reference app.
6. Prove that the reference app builds, deploys to preview, and passes local and live checks.

This phase changes no production app.

#### Phase 2: Shared identity foundation

1. Add the shared tables and RPCs as additive migrations.
2. Deploy the identity broker behind a feature flag.
3. Backfill `soma_people` from `soma_profiles`.
4. Backfill app memberships from current PlayMaker and Legends records.
5. Dual-write old and new profile fields.
6. Add a read-only compatibility view for consumers expecting `soma_profiles`.
7. Prove cross-app handoff using two disposable origins.
8. Enable the broker for staff accounts before partner accounts.

No existing auth route should be removed during this phase.

#### Phase 3: Consolidate packages

1. Build `@soma/invitations` around the existing ticket RPC contract.
2. Move the feedback widget into `@soma/feedback`.
3. Build `@soma/actions`, `@soma/consent`, `@soma/errors`, and `@soma/ui`.
4. Add static-site bundles for packages needed by Legends.
5. Version the Guide CDN.
6. Add a generated compatibility report that identifies every remaining copied implementation.

#### Phase 4: Migrate Legends first

Legends should migrate first because it exercises static HTML, the shared Guide, and cross-app familiarity without touching Eric’s active writing workflow.

1. Generate `legends/soma.app.yaml` from the existing Guide configuration.
2. Keep all existing page URLs and content.
3. Replace copied auth with the static `soma-signin` adapter.
4. Point the Guide at an immutable version.
5. Replace `_recordSeen` storage with concept exposure calls.
6. Add the identity offer behind a staff-only flag.
7. Replace the admin changelog storage with the `app_changes` adapter.
8. Run anonymous, member, admin, Guide, and degraded-CDN journeys.
9. Enable production only after the old and new journeys both pass.

#### Phase 5: Migrate PlayMaker through small pull requests

PlayMaker must remain Eric’s repository and accept changes only through reviewable pull requests.

PR 1 should add only `soma.app.yaml`, discovery files, and conformance reporting.

PR 2 should wrap the existing 28 commands with `registerAction()` without changing their implementations or UI call sites.

PR 3 should add action receipts and idempotency to the existing agent endpoint.

PR 4 should adopt `@soma/signin` behind the existing sign-in components.

PR 5 should adopt `@soma/invitations` through an adapter that preserves current URLs and RPC behavior.

PR 6 should dual-write identity and concept exposure while continuing to read the current profile.

PR 7 should replace the feedback widget copy and retain PlayMaker’s queue UI.

PR 8 should move its changelog onto `app_changes` while preserving the existing “What’s new” UI.

Each PR should have one feature flag and one rollback commit.

No PR should rename PlayMaker concepts, change Eric’s domain model, or rewrite working action implementations.

### 5.2 Migration safeguards

- All shared database changes must be additive until both apps read the new schema.
- Existing invitation URLs must remain redeemable until their natural expiry.
- Existing paired agents must continue to authenticate during a published migration window.
- Old and new action paths must emit equivalent receipts in shadow mode before cutover.
- No generated migration may delete a table or column.
- Every production switch must be exercised on a Netlify deploy preview.
- The Guide CDN must be tested against a real Legends page before promotion.
- PlayMaker migration is complete only after Eric’s existing workflow and the outside-AI journey both pass.

## 6. Second-app test

The first true test should use a new repository rather than another migration.

The timer starts when an approved `soma.app.yaml` contains:

- The app name and origins.
- Both hosts.
- Three concepts.
- One walkthrough.
- Three actions covering `observe`, `reversible`, and `consequential`.
- One promise.
- Privacy and terms owners.

The target is:

- A local app that builds in under 10 minutes.
- A live Netlify deploy preview in under 30 minutes.
- No hand-written framework or kit code.
- No copied secret in a file or prompt.
- No more than two hours of builder elapsed time from approved manifest to demonstrated preview.
- No computer task for Mike.
- No more than one human ratification for a product promise.
- A green conformance report attached to the build result.

The Golden Journey must demonstrate:

1. An unknown visitor sees both hosts and completes the interactive tour.
2. The visitor signs in and acquires one app membership.
3. A known SOMA person visits from another app and receives the recognition offer.
4. The app does not say the person’s name before acceptance.
5. A concept already understood elsewhere is not re-taught.
6. Ask returns a grounded answer.
7. Show highlights the correct live control.
8. Do performs a reversible action and returns a receipt.
9. A consequential action stops for confirmation.
10. An outside AI discovers the app without model-specific instructions.
11. The AI pairs without a copied secret.
12. The AI performs an allowed inspection.
13. The AI performs one reversible action on behalf of the person.
14. A revoked grant fails on the next request.
15. Feedback creates a per-app record and an estate outbox event.
16. The Guide-CDN failure exposes the declared help-page fallback.
17. The status endpoint reports the journey’s timestamp, release SHA, and result.
18. Legal, credits, export, erasure, and agent-revocation routes exist.

The test fails if a builder edits generated kit internals to make the journey pass.

## 7. Product questions for Mike

1. **Which apex domain should carry SOMA identity?**  
   Recommendation: use a neutral SOMA-controlled apex and dedicate `id.<apex>` to identity. Do not bind cross-app identity to PlayMaker, Legends, Netlify, or the VPS hostname.

2. **What standing authority may a person grant to their own AI?**  
   Recommendation: default to named read scopes and reversible writes for 60 minutes. Require a fresh human approval for consequential or irreversible actions.

3. **What retention promise should every SOMA app make?**  
   Recommendation: keep raw host conversations for 30 days, feedback until disposition plus 90 days, and action receipts for one year. Let the person delete content sooner unless legal or payment records require retention.

4. **May a new app display a recognized person’s name before they accept the handoff?**  
   Recommendation: no. Show a neutral recognition offer first, then greet by name after acceptance.

5. **Which product should be the timed second-app test?**  
   Recommendation: use V’Eric coaching. It exercises identity, a host pair, concepts, outside-AI participation, and actions without waiting for OLLI’s institutional decisions.

## 8. Assumptions to test with a person

| Assumption | Cheap test without code | Pass condition |
|---|---|---|
| A cross-app recognition offer feels helpful rather than intrusive. | Show five people paper versions with and without the person’s name. | At least four prefer the no-name-before-tap version and can explain what will happen. |
| People understand Tell, Show, and Do as different levels of help. | Give five people three request cards and ask what response they expect. | At least four correctly distinguish explanation, demonstration, and execution. |
| The four action risk labels match ordinary judgment. | Run a card sort with ten actions, including reading, saving, publishing, paying, and deleting. | At least 80% of placements match the proposed policy. |
| A person can evaluate an AI delegation grant. | Show the proposed grant screen and ask the person what the AI can do, for how long, and how to stop it. | The person answers all three without coaching. |
| One concept ID can be reused across apps without suppressing necessary teaching. | Show hosts a list of shared concepts and ask which versions are equivalent. | Hosts agree on equivalence or request distinct version IDs. |
| Personal and shared invitations need different copy and disclosure. | Test one personal invitation and one shared link as text-message mockups. | Recipients understand who invited them and whether the link is intended specifically for them. |
| Action receipts are useful rather than technical clutter. | Show a compact receipt after a reversible action and ask what happened and how to undo it. | The person can answer both questions in one glance. |
| Outside AIs can consume the neutral discovery contract. | Give the manifest and OpenAPI file to ChatGPT, Claude, Gemini, and Grok in separate sessions. | Each identifies the pairing flow and prepares the same valid inspection request without a vendor-specific prompt. |
| The host pair creates confidence rather than role confusion. | Ask five people who handles product judgment, app help, and escalation after viewing the host card. | At least four assign the three responsibilities correctly. |

## 9. Risks and the two-week cut

### 9.1 Principal risks

| Risk | Control |
|---|---|
| The kit becomes every SOMA idea at once. | Hold v1 to identity, hosts, Guide, actions, consent, AI access, feedback, receipts, and conformance. |
| The shared identity project becomes a portfolio-wide breach boundary. | Keep service-role credentials inside the broker. Use narrow RPCs, pairwise IDs, RLS tests, audit logs, and short-lived sessions. |
| Cross-app recognition feels like surveillance. | Store no PII in the device marker. Require an explicit first-app handoff. Expose “What do you know?” and “Forget me.” |
| An outside AI obtains excessive authority. | Deny by default. Require scopes, expiry, risk ceiling, idempotency, receipts, and fresh approval for consequential actions. |
| Vendored packages drift. | Record hashes and source commit in `soma-kit.lock.json`. Make conformance fail on unexplained changes. |
| A Guide CDN release breaks every app. | Publish immutable versions, pin integrity hashes, test a real consumer, and provide a non-Guide fallback. |
| The manifest claims actions that the server does not enforce. | Generate OpenAPI from the runtime registry and compare it with the manifest during startup and conformance. |
| Identity migration breaks PlayMaker. | Use additive migrations, compatibility views, dual writes, shadow reads, small PRs, and per-feature rollback. |
| Feedback disappears between the app and estate board. | Keep the app queue canonical and publish through a retryable transactional outbox. |
| “Done” becomes a checklist judgment rather than a demonstration. | Require live Golden Journeys and publish the last passing evidence through the status endpoint. |

### 9.2 Two-week implementation scope

The two-week release must include:

- `soma.app/1` schema.
- `soma-kit.lock.json`.
- The scaffolder update.
- Local and live conformance.
- Named host pair.
- Versioned Guide loading.
- Shared sign-in.
- Opaque known-device marker.
- Cross-app recognition offer.
- Concept exposure.
- One interactive tour.
- Action registry with all four risk levels.
- Consent grants and receipts.
- AI discovery and device-code pairing.
- Unified feedback widget and per-app queue.
- Error capture and dependency fallbacks.
- Credits, privacy, terms, export, erasure, and revocation routes.
- One generated reference app.
- One Legends preview migration.
- PlayMaker’s manifest-only PR.

The two-week release should cut:

- DIDs.
- Client-held signing keys.
- Cryptographic erasure receipts.
- Free-form cross-app memory.
- A SOMA-owned traveling consigliere.
- CoEvolution diaries.
- Accord UI.
- Rooms, Atlas, community chat, and video.
- Voice conversation.
- Billing and BYOK.
- Live in-place editing.
- Produced tour films.
- Automated provisioning of new Stripe, OAuth, or domain accounts.
- Full PlayMaker code migration.

### 9.3 Two-week build sequence

| Days | Builder A | Builder B | Builder C |
|---|---|---|---|
| 1–2 | Contract and manifest compiler | Identity schema and broker fixture | Action, consent, and receipt contract |
| 3–5 | Conformance CLI and reference app | Recognition flow and concept exposure | AI discovery and pairing |
| 6–7 | Scaffolder integration | Unified invitations | Feedback, errors, and outbox |
| 8–9 | Static-site bindings | RLS and revocation tests | Degraded-mode and status checks |
| 10–11 | Legends preview migration | Cross-app Golden Journey | Outside-AI Golden Journey |
| 12 | PlayMaker manifest PR | Security review | Accessibility and legal checks |
| 13 | Integrated deploy preview | Failure injection | Compatibility audit |
| 14 | Final demonstration and evidence bundle | Final demonstration and evidence bundle | Final demonstration and evidence bundle |

Claude should review and merge each bounded change.

Cursor and Codex should build only from self-contained tasks derived from this plan.

The release is complete only when the reference app and Legends preview pass the same live conformance command.

_Authorship: Mike Wolf, principal and product owner; Codex, independent SOMA brain-trust planner; 2026-10-07._