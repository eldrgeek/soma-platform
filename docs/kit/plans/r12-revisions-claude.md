# Revisions, round 12, Claude Opus 5.5

### R1: Close cross-app capture through PostgreSQL's temporary schema
- **Why:** PostgreSQL searches the session's temporary schema first for table, view, and type names unless `pg_temp` is listed explicitly in `search_path`. Every role holds `TEMPORARY` through `PUBLIC` by default, and Supavisor's transaction mode reuses one backend session for transactions from different apps. So one app's RPC can leave a temporary table named like another app's table (the M3 template rewrite tells builders to use unqualified names), grant it to `PUBLIC`, and capture that app's reads and writes in a later transaction on the same connection. The plan's own `search_path` rule (`pg_catalog` plus the app schema) is the documented vulnerable form.
- **Change:**

```diff
-**RLS.** Every table has RLS enabled and forced. Table-owner roles are never used at runtime. Every `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role, sets `search_path` to `pg_catalog` plus its exact app schema, obtains identity only from the platform request-context accessors, and returns explicit columns. Conformance must prove that neither the broker, nor the runtime role, nor any registered RPC can read or change another person's or another app's rows, and that no table owner is on the runtime path (C12, C12a).
+**RLS.** Every table has RLS enabled and forced. Table-owner roles are never used at runtime. Every `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role, sets `search_path` to exactly `pg_catalog, app_<app_id>, pg_temp`, obtains identity only from the platform request-context accessors, and returns explicit columns. Conformance must prove that neither the broker, nor the runtime role, nor any registered RPC can read or change another person's or another app's rows, and that no table owner is on the runtime path (C12, C12a).
+
+**Temporary-schema shadowing.** PostgreSQL searches the session's temporary schema before every other schema for table, view, and type names unless `pg_temp` is named explicitly in `search_path`. Every role can create temporary tables through the default `PUBLIC` grant, and the pooler reuses one database session for transactions from different apps. So `pg_temp` must come last in every app and platform function's `search_path`, and every statement that the broker or the platform wrapper sends must schema-qualify its relations. Otherwise one app's RPC could leave a temporary table with another app's table name, grant it to `PUBLIC`, and receive that app's reads and writes in a later transaction. If the M0 catalog baseline shows no legacy dependency on temporary tables, also revoke `TEMPORARY` on the database from `PUBLIC`.
```

```diff
 - Every broker transaction sets `statement_timeout` to 5 seconds.
+- Every SQL statement the broker and the platform wrapper send names its schema, and every platform-owned function sets a `search_path` that ends with `pg_temp` (section 2.4, temporary-schema shadowing).
```

```diff
-- Inside the same transaction, after each migration, the runner queries the catalog. It rolls the migration back if either schema now holds any of these: a privilege granted to `PUBLIC`, `anon`, or `authenticated`; a table without both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; a runtime role that owns a table or holds a DDL privilege; an API function that is not owned by the runtime role or lacks a `search_path` fixed to `pg_catalog` plus the app's own schema; a view without `security_invoker = true`; a materialized view or foreign table; or an object outside the app's two schemas.
+- Inside the same transaction, after each migration, the runner queries the catalog. It rolls the migration back if either schema now holds any of these: a privilege granted to `PUBLIC`, `anon`, or `authenticated`; a table without both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; a runtime role that owns a table or holds a DDL privilege; a function in either schema whose `search_path` is not exactly `pg_catalog, app_<app_id>, pg_temp`, or an API function that is not owned by the runtime role; a view without `security_invoker = true`; a materialized view or foreign table; or an object outside the app's two schemas.
```

```diff
-| C12a | Every callable `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role, every app table forces RLS, and request context comes from the platform wrapper. In a pairwise app, probes fail that pass another app's or person's identifier as an argument, call `set_config` to forge context, or invoke the function as the runtime role outside the wrapper. In a legacy-global app, ...
+| C12a | Every callable `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role, every app table forces RLS, and request context comes from the platform wrapper. In a pairwise app, probes fail that pass another app's or person's identifier as an argument, call `set_config` to forge context, or invoke the function as the runtime role outside the wrapper. A probe RPC in one fixture app creates a `PUBLIC`-granted temporary table named like a table of the other fixture app and like each table the broker and wrapper use; the next transactions on the same pooled connection, for the other app and for the broker, never read or write it. In a legacy-global app, ...
```

(The `...` stands for the unchanged remainder of the C12a row.)

### R2: Make the migration runner unable to leave the app's role
- **Why:** Both app roles are declared no-login, and Appendix A says the runner "may assume the owner role". That means a privileged session running `SET ROLE`, and any migration can run `RESET ROLE` to return to that privileged session user and change `soma`, `auth`, or another app's schema. A `COMMIT` in the migration text also commits before the in-transaction catalog check can roll anything back. The post-migration check inspects only the app's two schemas, so it cannot see either escape. The claim that the runner "cannot create roles, extensions, …" is therefore unenforced.
- **Change:**

```diff
-Each app has two no-login roles. `app_<app_id>_owner` owns the app's tables and is used only by the migration runner. `app_<app_id>_runtime` owns the app's API functions, owns no tables, and has no DDL privilege. A table owner is exempt from RLS unless the table forces it, so this split is what keeps runtime functions subject to RLS.
+Each app has two roles. `app_<app_id>_owner` owns the app's tables and is used only by the migration runner, which logs in as that role (Appendix A, M3). It can log in only during a migration run. `app_<app_id>_runtime` cannot log in. It owns the app's API functions, owns no tables, and has no DDL privilege. A table owner is exempt from RLS unless the table forces it, so this split is what keeps runtime functions subject to RLS.
```

```diff
-**Registration: schemas and roles** [2.4a, step 2]. Hyphens in the validated app ID (section 3.1) become underscores (`veric-coaching` becomes `app_veric_coaching`). Before creating anything, registration fails loudly if any derived schema or role name already exists for another app. The platform, not either app role, owns both schemas. The migration runner may assume the owner role; deployed code never can. Registration also runs `ALTER DEFAULT PRIVILEGES FOR ROLE <app owner> REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.
+**Registration: schemas and roles** [2.4a, step 2]. Hyphens in the validated app ID (section 3.1) become underscores (`veric-coaching` becomes `app_veric_coaching`). Before creating anything, registration fails loudly if any derived schema or role name already exists for another app. The platform, not either app role, owns both schemas. Neither app role is a member of any other role. Deployed code never holds the owner role's password. Registration also runs `ALTER DEFAULT PRIVILEGES FOR ROLE <app owner> REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.
```

```diff
-- The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as the app's owner role, constrained to that app's two schemas.
-- It cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. Tables stay owned by the owner role. After each migration the runner transfers every function in `app_<app_id>_api` to the runtime role.
+- The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally on its own connection whose session user is `app_<app_id>_owner`. It never connects as a privileged role and switches with `SET ROLE`, because migration SQL could run `RESET ROLE` to return to that privileged session user. For each run the steward's session gives the owner role `LOGIN` and a random password that expires (`VALID UNTIL`) when the run ends. The password never leaves the runner process.
+- Before executing, the runner refuses a migration whose text contains, outside a dollar-quoted function body, a transaction-control statement (`BEGIN`, `START TRANSACTION`, `COMMIT`, `END`, `ROLLBACK`, `SAVEPOINT`, `PREPARE TRANSACTION`) or a `SET` or `RESET` of `role` or `session_authorization`. A text check can be evaded, so the runner also reruns the full catalog check after commit. If that check fails, the runner records the migration as failed, the broker refuses every contract that carries its checksum, and an estate event reaches `kit-steward`.
+- Because the session user is the owner role, a migration cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. Tables stay owned by the owner role. After each migration the runner transfers every function in `app_<app_id>_api` to the runtime role.
```

```diff
-| C12a | Every callable `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role, every app table forces RLS, and request context comes from the platform wrapper. ...
+| C12a | Every callable `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role, every app table forces RLS, and request context comes from the platform wrapper. Migrations that run `RESET ROLE` or `COMMIT` and then grant, alter, or create an object outside the app's two schemas are refused or leave no change. ...
```

### R3: A grant never discloses a person to an app they have not accepted
- **Why:** The token endpoint issues an app token whenever "a live grant for that app exists, including a wildcard grant". A person with a `*` grant has therefore authorized their AI to act as them in any SOMA app, including apps they never accepted, so those apps receive an `app_person_id`, receipts, and the person's data without the consent screen. This contradicts the decision in section 0 that a first visit to another app requires a visible offer. It also lets a wildcard grant outlive per-app forget, and lets a device approval bypass `invitation` admission.
- **Change:**

```diff
-- Each token request names one app with the RFC 8707 `resource` parameter, set to the app's registered origin. The broker returns an app-audience access token that lives at most 10 minutes (claims: Appendix A, M4) only when a live grant for that app exists, including a wildcard grant. A token captured by one app is useless at another, because both its audience and its online grant bind it to one registered app.
+- Each token request names one app with the RFC 8707 `resource` parameter, set to the app's registered origin. The broker returns an app-audience access token that lives at most 10 minutes (claims: Appendix A, M4) only when a live grant for that app exists, including a wildcard grant, and the principal holds a usable membership with current consent in that app. The broker rechecks the membership on every `invoke`. A token captured by one app is useless at another, because both its audience and its online grant bind it to one registered app.
+- A grant never creates a membership by itself. When a person approves a device code for an app in which they have no membership, the pairing screen also shows that app's disclosure preview (section 2.2, step 7) and applies its `admission` rule. The approval then creates the membership, the consent, and the grant in one transaction. In an `invitation` app without a ticket, that membership is `visitor`. A wildcard grant reaches only apps where the person already holds a usable membership, so per-app forget also stops it from reaching that app.
```

```diff
-| C8 | A paired AI cannot exceed its app, scope, expiry, or risk ceiling. |
+| C8 | A paired AI cannot exceed its app, scope, expiry, or risk ceiling. A wildcard grant obtains no token for an app in which the principal has no membership or has completed forget, and a device approval for an unjoined `invitation` app yields only `visitor` authority. |
```

### R4: Bind a legacy app's consent to the account that is signed in there
- **Why:** M9 and section 2.3a say a PlayMaker writer gets cross-app state "only after that writer consents on the identity origin", but no flow says how that consent reaches PlayMaker. Nothing checks that the person who consents on the identity origin is the PlayMaker account that receives the data. A writer signed in to PlayMaker as account A who consents on the identity origin as account B would attach B's concept state and shared answers to A. In a shared household browser, that leaks one person's data to another.
- **Change:** insert after the paragraph that begins "**Recognition for legacy-app people.**" in section 2.3a:

```diff
 ... The status page and evidence never claim one-tap recognition for people who have only ever signed in to a legacy app.
+
+**Connecting a legacy-app person.** A legacy-global app obtains consent through the same top-level authorization flow (section 2.2), started only from an explicit "Connect your SOMA identity" control. Its start Function validates the person's Supabase access token online and records the token's `sub` on the transaction as `expected_auth_user_id`. If the person who signs in on the identity origin has a different `auth_user_id`, the origin refuses before the disclosure screen. It tells the person to sign in with the same account they use in the app, and it names neither account. A successful exchange creates or updates the membership (`app_person_id = auth_user_id`) and the consent. It sets no broker session cookie, because the app keeps its own Supabase session. Until the person connects, the broker runs that person's calls only against the app's own RPCs and returns no cross-app data.
```

```diff
-| `soma.oauth_transactions` | `transaction_id`, `app_id`, `state_hash`, `nonce_hash`, `pkce_challenge`, `redirect_uri`, `disclosure_hash`, `expires_at`, `consumed_at` | Broker-only pending authorization. Every secret value is stored as a keyed hash. |
+| `soma.oauth_transactions` | `transaction_id`, `app_id`, `state_hash`, `nonce_hash`, `pkce_challenge`, `redirect_uri`, `disclosure_hash`, `expected_auth_user_id`, `ticket_token_hash`, `expires_at`, `consumed_at` | Broker-only pending authorization. Every secret value is stored as a keyed hash. `expected_auth_user_id` is set only for a legacy-global app (section 2.3a). `ticket_token_hash` holds a pending invitation (section 2.2, step 5). |
```

```diff
-| C22 | ... A failed exchange creates no membership. ...
+| C22 | ... A failed exchange creates no membership. In a legacy-global app, an authorization completed by a different identity-origin person than `expected_auth_user_id` creates no membership or consent. ...
```

(The `...` stands for the unchanged remainder of the C22 row.)

### R5: New PlayMaker AI partners need an Auth user after M11
- **Why:** Section 2.3a makes PlayMaker's `app_agent_id` equal to the `auth.users` row created for the `is_ai` participant. PlayMaker creates that row through the Auth Admin API with the shared secret (`playmaker/netlify/functions/lib/agentIngress.ts` posts to `/auth/v1/admin/users`; `agent-pair-approve.ts` calls it). After M11 no HTTP-addressable site holds that secret (section 2.3b), so no new AI could pair with PlayMaker. M8's demonstration tests only an agent that is already paired, so it would not catch this.
- **Change:**

```diff
-... In a legacy-global app, an outside AI is identified by the existing `auth.users` row that PlayMaker created for that `is_ai` participant, so `app_agent_id` equals that ID. The reason is the same as for `app_person_id = auth_user_id`: PlayMaker's tables already key on it.
+... In a legacy-global app, an outside AI is identified by the existing `auth.users` row that PlayMaker created for that `is_ai` participant, so `app_agent_id` equals that ID. The reason is the same as for `app_person_id = auth_user_id`: PlayMaker's tables already key on it. Creating that row needs the Auth-administration secret, which section 2.3b keeps off every HTTP-addressable site. So when a person approves a pairing for a legacy-global app, the broker queues a row in `soma.auth_participant_requests`. The outbound-only Auth-administration worker (section 2.3b) creates the `is_ai` user and records its ID as the `app_agent_id`, and until then the token endpoint answers `authorization_pending`. The worker creates only users flagged `is_ai` with a namespaced synthetic email. It never creates, changes, or deletes a human account through this queue.
```

Add to the shared-schema table:

```diff
 | `soma.agent_app_handles` | ...
+| `soma.auth_participant_requests` | `request_id`, `agent_id`, `app_id`, `label`, `status`, `auth_user_id`, `created_at`, `completed_at` | Broker writes; only the Auth-administration worker claims and completes rows. Used only for legacy-global apps (section 2.3a). |
```

```diff
-... With the legacy secret removed from a staging copy of PlayMaker's environment, a paired agent still completes an inspection and an effect. |
+... With the legacy secret removed from a staging copy of PlayMaker's environment, a paired agent still completes an inspection and an effect, and a newly paired AI completes its first inspection after the worker creates its participant. |
```

### R6: Refuse broker calls from Netlify deploy permalinks
- **Why:** Netlify keeps every past deploy live at `https://<deploy-id>--<site>.netlify.app`, with that deploy's Functions and the environment values it was built with. The broker accepts every non-retired contract (section 2.4a), so each old production or `preview` build remains a live API endpoint. That endpoint holds a current installation credential, and a bearer-token caller can aim at an old release's Function code. "Per-deploy URLs are not registrable" covers redirects and cookies, not bearer calls.
- **Change:** insert after "The broker derives `app_id` from the installation credential …" in section 2.3:

```diff
 The broker derives `app_id` from the installation credential and the principal from the validated session. Caller-supplied identifiers may narrow a request but never establish authority.
+
+The vendored broker client forwards the request's `Host` on every `invoke`, and the broker refuses a host that is not a registered origin of that app. The forwarded host authenticates nothing. Its job is to stop honest old releases from answering on a Netlify deploy permalink. A Netlify rollback still works, because the restored deploy then serves on the registered origin.
```

```diff
-| C12 | A browser or agent token cannot access the Supabase Data API directly. ...
+| C12 | A browser or agent token cannot access the Supabase Data API directly. An agent request sent to a previous deploy's permalink URL is refused by the broker. ...
```

### R7: Carry a pending invitation on the broker transaction, not in the URL
- **Why:** Step 5 sends an "opaque pending-invitation handle" to the identity origin, but no table stores what that handle maps to. The ticket must reach the exchange in step 10 by some path. The landing Function already holds the token in an `HttpOnly` cookie, so the simplest correct path is for the start Function to hand the ticket to the broker. The URL then needs no handle.
- **Change:**

```diff
-5. The request includes `app_id`, an allowlisted redirect URI, a PKCE challenge, a nonce, and an optional opaque pending-invitation handle. It never includes the invitation token itself.
+5. The request includes `app_id`, an allowlisted redirect URI, a PKCE challenge, and a nonce. A pending invitation never travels in the URL. The start Function reads the invitation cookie (Appendix A, M5), and the broker stores the ticket's keyed hash on the transaction (`soma.oauth_transactions.ticket_token_hash`), so the identity origin can show the invitation from its own record.
```

```diff
-... The script removes the fragment with `history.replaceState` and continues with the selector; the authority stays in the cookie, which script cannot read. An invitation then starts authorization with the opaque pending-invitation handle from that cookie (section 2.2, step 5). The Function clears the cookie once it has established the pending invitation or contact-thread session. ...
+... The script removes the fragment with `history.replaceState` and continues with the selector; the authority stays in the cookie, which script cannot read. For an invitation, `/api/soma/v1/auth/start` reads that cookie and passes the token to the broker, which records its keyed hash on the authorization transaction (section 2.2, step 5) and redeems it at the exchange. The Function clears the cookie once the transaction or the contact-thread session holds it. ...
```

(The `oauth_transactions` column is added in R4.)

### R8: Cut guest admission from v2 tickets
- **Why:** `ticket_admit_v2` admits "a person who has not signed in … as a guest", and `ticket_redemptions` stores a `guest_session_hash`. Nothing else in the plan defines a guest principal. Every broker authorization, receipt (`principal` is an `app_person_id`), grant, rate limit, and erasure target keys on a person or an agent. No journey or two-week deliverable needs guest admission. PlayMaker's guest entry can stay on its legacy `ticket_use` until a v2 app needs a guest and someone designs that principal.
- **Change:**

```diff
-... Four broker-only functions in the `soma` schema store only a keyed token hash, take the app from the installation credential, and create or upgrade the membership on redemption (section 2.2, admission). ...
+... Three broker-only functions in the `soma` schema store only a keyed token hash, take the app from the installation credential, and create or upgrade the membership on redemption (section 2.2, admission). A v2 ticket admits only a signed-in person. Guest entry without sign-in stays on PlayMaker's legacy `ticket_use` until a v2 app needs it, because v1 defines no guest principal. ...
```

(This is the `soma-platform/packages/soma-tickets` row of section 1.2; the rest of the row is unchanged.)

```diff
-| `soma.ticket_redemptions` | `ticket_id`, `person_id`, `guest_session_hash`, `redeemed_at` | Broker-only. Exactly one of `person_id` and `guest_session_hash` is present, unique per ticket and subject, so anonymous admissions count without storing the bearer session. |
+| `soma.ticket_redemptions` | `ticket_id`, `person_id`, `redeemed_at` | Broker-only. Unique per ticket and person. |
```

```diff
-- `soma.tickets` and `soma.ticket_redemptions` (section 2.4) are reachable only through four platform-owned functions executable by `soma_broker`. ...
+- `soma.tickets` and `soma.ticket_redemptions` (section 2.4) are reachable only through three platform-owned functions executable by `soma_broker`. ...
@@
-  - `soma.ticket_admit_v2(p_token_hash, p_guest_session_hash)` lets a person who has not signed in enter the invited scope as a guest, as `ticket_use` does today.
```

### R9: Security notices cannot be muted, and host notices cannot be flooded
- **Why:** The AI-partner announcement is the control that makes a phished pairing visible (section 2.7), but it shares the queue with app notifications. A person who muted the app, or who reached the app's daily cap, would never receive it. Anonymous `POST /api/soma/v1/contact` sends a notice to the human host's private address with no cap, and contact is missing from the section 2.7a quota list. One script could therefore fill Eric's inbox and use up the mail provider's quota.
- **Change:**

```diff
-... Each app has a per-person daily notification cap, and the person can mute an app's notifications from `/api/soma/v1/me`. The host contact notice (section 2.7) and the AI-partner announcement (section 2.7) use the same queue.
+... Each app has a per-person daily notification cap, and the person can mute an app's notifications from `/api/soma/v1/me`. The host contact notice (section 2.7) and the AI-partner announcement (section 2.7) use the same queue. Templates whose IDs begin with `soma.security.`, starting with the AI-partner announcement, are platform templates. An app cannot declare, send, or mute them. The app's cap and the person's mute do not apply to them; they have their own platform cap. Host contact notices have a per-app daily cap. After the cap is reached, the worker sends one digest per hour that gives the count and links to the app's feedback queue.
```

```diff
-Ask, feedback, invitations, device pairing, approval polling, and unauthenticated discovery have separate quotas. Expensive provider work is admitted only after the cheap validation and quota checks pass.
+Ask, feedback, contact, invitations, device pairing, approval polling, and unauthenticated discovery have separate quotas. Expensive provider work and outbound mail are admitted only after the cheap validation and quota checks pass.
```

### R10: Name the key behind every keyed hash
- **Why:** The plan stores authorization codes, `state`, `nonce`, session handles, installation and release credentials, ticket and contact-thread tokens, and device and user codes "only as a keyed hash". Appendix A, M3 lists the broker's "only secrets" with no key for those hashes; it lists only the refresh-hash key. A builder will either reuse the refresh key or hash without a key, and section 2.9 assigns no owner or rotation procedure to this key.
- **Change:**

```diff
-**Broker secrets** [2.3b]. The `soma_broker` password, the agent-token signing key, the refresh-hash key, the receipt-signing key, and the master key from which per-app request-fingerprint keys are derived are the broker site's only secrets.
+**Broker secrets** [2.3b]. The `soma_broker` password, the agent-token signing key, the refresh-hash key, the token-hash key, the receipt-signing key, and the master key from which per-app request-fingerprint keys are derived are the broker site's only secrets. The token-hash key produces every other keyed hash: authorization codes, `state`, `nonce`, session handles, installation, release, and conformance credentials, ticket and contact-thread tokens, and device and user codes. During a rotation the broker checks the current key and then the previous key, so a rotation invalidates nothing and needs no schema change.
```

```diff
-Broker signing keys, receipt-signing and request-fingerprint keys, app installation credentials, app release credentials, conformance credentials, refresh-token hashing keys, and the `soma-notify` database and mail-provider credentials have named owners, ...
+Broker signing keys, receipt-signing and request-fingerprint keys, app installation credentials, app release credentials, conformance credentials, the refresh-hash and token-hash keys, and the `soma-notify` database and mail-provider credentials have named owners, ...
```

### R11: Give PlayMaker's runtime role named table grants, never `authenticated`
- **Why:** Section 2.3a says PlayMaker's `auth.uid()` policies "continue to apply" when broker calls reach `app_playmaker_api`, but it does not say how `app_playmaker_runtime` gets privileges on PlayMaker's `public` tables. The quick fix, making it a member of `authenticated`, would hand it every legacy grant and role-wide policy in the shared `public` schema, including other apps' tables. That breaks C12a's legacy promise that it "cannot … cross into another app". PlayMaker's policies name no role (`playmaker/supabase/migrations/0003_rls_policies.sql`), so they already apply to any role through `auth.uid()`.
- **Change:**

```diff
-- The path without the legacy secret: for every broker call to a legacy-global app, the platform wrapper sets transaction-local `request.jwt.claims`, with `sub` set to the acting `auth.users` row and `role` set to `authenticated`, before calling an RPC in `app_playmaker_api`. M8 moves PlayMaker's agent operations onto those broker `invoke` calls, so its existing `auth.uid()` policies and `pm_acts_for` continue to apply after nothing outside Supabase Auth can mint a PostgREST token. ...
+- The path without the legacy secret: for every broker call to a legacy-global app, the platform wrapper sets transaction-local `request.jwt.claims`, with `sub` set to the acting `auth.users` row and `role` set to `authenticated`, before calling an RPC in `app_playmaker_api`. M8 moves PlayMaker's agent operations onto those broker `invoke` calls, so its existing `auth.uid()` policies and `pm_acts_for` continue to apply after nothing outside Supabase Auth can mint a PostgREST token. `app_playmaker_runtime` receives table privileges only on the named PlayMaker tables its RPCs use. It is never made a member of `authenticated`, `anon`, or `service_role`, because that membership would carry every legacy grant and role-wide policy in the shared `public` schema. PlayMaker's policies name no role, so they apply to the runtime role without that membership. ...
```

```diff
-| C12a | ... In a legacy-global app, the compatibility `request.jwt.claims` setting from section 2.3a may influence only that app's RPCs and cannot forge `soma_ctx`, cross into another app, or authorize a broker operation. |
+| C12a | ... In a legacy-global app, the compatibility `request.jwt.claims` setting from section 2.3a may influence only that app's RPCs and cannot forge `soma_ctx`, cross into another app, or authorize a broker operation. The legacy runtime role belongs to no other role and holds no privilege on a table outside its named list. |
```

### R12: Let C10 allow the legacy apps' own sign-in session
- **Why:** C10 forbids any token in `localStorage` or `sessionStorage`. PlayMaker (`src/lib/supabase.ts`, `persistSession: true`) and Legends (`js/soma-auth.js`, which keeps tab-aware copies in both stores) keep their Supabase session there by design. Section 3.3 calls their direct sign-in "a v1 design choice, … not migration debt" and allows them exceptions only for C12–C12b. So both apps would fail C10 permanently, or someone would quietly skip it.
- **Change:**

```diff
-| C10 | After every Golden Journey, the app origin's `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, and every cookie readable by JavaScript contain only the required boolean device marker and the declared UI-preference keys. None contains a random identifier, PII, user ID, question text, URL query, token, or credential. |
+| C10 | After every Golden Journey, the app origin's `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, and every cookie readable by JavaScript contain only the required boolean device marker and the declared UI-preference keys. None contains a random identifier, PII, user ID, question text, URL query, token, or credential. In a `legacy-global` app, the Supabase Auth session that its own sign-in stores (section 2.3a) is also allowed, under the storage keys the manifest names for it and nowhere else. |
```

### R13: M11's secret scan must not exempt the broker
- **Why:** Section 2.3b deploys the Supabase secret key to no HTTP-addressable site, including `soma-id`. M11's demonstration, "no shared-project secret key outside the broker", implies the broker holds one, so the scan would pass a broker that should fail. The only allowed holder is the outbound-only Auth-administration worker, which R5 makes necessary.
- **Change:**

```diff
-... | A scan of every SOMA Netlify site's environment finds no shared-project secret key outside the broker. PlayMaker's and Legends' journeys pass after the legacy secret is revoked. |
+... | A scan of every SOMA Netlify site's environment finds no shared-project secret key on any site, `soma-id` and `soma-notify` included, except the site of the outbound-only Auth-administration worker (section 2.3b), which has only scheduled Functions. PlayMaker's and Legends' journeys pass after the legacy secret is revoked. |
```

### R14: Fix the example manifest so it passes its own checks
- **Why:** The example declares question `veric:coaching-goal` in app `veric-coaching`. C3 fails anything outside "the app's own namespace", and the plan never defines that namespace, so the example either fails C3 or teaches that a namespace may be any prefix. The example also names an app route `account_erasure`, while section 2.5a says global erasure "is started only on the identity origin, never through an app".
- **Change:**

```diff
-A concept ID is namespaced, such as `soma:host-pair` or `playmaker:stage-read`. Declaring a concept outside `soma:` and the app's own namespace fails C3. ...
+A concept ID is namespaced, such as `soma:host-pair` or `playmaker:stage-read`. An app's own namespace is exactly its `app.id`. Declaring a concept outside `soma:` and the app's own namespace fails C3. ...
```

```diff
     {
-      "id": "veric:coaching-goal",
+      "id": "veric-coaching:coaching-goal",
       "schema_version": "1",
```

```diff
     "data_export": "/settings/export",
-    "account_erasure": "/settings/delete",
+    "app_forget": "/settings/leave",
     "agent_revocation": "/settings/agents"
```

Add to "Field meanings that the schema alone does not convey":

```diff
 - `app.origins` names the `production` origin and the `staging` alias as separate keys, not as an ordered list; `register` registers only the one that matches its environment (section 2.4a).
+- `legal.app_forget` is the app's per-app forget page (section 2.5). It links to the identity origin's global erasure page and does not host global erasure itself (section 2.5a).
```

### R15: Give C12b the provider key names it checks
- **Why:** C12b allows "provider keys named by declared data flows", but a `data_flows` entry has only `vendor`, `what`, `why`, and `retention_days`. No field names an environment variable, so the check has nothing to compare against.
- **Change:**

```diff
-| C12b | The app's `.env.example`, `netlify.toml`, Function source, and built browser bundle reference no environment credential outside this allowlist: `SOMA_BROKER_URL`, `SOMA_APP_INSTALLATION_KEY`, `SOMA_APP_INSTALLATION_KEY_NEXT`, `SOMA_APP_RELEASE_KEY`, and provider keys named by declared data flows. ...
+| C12b | The app's `.env.example`, `netlify.toml`, Function source, and built browser bundle reference no environment credential outside this allowlist: `SOMA_BROKER_URL`, `SOMA_APP_INSTALLATION_KEY`, `SOMA_APP_INSTALLATION_KEY_NEXT`, `SOMA_APP_RELEASE_KEY`, and the `secret_env` names declared in `data_flows`. ...
```

```diff
     {
       "vendor": "Anthropic",
       "what": "Questions typed to the Guide's Ask",
       "why": "Answer from the app's declared knowledge",
+      "secret_env": "ANTHROPIC_API_KEY",
       "retention_days": "undeclared"
     },
     {
       "vendor": "Anthropic",
       "what": "Messages sent to V'Eric",
       "why": "Generate the AI host's reply",
+      "secret_env": "ANTHROPIC_API_KEY",
       "retention_days": "undeclared"
     }
```

```diff
 - Each data flow's `retention_days` is a non-negative integer or the literal `"undeclared"`. ...
+- A data flow whose server code authenticates to the vendor names the environment variable that holds that credential in `secret_env`. This is the only way a provider key enters the C12b allowlist.
```

### R16: One browser identity client, one server identity client
- **Why:** Section 1.2 gives `@soma/signin` a broker mode as "the only mode a pairwise app may use", while section 2.8 creates `@soma/identity` with a "vendored client adapter". Two builders can read this as two browser clients for the same flow. That is the kind of duplication the brief asks the kit to resolve.
- **Change:**

```diff
-| `packages/soma-identity` | Vendored client adapter plus the central `soma-id` Netlify site built from `apps/soma-id` (section 2.3b) | Cross-app recognition needs one broker and app-local integration. |
+| `packages/soma-identity` | Vendored server code for app Functions (the `/broker/v1/invoke` client and the `/api/soma/v1/auth/*` and `/api/soma/v1/me*` handlers) plus the central `soma-id` Netlify site built from `apps/soma-id` (section 2.3b) | Cross-app recognition needs one broker and app-local server integration. The browser side stays in `@soma/signin` broker mode (section 1.2), so there is one browser identity client. |
```

### R17: The interim key split belongs to `kit-steward`
- **Why:** Creating a separate `sb_secret_…` key needs the Supabase Management API token. Section 2.4a gives that token only to `kit-steward` (`key:supabase-management`), yet section 8.2 assigns the work to the release seat. The same sentence also lists a Legends fix that has already landed as if it were still to be done.
- **Change:**

```diff
-Separately from the kit release, the release seat performs two week-one interim controls on the legacy apps: the separate revocable secret keys for PlayMaker and Legends (section 2.3a), and Legends' publish-directory fix from M6, which landed on 2026-10-07. Both are configuration changes, not product changes, and each reduces a live exposure that the slice does not otherwise touch.
+Separately from the kit release, `kit-steward` gives PlayMaker and Legends separate revocable secret keys in week one (section 2.3a), because creating a key needs the Management API token that only that seat holds (section 2.4a). This is a configuration change, not a product change, and it reduces a live exposure that the slice does not otherwise touch. The other interim control, Legends' publish-directory fix from M6, landed on 2026-10-07.
```
