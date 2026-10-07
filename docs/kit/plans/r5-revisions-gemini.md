# Revisions, round 5, Gemini 3.1 Pro

### R1: Eliminate redundant outbox architecture for shared-database writes
- **Why:** The per-app schemas (`app_<app_id>`) and the shared `soma` schema reside in the exact same Supabase PostgreSQL database. Building a distributed outbox with Netlify scheduled functions to move data between schemas in the same database is unnecessary complexity; the broker can easily insert both records in a single synchronous transaction.
- **Change:**
```diff
@@ -107,4 +107,3 @@
 | `soma.conformance_runs` | `run_id`, `app_id`, `release_sha`, `contract_sha256`, `tier`, `result`, `failed_checks`, `evidence_url`, `runner_actor_id`, `ran_at` | Written by the conformance runner through the broker with the steward's conformance credential. Read by `/api/soma/v1/status`. |
-| `soma.estate_inbox` | `event_id`, `app_id`, `app_record_id`, `kind`, `consent_safe_summary`, `created_at`, `received_at`, `claimed_at` | Written only by the broker. It contains no attachments, transcripts, raw diagnostics, contact fields, or full report body. The Mac-side board importer reads and claims rows, so apps never depend on the Mac being up. |
+| `soma.estate_inbox` | `event_id`, `app_id`, `app_record_id`, `kind`, `consent_safe_summary`, `created_at`, `claimed_at` | Written synchronously by the broker in the same transaction as the app's local record. It contains no attachments, transcripts, raw diagnostics, contact fields, or full report body. The Mac-side board importer reads and claims rows, so apps never depend on the Mac being up. |
 | `soma.estate_dispositions` | `event_id`, `app_id`, `app_record_id`, `status`, `public_note`, `demonstration_url`, `updated_at` | Written by the authorized estate processor and read by the originating app through the broker. |
@@ -188,4 +188,2 @@
 | `build_requests` | The report-to-build lifecycle and demonstration links. |
-| `feedback_outbox` | Retryable minimal event delivery to `soma.estate_inbox` through the broker. Submission attempts an immediate drain after committing the app record; a Netlify scheduled function that runs every five minutes is recovery, not the only delivery path. Events use stable IDs and broker-side uniqueness. Undelivered events retry with jittered exponential backoff. An event undelivered after 24 hours is marked dead-lettered, and the status endpoint reports the count. |
-| `feedback_status_inbox` | Idempotently applies estate disposition and demonstration updates to the canonical app record so the person can see what happened. |
+| `feedback_status_inbox` | Applies estate disposition and demonstration updates to the canonical app record so the person can see what happened. |
 | `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `input_hash`, `actor_id`, `principal` (`app_person_id`), `grant_id`, `declared_risk`, `effective_risk`, `status`, `preview`, `resource_version`, `effect_summary`, `output`, `undo_of`, `expires_at`, `created_at`, `completed_at`. The canonical intent, approval, receipt, and idempotency record. |
-| `receipt_outbox` | Retryable delivery of receipt index rows to `soma.receipt_index`. |
 | `last_location` | The person's resume point in this app (from `soma-app-template/supabase/migrations/0005_last_location.sql`). |
@@ -750,3 +750,3 @@
 | Shared concept IDs suppress teaching that was actually needed. | Version concepts and require hosts to review cross-app equivalence. |
-| Feedback disappears during forwarding. | Keep the app record canonical and publish through a retryable transactional outbox to `soma.estate_inbox`; report dead letters through status. |
+| Feedback disappears during forwarding. | Keep the app record canonical and ensure the broker writes to the app table and `soma.estate_inbox` in a single transaction. |
 | Legal templates create false confidence. | Require ratified operator, retention, and data-flow content before public MVP. |
```

### R2: Fix the transaction contradiction for action execution
- **Why:** The plan asserts that for database effects, the receipt claim, execution, and settlement share a single database transaction. However, the execution layer is defined as a TypeScript function (`SomaAction.execute`) running in the app's Netlify Function, which communicates with the broker over stateless HTTP; a PostgreSQL transaction cannot be safely held open across this HTTP boundary.
- **Change:**
```diff
@@ -211,7 +211,7 @@
 Preparation validates and canonicalizes the input, computes its hash, records the current resource version, calculates the effective risk and effects, and inserts the idempotency row. Preparation is side-effect free.
 
-Execution claims a prepared or approved row by moving it to `running`, runs the effect, then settles the row with its `output`. When the effect is a database change, the claim, effect, and settlement share one transaction. This is the pattern PlayMaker already runs in `agent_command_requests`; M8 generalizes it rather than adding a second one.
+Execution claims a prepared or approved row by moving it to `running` via a broker call, runs the effect within the app's TypeScript execution context, then settles the row with its `output` in a final broker call. Because the app executes actions in stateless Netlify Functions, the claim, effect, and settlement occur in separate steps rather than a single database transaction. Mid-execution failures are handled securely by the idempotency key and timeout reconciliation.
 
 - A repeated key with the same `input_hash` returns the current receipt state and stored output, if any, without creating another intent or repeating the effect.
```

### R3: Decouple contract updates from manual steward registration
- **Why:** The plan requires the platform steward to manually run `soma-scaffold register` with a Supabase Management token to update the app's `contract_sha256`. If the broker strictly enforces this hash for RPC authorization, ordinary CI pull requests that update the manifest will break the live app upon auto-deployment until the steward intervenes.
- **Change:**
```diff
@@ -148,8 +148,15 @@
 `soma-scaffold register <soma-app.json>` registers an app. The platform steward seat runs it, because it needs the Supabase Management API token. The builder never holds that token.
 
 Registration is idempotent and does five things:
 
-1. Inserts or updates `soma.apps`, `soma.app_hosts`, and the registered origins. Registration performs no third-party provisioning by default. An optional voice recipe may create an ElevenLabs agent only when `guide.voice.enabled` and `guide.voice.provision` are explicitly declared.
+1. Inserts the app into `soma.apps` with its initial `contract_sha256`, `soma.app_hosts`, and registered origins. Registration performs no third-party provisioning by default. An optional voice recipe may create an ElevenLabs agent only when `guide.voice.enabled` and `guide.voice.provision` are explicitly declared.
 2. Creates private schemas `app_<app_id>` and `app_<app_id>_api`, with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`). Neither schema is added to PostgREST's exposed schemas, and neither grants access to `anon` or `authenticated`.
-3. Applies an approved migration bundle with `soma-scaffold migrate`. The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as a no-login owner constrained to that app's two schemas. It cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. History lives in `app_<app_id>.schema_migrations`; a changed checksum or partially applied migration fails loudly. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's `0001`–`0087` and a second repository's `0001_…` would collide.
+3. Applies the initial database migrations with `soma-scaffold migrate`. The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as a no-login owner constrained to that app's two schemas.
 4. Mints the installation credential and sets it in the app's Netlify environment with the command's output redirected, so the secret is never printed.
-5. Registers exactly two redirect origins at prototype tier: the production origin and one fixed branch-deploy alias, `https://preview--<site>.netlify.app`. The alias is registered only with the staging broker, because deploy previews never reach production (section 3.3). Per-deploy URLs are not registrable, and no wildcard is ever accepted.
+5. Registers exactly two redirect origins at prototype tier: the production origin and one fixed branch-deploy alias.
+
+During CI deployment, the app must automatically update the broker's registry:
+`soma-scaffold sync-contract <soma-app.json>`
+This automated call uses the app's existing installation credential to update `contract_sha256` and `soma.app_hosts` in `soma.apps`. This ensures auto-deployed PRs pass the broker's contract hash check without requiring the steward's management token. Database migrations remain a separate step run by the steward.
```

### R4: Remove user-only UI routes from the AI Visitor Discovery
- **Why:** Section 2.7 lists `POST /api/soma/v1/approvals/:id/decision` alongside AI-facing routes in the visitor door discovery. Since only the signed-in principal can confirm an approval, advertising this endpoint to the AI as a callable tool invites confused agents to attempt to self-approve their own consequential requests.
- **Change:**
```diff
@@ -293,7 +293,6 @@
 POST /api/soma/v1/actions/:id/prepare
 POST /api/soma/v1/actions/:id/execute
 GET /api/soma/v1/approvals/:id
-POST /api/soma/v1/approvals/:id/decision
 GET /api/soma/v1/receipts/:id
 GET /api/soma/v1/status
 ```
 
 Every conforming app also publishes person-facing routes. Each one is an app function that authenticates the person or agent and calls a narrow broker function, so browser code never touches the `soma` schema.
 
 ```text
 GET    /api/soma/v1/me                         membership, role, consented fields, and where the app learned the name
+POST   /api/soma/v1/approvals/:id/decision     record the person's confirmation or refusal
 GET    /api/soma/v1/me/concepts?ids=…          state of declared concepts
```

### R5: Make privacy data flows an executable gate rather than prose
- **Why:** SOMA promises alignment and visible data flow, and Mike's rules require gates to be executable checks. Allowing an app to declare retention as an arbitrary string like "Declared by the operator" defeats programmatic verification; the contract must use fixed enums so the platform can definitively audit or render a standardized privacy dashboard.
- **Change:**
```diff
@@ -481,7 +481,7 @@
       "vendor": "Anthropic",
       "what": "Questions typed to the Guide's Ask",
       "why": "Answer from the app's declared knowledge",
-      "retention": "Declared by the operator"
+      "retention": "zero-retention"
     },
     {
       "vendor": "Anthropic",
       "what": "Messages sent to V'Eric",
       "why": "Generate the AI host's reply",
-      "retention": "Declared by the operator"
+      "retention": "30-days"
     }
@@ -583,3 +583,3 @@
 | C17 | Declared dependency failures expose the declared fallback. |
-| C18 | Required routes exist. Public MVP also requires ratified content. |
+| C18 | Required routes exist. Public MVP requires ratified content that exactly matches the fixed `retention` enums in the manifest. |
 | C19 | Credits name human and AI contributors and record model or substrate when known. |
```

### R6: Ensure critical errors reach the steward without a shared service
- **Why:** The plan extracts error reporting into isolated, per-app `error_reports` tables but explicitly abandons the shared error service. The platform steward will be completely blind to critical function or browser crashes unless they manually query every single app's private schema.
- **Change:**
```diff
@@ -194,3 +194,3 @@
 | `app_changes` | Proposed, accepted, building, shipped, and rejected changes. |
-| `error_reports` | Fingerprinted client and function failures. |
+| `error_reports` | Fingerprinted client and function failures. Critical unhandled crashes automatically forward a consent-safe summary to `soma.estate_inbox` so the steward is alerted. |
 | `front_door_events` | Consent-aware arrival and conversion events. |
```
