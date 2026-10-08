# Revisions, round 9, GPT-5

### R1: Keep v2 invitations out of the legacy public table

- **Why:** `public.tickets` cannot safely hold pairwise-identity tickets as designed: its required `inviter_id` references `auth.users`, its RLS is built around `auth.uid()`, and its existing lookup/use functions are executable by `anon`. Preserve the package API, but put broker-era tickets behind the broker in the `soma` schema.

- **Change:**

```diff
@@
-| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation implementation. Rows stay in `public.tickets`, keyed by its `app` column, because PlayMaker's live tickets are there. Four new broker-only functions in the `soma` schema store only a keyed token hash, take the app from the installation credential, and create or upgrade the membership on redemption (section 2.2, admission). A personal ticket admits one person once. A shared ticket admits many people until it expires or reaches `max_redemptions`. Restrict the existing `ticket_create`, `ticket_lookup`, and `ticket_use` to `p_app = 'playmaker'` until PlayMaker moves to v2, then retire them, because today they admit any PlayMaker studio member whatever `p_app` says, run for `anon` on any app, and store the token in plaintext. Function signatures and columns: Appendix A, M5. |
+| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation API, but separate its storage generations. Existing PlayMaker tickets remain in `public.tickets` until migration. Broker-era tickets live in `soma.tickets` and `soma.ticket_redemptions`, use pairwise membership through broker-only functions, and store only keyed token hashes. A personal ticket admits one person once. A shared ticket admits many people until it expires or reaches `max_redemptions`. Restrict the legacy `ticket_create`, `ticket_lookup`, and `ticket_use` functions to `p_app = 'playmaker'`, then retire them after PlayMaker moves to v2. Function signatures and columns: Appendix A, M5. |
@@
-Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tables remain in place until their package owners can migrate them without breaking consumers.
+Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tables remain in place as legacy PlayMaker storage until their package owners can migrate them without breaking consumers. New apps never write broker-era records into those legacy tables.
@@
 | `soma.memberships` | `person_id`, `app_id`, `app_person_id`, `role`, `trust`, `joined_at`, `last_seen_at`, `left_at` | The person reads their rows. App admins use a narrow broker call. |
+| `soma.tickets` | `ticket_id`, `app_id`, `kind`, `token_hash`, `inviter_person_id`, `invitee_name`, `invitee_email`, `quote_line`, `channel`, `max_redemptions`, `expires_at`, `revoked_at`, `created_at` | Broker-only v2 invitation storage. The app receives no global person identifier. Raw tokens are returned once and never stored. |
+| `soma.ticket_redemptions` | `ticket_id`, `person_id`, `guest_session_hash`, `redeemed_at` | Broker-only. Exactly one of `person_id` and `guest_session_hash` is present, with uniqueness per ticket and subject. |
 | `soma.consents` | `person_id`, `app_id`, `fields`, `purpose`, `policy_version`, `granted_at`, `revoked_at` | The person reads and revokes. The broker enforces disclosure. |
@@
 **Tickets v2** [1.2]
 
-- Add `kind`, `max_redemptions`, and `token_hash` to `public.tickets`. `token` becomes nullable. A v2 row stores only the keyed hash; old rows keep their plaintext token until they expire.
-- Add four v2 functions in the platform-owned `soma` schema, executable only by `soma_broker`. Each takes the app from the `app_id` the broker derives from the installation credential.
+- Leave `public.tickets` structurally unchanged except for the restrictions needed to confine its existing functions to PlayMaker. It is legacy storage and receives no v2 rows.
+- Create `soma.tickets` and `soma.ticket_redemptions`, accessible only through four platform-owned functions executable by `soma_broker`. Each takes the app from the `app_id` the broker derives from the installation credential. The broker computes the keyed token hash before calling the database; the hashing key is never stored in Postgres.
   - `soma.ticket_create_v2` admits the inviter by `soma.memberships` role under that app's invitation policy. It takes the inviter name only from the display name the inviter consented to share with that app, never from an email address.
-  - `soma.ticket_lookup_v2(p_token)` returns only status, kind (`personal` or `shared`), invitee name, inviter name, and quote line.
-  - `soma.ticket_admit_v2(p_token, p_guest_session)` lets a person who has not signed in enter the invited scope as a guest, as `ticket_use` does today.
-  - `soma.ticket_redeem_v2(p_token)` requires a signed-in principal and, in one transaction, records the redemption and creates or upgrades that person's `soma.memberships` row.
-- `public.ticket_redemptions` records each admission by either `person_id` or a keyed guest-session hash, with uniqueness per ticket and subject, so anonymous admissions count without storing the bearer session.
-- Every app that issues tickets lists `public.tickets` and `public.ticket_redemptions` as a platform `data_stores` entry, so export and erasure reach the invitee names and emails held there.
+  - `soma.ticket_lookup_v2(p_token_hash)` returns only status, kind (`personal` or `shared`), invitee name, inviter name, and quote line.
+  - `soma.ticket_admit_v2(p_token_hash, p_guest_session_hash)` lets a person who has not signed in enter the invited scope as a guest.
+  - `soma.ticket_redeem_v2(p_token_hash)` requires a signed-in principal and, in one transaction, records the redemption and creates or upgrades that person's `soma.memberships` row.
+- Every app that issues tickets lists the platform ticket store in `data_stores`, so export and erasure reach names and addresses held for its invitations without exposing another app's records.
```

### R2: Make contract policy classification fail closed

- **Why:** The enumerated privileged projection omits security-relevant fields, including requested identity fields, action schemas, and the binding between an action and its executor. A build credential could therefore broaden disclosed data or accepted action inputs while still matching an approved policy.

- **Change:**

```diff
@@
 export interface SomaAction<I, O> {
@@
   effects: string[];
   concept?: { id: string; version: string };
+  executor?:
+    | { kind: "rpc"; name: string }
+    | { kind: "external"; adapter: string; operation: string };
   effectTarget?: "database" | "external"; // required when kind is "effect"
@@
 }
 ```
 
+Every `observe` and `effect` action declares an `executor`; a `view` action declares none. An RPC executor must name a function registered by an accepted migration checksum. An external executor must name a closed-registry adapter and operation whose provider appears in `data_flows`. The broker authorizes the executor binding from the accepted contract, not from a caller-supplied name.
+
 The server enforces the risk gate.
@@
-- The privileged projection contains: origins; identity mode, subject, and admission; hosts, escalation routes, and expected responses; concepts and question definitions, including portability; each action's ID, version, kind, risk, scopes, required role, surfaces, effects, effect target, timeout, recovery rule, cool-off, and UI exception; AI-visitor limits; promises; notifications; data flows, data stores, and retention; legal operator; dependency fallbacks; and provisioning requests.
+- Policy classification is fail closed. The v1 JSON Schema marks the small set of presentation-only fields explicitly; every other manifest field and referenced-file hash is part of the privileged projection by default. Presentation-only fields may change wording or visual presentation but may not affect identity disclosure, admission, authorization, data access, storage, retention, network destinations, provider use, or execution.
+- The privileged projection therefore includes, at minimum: origins; every requested identity field and its reason; admission; hosts and escalation; concept and question definitions; answer portability and destinations; action IDs, versions, input and output schema hashes, executor bindings, reads, scopes, roles, surfaces, effects, risks, recovery, and UI exceptions; AI-visitor limits; notifications; data flows; data stores; retention; legal operator; dependency fallbacks; and provisioning requests. A schema revision that introduces an unclassified field fails validation rather than treating it as presentation.
@@
-| C4 | Every action has schemas, scopes, kind, effects, and, for effect actions, risk and effect target. Every external-effect action declares a timeout and a recovery rule, and every irreversible action declares a cool-off. A database-effect action never leaves a receipt in `running` after its RPC returns. |
+| C4 | Every action has schemas, scopes, kind, effects, and the executor required for its kind. Every executor is bound to the accepted contract: an RPC names an applied registered migration, and an external adapter names a declared provider and operation. Effect actions declare risk and effect target; external effects declare timeout and recovery; irreversible actions declare a cool-off. A database-effect action never leaves a receipt in `running` after its RPC returns. |
@@
-| C14 | Discovery, OpenAPI, runtime actions, and manifest actions agree. Contract tests also prove the common error envelope, the status mapping, `Retry-After`, the private `no-store` policy, bounded cursor pagination, and the absence of internal error details. |
+| C14 | Discovery, OpenAPI, runtime actions, executor bindings, referenced schemas, and manifest actions agree. Mutating an identity field, action schema, executor, data flow, or other unclassified contract field must produce a privileged policy diff. Contract tests also prove the common error envelope, the status mapping, `Retry-After`, the private `no-store` policy, bounded cursor pagination, and the absence of internal error details. |
```

### R3: Gate private reads by the in-app AI host

- **Why:** The plan denies the AI host ambient write authority but lets it run any private `observe` action in the person’s session. Prompt injection or model error could therefore read private material and send it to the model provider without a person gesture.

- **Change:**

```diff
@@
 export interface SomaAction<I, O> {
@@
   kind: "view" | "observe" | "effect";
   risk?: Exclude<SomaRisk, "observe">; // required when kind is "effect"
+  reads?: Array<{
+    dataClass: string;
+    exposure: "public" | "principal-private";
+  }>; // required when kind is "observe"
@@
-**The in-app AI host** has no ambient effect grant. It may explain, run `observe` actions inside the person's current session, prepare an action preview, or offer a declared Do control. Selecting that Do control is a person gesture carrying the person's session and CSRF token. It creates a one-request authorization bound to the current person session, the action ID and version, the canonical input hash, the target resource version, the AI host's actor, and a short expiry. It may authorize at most a `reversible` action. Model output, retrieved knowledge, page context, and action output can never create this authorization. An AI host that needs asynchronous or standing authority must receive the same named, scoped, expiring grant as an outside AI. Every receipt records the AI host's `actor_id` and the person as principal.
+**The in-app AI host** has no ambient authority over private data or effects. It may explain, run an `observe` action whose declared reads are all public, prepare an action preview, or offer a declared Show, Look, or Do control. A principal-private `observe` action requires a fresh person gesture bound to the exact action, input hash, data classes, AI-host actor, current session, and short expiry. A Do gesture creates the equivalent one-request authorization for at most a `reversible` effect. Model output, retrieved knowledge, page context, and action output can never create either authorization. An AI host that needs asynchronous or standing authority must receive the same named, scoped, expiring grant as an outside AI. Every AI-performed private read writes the metadata-only receipt described below.
@@
-| `observe` | Run immediately. | The in-app host runs inside the person's current session; a paired AI needs the matching read scope. Either writes a metadata-only receipt. |
+| `observe` | Run immediately for the person's own UI request. | A paired AI needs the matching read scope. The in-app host may run public reads directly, but a principal-private read requires the person's fresh Look gesture for the exact prepared request. Either AI path writes a metadata-only receipt. |
@@
-| C8a | The in-app AI host cannot execute an effect from model output, page context, retrieved text, or an old Do gesture. A reversible effect requires a fresh one-request authorization bound to the exact prepared request; asynchronous authority requires a normal named grant. |
+| C8a | The in-app AI host cannot read principal-private data or execute an effect from model output, page context, retrieved text, or an old gesture. A private observe requires a fresh Look authorization, and a reversible effect requires a fresh Do authorization, each bound to the exact prepared request and data or effect declaration. Asynchronous authority requires a normal named grant. |
```

### R4: Preserve the erasure handle until erasure succeeds

- **Why:** The plan deletes the pairwise mapping before erasing app data, removing the handle needed to locate that data. It also preserves `app_agent_id` across per-app forget, allowing a rejoined person and AI to be correlated with the supposedly forgotten membership.

- **Change:**

```diff
@@
-| `soma.agent_app_handles` | `agent_id`, `app_id`, `app_agent_id`, `created_at` | Broker-only. Created on the first grant for that app. `app_agent_id` is random, so it cannot be derived from `agent_id`. Per-app forget and grant revocation do not delete it; erasure of the principal does. |
+| `soma.agent_app_handles` | `agent_id`, `app_id`, `app_agent_id`, `created_at` | Broker-only. Created on the first grant for that app. `app_agent_id` is random, so it cannot be derived from `agent_id`. Grant revocation alone preserves it, but completed per-app forget deletes it so a later rejoin cannot be correlated by the app. |
@@
-| `soma.erasure_targets` | `request_id`, `target_kind`, `app_id`, `store_id`, `status`, `attempts`, `next_attempt_at`, `completed_at`, `exception_reason`, `receipt` | One idempotent target per app database, object store, notification adapter, or declared provider (section 2.5a). |
+| `soma.erasure_targets` | `request_id`, `target_kind`, `app_id`, `store_id`, `subject_handle`, `status`, `attempts`, `next_attempt_at`, `completed_at`, `exception_reason`, `receipt` | One idempotent target per app database, object store, notification adapter, or declared provider (section 2.5a). `subject_handle` is broker-only and retains the app-local identifier until that target completes. |
@@
-Revoking answer consent immediately deletes or tombstones the shared projection, which hides it from every destination, without deleting the source app's lawful private copy. Per-app forget revokes sessions, grants, consent, and the pairwise mapping before erasing app data. Rejoining a pairwise app creates a new random `app_person_id`; it does not revive the old mapping. A legacy-global app cannot issue a new identifier, because its `app_person_id` is the `auth_user_id`; for those apps, forget erases the app data and the membership only.
+Revoking answer consent immediately deletes or tombstones the shared projection, which hides it from every destination, without deleting the source app's lawful private copy. A destination may not persist a shared answer outside the broker response unless the person separately consents to that destination store; C11a tests this.
+
+Per-app forget atomically revokes sessions, grants, and consent; marks the membership unusable; and creates erasure targets carrying the old app-local person and agent handles. The mappings remain broker-only until every target completes, because the erasure workers need them to locate the data. Completion then deletes the membership mapping, `agent_app_handles`, grant handles, and target subject handles. Rejoining at any point creates a new random `app_person_id` and new `app_agent_id` values and never cancels or reconnects the old erasure job. A legacy-global app cannot issue a new identifier, because its `app_person_id` is the `auth_user_id`; for those apps, forget erases the app data and membership but keeps the erasure target's lookup handle until completion.
@@
-| C18a | Public MVP: every declared data store participates in export and erasure. These all fail: cross-person file access, an unsafe filename, MIME confusion, an oversize upload, a permanent URL, an omitted erasure target, a request reported complete while a target failure is injected, and erased data returning after a restore. |
+| C18a | Public MVP: every declared data store participates in export and erasure. These all fail: cross-person file access, an unsafe filename, MIME confusion, an oversize upload, a permanent URL, an omitted erasure target, a request reported complete while a target failure is injected, deletion of a subject handle before its target completes, reuse of old person or agent handles after rejoin, persistence of a shared answer without separate consent, and erased data returning after a restore. |
```

### R5: Make estate delivery a recoverable outbox

- **Why:** `claimed_at` is not a delivery protocol: if the Mac importer claims a row and dies before creating the board item, the event is stranded. The plan already has an outbox; it should name it accurately and give it leases, acknowledgements, retries, and an off-Mac stale-backlog alarm.

- **Change:**

```diff
@@
-| Central feedback queue or per-app queues | Keep the per-app queue canonical. The broker writes the app record and a minimal `soma.estate_inbox` event in one database transaction. | Apps retain their domain context. Per-app schemas and the `soma` schema live in the same database, so one transaction delivers every item without an outbox. |
+| Central feedback queue or per-app queues | Keep the per-app queue canonical. The broker writes the app record and a minimal `soma.estate_inbox` event in one database transaction. | `soma.estate_inbox` is the transactional outbox: the transaction makes delivery durable, while a separate leased importer performs the external board write and acknowledges it. |
@@
-| `soma.estate_inbox` | `event_id`, `app_id`, `app_record_id`, `kind`, `consent_safe_summary`, `created_at`, `claimed_at` | Written only by the broker, in the same transaction as the app's local record. `(app_id, kind, app_record_id)` is unique, so a retried submission cannot create a second event. It contains no attachments, transcripts, raw diagnostics, contact fields, or full report body. The Mac-side board importer reads and claims rows, so apps never depend on the Mac being up. |
+| `soma.estate_inbox` | `event_id`, `app_id`, `app_record_id`, `kind`, `consent_safe_summary`, `created_at`, `attempts`, `next_attempt_at`, `lease_owner`, `lease_expires_at`, `delivered_at`, `external_ref`, `last_error_code` | Written only by the broker, in the same transaction as the app's local record. `(app_id, kind, app_record_id)` is unique. The importer leases a row, writes the external item with `event_id` as its stable idempotency key, and sets `delivered_at` only after that write is acknowledged. A crash merely lets the lease expire. The row contains no attachments, transcripts, raw diagnostics, contact fields, or full report body. |
@@
-**One transaction across two schemas.** The broker writes a per-app record and its `soma` counterpart (`soma.estate_inbox` for feedback, contact messages, and crash alerts; `soma.receipt_index` for receipts) in one database transaction that the broker opens itself.
+**One transaction across two schemas.** The broker writes a per-app record and its `soma` counterpart (`soma.estate_inbox` for feedback, contact messages, and crash alerts; `soma.receipt_index` for receipts) in one database transaction that the broker opens itself.
@@
 A legacy-global app that commits its feedback record outside the broker (PlayMaker and Legends until M11) files the event through the same broker call after its own commit and retries until the broker acknowledges; the unique `(app_id, kind, app_record_id)` makes the retry safe.
+
+External delivery is not part of that transaction. The importer acquires rows with a bounded lease, retries with backoff, and uses `event_id` as the destination's deduplication key. A scheduled monitor outside the Mac alerts the steward when the oldest undelivered row exceeds the declared threshold, so a dead Mac cannot silently consume the human host's response-time promise.
@@
-| C15 | Feedback creates both the app record and a minimal `soma.estate_inbox` event in one transaction; an injected failure leaves neither row. A disposition update returns to the same app record. |
+| C15 | Feedback creates both the app record and a minimal `soma.estate_inbox` event in one transaction; an injected failure leaves neither row. Killing the importer after lease acquisition and after the external write proves that lease expiry and the stable destination key recover without loss or duplication. A disposition update returns to the same app record, and an overdue outbox row triggers the off-Mac alarm. |
```

### R6: Separate staging and production origins structurally

- **Why:** A flat two-origin list invites a production broker to accept the preview origin, or a staging credential to be used from production. Environment must be part of the registered origin and contract identity, not inferred from array order or deployment context.

- **Change:**

```diff
@@
-| `soma.apps` | `app_id`, `name`, `origins`, `identity_subject`, `admission`, `kit_version`, `status` | Platform-managed. Public reads expose only active metadata. There is no single “current contract” column for concurrent builds to race over. |
+| `soma.apps` | `app_id`, `name`, `identity_subject`, `admission`, `kit_version`, `status` | Platform-managed. Public reads expose only active metadata. There is no single “current contract” column for concurrent builds to race over. |
+| `soma.app_origins` | `app_id`, `environment` (`staging` or `production`), `origin`, `purpose`, `created_at`, `revoked_at` | Platform-managed exact origins. A broker accepts only rows for its own environment; production never accepts the fixed preview alias. |
@@
-| `soma.app_contracts` | `app_id`, `contract_sha256`, `release_sha`, `deploy_context`, `policy_version`, `kit_version`, `lock_sha256`, `synced_at`, `retired_at`, `retirement_reason` | Written by `sync-contract` through the broker; one row per accepted release contract (section 2.4a). Read by the broker on every call; a lookup may be cached for at most 60 seconds. |
+| `soma.app_contracts` | `app_id`, `environment`, `contract_sha256`, `release_sha`, `deploy_context`, `policy_version`, `kit_version`, `lock_sha256`, `synced_at`, `retired_at`, `retirement_reason` | Written by `sync-contract` through that environment's broker; one row per accepted release contract (section 2.4a). A staging contract is never valid in production. |
@@
-5. Registers exactly two redirect origins at prototype tier: the production origin and one fixed branch-deploy alias, `https://preview--<site>.netlify.app`, registered only with the staging broker. Per-deploy URLs are not registrable, and no wildcard is ever accepted.
+5. Registers origins separately by environment. `register --environment staging` registers only the fixed `https://preview--<site>.netlify.app` alias with the staging broker. `register --environment production` registers only the production origin with the production broker and is unavailable at prototype tier. Per-deploy URLs are not registrable, no wildcard is accepted, and a credential or contract from one environment is rejected by the other.
@@
-- `app.origins` lists the production origin and the fixed preview alias; `register` registers exactly these two (section 2.4a).
+- `app.origins` labels the production and staging origins explicitly. Registration selects exactly one by environment (section 2.4a).
@@
-    "origins": [
-      "https://veric-coaching.netlify.app",
-      "https://preview--veric-coaching.netlify.app"
-    ],
+    "origins": {
+      "production": "https://veric-coaching.netlify.app",
+      "staging": "https://preview--veric-coaching.netlify.app"
+    },
@@
-| C22 | Authorization rejects unknown, expired, replayed, and concurrently reused state, code, nonce, PKCE, issuer, audience, callback-origin, device-code, refresh, CSRF, and cross-origin values. A failed exchange creates no membership. Refresh reuse revokes the whole family. No secret or bearer value appears in logs, URLs, analytics, errors, or evidence. |
+| C22 | Authorization rejects unknown, expired, replayed, and concurrently reused state, code, nonce, PKCE, issuer, audience, callback-origin, device-code, refresh, CSRF, and cross-origin values. A staging origin, credential, code, or contract is rejected by production and vice versa. A failed exchange creates no membership. Refresh reuse revokes the whole family. No secret or bearer value appears in logs, analytics, errors, or evidence. |
```

### R7: Define safe handling for invitation and contact bearer links

- **Why:** The plan says invitation tokens are absent from URLs, yet invitations and anonymous contact threads necessarily arrive as links. Raw bearer secrets in query strings or paths leak through access logs, browser history, analytics, and referrers.

- **Change:**

```diff
@@
-5. The request includes `app_id`, an allowlisted redirect URI, a PKCE challenge, a nonce, and an optional invitation ticket handle.
+5. The request includes `app_id`, an allowlisted redirect URI, a PKCE challenge, a nonce, and an optional opaque pending-invitation handle. It never includes the invitation token. An invitation link places its raw secret in the URL fragment; a script-free, analytics-free landing page immediately posts it to a same-origin Function, receives a short-lived `__Host-` `HttpOnly` pending-invitation cookie, removes the fragment with `history.replaceState`, and only then starts authorization.
@@
-Access tokens, authorization codes, refresh handles, invitation tokens, device codes, and approval identifiers are redacted from logs, analytics, error reports, referrers, and evidence screenshots.
+Raw bearer secrets—including access tokens, refresh handles, invitation tokens, contact-thread tokens, and device codes—never appear in an HTTP request URL. Authorization codes and opaque approval locators may transit a callback or approval URL, but they carry no authority by themselves, expire quickly, receive `no-store` and `no-referrer`, and are redacted from access logs, analytics, error reports, and evidence. Callback code and state are removed by the server's immediate 303 before any app page or third-party resource loads.
@@
-**Contact.** `POST /api/soma/v1/contact` accepts a signed-in person or an anonymous visitor. It writes a `feedback_items` row with `kind = 'contact'`, a `soma.estate_inbox` event, and an idempotent notification job in one broker transaction (section 2.4); the notification worker retries delivery to the human host's private registered address. A signed-in person sees the human host's reply at `/contact` in the app. An anonymous visitor receives a thread link once (Appendix A, M5). The host answers through the registered `contact.reply` action, which writes to the same thread.
+**Contact.** `POST /api/soma/v1/contact` accepts a signed-in person or an anonymous visitor. It writes a `feedback_items` row with `kind = 'contact'`, a `soma.estate_inbox` event, and an idempotent notification job in one broker transaction (section 2.4); the notification worker retries delivery to the human host's private registered address. A signed-in person sees the human host's reply at `/contact` in the app. An anonymous visitor receives a thread link once (Appendix A, M5). The link uses the same fragment-to-`HttpOnly`-cookie exchange as invitations; the raw thread token is never sent in a request URL. The host answers through the registered `contact.reply` action, which writes to the same thread.
@@
-**Contact threads** [2.7]. An anonymous visitor receives, once, on the confirmation screen, a thread link carrying an unguessable token, and may add an email address for a reply notice. That address is a declared data flow and is erased with the thread. The host answers from the app's admin feedback queue. A thread token expires 90 days after the last message and is redacted like other bearer values (section 2.2).
+**Contact threads** [2.7]. An anonymous visitor receives, once, on the confirmation screen, a link whose fragment carries an unguessable token. The minimal landing page exchanges it for a scoped `__Host-` `HttpOnly` cookie, clears the fragment, and loads no Guide, analytics, or third-party resource before that exchange. The visitor may add an email address for a reply notice; that address is a declared data flow and is erased with the thread. The host answers from the app's admin feedback queue. The thread credential expires 90 days after the last message and follows the bearer-secret rules in section 2.2.
```

### R8: Remove email allowlists from first-owner bootstrap

- **Why:** `ADMIN_EMAILS` contradicts pairwise identity, encourages long-lived privileged environment configuration, and requires the app to reason about a global identifier it should not receive. First ownership should be a one-time platform operation.

- **Change:**

```diff
@@
-| Admin roles and allowlists | Replace with app membership roles. Keep `ADMIN_EMAILS` only as a time-limited first-owner bootstrap. |
+| Admin roles and allowlists | Replace with app membership roles. Pairwise apps do not receive `ADMIN_EMAILS`. `register` creates a short-lived first-owner claim that the platform steward binds to a person authenticated on the identity origin; after consumption, no bootstrap path remains. |
@@
-Membership roles are `visitor`, `member`, `editor`, `owner`, and `admin`. Changing a member's role is a registered action. Raising a role to `owner` or `admin` is `consequential` and requires an existing `owner`. Lowering a role is `reversible`. The first owner comes from the time-limited `ADMIN_EMAILS` bootstrap (section 1.2).
+Membership roles are `visitor`, `member`, `editor`, `owner`, and `admin`. Changing a member's role is a registered action. Raising a role to `owner` or `admin` is `consequential` and requires an existing `owner`. Lowering a role is `reversible`.
+
+The first owner is established once by `soma-scaffold claim-first-owner`. The `kit-steward` creates a claim bound to the app and environment; the intended owner signs in on the identity origin and accepts it; the broker atomically creates the owner membership and consumes the claim. The claim expires within one hour, cannot be issued after an owner exists without a separately audited recovery procedure, and discloses no email address to the app.
```

### R9: Make the stand-up timer include deployment provisioning

- **Why:** The current test begins after the Netlify site, preview alias, and protected branch effectively exist, while `register` merely verifies them. That measures template use, not whether the kit can actually stand up a new app in hours.

- **Change:**

```diff
@@
-5. Registers origins separately by environment. `register --environment staging` registers only the fixed `https://preview--<site>.netlify.app` alias with the staging broker. `register --environment production` registers only the production origin with the production broker and is unavailable at prototype tier. Per-deploy URLs are not registrable, no wildcard is accepted, and a credential or contract from one environment is rejected by the other.
+5. Idempotently creates or verifies the Netlify site, links it to the declared repository, enables branch deploys, creates or advances the protected `preview` branch through the release seat, and registers origins separately by environment. `register --environment staging` registers only the fixed `https://preview--<site>.netlify.app` alias with the staging broker. `register --environment production` registers only the production origin with the production broker and is unavailable at prototype tier. Per-deploy URLs are not registrable, no wildcard is accepted, and a credential or contract from one environment is rejected by the other.
@@
-The timer begins when an approved `soma-app.json` is handed to one Cursor or Codex builder.
+The timer begins when an approved `soma-app.json`, an empty or existing target repository, and steward-held platform credentials are handed to one Cursor or Codex builder. No Netlify site, protected preview branch, broker registration, app schema, or app credential may be prepared beforehand. Product discovery and approval of the manifest are intentionally outside the timer; machine provisioning is not.
@@
-| Live branch deploy on `https://preview--<site>.netlify.app` against the staging broker | 30 minutes |
+| Provision and link the Netlify site, register staging, and complete the live branch deploy on `https://preview--<site>.netlify.app` | 30 minutes |
@@
-- **Registration: origins** [2.4a, step 5]. Before registering, `register` verifies three things: the Netlify site exists, it is linked to the app repository, and it builds branch deploys for the `preview` branch. If any is missing, `register` fails and names the missing setting.
+- **Registration: site and origins** [2.4a, step 5]. `register` uses the Netlify API idempotently: it creates the declared site when absent, verifies or establishes the repository link, enables branch deploys, and verifies the fixed `preview` alias before registering the staging origin. A conflicting existing site, repository link, owner, or origin fails loudly rather than being overwritten. This provisioning time is part of the second-app test.
```

### R10: Give “grounded” a mechanically testable meaning

- **Why:** As written, the model can return `grounded: true` and plausible-looking paths without evidence that its answer came from those sources. The server, not the model, must select and validate citations.

- **Change:**

```diff
@@
-The server takes `app_id` from its own installation, never from the request. It loads knowledge only from the files listed in `guide.ask.knowledge`, bundled at build time and covered by the contract hash, and never accepts knowledge from the request.
+The server takes `app_id` from its own installation, never from the request. It loads knowledge only from the files listed in `guide.ask.knowledge`, bundled at build time and covered by the contract hash, and never accepts knowledge from the request.
+
+The retrieval layer assigns opaque IDs to source passages before any provider call. The provider may cite only those IDs; the server maps valid IDs back to declared paths and headings and discards every unknown citation. `grounded` is computed by the server, not accepted from model output: it is true only when retrieval produced at least one qualifying passage and every citation in the returned answer resolves to that retrieval set. If those conditions fail, the endpoint returns `grounded: false`, no unsupported factual answer, and the human-host route. Conformance fixtures include adversarial model output that claims grounding and invents paths.
@@
-| C19a | When the Guide is enabled, `data_flows` declares the Ask inference provider, the voice provider when voice is enabled, page text when `page_context` is enabled, and the search provider when `web` is enabled. The Ask endpoint's knowledge contains every concept's `tell` file. A request that carries `context`, `app_id`, or instructions inside `page_context` cannot change the sources cited, the app charged, or the offers returned. |
+| C19a | When the Guide is enabled, `data_flows` declares the Ask inference provider, the voice provider when voice is enabled, page text when `page_context` is enabled, and the search provider when `web` is enabled. The Ask endpoint's knowledge contains every concept's `tell` file. A request that carries `context`, `app_id`, or instructions inside `page_context` cannot change the sources cited, the app charged, or the offers returned. Invented citation IDs, undeclared paths, and provider-supplied `grounded: true` are rejected; only the server's retrieved passage set can produce grounded citations. |
```

### R11: Add an independent production-health and incident gate

- **Why:** The broker is a deliberate shared dependency, but recovery alone does not detect an outage or contain an active incident. Alerting must not depend on the same Netlify/Supabase path or on the Mac whose failure would delay estate processing.

- **Change:**

```diff
@@
 ### 2.9 Platform recovery
 
 Before the broker admits a real person, the platform declares an RPO and RTO for identity, consent, memberships, grants, app registrations, and receipt indexes.
 
 The launch gate verifies provider backups or PITR, plus an encrypted logical export of the control-plane schemas to a separate failure domain. Backups exclude plaintext credentials and are inaccessible to app installation credentials.
+
+The launch gate also requires an external monitor in a separate failure domain from Netlify, Supabase, and the Mac. It checks public discovery, broker reachability, the oldest undelivered estate event, and a minimal synthetic sign-in/private-read/revocation journey. Alerts reach at least two named maintainers through a channel that does not depend on the Mac or the broker.
+
+The broker provides audited incident controls for: disabling new authorizations globally; disabling one app installation; disabling one action or executor; refusing all effects while preserving public help and status; withdrawing a policy; retiring a contract; and revoking a signing or installation key. Each control has a staging drill and a documented reversal. Production launch fails until the monitor detects an injected outage and each containment control has been demonstrated.
 
 A restore rehearsal must rebuild staging from backup, rotate every restored credential, replay completed erasure requests (section 2.5a), and pass the known-person, consent, action, revocation, and feedback journeys. A backup is not considered working until this rehearsal passes.
```