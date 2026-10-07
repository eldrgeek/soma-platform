# Revisions, round 3, Claude Opus 5.5

_Reviewer: Claude Opus 5.5 (Anthropic), Claude Code, 2026-10-07, for Mike Wolf and the SOMA brain trust. Claims were checked against `soma-platform/packages/*`, `soma-app-template/`, `playmaker/` (local checkout at `2e7431a4`), and `legends-membership-site/`. Revisions are ordered by importance._

### R1: The v1 manifest is a new format, not an extension of the existing spec
- **Why:** The plan says the scaffolder "already validates" the contract and M1 "extend[s] the existing JSON format", but the existing schema (`packages/soma-scaffolder/schema/soma-app.schema.json`) requires a root `soma_app` object with `slug`, `targets`, `affordances` and `meta`, and sets `additionalProperties: false`. The plan's example (root keys `schema_version`, `app`, `hosts`, …) fails that schema on its first key, and validation today is a dependency-free structural check in `src/spec.mjs`, not JSON Schema. Separately, the scaffolder writes the file as `soma-app.json` (hyphen; `src/scaffold.mjs:322`, `src/scaffoldReactApp.mjs:547`), while the plan says `soma.app.json` everywhere.
- **Change:** Rename the file to the name generated apps already carry, state that v1 is a new shape, and add a converter. Apply the rename to every occurrence of `soma.app.json` in the plan (sections 2.1, 3.1, 3.3, 4.1, 5); the diffs below show the substantive edits.

```diff
-| `soma.app.yaml`, `soma.app.json`, or `soma.config.ts` | Use `soma.app.json`. | The scaffolder already validates JSON through `packages/soma-scaffolder/schema/soma-app.schema.json`. JSON is inert, portable, and does not require executing app code. |
+| `soma.app.yaml`, `soma.app.json`, or `soma.config.ts` | Use JSON in `soma-app.json`, the file name the scaffolder already writes into generated apps. | JSON is inert, portable, and does not require executing app code. The v1 document is a new shape; the v0 spec (`soma_app` root) converts to it through `soma-scaffold migrate-spec`. |
```

````diff
 Keep a compatibility entry point at:
 
 ```text
 soma-platform/packages/soma-scaffolder/schema/soma-app.schema.json
 ```
+
+That path keeps the **v0** schema unchanged. It is not an entry point for v1.
+
+The v1 manifest is a new document shape, not an extension of v0. The v0 spec has a root `soma_app` object with `slug`, `targets`, `affordances`, and `meta`, and forbids other root keys, so it cannot validate a v1 manifest.
+
+The scaffolder dispatches on the document:
+
+- A document with `"schema_version": "soma.app/1"` validates against `soma-app-v1.schema.json` with Ajv (draft 2020-12). Ajv becomes a scaffolder and conformance dev dependency; it is never vendored into apps.
+- A document with a root `soma_app` is accepted only by `soma-scaffold migrate-spec <v0.json> > soma-app.json`. The converter emits a v1 manifest and prints every v0 field it could not map. The three existing examples (`examples/legends.soma.json`, `legends-billing.soma.json`, `soma-forge.soma.json`) are its test fixtures.
````

```diff
-| M1: Contract and conformance | Create `@soma/contracts`, extend the existing JSON format, add `soma-kit.lock.json`, and build C1–C5 and C13–C14. | A disposable generated app builds and fails when a host, action binding, or vendored file is altered. |
+| M1: Contract and conformance | Create `@soma/contracts` with the v1 schema, add Ajv validation, add `soma-scaffold migrate-spec` for v0 specs, add `soma-kit.lock.json`, and build C1–C5 and C13–C14. | A disposable generated app builds and fails when a host, action binding, or vendored file is altered. All three v0 examples convert to valid v1 manifests. |
```

### R2: Say honestly that PlayMaker, Legends, and the template hold global identity and the shared secret key today, and add the phase that removes it
- **Why:** PlayMaker and Legends sign people in directly against Supabase Auth in the shared project, and PlayMaker's tables key on `auth.users.id`, so they already hold a global, correlatable identifier; pairwise IDs for them would change PlayMaker's domain model, which section 4.2 forbids. PlayMaker's functions also hold the shared project's secret key (`netlify/functions/lib/agentIngress.ts`, `lib/metering.ts`) and sign agent sessions with the legacy JWT secret (`lib/agentJwt.ts`), and the template does the same (`soma-app-template/netlify/functions/lib/supabaseAdmin.ts`, `lib/agentJwt.ts`, `.env.example`), so every app the scaffolder generates today inherits both. No migration phase removes them, yet section 8.2 says the release "must not cut RLS and broker isolation".
- **Change:** Add a subsection after 2.3, a template step in M3, a new phase M11, and a corrected risk row.

Insert after the paragraph ending "creates an estate-wide breach path." in section 2.3:

```markdown
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
```

```diff
-| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. |
+| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template` and its functions; a generated app receives only `SOMA_APP_INSTALLATION_KEY`. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. A freshly generated app's environment contains no shared-project secret. |
```

Add a row after M10:

```diff
 | M10: Second-app test | Run the timed build from an approved manifest without editing `soma-platform`. | Section 5 passes on a live Netlify preview. |
+| M11: Retire app-held shared secrets | Move PlayMaker's metering, agent ingress, and admin functions behind broker calls or PlayMaker-scoped `SECURITY DEFINER` functions. Do the same for Legends. Remove both apps' shared secret keys. Then revoke the legacy JWT secret and rotate the shared project to asymmetric signing keys. | A scan of every SOMA Netlify site's environment finds no shared-project secret key outside the broker. PlayMaker's and Legends' journeys pass after the legacy secret is revoked. |
```

```diff
-| One shared Supabase project becomes an estate-wide breach boundary. | Remove service-role credentials from app runtimes. Put privileged shared access behind the broker. Test cross-app and cross-person isolation. |
+| One shared Supabase project becomes an estate-wide breach boundary. | New apps never hold a shared secret. PlayMaker and Legends get separately revocable `sb_secret_…` keys in week one and lose them in M11. Until M11 the evidence bundle states that isolation covers new apps only. Test cross-app and cross-person isolation. |
```

### R3: An outside AI's long-lived credential must never be presented to an app
- **Why:** `soma.agent_partners.credential_hash` registers one global credential, and section 2.7 has each app expose `/agents/token`. An AI therefore presents the same bearer secret to every app it uses, and a malicious or compromised app can replay it at any other app within the AI's grants. Approval also lacks two bindings: nothing says the person approving must be the grant's principal, or that only the requesting AI may collect the approval token.
- **Change:** Move pairing and token issuance to the broker, issue app-audience tokens, and tighten approval. Replace the endpoint list and the paragraphs after it in section 2.7.

````diff
 GET /.well-known/soma-app.json
 GET /llms.txt
 GET /api/soma/v1/openapi.json
 GET /api/soma/v1/actions
-POST /api/soma/v1/agents/device-code
-POST /api/soma/v1/agents/token
 POST /api/soma/v1/actions/:id/prepare
 POST /api/soma/v1/actions/:id/execute
-POST /api/soma/v1/actions/:id/compensate
 GET /api/soma/v1/approvals/:id
 GET /api/soma/v1/receipts/:id
 GET /api/soma/v1/status
 ```
+
+Pairing and token issuance live on the identity origin, not on the app:
+
+```text
+GET  https://id.<SOMA_APEX>/.well-known/oauth-authorization-server
+POST https://id.<SOMA_APEX>/agents/device-code      (RFC 8628 device authorization)
+POST https://id.<SOMA_APEX>/agents/token            (device_code and refresh_token grants)
+GET  https://id.<SOMA_APEX>/.well-known/jwks.json
+```
+
+The app's `/.well-known/soma-app.json` names these URLs, so the AI still starts from the app's own URL.
+
+The AI's long-lived refresh credential is presented only to the broker.
+
+The broker exchanges it for an access token that lives at most 10 minutes. The token carries `aud = "app:<app_id>"`, `grant_id`, `scopes`, and `risk_ceiling`.
+
+An app accepts an agent token only when its signature verifies against the broker's JWKS and its `aud` names that app. A token captured by one app is therefore useless at any other app.
+
+The broker publishes RFC 8414 metadata so that the v1.1 MCP adapter can reuse the same authorization server instead of adding a second auth design.
+
+The unauthenticated device-code endpoint uses a database-backed rate limit per IP address and per app. PlayMaker's current in-memory, per-instance throttle (`playmaker/netlify/functions/agent-pair-start.ts`) does not hold across function instances.
+
+An approval has three bindings:
+
+- The `approval_url` must be on the app's registered origin or the identity origin. The page shows the requesting AI's label and the grant's principal.
+- Only the grant's principal, signed in, can confirm. Anyone else sees a refusal.
+- `GET /api/soma/v1/approvals/:id` returns the approval token only to an access token for the same `grant_id`. The token is single-use and expires within 10 minutes.
````

```diff
-| `soma.agent_partners` | `agent_id`, `principal_id`, `label`, `credential_hash`, `created_at`, `last_used_at`, `revoked_at` | Registers an AI relationship without granting app authority. |
+| `soma.agent_partners` | `agent_id`, `principal_id`, `label`, `refresh_credential_hash`, `created_at`, `last_used_at`, `revoked_at` | Registers an AI relationship without granting app authority. Only the broker ever sees the refresh credential. |
```

### R4: Keep receipts, idempotency, and resume state in each app's own schema; share only an index
- **Why:** The plan puts `action_receipts` (with `input_hash`, `effect_summary`, `reversal`) and `last_location` in the shared `soma` schema, which apps can reach only through the broker. Every Do action would then need a broker round trip before and after its effect, so the broker becomes a hard dependency of every write, the idempotency claim cannot share a transaction with the app's effect, and app-internal paths and effects flow into the shared schema. The receipt row also has no column for the stored output, so a replayed key cannot return the original result, and it has no in-flight state. PlayMaker already solved the in-flight case (`agent_command_requests` with `claimed`, `replay`, `pending`, `args_mismatch` in `playmaker/netlify/functions/agent-v1.ts`).
- **Change:**

```diff
-| `soma.memberships` | `person_id`, `app_id`, `app_person_id`, `role`, `trust`, `joined_at`, `last_seen_at`, `last_location`, `left_at` | The person reads their rows. App admins use a narrow broker call. |
+| `soma.memberships` | `person_id`, `app_id`, `app_person_id`, `role`, `trust`, `joined_at`, `last_seen_at`, `left_at` | The person reads their rows. App admins use a narrow broker call. |
```

```diff
-| `soma.action_receipts` | `receipt_id`, `app_id`, `action_id`, `version`, `idempotency_key`, `input_hash`, `actor_id`, `principal_id`, `grant_id`, `risk`, `status`, `effect_summary`, `reversal`, `created_at`, `completed_at` | Principal and actor read their rows. App admins receive redacted app rows. |
+| `soma.receipt_index` | `receipt_id`, `app_id`, `person_id`, `actor_id`, `action_id`, `risk`, `status`, `created_at` | Fed by each app's outbox. Holds no input, output, or effect text. Powers the person's cross-app receipt list and AI-grant audit. |
 | `soma.erasure_requests` | `request_id`, `person_id`, `scope`, `status`, `requested_at`, `effective_at`, `completed_at`, `receipt` | The person reads their requests. Platform workers update status. |
 
-The receipt table must have a unique constraint on `(app_id, action_id, principal_id, idempotency_key)`.
-
-Scoping the key to the principal means one person cannot block another person's action by guessing or reusing their key.
-
-Reusing an idempotency key with a different `input_hash` for the same principal must fail.
```

```diff
 | `feedback_outbox` | Retryable delivery to the estate board. |
+| `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `input_hash`, `actor_id`, `principal` (`app_person_id`), `grant_id`, `risk`, `status`, `effect_summary`, `output`, `undo_of`, `created_at`, `completed_at`. The canonical receipt and idempotency record. |
+| `receipt_outbox` | Retryable delivery of receipt index rows to `soma.receipt_index`. |
+| `last_location` | The person's resume point in this app (from `soma-app-template/supabase/migrations/0005_last_location.sql`). |
 | `app_changes` | Proposed, accepted, building, shipped, and rejected changes. |
```

Insert after "A conformance test must prove that one person cannot read another person’s rows.":

```markdown
`action_receipts` has a unique constraint on `(action_id, principal, idempotency_key)`. Scoping the key to the principal means one person cannot block another person's action by guessing their key.

`status` is one of `pending`, `succeeded`, `failed`, `refused`, `approval_required`, or `undone`.

Execution claims the key by inserting a `pending` row, runs the effect, then settles the row with its `output`. This is the pattern PlayMaker already runs in `agent_command_requests`; M8 generalizes it rather than adding a second one.

- A repeated key with the same `input_hash` and a settled row returns the stored `output` without repeating the effect.
- A repeated key while the row is `pending` returns HTTP 409 with `code: "idempotency_pending"` and `Retry-After`.
- A repeated key with a different `input_hash` returns HTTP 422 with `code: "idempotency_conflict"`.
- A `pending` row older than the action's declared timeout settles as `failed` with reason `abandoned`, and the same key may then be retried with the same input.

Erasure keeps the receipt's existence for the retention period but deletes `effect_summary` and `output` and replaces `principal` with a tombstone. Erasure deletes the person's `soma.receipt_index` rows.
```

```diff
-| Learn once, answer once, resume | An app does not repeat concepts or questions already settled and returns the person to useful context. | Respect accumulated understanding. | Guide `_recordSeen`; `soma-app-template/supabase/migrations/0005_last_location.sql`; Legends’ `guide_seen`. | Store versioned concept state and explicitly shareable answers centrally. Keep the last app location in the app membership. |
+| Learn once, answer once, resume | An app does not repeat concepts or questions already settled and returns the person to useful context. | Respect accumulated understanding. | Guide `_recordSeen`; `soma-app-template/supabase/migrations/0005_last_location.sql`; Legends’ `guide_seen`. | Store versioned concept state and explicitly shareable answers centrally. Keep the last app location in the app's own schema, because it is app-internal and changes on every navigation. |
```

### R5: Specify the session mechanics, and remove the local sign-in fallback that bypasses consent
- **Why:** Four gaps. (1) An opaque marker on an unvisited app's origin cannot exist, so step 1 of 2.2 cannot be how recognition starts; recognition happens only on the identity origin. (2) The plan does not say whether the browser or a function exchanges the code, how sessions refresh, or what `sub` holds; if `sub` were `auth_user_id`, every app would read a global ID through `auth.uid()`. (3) The broker's signing key is as powerful as the service-role key and should be described that way. (4) The manifest's `fallback: "local-sign-in"` means signing in directly to Supabase Auth inside the app, which hands the app a global `auth.uid()` session and skips the consent screen, defeating sections 2.2 and 2.3 whenever the broker is down. The existing marker key is `soma.known.device` (`packages/soma-signin/src/somaKnownDevice.js`), not `soma_known_device_v1`.
- **Change:**

```diff
-1. The app detects only an opaque local marker such as `soma_known_device_v1`.
-2. An app with an existing valid membership and session resumes silently.
-3. An unvisited app displays a neutral “Continue with SOMA” control.
+1. The app reads only its own opaque marker, `soma.known.device`, which `@soma/signin` already writes. The marker means only "this browser has signed in to this app before".
+2. An app with an existing valid membership and session resumes silently. An app with the marker but no session shows "Come back in".
+3. Every other visitor sees the same neutral “Continue with SOMA” control. An unvisited app cannot tell whether a visitor is known to SOMA. Only the identity origin, which keeps its own first-party session, can recognize the person.
```

```diff
-10. The app exchanges the code with the PKCE verifier.
-11. The result contains an app-scoped session, pairwise `app_person_id`, and only consented profile fields.
+10. The app's Netlify Function, not the browser, exchanges the code. It presents the PKCE verifier and the app's installation credential.
+11. The function sets a rotating refresh token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie on the app's origin. It returns a 15-minute access JWT, the pairwise `app_person_id`, and only consented profile fields to the browser.
```

```diff
-Static apps receive short-lived Supabase JWTs minted by the broker after authorization.
-
-Each JWT carries `app_id` and `app_person_id` claims and lets the browser call PostgREST directly against its own app's RLS-protected `app_<app_id>` tables.
+Every pairwise app, React or static, receives short-lived Supabase JWTs minted by the broker after authorization.
+
+Each JWT has `sub = app_person_id`, `role = "authenticated"`, an `app_id` claim, and no email. Supabase's `auth.uid()` reads `sub`, so ordinary RLS idioms keep working and return the pairwise ID. The JWT lets the browser call PostgREST directly against its own app's RLS-protected `app_<app_id>` tables.
+
+The broker's signing key can mint a token for any database role, so it is as powerful as the service-role key. The broker refuses to mint any role other than `authenticated`, and the key exists only in the broker's environment.
+
+A pairwise app has no local sign-in fallback. Signing in directly to Supabase Auth inside the app would give it a global `auth.uid()` and skip the consent screen. During a broker outage, existing access tokens run to expiry, public pages and Ask over public knowledge keep working, and the sign-in control states the outage and shows the human host's contact route.
```

````diff
     "identity_broker": {
       "required": true,
-      "fallback": "local-sign-in"
+      "fallback": "existing-sessions-and-public-pages"
     },
````

```diff
-| The broker becomes a single point of failure. | Declare local sign-in and static help fallbacks. Test broker failure in the live journey. |
+| The broker becomes a single point of failure. | Keep existing sessions running to expiry, keep public pages and public-knowledge Ask working, and show the outage with the human contact route. Test broker failure in the live journey. Never fall back to in-app Supabase Auth sign-in for a pairwise app. |
```

```diff
-3. A person already known to another SOMA app sees a neutral recognition offer.
+3. A person already known to another SOMA app sees the same neutral offer a stranger sees. One tap on the identity origin then recognizes them without re-entering credentials.
```

### R6: Add the person-facing API the Guide and settings pages need, and make undo a receipt operation
- **Why:** The endpoint list has no route for recording concept state, reading or storing answers, export, forgetting, listing or revoking AI grants, or listing receipts, yet browsers cannot touch the `soma` schema and the CDN Guide has no server of its own. The Guide already calls an injected `cfg.identity.recordSeen` hook (`packages/soma-guide/soma-guide.js`, `_recordSeen`), so these routes are what that hook needs. Separately, the plan's own example would fail C14: `coaching.save-reflection` declares `"compensation": "coaching.delete-reflection"`, an action the manifest never declares. The TypeScript interface also has a `compensate` method, so compensation is defined two incompatible ways. The `idempotent` field is redundant because every mutating request requires an `Idempotency-Key`.
- **Change:** Add to section 2.7, after the app endpoint list:

````markdown
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
````

````diff
-  compensate?: (
+  undo?: (
     context: ActionContext,
     receipt: ActionReceipt
   ) => Promise<ActionReceipt>;
````

```diff
   effects: string[];
-  idempotent: boolean;
   concept?: { id: string; version: string };
```

```diff
       "effects": ["Creates a private reflection"],
-      "idempotent": true,
-      "compensation": "coaching.delete-reflection"
+      "undoable": true
     }
```

Also delete `"idempotent": true,` from `coaching.inspect-agenda` in the same example, and in C4 replace "and idempotency behavior" with "and, for effect actions, whether they are undoable". An action with `undoable: true` must implement `undo`, and conformance C7 calls `POST /receipts/:id/undo` on it once.

### R7: Name the shared-project provisioning step and count it in the stand-up test
- **Why:** A new app cannot run until someone with shared-project authority registers it: `soma.apps`, hosts, origins, an installation credential, an `app_<app_id>` schema, and its migrations. Three concrete traps are unaddressed. (1) PostgREST serves only schemas listed in the project's exposed-schemas setting, which is project-wide. (2) `supabase db push` keeps one migration history per project, and that history already holds PlayMaker's `0001`–`0087`, so a second repository's `0001_…` collides. (3) Netlify's per-deploy preview URLs (`deploy-preview-N--site.netlify.app`) change every deploy and cannot be exact-match redirect URIs. Also, `veric-coaching` is not a valid unquoted Postgres schema name. Today `provision.sh` is not wired for react-app output (`packages/soma-scaffolder/README.md`, Status).
- **Change:** Insert as section 2.4a, after "Per-app schema":

```markdown
### 2.4a Registering an app in the shared project

`soma-scaffold register <soma-app.json>` registers an app. The platform steward seat runs it, because it needs the Supabase Management API token. The builder never holds that token.

Registration is idempotent and does five things:

1. Inserts or updates `soma.apps`, `soma.app_hosts`, and the registered origins.
2. Creates schema `app_<app_id>` with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`), grants `usage` to `authenticated`, and appends the schema to PostgREST's exposed schemas through the Management API. It reads the current list and appends; it never replaces the list, because the setting is project-wide.
3. Applies the app's migrations with `soma-scaffold migrate`, which records history in `app_<app_id>.schema_migrations`. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's `0001`–`0087` and a second repository's `0001_…` would collide.
4. Mints the installation credential and sets it in the app's Netlify environment with the command's output redirected, so the secret is never printed.
5. Registers exactly two redirect origins at prototype tier: the production origin and one fixed branch-deploy alias, `https://preview--<site>.netlify.app`. Per-deploy URLs are not registrable, and no wildcard is ever accepted.

Running `register` is not an edit to `soma-platform`, so it does not fail the second-app test. Its time counts toward the 30-minute deploy-preview target.
```

```diff
-    "origins": ["https://deploy-preview.example.netlify.app"],
+    "origins": ["https://preview--veric-coaching.netlify.app"],
```

### R8: Reconcile the action model with the PlayMaker registry it is extracted from
- **Why:** PlayMaker's registry (`playmaker/src/agent-portal/types.ts`) has three kinds, `effect`, `view`, and `inspection`, and surfaces `page | remote`; `catalogue.ts` declares 20 effect, 5 view, and 4 inspection commands. A `view` command changes only the screen and runs in the browser, so the server-side risk gate, receipts, and idempotency do not apply to it, and the plan's `SomaAction` has no place for it. The plan also says "Actions require a person session" while allowing `requiredRole: "visitor"`, and C5 says "non-inspection" while the risk enum says `observe`. Finally, the risk table gives the in-app AI host a column but never says which grant it acts under.
- **Change:**

```diff
 export interface SomaAction<I, O> {
   id: string;
   version: string;
   title: string;
   description: string;
-  risk: SomaRisk;
+  kind: "view" | "observe" | "effect";
+  risk?: Exclude<SomaRisk, "observe">;   // required when kind is "effect"
```

Insert after "The server enforces the risk gate.":

```markdown
`kind` maps one-to-one onto PlayMaker's registry: `view` is PlayMaker's `view`, `observe` is `inspection`, and `effect` is `effect` with a declared risk.

A `view` action changes only what is on the person's screen. It runs in the browser, writes no receipt, needs no idempotency key, and may list only the `ui` and `guide` surfaces, because a remote AI must not drive a person's screen.

`requiredRole: "visitor"` is allowed only for `view` and `observe` actions over public data. Every `effect` action requires a person session or an agent access token.

The in-app AI host acts inside the person's current session under an implicit session grant capped at `reversible`. Its receipts record the AI host's `actor_id` and the person as principal.
```

```diff
-| C5 | Every non-inspection action has a UI binding or a reviewed `ui_exception`. An exception is allowed only for `reversible` actions whose receipts offer undo in the UI. |
+| C5 | Every `effect` action has a UI binding or a reviewed `ui_exception`. An exception is allowed only for `reversible` actions whose receipts offer undo in the UI. |
```

### R9: The canonical invitation RPC trusts a caller-supplied app and checks PlayMaker's membership
- **Why:** The plan makes `@soma/tickets` the sole invitation implementation and keeps its API, and it rejects caller-supplied `app_id` in general. But `public.ticket_create(p_app, …)` (`packages/soma-tickets/sql/schema.sql`) is `SECURITY DEFINER`, is granted to every `authenticated` user, takes the app from the caller, and admits the inviter by checking `public.memberships`, which is PlayMaker's studio-membership table. The shared project has open signup (`packages/soma-assist-core/sql/assist-rls.sql`, header), so any PlayMaker member can mint invitations under any app's name, and a member of a new app who is not a PlayMaker member cannot mint any.
- **Change:**

```diff
-| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation implementation. Preserve its existing API for one compatibility release. |
+| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation implementation. Add `ticket_create_v2`, which takes the app from the broker JWT's `app_id` claim (or from the broker for legacy-global apps) and admits the inviter by `soma.memberships` role under that app's invitation policy. Restrict the existing `ticket_create(p_app, …)` to `p_app = 'playmaker'` until PlayMaker moves to v2, then retire it. |
```

Add to section 3.3:

```diff
 | C12 | Cross-person and cross-app RLS probes fail, including direct PostgREST probes made with a broker-minted JWT for another person, another app, or the `soma` schema. |
+| C12a | Every `SECURITY DEFINER` function the app can call derives its app from authenticated context. A probe passing another app's ID as an argument fails. |
```

### R10: Make the pinned Guide actually pinned, and keep the moving channel for existing consumers
- **Why:** `soma-guide.js` imports `https://esm.sh/@elevenlabs/client@latest` at runtime (`ELEVENLABS_ESM`, used by `_loadConvClass`). Subresource Integrity covers only the top-level file, so a pinned, SRI-checked Guide still executes whatever esm.sh serves as "latest", with full page privileges, on every consumer. Also, the CDN today serves only the moving root path (`/soma-guide.js`, `Cache-Control: public, max-age=300` in `dist/_headers`), which Levinese, the AGI-26 properties and other non-kit sites load; the plan does not say what happens to them, and the current version string is a date (`SOMA_GUIDE_VERSION = '2026-0727a'`), not semver.
- **Change:**

```diff
-| `soma-platform/packages/soma-guide` | Keep on the CDN. Publish immutable semantic-version paths and SRI hashes. |
+| `soma-platform/packages/soma-guide` | Keep on the CDN. Publish immutable semantic-version paths and SRI hashes. Bundle a pinned `@elevenlabs/client` into each release instead of importing `esm.sh/@elevenlabs/client@latest` at runtime. Keep the root path as the moving channel for non-kit consumers. |
```

Insert after "The updater must refuse to overwrite locally modified vendored files." in section 2.8:

```markdown
A Guide release loads no code from outside its own immutable version path. `deploy-guide.sh` fails a release whose bundle contains a remote `import()` URL, and the Guide refuses a `voiceAgentEsmUrl` override unless the lock file lists it with an integrity hash.

`deploy-guide.sh` publishes each release twice: to `/v<semver>/` with `Cache-Control: public, max-age=31536000, immutable`, and to the root path that existing non-kit consumers load. Kit apps load only the versioned path. `dist/releases.json` maps each semver to its `SOMA_GUIDE_VERSION` date string and integrity hash.
```

### R11: Say what answers Ask, and count its setup in the stand-up test
- **Why:** The plan never names Ask's runtime. Today the Guide converses through an ElevenLabs Conversational AI agent per app (`_loadConvClass` and `_startConversation` in `soma-guide.js`; the v0 spec's `affordances.guide.persona.assistant_id`), grounded by a `knowledge.js` that `tools/build-guide-knowledge.mjs` compiles. So every Guide-enabled app sends the person's words to ElevenLabs, yet the plan's example `data_flows` lists only Anthropic. Creating that agent is also a manual step the scaffolder README still lists as open, and the four-hour test does not count it.
- **Change:**

```diff
-| Ask, Show, and Do | The person can ask for an explanation, see the relevant controls, or ask the host to act. | Alignment joins understanding with agency. | `packages/soma-guide`; PlayMaker `src/agent-portal/`; Legends Guide actions. | Make one typed action registry serve the UI, Guide, and outside AIs. Bind controls with `data-soma-action="<id>"`. |
+| Ask, Show, and Do | The person can ask for an explanation, see the relevant controls, or ask the host to act. | Alignment joins understanding with agency. | `packages/soma-guide`; PlayMaker `src/agent-portal/`; Legends Guide actions. | Make one typed action registry serve the UI, Guide, and outside AIs. Bind controls with `data-soma-action="<id>"`. In-app Ask runs on the app's ElevenLabs Conversational AI agent, grounded in knowledge compiled from the manifest's concepts. An outside AI's Ask needs no SOMA inference: it reads `/llms.txt` and `/knowledge/*.md`. |
```

```diff
     "ai": {
       "id": "veric",
       "name": "V'Eric",
       "role": "AI host",
-      "persona": "personas/veric.md"
+      "persona": "personas/veric.md",
+      "guide_agent": "elevenlabs:<agent_id>"
     }
```

```diff
   "data_flows": [
+    {
+      "vendor": "ElevenLabs",
+      "what": "Questions typed or spoken to the Guide",
+      "why": "Run the in-app AI host's conversation",
+      "retention": "Declared by the operator"
+    },
     {
       "vendor": "Anthropic",
```

Add to section 3.3:

```diff
 | C19 | Credits name human and AI contributors and record model or substrate when known. |
+| C19a | When the Guide is enabled, `data_flows` declares the Guide's conversation vendor, and the compiled Guide knowledge contains every concept's `tell` file. |
```

Add to the list of what the second-app manifest must already contain in section 5: "- The AI host's Guide agent, created by `soma-scaffold register` from the persona file through the ElevenLabs API, or its manual creation time counted inside the four hours."

### R12: Say which outside AIs can complete the door, and plan MCP on the same authorization server
- **Why:** Consumer chat AIs whose only web tool fetches pages (as of this writing, ChatGPT and Claude chat browsing and Gemini) can send GET requests but not POSTs with headers. They can read discovery and knowledge, but they cannot pair or execute. The full Golden Journey therefore needs an AI with an HTTP or code tool (Claude Code, Codex, ChatGPT agent mode), and the plan should say so rather than imply any assistant can do it. Claude and ChatGPT connectors speak MCP, so MCP is where most people's own AIs will act; it should reuse the broker from R3 rather than wait for a new auth design.
- **Change:**

```diff
-A generated MCP adapter is a v1.1 feature.
+Outside AIs fall into two classes. A chat AI that can only fetch pages can read discovery, `/llms.txt`, and public knowledge, and can tell its person how to connect an AI that can act. An AI with an HTTP or code tool can pair, receive grants, and act. M0 records which current assistants fall in each class.
+
+A generated MCP adapter is the first v1.1 feature. It is generated from the same action registry and uses the broker's OAuth metadata and per-app grants from this section, because Claude and ChatGPT connectors speak MCP rather than OpenAPI.
```

```diff
-13. An outside AI discovers the app from its URL without vendor-specific instructions.
+13. An outside AI with an HTTP tool discovers the app from its URL without vendor-specific instructions. The evidence names the AI and its tool.
+13a. A chat AI that can only fetch pages explains the app correctly from `/llms.txt` and tells the person how to connect an AI that can act.
```

### R13: Stop one app from reading another app's concept state, and define what each state suppresses
- **Why:** "Apps may query only concepts declared in their manifest" lets app B declare `playmaker:stage-read` and so learn that a person uses PlayMaker. Also, `soma:` concept state is cross-app information, but the consent screen in 2.2 lists only profile fields. The plan also never says which state suppresses which behavior, so "do not re-teach" has no testable meaning.
- **Change:**

```diff
-| `soma.concept_state` | `person_id`, `concept_id`, `concept_version`, `state`, `source_app_id`, `first_at`, `last_at`, `evidence` | Apps may query only concepts declared in their manifest. |
+| `soma.concept_state` | `person_id`, `concept_id`, `concept_version`, `state`, `source_app_id`, `first_at`, `last_at`, `evidence` | An app may read and write only `soma:*` concepts and concepts in its own `<app_id>:` namespace. `soma:*` state reaches an app only after consent. |
```

```diff
-7. The identity origin shows the person’s name, the destination app, and the fields that will be disclosed.
+7. The identity origin shows the person’s name, the destination app, and the fields that will be disclosed. When the app declares `soma:` concepts, the list includes "SOMA basics you have already seen".
```

Insert after "A new concept version is not automatically treated as understood." in section 2.5:

```markdown
Declaring a concept outside `soma:` and the app's own namespace fails C3.

`told` suppresses the unprompted introduction of the concept.

`shown` and `acknowledged` also suppress the automatic start of its Show workflow. `acknowledged` means the person said they already know it.

`done` means the person completed the concept's action at least once.

No state suppresses an explicit request. Ask and Show always answer when the person asks.
```

### R14: Hash the whole contract, not only the manifest file
- **Why:** The manifest references other files (`input_schema`, `output_schema`, `persona`, `tell`). A changed input schema leaves the manifest's canonical hash unchanged, so the beacon, the lock check, and C20 would report a contract as unchanged when its enforced shape has changed.
- **Change:**

```diff
-The manifest hash is the SHA-256 of the manifest's RFC 8785 (JSON Canonicalization Scheme) form, so reformatting the file does not change the hash.
+The contract hash, `contract_sha256`, is the SHA-256 of the RFC 8785 (JSON Canonicalization Scheme) form of `{ "manifest": <manifest>, "files": { "<path>": "<sha256 of file bytes>" } }`, where `files` lists every path the manifest references. Reformatting the manifest does not change the hash. Changing a referenced schema, persona, or knowledge file does.
```

Rename `manifest_sha256` to `contract_sha256` in the `soma.apps` row, and "manifest hash" to "contract hash" in the proof-beacon row of 1.1, C20, and Golden Journey step 22.

### R15: Follow PlayMaker's actual ship rule, and keep its existing AI routes working
- **Why:** Section 4.2 invents a "preview" and an "agreed weekly day" for screens Eric uses. Mike's standing rule for PlayMaker is direct-to-production after `pr-merge-green`, gated on typecheck, build, and the full test suite, because saved passwords autofill only on the production domain and previews are inconvenient for him to review. No weekly ship day is recorded anywhere. Also, outside AIs and PlayMaker's `llms.txt` already use `/api/agent/v1/*` (`netlify.toml`) and `/api/agent-pair-start`, `-poll`, and `-approve`; renaming them breaks paired AIs that the plan promises to keep valid. And M8 says to "add" idempotency, which PlayMaker already has.
- **Change:**

```diff
-A screen Eric uses ships only after preview and on the agreed weekly day.
+PlayMaker ships straight to production after `pr-merge-green`, gated on typecheck, build, and the full test suite (its default branch is `master`). A kit change that alters a screen lands behind a flag that defaults off. Flipping the flag is the user-visible release, and it happens only after Eric or Mike has seen the screen. A deploy preview is used only where tests cannot cover the risk, and then with a test login that works only outside production, because saved passwords autofill only on the production domain.
+
+PlayMaker's existing AI routes (`/api/agent/v1/*`, `/api/agent-pair-start`, `/api/agent-pair-poll`, `/api/agent-pair-approve`) keep working as aliases for at least 90 days after the `/api/soma/v1/*` routes ship. `public/llms.txt` lists both during that window.
```

```diff
-| M8: PlayMaker action PRs | Replace internal registry imports with the vendored package. Add receipts and idempotency in shadow mode. | Existing UI and Agent API produce equivalent outcomes. Shadow receipts agree before cutover. |
-| M9: PlayMaker identity and plumbing PRs | Adopt identity, tickets, feedback, concept state, and changelog through separate flagged adapters. | Eric’s current workflow passes before and after each flag. Screen changes appear in preview before the weekly ship day. |
+| M8: PlayMaker action PRs | Replace internal registry imports with the vendored package. Generalize the existing `agent_command_requests` idempotency into receipts, in shadow mode. Move the agent seam from the legacy JWT secret to broker-issued agent tokens. | Existing UI and Agent API produce equivalent outcomes. Shadow receipts agree before cutover. Paired agents keep working through the alias routes. |
+| M9: PlayMaker identity and plumbing PRs | Adopt identity, tickets, feedback, concept state, and changelog through separate flagged adapters. | Eric’s current workflow passes with each flag off and on. Each flag ships off and is flipped only after Eric or Mike has seen the screen. |
```

### R16: Make live conformance safe to run against the one shared production project, and give the beacon a place to read from
- **Why:** There is one shared Supabase project, so every live journey (sign-in, cross-app recognition, grants, receipts) writes into production identity tables. The known-person journey also needs a second registered app the person already belongs to, and automated sign-in cannot depend on reading a magic-link email. Separately, the status endpoint must report "the last live conformance result", but conformance runs in CI or on a builder's machine, and no table stores the result.
- **Change:** Add to section 2.4's shared schema:

```diff
 | `soma.erasure_requests` | `request_id`, `person_id`, `scope`, `status`, `requested_at`, `effective_at`, `completed_at`, `receipt` | The person reads their requests. Platform workers update status. |
+| `soma.conformance_runs` | `run_id`, `app_id`, `release_sha`, `contract_sha256`, `tier`, `result`, `failed_checks`, `evidence_url`, `runner_actor_id`, `ran_at` | Written by the conformance runner through the broker with the steward's conformance credential. Read by `/api/soma/v1/status`. |
```

```diff
-| `soma.people` | `person_id`, `auth_user_id`, `display_name`, `locale`, `timezone`, `created_at`, `erased_at` | The person owns the row. Apps never receive `person_id`. |
+| `soma.people` | `person_id`, `auth_user_id`, `display_name`, `locale`, `timezone`, `is_test`, `created_at`, `erased_at` | The person owns the row. Apps never receive `person_id`. |
```

Insert after the conformance commands in section 3.3:

```markdown
Live journeys run against the shared production project, so they use only test people (`soma.people.is_test = true`).

The broker exposes a test sign-in that works only for test people and only with the conformance credential the steward seat holds. Automated journeys never wait for a magic-link email.

A permanently registered fixture app, `soma-fixture`, gives each test person a prior membership, so the known-person journey always has an "other SOMA app".

Each run deletes its test memberships, grants, answers, and receipts when it finishes. Metrics and the estate board exclude test people.
```

### R17: Settle `soma-assist-core`'s own feedback and heartbeat path
- **Why:** The plan calls `soma-assist-core` an internal Guide dependency, but it is also the chat shell for Adrian and Yeshie, and it ships its own feedback client (`assist_submit_feedback`, routing to `yeshie`, `soma-guide`, or `common`) and heartbeat client (`assist_record_heartbeat`). Both write shared `public.assist_*` tables with the anonymous key and a caller-supplied `appId` (`packages/soma-assist-core/README.md`). That is a third feedback path and the caller-supplied-app pattern the plan rejects.
- **Change:**

```diff
-| `soma-platform/packages/soma-assist-core` | Keep as an internal Guide dependency. Do not create a second public chat contract. |
+| `soma-platform/packages/soma-assist-core` | Keep the chat shell as an internal Guide dependency. Do not create a second public chat contract. Its feedback and heartbeat clients stay only for the Adrian and Yeshie browser extensions. A SOMA app never loads them: app feedback goes through `@soma/feedback`, and app health goes through `/api/soma/v1/status`. |
```

### R18: Send the feedback outbox somewhere that does not depend on the Mac
- **Why:** "The estate board" is `SOMA/board/inbox/` on Mike's Mac, which runs the estate's operations plane with no failover. An outbox that delivers to the Mac makes every app's feedback delivery depend on one laptop being awake. The plan also does not say what runs the outbox or what happens to an event that never delivers.
- **Change:**

```diff
-| `feedback_outbox` | Retryable delivery to the estate board. |
+| `feedback_outbox` | Retryable delivery to `soma.estate_inbox` through the broker. A Netlify scheduled function in each app drains it every five minutes with exponential backoff. An event undelivered after 24 hours is marked dead-lettered, and the status endpoint reports the count. |
```

Add to the shared schema:

```diff
+| `soma.estate_inbox` | `event_id`, `app_id`, `kind`, `payload`, `received_at`, `claimed_at` | Written only by the broker. The Mac-side board importer reads and claims rows, so apps never depend on the Mac being up. |
```

### R19: Replace the product question a model can settle with one only Mike can answer
- **Why:** Question 2 (may an app show the name before acceptance) is already decided by section 2.2 and enforced by C11, so it is not open. The decision that genuinely needs Mike concerns a person: Eric's agreement to a sequence of kit pull requests in his repository and who flips the flags on screens he uses. Question 1 also omits two facts that change its answer: the identity origin is expensive to move later, because sessions, saved passwords, and any passkeys bind to it, and DNS for `mike-wolf.com` is edited only in the GoDaddy web interface, which is Mike's hands.
- **Change:**

```diff
 1. **Which domain should own SOMA identity?**  
-   Recommendation: use a neutral SOMA-controlled apex for the permanent identity. Use `id.mike-wolf.com` only as a reversible v1 host if no neutral apex is ready.
+   Recommendation: use a neutral SOMA-controlled apex for the permanent identity, and decide it before the first real person signs in, because sessions, saved passwords, and passkeys bind to that origin and moving it later forces everyone to sign in again. Until then, the preview broker runs on a Netlify subdomain with test accounts only, so the two-week release needs no DNS change. If the answer is `id.mike-wolf.com`, the DNS record is a GoDaddy step only Mike can perform.
 
-2. **May an unvisited app display a recognized person’s name before they accept?**  
-   Recommendation: no. The identity origin may show the name inside the consent screen, but the destination app receives it only after acceptance.
+2. **Will you ask Eric to accept the PlayMaker kit sequence, and who flips flags on screens he uses?**  
+   Recommendation: ask Eric once to approve the M7–M9 sequence as a batch. Claude merges each pull request under the existing direct-to-production rule with its flag off. Eric flips each flag that changes a screen he uses; Mike flips it if Eric has not responded within a week.
```

### R20: Rebalance the two-week release around the work it omitted
- **Why:** R2, R7, and R16 add work the two-week plan cannot skip: per-app secret keys, `register` and `migrate`, the fixture app, and test people. The generated static reference fixture already proves the static path, so the Legends preview adds regression risk across Legends' Guide configurations without adding new proof, and Legends is not on the current portfolio's first two lines (`_estate/LEAD.md`: PlayMaker to paying writers, then the app kit). The Legends preview moves to week three; M6 keeps its place in the migration order.
- **Change:**

```diff
 - A generated React reference app.
 - A generated static reference fixture.
 - An immutable Guide release path.
-- One Legends deploy preview.
+- `soma-scaffold register` and `soma-scaffold migrate`.
+- The `soma-fixture` app and test people for live journeys.
+- Separate revocable secret keys for PlayMaker and Legends.
 - One manifest-only PlayMaker pull request.
```

```diff
 The two-week release cuts:
 
+- The Legends deploy preview, which moves to week three.
 - Production PlayMaker identity migration.
```

```diff
-| 11–12 | Legends preview migration | PlayMaker manifest-only PR | Security, privacy, and accessibility review |
+| 11–12 | `register`, `migrate`, the fixture app, and test people | PlayMaker manifest-only PR and per-app secret keys | Security, privacy, and accessibility review |
```

```diff
-The release is complete only when the reference app and Legends preview pass the same live conformance command.
+The release is complete only when the generated React reference app and the generated static reference fixture pass the same live conformance command.
```

### R21: Make accessibility a conformance check, not only a review day
- **Why:** Show works by highlighting controls, and the likely next audiences include older adults (OLLI). The plan mentions accessibility only once, as a review on days 11–12, so nothing fails loudly when a Show workflow cannot be followed by keyboard or screen reader.
- **Change:**

```diff
 | C20 | The live status endpoint reports the tested release SHA, canonicalized manifest hash (RFC 8785), result, and timestamp. |
+| C21 | Every Golden Journey page has no serious or critical axe-core violations at 1280 px and 375 px. Every Show step's target is reachable by keyboard, and the step's text is announced through an `aria-live` region. |
```

### R22: Move the merge history out of the builders' path
- **Why:** A builder opening the plan reads 60 lines about which source model contributed what before reaching the first requirement. The decision table is useful; the provenance lists are history and belong at the end, where credit is still visible.
- **Change:** Rename "## Merge notes" to "## Appendix A: Merge notes" and move it, with "What I took from …" and "Rejected from the source plans", to the end of the document, before the authorship line. Keep "Disagreements resolved" at the top as "## 0. Decisions", unchanged except for R1's edit.

### R23: Small corrections
- **Why:** Three citations are wrong or incomplete.
- **Change:**

```diff
-| Credits and provenance | The person can see which human or AI created or changed an artifact. | Every mind receives credit and remains accountable. | `SOMA/standards/SIGNATURES-AND-BYLINES.md`; `SOMA-STD-credits.md`. | Store actor, principal, app, action, model or substrate when known, artifact, and time. Use server-signed receipts in v1. |
+| Credits and provenance | The person can see which human or AI created or changed an artifact. | Every mind receives credit and remains accountable. | `SOMA/standards/SIGNATURES-AND-BYLINES.md`; `SOMA/standards/SOMA-STD-credits.md`. | Store actor, principal, app, action, model or substrate when known, artifact, and time. Use server-signed receipts in v1. |
```

In section 1.2, note that `@soma/signin`, `@soma/tickets`, `@soma/meter`, and `@soma/feedback` are already vendored by react-app mode with a `VENDORED.md` recording the source commit (`packages/soma-scaffolder/README.md`); `soma-kit.lock.json` replaces `VENDORED.md` rather than adding a second record. In section 2.8, note that the Guide's package name is `@soma-platform/soma-guide`, not `@soma/guide`.


