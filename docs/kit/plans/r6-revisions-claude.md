# Revisions, round 6, Claude Opus 5.5

_Reviewer: Claude Opus 5.5 (Claude Code), fresh conversation, for Mike Wolf, 2026-10-07. Every claim about current code was checked on disk or against the live site on 2026-10-07; paths are relative to `~/Projects/`._

### R1: Contract sync must follow Netlify deploy contexts, survive rollback, and run journeys on the registered alias

- **Why:** As written, every app build runs `sync-contract` with the release credential and the broker keeps only the current and previous hash. A per-pull-request deploy preview would therefore advance production's contract hash before anything merges, and two open pull requests would evict the hash of the release that is actually live. Netlify's "Publish deploy" rollback republishes an old build without rebuilding, so a rollback would also break the app. Separately, section 3.3 runs journeys against `$DEPLOY_PREVIEW_URL`, a per-deploy origin that section 2.4a says can never be registered, so the sign-in journeys cannot pass there. Finally, `soma-scaffold` is a local tool in `soma-platform`, so an app's Netlify build has no `soma-scaffold` command to run.
- **Change:**

```diff
@@ section 0, decisions table @@
-| Fifteen minutes, two hours, or four hours for a new app | Require a local build in 15 minutes, a deploy preview in 30 minutes, and the complete Golden Journey in four working hours. | These measure three different outcomes and preserve the useful challenge in each source plan. |
+| Fifteen minutes, two hours, or four hours for a new app | Require a local build in 15 minutes, a live branch deploy on the registered `preview--` alias in 30 minutes, and the complete Golden Journey in four working hours. | These measure three different outcomes and preserve the useful challenge in each source plan. |
```

```diff
@@ section 2.4, shared schema table @@
-| `soma.apps` | `app_id`, `name`, `origins`, `contract_sha256`, `previous_contract_sha256`, `identity_subject`, `kit_version`, `status` | Platform-managed, except that `soma-scaffold sync-contract` may advance the contract hashes within the limits in section 2.4a. Public reads expose only active metadata. |
+| `soma.apps` | `app_id`, `name`, `origins`, `contract_sha256`, `identity_subject`, `kit_version`, `status` | Platform-managed, except that `sync-contract` may set `contract_sha256` within the limits in section 2.4a. Public reads expose only active metadata. |
+| `soma.app_contracts` | `app_id`, `contract_sha256`, `release_sha`, `deploy_context`, `synced_at`, `retired_at` | Written by `sync-contract` through the broker. Read by the broker on every call; a lookup may be cached for at most 60 seconds. One row per hash the app has ever synced. |
```

```diff
@@ section 2.4a, registration steps @@
-4. Mints the runtime installation credential and the release credential, and sets them in the app's Netlify environment with the command's output redirected, so neither secret is ever printed. The release credential (`SOMA_APP_RELEASE_KEY`) is scoped to Netlify builds only, so the app's Functions never see it.
-5. Registers exactly two redirect origins at prototype tier: the production origin and one fixed branch-deploy alias, `https://preview--<site>.netlify.app`. The alias is registered only with the staging broker, because deploy previews never reach production (section 3.3). Per-deploy URLs are not registrable, and no wildcard is ever accepted.
+4. Mints a runtime installation credential and a release credential for each broker, and sets them in the app's Netlify environment by deploy context, with the command's output redirected so no secret is ever printed.
+   - The `production` context receives the production broker's credentials and `SOMA_BROKER_URL`.
+   - The `branch-deploy` context receives the staging broker's credentials and URL.
+   - The `deploy-preview` context receives no SOMA credential. A per-pull-request build cannot complete sign-in (item 5), and it must not move any registry.
+   - The release credential (`SOMA_APP_RELEASE_KEY`) has the Netlify "Builds" scope only, so the app's Functions never see it.
+5. Registers exactly two redirect origins at prototype tier: the production origin and one fixed branch-deploy alias, `https://preview--<site>.netlify.app`. The alias is registered only with the staging broker. Per-deploy URLs are not registrable, and no wildcard is ever accepted. Before registering, `register` verifies three things: the Netlify site exists, it is linked to the app repository, and it builds branch deploys for the `preview` branch. If any is missing, `register` fails and names the missing setting. (A site created without a repository link builds without its environment variables.)
```

```diff
@@ section 2.4a, contract sync @@
-An ordinary pull request that edits the manifest or a file it references changes the contract hash. The broker enforces that hash, so without a registry update an auto-deployed change would stop working until the steward intervened. Therefore every app build runs `soma-scaffold sync-contract <soma-app.json>` before the deploy publishes:
+An ordinary pull request that edits the manifest or a file it references changes the contract hash. The broker enforces that hash, so without a registry update an auto-deployed change would stop working until the steward intervened. Therefore the app's build command runs `node vendor/soma/bin/sync-contract.mjs soma-app.json` before the deploy publishes. The scaffolder vendors this script with `@soma/contracts`, including the RFC 8785 canonicalizer, and `soma-kit.lock.json` hashes it. Vendoring matters for two reasons: the app's Netlify build has no access to `soma-platform`, and the build must compute the contract hash with exactly the code the broker uses.
@@
-- Otherwise the broker moves the current hash to `previous_contract_sha256`, records the new hash as `contract_sha256`, and updates `soma.app_hosts`. It accepts both hashes until the status endpoint reports the new release, so the deploy that is still live keeps working during the switch.
+- Otherwise the broker records the new hash in `soma.app_contracts` with its commit SHA and deploy context, sets `soma.apps.contract_sha256` to it, and updates `soma.app_hosts`.
+- The broker accepts every hash in `soma.app_contracts` that belongs to that app and has not been retired. Keeping only the current and previous hash would fail in two ways. First, a Netlify rollback republishes an old build without rebuilding it, so the old hash must keep working. Second, builds for two commits can finish in either order.
+- A hash is retired only in two cases: the steward retires it, or a later approved migration removes an RPC that the hash's actions call. Retiring a hash is the documented way to stop an old release from calling the broker.
+- `sync-contract` contacts a broker only in the `production` and `branch-deploy` contexts. In the `deploy-preview` context it exits successfully without contacting any broker. That build continues as a static preview with sign-in disabled.
@@
-Running `register` is not an edit to `soma-platform`, so it does not fail the second-app test. Its time counts toward the 30-minute deploy-preview target.
+Running `register` is not an edit to `soma-platform`, so it does not fail the second-app test. Its time counts toward the 30-minute branch-deploy target.
```

~~~diff
@@ section 3.3 @@
-Run against a deploy preview:
+Run against the app's registered staging alias:
 
 ```bash
 cd ~/Projects/soma-platform
 node packages/soma-conformance/bin/soma-conform.mjs \
   --contract /path/to/app/soma-app.json \
   --repo /path/to/app \
-  --url "$DEPLOY_PREVIEW_URL" \
+  --url "https://preview--<site>.netlify.app" \
+  --expect-sha "<candidate commit SHA>" \
   --environment staging \
   --tier prototype \
   --journeys
 ```
+
+The runner pushes the candidate commit to the app's `preview` branch. It then waits until `/api/soma/v1/status` on the alias reports that commit's SHA, and only then runs the journeys. It never tests whatever happens to be deployed. Only one run per app holds the alias at a time; a second run waits for the first. Per-pull-request deploy previews remain useful for visual review, but they never carry SOMA credentials and never count as conformance evidence.
~~~

```diff
@@ section 3.3 @@
-CI and deploy-preview journeys run against a separate staging Supabase project and staging broker built from the same migrations and configuration. Production secrets, sessions, people, and grants are unavailable to deploy previews.
+CI and branch-deploy journeys run against a separate staging Supabase project and staging broker built from the same migrations and configuration. Production secrets, sessions, people, and grants are unavailable to every non-production deploy context.
```

```diff
@@ section 5, time targets @@
-| Live Netlify deploy preview | 30 minutes |
+| Live branch deploy on `https://preview--<site>.netlify.app` against the staging broker | 30 minutes |
```

### R2: The Guide needs a kit mode; its existing hooks would post names and email addresses as concepts

- **Why:** Section 2.7 says the identity adapter can bind the Guide's `cfg.identity.recordSeen` to `POST /me/concepts/:id` and that "the Guide itself needs no change". That is false. In `packages/soma-guide/soma-guide.js` (`SOMA_GUIDE_VERSION = '2026-0727a'`), `recordSeen` receives four different things. It receives a walkthrough ID when a tour *starts* (`_wtStart`, line 1235). It receives a Do action ID (`_commitDo`, line 2537). And it receives the objects `{ display_name }` and `{ email }` (`_applyName` and `_applyEmail`, lines 2041 and 2053). The same two functions also write the name and email to the app origin's `localStorage`. The Guide's Do replays DOM clicks and has only one risk flag, `risk: 'high'`, which routes the request to feedback. Bound as the plan describes, the adapter would post an email address as a concept ID and record an abandoned tour as `shown`. Every AI-host action would also be credited to the person, and the AI host's `reversible` cap would never apply. Legends' live hook (`legends-membership-site/js/legends-guide-config.js`, line 158) already pushes whatever it receives into `public.soma_profiles.guide_seen.legends`, so that cross-app column can hold names and email addresses today.
- **Change:**

```diff
@@ section 2.7 @@
-The vendored identity adapter binds the Guide's existing `cfg.identity.recordSeen` hook to `POST /me/concepts/:id`. The Guide itself needs no change.
+The Guide gains a kit mode, enabled by `cfg.kit = { app_id, me, actions, concepts }`. It needs one because its current hooks do not have the kit's meaning:
+
+- Today `cfg.identity.recordSeen` receives four different things: a walkthrough ID when a tour starts, a Do action ID, `{ display_name }`, and `{ email }`. In kit mode the Guide does not call `recordSeen`. It calls three separate hooks instead: `cfg.kit.concepts.told(concept_id)` when it presents a concept's `tell` text without being asked, `cfg.kit.concepts.workflowCompleted(workflow_id)` after the last step of a workflow, and `cfg.kit.concepts.acknowledged(concept_id)` from an explicit "I already know this" control.
+- The vendored adapter maps a workflow to a concept only through the manifest's `concepts[].show` field, and only then records `shown`. Action IDs never become concept state, because `done` comes only from receipts. The adapter rejects every argument that is not a declared ID.
+- In kit mode the Guide never writes `name` or `email` to `localStorage`. It reads the display name from `GET /api/soma/v1/me`. Without this, the app origin would hold PII that C10, which inspects only the device marker, never sees.
+- In kit mode, Do calls `cfg.kit.actions.prepare` and `cfg.kit.actions.execute` from the vendored `@soma/actions` client, with the AI host as actor. The server's preview and risk gate replace the Guide's local confirm text and its `risk: 'high'` flag. DOM-replay `steps` remain available only for `view` actions.
+- The scaffolder compiles each manifest step's `text` field into the Guide's `narration` field.
+- The release's Content Security Policy must allow what the Guide actually does: inline `<style>` from `soma-assist-core`, and `data:` audio when voice is enabled. Golden Journeys run under the generated policy, not a relaxed one.
+
+Consumers that do not set `cfg.kit` keep today's behavior on the root channel.
```

```diff
@@ section 4.1, M0 @@
-| M0: Freeze evidence | Record current package APIs. Generate a fixture from PlayMaker’s current action catalogue. Capture PlayMaker invitation, sign-in, feedback, and Agent API journeys. Capture all 22 Legends Guide configurations. Record which current outside AIs are fetch-only and which have an HTTP or code tool. Generate the live database isolation baseline described in section 2.4a. | The old journeys run before kit code changes. The fixture records the actual action count rather than trusting a prose count. The outside-AI evidence names each AI and its available tool class. The database report accounts for every exposed schema, role grant, policy, trigger, view, and callable privileged function. |
+| M0: Freeze evidence | Record current package APIs. Generate a fixture from PlayMaker’s current action catalogue. Capture PlayMaker invitation, sign-in, feedback, and Agent API journeys. Generate the list of every Legends page that loads the Guide and every Guide configuration file; on 2026-10-07 that was 33 HTML pages and 5 configuration files, not the 22 the inventory states. Count the `public.soma_profiles.guide_seen` entries that are not plain walkthrough-ID strings, without exporting their values. Record which current outside AIs are fetch-only and which have an HTTP or code tool. Generate the live database isolation baseline described in section 2.4a. | The old journeys run before kit code changes. The fixture records the actual action and page counts rather than trusting a prose count. The outside-AI evidence names each AI and its available tool class. The database report accounts for every exposed schema, role grant, policy, trigger, view, and callable privileged function. |
```

```diff
@@ section 4.1, M5 @@
-| M5: Consolidate plumbing | Expand `@soma/tickets`. Make `@soma/feedback` canonical. Add static adapters, versioned Guide assets, meter UI, and transactional estate-event delivery. | Package tests pass. A generated React app and generated static fixture use the same contracts. |
+| M5: Consolidate plumbing | Expand `@soma/tickets`. Make `@soma/feedback` canonical. Add static adapters, versioned Guide assets, Guide kit mode (section 2.7), meter UI, and transactional estate-event delivery. | Package tests pass. A generated React app and generated static fixture use the same contracts. A Guide test proves that kit mode writes no name or email to storage and records `shown` only on workflow completion. |
```

```diff
@@ section 4.3 @@
 `public.soma_profiles` remains unchanged until every caller is inventoried. If it becomes a compatibility view, it uses `security_invoker = true`, exposes only the legacy fields required by named legacy consumers, and is granted only to those consumers. Pairwise apps receive no access to it.
+
+The concept-state backfill from `guide_seen` copies only string entries that match a declared workflow. A one-time cleanup removes the non-string entries, which can contain names and email addresses, before any compatibility view exposes the column.
```

```diff
@@ section 8.2, must include @@
-- One keyboard-accessible Show workflow using stable `data-soma` targets, served from an immutable versioned Guide path. The Guide's root channel is not changed.
+- One keyboard-accessible Show workflow using stable `data-soma` targets, served from an immutable versioned Guide path in kit mode. The Guide's root channel is not changed.
```

### R3: Define the Ask interface; today's Guide sends client-assembled context and page text

- **Why:** The plan requires a provider-neutral Ask endpoint "implementing the kit's Ask interface" but never defines that interface. The interface the Guide actually speaks (`_askInference`, `soma-guide.js` line 3133) is unsafe for the kit. The browser assembles up to 8,000 characters of `context`, including up to 4,000 characters of the page's visible text, and sends it with `allowWeb` and a client-chosen `app_id`. That has three consequences. Any caller can supply its own "knowledge", so the answer is not grounded in declared knowledge. Page text can contain another member's content or the person's own private data, and it goes to the inference vendor without a declared data flow. And cost is attributed to whatever `app_id` the browser names.
- **Change:** Insert a new section after section 2.6, and amend the manifest example, C19a, and Golden Journey step 9.

```diff
@@ end of section 2.6, before "### 2.7 AI visitor door" @@
 `consequential` and `irreversible` actions are never AI-only.
+
+### 2.6a Ask interface
+
+```ts
+// POST /api/soma/v1/ask   (public; quotas from section 2.7a)
+export interface AskRequest {
+  question: string;         // at most 2,000 characters
+  route?: string;           // the app path the person is on, such as "/agenda"
+  page_context?: string;    // at most 4,000 characters; accepted only when guide.ask.page_context is true
+  conversation_id?: string; // opaque; the server keeps at most the last six turns
+}
+
+export interface AskResponse {
+  answer: string;
+  grounded: boolean;        // false when no declared source supports the answer
+  citations: Array<{ path: string; heading?: string }>; // every path is in guide.ask.knowledge
+  offers: Array<
+    | { kind: "show"; workflow_id: string }
+    | { kind: "do"; action_id: string; action_version: string }
+  >;                        // only declared workflows, and only actions this caller may prepare
+}
+```
+
+The server loads knowledge only from the files listed in `guide.ask.knowledge`, bundled at build time and covered by the contract hash. It never accepts knowledge from the request.
+
+The server takes `app_id` from its own installation, never from the request.
+
+`page_context` is off by default. An app that turns it on must declare a data flow that names page text, and the server treats that text as untrusted data under section 2.7a.
+
+Web search is off unless the manifest sets `guide.ask.web: true` and declares the search provider as a data flow.
+
+When `grounded` is false, the answer says that the app's knowledge does not cover the question, and it offers the human host's escalation route.
+
+A `do` offer is only an invitation. Running it goes through `prepare` and the risk gate like any other request.
+
+The endpoint either streams its answer or sets its Function timeout explicitly and answers within it, because Netlify cuts off a synchronous Function at its configured limit (10 seconds by default). A timeout returns `grounded: false` with the human host's route, never an empty answer.
+
+The Guide's current request shape, `{ question, context, persona, allowWeb, app_id }`, remains acceptable to legacy endpoints only. The kit endpoint ignores `context`, `persona`, `allowWeb`, and `app_id`.
```

```diff
@@ section 3.1, manifest example @@
     "ask": {
       "endpoint": "/api/soma/v1/ask",
-      "knowledge": ["/knowledge/host-pair.md"]
+      "knowledge": ["/knowledge/host-pair.md"],
+      "page_context": false,
+      "web": false
     },
```

```diff
@@ section 3.3, gate table @@
-| C19a | When the Guide is enabled, `data_flows` declares the Ask inference provider and, when voice is enabled, the voice provider. The Ask endpoint's knowledge contains every concept's `tell` file. |
+| C19a | When the Guide is enabled, `data_flows` declares the Ask inference provider, the voice provider when voice is enabled, page text when `page_context` is enabled, and the search provider when `web` is enabled. The Ask endpoint's knowledge contains every concept's `tell` file. A request that carries `context`, `app_id`, or instructions inside `page_context` cannot change the sources cited, the app charged, or the offers returned. |
```

```diff
@@ section 5, Golden Journey @@
-9. Ask returns an answer grounded in declared knowledge.
+9. Ask returns an answer grounded in declared knowledge, with citations. A question the knowledge does not cover returns `grounded: false` and the human host's route.
```

### R4: Authorize inside the same broker call and transaction that acts

- **Why:** Section 2.7 has the app Function ask the broker to authorize a grant, and then perform the read or effect in a separate step. A revocation committed between the two calls is ignored for that request, so C9's "next request fails" holds only by luck of timing. The split also adds a second cross-site round trip, between two separate Netlify sites, to every private request. One call that authorizes and acts in one transaction is both safer and simpler.
- **Change:**

```diff
@@ section 2.3 @@
-The browser calls same-origin app Functions. A Function validates the broker-issued person session or agent access token, then calls the broker with the app installation credential.
+The browser calls same-origin app Functions. A Function makes one broker call per operation, `POST /broker/v1/invoke`. The call carries the installation credential, the person's session handle or the agent's access token, the registered RPC name, and its arguments. The broker validates the principal, authorizes it, and runs the RPC inside one database transaction.
```

```diff
@@ section 2.7 @@
-Signature, issuer, expiry, and audience validation establish token authenticity only. Before every non-public read or effect, the app Function asks the broker to authorize the token's `grant_id`, `grant_version`, scope, risk, principal, and action. Effect authorization is never served from a cache. Broker failure fails closed for effects and private reads.
+Signature, issuer, expiry, and audience validation establish token authenticity only. The app Function may use them to reject a bad token early, but it never authorizes on that basis. The broker checks `grant_id`, `grant_version`, scope, risk, principal, and action inside the same `invoke` call and database transaction that performs the read or effect. It reads the grant row with `FOR SHARE`, so a revocation either commits before the request and refuses it, or waits until the request finishes. An external-effect action is authorized this way at the call that claims its receipt. Authorization is never served from a cache. Broker failure fails closed for effects and private reads.
```

### R5: Say where the broker runs and how it reaches the database

- **Why:** The plan names an `apps/soma-id` service, but it never says what hosts the service or how the service reaches Postgres. The design depends on that answer. One broker transaction must call an app RPC in an unexposed schema and insert a `soma` row. PostgREST cannot do that, because it serves only exposed schemas and runs one statement per request. The plan also misses a benefit it should claim. The shared project's Supabase Auth redirect allowlist was full on 2026-10-05 (1,998 of 2,048 bytes; `SOMA/tools/auth/README.md` says "the next site will need real pruning or its own auth project"). Today every new app consumes allowlist bytes. Under the broker, a new app consumes none.
- **Change:** Insert after section 2.3a, and amend the section 2.8 row.

```diff
@@ end of section 2.3a, before "### 2.4 Data model" @@
+### 2.3b Where the broker runs
+
+The identity origin and broker are one Netlify site, `soma-id`, built from `soma-platform/apps/soma-id/` with its own `netlify.toml`. The existing root `netlify.toml`, which publishes `dist/` for the Guide CDN, is left unchanged. A second site, `soma-id-staging`, is built from the same commit against the staging Supabase project.
+
+Broker Functions reach Postgres with the `pg` driver through the Supavisor pooler in transaction mode, with prepared statements disabled.
+
+They log in as `soma_broker`, a role with no `BYPASSRLS`. That role holds `EXECUTE` on registered `app_*_api` functions and the `soma` grants it needs, and nothing in `public` except the named legacy RPCs it wraps. Every broker transaction sets `statement_timeout` to 5 seconds.
+
+The `soma_broker` password, the agent-token signing key, and the refresh-hash key are the broker site's only secrets. The Supabase secret key used for Auth administration lives in a separate Function that ordinary `invoke` calls cannot reach (section 2.3).
+
+The person signs in on the identity origin through Supabase Auth with server-side cookie storage. The Auth session never sits in `localStorage` on the identity origin, so a script injected into that origin cannot read a global session.
+
+Only the identity origin's callback URLs are entered in Supabase Auth's redirect allowlist. App origins are registered in `soma.apps` and checked by the broker. A new app therefore adds no entry to the shared project's allowlist, which was full on 2026-10-05 (`SOMA/tools/auth/README.md`).
```

```diff
@@ section 2.8 @@
-| `packages/soma-identity` | Vendored client adapter plus central `apps/soma-id` service | Cross-app recognition needs one broker and app-local integration. |
+| `packages/soma-identity` | Vendored client adapter plus the central `soma-id` Netlify site built from `apps/soma-id` (section 2.3b) | Cross-app recognition needs one broker and app-local integration. |
```

### R6: M3 must remove every shared credential the generator emits, not only two names in the template

- **Why:** M3 removes `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template`, but the generator hands out more than that. The template's `.env.example` and `netlify/functions/lib/boardCard.ts` require `CLAUDE_EMAIL_PW`, so every generated app holds the password of the estate's own `claude@` mailbox. The template's `src/lib/somaAuthConfig.ts` falls back to the shared project's URL and anon key, and the vendored `@soma/signin` signs in directly against Supabase Auth. That gives the browser an `authenticated` JWT, which section 2.3a forbids for pairwise apps. The scaffolder's static-site mode also adds `SUPABASE_SERVICE_ROLE_KEY` to its environment list (`soma-scaffolder/src/scaffold.mjs` line 109). Its `provision.mjs` (line 79) runs `netlify env:set SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"`, which prints the value. The new `soma.estate_inbox` replaces board-card email, so none of these is needed.
- **Change:**

```diff
@@ section 1.2 @@
-| `soma-platform/packages/soma-signin` | Keep as canonical. Add React and static adapters. |
+| `soma-platform/packages/soma-signin` | Keep as canonical. Add React and static adapters. Add a broker mode that signs in only through the identity origin (section 2.2); it is the only mode a pairwise app may use. The current direct Supabase Auth mode remains for the two legacy-global apps. |
```

```diff
@@ section 4.1, M3 @@
-| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template` and its functions; a generated app receives only its installation credentials (`SOMA_APP_INSTALLATION_KEY` and, during rotation, `SOMA_APP_INSTALLATION_KEY_NEXT`) and, in its build environment only, its release credential (`SOMA_APP_RELEASE_KEY`). | Two disposable origins complete the offered cross-app journey without exposing a global person ID. A freshly generated app's environment contains no shared-project secret. |
+| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove every shared credential from the generator: `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template`, its functions, `soma-scaffolder/src/scaffold.mjs`, and `soma-scaffolder/src/provision.mjs`; the `VITE_SUPABASE_*` values and the shared-project fallback in `src/lib/somaAuthConfig.ts`; and `CLAUDE_EMAIL_*` with `netlify/functions/lib/boardCard.ts`, whose job `soma.estate_inbox` takes over. A generated app receives only `SOMA_BROKER_URL`, its installation credentials (`SOMA_APP_INSTALLATION_KEY` and, during rotation, `SOMA_APP_INSTALLATION_KEY_NEXT`), in its build environment only its release credential (`SOMA_APP_RELEASE_KEY`), and provider keys for data flows its manifest declares. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. A freshly generated app's environment, `.env.example`, and bundled browser code contain no shared-project key, Supabase URL, or estate mailbox credential. |
```

```diff
@@ section 3.3, gate table @@
 | C12a | Every `SECURITY DEFINER` function the app can call derives its app from authenticated context. A probe passing another app's ID as an argument fails. |
+| C12b | The app's `.env.example`, `netlify.toml`, Function source, and built browser bundle reference no environment name outside an allowlist: `SOMA_BROKER_URL`, `SOMA_APP_INSTALLATION_KEY`, `SOMA_APP_INSTALLATION_KEY_NEXT`, `SOMA_APP_RELEASE_KEY`, and the provider keys named by declared data flows. The bundle contains no Supabase project URL or key. |
```

### R7: Legends publishes its repository root, including server code; fix the publish directory before vendoring kit code into it

- **Why:** `legends-membership-site/netlify.toml` sets `publish = "."`. On 2026-10-07, four of its repository files returned HTTP 200 from the live site: `https://legends-membership.netlify.app/netlify/functions/admin-users.js`, `/CLAUDE.md`, `/supabase-idea-submissions.sql`, and `/package.json`. The first of these includes the bootstrap admin email list. M6 plans to vendor static identity and action adapters into this repository. Those adapters include Function-side code, migrations, and the kit lock, and they would all be published as public files. The exposure is live today, and its fix is a configuration change, so it belongs with the other week-one interim controls.
- **Change:**

```diff
@@ section 4.1, M6 @@
-| M6: Legends preview | Generate `legends-membership-site/soma-app.json`. Vendor static identity and action adapters. Pin the Guide. Adapt its changelog and concept state behind flags. | Existing anonymous, member, admin, Guide, and degraded-CDN journeys pass on a deploy preview. |
+| M6: Legends preview | First change Legends' build to copy only public pages and assets into `_site/` and publish that directory, so Function source, SQL, migrations, agent documents, and `package.json` stop being served. Then generate `legends-membership-site/soma-app.json`. Vendor static identity and action adapters. Pin the Guide. Adapt its changelog and concept state behind flags. | C24 passes on the live site. Existing anonymous, member, admin, Guide, and degraded-CDN journeys pass on the branch deploy. |
```

```diff
@@ section 3.3, gate table @@
 | C23 | Public endpoints enforce body, rate, concurrency, timeout, and cost limits before provider calls. Untrusted content cannot select tools, scopes, principals, or risk levels. |
+| C24 | The deployed site serves no file from `netlify/functions/`, `supabase/`, `migrations/`, or `vendor/soma/` server paths, and no `*.sql`, `.env*`, `package.json`, `CLAUDE.md`, or `AGENTS.md`. The check requests each path from the live origin and expects 404. |
```

```diff
@@ section 8.2 @@
-Outside the kit build, the release seat still performs the week-one interim control from section 2.3a: separate revocable secret keys for PlayMaker and Legends. It is an environment change, not a code change, and it reduces a live exposure that the slice does not otherwise touch.
+Outside the kit build, the release seat still performs two week-one interim controls. The first is from section 2.3a: separate revocable secret keys for PlayMaker and Legends. The second is Legends' publish-directory fix from M6. Both are configuration changes, not product changes, and each reduces a live exposure that the slice does not otherwise touch.
```

### R8: Immutable Guide versions need retained files, a clean tree, and CORS, or SRI pinning fails

- **Why:** Each `netlify deploy --prod --dir dist` replaces the whole site with the contents of the local `dist/` directory. It does not add to the previous deploy. A `/v1.0.0/` path therefore stays live only if every later deploy still contains that directory byte for byte. The current script only prints a note when `dist/` has uncommitted changes. That risk is real: on 2026-10-07, `dist/soma-owner.js` and `dist/soma-manager.js` existed on disk but were not tracked in git, so the next deploy from another checkout would drop them. In addition, a cross-origin `<script integrity=…>` must be loaded with `crossorigin="anonymous"`, and that load succeeds only if the response carries `Access-Control-Allow-Origin`. Today that header is set only for the two root paths, in both `netlify.toml` and `dist/_headers`.
- **Change:**

```diff
@@ section 2.8, after the deploy-guide.sh paragraph @@
 `deploy-guide.sh` publishes each release twice: to `/v<semver>/` with `Cache-Control: public, max-age=31536000, immutable`, and to the root path that existing non-kit consumers load. Every executable, stylesheet, worker, and optional chunk is listed in the lock file and receives an integrity hash. Publishing an existing semantic version is a no-op only when every byte matches; otherwise it fails. Kit apps load only the versioned path. `dist/releases.json` maps each semver to its `SOMA_GUIDE_VERSION` date string and its complete asset manifest.
+
+Because every Netlify production deploy replaces the whole site, `deploy-guide.sh` adds three checks:
+
+- Before deploying, it refuses to run when `dist/` or `packages/` has uncommitted or untracked files.
+- Before deploying, it verifies that every version in `dist/releases.json` is present under `dist/v<semver>/` and matches its recorded hashes.
+- After deploying, it fetches every asset of every listed version from the CDN and compares its SHA-384 with the lock value.
+
+`dist/v*/` is committed to git and is never deleted.
+
+Versioned paths are served with `Access-Control-Allow-Origin: *`, and kit pages load them with `crossorigin="anonymous"`, because the browser refuses a cross-origin integrity check without CORS.
+
+`soma-assist-core` is a separate global script today, and Legends does not load it. When it is absent, the Guide shows its legacy panel. Bundling it into a kit release therefore changes the Guide's interface for kit apps, and Golden Journeys must cover the panel that actually ships. The lock lists every asset the release actually loads.
```

### R9: Make the app-schema isolation a checked post-condition, not a property of good migrations

- **Why:** PostgreSQL grants `EXECUTE` to `PUBLIC` on every new function by default. A role that owns a schema can also grant `USAGE` on that schema, and it can grant rights on its own objects to `anon` or `authenticated`. The plan says app RPCs "have `EXECUTE` revoked from `PUBLIC`", but nothing makes that true for the next migration a builder writes. A migration runner that checks the catalog after each migration turns this from a convention into a gate.
- **Change:**

```diff
@@ section 2.4a, registration step 2 @@
-2. Creates private schemas `app_<app_id>` and `app_<app_id>_api`, with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`). Neither schema is added to PostgREST's exposed schemas, and neither grants access to `anon` or `authenticated`.
+2. Creates private schemas `app_<app_id>` and `app_<app_id>_api`, with hyphens replaced by underscores (`veric-coaching` becomes `app_veric_coaching`). The platform, not the app's migration owner, owns both schemas. Neither schema is added to PostgREST's exposed schemas, and neither grants access to `anon` or `authenticated`. Registration also runs `ALTER DEFAULT PRIVILEGES FOR ROLE <app owner> REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.
```

```diff
@@ section 2.4a, registration step 3 @@
-3. Applies an approved migration bundle with `soma-scaffold migrate`. The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as a no-login owner constrained to that app's two schemas. It cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. History lives in `app_<app_id>.schema_migrations`; a changed checksum or partially applied migration fails loudly. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's `0001`–`0087` and a second repository's `0001_…` would collide.
+3. Applies an approved migration bundle with `soma-scaffold migrate`. The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as a no-login owner constrained to that app's two schemas. It cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. History lives in `app_<app_id>.schema_migrations`; a changed checksum or partially applied migration fails loudly. Inside the same transaction, after each migration, the runner queries the catalog. It rolls the migration back if either schema now holds any of four things: a privilege granted to `PUBLIC`, `anon`, or `authenticated`; a function without a fixed `search_path`; a `SECURITY DEFINER` function owned by a role other than the app owner; or a table without RLS. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's `0001`–`0087` and a second repository's `0001_…` would collide.
```

### R10: Defend device-code pairing against phishing

- **Why:** RFC 8628 device authorization is a known phishing channel, and the plan adopts it without a defense. An attacker starts a pairing for their own AI, labels it "Your assistant", and sends the victim the verification link. The victim approves on the real identity origin, and the attacker's AI receives a grant to act as the victim. The label on the consent screen is chosen by the requester, so showing it does not help.
- **Change:**

```diff
@@ section 2.7 @@
-The device-code screen shows the AI label, destination app, requested scopes, risk ceiling, purpose, and expiry.
+The device-code screen shows the AI label, destination app, requested scopes, risk ceiling, purpose, and expiry. It marks the label as chosen by the AI, not verified by SOMA.
+
+The identity origin never offers a `verification_uri_complete` link. The person must type the user code that their own AI displayed to them, and the screen says to continue only if they started this pairing themselves a moment ago.
+
+A device code lives at most 10 minutes. Each one accepts at most five wrong user-code entries.
+
+Every new AI partner is announced to the person through a channel the attacker does not control: a message to the person's verified email, naming the label, the app, the scopes, and a one-tap revoke link that opens the identity origin. A phished pairing is therefore visible to the person even when they never open their grant list.
```

### R11: Close the other two ticket RPCs and make redemption create the membership

- **Why:** The plan fixes `ticket_create` but leaves its two siblings open. `public.ticket_lookup(p_app, p_token)` and `public.ticket_use(p_app, p_token, p_visitor_id)` are `SECURITY DEFINER`, granted to `anon`, and trust a caller-supplied `p_app` (`packages/soma-tickets/sql/schema.sql`, lines 146–260). `ticket_use` marks a ticket used for any browser-chosen `p_visitor_id` and creates no membership. As a result, "invitations admit the person" is not true for any app except PlayMaker, which creates the membership in its own code. Also, the existing `ticket_create` admits anyone who has any row in PlayMaker's studio table `public.memberships`, not membership in the app named by `p_app`. Under the kit, a pairwise app has no `anon` or `authenticated` path to the shared project, so it cannot call any of the three functions.
- **Change:**

```diff
@@ section 1.2 @@
-| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation implementation. Add `ticket_create_v2`, which takes the app from the `app_id` the broker derives from the installation credential and admits the inviter by `soma.memberships` role under that app's invitation policy. Restrict the existing `ticket_create(p_app, …)` to `p_app = 'playmaker'` until PlayMaker moves to v2, then retire it. |
+| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation implementation. Rows stay in `public.tickets`, keyed by its `app` column. Add three v2 functions, owned by the platform and executable only by `soma_broker`; each takes the app from the `app_id` the broker derives from the installation credential. `ticket_create_v2` admits the inviter by `soma.memberships` role under that app's invitation policy. `ticket_lookup_v2(p_token)` returns only status, invitee name, inviter name, and quote line. `ticket_redeem_v2(p_token)` requires a signed-in principal and, in one transaction, marks the ticket used and creates or reactivates that person's `soma.memberships` row for the app. Restrict the existing `ticket_create`, `ticket_lookup`, and `ticket_use` to `p_app = 'playmaker'` until PlayMaker moves to v2, then retire them. (Today `ticket_create` admits anyone with any PlayMaker studio membership, whatever `p_app` says.) |
```

### R12: `@soma/meter` is PlayMaker-shaped; give pairwise apps a broker store and per-app tables

- **Why:** The plan calls metering core and says the package "participates in the app's transaction boundary", but its tables cannot serve another app. `public.usage_events.studio_id` and `public.entitlements.studio_id` reference PlayMaker's `public.studios`, and `subscriber_id` references `auth.users` (`packages/soma-meter/sql/schema.sql`). A pairwise app has neither a studio nor an `auth.users` ID. The scaffolder's vendored meter also reaches its store through `SUPABASE_SERVICE_ROLE_KEY`, which M3 removes (`packages/soma-scaffolder/README.md`). As written, the second app has no place to record usage and no credential to record it with.
- **Change:**

```diff
@@ section 1.2 @@
-| `soma-platform/packages/soma-meter` | Keep. Add a generic client chip based on `playmaker/src/components/UsageChip.tsx`. |
+| `soma-platform/packages/soma-meter` | Keep the gate and pricing logic. Add `createBrokerStore`, which implements the existing store interface over `app_<app_id>.usage_events` and `app_<app_id>.entitlements` through broker RPCs. Rename the store's `resolveStudioId` to `resolveBillingSubject`, keeping the old name as an alias for PlayMaker. A pairwise app's billing subject is the `app_person_id`. Usage by an anonymous visitor, such as public Ask, is charged to the app's own operator entitlement row, which carries the daily cost budget from section 2.7a. PlayMaker keeps `createSupabaseRestStore` and its `public` tables until M11. Add a generic client chip based on `playmaker/src/components/UsageChip.tsx`. |
```

```diff
@@ section 2.4, per-app schema table @@
 | `front_door_events` | Consent-aware arrival and conversion events. |
+| `usage_events` | Metered consumption keyed by `app_person_id`, or by the operator subject for anonymous use. The columns of `public.usage_events`, with `app_person_id` in place of `studio_id` and `subscriber_id`. |
+| `entitlements` | Caps, allowances, and billing mode per billing subject, including the operator row that funds anonymous Ask. |
```

### R13: Make the human handoff deliver a message, not just display a link

- **Why:** The host pair is the first required capability, and the plan promises that the person knows "how soon to expect a human reply". However, nothing defines what `escalation_url: "/contact"` does or how a message reaches the human host. C2 and Golden Journey step 1 check only that the route is declared and rendered. An app could pass both while its contact form goes nowhere, which breaks a stated promise to a person. The manifest is public, so the host's address cannot live in it.
- **Change:**

```diff
@@ section 1.1 @@
-| Host pair and human handoff | The person always knows which human and AI host the app, how to reach the human, and how soon to expect a human reply. | Named minds remain accountable. | `SOMA/SOMA-APP-STANDARD.md`; `soma-app-template/src/lib/hostPair.ts`. | Declare both hosts, their roles, one escalation route, and the human host's expected response time in `soma-app.json`. Expose them in the UI and discovery document. |
+| Host pair and human handoff | The person always knows which human and AI host the app, how to reach the human, and how soon to expect a human reply. | Named minds remain accountable. | `SOMA/SOMA-APP-STANDARD.md`; `soma-app-template/src/lib/hostPair.ts`. | Declare both hosts, their roles, one escalation route, and the human host's expected response time in `soma-app.json`. Expose them in the UI and discovery document. The kit's `POST /api/soma/v1/contact` writes a `feedback_items` row with `kind = 'contact'` and a `soma.estate_inbox` event in one broker transaction. The broker then notifies the human host at `soma.app_hosts.notify_address`, a private column that `register` sets and that no public read returns. The person sees that the message was received, the stated response time, and later the host's reply in the app. The AI host offers this route whenever Ask returns `grounded: false`. |
```

```diff
@@ section 3.3, gate table @@
-| C2 | Both hosts, their roles, human escalation, and the human host's expected response time are declared and rendered. |
+| C2 | Both hosts, their roles, human escalation, and the human host's expected response time are declared and rendered. A contact message sent through the escalation route creates the app record and estate event and produces a notification to the registered address. In staging, that address is a steward-controlled test mailbox. |
```

```diff
@@ section 5, Golden Journey @@
-1. An unknown visitor sees both named hosts, the human handoff, and the expected human response time.
+1. An unknown visitor sees both named hosts, the human handoff, and the expected human response time. A message sent through the handoff reaches the human host's registered channel, and the visitor sees that it was received.
```

```diff
@@ section 7, assumptions table, new row @@
+| The named human host will keep the stated response time. | Ask Eric to commit to the response time in the V'Eric manifest. Then send him three contact messages over one week, unannounced, through the channel the kit would use. | Eric agrees to the wording, and all three replies arrive within the stated time. Otherwise the stated time changes before launch. |
```

### R14: The two-week slice must run C16 and C17, which its own "must not cut" list depends on

- **Why:** Section 8.2 says the release must not cut "Idempotency, receipts, and tested undo", and section 8.1 says to "test broker failure in the live journey". Yet the slice's conformance list skips C16 (every action ends in a stated outcome and produces a receipt) and C17 (declared dependency failures expose the fallback). Golden Journey step 20 depends on C17. C18 (legal content) and C19 (credits) are the only checks that genuinely wait for later work.
- **Change:**

```diff
@@ section 8.2, must include @@
-- Conformance for C1–C15, C19a, and C20–C23, including adversarial isolation, CSRF, revocation, prompt-injection, and failure-injection cases.
+- Conformance for C1–C17 (including C12a and C12b), C19a, and C20–C24, including adversarial isolation, CSRF, revocation, prompt-injection, broker-outage, and failure-injection cases. Only C18 and C19 wait for later work.
```

### R15: Write receipts for AI reads, not for every read a person makes

- **Why:** "Every outcome writes a receipt" applies to `observe` actions too. So every read a person makes in the UI would cost a broker write to `action_receipts` and to `soma.receipt_index`. That is write amplification with no reader, and it buries the acts a person needs to review in their receipt view. The audit value of an `observe` receipt comes from AI reads: the person wants to see what an AI looked at on their behalf.
- **Change:**

```diff
@@ section 2.6 @@
-Every outcome writes a receipt, including refusal and failure.
+Every outcome of an `effect` action writes a receipt, including refusal and failure. An `observe` action writes a receipt only when an AI host or a paired outside AI runs it, so the person can audit what an AI read on their behalf. A person's own reads in the UI write none. Every refused request writes a receipt, whatever its kind.
```

### R16: Remove the duplicated undo requirement from C4

- **Why:** C4 and C7 both require every `reversible` action to implement `undo`, and only C7 proves it with a round trip. Having two checks for one property gives two failure messages for one defect and lets the two definitions drift apart.
- **Change:**

```diff
@@ section 3.3, gate table @@
-| C4 | Every action has schemas, scopes, kind, effects, and, for effect actions, risk. Every `reversible` action implements `undo`. |
+| C4 | Every action has schemas, scopes, kind, effects, and, for effect actions, risk. |
```
