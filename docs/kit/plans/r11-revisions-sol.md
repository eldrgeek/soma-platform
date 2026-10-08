# Revisions, round 11, OpenAI Codex (GPT-5)

### R1: Isolate the mail credential from the public broker

- **Why:** The plan correctly refuses to place the Supabase administration secret on an HTTP-addressable site because Netlify environment variables are site-scoped, but then places the mail-provider key on that same broker site. A scheduled Function is not a secret boundary from the site’s public Functions.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -228,10 +228,15 @@
 The Mac-side estate importer logs in as `soma_estate`, a role that can only lease and acknowledge `soma.estate_inbox` rows and write `soma.estate_dispositions`. Its password lives in the Mac keychain and in no Netlify site.
 
 The Supabase secret key used for Auth administration is deployed to no HTTP-addressable site in v1. A separate Function on the broker site would share its environment, and a separate public site would need a private invocation mechanism that v1 has not designed. Auth-administration work, such as deleting the Auth user during global erasure, therefore runs through a steward-operated CLI or an outbound-only scheduled worker with no request handler. If a later release needs an online admin service, its private invocation and authentication must be designed and threat-tested before the secret is deployed.
 
+The mail-provider credential follows the same boundary. It is not deployed to `soma-id`. Notifications run from a separate `soma-notify` deployment with no public application routes, a separate environment, and a database role that may execute only `soma.notification_claim()` and `soma.notification_settle()`. The claim function resolves one registered destination and returns one already-rendered message; the worker cannot browse `auth.users`, app schemas, receipts, answers, or the rest of the `soma` schema. `soma-notify` holds no broker signing, installation, release, or database-owner credential.
+
 The identity origin is hardened as a credential page: server-side Auth session cookies, no third-party or app-supplied script, and strict caching, framing, referrer, and form policies. Only the identity origin's callback URLs are entered in Supabase Auth's redirect allowlist; app origins are registered in `soma.apps` and checked by the broker. A new app therefore adds no entry to the shared project's allowlist, which was at 1,998 of 2,048 bytes on 2026-10-05 (`SOMA/tools/auth/README.md`).
 
-**Notifications.** An app sends a person a message through the broker RPC `notify_person(app_person_id, template_id, params)`. Templates are declared in the manifest's `notifications` list, belong to the privileged projection (section 2.4a), and accept only declared fields. One scheduled notification worker, with no request handler, resolves the person's verified address at send time, so the app never receives it. Each app has a per-person daily notification cap, and the person can mute an app's notifications from `/api/soma/v1/me`. The host contact notice (section 2.7) and the AI-partner announcement (section 2.7) use the same queue.
+**Notifications.** An app sends a person a message through the broker RPC `notify_person(app_person_id, template_id, params)`. Templates are declared in the manifest's `notifications` list, belong to the privileged projection (section 2.4a), and accept only declared fields. The broker inserts the queue row but never resolves or receives the destination address. `soma-notify` resolves the verified address only while claiming that row, so the app and broker request handlers never receive it. Each app has a per-person daily notification cap, and the person can mute an app's notifications from `/api/soma/v1/me`. The host contact notice (section 2.7) and the AI-partner announcement (section 2.7) use the same queue.
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -1315,7 +1315,9 @@
 **Fixture cross-app state** [2.5, 5]. M3 publishes `soma:host-pair` and one portable `soma:` question. The permanently registered `soma-fixture` app declares both, records the concept as understood for each Golden Journey test person, and shares that person's compatible answer to the question. A timed app can therefore prove suppression and answer reuse without an unplanned steward action during the run.
 
-**Broker secrets** [2.3b]. The `soma_broker` password, the agent-token signing key, the refresh-hash key, the receipt-signing key, the master key from which per-app request-fingerprint keys are derived, and a send-only mail-provider key are the broker site's only secrets. Only the scheduled notification worker reads the mail key; it has no request handler.
+**Broker secrets** [2.3b]. The `soma_broker` password, the agent-token signing key, the refresh-hash key, the receipt-signing key, and the master key from which per-app request-fingerprint keys are derived are the broker site's only secrets.
+
+**Notification secrets** [2.3b]. The separate `soma-notify` deployment holds only its restricted database credential and the send-only mail-provider key. C12 verifies that neither value exists in `soma-id` or any app site.
```

### R2: Scope idempotency to the acting identity and authorization

- **Why:** PlayMaker’s current ledger is caller-scoped by `auth.uid()`. The proposed ledger scopes only by principal, even though one principal may have several outside AIs and an AI host; one actor could therefore collide with another actor’s key or recover its stored result.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -290,7 +290,7 @@
 | `feedback_items` | The canonical user report and its evidence, including host contact threads (`kind = 'contact'`). |
 | `build_requests` | The report-to-build lifecycle and demonstration links. |
 | `feedback_status_inbox` | Idempotently applies estate disposition and demonstration updates to the canonical app record so the person can see what happened. |
-| `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `request_fingerprint`, `actor_id`, `principal` (`app_person_id`), `grant_ref`, `declared_risk`, `effective_risk`, `status`, `resource_version`, `effect_summary`, `output_ref`, `undo_of`, `cool_off_started_at`, `expires_at`, `created_at`, `completed_at`, `payload_sha256`, `signing_key_id`, `signature`. The canonical intent, approval, receipt, and idempotency record, signed by the broker when it settles (Appendix A, M2). |
+| `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `request_fingerprint`, `actor_id`, `principal` (`app_person_id`), `grant_ref`, `authorization_version`, `declared_risk`, `effective_risk`, `status`, `resource_version`, `effect_summary`, `output_ref`, `undo_of`, `cool_off_started_at`, `expires_at`, `created_at`, `completed_at`, `payload_sha256`, `signing_key_id`, `signature`. The canonical intent, approval, receipt, and idempotency record, signed by the broker when it settles (Appendix A, M2). |
@@ -310,7 +310,7 @@
 **RLS.** Every table has RLS enabled and forced. Table-owner roles are never used at runtime. Every `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role, sets `search_path` to `pg_catalog` plus its exact app schema, obtains identity only from the platform request-context accessors, and returns explicit columns. Conformance must prove that neither the broker, nor the runtime role, nor any registered RPC can read or change another person's or another app's rows, and that no table owner is on the runtime path (C12, C12a).
 
-**Receipt state machine.** `action_receipts` has a unique constraint on `(principal, idempotency_key)`. Reusing a key for a different action, version, canonical input, or target produces an idempotency conflict. Scoping the key to the principal means one person cannot block another person's action by guessing their key. `status` is one of `prepared`, `approval_required`, `approved`, `running`, `succeeded`, `failed`, `refused`, `expired`, or `undone`.
+**Receipt state machine.** `action_receipts` has a unique constraint on `(principal, actor_id, idempotency_key)`. Reusing a key for a different action, version, canonical input, target, grant, or one-request authorization produces an idempotency conflict. A replay returns stored output only after authenticating the same actor and proving that the authorization recorded on the receipt is still live. This prevents one AI acting for a person from colliding with, blocking, or reading another actor’s request. `status` is one of `prepared`, `approval_required`, `approved`, `running`, `succeeded`, `failed`, `refused`, `expired`, or `undone`.
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -1281,12 +1281,12 @@
 ### M2: Action foundation
 
-- **Preparation** [2.4]. Preparation authenticates the principal, applies admission limits, validates and canonicalizes the input, computes the keyed request fingerprint, records the current resource version, calculates the effective risk and effects, and inserts the idempotency row.
-- **Fingerprint** [2.4]. `request_fingerprint` is a keyed digest of the action ID, action version, canonical input, principal, and target resource. The broker computes it with a per-app fingerprint key.
+- **Preparation** [2.4]. Preparation authenticates the principal and actor, validates the actor's current grant or one-request authorization, applies admission limits, validates and canonicalizes the input, computes the keyed request fingerprint, records the current resource version, calculates the effective risk and effects, and inserts the idempotency row.
+- **Fingerprint** [2.4]. `request_fingerprint` is a keyed digest of the action ID, action version, canonical input, principal, actor ID, grant reference or one-request authorization ID, authorization version, and target resource. The broker computes it with a per-app fingerprint key.
 - **Signing** [2.4]. When a receipt settles, the broker signs the immutable receipt envelope and payload hash with its receipt-signing key, recording `signing_key_id` and `signature`.
 - **Repeated keys** [2.4]:
-  - A repeated key with the same `request_fingerprint` returns the current receipt state and the stored result the caller may see, if any, without creating another intent or repeating the effect.
+  - A repeated key with the same `request_fingerprint` returns the current receipt state and stored result only to the same authenticated actor under the same still-live authorization, without creating another intent or repeating the effect.
   - A repeated key while the row is `running` returns HTTP 409 with `code: "idempotency_pending"` and `Retry-After`.
   - A repeated key with a different `request_fingerprint` returns HTTP 422 with `code: "idempotency_conflict"`.
```

### R3: Treat promises and legal copy as policy, not presentation

- **Why:** The release credential may automatically accept changes classified as presentation-only. If promise wording or ratified legal copy is in that class, an ordinary build can materially broaden a user promise while retaining an unrelated executable check.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -340,7 +340,7 @@
 **Release contracts.** An ordinary pull request that edits the manifest or a file it references changes the contract hash, and the broker enforces that hash. Most such edits (knowledge text, workflow step text, titles) do not change policy and should not wait for the steward. So the app's build runs a vendored `sync-contract` script before the deploy publishes, using the release credential. It submits the manifest, the referenced files' hashes, and the app's migration checksums, and the broker recomputes the contract hash itself.
 
 - `sync-contract` registers a release. It does not approve policy. It accepts a new hash automatically only when the manifest's privileged projection is identical to a policy version in `soma.app_policies` that has not been withdrawn.
-- Policy classification fails closed. The v1 JSON Schema marks a small set of fields as presentation-only: titles, descriptions, workflow step text, promise wording, and the knowledge and persona files. Every other manifest field, and the hash of every other referenced file, belongs to the privileged projection. That includes requested identity fields and their reasons, action input and output schemas, and executors. A presentation-only field may change wording but cannot affect identity disclosure, admission, authorization, data access, storage, retention, network destinations, provider use, or execution. A schema revision that adds a field without classifying it fails validation.
+- Policy classification fails closed. The v1 JSON Schema marks a small set of fields as presentation-only: titles, non-authoritative descriptions, workflow step text, and the knowledge and persona files. Promise text, promise checks, legal source files, retention statements, action effects, requested identity fields and reasons, action schemas, and executors belong to the privileged projection. A presentation-only field may change wording but cannot affect a promise, identity disclosure, admission, authorization, data access, storage, retention, network destinations, provider use, or execution. A schema revision that adds a field without classifying it fails validation.
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -701,6 +701,7 @@
 **Field meanings that the schema alone does not convey:**
 
 - `expected_response` states how soon the human host normally replies. It is a stated expectation shown to the person, not a contractual service-level agreement.
 - Each data flow's `retention_days` is a non-negative integer or the literal `"undeclared"`. The integer is how many days the vendor keeps the data under the operator's actual agreement with that vendor; `0` means the vendor keeps nothing after the request. A prototype may say `"undeclared"` and receives a warning; public MVP fails on it (C18). `/privacy` and `/where-your-words-go` render retention from this field, so the prose cannot drift from the manifest. The example below says `"undeclared"` because only the operator's vendor agreement can support a number.
+- At public MVP, `legal.privacy_source` and `legal.terms_source` name repository source files, and `legal.ratified_by` and `legal.ratified_at` identify their human ratification. Their hashes belong to the privileged projection. The generated routes render those exact sources plus manifest-derived data-flow and retention tables.
 - `app.origins` names the `production` origin and the `staging` alias as separate keys, not as an ordered list; `register` registers only the one that matches its environment (section 2.4a).
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -953,10 +953,10 @@
-| C14 | Discovery, OpenAPI, runtime actions, executors, referenced schemas, and manifest actions agree. Changing an identity field, action schema, executor, data flow, or any unclassified field produces a privileged policy diff. Contract tests also prove the common error envelope, the status mapping, `Retry-After`, the private `no-store` policy, bounded cursor pagination, and the absence of internal error details. |
+| C14 | Discovery, OpenAPI, runtime actions, executors, referenced schemas, and manifest actions agree. Changing an identity field, action schema, executor, data flow, promise text or check, legal source, retention statement, or any unclassified field produces a privileged policy diff. Contract tests also prove the common error envelope, the status mapping, `Retry-After`, the private `no-store` policy, bounded cursor pagination, and the absence of internal error details. |
@@
-| C18 | Required routes exist. Public MVP also requires ratified content and a numeric `retention_days` on every data flow, and the rendered `/privacy` and `/where-your-words-go` pages must show exactly the manifest's retention values. |
+| C18 | Required routes exist. Public MVP also requires human-ratified legal source files, a numeric `retention_days` on every data flow, and rendered legal and data-flow pages whose source hashes and retention values exactly match the accepted contract. |
```

### R4: Make app database namespaces injective and immutable

- **Why:** Replacing hyphens with underscores makes `foo-bar` and `foo_bar` collide, while long IDs can collide through PostgreSQL’s identifier truncation. A tenant identifier must never ambiguously select another app’s schemas.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -250,7 +250,7 @@
 | `soma.people` | `person_id`, `auth_user_id`, `display_name`, `locale`, `timezone`, `is_test`, `created_at`, `erased_at` | The person owns the row. Apps never receive `person_id`. |
 | `soma.actors` | `actor_id`, `kind`, `name`, `substrate`, `person_id`, `created_at` | Represents humans, AI hosts, and external AIs for credit and lineage. |
-| `soma.apps` | `app_id`, `name`, `origins`, `identity_subject`, `admission`, `kit_version`, `status` | Platform-managed. Public reads expose only active metadata. There is no single “current contract” column for concurrent builds to race over. |
+| `soma.apps` | `app_id`, `db_namespace`, `name`, `origins`, `identity_subject`, `admission`, `kit_version`, `status` | Platform-managed. `app_id` and `db_namespace` are separately unique and immutable after registration. Public reads expose only active metadata. There is no single “current contract” column for concurrent builds to race over. |
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -701,6 +701,7 @@
 **Field meanings that the schema alone does not convey:**
 
+- `app.id` is an immutable lowercase identifier matching `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` with a maximum length of 40. Underscores are forbidden, so replacing hyphens with underscores is injective and leaves room below PostgreSQL's 63-byte identifier limit for the `app_` and `_api` affixes. Renaming an app requires registering a new app and an explicit migration; `register` never interprets an ID change as an update.
 - `expected_response` states how soon the human host normally replies. It is a stated expectation shown to the person, not a contractual service-level agreement.
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -1324,7 +1324,7 @@
-**Registration: schemas and roles** [2.4a, step 2]. Hyphens in the app ID become underscores (`veric-coaching` becomes `app_veric_coaching`). The platform, not either app role, owns both schemas. The migration runner may assume the owner role; deployed code never can. Registration also runs `ALTER DEFAULT PRIVILEGES FOR ROLE <app owner> REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.
+**Registration: schemas and roles** [2.4a, step 2]. The schema namespace is the validated app ID with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`). Before creating anything, registration proves that the app ID, derived namespace, repository, and Netlify site are not bound to another app. The platform, not either app role, owns both schemas. The migration runner may assume the owner role; deployed code never can. Registration also runs `ALTER DEFAULT PRIVILEGES FOR ROLE <app owner> REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.
```

### R5: Make the two-week outcome a credible security foundation

- **Why:** The current two-week cut includes a new identity provider, tenant broker, custom OAuth device flow, rotating refresh families, delegated effects, asynchronous approval, feedback delivery, two frameworks, and almost the complete adversarial suite. Calling that a two-week release creates pressure to ship shallow security work; outside-AI delegated authority is the cleanest capability to defer while preserving discovery and public use.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -1154,23 +1154,24 @@
-### 8.2 Two-week release: the secure vertical slice
+### 8.2 Two-week outcome: the security foundation
 
-The two-week outcome is one generated React reference app and one generated static fixture running against staging. Both complete the same identity, Ask/Show/Do, outside-AI, feedback, and revocation journey. The kit release itself changes no production system and no legacy-app code.
+The two-week outcome is a staging-only foundation, not a claim that app kit v1 or delegated AI authority is complete. One generated React reference app and one generated static fixture prove the same contract, pairwise identity, person-operated Ask/Show/Do, feedback, discovery, and isolation boundaries.
 
 It must include:
 
 - The `soma.app/1` JSON Schema, strict validation, canonical contract hash, and `soma-kit.lock.json`.
 - The live database isolation baseline and the same-origin Function/broker boundary from section 2.3.
 - A staging Supabase project and a staging identity broker with offered recognition, random pairwise IDs, exact redirect registration, and hardened session handling.
 - `soma-scaffold register` and `soma-scaffold migrate`, plus the vendored `sync-contract.mjs` build step, run against staging.
 - A provider-neutral Ask endpoint grounded only in declared knowledge.
 - One keyboard-accessible Show workflow using stable `data-soma` targets, served from an immutable versioned Guide path in kit mode. The Guide's root channel is not changed.
 - The typed action registry with one `observe`, one genuinely reversible, and one consequential action.
-- The server-owned approval/idempotency state machine and receipts.
-- Outside-AI discovery, device pairing, app-scoped grants, online authorization, and next-request revocation.
-- One manually witnessed outside-AI journey that names the AI and its tool.
+- The person-operated approval, idempotency, receipt, and undo state machine.
+- Outside-AI discovery through `/llms.txt` and OpenAPI, including one public, side-effect-free `observe` action that needs no person authority.
+- One manually witnessed outside-AI discovery and public-inspection journey that names the AI and its tool.
 - Minimal registered concept state and one explicitly shareable typed answer.
 - Canonical feedback submission, minimal estate event delivery, and a simulated disposition returned to the app.
 - React and static fixtures generated from the same manifest.
-- Conformance for C1–C17 (including C12a and C12b), C19a, and C20–C24, including adversarial isolation, CSRF, revocation, prompt-injection, broker-outage, and failure-injection cases. Only C18, C18a, and C19 wait for later work.
+- Conformance for the implemented foundation, including tenant isolation, CSRF, contract enforcement, prompt injection, broker outage, failure injection, accessibility, and secret leakage. C8, C9, the agent half of C11b, the agent-observe clause of C16, and the device/refresh clauses of C22 report `not_implemented` and keep the public-MVP tier red; they never report `pass`.
 - A redacted evidence bundle and a timed rehearsal with the disposable second-app fixture against staging. The rehearsal does not pre-empt the November second-app decision.
 
 Separately from the kit release, the release seat performs two week-one interim controls on the legacy apps: the separate revocable secret keys for PlayMaker and Legends (section 2.3a), and Legends' publish-directory fix from M6, which landed on 2026-10-07. Both are configuration changes, not product changes, and each reduces a live exposure that the slice does not otherwise touch.
@@ -1180,11 +1181,12 @@
 - PlayMaker or Legends migrations, pull requests, or feature flags.
 - Invitation consolidation.
 - Changelog migration.
+- Device-code pairing, refresh credentials, app-scoped AI grants, remote private reads or effects, asynchronous AI approval, and agent revocation.
 - Production Guide CDN promotion of the root channel.
 - Voice, ElevenLabs provisioning, billing, BYOK, MCP generation, Rooms, video, Accord UI, live editing, and produced films.
 - Full error-service extraction.
 - Automated global erasure, legal prose, DNS, Stripe, OAuth-provider, or domain-account work.
 - Claims that the shared production project is isolated before the production catalog audit and legacy migration pass.
@@ -1192,10 +1194,10 @@
 - Consent before cross-app disclosure.
 - Server-enforced authorization and risk.
 - Idempotency, receipts, and tested undo.
-- Next-request grant revocation.
 - Staging/production separation.
 - Ask, Show, and Do.
+- Vendor-neutral outside-AI discovery and one public read-only operation.
 - The live demonstration.
@@ -1203,14 +1205,14 @@
 | Days | Builder A | Builder B | Builder C |
 |---|---|---|---|
 | 1–2 | Contract, lock file, and fixtures | Staging project, database catalog audit, and broker boundary | Threat model, adversarial cases, and conformance skeleton |
 | 3–6 | React/static generation and stable Show bindings | Identity, sessions, pairwise IDs, and concept state | Action registry, approval state machine, receipts, and undo |
-| 7–10 | Provider-neutral Ask, versioned Guide path, and feedback round trip | AI pairing, grants, online authorization, and revocation | Isolation, CSRF, abuse, prompt-injection, and accessibility tests |
+| 7–10 | Provider-neutral Ask, versioned Guide path, and feedback round trip | Contract registration, answer sharing, and failure behavior | Isolation, CSRF, abuse, prompt-injection, and accessibility tests |
 | 11–12 | `register`, `migrate`, `sync-contract`, the staging fixture app, and integrated staging deploy | Golden Journeys and failure injection | Evidence tooling and independent security review |
 | 13 | Timed second-app rehearsal | Fix only rehearsal blockers | Re-run the adversarial suite |
 | 14 | Final staging demonstration | Evidence publication | Scope and production-readiness report |
@@
-The release is complete only when both fixtures pass the same live staging conformance command and a fresh builder completes the timed rehearsal without editing `soma-platform` or `soma-app-template`.
+The foundation is complete only when both fixtures pass the same live staging conformance profile, every deferred check is visibly reported as incomplete, and a fresh builder completes the timed rehearsal without editing `soma-platform` or `soma-app-template`.
```

### R6: Fix the `__Host-` bearer-link cookie design

- **Why:** A `__Host-` cookie must use `Path=/`; the plan later calls it path-scoped. A single fixed root cookie would also let simultaneous invitation or contact links overwrite one another.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -154,7 +154,7 @@
 The redirect URI must exactly match a registered origin. Cookie-authenticated unsafe methods require both an exact allowed `Origin` and a CSRF token bound to the session. Bearer-token agent calls do not use cookies. The transaction, callback, and cookie rules a builder needs are in Appendix A, M3.
 
-Raw bearer secrets (access tokens, refresh handles, invitation tokens, contact-thread tokens, and device codes) never appear in an HTTP request URL. An invitation or contact-thread link therefore carries its secret in the URL fragment, which the browser does not send; a minimal same-origin landing page exchanges it for a short-lived `__Host-` `HttpOnly` cookie and clears the fragment before anything else loads (Appendix A, M5). PlayMaker's current `/?t=<token>` links remain legacy until PlayMaker moves to v2 tickets.
+Raw bearer secrets (access tokens, refresh handles, invitation tokens, contact-thread tokens, and device codes) never appear in an HTTP request URL. An invitation or contact-thread link therefore carries its secret in the URL fragment, which the browser does not send; a minimal same-origin landing page exchanges it for a transaction-specific `__Host-` `HttpOnly` cookie with `Path=/`, then clears the fragment before anything else loads (Appendix A, M5). A non-secret public selector identifies the transaction, so simultaneous links use different cookies and cannot overwrite one another. PlayMaker's current `/?t=<token>` links remain legacy until PlayMaker moves to v2 tickets.
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -1384,7 +1384,7 @@
-**Bearer links** [2.2]. An invitation or contact-thread link has the form `https://<origin>/<route>#<token>`. The landing route loads no Guide, analytics, or third-party resource. Its only script posts the fragment to a same-origin Function, which sets a short-lived, path-scoped `__Host-` `HttpOnly` cookie; the script then removes the fragment with `history.replaceState` and continues. An invitation then starts authorization with the opaque pending-invitation handle from that cookie (section 2.2, step 5). The landing and exchange responses send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The callback route's immediate 303 (Appendix A, M3) removes the authorization code before any app page loads.
+**Bearer links** [2.2]. An invitation or contact-thread link has the form `https://<origin>/<route>#<token>`. The landing route loads no Guide, analytics, or third-party resource. Its only script posts the fragment to a same-origin Function. The Function creates a random non-secret selector, stores a keyed hash of the exchanged token against that selector, and sets a transaction-specific cookie named `__Host-soma-link-<selector>` with `Path=/`, no `Domain`, `Secure`, `HttpOnly`, and `SameSite=Lax`. It returns only the selector. The script removes the fragment with `history.replaceState` and continues using that selector; authority remains in the unreadable cookie value. The Function consumes and clears the cookie when it establishes the pending invitation or contact-thread session. The landing and exchange responses send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
```

### R7: Stop calling an unbound bearer ticket “personal”

- **Why:** The v2 ticket has an invitee name but no binding to an intended identity. The first person holding the link can redeem it, so calling it personal or greeting the redeemer as the named invitee would assert more than the system knows.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -40,7 +40,7 @@
-| Invitations | A personal or shared invitation admits the person without creating another identity system. | Relationships precede accounts. | `packages/soma-tickets`; `packages/soma-onboard`; three standards folders; PlayMaker’s flow. | Make `@soma/tickets` canonical (section 1.2). Add personal and shared presentation, QR, channels, abuse controls, and membership creation. |
+| Invitations | A single-use or reusable invitation admits its bearer without creating another identity system. | Relationships precede accounts. | `packages/soma-tickets`; `packages/soma-onboard`; three standards folders; PlayMaker’s flow. | Make `@soma/tickets` canonical (section 1.2). Add honest single-use and reusable presentation, QR, channels, abuse controls, and membership creation. An invitee name is a salutation supplied by the inviter, never proof of the redeemer's identity. |
@@ -60,7 +60,7 @@
-| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation API, with two storage generations. ... A personal ticket admits one person once. A shared ticket admits many people until it expires or reaches `max_redemptions`. ... |
+| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation API, with two storage generations. ... A `single_use` ticket admits its first bearer once. A `reusable` ticket admits many people until it expires or reaches `max_redemptions`. Neither kind proves that its bearer is the person named by the inviter; a future targeted-ticket type must bind an existing `person_id` explicitly. ... |
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -263,7 +263,7 @@
-| `soma.tickets` | `ticket_id`, `app_id`, `kind`, `token_hash`, `inviter_person_id`, `inviter_name`, `invitee_name`, `quote_line`, `channel`, `max_redemptions`, `expires_at`, `revoked_at`, `created_at` | Broker-only v2 invitation storage (section 1.2). The raw token is returned once and never stored. The app never receives `inviter_person_id`. `channel` records how the inviter shared the link; SOMA does not send it (section 2.3b). |
+| `soma.tickets` | `ticket_id`, `app_id`, `kind` (`single_use` or `reusable`), `token_hash`, `inviter_person_id`, `inviter_name`, `invitee_name`, `quote_line`, `channel`, `max_redemptions`, `expires_at`, `revoked_at`, `created_at` | Broker-only v2 invitation storage (section 1.2). The raw token is returned once and never stored. `invitee_name` is optional display copy, not an identity binding. The app never receives `inviter_person_id`. `channel` records how the inviter shared the link; SOMA does not send it (section 2.3b). |
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -1377,8 +1377,8 @@
-  - `soma.ticket_lookup_v2(p_token_hash)` returns only status, kind (`personal` or `shared`), invitee name, inviter name, and quote line.
+  - `soma.ticket_lookup_v2(p_token_hash)` returns only status, kind (`single_use` or `reusable`), optional salutation, inviter name, and quote line. Its presentation says explicitly that possession of the link, not the displayed name, controls admission.
   - `soma.ticket_admit_v2(p_token_hash, p_guest_session_hash)` lets a person who has not signed in enter the invited scope as a guest, as `ticket_use` does today.
-  - `soma.ticket_redeem_v2(p_token_hash)` requires a signed-in principal and, in one transaction, records the redemption and creates or upgrades that person's `soma.memberships` row.
+  - `soma.ticket_redeem_v2(p_token_hash)` requires a signed-in principal and, in one transaction, atomically claims a single-use ticket or increments a reusable ticket below its limit, records the redemption, and creates or upgrades that person's `soma.memberships` row.
```

### R8: Add actual global export and erasure surfaces

- **Why:** The capability list promises global export and erasure, and section 2.5a defines their jobs, but the route contract exposes only per-app export and forget. Without identity-origin routes, the promised platform-level control has no callable owner.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -567,12 +567,23 @@
 **Pairing and tokens** live on the identity origin, not on the app:
 
 ```text
 GET  https://id.<SOMA_APEX>/.well-known/oauth-authorization-server
 POST https://id.<SOMA_APEX>/agents/device-code      (RFC 8628 device authorization)
 POST https://id.<SOMA_APEX>/agents/token            (device_code and refresh_token grants)
 GET  https://id.<SOMA_APEX>/.well-known/jwks.json
 ```
 
+**Global data control** also lives on the identity origin and is absent from app OpenAPI documents:
+
+```text
+POST https://id.<SOMA_APEX>/me/exports
+GET  https://id.<SOMA_APEX>/me/exports/:id
+POST https://id.<SOMA_APEX>/me/erasures
+GET  https://id.<SOMA_APEX>/me/erasures/:id
+```
+
+Creating either job requires the identity-origin session and CSRF token. Creating a global erasure additionally requires recent authentication and a confirmation that names the memberships, grants, and sessions that will be revoked immediately. Both creation routes return `202` and a job ID; status reports every target as pending, complete, failed, or lawfully retained. A target failure can never produce a completed job.
+
 The app's `/.well-known/soma-app.json` names these URLs, so the AI still starts from the app's own URL. The broker publishes RFC 8414 metadata so that the v1.1 MCP adapter can reuse the same authorization server instead of adding a second auth design.
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -958,7 +958,7 @@
-| C18a | Public MVP: every declared data store participates in export and erasure. These all fail: cross-person file access, an unsafe filename, MIME confusion, an oversize upload, a permanent URL, an omitted erasure target, a request reported complete while a target failure is injected, a subject handle deleted before its target completes, an old person or agent handle reused after rejoin, and erased data returning after a restore. |
+| C18a | Public MVP: every declared data store participates in per-app and identity-origin global export and erasure. Global creation requires the identity session and CSRF protection; erasure also requires recent authentication. These all fail: cross-person file access, an unsafe filename, MIME confusion, an oversize upload, a permanent URL, an omitted erasure target, a request reported complete while a target failure is injected, a subject handle deleted before its target completes, an old person or agent handle reused after rejoin, and erased data returning after a restore. |
```

### R9: Make “grounded” an honest, testable claim

- **Why:** Validating that citation IDs came from retrieval proves provenance, not that the model’s claims follow from those passages. The present wording says the server computes factual support that it cannot actually establish.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -493,9 +493,9 @@
 export interface AskResponse {
   answer: string;
-  grounded: boolean;        // computed by the server, never taken from model output
+  grounded: boolean;        // retrieval-backed with complete valid citation coverage; not a truth guarantee
   degraded?: boolean;       // true when no provider was called (broker outage or spent budget)
   citations: Array<{ path: string; heading?: string }>; // every path is in guide.ask.knowledge
@@ -508,12 +508,12 @@
 The server takes `app_id` from its own installation, never from the request. It loads knowledge only from the files listed in `guide.ask.knowledge`, bundled at build time and covered by the contract hash, and never accepts knowledge from the request.
 
-Retrieval gives each source passage an opaque ID before any provider call. The provider may cite only those IDs. The server maps valid IDs back to declared paths and headings and discards unknown ones. `grounded` is true only when retrieval found at least one qualifying passage and every citation in the answer resolves to that retrieved set. Otherwise the endpoint returns `grounded: false`, no unsupported factual answer, and the human host's route.
+Retrieval gives each source passage an opaque ID before any provider call. The provider may cite only those IDs. The server maps valid IDs back to declared paths and headings and discards unknown ones. `grounded` is true only when retrieval found at least one qualifying passage, every non-procedural paragraph cites at least one retrieved passage, and every cited ID resolves to that set. This proves citation provenance and coverage; it does not prove that a model interpreted the source correctly, so the UI labels the result “from the app’s knowledge,” never “verified” or “true.”
 
@@
-When `grounded` is false, the answer says that the app's knowledge does not cover the question, and it offers the human host's escalation route.
+When citation coverage cannot be established, the endpoint returns `grounded: false`, gives no synthesized factual answer, lists any possibly relevant source headings, and offers the human host's escalation route.
```

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -960,7 +960,7 @@
-| C19a | ... Fixtures in which the model invents citation IDs or paths, or claims `grounded: true`, yield no grounded citation. |
+| C19a | ... Fixtures in which the model invents citation IDs or paths, omits citation coverage for a factual paragraph, or claims `grounded: true` yield `grounded: false`. The rendered UI never describes a retrieval-backed answer as verified or guaranteed correct. |
```

### R10: Put the timed fixture before legacy migrations

- **Why:** Section 5 says the disposable rehearsal happens immediately, but the milestone table postpones it until M10, after Legends and three PlayMaker phases. The kit should prove that a fresh app can adopt it before legacy compatibility work shapes the architecture.

- **Change:**

```diff
--- a/10-plan.md
+++ b/10-plan.md
@@ -1001,11 +1001,12 @@
 | M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove every shared credential and every out-of-schema migration from the generator. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. ... |
 | M4: AI door | Generate discovery and OpenAPI from the manifest. Add device-code pairing, app grants, revocation, and C8–C9. | A stranger AI receives only the URL and completes an allowed inspection. A revoked token then fails. |
 | M5: Consolidate plumbing | Expand `@soma/tickets`. Make `@soma/feedback` canonical. Add static adapters, versioned Guide assets, Guide kit mode (section 2.8), meter UI, and transactional estate-event delivery. | Package tests pass. A generated React app and generated static fixture use the same contracts. A Guide test proves that kit mode persists only the boolean device marker and declared UI preferences, captures no field values or URL queries, sends page context only when declared, and records `shown` only on workflow completion. |
+| M5a: Fresh-app architecture gate | Run section 5 with the disposable `soma-kit-second-app-fixture` before beginning either legacy migration. Fix kit defects and restart the timer until it passes without editing the kit during the run. | A fresh builder completes the local build, registered branch deploy, Golden Journey, and evidence bundle within the targets. Failure blocks M6–M9 rather than being explained as legacy-app complexity. |
 | M6: Legends preview | First stop Legends serving its repository root (landed 2026-10-07; Appendix A, M6). Then generate `legends-membership-site/soma-app.json`. Vendor static identity and action adapters. Pin the Guide. Adapt its changelog and concept state behind flags. | C24 passes on the live site. Existing anonymous, member, admin, Guide, and degraded-CDN journeys pass on the branch deploy. |
@@
-| M10: Rehearsal, then second-app acceptance | First run the timed build with the disposable kit fixture. After the November product choice, repeat it in the chosen product's repository. Neither run edits `soma-platform` or `soma-app-template`. | The fixture run proves repeatability. Only the chosen product passing section 5 on its registered live Netlify branch deploy earns the claim that a second SOMA app stood up on the kit. |
+| M10: Chosen second-app acceptance | After the November product choice, run section 5 in the chosen product's repository. The run edits neither `soma-platform` nor `soma-app-template`. | Only the chosen product passing on its registered live Netlify branch deploy earns the claim that a second SOMA app stood up on the kit. |
```