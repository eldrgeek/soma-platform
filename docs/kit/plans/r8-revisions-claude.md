# Revisions, round 8, Claude Opus 5.5

_Reviewer: Claude Opus 5.5 (Claude Code, CCc), fresh conversation, for Mike Wolf, 2026-10-07. Claims were checked against `soma-platform` (working tree), `playmaker` (`origin/master` at `05dafe73`), `soma-app-template` (`1f88e4d`), `legends-membership-site`, and `_estate/seats.json`._

### R1: Make every identifier an app can see pairwise, not only the person's
- **Why:** The plan gives each app a random `app_person_id`, but other values it hands apps are global, so two apps can still join their records. A person's global `actor_id` lands in `action_receipts`. An outside AI's `agent_id` and a `*` grant's `grant_id` travel in every access token, and a token is a readable JWT. `source_app_id` on concept state and shared answers tells a new app which other apps the person uses. `email` correlates everywhere.
- **Change:**

```diff
@@ 2.2 Identity flow
-12. The app may now greet the person by name and state where it learned the name.
+12. The app may now greet the person by name and say that the name came from the person's SOMA identity. It never names another SOMA app as the source.
@@
 The app must not receive a global `person_id`.
 
+Pairwise identity covers every identifier an app can observe, not only the person's own ID, because one shared value is enough for two apps to join their records:
+
+- A person acting in an app is recorded in that app's tables by `app_person_id`, never by `soma.actors.actor_id`.
+- An outside AI appears to each app as `app_agent_id`, a random handle per agent and app, stored in `soma.agent_app_handles`. Access tokens carry `sub = app_agent_id` and `grant_ref`, a per-app keyed handle for the grant. They never carry the global `agent_id` or `grant_id`. A grant the person made for `app_id='*'` therefore looks different in each app.
+- Responses from `/api/soma/v1/me` and `/api/soma/v1/me/*` never include another app's `source_app_id`, consent rows, memberships, or receipts. Concept state reports only the state and the concept version. A shared answer reports only its value, schema version, and expiry.
+- `email` is a correlating field, because the same address identifies the person in every app and outside SOMA. An app may list `email` in `identity.profile_fields` only together with an `email_reason`. The consent screen then says that sharing the address lets the app recognize the person outside SOMA. An app that only needs to send the person a message uses the broker's person notification (R9, section 2.3b) and does not request `email`.
+
@@ 2.4 Shared schema
 | `soma.agent_partners` | `agent_id`, `principal_id`, `label`, `created_at`, `last_used_at`, `revoked_at` | Registers an AI relationship without granting app authority. Its rotating refresh credentials live in `soma.refresh_families` and `soma.refresh_credentials`, not on this row. |
+| `soma.agent_app_handles` | `agent_id`, `app_id`, `app_agent_id`, `created_at` | Broker-only. Created on the first grant for that app. `app_agent_id` is random, so it cannot be derived from `agent_id`. Per-app forget and grant revocation do not delete it; erasure of the principal does. |
@@ 2.4 Per-app schema, after the table
+In `action_receipts`, `actor_id` holds `app_person_id` when the person acted, `app_agent_id` when an outside AI acted, and the AI host's actor ID when the in-app host acted. `grant_id` holds the per-app `grant_ref`. The broker translates both back to global IDs only when it writes `soma.receipt_index`.
+
 Every table has RLS enabled and forced. Table-owner roles are never used at runtime.
@@ 2.7 AI visitor door
-The broker exchanges it for an access token that lives at most 10 minutes. The token carries `aud = "app:<app_id>"`, `grant_id`, `grant_version`, `jti`, `scopes`, and `risk_ceiling`.
+The broker exchanges it for an access token that lives at most 10 minutes. The token carries `aud = "app:<app_id>"`, `sub = <app_agent_id>`, `grant_ref`, `grant_version`, `jti`, `scopes`, and `risk_ceiling`. The broker maps `grant_ref` back to `grant_id` inside the `invoke` transaction.
@@ 3.3 conformance table
 | C11a | A private answer exists only in its source app's schema. Sharing copies only the approved projection into `soma.shared_answers`; revocation removes that projection, and another app cannot recover the source value. |
+| C11b | One test person and one test AI use two fixture apps. No value the two apps receive is equal across them: person ID, actor ID, agent ID, grant handle, token `sub`, receipt ID, or any source-app field. `email` is absent unless the manifest declares `email_reason` and the person consented. |
```

### R2: Admission policy — signing in must not make anyone a member of every app
- **Why:** Step 10 creates a membership for anyone who completes authorization, so every app is open to every SOMA person. That contradicts invitation-only apps such as PlayMaker's studio gate, and it makes tickets unnecessary for joining. Role changes also have no defined path, although the plan replaces admin allowlists with membership roles.
- **Change:**

```diff
@@ 2.2 Identity flow
 The authorization code must be short-lived and single-use.
 
+The membership that step 10 creates follows the manifest's `identity.admission`:
+
+- `open`: the person becomes a `member`.
+- `invitation`: the person becomes a `member` only when the authorization carries a ticket that `soma.ticket_redeem_v2` redeems in the same transaction (section 1.2). Without a ticket, the person receives a `visitor` membership. A visitor may run `visitor` actions and use the contact route, and nothing else.
+- `request`: the person receives a `visitor` membership and an access request. An app `owner` or `admin` approves the request through a registered `consequential` action.
+
+Changing a member's role is a registered action. Raising a role to `owner` or `admin` is `consequential` and requires an existing `owner`. Lowering a role is `reversible`. The first owner comes from the time-limited `ADMIN_EMAILS` bootstrap (section 1.2).
+
 The redirect URI must exactly match a registered origin.
@@ 2.4a, sync-contract bullets
-- The privileged projection contains: origins; identity mode and subject; hosts, escalation routes, and expected responses; concepts and question definitions, including portability; each action's ID, version, kind, risk, scopes, required role, surfaces, effects, and UI exception; AI-visitor limits; promises; data flows, data stores, and retention; legal operator; dependency fallbacks; and provisioning requests.
+- The privileged projection contains: origins; identity mode, subject, and admission; hosts, escalation routes, and expected responses; concepts and question definitions, including portability; each action's ID, version, kind, risk, scopes, required role, surfaces, effects, and UI exception; AI-visitor limits; promises; data flows, data stores, and retention; legal operator; dependency fallbacks; and provisioning requests.
@@ 3.1 manifest example
   "identity": {
     "mode": "shared-soma",
     "subject": "pairwise",
+    "admission": "open",
     "first_cross_app_visit": "offer",
@@ 3.3 conformance table
 | C11 | An unvisited app cannot learn or display the person’s name before consent. |
+| C11c | In an `invitation` app, a person who signs in without a ticket holds only the `visitor` role and cannot run a `member` action. A role raise without an `owner` is refused. A build that changes `admission` fails `sync-contract`. |
```

### R3: Specify tickets v2 against the tickets that actually exist
- **Why:** PlayMaker migration `0088_shared_front_door_tickets.sql` added shared tickets that stay open until expiry, and `ticket_use` admits an anonymous visitor before any sign-in. The plan's `ticket_redeem_v2` "marks the ticket used" and requires a signed-in principal, which would break both behaviors. Today's tables also store the bearer token in plaintext, take the inviter's name from the local part of their email (`split_part(u.email, '@', 1)`), and hold invitee names and emails that no erasure target names. The plan also puts the v2 functions in `public`, although section 2.3b says the broker holds nothing in `public` except legacy wrappers.
- **Change:**

```diff
@@ 1.2 Inventory disposition
-| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation implementation. Rows stay in `public.tickets`, keyed by its `app` column. Add three v2 functions, owned by the platform and executable only by `soma_broker`; each takes the app from the `app_id` the broker derives from the installation credential. `ticket_create_v2` admits the inviter by `soma.memberships` role under that app's invitation policy. `ticket_lookup_v2(p_token)` returns only status, invitee name, inviter name, and quote line. `ticket_redeem_v2(p_token)` requires a signed-in principal and, in one transaction, marks the ticket used and creates or reactivates that person's `soma.memberships` row for the app. Restrict the existing `ticket_create`, `ticket_lookup`, and `ticket_use` to `p_app = 'playmaker'` until PlayMaker moves to v2, then retire them. (Today `ticket_create` admits anyone with any PlayMaker studio membership, whatever `p_app` says.) |
+| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation implementation. Rows stay in `public.tickets`, keyed by its `app` column, because PlayMaker's live tickets are there. Add four v2 functions in the platform-owned `soma` schema, executable only by `soma_broker`. Each takes the app from the `app_id` the broker derives from the installation credential. `soma.ticket_create_v2` admits the inviter by `soma.memberships` role under that app's invitation policy. It stores only a keyed hash of the token in a new `token_hash` column; `token` becomes nullable, a v2 row leaves it null, and old rows keep their token until they expire. It takes the inviter name only from the display name the inviter consented to share with that app, never from an email address. `soma.ticket_lookup_v2(p_token)` returns only status, kind (`personal` or `shared`), invitee name, inviter name, and quote line. `soma.ticket_admit_v2(p_token, p_guest_session)` lets a person who has not signed in enter the invited scope as a guest, as `ticket_use` does today. `soma.ticket_redeem_v2(p_token)` requires a signed-in principal and, in one transaction, records the redemption and creates or upgrades that person's `soma.memberships` row (section 2.2, admission). A personal ticket admits one person once. A shared ticket admits many people until it expires or reaches its `max_redemptions`; `public.ticket_redemptions` holds one row per redeeming person, unique on `(ticket_id, person_id)`. Every app that issues tickets lists `public.tickets` and `public.ticket_redemptions` as a platform `data_stores` entry, so export and erasure reach the invitee names and emails held there. Restrict the existing `ticket_create`, `ticket_lookup`, and `ticket_use` to `p_app = 'playmaker'` until PlayMaker moves to v2, then retire them. (Today `ticket_create` admits anyone with any PlayMaker studio membership, whatever `p_app` says; `ticket_use` is executable by `anon` for any `p_app`; and the token is stored in plaintext.) |
```

### R4: The person approves an answer share on the identity origin, not on the app
- **Why:** The app controls every script on its own pages, so it can simulate the person's click on a "share this answer" control. Sharing a private answer is a cross-app disclosure, exactly like the first-visit consent, so it needs the same witness: a page the app cannot script. The plan also names "a separate, person-approved share operation" but defines no route for it.
- **Change:**

```diff
@@ 2.5 Concept and answer semantics
 Sharing is an explicit copy operation. The person approves the exact projected fields, destination class, purpose, sensitivity, and duration, and the broker then writes that projection to `soma.shared_answers`. An app may request portability but cannot create or broaden the shared projection on the person's behalf. Changing the source answer later does not change the shared projection; the shared copy is updated only when the person approves a new share.
 
+The approval screen for a share is on the identity origin, reached by a top-level navigation like authorization (section 2.2). The app's own pages cannot serve as the witness, because the app could imitate the person's gesture there. The app calls `POST /api/soma/v1/me/answers/:question_id/share`, which records a pending share bound to the projection hash and returns a `share_url` on the identity origin. The broker writes `soma.shared_answers` only when the identity origin records the person's approval of that exact pending share. A pending share expires after 10 minutes.
+
 An app may suppress a question only when the registered question definition marks the stored schema compatible, the consent remains current, the answer has not expired, and the app is allowed to receive its sensitivity class.
@@ 2.7 person-facing routes
 PUT    /api/soma/v1/me/answers/:question_id    store a private app answer; a separate, person-approved share operation creates the central projection
+POST   /api/soma/v1/me/answers/:question_id/share   create a pending share and return its identity-origin `share_url`
@@ 3.3 conformance table
-| C11a | A private answer exists only in its source app's schema. Sharing copies only the approved projection into `soma.shared_answers`; revocation removes that projection, and another app cannot recover the source value. |
+| C11a | A private answer exists only in its source app's schema. Sharing copies only the approved projection into `soma.shared_answers`; revocation removes that projection, and another app cannot recover the source value. A share request carrying only the app's session and CSRF token, with no identity-origin approval, writes nothing. |
```

### R5: Remove the template migrations that would break PlayMaker sign-up, and rewrite the rest for the broker
- **Why:** `soma-app-template/supabase/migrations/0001_profiles.sql` runs `create or replace function handle_new_user()` with `search_path = public` and `drop trigger if exists on_auth_user_created on auth.users`. PlayMaker's `0002_auth_bootstrap.sql` and `0014_narrow_handle_new_user.sql` use those same names, so applying a generated app's migrations to the shared project would replace PlayMaker's sign-up hook. `provision.mjs` still tells the operator to run the app's SQL against the shared project. The template's remaining migrations key people on `auth.users(id)` and use `auth.uid()` in RLS, which is null on the broker path. M3 removes the template's secrets but none of this.
- **Change:**

```diff
@@ 4.1 Order of work
-| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove every shared credential from the generator: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template`, its functions, `soma-scaffolder/src/scaffold.mjs`, and `soma-scaffolder/src/provision.mjs`; the `VITE_SUPABASE_*` values and the shared-project fallback in `src/lib/somaAuthConfig.ts`; and `CLAUDE_EMAIL_*` with `netlify/functions/lib/boardCard.ts`, whose job `soma.estate_inbox` takes over. A generated app receives only the non-secret `SOMA_BROKER_URL`; Functions-only installation credentials (`SOMA_APP_INSTALLATION_KEY` and, during rotation, `SOMA_APP_INSTALLATION_KEY_NEXT`) and Functions-only provider keys for data flows its manifest declares; the Builds-only release credential (`SOMA_APP_RELEASE_KEY`); and standard non-secret build metadata. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. A freshly generated app's environment, `.env.example`, and bundled browser code contain no shared-project key, Supabase URL, or estate mailbox credential, and the C12b scope and canary checks pass. |
+| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove every shared credential from the generator: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template`, its functions, `soma-scaffolder/src/scaffold.mjs`, and `soma-scaffolder/src/provision.mjs`; the `VITE_SUPABASE_*` values and the shared-project fallback in `src/lib/somaAuthConfig.ts`; and `CLAUDE_EMAIL_*` with `netlify/functions/lib/boardCard.ts`, whose job `soma.estate_inbox` takes over. A generated app receives only the non-secret `SOMA_BROKER_URL`; Functions-only installation credentials (`SOMA_APP_INSTALLATION_KEY` and, during rotation, `SOMA_APP_INSTALLATION_KEY_NEXT`) and Functions-only provider keys for data flows its manifest declares; the Builds-only release credential (`SOMA_APP_RELEASE_KEY`); and standard non-secret build metadata. Delete the template migrations that act outside the app's schemas: `0001_profiles.sql`, whose `public.handle_new_user()` and `on_auth_user_created` trigger have the same names as PlayMaker's sign-up hook (`playmaker/supabase/migrations/0002_auth_bootstrap.sql`, `0014_narrow_handle_new_user.sql`), and `0002_delegations.sql`, `0003_agent_ingress.sql`, and `0006_agent_partners_rpc.sql`, which `soma.agent_partners` and `soma.agent_grants` replace. Rewrite `0004_feedback_and_build_queue.sql` and `0005_last_location.sql` to use unqualified names inside `app_<app_id>`, to key people by `app_person_id` with no reference to `auth.users`, and to read identity only through the `soma_ctx` accessors, because `auth.uid()` is null on the broker path. Remove the `provision.mjs` step that tells the operator to run `sql/schema.sql` against the shared project. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. A freshly generated app's environment, `.env.example`, and bundled browser code contain no shared-project key, Supabase URL, or estate mailbox credential, and the C12b scope and canary checks pass. A freshly generated app's migrations apply through `soma-scaffold migrate` against staging, and a catalog diff taken before and after shows no change outside the app's two schemas. |
```

### R6: Guide kit mode must also stop the Guide's other storage and page-text leaks
- **Why:** The plan stops kit-mode name and email writes, but `soma-guide.js` also writes a random `anon-id` to `localStorage` (line 107), keeps a rolling `localStorage` transcript of up to 200 records that each include the full `location.href` (`_log`, around line 512), optionally POSTs every record to `cfg.telemetry.logUrl`, captures non-sensitive form-field values by default in its observer, and always sends up to 4,000 characters of the page's `main` text to Ask as `context` (`_askInference`, around line 3150). A full URL can carry an invitation token or an OAuth `code`. The random ID contradicts the section 0 decision on the device marker. C10 inspects only the marker, so it would pass all of this.
- **Change:**

```diff
@@ 2.7, Guide kit-mode bullets
-- In kit mode the Guide never writes `name` or `email` to `localStorage`. It reads the display name from `GET /api/soma/v1/me`. Without this, the app origin would hold PII that C10, which inspects only the device marker, never sees.
+- In kit mode the Guide never writes `name` or `email` to `localStorage`. It reads the display name from `GET /api/soma/v1/me`.
+- In kit mode the Guide persists only UI preferences on the app origin: panel size, text or voice mode, and mute. It writes no `anon-id`, no transcript, no `default-account`, and no `introduced` or `last-seen` key; concept state replaces "introduce once". Session diagnostics stay in memory. The Guide ignores `cfg.telemetry.logUrl` unless the manifest declares the Guide transcript as a data flow, and then every record carries the route path without its query or fragment.
+- In kit mode the observer records element labels only. It captures no field values. Intake attaches recent activity only when the person ticks "include what I just did" in the feedback form.
+- In kit mode Ask sends the `AskRequest` from section 2.6a. It sends `page_context` only when `guide.ask.page_context` is true. The Guide renders the response's `citations`, the `grounded: false` escalation, and the server's `offers`; it adds no keyword-matched walkthrough offer of its own.
@@ 3.3 conformance table
-| C10 | The device marker is exactly the schema-approved boolean value and contains no random identifier, PII, user ID, or credential. |
+| C10 | After every Golden Journey, the app origin's `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, and every cookie readable by JavaScript contain only the device marker, holding exactly the schema-approved boolean value, and the declared UI-preference keys. None contains a random identifier, PII, user ID, question text, URL query, token, or credential. |
```

### R7: Ask cannot both keep working during a broker outage and stay inside its cost budget
- **Why:** Sections 2.3a, 8.1, and the manifest fallback promise that public Ask keeps working when the broker is down. But Ask's quota and the operator's daily cost budget are enforced through `createBrokerStore` and database-backed rate limits, which all sit behind the broker. During an outage Ask must either stop or call a paid provider with no limit on anonymous traffic. The plan should choose, and the safe choice is a provider-free answer.
- **Change:**

```diff
@@ 2.3a
-A pairwise app has no local sign-in fallback. Signing in directly to Supabase Auth inside the app would give it a global `auth.uid()` and skip the consent screen. During a broker outage, private reads and effects fail closed, public pages and Ask over public knowledge keep working, and the sign-in control states the outage and shows the human host's contact route.
+A pairwise app has no local sign-in fallback. Signing in directly to Supabase Auth inside the app would give it a global `auth.uid()` and skip the consent screen. During a broker outage, private reads and effects fail closed, public pages keep working, Ask degrades to the provider-free knowledge search in section 2.6a, and the sign-in control states the outage and shows the human host's contact route.
@@ 2.6a Ask interface
 export interface AskResponse {
   answer: string;
   grounded: boolean;        // false when no declared source supports the answer
+  degraded?: boolean;       // true when no provider was called (broker outage or spent budget)
@@
 The endpoint either streams its answer or returns within Netlify's synchronous Function execution limit. A timeout returns `grounded: false` with the human host's route, never an empty answer.
 
+Ask makes a provider call only after the broker has charged the request against the caller's quota and the operator's daily cost budget (section 2.7a). Both live in the shared database, so an Ask Function cannot enforce them while the broker is down, and an unmetered provider call would let anonymous traffic spend without limit. During a broker outage, or after the daily budget is spent, Ask makes no provider call. It returns `degraded: true`, `grounded: false`, citations to the declared knowledge sections whose headings or text contain the question's words, and the human host's route. The search runs over the knowledge bundled into the release, so it needs no network call.
+
@@ 3.1 manifest example
     "identity_broker": {
       "required": true,
-      "fallback": "public-pages-and-public-ask"
+      "fallback": "public-pages-and-knowledge-search"
     },
@@ 3.3 conformance table
-| C17 | Declared dependency failures expose the declared fallback. |
+| C17 | Declared dependency failures expose the declared fallback. With the broker blocked, or the operator budget set to zero, Ask returns `degraded: true` with citations and the host route, and the provider receives no request. |
@@ 8.1 Principal risks
-| The broker becomes a single point of failure. | Private reads and effects fail closed, because they all pass through the broker. Keep public pages and public-knowledge Ask working, and show the outage with the human contact route. Test broker failure in the live journey. Never fall back to in-app Supabase Auth sign-in for a pairwise app. |
+| The broker becomes a single point of failure. | Private reads and effects fail closed, because they all pass through the broker. Keep public pages working, degrade Ask to provider-free knowledge search, and show the outage with the human contact route. Test broker failure in the live journey. Never fall back to in-app Supabase Auth sign-in for a pairwise app. |
```

### R8: Put the identity origin on a domain that no other estate site shares
- **Why:** Question 1 frames the identity domain as a neutrality and taste choice and offers `id.mike-wolf.com` as an option. It is also a security choice. Every `*.mike-wolf.com` site the estate runs would be same-site with `id.mike-wolf.com`, so it would receive `SameSite=Lax` and `Strict` cookies on requests to the identity origin and could set cookies for `.mike-wolf.com`. One script injection on any of those sites would then reach the sign-in and consent pages that guard every SOMA person. The plan also never requires `__Host-` cookies on the identity origin itself.
- **Change:**

```diff
@@ 2.3b Where the broker runs
 The identity origin serves no Guide, analytics, advertising, app-supplied script, or third-party JavaScript. It sends `Cache-Control: no-store`, `frame-ancestors 'none'`, a restrictive script and connection Content Security Policy, `Referrer-Policy: no-referrer`, and an allowlisted `form-action`.
+
+The identity origin's own cookies, including the Supabase Auth session cookies, use the `__Host-` prefix. It refuses every state-changing request whose `Sec-Fetch-Site` is not `same-origin`, apart from the token and device-code endpoints, which accept only bearer or form credentials and never cookies. A sibling subdomain therefore gains nothing from being same-site.
@@ 6. Product questions for Mike
-   Recommendation: use a neutral SOMA-controlled apex for the permanent identity, and decide it before the first real person signs in, because sessions, saved passwords, and passkeys bind to that origin and moving it later forces everyone to sign in again. Until then, the staging broker runs on a Netlify subdomain with test accounts only, so the two-week release needs no DNS change. If the answer is `id.mike-wolf.com`, the DNS record is a GoDaddy step only Mike can perform.
+   Recommendation: register a domain used only for SOMA identity and decide it before the first real person signs in, because sessions, saved passwords, and passkeys bind to that origin and moving it later forces everyone to sign in again. Do not use `id.mike-wolf.com`. It would be same-site with every other `*.mike-wolf.com` site the estate runs, so a script injection on any of them could reach the identity origin's sign-in and consent pages. Until the domain exists, the staging broker runs on a Netlify subdomain with test accounts only. `netlify.app` is on the Public Suffix List, so each Netlify site is already its own site, and the two-week release needs no DNS change. Buying the domain is the only step that needs Mike.
```

### R9: Give the broker a notification path, and let apps message people without holding their email
- **Why:** The plan says the broker delivers contact messages to the human host and emails every person about each new AI partner, but section 2.3b lists the broker site's "only secrets" and none of them can send mail. `soma.host_notifications` also covers only host contact events. Apps that need to tell a person something (an approval waiting, a host reply) would otherwise request `email`, which R1 shows is a correlating identifier.
- **Change:**

```diff
@@ 2.3b Where the broker runs
-The `soma_broker` password, the agent-token signing key, the refresh-hash key, the receipt-signing key, and the master key from which per-app request-fingerprint keys are derived are the broker site's only secrets.
+The `soma_broker` password, the agent-token signing key, the refresh-hash key, the receipt-signing key, the master key from which per-app request-fingerprint keys are derived, and a send-only mail-provider key are the broker site's only secrets. Only the scheduled notification worker reads the mail key; it has no request handler.
+
+An app sends a person a message through the broker RPC `notify_person(app_person_id, template_id, params)`. Templates are declared in the manifest's `notifications` list, belong to the privileged projection (section 2.4a), and accept only declared fields. The worker resolves the person's verified address at send time, so the app never receives it. Each app has a per-person daily notification cap, and the person can mute an app's notifications from `/api/soma/v1/me`. The AI-partner announcement in section 2.7 and the host contact notice in section 1.1 use the same queue.
@@ 2.4 Shared schema
-| `soma.host_notifications` | `event_id`, `app_id`, `recipient_actor_id`, `status`, `attempts`, `next_attempt_at`, `sent_at` | Broker-only idempotent delivery queue for contact events. It references the private host address at send time and does not copy the address or message body. |
+| `soma.notifications` | `notification_id`, `event_id`, `app_id`, `recipient_kind` (`host` or `person`), `recipient_id`, `template_id`, `params`, `status`, `attempts`, `next_attempt_at`, `sent_at` | Broker-only idempotent delivery queue for host contact notices, AI-partner announcements, and app messages to a person. The worker resolves the private address at send time and never copies it into the row. `params` holds only the template's declared fields, never a message body; a contact notice links to the message in the app. Erasure deletes a person's rows. |
```

### R10: Say honestly what "known" means for PlayMaker's existing people
- **Why:** Recognition in one tap requires a live session on the identity origin. PlayMaker and Legends sign people in directly on their own origins, so their existing people, who are the largest known population and the likeliest early users of a second app, have no identity-origin session. Golden Journey step 3 passes on the fixture app while the first real PlayMaker writer to arrive would be asked to sign in again. The plan should state this and own the gap.
- **Change:**

```diff
@@ 2.3a Apps that predate the broker
 A legacy-global app still receives cross-app data (shared answers, `soma:` concept state) only after consent, exactly like a pairwise app.
 
+A legacy-global app signs people in on its own origin, so its session does not create a session on the identity origin. A PlayMaker writer who opens a new SOMA app for the first time therefore signs in once on the identity origin with the same email. That sign-in resolves to the same `auth.users` row and the same `soma.people` row, so the writer is known from then on, and first visits to further apps take one tap. M9 adds "Continue with SOMA" to PlayMaker's sign-in as a second path that goes through the identity origin and returns `app_person_id = auth_user_id`, so PlayMaker's tables do not change. Until M9 ships, the kit's status page and evidence do not claim one-tap recognition for people who have only ever signed in to a legacy app. M0 records what a PlayMaker writer sees today on a first visit to the fixture app.
+
@@ 4.1 Order of work
-| M9: PlayMaker identity and plumbing PRs | Adopt identity, tickets, feedback, concept state, and changelog through separate flagged adapters. | Eric’s current workflow passes with each flag off and on. Each flag ships off; the release seat flips it only after recorded acceptance from Eric or Mike. |
+| M9: PlayMaker identity and plumbing PRs | Adopt identity, tickets, feedback, concept state, and changelog through separate flagged adapters. Add "Continue with SOMA" through the identity origin as a second PlayMaker sign-in path (section 2.3a). | Eric’s current workflow passes with each flag off and on. Each flag ships off; the release seat flips it only after recorded acceptance from Eric or Mike. A writer who signed in to PlayMaker through the identity origin opens the fixture app with one tap. |
```

### R11: Create the steward and release seats the plan relies on, and separate approval from authorship
- **Why:** The plan's gates depend on a "platform steward seat" that alone approves privileged contract diffs and a "release seat" that flips flags and owns the `preview` branch. `_estate/seats.json` defines neither (its seats are `dee`, `steward`, `ccc-adhoc`, `frontier-*`, `scout`, `herm`, `estate-hygiene`, `close`, `mail-courier`, `mac-steward`, `test-review`, and the builder seats). If the AI that authored a manifest change also approves its policy diff, the policy gate checks nothing.
- **Change:**

```diff
@@ 2.4a Registering an app in the shared project
 `soma-scaffold register <soma-app.json>` registers an app. The platform steward seat runs it, because it needs the Supabase Management API token. The builder never holds that token.
 
+The kit adds two seats to `_estate/seats.json`, which today defines neither. `kit-steward` owns `key:supabase-management`, `key:soma-id`, `deploy:soma-id`, and `db:soma`, and it is the only seat that runs `register`, `migrate`, and `--approve-contract-diff`. `kit-release` claims `repo:<app>:preview` for each kit app, runs conformance, and flips feature flags. Every later mention of "the steward" or "the release seat" in this plan means these seats.
+
+`kit-steward` never approves a contract diff from a pull request that its own seat authored. `soma.app_policies.approved_by` records the approving seat, the authoring seat, and a link to the reviewed diff. A diff that lowers a risk, broadens remote access, adds a provider, makes an answer portable, opens admission, or changes a host also needs a recorded review by the `frontier-adversary` seat before approval. Conformance fails a policy version whose approver and author are the same seat.
+
```

### R12: List the sign-in, callback, and sign-out routes, and say where the CSRF token comes from
- **Why:** Section 2.7 lists every route C14 compares against discovery, but the authorization start, callback, and sign-out routes are missing, and nothing says how browser code gets the CSRF token that section 2.2 requires. The callback also needs an open-redirect rule and must strip `code` and `state` from the address bar before any page script, including the Guide, can log them.
- **Change:**

````diff
@@ 2.7 person-facing routes
 ```text
+GET    /api/soma/v1/auth/start?return_to=…     create the PKCE transaction and navigate top-level to the identity origin
+GET    /api/soma/v1/auth/callback              exchange the code server-side, set session cookies, then 303 to `return_to`
+POST   /api/soma/v1/auth/logout                revoke this app session (person session and CSRF token)
 GET    /api/soma/v1/me                         membership, role, consented fields, and where the app learned the name
@@ after the route block
 The approval decision route is never listed in `/.well-known/soma-app.json`, `/llms.txt`, or the OpenAPI document, so an AI is not invited to approve its own request.
+
+`return_to` must be a same-origin path that begins with exactly one `/`; any other value becomes `/`. The callback answers with a 303 to a URL that carries no `code` or `state`, so no page script runs while those values are in the address bar. `GET /api/soma/v1/me` returns the session's CSRF token, and the vendored client sends it as `X-CSRF-Token` on every unsafe request.
````

### R13: Pin the app template as part of the kit
- **Why:** The scaffolder copies `soma-app-template` from `SOMA_APP_TEMPLATE_DIR`, a sibling checkout, or `~/Projects/soma-app-template` (`packages/soma-scaffolder/src/scaffoldReactApp.mjs`, `resolveAppTemplateDir`), whatever state that working tree is in. The template is a separate repository (`eldrgeek/soma-app-template`). The lock records only the `soma-platform` commit, and the second-app rule forbids edits to `soma-platform` only, so a run could pass by editing the template.
- **Change:**

```diff
@@ 2.8 lock file
   "kit_version": "1.0.0",
   "source_commit": "<soma-platform-sha>",
+  "template": {
+    "repository": "eldrgeek/soma-app-template",
+    "commit": "<soma-app-template-sha>"
+  },
   "contract_sha256": "<canonical-contract-hash>",
@@
 The updater must refuse to overwrite locally modified vendored files.
+
+The scaffolder refuses to generate from a template checkout that has uncommitted or untracked files, or whose commit is not on the template repository's default branch, and records that commit in the lock. Each kit release names the template commit it was tested with.
@@ 5. The second-app test
-A run that requires an edit to `soma-platform` fails.
+A run that requires an edit to `soma-platform` or `soma-app-template` fails.
```

### R14: Define how kit fixes reach apps, and a security floor the broker enforces
- **Why:** Vendoring pins enforcement code inside each app, so a security fix in `@soma/actions` or `@soma/signin` reaches an app only when that app re-vendors and redeploys. The plan names an "updater" but no command, versioning rule, or way to make an app take a fix. The broker already retires contracts "when a security fix declares it unsafe", but it cannot tell which contracts run which kit version.
- **Change:** insert a new section after section 2.8 and before section 2.9:

```diff
+### 2.8a Kit updates and security floors
+
+`soma-scaffold update --to <kit_version>` re-vendors packages, rewrites `soma-kit.lock.json`, regenerates discovery files and kit migrations, and opens a pull request in the app repository. It refuses to overwrite locally modified vendored files and lists them instead.
+
+Kit versions follow semantic versioning. A minor or patch release never changes the manifest schema or the broker RPC contract incompatibly.
+
+`sync-contract` submits the lock's `kit_version` and the lock file's SHA-256 with the contract. The broker stores both in new `soma.app_contracts` columns, `kit_version` and `lock_sha256`.
+
+When a kit release fixes a security defect, `kit-steward` records a security floor: a minimum kit version and an enforcement date. Before that date, the broker accepts older contracts, and `/api/soma/v1/status` shows the app as below the floor. On that date, the broker retires every contract below the floor, so those releases stop calling it, and an `estate_inbox` event is filed for each affected app.
+
+For PlayMaker the update arrives as an ordinary pull request under section 4.2, so the enforcement date must leave time for Eric's review unless the defect is being exploited.
```

### R15: Declare the fields the action state machine already depends on
- **Why:** The server must know whether an effect is a single database RPC or an external call, because the two follow different claim-and-settle paths (section 2.4). Reconciliation uses "the action's declared timeout" and "recovery rule", and irreversible actions need "a cool-off step". None of these appears in `SomaAction`, the manifest, the privileged projection, or C4. AI-only actions need a `ui_exception` that the interface also lacks.
- **Change:**

```diff
@@ 2.6 Action registry
   effects: string[];
   concept?: { id: string; version: string };
+  effectTarget?: "database" | "external"; // required when kind is "effect"
+  timeoutSeconds?: number;                // required when effectTarget is "external"
+  recovery?: "provider-idempotency-key" | "reconcile"; // required when effectTarget is "external"
+  coolOffSeconds?: number;                // required when risk is "irreversible"
+  uiException?: { reason: string };       // only for AI-only reversible actions; reviewed under C5
   prepare?: (
@@ 2.4a, sync-contract bullets (the line as amended by R2)
-- The privileged projection contains: origins; identity mode, subject, and admission; hosts, escalation routes, and expected responses; concepts and question definitions, including portability; each action's ID, version, kind, risk, scopes, required role, surfaces, effects, and UI exception; AI-visitor limits; promises; data flows, data stores, and retention; legal operator; dependency fallbacks; and provisioning requests.
+- The privileged projection contains: origins; identity mode, subject, and admission; hosts, escalation routes, and expected responses; concepts and question definitions, including portability; each action's ID, version, kind, risk, scopes, required role, surfaces, effects, effect target, timeout, recovery rule, cool-off, and UI exception; AI-visitor limits; promises; data flows, data stores, and retention; legal operator; dependency fallbacks; and provisioning requests.
@@ 3.1 manifest example, action coaching.save-reflection
       "kind": "effect",
       "risk": "reversible",
+      "effect_target": "database",
       "required_scopes": ["reflection:write"],
@@ 3.3 conformance table
-| C4 | Every action has schemas, scopes, kind, effects, and, for effect actions, risk. |
+| C4 | Every action has schemas, scopes, kind, effects, and, for effect actions, risk and effect target. Every external-effect action declares a timeout and a recovery rule, and every irreversible action declares a cool-off. A database-effect action never leaves a receipt in `running` after its RPC returns. |
```

### R16: Give legacy-global apps a conformance profile with dated exceptions
- **Why:** M7 adds a conformance report to PlayMaker "without changing product behavior", but PlayMaker still holds the shared secret key and signs in directly, so C12, C12b, and C22 cannot pass before M11. Without a rule, the report either shows a wall of failures that everyone learns to ignore or quietly skips checks. The conformance runner also needs a protected `preview` branch in Eric's repository, which only Eric can grant.
- **Change:**

```diff
@@ 3.3 Conformance command, after the paragraph beginning "CI and branch-deploy journeys"
 CI and branch-deploy journeys run against a separate staging Supabase project and staging broker built from the same migrations and configuration. Production secrets, sessions, people, and grants are unavailable to every non-production deploy context.
 
+A `legacy-global` app runs every check. A check it cannot pass until a named migration phase reports `declared_exception` with that phase and a target date, never `pass`. PlayMaker and Legends may declare exceptions only for C12 and C12b (until M11) and C22 for their own direct sign-in (until M9). An exception without a target date, or past its date, fails. The status endpoint and evidence bundle list every exception. A `pairwise` app may declare none.
+
+Live conformance on PlayMaker needs a protected `preview` branch in Eric's repository. Question 2 in section 6 includes asking Eric for it.
+
@@ 6. Product questions for Mike, question 2
-   Recommendation: Mike asks Eric once to approve the M7–M9 sequence and to name which screen changes require his personal acceptance. The release seat prepares, merges, flips, verifies, and rolls back flags. If required acceptance has not arrived, the flag remains off; silence is not approval.
+   Recommendation: Mike asks Eric once to approve the M7–M9 sequence, to allow a protected `preview` branch that only the release seat and conformance runner update, and to name which screen changes require his personal acceptance. The release seat prepares, merges, flips, verifies, and rolls back flags. If required acceptance has not arrived, the flag remains off; silence is not approval.
```

### R17: Give the Mac-side estate processor its own narrow database role
- **Why:** The plan has a "Mac-side board importer" claim `soma.estate_inbox` rows and an "authorized estate processor" write `soma.estate_dispositions`, but it never says what credential they use. Today the estate crash alarm reads PlayMaker's tables with the shared secret key. Without a named role, the importer will be built with that key again, which M11 is trying to remove.
- **Change:**

```diff
@@ 2.3b Where the broker runs
 Every broker transaction sets `statement_timeout` to 5 seconds.
 
+The Mac-side estate importer and disposition writer log in as `soma_estate`, a login role with no `BYPASSRLS`. It holds `SELECT` and `UPDATE (claimed_at)` on `soma.estate_inbox`, `INSERT` and `UPDATE` on `soma.estate_dispositions`, `SELECT` on `soma.apps`, and nothing else. Its password lives in the Mac keychain and in no Netlify site. The C12 probes include `soma_estate` and prove it cannot read any app schema, `public` table, or other `soma` table.
+
```

### R18: Define where the host's reply to a contact message goes
- **Why:** Section 1.1 promises the person "later the host's reply in the app", and Golden Journey step 1 starts with an unknown visitor. An anonymous visitor has no account, so "in the app" has no meaning for them, and the plan defines no reply path for the host. Without one, the human handoff ends at "message received".
- **Change:**

````diff
@@ 2.7, after the first route block
 GET /api/soma/v1/status
 ```
 
+`POST /api/soma/v1/contact` accepts a signed-in person or an anonymous visitor. A signed-in person sees the human host's reply at `/contact` in the app. An anonymous visitor receives, once, on the confirmation screen, a thread link carrying an unguessable token, and may add an email address for a reply notice; that address is a declared data flow and is erased with the thread. The host answers from the app's admin feedback queue through the registered `contact.reply` action, which writes to the same `feedback_items` thread. A thread token expires 90 days after the last message and is redacted like other bearer values (section 2.2).
+
 Every conforming app also publishes person-facing routes. Each one is an app function that authenticates the person or agent and calls a narrow broker function, so browser code never touches the `soma` schema.
````

### R19: Make Ask stateless instead of keeping conversation turns on the server
- **Why:** `conversation_id` with "the server keeps at most the last six turns" creates a server-side store of anonymous visitors' questions. That store has no `data_stores` entry, no retention rule, and no export or erasure path, and anonymous turns cannot be tied to a person who asks for erasure. Prior turns carry no authority (section 2.7a), so the client can send them back as untrusted data at no security cost.
- **Change:**

```diff
@@ 2.6a Ask interface
-  conversation_id?: string; // opaque; the server keeps at most the last six turns
+  history?: Array<{ role: "person" | "host"; text: string }>; // at most six turns of at most 2,000 characters; untrusted data
@@
 The server loads knowledge only from the files listed in `guide.ask.knowledge`, bundled at build time and covered by the contract hash. It never accepts knowledge from the request.
+
+The Ask endpoint stores no question, answer, or history. Metering records only counts and cost. An app that wants Ask transcripts for diagnostics must declare them as a data store with a retention rule.
```

### R20: Set a latency budget for the two-hop data path and make page load one broker call
- **Why:** Every private read now crosses two Netlify Functions and a pooled database connection, and a page that needs `/me`, concept state, and answers makes three such calls. The plan sets no latency target, so a slow kit will be discovered by Eric's writers rather than by a gate.
- **Change:**

```diff
@@ 2.3 Authentication boundary for apps
 Because every private read and effect passes through the broker, a broker outage stops private reads and effects for every pairwise app. They fail closed; section 2.3a and section 8.1 describe what keeps working.
 
+Each private request pays two Function invocations and a pooled database round trip. The broker site and each app's Functions run in the Netlify Functions region closest to the shared project's database region, where the Netlify plan allows choosing one. `GET /api/soma/v1/me` returns membership, consented fields, the CSRF token, and the state of every concept the manifest declares in one broker call, so an ordinary page load needs one round trip. Live conformance records p50 and p95 latency for `/me`, a private `observe` action, and a reversible `execute` on the staging alias, and the evidence bundle reports them. The initial budget is p95 under 800 ms for `/me` once the broker is warm; a miss is reported in the evidence and does not fail the run until the budget is ratified from measurements.
+
```

### R21: Remove manifest fields that have only one allowed value
- **Why:** Section 0 decides that a first cross-app visit is always an offer and that the device marker is always a boolean, and section 2.7 fixes the Ask route at `/api/soma/v1/ask`. Declaring these in every manifest adds fields that can only be right or wrong, and the endpoint field invites a manifest that disagrees with the route C14 checks.
- **Change:** (written against the manifest as amended by R2)

```diff
@@ 3.1 manifest example
     "ask": {
-      "endpoint": "/api/soma/v1/ask",
       "knowledge": ["knowledge/host-pair.md"],
@@
     "subject": "pairwise",
     "admission": "open",
-    "first_cross_app_visit": "offer",
-    "device_storage": "boolean-marker",
     "profile_fields": ["display_name", "locale"]
```

### R22: Do not promise a host-chat interface the plan never defines
- **Why:** Section 1.2 keeps AI host chat "behind a shared host-chat interface", but no section defines that interface, and section 5 does not test one. The rules that matter for host chat already exist: the in-app AI host's authority (section 2.6), the `offers` shape (section 2.6a), and data-flow declarations.
- **Change:**

```diff
@@ 1.2 Inventory disposition
-| AI host chat | Keep the persona and inference adapter app-specific behind a shared host-chat interface. |
+| AI host chat | Keep app-specific: persona, inference adapter, and conversation storage stay in the app, and v1 defines no shared host-chat interface. A host chat that offers Show or Do uses the `offers` shape from section 2.6a and the in-app AI host authority rules from section 2.6. Its provider appears in `data_flows`, and any stored conversation appears in `data_stores`. |
```

### R23: Correct the PlayMaker migration count
- **Why:** PlayMaker's `origin/master` holds `0001` through `0089` on 2026-10-07 (`0088_shared_front_door_tickets.sql`, `0089_plays_import_witness.sql`). A hard-coded upper bound in a living plan goes stale; the date keeps it honest.
- **Change:**

```diff
@@ 2.4a, step 3
-3. Applies an approved migration bundle with `soma-scaffold migrate`. The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as the app's owner role, constrained to that app's two schemas. It cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. Tables stay owned by the owner role. After each migration the runner transfers every function in `app_<app_id>_api` to the runtime role. History lives in `app_<app_id>.schema_migrations`; a changed checksum or partially applied migration fails loudly. Inside the same transaction, after each migration, the runner queries the catalog. It rolls the migration back if either schema now holds any of these: a privilege granted to `PUBLIC`, `anon`, or `authenticated`; a table without both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; a runtime role that owns a table or holds a DDL privilege; an API function that is not owned by the runtime role or lacks a `search_path` fixed to `pg_catalog` plus the app's own schema; a view without `security_invoker = true`; a materialized view or foreign table; or an object outside the app's two schemas. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's `0001`–`0087` and a second repository's `0001_…` would collide.
+3. Applies an approved migration bundle with `soma-scaffold migrate`. The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as the app's owner role, constrained to that app's two schemas. It cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. Tables stay owned by the owner role. After each migration the runner transfers every function in `app_<app_id>_api` to the runtime role. History lives in `app_<app_id>.schema_migrations`; a changed checksum or partially applied migration fails loudly. Inside the same transaction, after each migration, the runner queries the catalog. It rolls the migration back if either schema now holds any of these: a privilege granted to `PUBLIC`, `anon`, or `authenticated`; a table without both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; a runtime role that owns a table or holds a DDL privilege; an API function that is not owned by the runtime role or lacks a `search_path` fixed to `pg_catalog` plus the app's own schema; a view without `security_invoker = true`; a materialized view or foreign table; or an object outside the app's two schemas. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's numbered migrations (`0001`–`0089` on 2026-10-07) and a second repository's `0001_…` would collide.
```
