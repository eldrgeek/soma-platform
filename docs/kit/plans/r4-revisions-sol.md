# Revisions, round 4, GPT-5 Codex

### R1: Close the false database-isolation boundary

- **Why:** A JWT with `role = "authenticated"` inherits access to every legacy table and RPC granted to that role. This is concrete today: `playmaker/supabase/migrations/0009_guide.sql` lets any authenticated role read the entire changelog, and several public RPCs are granted to `authenticated` or `anon`. Pairwise `sub` values do not prevent role-wide or public access.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
 | Shared person IDs or pairwise app IDs | Keep one private `person_id`, but expose a different `app_person_id` to each app. | SOMA can recognize one person without giving every app a correlatable global identifier. |
+| Direct PostgREST or a same-origin data boundary | Use same-origin app Functions backed by narrow broker RPCs in v1. | A generic Supabase `authenticated` JWT inherits legacy grants in the shared project. Pairwise identity alone is not tenant isolation. |
 | Silent iframe recognition or explicit redirect | Use a top-level authorization-code flow with PKCE. | It works across domains, makes consent visible, and avoids browser third-party-storage behavior. |
@@
-10. The app's Netlify Function, not the browser, exchanges the code. It presents the PKCE verifier and the app's installation credential.
-11. The function sets a rotating refresh token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie on the app's origin. It returns a 15-minute access JWT, the pairwise `app_person_id`, and only consented profile fields to the browser.
+10. The app's Netlify Function, not the browser, exchanges the code. It presents the PKCE verifier and the app's installation credential.
+11. The function sets broker-issued session and refresh handles in `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Lax` cookies. It does not expose a Supabase Data API JWT to browser JavaScript. The browser obtains the pairwise identity and consented fields through the same-origin `/api/soma/v1/me` route.
 12. The app may now greet the person by name and state where it learned the name.
@@
 ### 2.3 Authentication boundary for apps
 
-Shared-table writes must not trust a browser-supplied `app_id`.
-
-Each deployed app receives an installation credential stored only in Netlify Functions.
-
-Only the identity broker stores the Supabase service-role credential.
-
-The broker validates the app credential, binds the request to one `app_id`, validates the person or AI session, and calls narrow database functions.
-
-Every pairwise app, React or static, receives short-lived Supabase JWTs minted by the broker after authorization.
-
-Each JWT has `sub = app_person_id`, `role = "authenticated"`, an `app_id` claim, and no email. Supabase's `auth.uid()` reads `sub`, so ordinary RLS idioms keep working and return the pairwise ID. The JWT lets the browser call PostgREST directly against its own app's RLS-protected `app_<app_id>` tables.
-
-The broker's signing key can mint a token for any database role, so it is as powerful as the service-role key. The broker refuses to mint any role other than `authenticated`, and the key exists only in the broker's environment.
-
-The broker signs these JWTs with a key the shared project trusts, such as a registered third-party issuer or the project's current signing keys. It does not use the legacy shared JWT secret.
-
-RLS policies in `app_<app_id>` tables must match both the `app_id` claim and the row's `app_person_id`.
-
-The JWT grants no direct access to the `soma` schema. Shared records remain reachable only through the broker's narrow functions.
-
-Browser code never receives an installation credential or service-role key.
-
-This boundary must replace existing app-held service-role access incrementally because one shared Supabase project otherwise creates an estate-wide breach path.
+Neither shared nor per-app database access trusts a browser-supplied `app_id`, `person_id`, `app_person_id`, role, or grant.
+
+Each deployed app receives two overlapping, independently revocable installation credentials so one can rotate without downtime. They are stored only in Netlify Functions and authenticate the app to the broker; they are not database credentials.
+
+The browser calls same-origin app Functions. A Function validates the broker-issued person session or agent access token, then calls the broker with the app installation credential.
+
+The broker derives `app_id` from the installation credential and the principal from the validated session. Caller-supplied identifiers may narrow a request but never establish authority.
+
+The broker may invoke only RPCs registered for that app and contract hash. App RPCs live in an unexposed `app_<app_id>_api` schema, have `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`, set a safe `search_path`, and return explicit columns.
+
+Per-app tables and `soma` tables are not exposed to browser PostgREST in v1. No pairwise app token carries the generic Supabase `authenticated` database role.
+
+The ordinary data path uses a least-privilege broker database role. Supabase Auth administration that genuinely requires the project secret is isolated behind a separate broker adapter; ordinary app data calls never receive or use that secret.
+
+Browser code never receives an installation credential, database credential, Supabase secret key, or shared-project JWT-signing key.
+
+This boundary must replace existing app-held service-role access incrementally because the current shared `public` schema contains legacy role-wide policies and callable functions. Pairwise IDs do not make those legacy grants safe.
@@
-2. Creates schema `app_<app_id>` with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`), grants `usage` to `authenticated`, and appends the schema to PostgREST's exposed schemas through the Management API. It reads the current list and appends; it never replaces the list, because the setting is project-wide.
+2. Creates private schemas `app_<app_id>` and `app_<app_id>_api`, with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`). Neither schema is added to PostgREST's exposed schemas, and neither grants access to `anon` or `authenticated`.
@@
-| C12 | Cross-person and cross-app RLS probes fail, including direct PostgREST probes made with a broker-minted JWT for another person, another app, or the `soma` schema. |
+| C12 | A browser or agent token cannot access the Supabase Data API directly. A stolen app installation credential cannot invoke another app's RPC, a non-registered RPC, the `soma` schema directly, or any legacy `public` table or function. Cross-person and cross-app broker probes fail. |
```

### R2: Make approval and idempotency one state machine

- **Why:** The current text settles an `approval_required` receipt, then tells the AI to retry with the same idempotency key. Section 2.4 says a settled key replays its stored output, so the approved action can never execute. Returning an approval token only once also makes a lost polling response unrecoverable.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
-| `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `input_hash`, `actor_id`, `principal` (`app_person_id`), `grant_id`, `risk`, `status`, `effect_summary`, `output`, `undo_of`, `created_at`, `completed_at`. The canonical receipt and idempotency record. |
+| `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `input_hash`, `actor_id`, `principal` (`app_person_id`), `grant_id`, `declared_risk`, `effective_risk`, `status`, `preview`, `resource_version`, `effect_summary`, `output`, `undo_of`, `expires_at`, `created_at`, `completed_at`. The canonical intent, approval, receipt, and idempotency record. |
@@
-`status` is one of `pending`, `succeeded`, `failed`, `refused`, `approval_required`, or `undone`.
+`status` is one of `prepared`, `approval_required`, `approved`, `running`, `succeeded`, `failed`, `refused`, `expired`, or `undone`.
 
-Execution claims the key by inserting a `pending` row, runs the effect, then settles the row with its `output`. When the effect is a database change, the claim, effect, and settlement share one transaction. This is the pattern PlayMaker already runs in `agent_command_requests`; M8 generalizes it rather than adding a second one.
+Preparation validates and canonicalizes the input, computes its hash, records the current resource version, calculates the effective risk and effects, and inserts the idempotency row. Preparation is side-effect free.
 
-- A repeated key with the same `input_hash` and a settled row returns the stored `output` without repeating the effect.
-- A repeated key while the row is `pending` returns HTTP 409 with `code: "idempotency_pending"` and `Retry-After`.
+- A repeated key with the same `input_hash` returns the current receipt state and stored output, if any, without creating another intent or repeating the effect.
+- A repeated key while the row is `running` returns HTTP 409 with `code: "idempotency_pending"` and `Retry-After`.
 - A repeated key with a different `input_hash` returns HTTP 422 with `code: "idempotency_conflict"`.
-- A `pending` row older than the action's declared timeout is reconciled using the action's recovery rule. It may be marked `failed` and retried with the same input only after the system proves the effect did not occur; otherwise it remains blocked for operator reconciliation. External side effects cannot be made exactly-once by the receipt alone.
+- Approval transitions the same row from `approval_required` to `approved`; it does not create a second request.
+- The app server, not the requesting AI, atomically claims an approved row, revalidates authorization and the resource version, and executes it. The AI polls the receipt for the outcome.
+- A `running` row older than the action's declared timeout is reconciled using the action's recovery rule. It may be retried only after the system proves the effect did not occur. External effects require a provider idempotency key or an outbox plus reconciliation.
@@
-| `reversible` | Run and show receipt plus undo when available. | Run only within a live grant and risk ceiling. |
+| `reversible` | Run and show a receipt with a tested undo operation. | Run only within a live grant and risk ceiling; the receipt exposes the same tested undo operation. |
 | `consequential` | Show an effect preview and require confirmation. | Require a fresh approval token bound to the action, version, input hash, principal, and expiry. Without one, return `approval_required` with an `approval_url` the AI relays to the person. |
@@
-When a consequential or irreversible request arrives without a valid approval token, the server returns HTTP 403 with `error: "approval_required"`, an `approval_id`, an `approval_url`, an expiry, and the ID of an `approval_required` receipt.
+When a consequential or irreversible request arrives, the server returns HTTP 202 with `status: "approval_required"`, an `approval_id`, an `approval_url`, an expiry, and the ID of the same receipt that will eventually contain the outcome.
@@
-The AI polls `GET /api/soma/v1/approvals/:id`. After the person confirms, that call returns the approval token once.
-
-The AI then repeats the execute request with the same `Idempotency-Key` and the token.
+The approval page re-runs `prepare`. If the effective risk, effects, input, authorization, or resource version changed, the old approval expires and the person sees a new preview.
+
+After confirmation, the app server executes the already-recorded intent. The AI polls the receipt; no bearer approval token is returned through the AI's channel.
@@
-Every effect request requires `Idempotency-Key`.
+Every effect request requires `Idempotency-Key`. An action labeled `reversible` must implement and pass a round-trip undo test; otherwise conformance requires it to be labeled `consequential`.
@@
 GET /api/soma/v1/approvals/:id
+POST /api/soma/v1/approvals/:id/decision
 GET /api/soma/v1/receipts/:id
@@
-| C6 | Consequential and irreversible actions cannot bypass confirmation. A remote request without a valid approval token returns `approval_required` with an `approval_url`. |
-| C7 | Repeated idempotency keys do not repeat effects, and conflicting input hashes fail. An action with `undoable: true` implements `undo`, and the check calls `POST /receipts/:id/undo` once. |
+| C6 | Consequential and irreversible actions cannot bypass confirmation. Approval and execution advance one receipt state machine; changed inputs, effects, authorization, or resource versions invalidate approval. |
+| C7 | Repeated idempotency keys do not create another intent or repeat effects, and conflicting input hashes fail. Every `reversible` action implements `undo`, and the check proves an execute–undo round trip. |
```

### R3: Make revocation true on the next request

- **Why:** The plan says an app can validate an agent JWT only against JWKS, but also promises that revocation blocks the next request. A self-contained token remains valid until its ten-minute expiry unless the app performs an online grant check.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
-The broker exchanges it for an access token that lives at most 10 minutes. The token carries `aud = "app:<app_id>"`, `grant_id`, `scopes`, and `risk_ceiling`.
+The broker exchanges it for an access token that lives at most 10 minutes. The token carries `aud = "app:<app_id>"`, `grant_id`, `grant_version`, `jti`, `scopes`, and `risk_ceiling`.
 
-An app accepts an agent token only when its signature verifies against the broker's JWKS and its `aud` names that app. A token captured by one app is therefore useless at any other app.
+Signature, issuer, expiry, and audience validation establish token authenticity only. Before every non-public read or effect, the app Function asks the broker to authorize the token's `grant_id`, `grant_version`, scope, risk, principal, and action. Effect authorization is never served from a cache. Broker failure fails closed for effects and private reads.
+
+A token captured by one app is useless at another because both its audience and online grant bind it to one registered app.
@@
-The broker returns the long-lived refresh credential once and stores only its hash. Apps see only short-lived, app-audience access tokens.
+The broker returns the long-lived refresh credential once and stores only its keyed hash. Refresh credentials rotate on every use; reuse of an older credential revokes the credential family and records a security event.
 
-Revocation invalidates new agent sessions immediately.
+Revocation increments `grant_version`, revokes the refresh family, and causes an access token minted before revocation to fail its next authorization check.
@@
-| C9 | A revoked AI grant fails on the next request. |
+| C9 | Revoke a grant after minting an access token, then prove that the already-minted token fails its next private read and effect request. |
```

### R4: Keep automated journeys out of production

- **Why:** The plan creates a conformance-only sign-in path in the production identity system and lets deploy previews create and delete production memberships, grants, answers, and receipts. That turns an unfinished preview and a test credential into production control-plane actors, while cleanup also conflicts with preserving evidence.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
-Live journeys run against the shared production project, so they use only test people (`soma.people.is_test = true`).
-
-The broker exposes a test sign-in that works only for test people and only with the conformance credential the steward seat holds. Automated journeys never wait for a magic-link email.
-
-A permanently registered fixture app, `soma-fixture`, gives each test person a prior membership, so the known-person journey always has an “other SOMA app.”
-
-Each run deletes its test memberships, grants, answers, and receipts when it finishes. Metrics and the estate board exclude test people.
+CI and deploy-preview journeys run against a separate staging Supabase project and staging broker built from the same migrations and configuration. Production secrets, sessions, people, and grants are unavailable to deploy previews.
+
+The staging broker exposes a test sign-in only for staging test people and only to the conformance runner. Production has no conformance sign-in bypass.
+
+A permanently registered staging fixture app, `soma-fixture`, gives each test person a prior membership, so the known-person journey always has an “other SOMA app.”
+
+Each run first writes a redacted evidence bundle, then deletes or expires its staging memberships, grants, answers, and receipts. Cleanup is idempotent and is itself checked.
+
+After production promotion, a narrow production smoke journey uses a dedicated synthetic person. It performs public discovery, sign-in, one private read, one reversible action followed immediately by undo, revocation, and status verification. It cannot exercise irreversible actions or destructive erasure.
+
+The status endpoint distinguishes `staging_conformance` from `production_smoke`; a staging pass must never be displayed as a production pass.
```

### R5: Keep Ask provider-neutral and voice optional

- **Why:** The existing Guide already separates text inference through `inferenceUrl` from ElevenLabs voice, and its tests explicitly prove Ask can run without starting an ElevenLabs session. Making every app create an ElevenLabs agent adds cost, external provisioning, and a data processor that the two-week scope says it cuts.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
-| Ask, Show, and Do | The person can ask for an explanation, see the relevant controls, or ask the host to act. | Alignment joins understanding with agency. | `packages/soma-guide`; PlayMaker `src/agent-portal/`; Legends Guide actions. | Make one typed action registry serve the UI, Guide, and outside AIs. Bind controls with `data-soma-action="<id>"`. In-app Ask runs on the app's ElevenLabs Conversational AI agent, grounded in knowledge compiled from the manifest's concepts. An outside AI's Ask needs no SOMA inference: it reads `/llms.txt` and `/knowledge/*.md`. |
+| Ask, Show, and Do | The person can ask for an explanation, see the relevant controls, or ask the host to act. | Alignment joins understanding with agency. | `packages/soma-guide`; its independent `inferenceUrl` and optional ElevenLabs voice paths; PlayMaker `src/agent-portal/`; Legends Guide actions. | Make one typed action registry serve the UI, Guide, and outside AIs. Bind controls with `data-soma-action="<id>"`. In-app Ask uses a provider-neutral server endpoint implementing the kit's Ask interface and grounded in declared knowledge. Voice is an optional adapter. An outside AI can read `/llms.txt` and `/knowledge/*.md` without SOMA inference. |
@@
-| `soma-platform/packages/soma-guide` | Keep on the CDN. Publish immutable semantic-version paths and SRI hashes. Bundle a pinned `@elevenlabs/client` into each release instead of importing `esm.sh/@elevenlabs/client@latest` at runtime. Keep the root path as the moving channel for non-kit consumers. |
+| `soma-platform/packages/soma-guide` | Keep on the CDN. Publish immutable semantic-version paths and SRI hashes. Keep text Ask independent from voice. When voice is enabled, load a pinned ElevenLabs client from the same immutable release rather than `esm.sh/@elevenlabs/client@latest`. Keep the root path as the moving channel for non-kit consumers. |
@@
-1. Inserts or updates `soma.apps`, `soma.app_hosts`, and the registered origins. When the Guide is enabled and the manifest does not yet name an agent, it creates the agent from the persona file through the ElevenLabs API and records the resulting `guide_agent` value.
+1. Inserts or updates `soma.apps`, `soma.app_hosts`, and the registered origins. Registration performs no third-party provisioning by default. An optional voice recipe may create an ElevenLabs agent only when `guide.voice.enabled` and `guide.voice.provision` are explicitly declared.
@@
     "ai": {
       "id": "veric",
       "name": "V'Eric",
       "role": "AI host",
-      "persona": "personas/veric.md",
-      "guide_agent": "elevenlabs:<agent_id>"
+      "persona": "personas/veric.md"
     }
   },
+  "guide": {
+    "ask": {
+      "endpoint": "/api/soma/v1/ask",
+      "knowledge": ["/knowledge/host-pair.md"]
+    },
+    "voice": {
+      "enabled": false
+    }
+  },
@@
-- The AI host's Guide agent, created by `soma-scaffold register` from the persona file through the ElevenLabs API, or its manual creation time counted inside the four hours.
+- A provider-neutral Ask endpoint grounded in the declared knowledge. If the app elects to enable voice, all voice-provider provisioning time counts inside the four hours.
```

### R6: Specify the browser and public-endpoint threat boundary

- **Why:** PKCE alone does not define callback state, cookie CSRF protection, refresh-token reuse handling, CORS, redirect validation, or abuse controls. The kit exposes costly and security-sensitive public surfaces—Ask, feedback, invitations, device pairing, approval polling, and file-bearing actions—so these controls belong in the contract and conformance gate.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
 The authorization code must be short-lived and single-use.
 
 The redirect URI must exactly match a registered origin.
 
 The app must not receive a global `person_id`.
+
+The app starts authorization through a same-origin Function that creates `state`, `nonce`, and a PKCE verifier using a cryptographic random source. Their server-side record expires within ten minutes and is consumed once.
+
+The callback rejects an unknown or reused state, verifier mismatch, issuer mismatch, audience mismatch, nonce mismatch, non-HTTPS redirect, or redirect URI that is not an exact registered value.
+
+Session cookies use the `__Host-` prefix, `Path=/`, no `Domain`, `Secure`, `HttpOnly`, and `SameSite=Lax`. Cookie-authenticated unsafe methods require both an exact allowed `Origin` and a CSRF token bound to the session. Bearer-token agent calls do not use cookies.
+
+Access tokens, authorization codes, refresh handles, invitation tokens, device codes, and approval identifiers are redacted from logs, analytics, error reports, referrers, and evidence screenshots.
@@
 Outside AIs fall into two classes. A chat AI that can only fetch pages can read discovery, `/llms.txt`, and public knowledge, and can tell its person how to connect an AI that can act. An AI with an HTTP or code tool can pair, receive grants, and act. M0 records which current assistants fall in each class.
 
 A generated MCP adapter is the first v1.1 feature. It is generated from the same action registry and uses the broker's OAuth metadata and per-app grants from this section, because Claude and ChatGPT connectors speak MCP rather than OpenAPI.
+
+### 2.7a Public endpoint and content safety
+
+Every public endpoint declares a maximum body size, request rate, concurrency limit, cost budget, timeout, and enumeration-resistant error shape.
+
+Rate limits use platform-derived client-address metadata, app identity where available, and account or grant identity after authentication. They do not trust a caller-supplied forwarding header.
+
+Ask, feedback, invitations, device pairing, approval polling, and unauthenticated discovery have separate quotas. Expensive provider work is admitted only after the cheap validation and quota checks pass.
+
+Knowledge files, user text, imported documents, action output, and outside-AI text are untrusted data. They never establish authority, select a scope, lower a risk level, or bypass confirmation. Only the typed registry and authenticated server context may authorize a tool call.
+
+Rendered Markdown and model output are sanitized. Generated apps ship a restrictive Content Security Policy, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, and MIME-sniffing protection.
@@
 | C21 | Every Golden Journey page has no serious or critical axe-core violations at 1280 px and 375 px. Every Show step's target is reachable by keyboard, and the step's text is announced through an `aria-live` region. |
+| C22 | Authorization rejects state, nonce, PKCE, issuer, audience, callback-origin, refresh-reuse, CSRF, and cross-origin failures. No secret or bearer value appears in logs, URLs, analytics, or evidence. |
+| C23 | Public endpoints enforce body, rate, concurrency, timeout, and cost limits before provider calls. Untrusted content cannot select tools, scopes, principals, or risk levels. |
```

### R7: Prevent apps from forging shared understanding

- **Why:** The plan currently lets an app write any `soma:*` concept state and lets shared answers suppress later questions. A broken or hostile app could mark a person as having understood something they never saw, or silently make a private answer portable.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
 | `soma.consents` | `person_id`, `app_id`, `fields`, `purpose`, `policy_version`, `granted_at`, `revoked_at` | The person reads and revokes. The broker enforces disclosure. |
-| `soma.concept_state` | `person_id`, `concept_id`, `concept_version`, `state`, `source_app_id`, `first_at`, `last_at`, `evidence` | An app may read and write only `soma:*` concepts and concepts in its own `<app_id>:` namespace. `soma:*` state reaches an app only after consent. |
-| `soma.answers` | `person_id`, `question_id`, `schema_version`, `answer`, `source_app_id`, `sharing`, `answered_at`, `revoked_at` | Cross-app reads require `sharing='soma'` and current consent. |
+| `soma.concepts` | `concept_id`, `version`, `owner_app_id`, `definition_hash`, `supersedes`, `status` | Platform-managed registry. Only the platform steward may publish or revise `soma:*`; an app owns only its namespace. |
+| `soma.question_definitions` | `question_id`, `schema_version`, `owner_app_id`, `schema_hash`, `portable`, `compatible_with`, `status` | Platform-managed registry. Cross-app compatibility is explicit and hash-bound, never inferred from matching strings. |
+| `soma.concept_state` | `person_id`, `concept_id`, `concept_version`, `state`, `source_app_id`, `receipt_id`, `first_at`, `last_at`, `evidence` | Writes require a concept declared by the app's registered contract. `acknowledged` requires a direct person gesture; `done` requires a successful receipt bound to the concept. |
+| `soma.answers` | `person_id`, `question_id`, `schema_version`, `answer`, `source_app_id`, `sharing`, `sensitivity`, `purpose`, `expires_at`, `answered_at`, `revoked_at` | Answers are size-limited typed JSON. They remain private unless the person approves a preview of the exact fields, destination class, purpose, and duration. |
@@
 Declaring a concept outside `soma:` and the app's own namespace fails C3.
+
+Declaring an unregistered `soma:*` concept or a definition hash that differs from the registry also fails C3.
@@
-`done` means the person completed the concept's action at least once.
+`acknowledged` can be recorded only from an explicit person control.
+
+`done` means a successful action receipt bound to that concept and version exists. An AI or app cannot assert either state from prose.
@@
-An answer is private to its source app unless the person explicitly marks it shareable across SOMA.
+An answer is private to its source app unless the person explicitly approves a share preview. An app may request portability but cannot set `sharing='soma'` on the person's behalf.
 
-An app may suppress a question only when the stored answer matches the declared question ID and a compatible schema version.
+An app may suppress a question only when the registered question definition marks the stored schema compatible, the consent remains current, the answer has not expired, and the app is allowed to receive its sensitivity class.
+
+Revoking answer consent immediately hides it from other apps without deleting the source app's lawful copy. Per-app forget revokes sessions, grants, consent, and the pairwise mapping before erasing app data. Rejoining creates a new random `app_person_id`; it does not revive the old mapping.
```

### R8: Treat registration and migrations as privileged supply-chain inputs

- **Why:** `soma-scaffold register` is specified to run repository-provided SQL while holding platform authority. A compromised or mistaken app migration could alter another schema, and the shared project already contains overlapping migrations, `SECURITY DEFINER` functions, and legacy grants. Registration needs a live catalog baseline, constrained ownership, locks, and checksums.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
 Registration is idempotent and does five things:
@@
-3. Applies the app's migrations with `soma-scaffold migrate`, which records history in `app_<app_id>.schema_migrations`. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's `0001`–`0087` and a second repository's `0001_…` would collide.
+3. Applies an approved migration bundle with `soma-scaffold migrate`. The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as a no-login owner constrained to that app's two schemas. It cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. History lives in `app_<app_id>.schema_migrations`; a changed checksum or partially applied migration fails loudly.
@@
 Running `register` is not an edit to `soma-platform`, so it does not fail the second-app test. Its time counts toward the 30-minute deploy-preview target.
+
+Before the first registration in an environment, the steward captures and reviews the live database catalog: exposed schemas, roles and memberships, grants, RLS state, policies, views, triggers on `auth.users`, callable functions, `SECURITY DEFINER` ownership and `search_path`, publications, storage policies, and installed extensions. The generated report becomes the isolation baseline and is rerun after every platform migration.
@@
-| M0: Freeze evidence | Record current package APIs. Generate a fixture from PlayMaker’s current action catalogue. Capture PlayMaker invitation, sign-in, feedback, and Agent API journeys. Capture all 22 Legends Guide configurations. Record which current outside AIs are fetch-only and which have an HTTP or code tool. | The old journeys run before kit code changes. The fixture records the actual action count rather than trusting a prose count. The outside-AI evidence names each AI and its available tool class. |
+| M0: Freeze evidence | Record current package APIs. Generate a fixture from PlayMaker’s current action catalogue. Capture PlayMaker invitation, sign-in, feedback, and Agent API journeys. Capture all 22 Legends Guide configurations. Record which current outside AIs are fetch-only and which have an HTTP or code tool. Generate the live database isolation baseline described in section 2.4a. | The old journeys run before kit code changes. The fixture records the actual action count rather than trusting a prose count. The database report accounts for every exposed schema, role grant, policy, trigger, view, and callable privileged function. |
@@
-`public.soma_profiles` becomes a compatibility view before any caller is removed.
+`public.soma_profiles` remains unchanged until every caller is inventoried. If it becomes a compatibility view, it uses `security_invoker = true`, exposes only the legacy fields required by named legacy consumers, and is granted only to those consumers. Pairwise apps receive no access to it.
```

### R9: Complete the feedback loop without centralizing raw reports

- **Why:** The capability promises that a person can later see a report's disposition, but the architecture specifies only one-way delivery to the estate. The proposed generic `estate_inbox.payload` also risks copying private descriptions, attachments, and transcripts into a second system.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
-| Feedback and improvement loop | A person can report a problem or request a change and later see its disposition. | The user participates in the outer RSI loop. | `packages/soma-feedback`; PlayMaker’s feedback queue and build requests. | Make the package the widget’s source of truth. Keep per-app records and send retryable outbox events through the broker to the durable estate inbox. |
+| Feedback and improvement loop | A person can report a problem or request a change and later see its disposition and demonstration. | The user participates in the outer RSI loop. | `packages/soma-feedback`; PlayMaker’s feedback queue and build requests. | Make the package the widget’s source of truth. Keep full reports per app; forward only a minimal event through the broker; return disposition and demonstration updates to the app. |
@@
-| `soma.estate_inbox` | `event_id`, `app_id`, `kind`, `payload`, `received_at`, `claimed_at` | Written only by the broker. The Mac-side board importer reads and claims rows, so apps never depend on the Mac being up. |
+| `soma.estate_inbox` | `event_id`, `app_id`, `app_record_id`, `kind`, `consent_safe_summary`, `created_at`, `received_at`, `claimed_at` | Written only by the broker. It contains no attachments, transcripts, raw diagnostics, contact fields, or full report body. |
+| `soma.estate_dispositions` | `event_id`, `app_id`, `app_record_id`, `status`, `public_note`, `demonstration_url`, `updated_at` | Written by the authorized estate processor and read by the originating app through the broker. |
@@
-| `feedback_outbox` | Retryable delivery to `soma.estate_inbox` through the broker. A Netlify scheduled function in each app drains it every five minutes with exponential backoff. An event undelivered after 24 hours is marked dead-lettered, and the status endpoint reports the count. |
+| `feedback_outbox` | Retryable minimal event delivery to `soma.estate_inbox`. Submission attempts an immediate drain after committing the app record; a scheduled function is recovery, not the only delivery path. Events use stable IDs and broker-side uniqueness. Undelivered events retry with jittered exponential backoff and surface through status. |
+| `feedback_status_inbox` | Idempotently applies estate disposition and demonstration updates to the canonical app record so the person can see what happened. |
@@
-18. Feedback creates a per-app record and an estate outbox event.
+18. Feedback creates a per-app record and a minimal estate event. A simulated estate disposition returns to the same record, and the person can see its status and demonstration without seeing private operator notes.
```

### R10: Reduce the two-week release to one secure vertical slice

- **Why:** The current two-week scope combines a new identity provider, custom JWT integration, OAuth device flow, database tenancy, action runtime, tickets rewrite, Guide release system, two templates, feedback transport, production key work, PlayMaker PR, accessibility, privacy, and security review. Three builders cannot honestly complete and demonstrate all of that in fourteen days.
- **Change:** Replace sections **8.2 Two-week release** and **8.3 Two-week build sequence** in full with:

```markdown
### 8.2 Two-week release: the secure vertical slice

The two-week outcome is one generated React reference app and one generated static fixture running against staging. Both complete the same identity, Ask/Show/Do, outside-AI, feedback, and revocation journey. The release makes no production or legacy-app change.

It must include:

- The `soma.app/1` JSON Schema, strict validation, canonical contract hash, and `soma-kit.lock.json`.
- The live database isolation baseline and the same-origin Function/broker boundary from section 2.3.
- A staging identity broker with offered recognition, random pairwise IDs, exact redirect registration, and hardened session handling.
- A provider-neutral Ask endpoint grounded only in declared knowledge.
- One keyboard-accessible Show workflow using stable `data-soma` targets.
- The typed action registry with one `observe`, one genuinely reversible, and one consequential action.
- The server-owned approval/idempotency state machine and receipts.
- Outside-AI discovery, device pairing, app-scoped grants, online authorization, and next-request revocation.
- Minimal registered concept state and one explicitly shareable typed answer.
- Canonical feedback submission, minimal estate event delivery, and a simulated disposition returned to the app.
- React and static fixtures generated from the same manifest.
- Conformance for C1–C14 and C21–C23, including adversarial isolation, CSRF, revocation, prompt-injection, and failure-injection cases.
- A redacted evidence bundle and a timed second-app rehearsal against staging.

It explicitly excludes:

- Production identity or database rollout.
- PlayMaker or Legends migrations, pull requests, credentials, or feature flags.
- Invitation consolidation.
- Changelog migration.
- Production Guide CDN promotion.
- Voice, ElevenLabs provisioning, billing, BYOK, MCP generation, Rooms, video, Accord UI, live editing, and produced films.
- Full error-service extraction.
- Automated global erasure, legal prose, DNS, Stripe, OAuth-provider, or domain-account work.
- Claims that the shared production project is isolated before the production catalog audit and legacy migration pass.

The release must not cut:

- The same-origin data boundary.
- Consent before cross-app disclosure.
- Server-enforced authorization and risk.
- Idempotency, receipts, and tested undo.
- Next-request grant revocation.
- Staging/production separation.
- Ask, Show, and Do.
- The live demonstration.

### 8.3 Two-week build sequence

| Days | Builder A | Builder B | Builder C |
|---|---|---|---|
| 1–2 | Contract, lock file, and fixtures | Database catalog audit and broker boundary | Threat model, adversarial cases, and conformance skeleton |
| 3–6 | React/static generation and stable Show bindings | Identity, sessions, pairwise IDs, and concept state | Action registry, approval state machine, receipts, and undo |
| 7–10 | Provider-neutral Ask and feedback round trip | AI pairing, grants, online authorization, and revocation | Isolation, CSRF, abuse, prompt-injection, and accessibility tests |
| 11–12 | Integrated staging deploy | Golden Journeys and failure injection | Evidence tooling and independent security review |
| 13 | Timed second-app rehearsal | Fix only rehearsal blockers | Re-run the adversarial suite |
| 14 | Final staging demonstration | Evidence publication | Scope and production-readiness report |

Claude reviews and merges bounded work.

Cursor and Codex build from self-contained beads.

A missed schedule moves an unfinished capability out of the two-week release. It never weakens the isolation, consent, authorization, revocation, or test boundary to preserve the date.

The release is complete only when both fixtures pass the same live staging conformance command and a fresh builder completes the timed rehearsal without editing `soma-platform`.
```

### R11: Add recovery and key-rotation gates

- **Why:** Identity, consent, grants, receipts, and app registrations become estate-wide control-plane data, but the plan has no backup, restore, or signing-key rotation design. “Shared dependency fallback” does not recover lost or corrupted state.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
 ### 2.8 Package boundaries and delivery
@@
 `deploy-guide.sh` publishes each release twice: to `/v<semver>/` with `Cache-Control: public, max-age=31536000, immutable`, and to the root path that existing non-kit consumers load. Kit apps load only the versioned path. `dist/releases.json` maps each semver to its `SOMA_GUIDE_VERSION` date string and integrity hash.
+
+### 2.9 Platform recovery
+
+Before the broker admits a real person, the platform declares an RPO and RTO for identity, consent, memberships, grants, app registrations, and receipt indexes.
+
+The launch gate verifies provider backups or PITR, plus an encrypted logical export of the control-plane schemas to a separate failure domain. Backups exclude plaintext credentials and are inaccessible to app installation credentials.
+
+A restore rehearsal must rebuild staging from backup, rotate every restored credential, and pass the known-person, consent, action, revocation, and feedback journeys. A backup is not considered working until this rehearsal passes.
+
+Broker signing keys, app installation credentials, conformance credentials, and refresh-token hashing keys have named owners, creation and expiry dates, overlapping rotation procedures, emergency revocation procedures, and audit events. JWKS retains an old public key only through the maximum lifetime of tokens it signed.
+
+The public status route exposes only release and pass/fail metadata. Detailed failed checks, infrastructure identifiers, and evidence URLs require steward authorization.
@@
 | The broker becomes a single point of failure. | Keep existing sessions running to expiry, keep public pages and public-knowledge Ask working, and show the outage with the human contact route. Test broker failure in the live journey. Never fall back to in-app Supabase Auth sign-in for a pairwise app. |
+| Shared control-plane data is lost, corrupted, or restored with stale credentials. | Define RPO/RTO, keep an independent encrypted backup, rotate credentials after restore, and pass a restore rehearsal before production launch. |
```

### R12: Lock the complete Guide artifact, not one JavaScript file

- **Why:** The Guide also depends on CSS and may load optional chunks. A single JavaScript SRI entry does not freeze the visible or executable release, and publishing the same semantic-version path twice would make “immutable” only a cache header.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
   "guide": {
     "version": "1.0.0",
-    "url": "https://soma-guide.netlify.app/v1.0.0/soma-guide.js",
-    "integrity": "sha384-..."
+    "assets": [
+      {
+        "url": "https://soma-guide.netlify.app/v1.0.0/soma-guide.js",
+        "integrity": "sha384-..."
+      },
+      {
+        "url": "https://soma-guide.netlify.app/v1.0.0/soma-guide.css",
+        "integrity": "sha384-..."
+      }
+    ]
   },
@@
-A Guide release loads no code from outside its own immutable version path. `deploy-guide.sh` fails a release whose bundle contains a remote `import()` URL, and the Guide refuses a `voiceAgentEsmUrl` override unless the lock file lists it with an integrity hash.
+A Guide release loads no code from outside its own immutable version path. `deploy-guide.sh` fails a release whose bundle contains a remote `import()` URL. Kit apps cannot use `voiceAgentEsmUrl`; an enabled voice adapter is a relative, hashed asset in the same release.
 
-`deploy-guide.sh` publishes each release twice: to `/v<semver>/` with `Cache-Control: public, max-age=31536000, immutable`, and to the root path that existing non-kit consumers load. Kit apps load only the versioned path. `dist/releases.json` maps each semver to its `SOMA_GUIDE_VERSION` date string and integrity hash.
+`deploy-guide.sh` publishes each release twice: to `/v<semver>/` with `Cache-Control: public, max-age=31536000, immutable`, and to the root path that existing non-kit consumers load. Every executable, stylesheet, worker, and optional chunk is listed in the lock file and receives an integrity hash. Publishing an existing semantic version is a no-op only when every byte matches; otherwise it fails. Kit apps load only the versioned path. `dist/releases.json` maps each semver to its complete asset manifest.
```

### R13: Keep Mike and Eric at the product boundary

- **Why:** Asking Mike or Eric to operate feature flags violates the estate rule that their work is with people and product judgment, not computer administration. Their irreducible role is acceptance; the team owns the mechanical release.
- **Change:**

```diff
--- a/docs/kit/10-plan.md
+++ b/docs/kit/10-plan.md
@@
-PlayMaker ships straight to production after `pr-merge-green`, gated on typecheck, build, and the full test suite (its default branch is `master`). A kit change that alters a screen lands behind a flag that defaults off. Flipping the flag is the user-visible release, and it happens only after Eric or Mike has seen the screen. A deploy preview is used only where tests cannot cover the risk, and then with a test login that works only outside production, because saved passwords autofill only on the production domain.
+PlayMaker ships straight to production after `pr-merge-green`, gated on typecheck, build, and the full test suite (its default branch is `master`). A kit change that alters a screen lands behind a flag that defaults off. Eric or Mike supplies product acceptance; the release seat records that acceptance and performs the flag change. A deploy preview is used only where tests cannot cover the risk, and then with a test login that works only outside production, because saved passwords autofill only on the production domain.
@@
-2. **Will you ask Eric to accept the PlayMaker kit sequence, and who flips flags on screens he uses?**
-   Recommendation: ask Eric once to approve the M7–M9 sequence as a batch. Claude merges each pull request under the existing direct-to-production rule with its flag off. Eric flips each flag that changes a screen he uses; Mike flips it if Eric has not responded within a week.
+2. **What acceptance promise should the team make Eric for the PlayMaker kit sequence?**
+   Recommendation: Mike asks Eric once to approve the M7–M9 sequence and to name which screen changes require his personal acceptance. The release seat prepares, merges, flips, verifies, and rolls back flags. If required acceptance has not arrived, the flag remains off; silence is not approval.
```