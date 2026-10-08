# Revisions, round 7, OpenAI GPT-5 Codex

### R1: Make row isolation real
- **Why:** `ENABLE ROW LEVEL SECURITY` does not constrain a table owner, yet the plan makes app-owner `SECURITY DEFINER` functions the runtime path. A buggy function could therefore read or change every person’s rows inside its app despite the claimed RLS boundary.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -226,7 +226,13 @@ Broker Functions reach Postgres with the `pg` driver through the Supavisor poole
 
-They log in as `soma_broker`, a role with no `BYPASSRLS`. That role holds `EXECUTE` on registered `app_*_api` functions and the `soma` grants it needs, and nothing in `public` except the named legacy RPCs it wraps. Every broker transaction sets `statement_timeout` to 5 seconds.
+They log in as `soma_broker`, a role with no `BYPASSRLS`. It has no direct privileges on app tables. It may execute only the platform-owned invocation wrapper, which selects a registered `app_*_api` function and installs the authenticated app, person, actor, and grant in transaction-local request context.
+
+Each app has two no-login roles. `app_<app_id>_owner` owns its tables and is used only by the migration runner. `app_<app_id>_runtime` owns its API functions, owns no tables, has no DDL privilege or `BYPASSRLS`, and receives only the table privileges each function requires. Runtime functions therefore remain subject to forced RLS.
+
+RLS policies obtain identity through platform-owned, read-only context accessors. Neither app role may write the backing request context or impersonate another app or person by setting a custom PostgreSQL variable.
+
+Every broker transaction sets `statement_timeout` to 5 seconds.
@@ -275,8 +281,8 @@ Registration is idempotent and does five things:
 
-2. Creates private schemas `app_<app_id>` and `app_<app_id>_api`, with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`). The platform, not the app's migration owner, owns both schemas. Neither schema is added to PostgREST's exposed schemas, and neither grants access to `anon` or `authenticated`. Registration also runs `ALTER DEFAULT PRIVILEGES FOR ROLE <app owner> REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.
-3. Applies an approved migration bundle with `soma-scaffold migrate`. The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as a no-login owner constrained to that app's two schemas. It cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. History lives in `app_<app_id>.schema_migrations`; a changed checksum or partially applied migration fails loudly. Inside the same transaction, after each migration, the runner queries the catalog. It rolls the migration back if either schema now holds any of four things: a privilege granted to `PUBLIC`, `anon`, or `authenticated`; a function without a fixed `search_path`; a `SECURITY DEFINER` function owned by a role other than the app owner; or a table without RLS. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's `0001`–`0087` and a second repository's `0001_…` would collide.
+2. Creates private schemas `app_<app_id>` and `app_<app_id>_api`, with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`), plus the no-login owner and runtime roles described in section 2.3b. The platform owns both schemas. The migration runner may assume the owner role; deployed code may not. Neither schema is exposed through PostgREST or grants access to `PUBLIC`, `anon`, or `authenticated`.
+3. Applies an approved migration bundle with `soma-scaffold migrate`. The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally. Tables are owned by the owner role; API functions are transferred to the runtime role. History lives in `app_<app_id>.schema_migrations`; a changed checksum or partially applied migration fails loudly. Before commit, catalog checks reject: grants to `PUBLIC`, `anon`, or `authenticated`; a table without both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; a runtime role that owns a table or has DDL privilege; an API function not owned by the runtime role or lacking a fixed `search_path`; a view without `security_invoker = true`; materialized or foreign objects; or objects outside the two app schemas. Nobody runs `supabase db push` against the shared project, because its migration history already belongs to existing consumers.
@@ -321,9 +327,11 @@ A legacy-global app that commits its feedback record outside the broker (PlayMak
 
-Every table has RLS enabled.
+Every person-owned table has RLS enabled and forced. Table-owner roles are never used at runtime.
 
-Every `SECURITY DEFINER` function sets `search_path`, validates the caller, binds the app from authenticated context, and returns explicit columns.
+Every `SECURITY DEFINER` function is owned by the app's non-owner runtime role, sets `search_path` to `pg_catalog` plus its exact app schema, uses the platform request-context accessors, and returns explicit columns.
 
-A conformance test must prove that one person cannot read another person’s rows.
+A conformance test must prove that the broker, runtime role, and every registered RPC cannot read or change another person's or app's rows. It must also prove that table ownership is absent from the runtime path.
@@ -982,7 +990,7 @@ The gate must check:
-| C12a | Every `SECURITY DEFINER` function the app can call derives its app from authenticated context. A probe passing another app's ID as an argument fails. |
+| C12a | Every callable `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role; every person-owned table forces RLS; request context comes only from the platform wrapper. Probes that pass another app or person identifier, alter custom settings, or invoke the function as the runtime role outside the wrapper fail. |
```

### R2: Require approval for trust-contract changes
- **Why:** The build credential can currently register lower action risks, broader remote authority, new data flows, changed hosts, or weakened promises automatically. Those are policy changes, not ordinary release metadata, and a passing build must not ratify them.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -179,7 +179,7 @@ Each deployed app receives two overlapping, independently revocable installation
 
-The browser calls same-origin app Functions. A Function makes one broker call per operation, `POST /broker/v1/invoke`. The call carries the installation credential, the person's session handle or the agent's access token, the registered RPC name, and its arguments. The broker validates the principal, authorizes it, and runs the RPC inside one database transaction.
+The browser calls same-origin app Functions. A Function makes one broker call per database operation, `POST /broker/v1/invoke`. The call carries the installation credential, the contract hash compiled into that server release, the person's session handle or the agent's access token, the registered RPC name, and its arguments. Browser input cannot select the contract hash. The broker validates the installation, contract, principal, and policy before running the RPC.
@@ -250,8 +250,8 @@ Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tab
-| `soma.apps` | `app_id`, `name`, `origins`, `contract_sha256`, `identity_subject`, `kit_version`, `status` | Platform-managed, except that `sync-contract` may set `contract_sha256` within the limits in section 2.4a. Public reads expose only active metadata. |
-| `soma.app_contracts` | `app_id`, `contract_sha256`, `release_sha`, `deploy_context`, `synced_at`, `retired_at` | Written by `sync-contract` through the broker. Read by the broker on every call; a lookup may be cached for at most 60 seconds. One row per hash the app has synced. |
+| `soma.apps` | `app_id`, `name`, `origins`, `identity_subject`, `kit_version`, `active_policy_version`, `status` | Platform-managed. Public reads expose only active metadata. No concurrent build may redefine a single “current contract.” |
+| `soma.app_contracts` | `app_id`, `contract_sha256`, `release_sha`, `deploy_context`, `policy_version`, `synced_at`, `retired_at`, `retirement_reason` | One row per accepted release contract. The broker accepts it only while its bound policy version remains active. |
@@ -287,11 +287,18 @@ An ordinary pull request that edits the manifest or a file it references changes
 
 - It authenticates with the app's release credential. The runtime installation credential cannot call it.
 - It submits the manifest, the referenced files' hashes, and the checksums of the app's migration files. The broker recomputes the contract hash itself.
-- The broker refuses the contract, and the build fails loudly, when the change alters registered origins or `identity.subject`, declares an unregistered `soma:*` concept or question definition, requests third-party provisioning, or carries a migration checksum not yet recorded in `app_<app_id>.schema_migrations`. Those changes wait for the steward's `register` and `migrate`.
-- Otherwise the broker records the new hash in `soma.app_contracts` with its commit SHA and deploy context, sets `soma.apps.contract_sha256` to it, and updates `soma.app_hosts`.
-- The broker accepts every hash in `soma.app_contracts` that belongs to that app and has not been retired. Keeping only the current and previous hash would fail in two ways. First, a Netlify rollback republishes an old build without rebuilding it, so the old hash must keep working. Second, builds for two commits can finish in either order.
-- A hash is retired only in two cases: the steward retires it, or a later approved migration removes an RPC that the hash's actions call. Retiring a hash is the documented way to stop an old release from calling the broker.
+- `sync-contract` is a release-registration operation, not a policy-approval operation. It may accept a new hash automatically only when the manifest's privileged projection is identical to an already approved policy version.
+- The privileged projection contains origins; identity mode and subject; host identities and escalation promises; concepts and portable questions; action IDs, versions, kinds, risks, scopes, permissions, surfaces, effects, and UI exceptions; AI-grant limits; promises; data flows and retention; legal operator; dependency fallbacks; and provisioning requests.
+- A privileged-projection change fails the build with a machine-readable diff. The steward must run `soma-scaffold register --approve-contract-diff <hash>` after reviewing it. Lowering risk, broadening remote access, adding a provider, making an answer portable, or changing a host can therefore never ride through on a build credential.
+- `sync-contract` never updates `soma.apps`, `soma.app_hosts`, origins, migrations, or the active policy version. It records only the release hash, release SHA, deploy context, and the already-approved policy version.
+- The broker accepts every non-retired contract bound to an active policy version. This preserves deterministic rollback without allowing an old release to revive policy the steward has withdrawn.
+- A contract is retired when the steward retires it, its policy version is withdrawn, a security fix declares it unsafe, or an approved migration removes an RPC it needs.
 - `sync-contract` contacts a broker only in the `production` and `branch-deploy` contexts. In the `deploy-preview` context it exits successfully without contacting any broker. That build continues as a static preview with sign-in disabled.
@@ -740,7 +747,7 @@ The contract hash, `contract_sha256`, is the SHA-256 of the RFC 8785 (JSON Canoni
 
-`soma.apps.contract_sha256`, the status endpoint, the lock file checks, and the evidence bundle all use this contract hash.
+`soma.app_contracts.contract_sha256`, the running release's status endpoint, the lock file checks, and the evidence bundle all use this contract hash. The status endpoint reports the hash compiled into the running release, not whichever concurrent build synced most recently.
@@ -981,7 +988,7 @@ The gate must check:
-| C12 | A browser or agent token cannot access the Supabase Data API directly. A stolen app installation credential cannot invoke another app's RPC, a non-registered RPC, the `soma` schema directly, `sync-contract`, or any legacy `public` table or function. A release credential cannot advance a contract that changes origins or `identity.subject`, declares an unregistered `soma:*` entry, or carries an unapplied migration. Cross-person and cross-app broker probes fail. |
+| C12 | A browser or agent token cannot access the Supabase Data API directly. A stolen installation credential cannot invoke another app's RPC, select another contract hash, call an unregistered RPC, reach the `soma` schema directly, invoke `sync-contract`, or call a legacy `public` object. A release credential cannot change the privileged contract projection or bind a release to an unapproved policy version. Cross-person and cross-app broker probes fail. |
```

### R3: Specify replay-safe session and pairing state
- **Why:** The flows promise single-use codes, rotating refresh credentials, reuse detection, revocation, and browser sessions, but the data model has nowhere to enforce them. The separate `soma-id-admin` site also introduces a publicly deployed high-value secret without a defined private invocation mechanism.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -150,10 +150,10 @@ The authorization code must be short-lived and single-use.
 6. The identity origin authenticates the person.
 7. The identity origin shows the person’s name, the destination app, and the fields that will be disclosed. When the app declares `soma:` concepts, the list includes “SOMA basics you have already seen.”
-8. Acceptance creates or updates membership and consent.
-9. The origin returns a single-use authorization code.
-10. The app's Netlify Function, not the browser, exchanges the code. It presents the PKCE verifier and the app's installation credential.
-11. The function sets broker-issued session and refresh handles in `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Lax` cookies. It does not expose a Supabase Data API JWT to browser JavaScript. The browser obtains the pairwise identity and consented fields through the same-origin `/api/soma/v1/me` route.
+8. Acceptance creates a pending authorization bound to the exact disclosure preview; it does not yet create a durable membership.
+9. The origin returns a hashed-at-rest, single-use authorization code.
+10. The app's Netlify Function, not the browser, exchanges the code. The broker atomically consumes the code, rechecks the pending authorization, creates or updates membership and consent, and creates the browser session. An abandoned or failed exchange leaves no membership.
+11. The function sets broker-issued access and rotating refresh handles in `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Lax` cookies. Only keyed hashes of those handles are stored. It does not expose a Supabase Data API JWT to browser JavaScript.
 12. The app may now greet the person by name and state where it learned the name.
@@ -228,9 +228,13 @@ They log in as `soma_broker`, a role with no `BYPASSRLS`.
 
-The `soma_broker` password, the agent-token signing key, and the refresh-hash key are the broker site's only secrets. The Supabase secret key used for Auth administration lives on a separate, steward-only Netlify site, `soma-id-admin`, because a separate Function on the broker site would still share its environment. The broker has no credential that can invoke the admin site, and the admin site exposes no anonymously callable route.
+The `soma_broker` password, agent-token signing key, and refresh-hash key are the broker site's only secrets.
+
+V1 does not deploy the Supabase Auth administration secret to any HTTP-addressable site. Auth-administration work runs through a steward-operated CLI or an outbound-only scheduled worker with no request handler. If a later release needs an online admin service, its private invocation and authentication mechanism must be designed and threat-tested before the secret is deployed.
 
 The person signs in on the identity origin through Supabase Auth with server-side cookie storage. The Auth session never sits in `localStorage` on the identity origin, so browser JavaScript cannot read the session token.
 
+The identity origin serves no Guide, analytics, advertising, app-supplied script, or third-party JavaScript. It sends `Cache-Control: no-store`, `frame-ancestors 'none'`, a restrictive script and connection CSP, `Referrer-Policy: no-referrer`, and an allowlisted `form-action`.
+
 Only the identity origin's callback URLs are entered in Supabase Auth's redirect allowlist.
@@ -254,14 +258,21 @@ Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tab
 | `soma.app_hosts` | `app_id`, `actor_id`, `role`, `escalation_url`, `expected_response`, `notify_address` | Platform-managed. Public reads of active apps expose every listed field except `notify_address`; only the contact notifier can read that private field. |
 | `soma.app_installations` | `app_id`, `purpose` (`runtime` or `release`), `credential_hash`, `created_at`, `last_used_at`, `revoked_at` | Broker-only. Raw credentials are never stored. |
+| `soma.oauth_transactions` | `transaction_id`, `app_id`, `state_hash`, `nonce_hash`, `pkce_challenge`, `redirect_uri`, `disclosure_hash`, `expires_at`, `consumed_at` | Broker-only pending authorization. Every secret value is stored as a keyed hash. |
+| `soma.authorization_codes` | `code_id`, `transaction_id`, `code_hash`, `person_id`, `expires_at`, `consumed_at` | Broker-only, short-lived, and single-use. Consumption, membership, consent, and session creation are one transaction. |
+| `soma.browser_sessions` | `session_id`, `person_id`, `app_id`, `access_handle_hash`, `refresh_family_id`, `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at` | Broker-only. Access handles rotate after authentication and privilege changes. |
+| `soma.refresh_families` | `family_id`, `kind` (`browser` or `agent`), `subject_id`, `app_id`, `grant_id`, `current_generation`, `expires_at`, `revoked_at`, `compromised_at` | Broker-only lifecycle for rotating credentials. |
+| `soma.refresh_credentials` | `credential_id`, `family_id`, `generation`, `credential_hash`, `issued_at`, `used_at`, `replaced_by`, `revoked_at` | Broker-only. Reuse of any consumed generation compromises and revokes the family. |
+| `soma.device_authorizations` | `device_id`, `app_id`, `device_code_hash`, `user_code_hash`, `agent_label`, `requested_scopes`, `risk_ceiling`, `purpose`, `attempts`, `status`, `person_id`, `expires_at`, `consumed_at` | Broker-only RFC 8628 state. User-code comparisons are constant-time; attempts and expiry are enforced transactionally. |
+| `soma.security_events` | `event_id`, `person_id`, `app_id`, `kind`, `subject_id`, `safe_metadata`, `created_at` | Contains no token, code, request body, or raw credential. Records refresh reuse, pairing, revocation, and suspicious authorization failures. |
 | `soma.memberships` | `person_id`, `app_id`, `app_person_id`, `role`, `trust`, `joined_at`, `last_seen_at`, `left_at` | The person reads their rows. App admins use a narrow broker call. |
 | `soma.consents` | `person_id`, `app_id`, `fields`, `purpose`, `policy_version`, `granted_at`, `revoked_at` | The person reads and revokes. The broker enforces disclosure. |
@@ -260,7 +271,7 @@ Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tab
-| `soma.agent_partners` | `agent_id`, `principal_id`, `label`, `refresh_credential_hash`, `created_at`, `last_used_at`, `revoked_at` | Registers an AI relationship without granting app authority. Only the broker ever sees the refresh credential. |
+| `soma.agent_partners` | `agent_id`, `principal_id`, `label`, `created_at`, `last_used_at`, `revoked_at` | Registers an AI relationship without granting app authority. Rotating credentials live in the refresh-family tables rather than on the relationship row. |
@@ -995,7 +1006,7 @@ The gate must check:
-| C22 | Authorization rejects state, nonce, PKCE, issuer, audience, callback-origin, refresh-reuse, CSRF, and cross-origin failures. No secret or bearer value appears in logs, URLs, analytics, or evidence. |
+| C22 | Authorization rejects unknown, expired, replayed, and concurrently reused state, code, nonce, PKCE, issuer, audience, callback-origin, device-code, refresh, CSRF, and cross-origin values. A failed exchange creates no membership. Refresh reuse revokes the whole family. No secret or bearer value appears in logs, URLs, analytics, errors, or evidence. |
```

### R4: Keep private answers inside their source app
- **Why:** The plan says only explicitly shareable answers belong centrally, but `soma.answers` stores even private answers in the cross-app control plane. That increases breach impact and makes “private to this app” depend on a filter rather than data minimization.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -258,7 +258,7 @@ Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tab
 | `soma.question_definitions` | `question_id`, `schema_version`, `owner_app_id`, `schema_hash`, `portable`, `compatible_with`, `status` | Platform-managed registry. Cross-app compatibility is explicit and hash-bound, never inferred from matching strings. |
 | `soma.concept_state` | `person_id`, `concept_id`, `concept_version`, `state`, `source_app_id`, `receipt_id`, `first_at`, `last_at`, `evidence` | Writes require a concept declared by the app's registered contract. `acknowledged` requires a direct person gesture; `done` requires a successful receipt bound to the concept. `soma:*` state reaches an app only after consent. |
-| `soma.answers` | `person_id`, `question_id`, `schema_version`, `answer`, `source_app_id`, `sharing`, `sensitivity`, `purpose`, `expires_at`, `answered_at`, `revoked_at` | Answers are size-limited typed JSON. They remain private unless the person approves a preview of the exact fields, destination class, purpose, and duration. |
+| `soma.shared_answers` | `person_id`, `question_id`, `schema_version`, `answer`, `source_app_id`, `sensitivity`, `purpose`, `allowed_destination`, `expires_at`, `shared_at`, `revoked_at` | Contains only the projection a person explicitly approved for cross-app use. Private source answers never enter the `soma` schema. |
@@ -305,6 +305,7 @@ New apps receive an `app_<app_id>` schema for tables and an `app_<app_id>_api` s
 | `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `input_hash`, `actor_id`, `principal` (`app_person_id`), `grant_id`, `declared_risk`, `effective_risk`, `status`, `preview`, `resource_version`, `effect_summary`, `output`, `undo_of`, `expires_at`, `created_at`, `completed_at`. The canonical intent, approval, receipt, and idempotency record. |
 | `last_location` | The person's resume point in this app (from `soma-app-template/supabase/migrations/0005_last_location.sql`). |
+| `answers` | The app's canonical private typed answers. Sharing copies only the approved projection to `soma.shared_answers` in the same broker transaction that records consent. |
 | `app_changes` | Proposed, accepted, building, shipped, and rejected changes. |
@@ -374,10 +375,12 @@ No state suppresses an explicit request. Ask and Show always answer when the per
 
 A question has a stable ID and answer schema version.
 
-An answer is private to its source app unless the person explicitly approves a share preview. An app may request portability but cannot set `sharing='soma'` on the person's behalf.
+An answer is written first to the source app's `answers` table and remains there by default.
+
+Sharing is an explicit copy operation. The person approves the exact projected fields, destination class, purpose, sensitivity, and duration; the broker then writes that projection to `soma.shared_answers`. An app may request portability but cannot create or broaden the shared projection on the person's behalf.
 
 An app may suppress a question only when the registered question definition marks the stored schema compatible, the consent remains current, the answer has not expired, and the app is allowed to receive its sensitivity class.
 
-Revoking answer consent immediately hides it from other apps without deleting the source app's lawful copy.
+Revoking answer consent immediately deletes or tombstones the shared projection and hides it from every destination without deleting the source app's lawful private copy.
@@ -540,7 +543,7 @@ GET    /api/soma/v1/me                         membership, role, consented fields
 GET    /api/soma/v1/me/concepts?ids=…          state of declared concepts
 POST   /api/soma/v1/me/concepts/:id            record told, shown, done, or acknowledged
 GET    /api/soma/v1/me/answers?ids=…           compatible answers this app may read
-PUT    /api/soma/v1/me/answers/:question_id    store a private answer; sharing needs the person's approved preview
+PUT    /api/soma/v1/me/answers/:question_id    store a private app answer; a separate approved share operation creates a central projection
@@ -979,6 +982,7 @@ The gate must check:
 | C10 | The device marker contains no PII, user ID, or credential. |
 | C11 | An unvisited app cannot learn or display the person’s name before consent. |
+| C11a | A private answer exists only in its source app schema. Sharing copies only the approved projection into `soma.shared_answers`; revocation removes that projection, and another app cannot recover the source value. |
```

### R5: Correct receipt and idempotency semantics
- **Why:** Writing a receipt for every refused request permits unauthenticated storage abuse. The idempotency key is not bound to action version, while stored observe outputs duplicate private data that the audit log only needs to describe.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -39,7 +39,7 @@ _Paths are relative to `~/Projects/` unless stated otherwise._
-| Consent and action receipts | The person sees expected effects before consequential acts and receives a durable result afterward. | Authority must be visible, bounded, and reviewable. | Guide risk flag; PlayMaker audit and pairing code; template delegation migrations. | Enforce risk, scope, expiry, confirmation, idempotency, and undo on the server. Write receipts for every effect attempt, every refused request, and every read an AI performs on the person's behalf. |
+| Consent and action receipts | The person sees expected effects before consequential acts and receives a durable result afterward. | Authority must be visible, bounded, and reviewable. | Guide risk flag; PlayMaker audit and pairing code; template delegation migrations. | Enforce risk, scope, expiry, confirmation, idempotency, and undo on the server. Write receipts for authenticated effect attempts, authorization refusals, and AI-performed reads. Reject malformed, unauthenticated, and rate-limited traffic before receipt creation. |
@@ -307,7 +307,8 @@ New apps receive an `app_<app_id>` schema for tables and an `app_<app_id>_api` s
-| `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `input_hash`, `actor_id`, `principal` (`app_person_id`), `grant_id`, `declared_risk`, `effective_risk`, `status`, `preview`, `resource_version`, `effect_summary`, `output`, `undo_of`, `expires_at`, `created_at`, `completed_at`. The canonical intent, approval, receipt, and idempotency record. |
+| `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `request_fingerprint`, `actor_id`, `principal` (`app_person_id`), `grant_id`, `declared_risk`, `effective_risk`, `status`, `resource_version`, `effect_summary`, `output_ref`, `undo_of`, `expires_at`, `created_at`, `completed_at`, `payload_sha256`, `signing_key_id`, `signature`. `request_fingerprint` is a keyed digest of the action ID, action version, canonical input, principal, and target resource. The terminal signature covers the immutable receipt envelope and payload hash. |
+| `action_receipt_payloads` | Erasable preview, input, and output material referenced by a receipt. AI observe receipts store only resource class and outcome metadata, never the content read. |
@@ -327,11 +328,11 @@ A conformance test must prove that one person cannot read another person’s rows.
 
-`action_receipts` has a unique constraint on `(action_id, principal, idempotency_key)`. Scoping the key to the principal means one person cannot block another person's action by guessing their key.
+`action_receipts` has a unique constraint on `(principal, idempotency_key)`. Reusing a key for any different action, version, canonical input, or target produces an idempotency conflict. Scoping it to the principal prevents one person from blocking another.
@@ -331,7 +332,7 @@ A conformance test must prove that one person cannot read another person’s rows.
-Preparation validates and canonicalizes the input, computes its hash, records the current resource version, calculates the effective risk and effects, and inserts the idempotency row. Preparation is side-effect free.
+Preparation authenticates the principal, applies admission limits, validates and canonicalizes input, computes the keyed request fingerprint, records the resource version, calculates effective risk and effects, and inserts the idempotency row. Malformed, unauthenticated, and rate-limited traffic stops before this point. Preparation is side-effect free.
@@ -341,9 +342,9 @@ PlayMaker's `agent_command_requests` (`playmaker/supabase/migrations/0081_agent_a
 
-- A repeated key with the same `input_hash` returns the current receipt state and stored output, if any, without creating another intent or repeating the effect.
+- A repeated key with the same `request_fingerprint` returns the current receipt state and permitted stored result, if any, without creating another intent or repeating the effect.
 - A repeated key while the row is `running` returns HTTP 409 with `code: "idempotency_pending"` and `Retry-After`.
-- A repeated key with a different `input_hash` returns HTTP 422 with `code: "idempotency_conflict"`.
+- A repeated key with a different request fingerprint returns HTTP 422 with `code: "idempotency_conflict"`.
@@ -348,7 +349,7 @@ PlayMaker's `agent_command_requests` (`playmaker/supabase/migrations/0081_agent_a
 
-Erasure keeps the receipt's existence for the retention period but deletes `effect_summary` and `output` and replaces `principal` with a tombstone. Erasure deletes the person's `soma.receipt_index` rows.
+Erasure deletes the erasable payload, removes `effect_summary`, replaces `principal` with a tombstone, and retains only the signed non-sensitive envelope for the declared retention period. It deletes the person's `soma.receipt_index` rows. The keyed request fingerprint is not exported and becomes unlinkable after the app's retention key rotates.
@@ -465,7 +466,9 @@ After confirmation, the app server executes the already-recorded intent.
 
-Every outcome of an `effect` action writes a receipt, including refusal and failure. An `observe` action writes a receipt only when an AI host or a paired outside AI runs it, so the person can audit what an AI read on their behalf. A person's own reads in the UI write none. Every refused request writes a receipt, whatever its kind.
+Every authenticated `effect` attempt that reaches preparation writes a receipt, including authorization refusal and execution failure. An AI-performed `observe` action writes a metadata-only receipt naming the action and resource class, but it does not retain the content returned. A person's own UI reads write none.
+
+Invalid credentials, malformed requests, admission-limit failures, and unknown actions produce bounded security metrics or security events, not action receipts.
@@ -987,7 +990,7 @@ The gate must check:
-| C16 | User-visible actions end in success, failure, refusal, or pending approval. Every effect attempt, every refused request, and every AI-performed observe action produces a receipt; a person's own UI reads do not. |
+| C16 | User-visible actions end in success, failure, refusal, or pending approval. Every authenticated effect attempt that reaches preparation and every AI-performed observe action produces the required receipt. Invalid, unauthenticated, and rate-limited traffic produces no receipt. Observe receipts retain no returned private content, and terminal receipt signatures verify. |
```

### R6: Do not give the in-app AI ambient write authority
- **Why:** An implicit session grant capped at “reversible” still lets prompt injection or a mistaken model invoke every reversible action available to the person. Ask may propose an action, but only a direct person gesture should authorize that particular execution.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -442,14 +442,18 @@ A `view` action changes only what is on the person's screen.
 
-The in-app AI host acts inside the person's current session under an implicit session grant capped at `reversible`. Its receipts record the AI host's `actor_id` and the person as principal.
+The in-app AI host has no ambient effect grant. It may explain, prepare an action preview, or offer a declared Do control.
+
+Selecting that Do control creates a one-request authorization bound to the current person session, action ID and version, canonical input hash, target resource version, AI-host actor, and short expiry. It may authorize at most a reversible action. Model output, retrieved knowledge, page context, and action output can never create this authorization.
+
+An AI host that needs asynchronous or standing authority must receive the same named, scoped, expiring grant as an outside AI. Every receipt records the AI host's `actor_id` and the person as principal.
 
 | Risk | Person in current UI | AI host or paired outside AI |
 |---|---|---|
 | `observe` | Run immediately. | Run with the matching read scope. |
-| `reversible` | Run and show a receipt with a tested undo operation. | Run only within a live grant and risk ceiling; the receipt exposes the same tested undo operation. |
+| `reversible` | Run and show a receipt with a tested undo operation. | A paired AI needs a live grant and risk ceiling. The in-app host needs the person's explicit Do gesture for this exact prepared request. The receipt exposes the tested undo operation. |
 | `consequential` | Show an effect preview and require confirmation. | Require fresh person approval of the recorded intent, bound to the action, version, input hash, principal, and expiry. Return `approval_required` with an `approval_url` the AI relays to the person. |
@@ -979,6 +983,7 @@ The gate must check:
 | C8 | A paired AI cannot exceed its app, scope, expiry, or risk ceiling. |
+| C8a | The in-app AI host cannot execute an effect from model output, page context, retrieved text, or an old Do gesture. A reversible effect requires a fresh one-request authorization bound to the exact prepared request; asynchronous authority requires a normal named grant. |
```

### R7: Keep every runtime secret out of builds and browsers
- **Why:** C12b currently allows declared provider keys in the built browser bundle. Netlify context alone also does not prove a value is unavailable to build code; every credential needs an explicit scope and a canary test.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -278,12 +278,15 @@ Registration is idempotent and does five things:
-4. Mints a runtime installation credential and a release credential for each broker, and sets them in the app's Netlify environment by deploy context, with the command's output redirected so no secret is ever printed.
-   - The `production` context receives the production broker's credentials and `SOMA_BROKER_URL`.
-   - The `branch-deploy` context receives the staging broker's credentials and URL.
+4. Mints overlapping runtime installation credentials and a release credential for each broker. It writes them without placing values in command output, shell history, generated files, or process arguments visible to unrelated processes.
+   - `SOMA_APP_INSTALLATION_KEY` and `SOMA_APP_INSTALLATION_KEY_NEXT` are Functions-scope only. Build code and browser code cannot read them.
+   - `SOMA_APP_RELEASE_KEY` is Builds-scope only. Functions and browser code cannot read it.
+   - Server-side provider keys are Functions-scope only unless a separately named build credential is explicitly approved. No provider secret is ever browser-scoped.
+   - `SOMA_BROKER_URL` is non-secret and may be available to Builds and Functions.
+   - The `production` context receives only production values.
+   - The fixed `preview` branch receives only staging values and is protected so only the conformance runner and release seat can update it.
    - The `deploy-preview` context receives no SOMA credential. A per-pull-request build cannot complete sign-in (item 5), and it must not move any registry.
-   - The release credential (`SOMA_APP_RELEASE_KEY`) has the Netlify "Builds" scope only, so the app's Functions never see it.
@@ -983,7 +986,7 @@ The gate must check:
-| C12b | The app's `.env.example`, `netlify.toml`, Function source, and built browser bundle contain no environment credential outside this allowlist: `SOMA_BROKER_URL`, `SOMA_APP_INSTALLATION_KEY`, `SOMA_APP_INSTALLATION_KEY_NEXT`, `SOMA_APP_RELEASE_KEY`, and provider keys named by declared data flows. Standard non-secret Netlify build metadata such as `CONTEXT`, `BRANCH`, and `COMMIT_REF` may be referenced but never copied into a credential slot. `SOMA_APP_RELEASE_KEY` may be referenced only by the build-time sync script. The browser bundle contains no Supabase project URL or key. |
+| C12b | Source may reference only declared environment-variable names; `.env.example` contains placeholders only. Runtime installation and provider secrets are Functions-scope only; the release key is Builds-scope only. Conformance injects unique canary values for every scope, builds the app, downloads every browser asset and source map, and proves that no secret canary appears. A test Function proves the release key is absent, and the build proves runtime keys are absent. Browser output contains no secret, provider key, installation key, release key, Supabase URL, or Supabase key. |
@@ -1034,7 +1037,7 @@ Existing package checks remain runnable:
-| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove every shared credential from the generator: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template`, its functions, `soma-scaffolder/src/scaffold.mjs`, and `soma-scaffolder/src/provision.mjs`; the `VITE_SUPABASE_*` values and the shared-project fallback in `src/lib/somaAuthConfig.ts`; and `CLAUDE_EMAIL_*` with `netlify/functions/lib/boardCard.ts`, whose job `soma.estate_inbox` takes over. A generated app receives only `SOMA_BROKER_URL`, its installation credentials (`SOMA_APP_INSTALLATION_KEY` and, during rotation, `SOMA_APP_INSTALLATION_KEY_NEXT`), in its build environment only its release credential (`SOMA_APP_RELEASE_KEY`), standard non-secret build metadata, and provider keys for data flows its manifest declares. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. A freshly generated app's environment, `.env.example`, and bundled browser code contain no shared-project key, Supabase URL, or estate mailbox credential. |
+| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove every shared credential from the generator: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template`, its functions, `soma-scaffolder/src/scaffold.mjs`, and `soma-scaffolder/src/provision.mjs`; the `VITE_SUPABASE_*` values and the shared-project fallback in `src/lib/somaAuthConfig.ts`; and `CLAUDE_EMAIL_*` with `netlify/functions/lib/boardCard.ts`, whose job `soma.estate_inbox` takes over. A generated app receives non-secret `SOMA_BROKER_URL`; Functions-only installation and declared provider credentials; Builds-only `SOMA_APP_RELEASE_KEY`; and standard non-secret build metadata. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. Scope-canary tests prove build, Function, and browser boundaries. |
```

### R8: Make export and erasure promises executable
- **Why:** `soma.erasure_requests` has no fan-out to app tables, files, notification systems, or outside providers. The plan cannot honestly declare global export or erasure complete without an inventory of stores and a target-by-target result.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -262,6 +262,7 @@ Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tab
 | `soma.receipt_index` | `receipt_id`, `app_id`, `person_id`, `actor_id`, `action_id`, `risk`, `status`, `created_at` | Written by the broker in the same transaction that writes or settles the app's receipt. Holds no input, output, or effect text. Powers the person's cross-app receipt list and AI-grant audit. |
 | `soma.erasure_requests` | `request_id`, `person_id`, `scope`, `status`, `requested_at`, `effective_at`, `completed_at`, `receipt` | The person reads their requests. Platform workers update status. |
+| `soma.erasure_targets` | `request_id`, `target_kind`, `app_id`, `store_id`, `status`, `attempts`, `next_attempt_at`, `completed_at`, `exception_reason`, `receipt` | One idempotent target per app database, object store, notification adapter, or declared provider. A global request is complete only when every target is complete or a lawful retained exception is shown to the person. |
```

Insert the following after section 2.5 and before section 2.6:

```markdown
### 2.5a Data inventory, export, and erasure

Every manifest declares `data_stores`. Each entry names its owner, kind (`database`, `object-storage`, `notification`, or `provider`), data classes, export handler, erasure handler, retention rule, and whether a lawful-retention exception can apply.

Private files use an app-specific private bucket or prefix. Uploads require a short-lived signed grant bound to the person, app, MIME allowlist, byte limit, checksum, and destination. Downloads require a fresh authorization check. User-supplied filenames never become storage paths. Public buckets, permanent signed URLs, and client-held storage administration keys fail conformance.

A per-app export combines the app's domain rows, private answers, files, grants, receipts permitted by retention, and the central records disclosed to that app. A global export is an identity-origin job that fans out to every current or former membership and produces a manifest showing each target's result. “Complete JSON” means all exported records plus file metadata and checksums; Markdown is the readable projection.

A global erasure request immediately revokes browser sessions, AI grants, refresh families, pending approvals, and outstanding invitations. It then creates one `soma.erasure_targets` row for every store named by every affected app contract. Handlers are idempotent and retryable. Completion requires proof from every target; a provider outage leaves the request visibly pending rather than reporting success.

Lawfully retained payment or security records are minimized, separated from product data, and shown as named exceptions with their deletion dates. Backups are not rewritten in place, but erased data cannot return to service after restore and ages out under the declared backup-retention period.

An app that cannot demonstrate export and erasure for each declared store cannot advance to public MVP.
```

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -989,6 +989,7 @@ The gate must check:
 | C18 | Required routes exist. Public MVP also requires ratified content and a numeric `retention_days` on every data flow, and the rendered `/privacy` and `/where-your-words-go` pages must show exactly the manifest's retention values. |
+| C18a | Every declared data store participates in export and erasure. Cross-person file access, unsafe filenames, MIME confusion, oversize uploads, permanent URLs, omitted erasure targets, false completion during an injected target failure, and restoration of erased data all fail. |
```

### R9: Make contract paths and Guide integrity enforceable
- **Why:** Referenced-file hashing does not define how paths, symlinks, or files outside the repository are handled. The Guide also permits runtime-loaded executable chunks whose hashes are recorded but not enforced by browser SRI.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -656,7 +656,9 @@ The Guide's package name is `@soma-platform/soma-guide`, while its delivery remai
 
-A Guide release loads no code from outside its own immutable version path. `deploy-guide.sh` fails a release whose bundle contains a remote `import()` URL. Kit apps cannot use `voiceAgentEsmUrl`; an enabled voice adapter is a relative, hashed asset in the same release.
+A Guide release loads no executable code beyond the entry script whose SRI hash appears in the app's lock file. All executable Guide and voice-adapter code is statically bundled into that entry script; kit mode permits no runtime JavaScript `import()`, worker script, JSONP callback, or configurable executable URL. Non-executable media may use content-addressed relative paths listed in the lock.
+
+`deploy-guide.sh` fails a release containing a remote or dynamic executable import. Kit apps cannot use `voiceAgentEsmUrl`.
@@ -666,7 +668,7 @@ A Guide release loads no code from outside its own immutable version path.
-- After deploying, it fetches every asset of every listed version from the CDN and compares its SHA-384 with the lock value.
+- After deploying, it fetches every asset of every listed version from the CDN and compares its SHA-384 with the lock value. The browser-enforced SRI entry script must contain all executable code.
@@ -734,6 +736,10 @@ The contract hash, `contract_sha256`, is the SHA-256 of the RFC 8785 (JSON Canoni
 
 The contract hash, `contract_sha256`, is the SHA-256 of the RFC 8785 (JSON Canonicalization Scheme) form of `{ "manifest": <manifest>, "files": { "<path>": "<sha256 of file bytes>" } }`, where `files` lists every path the manifest references. Reformatting the manifest does not change the hash. Changing a referenced schema, persona, or knowledge file does.
 
+The schema distinguishes repository source paths from public routes. A source path is a normalized repository-relative POSIX path with no leading slash, `..`, URL scheme, control character, or empty segment. The resolver rejects symlinks, non-regular files, files outside the repository after `realpath`, and files above the declared size limit. It reads each file once and hashes the bytes it actually compiles or copies.
+
+For example, `knowledge/host-pair.md` is a source path; the compiler may publish it at `/knowledge/host-pair.md`. Legal paths such as `/privacy` are routes and are never opened as files.
+
 `soma.app_contracts.contract_sha256`, the running release's status endpoint, the lock file checks, and the evidence bundle all use this contract hash.
@@ -775,7 +781,7 @@ A minimal contract looks like:
     "ask": {
       "endpoint": "/api/soma/v1/ask",
-      "knowledge": ["/knowledge/host-pair.md"],
+      "knowledge": ["knowledge/host-pair.md"],
@@ -793,7 +799,7 @@ A minimal contract looks like:
       "version": "1",
       "title": "Who hosts this app",
-      "tell": "/knowledge/host-pair.md",
+      "tell": "knowledge/host-pair.md",
@@ -984,7 +990,7 @@ The gate must check:
-| C13 | Vendored files and every Guide asset match `soma-kit.lock.json`. |
+| C13 | Vendored files and every Guide asset match `soma-kit.lock.json`. Referenced source paths cannot escape the repository through absolute paths, traversal, symlinks, or replacement races. The Guide entry script contains all executable code and loads no runtime executable chunk. |
```

### R10: Give humans and outside AIs a stable API failure contract
- **Why:** The plan specifies endpoints but not a shared error envelope, pagination, cache policy, or retry semantics. Builders would otherwise invent incompatible behavior, and outside AIs could not reliably distinguish refusal, retry, approval, and failure.
- **Change:** Insert this section after section 2.7a and before section 2.8:

```markdown
### 2.7b API invariants

Every `/api/soma/v1/*` response carries `X-Request-Id`. Successful JSON uses the shape documented for that endpoint. Errors use one envelope:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "Person-readable explanation",
    "retryable": false,
    "request_id": "req_…",
    "receipt_id": "optional",
    "approval_url": "optional"
  }
}
```

The envelope never includes a stack trace, SQL message, provider response, credential, internal hostname, or unredacted input.

Status codes have stable meanings: `400` malformed input, `401` absent or invalid authentication, `403` authenticated but unauthorized, `404` absent or deliberately enumeration-resistant, `409` pending or state conflict, `422` valid shape with rejected semantics, `429` admission limit, `502` upstream failure, and `503` declared dependency outage. `429` and retryable `409` or `503` responses include `Retry-After`.

Private responses, authorization pages, approvals, receipts, exports, and pairing responses send `Cache-Control: no-store`. Immutable public discovery and knowledge use explicit ETags and content types.

Every collection that can grow uses opaque cursor pagination with a declared maximum page size and deterministic ordering. No API exposes an unbounded receipt, change, feedback, grant, or action-history list.

OpenAPI contains the common error schema, authentication requirements, rate-limit behavior, idempotency requirements, and every route intended for an outside AI. Human-only approval and consent mutations remain absent from AI discovery, but their security never depends on being undiscoverable.
```

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -985,7 +985,7 @@ The gate must check:
-| C14 | Discovery, OpenAPI, runtime actions, and manifest actions agree. |
+| C14 | Discovery, OpenAPI, runtime actions, and manifest actions agree. Contract tests also prove the common error envelope, status mapping, `Retry-After`, private `no-store` policy, bounded cursor pagination, and absence of internal error details. |
```

### R11: Describe the known-device marker accurately
- **Why:** `packages/soma-signin/src/somaKnownDevice.js` stores the literal value `1`, not an opaque identifier. Calling it opaque invites future implementations to generate a stable tracking token where a boolean is sufficient.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -12,7 +12,7 @@ _Paths are relative to `~/Projects/` unless stated otherwise._
-| What the browser remembers before sign-in | Store only an opaque “known device” marker. | A browser marker should not contain a name, email, person ID, or access token. |
+| What the browser remembers before sign-in | Store only an origin-scoped boolean “known device” marker. | `@soma/signin` already stores the literal `1`; a random identifier would add tracking value without improving recognition. |
@@ -35,7 +35,7 @@ _Paths are relative to `~/Projects/` unless stated otherwise._
-| Be known | A returning person is recognized without being exposed to an unfamiliar app first. | One identity, consumed rather than forked. | `soma-platform/packages/soma-signin`; PlayMaker’s known-device flow; `soma-platform/docs/SOMA-IDENTITY-STATES.md`. | Use the shared identity broker, pairwise app IDs, an opaque device marker, and a one-tap recognition offer on first cross-app entry. |
+| Be known | A returning person is recognized without being exposed to an unfamiliar app first. | One identity, consumed rather than forked. | `soma-platform/packages/soma-signin`; PlayMaker’s known-device flow; `soma-platform/docs/SOMA-IDENTITY-STATES.md`. | Use the shared identity broker, pairwise app IDs, an origin-scoped boolean marker, and a one-tap recognition offer on first cross-app entry. |
@@ -143,7 +143,7 @@ No new app receives a service-role credential that can read the entire shared pr
-1. The app reads only its own opaque marker, `soma.known.device`, which `@soma/signin` already writes. The marker means only “this browser has signed in to this app before.”
+1. The app reads only its own origin-scoped boolean marker, `soma.known.device`, which `@soma/signin` writes as the literal `1`. It means only “this browser has signed in to this app before.”
@@ -786,7 +786,7 @@ A minimal contract looks like:
-    "device_storage": "opaque-marker",
+    "device_storage": "boolean-marker",
@@ -907,7 +907,7 @@ A conforming app receives:
-- Pairwise app identity and an opaque known-device marker.
+- Pairwise app identity and an origin-scoped boolean known-device marker.
@@ -978,7 +978,7 @@ The gate must check:
-| C10 | The device marker contains no PII, user ID, or credential. |
+| C10 | The device marker is exactly the schema-approved boolean value and contains no random identifier, PII, user ID, or credential. |
```

### R12: Separate the kit rehearsal from the November product choice
- **Why:** The estate plan parks V’Eric coaching until the November evidence-based choice. Using it as the current timed test would quietly start a parked product and turn a plumbing exercise into a product commitment.
- **Change:**

```diff
--- a/soma-platform/docs/kit/10-plan.md
+++ b/soma-platform/docs/kit/10-plan.md
@@ -1041,7 +1041,7 @@ Existing package checks remain runnable:
-| M10: Second-app test | Run the timed build from an approved manifest without editing `soma-platform`. | Section 5 passes on the registered live Netlify branch deploy. |
+| M10: Rehearsal, then second-app acceptance | First run the timed build with the disposable kit fixture. After the November product choice, repeat it in the chosen product repository without editing `soma-platform`. | The fixture proves repeatability; only the chosen product passing section 5 earns the claim that a second SOMA app stood up on the kit. |
@@ -1082,9 +1082,13 @@ Dropping a table, column, credential, or compatibility view requires separate ap
 
-The test uses a new repository.
+The immediate rehearsal uses a disposable repository named `soma-kit-second-app-fixture`.
 
-The recommended subject is V’Eric coaching.
+Its domain is a small coaching-shaped workflow because that exercises hosts, private answers, Show, and actions, but it uses fixture hosts and a steward-controlled test mailbox. It creates no V’Eric product repository, customer promise, or production surface.
+
+After the November product choice, the same test runs again in the chosen product repository. The fixture rehearsal does not count as the second app.
 
 The timer begins when an approved `soma-app.json` is handed to one Cursor or Codex builder.
@@ -1172,9 +1176,5 @@ The timer begins when an approved `soma-app.json` is handed to one Cursor or Code
-5. **Which product is the timed second-app test?**  
-   Recommendation: V’Eric coaching. It exercises the host pair, identity, concepts, outside-AI participation, and the current AI–human-pair revenue direction without waiting for OLLI’s institutional decisions.
-
 ## 7. Assumptions to test with a person
@@ -1191,7 +1191,7 @@ The timer begins when an approved `soma-app.json` is handed to one Cursor or Code
-| The named human host will keep the stated response time. | Ask Eric to commit to the response time in the V'Eric manifest. Then send him three contact messages over one week, unannounced, through the channel the kit would use. | Eric agrees to the wording, and all three replies arrive within the stated time. Otherwise the stated time changes before launch. |
+| The named human host will keep the stated response time. | When the second app is selected, ask its human host to approve the wording. Then send three agreed test messages over one week through the real channel. | The host approves the wording and all three replies arrive within it. Otherwise the promise changes before launch. |
@@ -1221,7 +1221,7 @@ It must include:
-- A redacted evidence bundle and a timed second-app rehearsal against staging.
+- A redacted evidence bundle and a timed disposable-fixture rehearsal against staging. This does not pre-empt the November second-app decision.
```