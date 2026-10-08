# SOMA App Kit v1 — the living plan

_Paths are relative to `~/Projects/` unless stated otherwise._

## 0. Decisions

| Question | Decision | Reason |
|---|---|---|
| `soma.app.yaml`, `soma.app.json`, or `soma.config.ts` | Use JSON in `soma-app.json`, the file name the scaffolder already writes into generated apps. | JSON is inert, portable, and does not require executing app code. The v1 document is a new shape; the v0 spec (`soma_app` root) converts to it through `soma-scaffold migrate-spec`. |
| Existing `soma_profiles`, a new relational model, or DIDs | Add a relational `soma` schema backed by Supabase Auth. | `soma_profiles` is too small for consent, pairwise identity, answers, and delegation. DIDs do not solve a current v1 problem. |
| Shared person IDs or pairwise app IDs | Keep one private `person_id`, but expose a different `app_person_id` to each app. | SOMA can recognize one person without giving every app a correlatable global identifier. |
| Direct PostgREST or a same-origin data boundary | Use same-origin app Functions backed by narrow broker RPCs in v1. | A generic Supabase `authenticated` JWT inherits legacy grants in the shared project. Pairwise identity alone is not tenant isolation. |
| Silent iframe recognition or explicit redirect | Use a top-level authorization-code flow with PKCE. | It works across domains, makes consent visible, and avoids browser third-party-storage behavior. |
| When recognition may be silent | Only an app with an existing valid membership and session may resume silently. | A first visit to another app discloses identity and therefore requires a visible offer. |
| What the browser remembers before sign-in | Store only an origin-scoped boolean “known device” marker. | A browser marker should not contain a name, email, person ID, or access token. `@soma/signin` already stores the literal `1`; a random identifier would add tracking value without improving recognition. |
| Which invitation implementation survives | Keep `@soma/tickets` and merge onboarding features into it. | It already has live single-use tokens and shared RPCs. Renaming it would add migration work without adding capability. |
| Which changelog survives | Keep both experiences over one `app_changes` ledger. | Legends’ approval queue and PlayMaker’s “What’s new” view serve different users at different stages of the same change. |
| Unscoped trust or least privilege for outside AIs | Require scopes, expiry, and a risk ceiling. | A person may deliberately grant `*`, but omitted scope must never mean unlimited authority. |
| Pair an AI once globally or once per app | Register the AI partner once, but grant authority per app by default. | Identity may travel across SOMA. Authority should not silently travel with it. |
| Central feedback queue or per-app queues | Keep the per-app queue canonical. The broker writes the app record and a minimal `soma.estate_inbox` event in one database transaction. | Apps retain their domain context. Per-app schemas and the `soma` schema live in the same database, so one transaction makes every item durable. `soma.estate_inbox` is then a transactional outbox: a separate leased importer writes the board item and acknowledges delivery. |
| CDN or vendoring for static-site plumbing | Vendor static adapters and runtime files. | The brief makes the Guide the CDN exception. Identity, consent, feedback, and action enforcement must remain pinned with the app. |
| Always-latest Guide or pinned Guide | Publish immutable semantic versions with Subresource Integrity hashes. | One unpinned Guide release can otherwise break every consumer simultaneously. |
| OpenAPI, MCP, or both in v1 | Ship vendor-neutral HTTP and OpenAPI in v1. Add generated MCP as a later adapter. | OpenAPI is sufficient for the first outside-AI test and avoids making MCP availability a prerequisite. |
| Migrate Legends or PlayMaker first | Build the shared foundation, then migrate a Legends preview before changing PlayMaker behavior. | Legends exercises the static path without disturbing Eric’s active writing workflow. |
| Fifteen minutes, two hours, or four hours for a new app | Require a local build in 15 minutes, a live branch deploy on the registered `preview--` alias in 30 minutes, and the complete Golden Journey in four working hours. | These measure three different outcomes and preserve the useful challenge in each source plan. |
| Shared or per-app billing | Keep metering in the core and billing as an optional per-app recipe. | No current evidence supports one SOMA-wide commercial model. |
| Required tours or deferred tours | Require one Show workflow, not a produced film. | Show must work on day one, but video production is not plumbing. |
| Legal pages at prototype time | Warn at prototype and fail at public MVP. | Templates can create routes, but only the operator can ratify legal promises. |
| AI hosts as auth users or app attributes | Give every host an actor record. Give an AI host credentials only if it actually acts independently. | Credit and identity do not require pretending every named AI is a login account. |

## 1. The capability list

This section says what each capability does and becomes. Section 2 says how it works, section 3 what an app declares, and Appendix A the mechanics a builder needs for one milestone.

### 1.1 Required capabilities

| Capability | What it does for the person | SOMA principle | What exists today | Target design |
|---|---|---|---|---|
| Host pair and human handoff | The person always knows which human and AI host the app, how to reach the human, and how soon to expect a human reply. | Named minds remain accountable. | `SOMA/SOMA-APP-STANDARD.md`; `soma-app-template/src/lib/hostPair.ts`. | Declare both hosts, their roles, one escalation route, and the human host's expected response time in `soma-app.json` (section 3.1). Render them in the UI and the discovery document. The kit's contact route (section 2.7) delivers the message to the human host and shows the person the receipt, the stated response time, and later the reply. The AI host offers this route whenever Ask returns `grounded: false`. |
| Be known | A returning person is recognized without being exposed to an unfamiliar app first. | One identity, consumed rather than forked. | `soma-platform/packages/soma-signin`; PlayMaker’s known-device flow; `soma-platform/docs/SOMA-IDENTITY-STATES.md`. | The shared identity broker, pairwise app IDs, and an origin-scoped boolean device marker (section 2.2). On first entry to another app the person sees a neutral "Continue with SOMA" offer, and the identity origin then recognizes them in one tap. |
| Learn once, answer once, resume | An app does not repeat concepts or questions already settled and returns the person to useful context. | Respect accumulated understanding. | Guide `_recordSeen`; `soma-app-template/supabase/migrations/0005_last_location.sql`; Legends’ `guide_seen`. | Store versioned concept state and explicitly shared answers centrally (section 2.5). Keep the last app location in the app's own schema, because it is app-internal and changes on every navigation. |
| Invitations | A single-use or reusable invitation admits whoever holds the link, without creating another identity system. | Relationships precede accounts. | `packages/soma-tickets`; `packages/soma-onboard`; three standards folders; PlayMaker’s flow. | Make `@soma/tickets` canonical (section 1.2). Add single-use and reusable presentation, QR, channels, abuse controls, and membership creation. An invitee name is a salutation the inviter typed, never proof of who redeemed the link. |
| Ask, Show, and Do | The person can ask for an explanation, see the relevant controls, or ask the host to act. | Alignment joins understanding with agency. | `packages/soma-guide`; its independent `inferenceUrl` and optional ElevenLabs voice paths; PlayMaker `src/agent-portal/`; Legends Guide actions. | One typed action registry serves the UI, the Guide, and outside AIs (section 2.6). Controls bind with `data-soma-action="<id>"`. In-app Ask is a provider-neutral server endpoint grounded in declared knowledge (section 2.6a). Voice is an optional adapter. An outside AI can read `/llms.txt` and `/knowledge/*.md` without SOMA inference. |
| Consent and action receipts | The person sees expected effects before consequential acts and receives a durable result afterward. | Authority must be visible, bounded, and reviewable. | Guide risk flag; PlayMaker audit and pairing code; template delegation migrations. | The server enforces risk, scope, expiry, confirmation, idempotency, and undo, and writes receipts (section 2.6). |
| AI visitor door | A person’s own AI can discover, understand, pair with, and use the app without vendor-specific instructions. | Outside AIs are first-class visitors. | PlayMaker `netlify/functions/agent-v1.ts`, `public/llms.txt`, pairing functions, and Agent Portal. | Discovery, OpenAPI, device-code pairing, and per-app grants (section 2.7). |
| Feedback and improvement loop | A person can report a problem or request a change and later see its disposition and demonstration. | The user participates in the outer RSI loop. | `packages/soma-feedback`; PlayMaker’s feedback queue and build requests. | Make the package the widget’s source of truth. Keep full reports per app. The broker forwards only a minimal estate event and returns disposition and demonstration updates to the app (section 2.4). |
| Changes and review | Stewards approve changes, while participants see only relevant shipped changes they have not seen. | Change remains legible to every participant. | Legends admin changelog; PlayMaker `Changelog` and `WhatsNewList`. | Use one per-app `app_changes` ledger with admin and participant views. |
| Honest operation and recovery | The person sees started, succeeded, failed, retryable, and reversible states. | No silent success and no concealed failure. | PlayMaker error/crash code; template toast and reload helpers. | Standardize action status and error capture. Require a declared fallback for unavailable shared dependencies. |
| Data control and context export | The person can inspect, export, revoke, and erase the information SOMA holds about them. | The person remains the principal of their data. | Consent and erasure specifications exist, but implementation is incomplete. | Provide “What do you know?”, Markdown/JSON export, per-app forget, global erasure request, and AI-grant revocation (section 2.5a). |
| Where your words go | The person can see which outside providers receive their text, audio, or files and why. | Honest human–AI relationships require visible data flow. | Privacy material is fragmented; legal pages are mostly missing. | Declare data flows in the manifest and render them in `/privacy`, `/where-your-words-go`, and machine-readable discovery. |
| Credits and provenance | The person can see which human or AI created or changed an artifact. | Every mind receives credit and remains accountable. | `SOMA/standards/SIGNATURES-AND-BYLINES.md`; `SOMA/standards/SOMA-STD-credits.md`. | Store actor, principal, app, action, model or substrate when known, artifact, and time. Use server-signed receipts in v1. |
| Usage and optional billing | The person sees limits and prices before consuming a metered resource. | Cost belongs to the principal who benefits. | `packages/soma-meter`; PlayMaker `UsageChip.tsx`; billing templates. | Keep metering in the core. Add a generic usage component. Enable billing only through an app-specific declaration. |
| Proof and drift beacon | A person or steward can verify which kit version the app runs and when its live journey last passed. | A claim of done is a demonstration. | `soma-ship-check.py`; scaffolder stand-up check. | Publish release SHA, contract hash (section 3.1), kit lock hash, and last live conformance result through `/api/soma/v1/status` (section 2.9). |

### 1.2 Inventory disposition

| Inventory item | Decision |
|---|---|
| `soma-platform/packages/soma-signin` | Keep as canonical. Add React and static adapters. Add a broker mode that signs in only through the identity origin (section 2.2); it is the only mode a pairwise app may use. The current direct Supabase Auth mode remains for the two legacy-global apps (section 2.3a). |
| `soma-platform/packages/auth` | Deprecate after static consumers migrate. |
| `legends-membership-site/js/soma-auth.js` and `legends-connect/js/soma-auth.js` | Remove only after the vendored static adapter passes the old journeys. |
| `soma-platform/packages/soma-tickets` | Keep and expand into the sole invitation API, with two storage generations. PlayMaker's live tickets stay in `public.tickets` until PlayMaker moves to v2. Broker-era (v2) tickets live in `soma.tickets` and `soma.ticket_redemptions`, because `public.tickets` cannot hold them safely: its required `inviter_id` references `auth.users`, its RLS is built on `auth.uid()`, and its lookup and use functions run for `anon` (`packages/soma-tickets/sql/schema.sql`). Four broker-only functions in the `soma` schema store only a keyed token hash, take the app from the installation credential, and create or upgrade the membership on redemption (section 2.2, admission). A `single_use` ticket admits its first holder once. A `reusable` ticket admits many people until it expires or reaches `max_redemptions`. Neither kind proves that its holder is the person the inviter named, so the app never greets a redeemer by the invitee name as if SOMA knew it. Restrict the existing `ticket_create`, `ticket_lookup`, and `ticket_use` to `p_app = 'playmaker'` until PlayMaker moves to v2, then retire them, because today they admit any PlayMaker studio member whatever `p_app` says, run for `anon` on any app, and store the token in plaintext. Function signatures: Appendix A, M5. |
| `soma-platform/packages/soma-meter` | Keep the gate and pricing logic. Add a broker-backed store with a generic billing subject. A pairwise app bills the person's `app_person_id`. Anonymous public Ask bills the app's operator subject, whose entitlement carries the daily cost budget (section 2.7a). PlayMaker keeps its current store and `public` tables until M11. Add a generic client usage chip. Detail: Appendix A, M5. |
| `soma-platform/packages/soma-feedback` | Keep. Promote `packages/soma-feedback/widget/` from a documented copy to the canonical widget source, then replace the other copies. |
| `soma-platform/packages/soma-guide` | Keep on the CDN as immutable versioned releases with SRI hashes (section 2.8). Keep text Ask independent from voice. Keep the root path as the moving channel for non-kit consumers. |
| `soma-platform/packages/soma-assist-core` | Keep the chat shell as an internal Guide dependency. Do not create a second public chat contract. Its feedback and heartbeat clients stay only for the Adrian and Yeshie browser extensions. A SOMA app never loads them: app feedback goes through `@soma/feedback`, and app health goes through `/api/soma/v1/status`. |
| `soma-platform/packages/soma-onboard` | Merge QR, channel, privacy, and abuse behavior into `@soma/tickets`; stop generating its member tables. |
| `soma-platform/packages/soma-scaffolder` | Keep as the only supported generator and updater. |
| Legends admin changelog | Keep as the steward view of `app_changes`. |
| PlayMaker “What’s new” | Keep as the participant view of `app_changes`. |
| Billing templates | Keep as an optional recipe. Do not make Stripe part of core stand-up. |
| Live in-place editing | Keep as an optional v1.1 recipe with take, drop, and revise review. |
| Admin roles and allowlists | Replace with app membership roles. Drop the `ADMIN_EMAILS` fallback (`soma-app-template/netlify/functions/lib/appAdmin.ts`) from generated apps, because a pairwise app may not receive email addresses to compare. The first owner comes from a one-time claim instead (section 2.2). PlayMaker keeps its own copy until M11. |
| SMTP sending | Keep as an optional adapter for registered hosts and signed-in people. v1 sends no server-side mail to invitees or anonymous visitors; invitation client handoffs and contact thread links remain the durable transport (section 2.3b). |
| Agent pairing and delegation | Keep as core. Separate global agent registration from per-app grants. |
| Deployment checks | Wrap inside `@soma/conformance`. Keep `SOMA/tools/ship/soma-ship-check.py` as a compatibility check. |
| Feedback queue and build requests | Extract their schema and lifecycle into the kit. Keep records logically per app. |
| Error reporting and crash alarm | Extract into `@soma/errors`. Do not revive the dead shared service. New crash fingerprints reach the steward as minimal `soma.estate_inbox` events (section 2.4). |
| Agent API, Agent Portal, and `llms.txt` | Merge into `@soma/actions` and the AI visitor door. |
| AI host chat | Keep app-specific: persona, inference adapter, and conversation storage stay in the app, and v1 defines no shared host-chat interface. A host chat that offers Show or Do uses the `offers` shape from section 2.6a and the in-app AI host authority rules from section 2.6. Its provider appears in `data_flows`, and any stored conversation appears in `data_stores`. |
| Themes | Keep app-specific. Generate only common design-token plumbing. |
| Reload on deploy | Keep in the React template and static adapter. Package it only after another independent consumer needs an API. |
| Front-door analytics | Keep as an optional, consent-aware adapter. |
| Share images | Keep as an optional build recipe. |
| Community chat and video | Keep in Legends. Exclude Rooms and video from kit v1. |
| Toast, exclusive voice, resume, and tooltip | Keep in the template. Keep resume state in the app's own schema; do not create a UI package prematurely. |
| Five invitation variants | Resolve to `@soma/tickets`. Archive the other standards only after migration links and compatibility tests exist. |
| Legal pages | Add required routes. Prototype may warn on incomplete ratified copy; public MVP must fail. |
| Four overlapping app catalogs | Replace their normative role with this spec, the JSON Schema, and generated conformance output. Keep them as explanatory history where useful. |

### 1.3 Canon disposition

| # | Canon idea | Decision |
|---|---|---|
| 1 | SOMA ID fast path | Core. Use the identity broker and pairwise app IDs. |
| 2 | Two-tier profile and what was seen | Core. Normalize it into versioned concept state. |
| 3 | Identity ladder and self-knowledge | Core. Provide describe, switch, export, and forget operations. |
| 4 | Known device and invitations | Core. Merge into identity and tickets. |
| 5 | Consent, visibility, and revocation | Core behavior. Defer DIDs and cryptographic erasure receipts. |
| 6 | Resume where left off | Core for apps with persistent work. |
| 7 | Introduce once | Merge into concept state. |
| 8 | Traveling personal AI | Serve the person’s existing AI first. Do not build a SOMA-only consigliere in v1. |
| 9 | Cross-app memory | Limit v1 to identity, declared preferences, concept state, and explicitly shared answers. |
| 10 | Tell/Show/Do | Core. |
| 11 | Agent Portal | Extract the registry and remote contract. Do not add unrelated PlayMaker commands. |
| 12 | Conversational front door | Supported presentation choice, not a universal navigation rule. |
| 13 | AI door | Core. |
| 14 | Tours | Require one Show workflow. Produced films remain optional. |
| 15 | Review with Bill | Generalize to “review with the AI host” over unseen changes. |
| 16 | Host pair and kin-bond | Require the host pair and escalation. Defer kin-bond machinery. |
| 17 | RSI loop | Require feedback, disposition, and closure evidence. Defer market-persona automation. |
| 18 | Intake as change membrane | Merge into feedback and changes. |
| 19 | In-place editing | Optional v1.1 capability. |
| 20 | Partner AI acting on behalf | Core with app-scoped grants, expiry, risk ceilings, and receipts. |
| 21 | Signed provenance | Use server-signed receipts. Defer client-held signing keys. |
| 22 | Every mind gets credit | Core. |
| 23 | Accord and “We’re aligned” | Provide an integration link. Do not embed another Accord implementation. |
| 24 | CoEvolution continuity | Exclude from the kit. |
| 25 | Elicitation front-of-funnel | Optional workflow. Store only answers the person explicitly allows to travel. |
| 26 | Community presence | Optional module outside v1 core. |
| 27 | BYOK and KeyDrop | Defer until custody rules are ratified and one app needs them. |
| 28 | Honest UX | Core. |
| 29 | Preferences, acting authority, and voice consent | Acting authority is core. Preferences are declared. Voice consent is required only for voice-enabled apps. |
| 30 | Action lineage | Core through receipts and provenance. |

## 2. The architecture

### 2.1 System shape

- The canonical product contract is `soma-app.json` (section 3.1).
- The scaffolder compiles the contract into vendored runtime code, discovery files, legal-page shells, database migrations, tests, and `soma-kit.lock.json`.
- The Guide loads from an immutable CDN URL.
- The app UI, the Guide, and outside AIs use one action registry.
- The identity broker owns cross-app recognition and consent.
- The shared Supabase project stores authentication and cross-app records.
- Each app owns its domain records, detailed feedback, changes, errors, and unpublished content.
- No new app receives a service-role credential that can read the entire shared project. M11 removes the legacy credentials from PlayMaker and Legends (section 2.3a).

### 2.2 Identity flow

1. The app reads only its own origin-scoped boolean marker, `soma.known.device`, which `@soma/signin` already writes as the literal `1` (`soma-platform/packages/soma-signin/src/somaKnownDevice.js`; why a boolean: section 0). The marker means only “this browser has signed in to this app before.”
2. An app with an existing valid membership and session resumes silently. An app with the marker but no session shows “Come back in.”
3. Every other visitor sees the same neutral “Continue with SOMA” control. An unvisited app cannot tell whether a visitor is known to SOMA. Only the identity origin, which keeps its own first-party session, can recognize the person.
4. Selecting it opens `https://id.<SOMA_APEX>/authorize` as a top-level navigation.
5. The request includes `app_id`, an allowlisted redirect URI, a PKCE challenge, a nonce, and an optional opaque pending-invitation handle. It never includes the invitation token itself.
6. The identity origin authenticates the person.
7. The identity origin shows the person’s name, the destination app, and the fields that will be disclosed. When the app declares `soma:` concepts, the list includes “SOMA basics you have already seen.”
8. Acceptance creates a pending authorization bound to the exact disclosure preview the person saw. It does not yet create a durable membership.
9. The origin returns a short-lived, single-use authorization code, which is stored only as a keyed hash.
10. The app's Netlify Function, not the browser, exchanges the code. It presents the PKCE verifier and the app's installation credential. In one transaction the broker consumes the code, rechecks the pending authorization, creates or updates membership and consent, and creates the browser session. An abandoned or failed exchange leaves no membership.
11. The function sets one broker-issued session handle in a `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The broker stores only its keyed hash and checks it online on every call against the session's idle and absolute expiry, so a browser holds no refresh credential. The function does not expose a Supabase Data API JWT to browser JavaScript. The browser obtains the pairwise identity and consented fields through the same-origin `/api/soma/v1/me` route.
12. The app may now greet the person by name and say that the name came from the person's SOMA identity. It never names another SOMA app as the source.

The redirect URI must exactly match a registered origin. Cookie-authenticated unsafe methods require both an exact allowed `Origin` and a CSRF token bound to the session. Bearer-token agent calls do not use cookies. The transaction, callback, and cookie rules a builder needs are in Appendix A, M3.

Raw bearer secrets (access tokens, refresh handles, invitation tokens, contact-thread tokens, and device codes) never appear in an HTTP request URL. An invitation or contact-thread link therefore carries its secret in the URL fragment, which the browser does not send; a minimal same-origin landing page exchanges it for a short-lived, link-specific `__Host-` `HttpOnly` cookie and clears the fragment before anything else loads (Appendix A, M5). Each link gets its own cookie, so two links opened at once cannot overwrite each other. PlayMaker's current `/?t=<token>` links remain legacy until PlayMaker moves to v2 tickets. Authorization codes and approval identifiers may appear in a callback or approval URL, because neither carries authority by itself and both expire quickly. All of these values are redacted from logs, analytics, error reports, referrers, and evidence screenshots.

**Admission.** The membership that step 10 creates follows the manifest's `identity.admission`:

- `open`: the person becomes a `member`.
- `invitation`: the person becomes a `member` only when the authorization carries a ticket that `soma.ticket_redeem_v2` redeems in the same transaction (section 1.2). Without a ticket, the person receives a `visitor` membership. A visitor may run `visitor` actions and use the contact route, and nothing else.
- `request`: the person receives a `visitor` membership and an access request. An app `owner` or `admin` approves or refuses the request through the kit action `soma.access.decide` (section 2.6).

Membership roles are `visitor`, `member`, `editor`, `owner`, and `admin`. Role changes use the kit actions `soma.membership.raise-role` and `soma.membership.lower-role` (section 2.6). Raising a role to `owner` or `admin` is `consequential` and requires an existing `owner`. Lowering a role is `reversible`. The first owner comes from a single-use claim that `kit-steward` issues for the app and environment and the intended owner accepts while signed in on the identity origin; the broker creates the owner membership and consumes the claim in one transaction. The app never sees an email address, and no bootstrap path remains afterwards (Appendix A, M3).

**Pairwise identity.** The app must not receive a global `person_id`. Pairwise identity covers every identifier an app can observe, not only the person's own ID, because one shared value is enough for two apps to join their records:

- A person acting in an app is recorded in that app's tables by `app_person_id`, never by `soma.actors.actor_id`.
- An outside AI appears to each app as `app_agent_id`, a random handle per agent and app, stored in `soma.agent_app_handles`. Its tokens carry a per-app `grant_ref`, never the global `agent_id` or `grant_id` (section 2.7). A grant the person made for `app_id='*'` therefore looks different in each app.
- Responses from `/api/soma/v1/me` and `/api/soma/v1/me/*` never include another app's `source_app_id`, consent rows, memberships, or receipts. Concept state reports only the state and the concept version. A shared answer reports only its value, schema version, and expiry.
- `email` is a correlating field, because the same address identifies the person in every app and outside SOMA. An app may list `email` in `identity.profile_fields` only together with an `email_reason`. The consent screen then says that sharing the address lets the app recognize the person outside SOMA. An app that only needs to send the person a message uses the broker's person notification (section 2.3b) and does not request `email`.

### 2.3 Authentication boundary for apps

Neither shared nor per-app database access trusts a browser-supplied `app_id`, `person_id`, `app_person_id`, role, or grant.

Each deployed app receives two overlapping, independently revocable installation credentials, so one can rotate without downtime. They are stored only in Netlify Functions and authenticate the app to the broker. They are not database credentials.

The browser calls same-origin app Functions. A Function makes one broker call per database operation, `POST /broker/v1/invoke`. The call carries the installation credential, the contract hash compiled into that server release, the person's session handle or the agent's access token, the registered RPC name, and its arguments. Browser input cannot select the contract hash. The broker validates the installation, the contract, the principal, and the policy, and then runs the RPC inside one database transaction.

The broker derives `app_id` from the installation credential and the principal from the validated session. Caller-supplied identifiers may narrow a request but never establish authority.

The broker may invoke, through its platform-owned wrapper (section 2.3b), only RPCs registered for that app and one of its accepted contract hashes (section 2.4a). App RPCs live in an unexposed `app_<app_id>_api` schema, have `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`, set a safe `search_path`, and return explicit columns.

Per-app tables and `soma` tables are not exposed to browser PostgREST in v1. No pairwise app token carries the generic Supabase `authenticated` database role.

The ordinary data path uses a least-privilege broker database role. Supabase Auth administration that genuinely requires the project secret runs only through the path in section 2.3b; ordinary app data calls never receive or use that secret.

Browser code never receives an installation credential, database credential, Supabase secret key, or shared-project JWT-signing key.

**Broker outage.** Every private read and effect passes through the broker, so a broker outage stops private reads and effects for every pairwise app. They fail closed. Public pages keep working. Ask degrades to the provider-free knowledge search in section 2.6a. The sign-in control states the outage and shows the human host's contact route. A pairwise app has no local sign-in fallback, because signing in directly to Supabase Auth inside the app would give it a global `auth.uid()` and skip the consent screen. C17 and the degraded-mode journey test this.

**Cost of the boundary.** Each private request pays two Function invocations and a pooled database round trip. To keep that small, the broker site and each app's Functions run in the Netlify Functions region closest to the shared database, where the Netlify plan allows choosing one, and `GET /api/soma/v1/me` returns everything an ordinary page load needs in one broker call (section 2.7). Live conformance reports latency without failing on it until a budget is ratified (Appendix A, M1).

This boundary must replace existing app-held service-role access incrementally, because the current shared `public` schema contains legacy role-wide policies and callable functions. Pairwise IDs do not make those legacy grants safe.

### 2.3a Apps that predate the broker

PlayMaker and Legends sign people in directly against Supabase Auth in the shared project. PlayMaker's tables key on `auth.users.id`, so PlayMaker already holds a global identifier for every person. Rekeying PlayMaker to pairwise IDs would change its domain model, which section 4.2 forbids.

Therefore the manifest gains `identity.subject`, with two values:

- `"pairwise"`: the app receives only `app_person_id`. Every new app must declare this, and conformance fails a new app that declares anything else.
- `"legacy-global"`: `app_person_id` equals `auth_user_id`. Only PlayMaker and Legends may declare it, and `soma.apps` records which apps hold it.

A legacy-global app still receives cross-app data (shared answers, `soma:` concept state) only after consent, exactly like a pairwise app.

**How a legacy-global app reaches the broker.** A legacy app's people hold Supabase Auth sessions, not broker sessions. PlayMaker's browser code reads and writes through `supabase-js` with that session (`playmaker/src/lib/supabase.ts`). So for a legacy-global app only, the app's Function presents the person's Supabase access token in the place where a pairwise app presents a broker session handle. The broker validates the token online with Supabase Auth on each call, not from its claims alone, and uses its `sub` as `auth_user_id`. In a legacy-global app, an outside AI is identified by the existing `auth.users` row that PlayMaker created for that `is_ai` participant, so `app_agent_id` equals that ID. The reason is the same as for `app_person_id = auth_user_id`: PlayMaker's tables already key on it.

**Recognition for legacy-app people.** A legacy-global app signs people in on its own origin, so its session does not create a session on the identity origin. The identity origin also cannot hand a Supabase session back to a legacy app, because minting one needs the Auth-administration secret online, which section 2.3b forbids. So v1 adds no identity-origin sign-in path to a legacy app, and the legacy app's own sign-in does not change. A PlayMaker writer who opens a new SOMA app for the first time signs in once on the identity origin with the same email. That sign-in resolves to the same `auth.users` row and the same `soma.people` row, so the writer is known from then on, and first visits to further apps take one tap. The status page and evidence never claim one-tap recognition for people who have only ever signed in to a legacy app.

**Isolation before M11.** PlayMaker's Netlify Functions hold the shared project's secret key (`playmaker/netlify/functions/lib/agentIngress.ts`, `lib/metering.ts`) and mint agent sessions with the legacy JWT secret (`lib/agentJwt.ts`). `soma-app-template` does the same (`netlify/functions/lib/supabaseAdmin.ts`, `lib/agentJwt.ts`, `.env.example`), so every app the scaffolder generates today inherits both secrets; M3 removes them from the generator. Until M11 completes, the isolation in section 2.3 holds for new apps only, and a compromised PlayMaker function can still read every shared table. The status page and evidence bundle must say so rather than claim estate-wide isolation.

- Interim control in week one: give each app that still holds a secret key its own `sb_secret_…` key. The shared project already uses the new key format, so one app's key can then be revoked without rotating every other consumer.
- Ordering constraint: the shared project must not revoke the legacy JWT secret or rotate to asymmetric signing keys until PlayMaker's agent seam has moved to broker-issued agent tokens (M8). Otherwise every paired PlayMaker agent stops working at once.
- The path without the legacy secret: for every broker call to a legacy-global app, the platform wrapper sets transaction-local `request.jwt.claims`, with `sub` set to the acting `auth.users` row and `role` set to `authenticated`, before calling an RPC in `app_playmaker_api`. M8 moves PlayMaker's agent operations onto those broker `invoke` calls, so its existing `auth.uid()` policies and `pm_acts_for` continue to apply after nothing outside Supabase Auth can mint a PostgREST token. Trade-off: the legacy app's own RPC code can forge this compatibility setting. It isolates apps from each other, but it does not protect one legacy app's users from that app's own code; pairwise apps continue to use only the unforgeable `soma_ctx` path in section 2.3b.

### 2.3b Where the broker runs

The identity origin and broker are one Netlify site, `soma-id`, built from `soma-platform/apps/soma-id/` with its own `netlify.toml`. The existing root `netlify.toml`, which publishes `dist/` for the Guide CDN, is left unchanged. A second site, `soma-id-staging`, is built from the same commit against the staging Supabase project.

The broker reaches Postgres as `soma_broker`, a role with no `BYPASSRLS` and no direct privileges on app tables. It calls app RPCs only through one platform-owned invocation wrapper, which installs the authenticated app, person, actor, and grant as transaction-local request context and clears it before returning.

Each app has two no-login roles. `app_<app_id>_owner` owns the app's tables and is used only by the migration runner. `app_<app_id>_runtime` owns the app's API functions, owns no tables, and has no DDL privilege. A table owner is exempt from RLS unless the table forces it, so this split is what keeps runtime functions subject to RLS.

RLS policies obtain identity only through platform-owned, read-only accessor functions such as `soma_ctx.app_person_id()`, backed by a platform-owned table that neither app role can touch. Identity is not a custom PostgreSQL setting, because any role can call `set_config` and could otherwise impersonate another person or app.

The Mac-side estate importer logs in as `soma_estate`, a role that can only lease and acknowledge `soma.estate_inbox` rows and write `soma.estate_dispositions`. Its password lives in the Mac keychain and in no Netlify site.

The Supabase secret key used for Auth administration is deployed to no HTTP-addressable site in v1. A separate Function on the broker site would share its environment, and a separate public site would need a private invocation mechanism that v1 has not designed. Auth-administration work, such as deleting the Auth user during global erasure, therefore runs through a steward-operated CLI or an outbound-only scheduled worker with no request handler. If a later release needs an online admin service, its private invocation and authentication must be designed and threat-tested before the secret is deployed.

The mail-provider credential follows the same boundary, so it is not deployed to `soma-id`. Notifications run from a separate site, `soma-notify` (with `soma-notify-staging` against the staging project), which has only scheduled Functions and no public route. Its database role can only claim and settle notification rows, so a compromise of `soma-notify` cannot read people, app schemas, receipts, or answers, and a compromise of `soma-id` cannot send mail as SOMA. Role, functions, and secrets: Appendix A, M3.

The identity origin is hardened as a credential page: server-side Auth session cookies, no third-party or app-supplied script, and strict caching, framing, referrer, and form policies. Only the identity origin's callback URLs are entered in Supabase Auth's redirect allowlist; app origins are registered in `soma.apps` and checked by the broker. A new app therefore adds no entry to the shared project's allowlist, which was at 1,998 of 2,048 bytes on 2026-10-05 (`SOMA/tools/auth/README.md`).

**Notifications.** An app sends a person a message through the broker RPC `notify_person(app_person_id, template_id, params)`. Templates are declared in the manifest's `notifications` list, belong to the privileged projection (section 2.4a), and accept only declared fields. The broker inserts the queue row but never resolves or receives the destination address. The notification worker on `soma-notify` resolves the verified address only while claiming that row, so neither the app nor the broker's request handlers ever receive it. Each app has a per-person daily notification cap, and the person can mute an app's notifications from `/api/soma/v1/me`. The host contact notice (section 2.7) and the AI-partner announcement (section 2.7) use the same queue.

The worker sends only to a registered host or to a signed-in person's verified address. v1 sends no mail to an invitee or to an anonymous visitor. An inviter delivers an invitation link through QR, copy, a native share sheet, or a private client-side handoff such as `mailto:` or SMS; any address used for that handoff stays in the inviter's client and is not sent to SOMA. An anonymous visitor keeps the contact thread link.

Broker roles, privileges, secrets, timeouts, and identity-origin headers: Appendix A, M3.

### 2.4 Data model

Platform migrations live under `soma-platform/sql/soma/`. New app migrations live under the generated app’s `supabase/migrations/`. PlayMaker’s current domain tables remain in `public` during migration. Existing `public.tickets`, `ticket_requests`, `usage_events`, and entitlement tables remain in place as legacy PlayMaker storage until their package owners can migrate them without breaking consumers. New apps never write to those legacy tables.

#### Shared schema

No `soma` table is exposed to browser PostgREST (section 2.3). “Public reads” below means the broker's unauthenticated discovery calls.

| Table | Essential fields | Ownership and access |
|---|---|---|
| `soma.people` | `person_id`, `auth_user_id`, `display_name`, `locale`, `timezone`, `is_test`, `created_at`, `erased_at` | The person owns the row. Apps never receive `person_id`. |
| `soma.actors` | `actor_id`, `kind`, `name`, `substrate`, `person_id`, `created_at` | Represents humans, AI hosts, and external AIs for credit and lineage. |
| `soma.apps` | `app_id`, `name`, `origins`, `identity_subject`, `admission`, `kit_version`, `status` | Platform-managed. Public reads expose only active metadata. There is no single “current contract” column for concurrent builds to race over. |
| `soma.app_policies` | `app_id`, `policy_version`, `projection_sha256`, `projection`, `authoring_seat`, `approved_by`, `review_url`, `approved_at`, `withdrawn_at` | Written only by the steward's `register`. One row per approved privileged projection (section 2.4a). Several versions may be active at once, so a rollback keeps working until the steward withdraws its policy. |
| `soma.app_contracts` | `app_id`, `contract_sha256`, `release_sha`, `deploy_context`, `policy_version`, `kit_version`, `lock_sha256`, `synced_at`, `retired_at`, `retirement_reason` | Written by `sync-contract` through the broker; one row per accepted release contract (section 2.4a). Read by the broker on every call; a lookup may be cached for at most 60 seconds. |
| `soma.app_hosts` | `app_id`, `actor_id`, `role`, `escalation_url`, `expected_response`, `notify_address` | Platform-managed. Public reads of active apps expose every field except `notify_address`, which only the notification worker reads. |
| `soma.app_installations` | `app_id`, `purpose` (`runtime` or `release`), `credential_hash`, `created_at`, `last_used_at`, `revoked_at` | Broker-only. Raw credentials are never stored. |
| `soma.oauth_transactions` | `transaction_id`, `app_id`, `state_hash`, `nonce_hash`, `pkce_challenge`, `redirect_uri`, `disclosure_hash`, `expires_at`, `consumed_at` | Broker-only pending authorization. Every secret value is stored as a keyed hash. |
| `soma.authorization_codes` | `code_id`, `transaction_id`, `code_hash`, `person_id`, `expires_at`, `consumed_at` | Broker-only, short-lived, and single-use (section 2.2, step 10). |
| `soma.browser_sessions` | `session_id`, `person_id`, `app_id`, `handle_hash`, `previous_handle_hash`, `previous_valid_until`, `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at` | Broker-only. The handle rotates after authentication and after a privilege change. The previous handle stays valid for 30 seconds, so requests already in flight from other tabs do not fail. |
| `soma.refresh_families` | `family_id`, `agent_id`, `current_generation`, `derivation_key_id`, `expires_at`, `revoked_at`, `compromised_at` | Broker-only. One family per AI partner, not per app or grant, so the partner is registered once (section 0). |
| `soma.refresh_credentials` | `credential_id`, `family_id`, `generation`, `credential_hash`, `issued_at`, `used_at`, `replaced_by`, `revoked_at` | Broker-only. Presenting the immediately previous generation within 30 seconds of its rotation returns the same successor, which the broker can reproduce without storing plaintext (Appendix A, M4). Presenting any older generation, or the previous one after 30 seconds, marks the family compromised and revokes it. |
| `soma.device_authorizations` | `device_id`, `app_id`, `agent_id`, `device_code_hash`, `user_code_hash`, `agent_label`, `requested_scopes`, `risk_ceiling`, `purpose`, `attempts`, `status`, `person_id`, `expires_at`, `consumed_at` | Broker-only RFC 8628 state (section 2.7). `agent_id` is set when an already-registered AI requests a grant for another app. |
| `soma.security_events` | `event_id`, `person_id`, `app_id`, `kind`, `subject_id`, `safe_metadata`, `created_at` | Holds no token, code, request body, or raw credential. Records refresh reuse, pairing, revocation, and suspicious authorization failures. |
| `soma.memberships` | `person_id`, `app_id`, `app_person_id`, `role`, `trust`, `joined_at`, `last_seen_at`, `left_at` | The person reads their rows. App admins use a narrow broker call. |
| `soma.tickets` | `ticket_id`, `app_id`, `kind` (`single_use` or `reusable`), `token_hash`, `inviter_person_id`, `inviter_name`, `invitee_name`, `quote_line`, `channel`, `max_redemptions`, `expires_at`, `revoked_at`, `created_at` | Broker-only v2 invitation storage (section 1.2). The raw token is returned once and never stored. `invitee_name` is optional display copy, not an identity binding. The app never receives `inviter_person_id`. `channel` records how the inviter shared the link; SOMA does not send it (section 2.3b). |
| `soma.ticket_redemptions` | `ticket_id`, `person_id`, `guest_session_hash`, `redeemed_at` | Broker-only. Exactly one of `person_id` and `guest_session_hash` is present, unique per ticket and subject, so anonymous admissions count without storing the bearer session. |
| `soma.consents` | `person_id`, `app_id`, `fields`, `purpose`, `policy_version`, `granted_at`, `revoked_at` | The person reads and revokes. The broker enforces disclosure. |
| `soma.concepts` | `concept_id`, `version`, `owner_app_id`, `definition_hash`, `supersedes`, `status` | Platform-managed registry. Only the platform steward may publish or revise `soma:*`; an app owns only its namespace. |
| `soma.question_definitions` | `question_id`, `schema_version`, `owner_app_id`, `schema_hash`, `portable`, `compatible_with`, `status` | Platform-managed registry. Cross-app compatibility is explicit and hash-bound, never inferred from matching strings. |
| `soma.concept_state` | `person_id`, `concept_id`, `concept_version`, `state`, `source_app_id`, `receipt_id`, `first_at`, `last_at`, `evidence` | Write rules: section 2.5. `soma:*` state reaches an app only after consent. |
| `soma.shared_answers` | `person_id`, `question_id`, `schema_version`, `answer`, `source_app_id`, `sensitivity`, `purpose`, `allowed_destination`, `expires_at`, `shared_at`, `revoked_at` | Size-limited typed JSON holding only the projection a person explicitly approved for cross-app use (section 2.5). Private source answers never enter the `soma` schema. |
| `soma.agent_partners` | `agent_id`, `principal_id`, `label`, `created_at`, `last_used_at`, `revoked_at` | Registers an AI relationship without granting app authority. Its refresh credentials live in the two refresh tables, not on this row. |
| `soma.agent_app_handles` | `agent_id`, `app_id`, `app_agent_id`, `created_at` | Broker-only. Created on the first grant for that app. `app_agent_id` is random, so it cannot be derived from `agent_id`. Grant revocation keeps it. A completed per-app forget or erasure of the principal deletes it, so a later rejoin cannot be correlated with the forgotten membership. |
| `soma.agent_grants` | `grant_id`, `grant_version`, `agent_id`, `principal_id`, `app_id`, `scopes`, `risk_ceiling`, `purpose`, `expires_at`, `revoked_at` | The principal controls the grant. App scope is required unless `app_id='*'` was explicitly chosen. |
| `soma.grant_app_handles` | `grant_id`, `app_id`, `grant_ref`, `created_at` | Broker-only per-app lookup for agent tokens. A wildcard grant receives a different random `grant_ref` in each app; apps never receive `grant_id`. A completed per-app forget or erasure of the principal deletes these rows (section 2.5). |
| `soma.receipt_index` | `receipt_id`, `app_id`, `person_id`, `actor_id`, `action_id`, `risk`, `status`, `created_at` | Written by the broker in the same transaction that writes or settles the app's receipt. Holds no input, output, or effect text. Powers the person's cross-app receipt list and AI-grant audit. |
| `soma.erasure_requests` | `request_id`, `person_id`, `scope`, `status`, `requested_at`, `effective_at`, `completed_at`, `receipt` | The person reads their requests. Platform workers update status. |
| `soma.erasure_targets` | `request_id`, `target_kind`, `app_id`, `store_id`, `subject_handle`, `status`, `attempts`, `next_attempt_at`, `completed_at`, `exception_reason`, `receipt` | One idempotent target per app database, object store, notification adapter, or declared provider (section 2.5a). `subject_handle` is broker-only and keeps the app-local person or agent handle until that target completes. |
| `soma.conformance_runs` | `run_id`, `app_id`, `release_sha`, `contract_sha256`, `tier`, `result`, `failed_checks`, `evidence_url`, `runner_actor_id`, `ran_at` | Written by the conformance runner through the broker with the conformance credential that the `kit-release` seat holds (section 2.4a). Read by `/api/soma/v1/status`. |
| `soma.estate_inbox` | `event_id`, `app_id`, `app_record_id`, `kind`, `consent_safe_summary`, `created_at`, `attempts`, `next_attempt_at`, `lease_owner`, `lease_expires_at`, `delivered_at`, `external_ref`, `last_error_code` | Written only by the broker, in the same transaction as the app's local record. `(app_id, kind, app_record_id)` is unique, so a retried submission cannot create a second event. It contains no attachments, transcripts, raw diagnostics, contact fields, or full report body. The Mac-side board importer leases rows and sets `delivered_at` only after the board write succeeds, so apps never depend on the Mac being up and a crashed importer loses nothing. |
| `soma.estate_dispositions` | `event_id`, `app_id`, `app_record_id`, `status`, `public_note`, `demonstration_url`, `updated_at` | Written by the estate processor (`soma_estate`) and read by the originating app through the broker. |
| `soma.notifications` | `notification_id`, `event_id`, `app_id`, `recipient_kind` (`host` or `person`), `recipient_id`, `template_id`, `params`, `status`, `attempts`, `next_attempt_at`, `sent_at` | Broker-only idempotent delivery queue (section 2.3b). Never holds an address or a message body; `params` holds only the template's declared fields, and a contact notice links to the message in the app. Erasure deletes a person's rows. |

#### Per-app schema

New apps receive an `app_<app_id>` schema for tables and an `app_<app_id>_api` schema for the RPCs the broker may call (section 2.3).

| Table | Purpose |
|---|---|
| `feedback_items` | The canonical user report and its evidence, including host contact threads (`kind = 'contact'`). |
| `build_requests` | The report-to-build lifecycle and demonstration links. |
| `feedback_status_inbox` | Idempotently applies estate disposition and demonstration updates to the canonical app record so the person can see what happened. |
| `action_receipts` | `receipt_id`, `action_id`, `action_version`, `idempotency_key`, `request_fingerprint`, `actor_id`, `principal` (`app_person_id`), `grant_ref`, `authorization_version`, `declared_risk`, `effective_risk`, `status`, `resource_version`, `effect_summary`, `output_ref`, `undo_of`, `cool_off_started_at`, `expires_at`, `created_at`, `completed_at`, `payload_sha256`, `signing_key_id`, `signature`. The canonical intent, approval, receipt, and idempotency record, signed by the broker when it settles (Appendix A, M2). |
| `action_receipt_payloads` | Erasable preview, input, and output material referenced by a receipt. A receipt for an AI-performed `observe` action stores only the resource class and outcome, never the content read. |
| `answers` | The app's canonical private typed answers. Sharing copies only the approved projection to `soma.shared_answers` (section 2.5). |
| `last_location` | The person's resume point in this app (from `soma-app-template/supabase/migrations/0005_last_location.sql`). |
| `app_changes` | Proposed, accepted, building, shipped, and rejected changes. |
| `error_reports` | Fingerprinted client and function failures. A new crash fingerprint raises a minimal `kind = "error"` estate event (Appendix A, M5). This replaces today's estate crash alarm, which reads PlayMaker's tables with the shared secret key and loses that path in M11. |
| `front_door_events` | Consent-aware arrival and conversion events. |
| `usage_events` | Metered consumption with `billing_subject_kind` (`person` or `operator`), `billing_subject_id`, and an optional `principal_app_person_id` for attribution. A person subject uses the pairwise `app_person_id`; the singleton operator subject funds anonymous use without pretending to be a person. |
| `entitlements` | Caps, allowances, billing mode, and daily cost budget keyed by `(billing_subject_kind, billing_subject_id)`. |
| Domain tables | The app’s actual product data. |

In `action_receipts`, `actor_id` holds `app_person_id` when the person acted, `app_agent_id` when an outside AI acted, and the AI host's actor ID when the in-app host acted. `grant_ref` holds the per-app grant handle. The broker translates both back to global IDs only when it writes `soma.receipt_index`.

**One transaction across two schemas.** The broker writes a per-app record and its `soma` counterpart (`soma.estate_inbox` for feedback, contact messages, and crash alerts; `soma.receipt_index` for receipts) in one database transaction that the broker opens itself. The broker calls the app RPC and inserts the `soma` row inside that transaction. The app RPC cannot write the `soma` schema, because its owner, the app's runtime role, holds no privilege there. No transaction is held open across an HTTP call. If the transaction fails, neither row exists and the person sees the failure, so no event can be lost between the two schemas. A legacy-global app that commits its feedback record outside the broker (PlayMaker and Legends until M11) files the event through the same broker call after its own commit and retries until the broker acknowledges; the unique `(app_id, kind, app_record_id)` makes the retry safe.

Delivery to the estate board is outside that transaction. The importer takes a row under a bounded lease, writes the board item with `event_id` as its idempotency key, and only then marks the row delivered. If the importer dies, the lease expires and another run retries with backoff. The external monitor in section 2.9 alarms when the oldest undelivered row is overdue, so a dead Mac cannot silently consume the human host's stated response time.

**RLS.** Every table has RLS enabled and forced. Table-owner roles are never used at runtime. Every `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role, sets `search_path` to `pg_catalog` plus its exact app schema, obtains identity only from the platform request-context accessors, and returns explicit columns. Conformance must prove that neither the broker, nor the runtime role, nor any registered RPC can read or change another person's or another app's rows, and that no table owner is on the runtime path (C12, C12a).

**Receipt state machine.** `action_receipts` has a unique constraint on `(principal, actor_id, idempotency_key)`. Reusing a key for a different action, version, canonical input, target, or authorization produces an idempotency conflict. One principal can have several actors (the person, the AI host, and several outside AIs), so scoping the key to the principal and the actor means no actor can block, collide with, or read the stored result of another actor's request. A replay returns the stored result only to the same authenticated actor while the authorization recorded on the receipt is still live. `status` is one of `prepared`, `approval_required`, `approved`, `running`, `succeeded`, `failed`, `refused`, `expired`, or `undone`.

- Preparation is side-effect free and ends by inserting the idempotency row (steps: Appendix A, M2). Malformed, unauthenticated, and rate-limited traffic stops before this point and writes no receipt.
- Execution claims a prepared or approved row by moving it to `running`, runs the effect, then settles the row with its output reference.
- A PostgreSQL transaction cannot stay open across the HTTP calls between the app's Function and the broker. So a database-effect action's `execute` makes exactly one broker call, to an app RPC that claims the row, applies the effect, and settles the row inside one transaction. This works because `action_receipts` and the domain tables live in the same app schema.
- An external-effect action claims the row, calls the provider, and settles the row in separate broker calls. A failure between those calls is resolved by the idempotency key and the action's declared timeout and recovery rule.

Repeat-key responses, fingerprint, claiming, reconciliation, and signing: Appendix A, M2.

### 2.4a Registering an app in the shared project

**Seats.** The kit adds two seats to `_estate/seats.json`, which today defines neither. Every mention of “the steward” or “the release seat” in this plan means these seats.

- `kit-steward` owns `key:supabase-management`, `key:soma-id`, `deploy:soma-id`, `key:soma-notify`, `deploy:soma-notify`, and `db:soma`. It is the only seat that runs `register`, `migrate`, and `--approve-contract-diff`, because those need the Supabase Management API token, which a builder never holds.
- `kit-release` claims `repo:<app>:preview` for each kit app, holds the conformance credential, runs conformance, and flips feature flags.

**Separation of duties.** `kit-steward` never approves a contract diff from a pull request that its own seat authored. `soma.app_policies` records the approving seat, the authoring seat, and a link to the reviewed diff. A diff that lowers a risk, broadens remote access, adds a provider, makes an answer portable, opens admission, or changes a host also needs a recorded review by the `frontier-adversary` seat before approval. Conformance fails a policy version whose approver and author are the same seat.

**`soma-scaffold register <soma-app.json>`** is idempotent and does five things:

1. Inserts or updates `soma.apps`, `soma.app_hosts`, the registered origins, and the app's own-namespace rows in `soma.concepts` and `soma.question_definitions`, and records the manifest's privileged projection as an approved policy version in `soma.app_policies`. It never writes a `soma:` concept or question; those are published by the platform steward as platform policy. Apart from the app's own Netlify site (step 5), it performs no third-party provisioning by default. An optional voice recipe may create an ElevenLabs agent only when `guide.voice.enabled` and `guide.voice.provision` are both explicitly declared.
2. Creates the private schemas `app_<app_id>` and `app_<app_id>_api` and the two app roles from section 2.3b. Neither schema is exposed to PostgREST or granted to `PUBLIC`, `anon`, or `authenticated`.
3. Applies an approved migration bundle with `soma-scaffold migrate`, which runs each migration as the app's owner role, confined to the app's two schemas, and rolls back any migration that leaves an unsafe object. Nobody runs `supabase db push` against the shared project, because that project's single migration history already holds PlayMaker's numbered migrations (`0001`–`0089` on 2026-10-07) and a second repository's `0001_…` would collide.
4. Mints overlapping runtime installation credentials and a release credential from the broker of the environment being registered (step 5), and writes them through the Netlify API to the matching deploy context only: the `production` context for production, and the `preview` branch context for staging. Only Functions read runtime credentials, and only Builds read the release credential. Only production and the fixed `preview` branch receive SOMA credentials.
5. Creates or verifies the app's Netlify site, its repository link, branch deploys, and the protected `preview` branch, then registers one origin per environment, chosen by `register --environment staging|production`: the fixed branch-deploy alias `https://preview--<site>.netlify.app` with the staging broker, and the production origin with the production broker. Each broker runs against its own Supabase project (section 2.3b), so an origin, credential, code, or contract from one environment does not exist in the other. Per-deploy URLs are not registrable, and no wildcard is ever accepted.

Schema, role, migration-runner, credential-scope, and origin-verification details: Appendix A, M3. The catalog baseline the steward captures before the first registration: Appendix A, M0.

**Release contracts.** An ordinary pull request that edits the manifest or a file it references changes the contract hash, and the broker enforces that hash. Most such edits (knowledge text, workflow step text, titles) do not change policy and should not wait for the steward. So the app's build runs a vendored `sync-contract` script before the deploy publishes, using the release credential. It submits the manifest, the referenced files' hashes, and the app's migration checksums, and the broker recomputes the contract hash itself.

- `sync-contract` registers a release. It does not approve policy. It accepts a new hash automatically only when the manifest's privileged projection is identical to a policy version in `soma.app_policies` that has not been withdrawn.
- Policy classification fails closed. The v1 JSON Schema marks a small set of fields as presentation-only: titles, descriptions, workflow step text, and the knowledge and persona files. Every other manifest field, and the hash of every other referenced file, belongs to the privileged projection. That includes promise text and checks, legal source files, requested identity fields and their reasons, action input and output schemas, and executors. Promise text and legal copy are promises to people, so a build cannot broaden them without the steward's review. A presentation-only field may change wording but cannot affect a promise, identity disclosure, admission, authorization, data access, storage, retention, network destinations, provider use, or execution. A schema revision that adds a field without classifying it fails validation.
- A change to the privileged projection fails the build with a machine-readable diff. The steward reviews it and runs `soma-scaffold register --approve-contract-diff <hash>`, which records a new policy version. So no policy change rides through on a build credential.
- The broker refuses a contract that carries a migration checksum not yet recorded in `app_<app_id>.schema_migrations`; that change waits for the steward's `migrate`.
- `sync-contract` never updates `soma.apps`, `soma.app_hosts`, `soma.app_policies`, origins, or migrations. It records only the contract hash, release SHA, deploy context, and the already-approved policy version in `soma.app_contracts`.
- The broker accepts every non-retired contract of the app whose policy version has not been withdrawn and whose kit version meets the active security floor (section 2.8a). Keeping only the current and previous hash would fail in two ways: a Netlify rollback republishes an old build without rebuilding it, so the old hash must keep working; and builds for two commits can finish in either order. Binding each contract to a policy version keeps rollback deterministic without letting an old release revive a policy the steward has withdrawn.
- A contract is retired when the steward retires it, when its policy version is withdrawn, when a security floor or fix declares it unsafe, or when an approved migration removes an RPC its actions call. Retiring a contract is the documented way to stop an old release from calling the broker.
- `sync-contract` contacts a broker only in the `production` context and on the fixed `preview` branch deploy. In every other context it exits successfully without contacting any broker, and that build continues as a static preview with sign-in disabled.

Running `register`, including any `--approve-contract-diff`, is not an edit to `soma-platform`, so it does not fail the second-app test. Its time counts toward the 30-minute branch-deploy target.

### 2.5 Concept and answer semantics

A concept ID is namespaced, such as `soma:host-pair` or `playmaker:stage-read`. Declaring a concept outside `soma:` and the app's own namespace fails C3. Declaring an unregistered `soma:*` concept, or a definition hash that differs from the registry, also fails C3.

A concept state is one of `told`, `shown`, `done`, or `acknowledged`. Writes require a concept declared by the app's registered contract.

- `told` suppresses the unprompted introduction of the concept.
- `shown` and `acknowledged` also suppress the automatic start of its Show workflow.
- `acknowledged` means the person said they already know it. It can be recorded only from an explicit person control: a request carrying the person's own session and CSRF token, never an agent token or an authorization created for the in-app AI host.
- `done` means a successful action receipt bound to that concept and version exists. The broker records `done` when it settles such a receipt; no route, AI, or app can assert `done` or `acknowledged` from prose.
- No state suppresses an explicit request. Ask and Show always answer when the person asks.

A new concept version is not automatically treated as understood. The manifest may declare that version `2` supersedes version `1`.

A question has a stable ID and answer schema version under the same namespace rule as concepts. A question that more than one app asks is a `soma:` question, published by the platform steward like a `soma:` concept. An answer is written first to the source app's `answers` table and stays there by default. The staging fixture state that makes the cross-app Golden Journey deterministic is specified in Appendix A, M3.

Sharing is an explicit copy operation. The person approves the exact projected fields, destination class, purpose, sensitivity, and duration, and the broker then writes that projection to `soma.shared_answers` in the same transaction that records the consent. An app may request portability but cannot create or broaden the shared projection on the person's behalf. Changing the source answer later does not change the shared projection; the shared copy is updated only when the person approves a new share.

The approval screen for a share is on the identity origin, reached by a top-level navigation like authorization (section 2.2). The app's own pages cannot serve as the witness, because the app could imitate the person's gesture there. The app calls `POST /api/soma/v1/me/answers/:question_id/share`, which records a pending share bound to the projection hash and returns a `share_url` on the identity origin. The broker writes `soma.shared_answers` only when the identity origin records the person's approval of that exact pending share. A pending share expires after 10 minutes.

An app may suppress a question only when the registered question definition marks the stored schema compatible, the consent remains current, the answer has not expired, and the app is allowed to receive its sensitivity class.

Revoking answer consent immediately deletes or tombstones the shared projection, which hides it from every destination, without deleting the source app's lawful private copy.

Per-app forget immediately revokes sessions, grants, and consent, marks the membership unusable, and creates erasure targets that carry the old app-local person and agent handles. The erasure workers need those handles to find the app's data, so the mappings stay broker-only until every target completes. Completion then deletes the membership mapping, the `agent_app_handles` and `grant_app_handles` rows, and the targets' subject handles. Rejoining at any point creates a new random `app_person_id` and new `app_agent_id` values and never reconnects to the old erasure job. A legacy-global app cannot issue a new identifier, because its `app_person_id` is the `auth_user_id`; for those apps, forget erases the app data and the membership only.

### 2.5a Data inventory, export, and erasure

Every manifest declares `data_stores`. Each entry names its owner, its kind (`database`, `object-storage`, `notification`, or `provider`), its data classes, its export handler, its erasure handler, its retention rule, and whether a lawful-retention exception can apply. A prototype with an incomplete `data_stores` list receives a warning; public MVP fails on it (C18a).

A per-app export combines the app's domain rows, private answers, files, grants, the receipts retention permits, and the central records disclosed to that app. A global export is an identity-origin job that fans out to every current or former membership and produces a manifest showing each target's result. “Complete JSON” means all exported records plus file metadata and checksums; Markdown is the readable projection.

A global erasure request immediately revokes browser sessions, AI grants, refresh families, pending approvals, and outstanding invitations. It then creates one `soma.erasure_targets` row for every store named by every affected app contract. Handlers are idempotent and retryable. Completion requires proof from every target, so a provider outage leaves the request visibly pending rather than reporting success. Deleting the Supabase Auth user runs through the Auth-administration path in section 2.3b.

Global export and global erasure are started only on the identity origin, never through an app, because no single app may act across the person's other memberships. Both need the identity-origin session and its CSRF token. A global erasure also needs recent authentication and a confirmation screen that names the memberships, grants, and sessions it will revoke at once. Routes: Appendix A, "Before public MVP".

Lawfully retained payment or security records are minimized, separated from product data, and shown to the person as named exceptions with their deletion dates. Backups are not rewritten in place. Instead, the restore procedure in section 2.9 replays completed erasure requests before a restored system admits traffic, so erased data cannot return to service, and backups age out under the declared backup-retention period.

An app that cannot demonstrate export and erasure for each declared store cannot advance to public MVP. Private-file rules and receipt erasure: Appendix A, "Before public MVP".

### 2.6 Action registry

```ts
export type SomaRisk =
  | "observe"
  | "reversible"
  | "consequential"
  | "irreversible";

export interface SomaAction<I, O> {
  id: string;
  version: string;
  title: string;
  description: string;
  kind: "view" | "observe" | "effect";
  risk?: Exclude<SomaRisk, "observe">; // required when kind is "effect"
  requiredScopes: string[];
  requiredRole: "visitor" | "member" | "editor" | "owner" | "admin";
  surfaces: Array<"ui" | "guide" | "remote">;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  effects: string[];
  concept?: { id: string; version: string };
  executor?:                               // required when kind is "observe" or "effect"
    | { kind: "rpc"; name: string }
    | { kind: "external"; provider: string; operation: string };
  effectTarget?: "database" | "external"; // required when kind is "effect"
  timeoutSeconds?: number;                 // required when effectTarget is "external"
  recovery?: "provider-idempotency-key" | "reconcile"; // required when effectTarget is "external"
  coolOffSeconds?: number;                 // required when risk is "irreversible"
  uiException?: { reason: string };         // only for AI-only reversible actions; reviewed under C5
  prepare?: (
    context: ActionContext,
    input: I
  ) => Promise<ActionPreview>;
  execute: (
    context: ActionContext,
    input: I
  ) => Promise<O>;
  undo?: (
    context: ActionContext,
    receipt: ActionReceipt
  ) => Promise<ActionReceipt>;
}

export function registerAction<I, O>(
  action: SomaAction<I, O>
): void;

export function executeAction<I>(
  request: {
    actionId: string;
    actionVersion: string;
    input: I;
    idempotencyKey?: string; // required when the action's kind is "effect"
  },
  context: ActionContext
): Promise<ActionReceipt>;
```

The server enforces the risk gate.

Every `observe` and `effect` action names its `executor`; a `view` action names none. An RPC executor must be a function created by an applied migration. An external executor's `provider` must appear in `data_flows`. The broker takes the executor from the accepted contract for the action being run, never from the caller, so an action declared at a low risk cannot be used to call an RPC that belongs to a riskier action.

`kind` maps one-to-one onto PlayMaker's registry: `view` is PlayMaker's `view`, `observe` is `inspection`, and `effect` is `effect` with a declared risk.

A `view` action changes only what is on the person's screen. It runs in the browser, writes no receipt, needs no idempotency key, and may list only the `ui` and `guide` surfaces, because a remote AI must not drive a person's screen.

`requiredRole: "visitor"` is allowed only for `view` and `observe` actions over public data, and only when the manifest says so. Every `effect` action requires a person session or a broker-issued agent access token.

**The in-app AI host** has no ambient authority over private data or effects. It may explain, run a public `observe` action (one whose `requiredRole` is `visitor`), prepare an action preview, or offer a declared Show, Look, or Do control. Reading private data sends it to the AI host's inference provider, and prompt injection or model error could otherwise trigger such a read without the person asking. So a private `observe` runs only after the person selects a Look control, and an effect only after the person selects a Do control. Each selection is a person gesture carrying the person's session and CSRF token. It creates a one-request authorization bound to the current person session, the action ID and version, the canonical input hash, the target resource version, the AI host's actor, and a short expiry. A Do gesture may authorize at most a `reversible` action. Model output, retrieved knowledge, page context, and action output can never create either authorization. An AI host that needs asynchronous or standing authority must receive the same named, scoped, expiring grant as an outside AI. Every receipt records the AI host's `actor_id` and the person as principal.

| Risk | Person in current UI | AI host or paired outside AI |
|---|---|---|
| `observe` | Run immediately. | A paired AI needs the matching read scope. The in-app host runs a public read directly and a private read only after the person's Look gesture for this exact prepared request. Either AI path writes a metadata-only receipt. |
| `reversible` | Run and show a receipt with a tested undo operation. | A paired AI needs a live grant and risk ceiling. The in-app host needs the person's explicit Do gesture for this exact prepared request. The receipt exposes the tested undo operation. |
| `consequential` | Show an effect preview and require confirmation. | Require fresh person approval of the recorded intent, bound to the action, version, input hash, principal, and expiry. Return `approval_required` with an `approval_url` the AI relays to the person. |
| `irreversible` | Require explicit final wording, then a second confirmation after the cool-off. | Never run from standing authority. Require fresh human approval through the same `approval_url` flow, including the second confirmation after the cool-off. |

**Asynchronous approval.** An outside AI has no screen of SOMA's own, so approval is asynchronous.

1. When a consequential or irreversible request arrives, the server returns HTTP 202 with `status: "approval_required"`, an `approval_id`, an `approval_url`, an expiry, and the ID of the same receipt that will eventually contain the outcome.
2. The AI relays the `approval_url` to the person through whatever channel it already uses with them.
3. The `approval_url` opens the app's own effect preview, which the person confirms or declines while signed in. The approval bindings are in section 2.7.
4. The approval page re-runs `prepare`. If the effective risk, effects, input, authorization, or resource version changed, the old approval expires and the person sees a new preview.
5. After confirmation, the app server executes the already-recorded intent inside the person's confirming request. For an `irreversible` action the first confirmation starts the cool-off: the approval page keeps its final control disabled for `coolOffSeconds`, and the person's final confirmation after that executes the intent. Nothing executes on a timer, because an app Function runs only inside a request and a `GET` poll must not cause an effect. An approval still waiting for its final confirmation expires 10 minutes after the cool-off ends. The AI polls the receipt; no bearer approval token is returned through the AI's channel.

**Receipts.** Every effect request requires `Idempotency-Key`. An action labeled `reversible` must implement and pass a round-trip undo test; otherwise conformance requires it to be labeled `consequential`. Every authenticated `effect` attempt that reaches preparation writes a receipt, including authorization refusal and execution failure. An `observe` action writes a metadata-only receipt when an AI host or a paired outside AI runs it, naming the action and resource class but not retaining the content returned, so the person can audit what an AI read on their behalf. A person's own reads in the UI write none. Invalid credentials, malformed requests, admission-limit failures, and unknown actions produce bounded security metrics or `soma.security_events` rows, not action receipts.

**UI parity.** UI controls use the same action definition as the Guide and remote API. AI-only actions are permitted only when the action has no honest visual equivalent and is either an `observe` action or a `reversible` effect action. An AI-only `reversible` action must declare a `ui_exception` with a reason in the manifest, reviewed under C5, and its receipts must appear in the person's receipt view with an undo control, so the person can see and reverse the effect without the AI. `consequential` and `irreversible` actions are never AI-only.

**Kit actions.** The kit contributes three actions to every app without requiring the app to declare them: `soma.contact.reply` (`consequential`, `editor` or higher), `soma.membership.raise-role` (`consequential`, with the existing-owner rule from section 2.2), and `soma.membership.lower-role` (`reversible`). An app whose `admission` is `request` also receives `soma.access.decide` (`consequential`, `owner` or `admin`). The scaffolder adds these actions to the compiled contract, so the contract hash, privileged projection, risk gates, and receipts cover them. Their UI bindings live in generated admin views, which C5 checks like any other binding. An app may not declare an action whose ID begins with `soma.`. Kit actions do not count toward the app actions section 5 requires.

### 2.6a Ask interface

```ts
// POST /api/soma/v1/ask   (public; quotas from section 2.7a)
export interface AskRequest {
  question: string;         // at most 2,000 characters
  route?: string;           // the app path the person is on, such as "/agenda"
  page_context?: string;    // at most 4,000 characters; accepted only when guide.ask.page_context is true
  history?: Array<{ role: "person" | "host"; text: string }>; // at most six turns of at most 2,000 characters; untrusted data
}

export interface AskResponse {
  answer: string;
  grounded: boolean;        // computed by the server from citation provenance, never taken from model output; not a truth guarantee
  degraded?: boolean;       // true when no provider was called (broker outage or spent budget)
  citations: Array<{ path: string; heading?: string }>; // every path is in guide.ask.knowledge
  offers: Array<
    | { kind: "show"; workflow_id: string }
    | { kind: "look"; action_id: string; action_version: string } // a private observe action
    | { kind: "do"; action_id: string; action_version: string }
  >;                        // only declared workflows, and only actions this caller may prepare
}
```

The server takes `app_id` from its own installation, never from the request. It loads knowledge only from the files listed in `guide.ask.knowledge`, bundled at build time and covered by the contract hash, and never accepts knowledge from the request.

Retrieval gives each source passage an opaque ID before any provider call. The provider may cite only those IDs. The server maps valid IDs back to declared paths and headings and discards unknown ones. `grounded` is true only when retrieval found at least one qualifying passage and every citation in the answer resolves to that retrieved set. Otherwise the endpoint returns `grounded: false`, no unsupported factual answer, and the human host's route. `grounded: true` proves only where the cited passages came from. It does not prove that the model read them correctly, so the UI labels such an answer "from the app's knowledge", never "verified" or "correct".

The Ask endpoint stores no question, answer, or history. Metering records only counts and cost. An app that wants Ask transcripts for diagnostics must declare them as a data store with a retention rule.

`page_context` is off by default. An app that turns it on must declare a data flow that names page text, and the server treats that text as untrusted data under section 2.7a. Web search is off unless the manifest sets `guide.ask.web: true` and declares the search provider as a data flow.

When `grounded` is false, the answer says that the app's knowledge does not cover the question, and it offers the human host's escalation route. The endpoint either streams its answer or returns within Netlify's synchronous Function execution limit. A timeout returns `grounded: false` with the human host's route, never an empty answer.

A `look` or `do` offer is only an invitation. Running it goes through `prepare` and the risk gate like any other request.

**Degraded Ask.** Ask makes a provider call only after the broker has charged the request against the caller's quota and the operator's daily cost budget (section 2.7a). Both live in the shared database, so an Ask Function cannot enforce them while the broker is down, and an unmetered provider call would let anonymous traffic spend without limit. During a broker outage, or after the daily budget is spent, Ask makes no provider call. It returns `degraded: true`, `grounded: false`, citations to the declared knowledge sections whose headings or text contain the question's words, and the human host's route. The search runs over the knowledge bundled into the release, so it needs no network call.

The Guide's current request shape, `{ question, context, persona, allowWeb, app_id }`, remains acceptable to legacy endpoints only. The kit endpoint ignores `context`, `persona`, `allowWeb`, and `app_id`.

### 2.7 AI visitor door

Every conforming app publishes these discovery and action routes:

```text
GET /.well-known/soma-app.json
GET /llms.txt
GET /api/soma/v1/openapi.json
POST /api/soma/v1/ask
POST /api/soma/v1/contact
GET /api/soma/v1/actions
POST /api/soma/v1/actions/:id/prepare
POST /api/soma/v1/actions/:id/execute
GET /api/soma/v1/approvals/:id
GET /api/soma/v1/receipts/:id
GET /api/soma/v1/status
```

Every conforming app also publishes person-facing routes. Each one is an app Function that authenticates the person or agent and calls a narrow broker function, so browser code never touches the `soma` schema.

```text
GET    /api/soma/v1/auth/start?return_to=…     create the PKCE transaction and navigate top-level to the identity origin
GET    /api/soma/v1/auth/callback              exchange the code server-side, set session cookies, then 303 to `return_to`
POST   /api/soma/v1/auth/logout                revoke this app session (person session and CSRF token)
GET    /api/soma/v1/me                         membership, role, consented fields, CSRF token, declared concept state, and compatible shared answers, in one broker call
POST   /api/soma/v1/approvals/:id/decision     record the signed-in principal's confirmation or refusal (person session and CSRF token only)
GET    /api/soma/v1/me/concepts?ids=…          state of declared concepts
POST   /api/soma/v1/me/concepts/:id            record told, shown, or acknowledged (done comes only from receipts, section 2.5)
GET    /api/soma/v1/me/answers?ids=…           compatible answers this app may read
PUT    /api/soma/v1/me/answers/:question_id    store a private app answer; a separate, person-approved share operation creates the central projection
POST   /api/soma/v1/me/answers/:question_id/share   create a pending share and return its identity-origin `share_url`
GET    /api/soma/v1/me/export?format=md|json   context export
POST   /api/soma/v1/me/forget                  leave this app and erase its copy
GET    /api/soma/v1/me/grants                  AI grants that reach this app
DELETE /api/soma/v1/me/grants/:id              revoke one grant
GET    /api/soma/v1/me/receipts                this person's receipts in this app
POST   /api/soma/v1/receipts/:id/undo          run the action's undo
```

The approval decision route is never listed in `/.well-known/soma-app.json`, `/llms.txt`, or the OpenAPI document, so an AI is not invited to approve its own request.

**Contact.** `POST /api/soma/v1/contact` accepts a signed-in person or an anonymous visitor. It writes a `feedback_items` row with `kind = 'contact'`, a `soma.estate_inbox` event, and an idempotent notification job in one broker transaction (section 2.4); the notification worker retries delivery to the human host's private registered address. A signed-in person sees the human host's reply at `/contact` in the app. An anonymous visitor receives a thread link once, carrying its token in the fragment (section 2.2; Appendix A, M5). The host answers through the kit action `soma.contact.reply` (section 2.6), which writes to the same thread.

**Pairing and tokens** live on the identity origin, not on the app:

```text
GET  https://id.<SOMA_APEX>/.well-known/oauth-authorization-server
POST https://id.<SOMA_APEX>/agents/device-code      (RFC 8628 device authorization)
POST https://id.<SOMA_APEX>/agents/token            (device_code and refresh_token grants)
GET  https://id.<SOMA_APEX>/.well-known/jwks.json
```

The app's `/.well-known/soma-app.json` names these URLs, so the AI still starts from the app's own URL. The broker publishes RFC 8414 metadata so that the v1.1 MCP adapter can reuse the same authorization server instead of adding a second auth design.

- The AI's long-lived refresh credential is returned only by the broker, presented only to the broker, stored only as a keyed hash, and rotated on every use. A concurrent retry of the immediately previous generation within 30 seconds receives the same successor; reuse of any older credential, or later reuse of the previous generation, revokes the credential family and records a security event.
- Each token request names one app with the RFC 8707 `resource` parameter, set to the app's registered origin. The broker returns an app-audience access token that lives at most 10 minutes (claims: Appendix A, M4) only when a live grant for that app exists, including a wildcard grant. A token captured by one app is useless at another, because both its audience and its online grant bind it to one registered app.
- Token validation in the app Function establishes authenticity only. The broker authorizes every request online, inside the same `invoke` call and database transaction that performs the read or effect, and never from a cache. Broker failure fails closed for effects and private reads.
- Revoking a grant increments `grant_version`, so an access token minted before revocation fails its next authorization check, and the next token request for that app is refused. The AI's other grants keep working. Revoking the AI partner itself revokes its refresh family and every grant.
- An AI that is already registered and wants a grant in another app starts a device-code request for that app and presents its current refresh credential. The broker rotates the credential in the response and attaches the approved grant to the existing partner instead of creating a new one. An AI that presents no credential is treated as a new partner.

**Pairing screen.** The device-code screen shows the AI label, destination app, requested scopes, risk ceiling, purpose, and expiry, and marks the label as chosen by the AI, not verified by SOMA. The person must type the user code their own AI displayed; there is no prefilled link. The person may narrow the request before approval. Every new AI partner is announced to the person through a channel the attacker does not control: a message to the person's verified email (section 2.3b), naming the label, the app, and the scopes, with a one-tap revoke link that opens the identity origin. A phished pairing is therefore visible to the person even when they never open their grant list. Limits and rate controls: Appendix A, M4.

**Approval bindings.** An approval has three bindings:

- The `approval_url` must be on the app's registered origin or the identity origin. The page shows the requesting AI's label and the grant's principal.
- Only the grant's principal, signed in, can confirm. Anyone else sees a refusal.
- `GET /api/soma/v1/approvals/:id` returns the approval's state and receipt ID only to an access token for the same broker-resolved grant. It never returns a bearer approval token. An approval expires within 10 minutes if the person has not made the first decision. For an irreversible action whose first confirmation started the cool-off, it instead expires 10 minutes after the cool-off ends if the person has not made the final confirmation.

Public discovery and public knowledge require no authentication. Which actions a visitor may run is set in section 2.6.

**Two classes of outside AI.** A chat AI that can only fetch pages can read discovery, `/llms.txt`, and public knowledge, and can tell its person how to connect an AI that can act. An AI with an HTTP or code tool can pair, receive grants, and act. M0 records which current assistants fall in each class.

A generated MCP adapter is the first v1.1 feature. It is generated from the same action registry and uses the broker's OAuth metadata and per-app grants from this section, because Claude and ChatGPT connectors speak MCP rather than OpenAPI.

### 2.7a Public endpoint and content safety

Every public endpoint declares a maximum body size, request rate, concurrency limit, cost budget, timeout, and enumeration-resistant error shape.

Rate limits use platform-derived client-address metadata, app identity where available, and account or grant identity after authentication. They do not trust a caller-supplied forwarding header.

Ask, feedback, invitations, device pairing, approval polling, and unauthenticated discovery have separate quotas. Expensive provider work is admitted only after the cheap validation and quota checks pass.

Knowledge files, user text, imported documents, action output, and outside-AI text are untrusted data. They never establish authority, select a scope, lower a risk level, or bypass confirmation. Only the typed registry and authenticated server context may authorize a tool call.

Rendered Markdown and model output are sanitized. Generated apps ship a restrictive Content Security Policy, `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`, and MIME-sniffing protection.

### 2.7b API invariants

Every `/api/soma/v1/*` response carries `X-Request-Id`. Successful JSON uses the shape documented for that endpoint. Every error uses one envelope:

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

Status codes have stable meanings: `400` malformed input, `401` absent or invalid authentication, `403` authenticated but unauthorized, `404` absent or deliberately enumeration-resistant, `409` pending or state conflict, `422` valid shape with rejected semantics, `429` admission limit, `502` upstream failure, and `503` declared dependency outage. A `429` response, and a retryable `409` or `503` response, includes `Retry-After`.

Private responses, authorization pages, approvals, receipts, exports, and pairing responses send `Cache-Control: no-store`. Immutable public discovery and knowledge use explicit ETags and content types.

Every collection that can grow uses opaque cursor pagination with a declared maximum page size and deterministic ordering. No API exposes an unbounded receipt, change, feedback, grant, or action-history list.

The OpenAPI document contains the common error schema, authentication requirements, rate-limit behavior, idempotency requirements, and every route intended for an outside AI. Human-only approval and consent mutations stay absent from AI discovery, but their security never depends on being undiscoverable.

### 2.8 Package boundaries and delivery

| Component | Delivery | Reason |
|---|---|---|
| `packages/soma-contracts` | Vendored types; schema used at build time | The manifest schema and generated types need one owner. |
| `packages/soma-signin` | Vendored React and static adapters | Sign-in must match the app and remain available during CDN failure. |
| `packages/soma-identity` | Vendored client adapter plus the central `soma-id` Netlify site built from `apps/soma-id` (section 2.3b) | Cross-app recognition needs one broker and app-local integration. |
| `packages/soma-tickets` | Vendored | Invitation routes, UI, and migrations belong to the app release. |
| `packages/soma-actions` | Vendored client and server code | Enforcement must be pinned with the app that executes the action. |
| `packages/soma-feedback` | Vendored | The widget and hooks must have one versioned source. |
| `packages/soma-meter` | Vendored server and client adapters | Metering participates in the app’s transaction boundary. |
| `packages/soma-errors` | Vendored | Error capture must still work when shared presentation services fail. |
| `packages/soma-guide` | Immutable CDN version with SRI | One maintained Guide serves React and static apps, but each app pins a release. |
| `packages/soma-assist-core` | Bundled into the Guide release | It is a Guide implementation detail. |
| `packages/soma-scaffolder` | Build-time tool | It creates and updates applications. |
| `packages/soma-conformance` | Development and CI tool | It proves the manifest and live behavior agree. |
| Template recipes | Copied by the scaffolder | Changelog views, legal routes, notifications, analytics, UI helpers, and optional billing do not justify runtime packages yet. |

**Lock file.** `soma-kit.lock.json` pins the template commit, the contract hash, every Guide asset with its integrity hash, and every vendored package's hash (shape and provenance rules: Appendix A, M1). React-app mode already vendors `@soma/signin`, `@soma/tickets`, `@soma/meter`, and `@soma/feedback` and records their source commit in `VENDORED.md` (`packages/soma-scaffolder/README.md`). The lock file replaces `VENDORED.md`, so there is one provenance record, not two. Updates: section 2.8a.

**Guide delivery.** The Guide's package name is `@soma-platform/soma-guide`; its delivery is the immutable CDN asset. Each release is published to `/v<semver>/`, which kit apps load and which never changes, and to the root path, which non-kit consumers load and which keeps moving. In kit mode the Guide loads no executable code at runtime: every executable asset, including an enabled voice adapter, reaches the page through a `<script>` tag carrying the lock file's integrity value, so the browser enforces Subresource Integrity on all of it. This replaces today's runtime import of `https://esm.sh/@elevenlabs/client@latest` (`packages/soma-guide/soma-guide.js`). Release mechanics: Appendix A, M5.

**Guide kit mode.** `cfg.kit = { app_id, me, actions, concepts }` turns on a kit mode, because the Guide's current hooks do not have the kit's meaning. Consumers that do not set `cfg.kit` keep today's behavior on the root channel. Hook-by-hook behavior: Appendix A, M5.

### 2.8a Kit updates and security floors

`soma-scaffold update --to <kit_version>` re-vendors packages, rewrites `soma-kit.lock.json`, regenerates discovery files and kit migrations, and opens a pull request in the app repository. It refuses to overwrite locally modified vendored files and lists them instead.

Kit versions follow semantic versioning. A minor or patch release never changes the manifest schema or the broker RPC contract incompatibly.

`sync-contract` submits the lock's `kit_version` and the lock file's SHA-256 with the contract. The broker stores both in `soma.app_contracts`.

When a kit release fixes a security defect, `kit-steward` records a security floor: a minimum kit version and an enforcement date. Before that date, the broker accepts older contracts, and `/api/soma/v1/status` shows the app as below the floor. On that date, the broker retires every contract below the floor, so those releases stop calling it, and an `estate_inbox` event is filed for each affected app.

For PlayMaker the update arrives as an ordinary pull request under section 4.2, so the enforcement date must leave time for Eric's review unless the defect is being exploited.

### 2.9 Platform recovery

Before the broker admits a real person, the platform declares an RPO and RTO for identity, consent, memberships, grants, app registrations, and receipt indexes.

The launch gate verifies provider backups or PITR, plus an encrypted logical export of the control-plane schemas to a separate failure domain. Backups exclude plaintext credentials and are inaccessible to app installation credentials.

The launch gate also requires an external monitor that runs outside Netlify, Supabase, and the Mac. It checks public discovery, broker reachability, the age of the oldest undelivered `soma.estate_inbox` row (section 2.4), and a synthetic sign-in, private read, and revocation journey. Its alerts reach the `kit-steward` seat and one named human maintainer through a channel that depends on neither the Mac nor the broker.

The broker provides audited incident controls to disable new authorizations globally, disable one app installation, disable one action or executor, refuse all effects while public help and status keep working, withdraw a policy, retire a contract, and revoke a signing or installation key. Each control has a documented reversal and a staging drill. Production launch fails until the monitor has detected an injected outage and every control has been demonstrated.

A restore rehearsal must rebuild staging from backup, rotate every restored credential, replay completed erasure requests (section 2.5a), and pass the known-person, consent, action, revocation, and feedback journeys. A backup is not considered working until this rehearsal passes.

Broker signing keys, receipt-signing and request-fingerprint keys, app installation credentials, app release credentials, conformance credentials, refresh-token hashing keys, and the `soma-notify` database and mail-provider credentials have named owners, creation and expiry dates, overlapping rotation procedures, emergency revocation procedures, and audit events. JWKS retains an old public key only through the maximum lifetime of tokens it signed.

The public status route exposes release metadata (release SHA, contract hash, kit lock hash, security-floor state, and declared conformance exceptions) and pass/fail results with their timestamps. Detailed failed checks, infrastructure identifiers, and evidence URLs require steward authorization.

## 3. The contract an app signs

### 3.1 Canonical manifest

The canonical v1 schema lives at `soma-platform/packages/soma-contracts/schema/soma-app-v1.schema.json`. The old path, `soma-platform/packages/soma-scaffolder/schema/soma-app.schema.json`, keeps the **v0** schema unchanged and is not an entry point for v1.

The v1 manifest is a new document shape, not an extension of v0. The v0 spec has a root `soma_app` object with `slug`, `targets`, `affordances`, and `meta`, and forbids other root keys, so it cannot validate a v1 manifest. The scaffolder therefore dispatches on the document: `"schema_version": "soma.app/1"` validates against the v1 schema, and a root `soma_app` is accepted only by the converter `soma-scaffold migrate-spec` (Appendix A, M1).

**Contract hash.** `contract_sha256` is the SHA-256 of the RFC 8785 (JSON Canonicalization Scheme) form of `{ "manifest": <manifest>, "files": { "<path>": "<sha256 of file bytes>" } }`, where `files` lists every path the manifest references. Reformatting the manifest does not change the hash. Changing a referenced schema, persona, or knowledge file does. `soma.app_contracts.contract_sha256`, the running release's status endpoint, the lock file checks, and the evidence bundle all use this hash. The status endpoint reports the hash compiled into the running release, not whichever concurrent build synced most recently.

**Paths.** The schema distinguishes repository source paths from public routes. `knowledge/host-pair.md` is a source path, and the compiler may publish it at `/knowledge/host-pair.md`. Legal paths such as `/privacy` are routes and are never opened as files. A source path can never escape the repository (rules: Appendix A, M1).

**Field meanings that the schema alone does not convey:**

- `app.id` is immutable and matches `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`, with at most 40 characters. Underscores are forbidden, so replacing hyphens with underscores to name the app's schemas and roles can never map two IDs to one name, and the longest derived name stays below PostgreSQL's 63-byte identifier limit, which would otherwise truncate it silently. Renaming an app means registering a new app and migrating explicitly; `register` never treats a changed ID as an update.
- `expected_response` states how soon the human host normally replies. It is a stated expectation shown to the person, not a contractual service-level agreement.
- Each data flow's `retention_days` is a non-negative integer or the literal `"undeclared"`. The integer is how many days the vendor keeps the data under the operator's actual agreement with that vendor; `0` means the vendor keeps nothing after the request. A prototype may say `"undeclared"` and receives a warning; public MVP fails on it (C18). `/privacy` and `/where-your-words-go` render retention from this field, so the prose cannot drift from the manifest. The example below says `"undeclared"` because only the operator's vendor agreement can support a number.
- At public MVP, `legal.privacy_source` and `legal.terms_source` name repository source files, and `legal.ratified_by` and `legal.ratified_at` record their human ratification. The generated `/privacy` and `/terms` routes render exactly those sources plus the manifest-derived data-flow and retention tables. A prototype may omit all four fields and receives a warning.
- `app.origins` names the `production` origin and the `staging` alias as separate keys, not as an ordered list; `register` registers only the one that matches its environment (section 2.4a).

A minimal contract looks like the example below. It uses a V’Eric-shaped app only as an illustration; it does not choose the second app (section 5).

```json
{
  "$schema": "./vendor/soma/soma-app-v1.schema.json",
  "schema_version": "soma.app/1",
  "app": {
    "id": "veric-coaching",
    "name": "V'Eric Coaching",
    "tier": "prototype",
    "origins": {
      "production": "https://veric-coaching.netlify.app",
      "staging": "https://preview--veric-coaching.netlify.app"
    },
    "repository": "eldrgeek/veric-coaching"
  },
  "hosts": {
    "human": {
      "id": "eric",
      "name": "Eric",
      "role": "Human host",
      "escalation_url": "/contact",
      "expected_response": "Within two working days"
    },
    "ai": {
      "id": "veric",
      "name": "V'Eric",
      "role": "AI host",
      "persona": "personas/veric.md"
    }
  },
  "guide": {
    "ask": {
      "knowledge": ["knowledge/host-pair.md"],
      "page_context": false,
      "web": false
    },
    "voice": {
      "enabled": false
    }
  },
  "identity": {
    "subject": "pairwise",
    "admission": "open",
    "profile_fields": ["display_name", "locale"]
  },
  "concepts": [
    {
      "id": "soma:host-pair",
      "version": "1",
      "title": "Who hosts this app",
      "tell": "knowledge/host-pair.md",
      "show": "meet-the-hosts"
    }
  ],
  "questions": [
    {
      "id": "veric:coaching-goal",
      "schema_version": "1",
      "portable": false
    }
  ],
  "actions": [
    {
      "id": "coaching.inspect-agenda",
      "version": "1",
      "kind": "observe",
      "required_scopes": ["agenda:read"],
      "required_role": "member",
      "surfaces": ["ui", "guide", "remote"],
      "input_schema": "schemas/inspect-agenda.input.json",
      "output_schema": "schemas/inspect-agenda.output.json",
      "executor": { "kind": "rpc", "name": "inspect_agenda" },
      "effects": []
    },
    {
      "id": "coaching.save-reflection",
      "version": "1",
      "kind": "effect",
      "risk": "reversible",
      "effect_target": "database",
      "required_scopes": ["reflection:write"],
      "required_role": "member",
      "surfaces": ["ui", "guide", "remote"],
      "input_schema": "schemas/save-reflection.input.json",
      "output_schema": "schemas/reflection.output.json",
      "executor": { "kind": "rpc", "name": "save_reflection" },
      "effects": ["Creates a private reflection"]
    }
  ],
  "workflows": [
    {
      "id": "meet-the-hosts",
      "steps": [
        {
          "target": "[data-soma=human-host]",
          "text": "Eric is the human host."
        },
        {
          "target": "[data-soma=ai-host]",
          "text": "V'Eric is the AI host."
        }
      ]
    }
  ],
  "ai_visitors": {
    "enabled": true,
    "default_grant_minutes": 60,
    "maximum_standing_risk": "reversible",
    "stranger_test_action": "coaching.inspect-agenda"
  },
  "promises": [
    {
      "id": "identity.no-name-before-consent",
      "text": "This app will not receive your name until you choose to continue.",
      "check": "identity/no-name-before-consent"
    },
    {
      "id": "actions.no-silent-success",
      "text": "Every action will show a result or failure.",
      "check": "actions/receipt-required"
    }
  ],
  "data_flows": [
    {
      "vendor": "Anthropic",
      "what": "Questions typed to the Guide's Ask",
      "why": "Answer from the app's declared knowledge",
      "retention_days": "undeclared"
    },
    {
      "vendor": "Anthropic",
      "what": "Messages sent to V'Eric",
      "why": "Generate the AI host's reply",
      "retention_days": "undeclared"
    }
  ],
  "data_stores": [
    {
      "id": "app-database",
      "owner": "veric-coaching",
      "kind": "database",
      "data_classes": ["answers", "reflections", "receipts"],
      "export": "vendor/soma/handlers/export-app-schema",
      "erase": "vendor/soma/handlers/erase-app-schema",
      "retention": "Until the person leaves the app",
      "lawful_exception": false
    }
  ],
  "legal": {
    "operator": "Mike-ratified entity",
    "privacy": "/privacy",
    "terms": "/terms",
    "data_export": "/settings/export",
    "account_erasure": "/settings/delete",
    "agent_revocation": "/settings/agents"
  },
  "credits": {
    "page": "/credits",
    "require_artifact_byline": true
  },
  "dependencies": {
    "identity_broker": {
      "required": true,
      "fallback": "public-pages-and-knowledge-search"
    },
    "guide_cdn": {
      "required": false,
      "fallback": "/help"
    }
  }
}
```

### 3.2 What the app gets

A conforming app receives:

- Shared sign-in and offered cross-app recognition.
- Pairwise app identity and an origin-scoped boolean known-device marker.
- Versioned concept state, shareable answers, and resume state.
- A named host pair and human escalation route.
- Ask, Show, and Do over one typed action registry.
- Server-enforced risk gates, idempotency, receipts, and undo.
- Outside-AI discovery, pairing, grants, and revocation.
- Single-use and reusable invitation flows.
- The feedback chip, per-app queue, transactional estate event, and returned dispositions.
- Admin and participant changelog views.
- Error capture and dependency fallbacks.
- Usage metering and optional billing hooks.
- Privacy, terms, data-flow, export, erasure, revocation, and credits routes.
- React and static-site adapters.
- Local and live conformance tests.
- A version and proof beacon.

### 3.3 Conformance command

`soma-platform/packages/soma-conformance/` holds `bin/soma-conform.mjs`, `checks/`, and five journeys under `journeys/`: `anonymous-visitor`, `known-person`, `outside-ai`, `revoked-agent`, and `degraded-mode` (each a `.spec.ts`).

Run locally:

```bash
cd ~/Projects/soma-platform
node packages/soma-conformance/bin/soma-conform.mjs \
  --contract /path/to/app/soma-app.json \
  --repo /path/to/app \
  --tier prototype
```

Run against the app's registered staging alias:

```bash
cd ~/Projects/soma-platform
node packages/soma-conformance/bin/soma-conform.mjs \
  --contract /path/to/app/soma-app.json \
  --repo /path/to/app \
  --url "https://preview--<site>.netlify.app" \
  --expect-sha "<candidate commit SHA>" \
  --environment staging \
  --tier prototype \
  --journeys
```

A live run tests exactly the candidate commit, never whatever happens to be deployed. Per-pull-request deploy previews are useful for visual review, but they never carry SOMA credentials and never count as conformance evidence. How the runner holds the alias: Appendix A, M1.

The gate must check:

| ID | Check |
|---|---|
| C1 | The manifest passes JSON Schema validation. |
| C2 | Both hosts, their roles, human escalation, and the human host's expected response time are declared and rendered. A contact message sent through the escalation route creates the app record, estate event, and notification job; the staging notifier delivers it to a steward-controlled test mailbox. |
| C3 | Every concept and question has an ID and version. Every concept and question is in `soma:` or the app's own namespace; every declared `soma:` ID and definition hash matches the platform registry. |
| C4 | Every action has schemas, scopes, kind, effects, and the executor its kind requires, and every executor matches an applied RPC or a declared provider. Effect actions declare risk and effect target. Every external-effect action declares a timeout and a recovery rule, and every irreversible action declares a cool-off. A database-effect action never leaves a receipt in `running` after its RPC returns. |
| C5 | Every `effect` action has a UI binding or a reviewed `ui_exception`. An exception is allowed only for `reversible` actions whose receipts offer undo in the UI. |
| C6 | Consequential and irreversible actions cannot bypass confirmation. Approval and execution advance one receipt state machine; changed inputs, effects, authorization, or resource versions invalidate approval. An irreversible action requires a distinct final confirmation after its cool-off, and neither a timer nor a receipt poll can execute it. |
| C7 | Repeated idempotency keys do not create another intent or repeat effects, and a reused key with a different request fingerprint fails. The same key used by a second actor of the same principal neither conflicts with nor returns the first actor's result, and a replay after the authorization is revoked returns no stored result. Every `reversible` action implements `undo`, and the check proves an execute–undo round trip. |
| C8 | A paired AI cannot exceed its app, scope, expiry, or risk ceiling. |
| C8a | The in-app AI host cannot read private data or execute an effect from model output, page context, retrieved text, or an old gesture. A private observe requires a fresh Look authorization and a reversible effect a fresh Do authorization, each bound to the exact prepared request; asynchronous authority requires a normal named grant. |
| C9 | Revoke a grant after minting an access token, then prove that the already-minted token fails its next private read and effect request. |
| C10 | After every Golden Journey, the app origin's `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, and every cookie readable by JavaScript contain only the required boolean device marker and the declared UI-preference keys. None contains a random identifier, PII, user ID, question text, URL query, token, or credential. |
| C11 | An unvisited app cannot learn or display the person’s name before consent. |
| C11a | A private answer exists only in its source app's schema. Sharing copies only the approved projection into `soma.shared_answers`; revocation removes that projection, and another app cannot recover the source value. A share request carrying only the app's session and CSRF token, with no identity-origin approval, writes nothing. |
| C11b | One test person and one test AI use two fixture apps. No value the two apps receive is equal across them: person ID, actor ID, agent ID, grant handle, token `sub`, receipt ID, or any source-app field. `email` is absent unless the manifest declares `email_reason` and the person consented. |
| C11c | In an `invitation` app, a person who signs in without a ticket holds only the `visitor` role and cannot run a `member` action. A role raise without an `owner` is refused. A build that changes `admission` fails `sync-contract`. |
| C12 | A browser or agent token cannot access the Supabase Data API directly. A stolen app installation credential cannot invoke another app's RPC, a non-registered RPC, the `soma` schema directly, `sync-contract`, or any legacy `public` table or function, and cannot present a contract hash that belongs to another app, is retired, is below an enforced security floor, or is bound to a withdrawn policy. A release credential cannot change the privileged contract projection, bind a release to an unapproved policy version, or advance a contract that carries an unapplied migration. `soma_estate` cannot read an app schema, a `public` table, or any other `soma` table. `soma_notify` can execute only the notification claim and settle functions, and neither `soma-notify` secret exists in `soma-id` or any app site. Cross-person and cross-app broker probes fail. |
| C12a | Every callable `SECURITY DEFINER` function is owned by the app's non-table-owning runtime role, every app table forces RLS, and request context comes from the platform wrapper. In a pairwise app, probes fail that pass another app's or person's identifier as an argument, call `set_config` to forge context, or invoke the function as the runtime role outside the wrapper. In a legacy-global app, the compatibility `request.jwt.claims` setting from section 2.3a may influence only that app's RPCs and cannot forge `soma_ctx`, cross into another app, or authorize a broker operation. |
| C12b | The app's `.env.example`, `netlify.toml`, Function source, and built browser bundle reference no environment credential outside this allowlist: `SOMA_BROKER_URL`, `SOMA_APP_INSTALLATION_KEY`, `SOMA_APP_INSTALLATION_KEY_NEXT`, `SOMA_APP_RELEASE_KEY`, and provider keys named by declared data flows. `.env.example` contains placeholders only. Standard non-secret Netlify build metadata such as `CONTEXT`, `BRANCH`, and `COMMIT_REF` may be referenced but never copied into a credential slot. `SOMA_APP_RELEASE_KEY` may be referenced only by the build-time sync script. The check reads each variable's scopes and contexts through the Netlify API and fails unless installation and provider keys are Functions-only and the release key is Builds-only. A separate canary build of the candidate commit runs in a context where `sync-contract` contacts no broker (section 2.4a). It sets a unique canary value for every allowlisted secret name and every secret name the source references, builds, and proves that no canary, Supabase project URL, or Supabase key appears in any browser asset or source map. The canary build never changes the `preview` branch's values, because a canary release or installation key would fail `sync-contract` and break the staging journeys. The live staging run also scans the deployed assets and source maps for the Supabase project URL and keys. |
| C13 | Vendored files, the pinned template commit, and every Guide asset match `soma-kit.lock.json`. Referenced source paths cannot escape the repository through absolute paths, traversal, symlinks, or replacement races. In kit mode every executable Guide asset loads through an integrity-checked script tag, and the Guide loads no runtime executable code. |
| C14 | Discovery, OpenAPI, runtime actions, executors, referenced schemas, and manifest actions agree. Changing an identity field, action schema, executor, data flow, promise text or check, legal source file, or any unclassified field produces a privileged policy diff. Contract tests also prove the common error envelope, the status mapping, `Retry-After`, the private `no-store` policy, bounded cursor pagination, and the absence of internal error details. |
| C15 | Feedback creates both the app record and a minimal `soma.estate_inbox` event in one transaction; an injected failure leaves neither row. Killing the importer after it takes a lease, and again after its board write, loses no event and creates no duplicate. A disposition update returns to the same app record. |
| C16 | User-visible actions end in success, failure, refusal, or pending approval. Every authenticated effect attempt that reaches preparation and every AI-performed observe action produces the required receipt; a person's own UI reads do not. Invalid, unauthenticated, and rate-limited traffic produces no receipt. Observe receipts retain no returned private content, and terminal receipt signatures verify. |
| C17 | Declared dependency failures expose the declared fallback. With the broker blocked, or the operator budget set to zero, Ask returns `degraded: true` with citations and the host route, and the provider receives no request. |
| C18 | Required routes exist. Public MVP also requires human-ratified legal source files and a numeric `retention_days` on every data flow, and the rendered legal and `/where-your-words-go` pages must match the accepted contract's legal source hashes and retention values exactly. |
| C18a | Public MVP: every declared data store participates in per-app and global export and erasure. A global job cannot be created without the identity-origin session and CSRF token, and a global erasure cannot be created without recent authentication. These all fail: cross-person file access, an unsafe filename, MIME confusion, an oversize upload, a permanent URL, an omitted erasure target, a request reported complete while a target failure is injected, a subject handle deleted before its target completes, an old person or agent handle reused after rejoin, and erased data returning after a restore. |
| C19 | Credits name human and AI contributors and record model or substrate when known. |
| C19a | When the Guide is enabled, `data_flows` declares the Ask inference provider, the voice provider when voice is enabled, page text when `page_context` is enabled, and the search provider when `web` is enabled. The Ask endpoint's knowledge contains every concept's `tell` file. A request that carries `context`, `app_id`, or instructions inside `page_context` cannot change the sources cited, the app charged, or the offers returned. Fixtures in which the model invents citation IDs or paths, or claims `grounded: true`, yield no grounded citation. The rendered UI never describes an answer as verified or guaranteed correct. |
| C20 | The live status endpoint reports the tested release SHA, contract hash, result, and timestamp. |
| C21 | Every Golden Journey page has no serious or critical axe-core violations at 1280 px and 375 px. Every Show step's target is reachable by keyboard, and the step's text is announced through an `aria-live` region. |
| C22 | Authorization rejects unknown, expired, replayed, and concurrently reused state, code, nonce, PKCE, issuer, audience, callback-origin, device-code, CSRF, and cross-origin values. Each broker rejects the other environment's origin, credential, code, and contract. A failed exchange creates no membership. A refresh retry of the immediately previous generation within 30 seconds returns the same successor; older or later reuse revokes the whole family. No raw bearer secret appears in a request URL, and no secret or bearer value appears in logs, analytics, errors, or evidence. |
| C23 | Public endpoints enforce body, rate, concurrency, timeout, and cost limits before provider calls. Untrusted content cannot select tools, scopes, principals, or risk levels. |
| C24 | The build output contains no path sourced from `netlify/functions/`, `supabase/`, `migrations/`, or `vendor/soma/` server code, and no `*.sql`, `.env*`, `package.json`, `CLAUDE.md`, or `AGENTS.md`. The check derives candidate URLs from the repository and deploy manifest, requests each one from the live origin, and expects 404. |

CI and branch-deploy journeys run against a separate staging Supabase project and staging broker built from the same migrations and configuration. Production secrets, sessions, people, and grants are unavailable to every non-production deploy context. Production has no conformance sign-in bypass. After production promotion, a narrow production smoke journey runs with a dedicated synthetic person through the ordinary sign-in method. The status endpoint distinguishes `staging_conformance` from `production_smoke`; a staging pass must never be displayed as a production pass. Test sign-in, the fixture app, cleanup, and the smoke journey: Appendix A, M1.

**Legacy exceptions.** A `legacy-global` app runs every check. An individual assertion it cannot pass until a named migration phase reports `declared_exception` with that phase and a target date, never `pass`; the rest of the check still runs. PlayMaker and Legends may declare exceptions only for the C12, C12a, and C12b assertions that require removal of their app-held shared secrets or retrofitting their legacy `public` tables and functions (until M11). Their own direct sign-in is a v1 design choice (section 2.3a), not migration debt. So the C22 assertions apply to their broker-mediated consent and agent paths, and their own sign-in needs no exception. An exception without a target date, or past its date, fails. The status endpoint and evidence bundle list every exception. A `pairwise` app may declare none.

Live conformance on PlayMaker needs a protected `preview` branch in Eric's repository. Question 2 in section 6 includes asking Eric for it.

Existing package checks remain runnable:

```bash
cd ~/Projects/soma-platform
npm --prefix packages/soma-signin test
npm --prefix packages/soma-tickets test
npm --prefix packages/soma-meter test
npm --prefix packages/soma-feedback test
npm --prefix packages/soma-onboard test
npm --prefix packages/soma-guide test
npm --prefix packages/soma-scaffolder test
node packages/soma-scaffolder/tools/standup-check.mjs
npm --prefix packages/soma-conformance test
```

## 4. Migration

### 4.1 Order of work

Each phase's implementation constraints are in Appendix A under the same milestone name.

| Phase | Work | Demonstration |
|---|---|---|
| M0: Freeze evidence | Record current package APIs. Generate a fixture from PlayMaker’s current action catalogue. Capture PlayMaker invitation, sign-in, feedback, and Agent API journeys, plus what an existing PlayMaker writer sees on a first visit to the fixture app. Generate the Legends Guide page list, count the unsafe `guide_seen` entries, record which outside AIs are fetch-only, and generate the live database isolation baseline. | The old journeys run before kit code changes. The fixture records the actual action and page counts rather than trusting prose counts. The outside-AI evidence names each AI and its available tool class. The database report accounts for every exposed schema, role grant, policy, trigger, view, and callable privileged function. |
| M1: Contract and conformance | Create `@soma/contracts` with the v1 schema, add Ajv validation, add `soma-scaffold migrate-spec` for v0 specs, add `soma-kit.lock.json`, and build C1–C5 and C13–C14. | A disposable generated app builds and fails when a host, action binding, or vendored file is altered. All three v0 examples convert to valid v1 manifests. |
| M2: Action foundation | Extract PlayMaker’s registry, catalogue validation, workflow validation, and mapping checks into `@soma/actions`. Add risk, scopes, idempotency, and receipt interfaces without changing PlayMaker. | Package fixtures remain behaviorally equivalent to the frozen PlayMaker fixtures. |
| M3: Identity foundation | Create the `soma` schema, RLS, broker boundary, app installation credentials, authorization-code flow, concept state, and answers. Backfill test accounts first. Remove every shared credential and every out-of-schema migration from the generator. | Two disposable origins complete the offered cross-app journey without exposing a global person ID. A freshly generated app's environment, `.env.example`, and bundled browser code contain no shared-project key, Supabase URL, or estate mailbox credential, and the C12b scope and canary checks pass. A freshly generated app's migrations apply through `soma-scaffold migrate` against staging, and a catalog diff taken before and after shows no change outside the app's two schemas. |
| M4: AI door | Generate discovery and OpenAPI from the manifest. Add device-code pairing, app grants, revocation, and C8–C9. | A stranger AI receives only the URL and completes an allowed inspection. A revoked token then fails. |
| M5: Consolidate plumbing | Expand `@soma/tickets`. Make `@soma/feedback` canonical. Add static adapters, versioned Guide assets, Guide kit mode (section 2.8), meter UI, and transactional estate-event delivery. | Package tests pass. A generated React app and generated static fixture use the same contracts. A Guide test proves that kit mode persists only the boolean device marker and declared UI preferences, captures no field values or URL queries, sends page context only when declared, and records `shown` only on workflow completion. |
| M5a: Fresh-app architecture gate | Run section 5 with the disposable `soma-kit-second-app-fixture` before either legacy migration begins. Fix kit defects and restart the timer until a run passes without editing the kit. | A fresh builder completes the local build, registered branch deploy, Golden Journey, and evidence bundle within the targets. A failure blocks M6–M9; it is not explained away as legacy-app complexity. |
| M6: Legends preview | First stop Legends serving its repository root (landed 2026-10-07; Appendix A, M6). Then generate `legends-membership-site/soma-app.json`. Vendor static identity and action adapters. Pin the Guide. Adapt its changelog and concept state behind flags. | C24 passes on the live site. Existing anonymous, member, admin, Guide, and degraded-CDN journeys pass on the branch deploy. |
| M7: PlayMaker manifest PR | Add the manifest, lock file, discovery documents, status endpoint, and conformance report without changing product behavior. | PlayMaker’s existing tests and live smoke checks remain green. |
| M8: PlayMaker action PRs | Replace internal registry imports with the vendored package. Generalize the existing `agent_command_requests` idempotency into receipts, in shadow mode. Move the agent seam from the legacy JWT secret to broker-issued agent tokens, with agent operations running as broker calls to `app_playmaker_api` RPCs under the legacy claims context (section 2.3a). | Existing UI and Agent API produce equivalent outcomes. Shadow receipts agree before cutover. Paired agents keep working through the alias routes. With the legacy secret removed from a staging copy of PlayMaker's environment, a paired agent still completes an inspection and an effect. |
| M9: PlayMaker identity and plumbing PRs | Register PlayMaker as a `legacy-global` app, whose Functions reach the broker with the person's Supabase session (section 2.3a). Adopt tickets, feedback, concept state, and changelog through separate flagged adapters. PlayMaker's own sign-in does not change. | Eric’s current workflow passes with each flag off and on. Each flag ships off; the release seat flips it only after recorded acceptance from Eric or Mike. A writer who has signed in once on the identity origin opens the fixture app with one tap. PlayMaker treats a `soma:` concept as already seen only after that writer consents on the identity origin. |
| M10: Chosen second-app acceptance | After the November product choice, run section 5 in the chosen product's repository. The run edits neither `soma-platform` nor `soma-app-template`. | Only the chosen product passing section 5 on its registered live Netlify branch deploy earns the claim that a second SOMA app stood up on the kit. |
| M11: Retire app-held shared secrets | Move PlayMaker's metering, agent ingress, and admin functions behind broker calls or PlayMaker-scoped `SECURITY DEFINER` functions. Do the same for Legends. Remove both apps' shared secret keys. Then revoke the legacy JWT secret and rotate the shared project to asymmetric signing keys (order: section 2.3a). | A scan of every SOMA Netlify site's environment finds no shared-project secret key outside the broker. PlayMaker's and Legends' journeys pass after the legacy secret is revoked. |

### 4.2 PlayMaker safeguards

- PlayMaker remains Eric’s repository.
- Every PlayMaker change arrives as a reviewable pull request.
- Database migrations stay additive until old and new readers have completed the compatibility window.
- Existing invitations remain redeemable until they expire.
- Existing paired agents remain valid during a published transition window.
- Existing action implementations are wrapped before they are rewritten.
- No migration renames PlayMaker concepts or changes its domain model.
- Every feature flag has a tested rollback path.

PlayMaker ships straight to production after `pr-merge-green`, gated on typecheck, build, and the full test suite (its default branch is `master`). A kit change that alters a screen lands behind a flag that defaults off. Eric or Mike supplies product acceptance; the release seat records that acceptance and performs the flag change. A deploy preview is used only where tests cannot cover the risk, and then with a test login that works only outside production, because saved passwords autofill only on the production domain.

PlayMaker's existing AI routes (`/api/agent/v1/*`, `/api/agent-pair-start`, `/api/agent-pair-poll`, `/api/agent-pair-approve`) keep working as aliases for at least 90 days after the `/api/soma/v1/*` routes ship. `public/llms.txt` lists both during that window.


### 4.3 Retirement rules

- `@soma/onboard` stops generating member tables after the ticket migration passes.
- Old auth copies retire after the Legends static journey passes in production.
- Invitation standards folders archive only after their behavior is represented in tests and their paths point to `@soma/tickets`.

`public.soma_profiles` remains unchanged until every caller is inventoried. If it becomes a compatibility view, it uses `security_invoker = true`, exposes only the legacy fields required by named legacy consumers, and is granted only to those consumers. Pairwise apps receive no access to it.

The concept-state backfill from `guide_seen` copies only string entries that match a declared workflow. A one-time cleanup removes the non-string entries, which can contain names and email addresses, before any compatibility view exposes the column.

Dropping a table, column, credential, or compatibility view requires separate approval and a restore proof.

## 5. The second-app test

The second app is chosen in November 2026 from evidence; the candidates are V’Eric coaching and OLLI, and both are parked until then (`_estate/LEAD.md`). The kit's test must not quietly make that choice.

The immediate rehearsal therefore uses a disposable repository named `soma-kit-second-app-fixture`. Its domain is a small coaching-shaped workflow, because that exercises hosts, private answers, Show, and actions. It uses fixture hosts and a steward-controlled test mailbox. It creates no V’Eric product repository, customer promise, or production surface.

After the November product choice, the same test runs again in the chosen product's repository. The fixture rehearsal does not count as the second app.

The timer begins when an approved `soma-app.json` and an empty or existing target repository are handed to one Cursor or Codex builder. No Netlify site, `preview` branch, broker registration, app schema, or app credential may exist beforehand. The builder never holds platform credentials; `kit-steward` runs `register` and `migrate` when the builder asks, and that time counts. Product discovery and approval of the manifest happen before the timer starts.

The manifest must already contain:

- The app name and allowed preview origin.
- Both hosts and the human escalation path.
- A provider-neutral Ask endpoint grounded in the declared knowledge. If the app elects to enable voice, all voice-provider provisioning time counts inside the four hours.
- Three concepts, at least one of them a published `soma:` concept.
- The portable `soma:` question that `soma-fixture` shares, used by Golden Journey step 8.
- One Show workflow.
- One `observe` action.
- One `reversible` action.
- One `consequential` action.
- One outside-AI test task.
- One app promise.
- Data-flow declarations.
- Legal-content owners.

### Time targets

| Milestone | Target |
|---|---|
| Scaffold, install, typecheck, and local production build | 15 minutes |
| Create the Netlify site, register with the staging broker, and complete a live branch deploy on `https://preview--<site>.netlify.app` | 30 minutes |
| Complete Golden Journey and evidence bundle | Four working hours |

A run that requires an edit to `soma-platform` or `soma-app-template` fails. The defect is fixed in the kit, and the timed run then restarts.

### Golden Journey

The test must demonstrate:

1. An unknown visitor sees both named hosts, the human handoff, and the expected human response time. A message sent through the handoff reaches the human host's registered channel, the visitor sees that it was received, the host replies through `soma.contact.reply`, and the visitor can read the reply from the issued thread link.
2. The visitor signs in and receives one app membership.
3. A person already known to another SOMA app sees the same neutral offer a stranger sees. One tap on the identity origin then recognizes them without re-entering credentials.
4. The new app does not receive or display the person’s name before acceptance.
5. The accepted person is greeted by name and told that it came from their SOMA identity, without naming another app.
6. A previously understood SOMA concept is not re-taught.
7. A private answer from another app is not visible.
8. An explicitly shared compatible answer prevents a repeated question.
9. Ask returns an answer grounded in declared knowledge, with citations. A question the knowledge does not cover returns `grounded: false` and the human host's route.
10. Show highlights the controls for the declared workflow.
11. Do performs a reversible action and returns an undoable receipt.
12. A consequential action stops for fresh confirmation. When an outside AI requests it, the AI receives an `approval_url`, and the action runs only after the person approves.
13. An outside AI with an HTTP tool discovers the app from its URL without vendor-specific instructions. The evidence names the AI and its tool.
13a. A chat AI that can only fetch pages explains the app correctly from `/llms.txt` and tells the person how to connect an AI that can act.
14. The AI pairs without a copied secret.
15. The AI performs one permitted inspection and one permitted reversible action.
16. The same AI is denied an undeclared scope.
17. Revoking the grant blocks its next request.
18. Feedback creates a per-app record and a minimal estate event. A simulated estate disposition returns to the same record, and the person can see its status and demonstration without seeing private operator notes.
19. Context export produces readable Markdown and complete machine-readable JSON.
20. Disabling the Guide exposes the declared help fallback.
21. The status endpoint reports the tested release and passing journey.
22. The evidence bundle contains the live URL, release SHA, contract hash, conformance output, screenshots, and receipts.

## 6. Product questions for Mike

1. **Which domain should own SOMA identity?**  
   Recommendation: register a domain used only for SOMA identity and decide it before the first real person signs in, because sessions, saved passwords, and passkeys bind to that origin and moving it later forces everyone to sign in again. Do not use `id.mike-wolf.com`: even with the `__Host-`, exact-Origin, CSRF, and Fetch Metadata controls in section 2.3b (Appendix A, M3), it would share a site boundary with every other `*.mike-wolf.com` property. A dedicated domain removes that unnecessary coupling. Until the domain exists, the staging broker runs on a Netlify subdomain with test accounts only. `netlify.app` is on the Public Suffix List, so each Netlify site is its own site, and the two-week release needs no DNS change. Buying the domain is the only step that needs Mike.

2. **What acceptance promise should the team make Eric for the PlayMaker kit sequence?**
   Recommendation: Mike asks Eric once to approve the M7–M9 sequence, to allow a protected `preview` branch that only the release seat and conformance runner update, and to name which screen changes require his personal acceptance. The release seat prepares, merges, flips, verifies, and rolls back flags. If required acceptance has not arrived, the flag remains off; silence is not approval.

3. **What standing authority may a person grant to their own AI?**  
   Recommendation: default to named read scopes and reversible writes for 60 minutes. Require fresh human approval for consequential or irreversible actions.

4. **Which entity and retention promise appear in the standard legal pages?**  
   Recommendation: name the SOMA operating entity Mike filed, with any app-specific partner named where required. Retain raw AI-host conversations for 30 days, feedback until disposition plus 90 days, and action receipts for one year unless law or payment records require longer.

## 7. Assumptions to test with a person

| Assumption | Cheap test without code | Pass condition |
|---|---|---|
| Offered recognition feels helpful rather than invasive. | Show five people paper versions of silent greeting, named offer, and neutral offer. | At least four prefer the neutral offer and understand what acceptance reveals. |
| Ask, Show, and Do are distinct and understandable. | Give five people three task cards and ask what response they expect from each verb. | At least four distinguish explanation, demonstration, and execution. |
| People can judge an AI grant. | Show a paper grant with app, scopes, expiry, risk ceiling, and revoke control. | The person can state what the AI can do, where, for how long, and how to stop it. |
| Pairing once but granting per app feels coherent. | Walk five AI users through two app-entry scenarios. | At least four understand why their AI is recognized but not automatically authorized. |
| Single-use and reusable invitations need different disclosure. | Show matched message mockups with a single-use and a reusable link. | Recipients correctly identify who may use each link and what the inviter will learn. |
| Compact receipts increase trust. | Show receipts for success, refusal, failure, and undoable action. | The person can identify the outcome and next step in one glance. |
| The host pair clarifies responsibility. | Show the host card and ask who handles product judgment, app help, and escalation. | At least four of five assign each responsibility correctly. |
| Concept IDs can safely prevent repeated teaching. | Ask two hosts to classify ten concepts as equivalent, revised, or app-specific. | Disagreements produce separate IDs or new versions before implementation. |
| People value portable context export. | Show a sample Markdown export and ask what they would remove, add, or hand to their own AI. | Most participants identify at least one realistic use and no unexpected private field. |
| Outside AIs can use the neutral contract within their tool limits. | Give participants a static discovery fixture and ask them to hand only its URL to a fetch-only chat AI and to an AI with an HTTP or code tool. | The fetch-only AI explains the app and the acting requirement; the tool-capable AI independently finds the pairing instructions and prepares a valid inspection request. |
| The named human host will keep the stated response time. | When the second app is chosen, ask its human host to approve the response-time wording in its manifest. Then send three agreed test messages over one week through the channel the kit would use. | The host approves the wording, and all three replies arrive within the stated time. Otherwise the stated time changes before launch. |

## 8. Risks and what to cut for a two-week ship

### 8.1 Principal risks

| Risk | Control |
|---|---|
| The kit becomes every SOMA idea at once. | Hold the core to identity, hosts, concept state, Ask/Show/Do, consent, AI access, feedback, receipts, and conformance. |
| One shared Supabase project becomes an estate-wide breach boundary. | New apps never hold a shared secret. PlayMaker and Legends get separately revocable keys in week one, lose them in M11, and until then the evidence says isolation covers new apps only (section 2.3a). Test cross-app and cross-person isolation. |
| Cross-app recognition feels like surveillance. | Keep PII out of the device marker. Require consent on the first visit to another app. Provide describe, export, and forget controls. |
| The broker becomes a single point of failure. | Fail closed and degrade as section 2.3 describes. Detect outages with the external monitor and contain incidents with the broker's controls (section 2.9). Test broker failure in the live journey. Never fall back to in-app Supabase Auth sign-in for a pairwise app. |
| Shared control-plane data is lost, corrupted, or restored with stale credentials. | Define RPO/RTO, keep an independent encrypted backup, rotate credentials after restore, and pass a restore rehearsal before production launch (section 2.9). |
| An outside AI receives excessive authority. | Require app scope, named scopes, expiry, risk ceiling, idempotency, receipts, and fresh approval for consequential acts. |
| A manifest claims enforcement that runtime code does not perform. | Generate OpenAPI from the registered runtime actions and compare it with the manifest during conformance. |
| Vendored code drifts. | Hash every vendored file and report drift through the beacon. |
| A Guide release breaks every site. | Pin immutable versions and SRI hashes. Test a real consumer before promotion. |
| Shared concept IDs suppress teaching that was actually needed. | Version concepts and require hosts to review cross-app equivalence. |
| Feedback disappears during forwarding. | Keep the app record canonical and write it with its estate event in one transaction, then deliver through a leased outbox (section 2.4). C15 injects failures to prove neither row survives alone and that an importer crash loses nothing. |
| Legal templates create false confidence. | Require ratified operator, retention, and data-flow content before public MVP. |
| PlayMaker migration disrupts Eric’s work. | Use small PRs, feature flags that ship off, shadow writes, existing tests, and the established direct-to-production gate (section 4.2). |
| “Done” becomes a checklist claim. | Require the live Golden Journey and evidence bundle. |

### 8.2 Two-week release: the secure vertical slice

The two-week outcome is one generated React reference app and one generated static fixture running against staging. Both complete the same identity, Ask/Show/Do, outside-AI, feedback, and revocation journey. The kit release itself changes no production system and no legacy-app code.

It must include:

- The `soma.app/1` JSON Schema, strict validation, canonical contract hash, and `soma-kit.lock.json`.
- The live database isolation baseline and the same-origin Function/broker boundary from section 2.3.
- A staging Supabase project and a staging identity broker with offered recognition, random pairwise IDs, exact redirect registration, and hardened session handling.
- `soma-scaffold register` and `soma-scaffold migrate`, plus the vendored `sync-contract.mjs` build step, run against staging.
- A provider-neutral Ask endpoint grounded only in declared knowledge.
- One keyboard-accessible Show workflow using stable `data-soma` targets, served from an immutable versioned Guide path in kit mode. The Guide's root channel is not changed.
- The typed action registry with one `observe`, one genuinely reversible, and one consequential action.
- The server-owned approval/idempotency state machine and receipts.
- Outside-AI discovery, device pairing, app-scoped grants, online authorization, and next-request revocation.
- One manually witnessed outside-AI journey that names the AI and its tool.
- Minimal registered concept state and one explicitly shareable typed answer.
- Canonical feedback submission, minimal estate event delivery, and a simulated disposition returned to the app.
- React and static fixtures generated from the same manifest.
- Conformance for C1–C17 (including C12a and C12b), C19a, and C20–C24, including adversarial isolation, CSRF, revocation, prompt-injection, broker-outage, and failure-injection cases. Only C18, C18a, and C19 wait for later work.
- A redacted evidence bundle and a timed rehearsal with the disposable second-app fixture against staging. The rehearsal does not pre-empt the November second-app decision.

Separately from the kit release, the release seat performs two week-one interim controls on the legacy apps: the separate revocable secret keys for PlayMaker and Legends (section 2.3a), and Legends' publish-directory fix from M6, which landed on 2026-10-07. Both are configuration changes, not product changes, and each reduces a live exposure that the slice does not otherwise touch.

It explicitly excludes:

- Production identity or database rollout.
- PlayMaker or Legends migrations, pull requests, or feature flags.
- Invitation consolidation.
- Changelog migration.
- Production Guide CDN promotion of the root channel.
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
| 1–2 | Contract, lock file, and fixtures | Staging project, database catalog audit, and broker boundary | Threat model, adversarial cases, and conformance skeleton |
| 3–6 | React/static generation and stable Show bindings | Identity, sessions, pairwise IDs, and concept state | Action registry, approval state machine, receipts, and undo |
| 7–10 | Provider-neutral Ask, versioned Guide path, and feedback round trip | AI pairing, grants, online authorization, and revocation | Isolation, CSRF, abuse, prompt-injection, and accessibility tests |
| 11–12 | `register`, `migrate`, `sync-contract`, the staging fixture app, and integrated staging deploy | Golden Journeys and failure injection | Evidence tooling and independent security review |
| 13 | Timed second-app rehearsal | Fix only rehearsal blockers | Re-run the adversarial suite |
| 14 | Final staging demonstration | Evidence publication | Scope and production-readiness report |

Cursor and Codex build from self-contained beads. Claude reviews and merges bounded work.

A missed schedule moves an unfinished capability out of the two-week release. It never weakens the isolation, consent, authorization, revocation, or test boundary to preserve the date. Every check that covers a moved capability reports `not_implemented`, never `pass`, and keeps the public-MVP tier red; the scope report names each one.

The release is complete only when both fixtures pass the same live staging conformance command, every moved capability's checks visibly report `not_implemented`, and a fresh builder completes the timed rehearsal without editing `soma-platform` or `soma-app-template`.

_Merge notes (which source plan each idea came from) moved to [`plans/merge-notes-r1.md`](plans/merge-notes-r1.md)._

## Appendix A — Implementation constraints by milestone

The detail a builder needs for one milestone. Every item is a requirement. The body keeps each decision and its reason; the bracket names the body section an item moved from.

### M0: Freeze evidence

- **Legends Guide inventory** [4.1]. Generate the list of every Legends page that loads the Guide and every shared Guide data or configuration file. On 2026-10-07 that is 33 HTML pages plus `js/legends-guide-config.js` and `js/legends-knowledge.js`, not the 22 pages in the inventory.
- **Unsafe `guide_seen` entries** [4.1]. Count the `public.soma_profiles.guide_seen` entries that are not plain walkthrough-ID strings, without exporting their values. Section 4.3 says how they are cleaned up.
- **Outside-AI classes** [2.7]. Record which current outside AIs are fetch-only and which have an HTTP or code tool.
- **Database isolation baseline** [2.4a]. Before the first registration in an environment, the steward captures and reviews the live database catalog: exposed schemas, roles and memberships, grants, RLS state, policies, views, triggers on `auth.users`, callable functions, `SECURITY DEFINER` ownership and `search_path`, publications, storage policies, and installed extensions. The generated report becomes the isolation baseline and is rerun after every platform migration.

### M1: Contract and conformance

- **Schema dispatch** [3.1]. A document with `"schema_version": "soma.app/1"` validates against `soma-app-v1.schema.json` with Ajv (draft 2020-12). Ajv becomes a scaffolder and conformance development dependency; it is never vendored into apps.
- **v0 converter** [3.1]. `soma-scaffold migrate-spec <v0.json> > soma-app.json` emits a v1 manifest and prints every v0 field it could not map. The three existing examples (`examples/legends.soma.json`, `legends-billing.soma.json`, `soma-forge.soma.json`) are its test fixtures. It reports the v0 `identity_project` field as unmapped rather than translating it into the v1 `identity` object.
- **Source paths** [3.1]. A source path is a normalized, repository-relative POSIX path with no leading slash, no `..` segment, no URL scheme, no control character, and no empty segment. The resolver rejects symlinks, non-regular files, any file whose `realpath` lies outside the repository, and files above the declared size limit. It reads each file once and hashes the bytes it actually compiles or copies, so a file replaced between hashing and use cannot slip through (C13).
- **Template provenance** [2.8]. The scaffolder refuses to generate from a template checkout that has uncommitted or untracked files, or whose commit is not on the template repository's default branch, and records that commit in the lock. Each kit release names the template commit it was tested with.
- **Lock file shape** [2.8]:

```json
{
  "kit_version": "1.0.0",
  "source_commit": "<soma-platform-sha>",
  "template": {
    "repository": "eldrgeek/soma-app-template",
    "commit": "<soma-app-template-sha>"
  },
  "contract_sha256": "<canonical-contract-hash>",
  "guide": {
    "version": "1.0.0",
    "assets": [
      {
        "url": "https://soma-guide.netlify.app/v1.0.0/soma-guide.js",
        "integrity": "sha384-..."
      },
      {
        "url": "https://soma-guide.netlify.app/v1.0.0/soma-guide.css",
        "integrity": "sha384-..."
      }
    ]
  },
  "packages": {
    "@soma/signin": {
      "version": "1.0.0",
      "sha256": "..."
    },
    "@soma/actions": {
      "version": "1.0.0",
      "sha256": "..."
    }
  }
}
```

- **Holding the staging alias** [3.3]. The runner pushes the candidate commit to the app's `preview` branch. It then waits until `/api/soma/v1/status` on the alias reports that commit's SHA, and only then runs the journeys. Only one run per app holds the alias at a time; a second run waits for the first.
- **Staging test sign-in** [3.3]. The staging broker exposes a test sign-in only for staging test people and only to the conformance runner. Automated staging journeys never wait for a magic-link email.
- **Fixture app** [3.3]. A permanently registered staging fixture app, `soma-fixture`, gives each test person a prior membership, so the known-person journey always has an “other SOMA app.”
- **Evidence and cleanup** [3.3]. Each run first writes a redacted evidence bundle, then deletes or expires its staging memberships, grants, answers, and receipts. Cleanup is idempotent and is itself checked.
- **Production smoke** [3.3]. The smoke journey uses a dedicated synthetic person (`soma.people.is_test = true`). That person signs in through the ordinary production sign-in method, with the one-time code delivered to a steward-controlled mailbox the runner reads. The journey performs public discovery, sign-in, one private read, one reversible action followed immediately by undo, revocation, and status verification. It cannot exercise irreversible actions or destructive erasure. Metrics and the estate board exclude the synthetic person.
- **Latency** [2.3]. Live conformance records p50 and p95 latency for `/me`, a private `observe` action, and a reversible `execute` on the staging alias. The evidence bundle reports them against an initial observational target of p95 under 800 ms for a warm `/me`. Latency does not fail the run until measurements support a ratified budget.

### M2: Action foundation

- **Preparation** [2.4]. Preparation authenticates the principal and the actor, validates the actor's current grant or one-request authorization, applies admission limits, validates and canonicalizes the input, computes the keyed request fingerprint, records the current resource version, calculates the effective risk and effects, and inserts the idempotency row.
- **Fingerprint** [2.4]. `request_fingerprint` is a keyed digest of the action ID, action version, canonical input, principal, actor ID, grant reference or one-request authorization ID, authorization version, and target resource. The broker computes it with a per-app fingerprint key.
- **Signing** [2.4]. When a receipt settles, the broker signs the immutable receipt envelope and payload hash with its receipt-signing key, recording `signing_key_id` and `signature`.
- **Repeated keys** [2.4]:
  - A repeated key with the same `request_fingerprint` returns the current receipt state and the stored result, if any, only to the same authenticated actor under the same still-live authorization, without creating another intent or repeating the effect.
  - A repeated key while the row is `running` returns HTTP 409 with `code: "idempotency_pending"` and `Retry-After`.
  - A repeated key with a different `request_fingerprint` returns HTTP 422 with `code: "idempotency_conflict"`.
  - Approval advances the same row; it does not create a second request. A consequential confirmation moves it from `approval_required` to `approved`. For an irreversible action, the first confirmation records `cool_off_started_at` without making the row executable, and the valid final confirmation after the cool-off moves it to `approved` and claims it in the same request.
- **Claiming an approved row** [2.4]. The app server atomically claims an approved row, revalidates authorization and the resource version, and executes it inside the person's confirming request. For an `irreversible` action, only the distinct final confirmation after the cool-off may claim and execute the row (section 2.6).
- **Reconciliation** [2.4]. A `running` row older than the action's declared timeout is reconciled using the action's recovery rule. It may be retried only after the system proves the effect did not occur. External effects require a provider idempotency key or an outbox plus reconciliation.

### M3: Identity foundation

**Authorization transaction** [2.2]

- The app starts authorization through a same-origin Function that creates `state`, `nonce`, and a PKCE verifier using a cryptographic random source.
- The broker records the transaction in `soma.oauth_transactions` with keyed hashes of `state` and `nonce` and the PKCE challenge. That record expires within ten minutes and is consumed once.
- The verifier never leaves the app. The Function keeps it in a short-lived `__Host-` `HttpOnly` cookie bound to the transaction and presents it at exchange.
- The callback rejects an unknown or reused state, verifier mismatch, issuer mismatch, audience mismatch, nonce mismatch, non-HTTPS redirect, or redirect URI that is not an exact registered value.
- `return_to` must be a same-origin path that begins with exactly one `/`; any other value becomes `/`. The callback answers with a 303 to a URL that carries no `code` or `state`, so no page script runs while those values are in the address bar.
- `GET /api/soma/v1/me` returns the session's CSRF token, and the vendored client sends it as `X-CSRF-Token` on every unsafe request.
- Session cookies use the `__Host-` prefix, `Path=/`, no `Domain`, `Secure`, `HttpOnly`, and `SameSite=Lax`.

**Broker database access** [2.3b]

- Broker Functions reach Postgres with the `pg` driver through the Supavisor pooler in transaction mode, with prepared statements disabled.
- `soma_broker` holds the `soma` grants it needs, nothing in `public` except the named legacy RPCs it wraps, and `EXECUTE` on the one platform-owned invocation wrapper.
- `app_<app_id>_runtime` has no `BYPASSRLS` and receives only the table privileges each function requires.
- The request-context store behind the `soma_ctx` accessors is a platform-owned table keyed by the current transaction ID, on which neither app role holds any privilege.
- Every broker transaction sets `statement_timeout` to 5 seconds.
- `soma_estate` is a login role with no `BYPASSRLS`. It holds `SELECT` and `UPDATE` of the lease and delivery columns (`attempts`, `next_attempt_at`, `lease_owner`, `lease_expires_at`, `delivered_at`, `external_ref`, `last_error_code`) on `soma.estate_inbox`, `INSERT` and `UPDATE` on `soma.estate_dispositions`, `SELECT` on `soma.apps`, and nothing else. Forced-RLS policies allow only those lease, acknowledgement, and disposition operations; table privileges alone do not bypass RLS. The C12 probes include `soma_estate` and prove it cannot read any app schema, `public` table, or other `soma` table.

**Fixture cross-app state** [2.5, 5]. M3 publishes `soma:host-pair` and one portable `soma:` question. The permanently registered `soma-fixture` app declares both, records the concept as understood for each Golden Journey test person, and shares that person's compatible answer to the question. A timed app can therefore prove suppression and answer reuse without an unplanned steward action during the run.

**Broker secrets** [2.3b]. The `soma_broker` password, the agent-token signing key, the refresh-hash key, the receipt-signing key, and the master key from which per-app request-fingerprint keys are derived are the broker site's only secrets.

**Notification worker** [2.3b]. `soma-notify` holds only two secrets: the password of its database role, `soma_notify`, and a send-only mail-provider key. It holds no broker signing, installation, release, or database-owner credential. `soma_notify` has no `BYPASSRLS` and may execute only `soma.notification_claim()` and `soma.notification_settle()`. The claim function leases one queued row, resolves its one registered destination, and returns one rendered message, so the role cannot browse `auth.users`, app schemas, receipts, answers, or the rest of the `soma` schema. C12 proves both secrets are absent from `soma-id` and every app site, and that `soma_notify` can do nothing but claim and settle.

**Identity-origin hardening** [2.3b]

- The person signs in on the identity origin through Supabase Auth with server-side cookie storage. The Auth session never sits in `localStorage`, so browser JavaScript cannot read the session token.
- The identity origin serves no Guide, analytics, advertising, app-supplied script, or third-party JavaScript. It sends `Cache-Control: no-store`, `frame-ancestors 'none'`, a restrictive script and connection Content Security Policy, `Referrer-Policy: no-referrer`, and an allowlisted `form-action`.
- Its own cookies, including the Supabase Auth session cookies, use the `__Host-` prefix. Cookie-authenticated state changes require the exact allowed `Origin` and the session's CSRF token. When `Sec-Fetch-Site` is present, the origin also refuses any value other than `same-origin`. The token and device-code endpoints are exempt, because they accept only bearer or form credentials and never cookies.
- These controls prevent a sibling subdomain from exploiting same-site cookie delivery, while a dedicated identity domain (section 6, question 1) keeps that sibling-site boundary out of the design entirely.

**Registration: schemas and roles** [2.4a, step 2]. Hyphens in the validated app ID (section 3.1) become underscores (`veric-coaching` becomes `app_veric_coaching`). Before creating anything, registration fails loudly if any derived schema or role name already exists for another app. The platform, not either app role, owns both schemas. The migration runner may assume the owner role; deployed code never can. Registration also runs `ALTER DEFAULT PRIVILEGES FOR ROLE <app owner> REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.

**Registration: migration runner** [2.4a, step 3]

- The runner acquires a per-app advisory lock, verifies immutable migration checksums, and executes each migration transactionally as the app's owner role, constrained to that app's two schemas.
- It cannot create roles, extensions, event triggers, publications, cross-schema objects, or grants outside its schemas. Tables stay owned by the owner role. After each migration the runner transfers every function in `app_<app_id>_api` to the runtime role.
- History lives in `app_<app_id>.schema_migrations`. A changed checksum or partially applied migration fails loudly.
- Inside the same transaction, after each migration, the runner queries the catalog. It rolls the migration back if either schema now holds any of these: a privilege granted to `PUBLIC`, `anon`, or `authenticated`; a table without both `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`; a runtime role that owns a table or holds a DDL privilege; an API function that is not owned by the runtime role or lacks a `search_path` fixed to `pg_catalog` plus the app's own schema; a view without `security_invoker = true`; a materialized view or foreign table; or an object outside the app's two schemas.

**Registration: credentials** [2.4a, step 4]. No credential value appears in command output, shell history, generated files, or process arguments that another process could read.

- `SOMA_APP_INSTALLATION_KEY` and `SOMA_APP_INSTALLATION_KEY_NEXT` have the Netlify "Functions" scope only. Build code and browser code cannot read them. Both are always present, so either can rotate without downtime.
- `SOMA_APP_RELEASE_KEY` has the Netlify "Builds" scope only. Functions and browser code cannot read it.
- Server-side provider keys have the "Functions" scope only, unless the steward explicitly approves a separately named build credential. No provider secret is ever exposed to browser code, for example through a `VITE_` prefix.
- `SOMA_BROKER_URL` is not secret and may be available to both Builds and Functions.
- The `production` context receives only production values.
- The fixed `preview` branch receives only staging values, set on that branch's own context. The repository protects the branch so that only the conformance runner and the release seat can update it. Other branch deploys receive no SOMA credential.
- The `deploy-preview` context receives no SOMA credential. A per-pull-request build cannot complete sign-in, and it must not move any registry.

**Registration: site and origins** [2.4a, step 5]. `register` uses the Netlify and GitHub APIs idempotently. It creates the declared site when absent, links it to the app repository, enables branch deploys for `preview`, creates and protects the `preview` branch, and checks that the fixed alias serves before registering the staging origin. An existing site, repository link, owner, or origin that conflicts with the manifest fails loudly and is never overwritten. A setting the API cannot establish fails `register` with the missing setting named.

**First-owner claim** [2.2]. `soma-scaffold claim-first-owner --environment staging|production` is run by `kit-steward`. The claim expires within one hour. It cannot be issued once the app has an owner; recovering a lost owner is a separate, audited steward procedure. `ADMIN_EMAILS` is not in the C12b allowlist, so a generated app that still reads it fails conformance.

**`sync-contract` packaging** [2.4a]. The app's build command runs `node vendor/soma/bin/sync-contract.mjs soma-app.json` before the deploy publishes. The scaffolder vendors this script with `@soma/contracts`, including the RFC 8785 canonicalizer, and `soma-kit.lock.json` hashes it. Vendoring matters for two reasons: the app's Netlify build has no access to `soma-platform`, and the build must compute the contract hash with exactly the code the broker uses. The script authenticates with the app's release credential; the runtime installation credential cannot call it.

**Template cleanup** [4.1, M3 row]

- Remove `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` from `soma-app-template`, its functions, `soma-scaffolder/src/scaffold.mjs`, and `soma-scaffolder/src/provision.mjs`.
- Remove the `VITE_SUPABASE_*` values and the shared-project fallback in `src/lib/somaAuthConfig.ts`.
- Remove `CLAUDE_EMAIL_*` with `netlify/functions/lib/boardCard.ts`, whose job `soma.estate_inbox` takes over.
- Remove `ADMIN_EMAILS` from `.env.example`, `netlify/functions/lib/appAdmin.ts`, and `soma-scaffolder/src/scaffoldReactApp.mjs`; admin checks read the membership role through the broker.
- A generated app then receives only the credentials C12b allows, scoped as in “Registration: credentials” above.
- Delete the template migrations that act outside the app's schemas: `0001_profiles.sql`, whose `public.handle_new_user()` and `on_auth_user_created` trigger have the same names as PlayMaker's sign-up hook (`playmaker/supabase/migrations/0002_auth_bootstrap.sql`, `0014_narrow_handle_new_user.sql`), and `0002_delegations.sql`, `0003_agent_ingress.sql`, and `0006_agent_partners_rpc.sql`, which `soma.agent_partners` and `soma.agent_grants` replace.
- Rewrite `0004_feedback_and_build_queue.sql` and `0005_last_location.sql` to use unqualified names inside `app_<app_id>`, to key people by `app_person_id` with no reference to `auth.users`, and to read identity only through the `soma_ctx` accessors, because `auth.uid()` is null on the broker path.
- Replace the template UI and Function calls that depend on the deleted profile, delegation, ingress, and agent-partner RPCs with the vendored broker clients.
- Remove both scaffolder and provisioner instructions to run `sql/schema.sql` against the shared project.

### M4: AI door

- **Access-token claims** [2.2, 2.7]. The token carries `aud = "app:<app_id>"`, `sub = <app_agent_id>`, `grant_ref`, `grant_version`, `jti`, `scopes`, and `risk_ceiling`. It never carries the global `agent_id` or `grant_id`. The broker maps `grant_ref` back to `grant_id` inside the `invoke` transaction.
- **Refresh successor replay** [2.4, 2.7]. The broker derives each opaque refresh credential from the family, generation, and a key identifier under its refresh key, then stores only the keyed credential hash. It can therefore reproduce the current raw successor for a concurrent retry of the immediately previous generation without storing plaintext. Key rotation keeps the old derivation key only until every family using it expires or is revoked.
- **Online authorization** [2.7]. Signature, issuer, expiry, and audience validation establish token authenticity only. The app Function may use them to reject a bad token early, but it never authorizes on that basis. The broker checks `grant_id`, `grant_version`, scope, risk, principal, and action inside the same `invoke` call and database transaction that performs the read or effect. It reads the grant row with `FOR SHARE`, so a revocation either commits before the request and refuses it, or waits until the request finishes. An external-effect action is authorized this way at the call that claims its receipt.
- **Device-code rate limit** [2.7]. The unauthenticated device-code endpoint uses a database-backed rate limit per IP address and per app. PlayMaker's current in-memory, per-instance throttle (`playmaker/netlify/functions/agent-pair-start.ts`) does not hold across function instances.
- **User code** [2.7]. The identity origin never offers a `verification_uri_complete` link. The person must type the user code that their own AI displayed to them, and the screen says to continue only if they started this pairing themselves a moment ago.
- **Device-code limits** [2.4, 2.7]. A device code lives at most 10 minutes. Each one accepts at most five wrong user-code entries. User-code comparisons are constant-time; the attempt limit and expiry are enforced transactionally.

### M5: Consolidate plumbing

**Tickets v2** [1.2]

- `public.tickets` stays structurally unchanged apart from confining its existing functions to `p_app = 'playmaker'`. It is legacy storage and receives no v2 rows.
- `soma.tickets` and `soma.ticket_redemptions` (section 2.4) are reachable only through four platform-owned functions executable by `soma_broker`. Each takes the app from the `app_id` the broker derives from the installation credential. The broker computes the keyed token hash before calling the database, so the hashing key is never stored in Postgres.
  - `soma.ticket_create_v2` admits the inviter by `soma.memberships` role under that app's invitation policy. It takes the inviter name only from the display name the inviter consented to share with that app, never from an email address.
  - `soma.ticket_lookup_v2(p_token_hash)` returns only status, kind (`single_use` or `reusable`), the optional invitee salutation, inviter name, and quote line. The landing page says that holding the link, not the displayed name, admits the person.
  - `soma.ticket_admit_v2(p_token_hash, p_guest_session_hash)` lets a person who has not signed in enter the invited scope as a guest, as `ticket_use` does today.
  - `soma.ticket_redeem_v2(p_token_hash)` requires a signed-in principal and, in one transaction, atomically claims a single-use ticket or counts a reusable one against `max_redemptions`, records the redemption, and creates or upgrades that person's `soma.memberships` row.
- Every app that issues tickets lists the platform ticket store in `data_stores`, so export and erasure reach the names held for its invitations without exposing another app's rows.

**Meter** [1.2]. Add `createBrokerStore`, which implements a generic billing-subject store over per-app `usage_events` and `entitlements` through broker RPCs. Rename the store's `resolveStudioId` to `resolveBillingSubject`, keeping the old name as a PlayMaker adapter alias. PlayMaker keeps `createSupabaseRestStore` until M11. Base the generic client chip on `playmaker/src/components/UsageChip.tsx`.

**Bearer links** [2.2]. An invitation or contact-thread link has the form `https://<origin>/<route>#<token>`. The landing route loads no Guide, analytics, or third-party resource. Its only script posts the fragment to a same-origin Function. The Function picks a random, non-secret selector and sets a short-lived cookie named `__Host-soma-link-<selector>` with `Path=/` (which the `__Host-` prefix requires), no `Domain`, `Secure`, `HttpOnly`, and `SameSite=Lax`, and returns only the selector. The script removes the fragment with `history.replaceState` and continues with the selector; the authority stays in the cookie, which script cannot read. An invitation then starts authorization with the opaque pending-invitation handle from that cookie (section 2.2, step 5). The Function clears the cookie once it has established the pending invitation or contact-thread session. The landing and exchange responses send `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The callback route's immediate 303 (Appendix A, M3) removes the authorization code before any app page loads.

**Contact threads** [2.7]. An anonymous visitor receives, once, on the confirmation screen, a thread link carrying an unguessable token in its fragment (bearer links, above). The screen tells the visitor that this link is the only way to read the reply, because SOMA sends no mail to an anonymous visitor (section 2.3b). The host answers from the app's admin feedback queue. A thread token expires 90 days after the last message.

**Crash alerts** [2.4]. The first unhandled crash with a new fingerprint in a release, and each tenfold rise in that fingerprint's count, writes a `kind = "error"` event to `soma.estate_inbox` in the same broker transaction as the `error_reports` row. The event's summary holds only the fingerprint, route, release SHA, and count, with no stack, message text, or person identifier. Its `app_record_id` combines the fingerprint, the release SHA, and the count threshold, so each alert is filed once.

**Guide releases** [2.8]

- The versioned path is served with `Cache-Control: public, max-age=31536000, immutable`. Every script and stylesheet is listed in the lock file and receives an integrity hash.
- Publishing an existing semantic version is a no-op only when every byte matches; otherwise it fails. `dist/releases.json` maps each semver to its `SOMA_GUIDE_VERSION` date string and its complete asset manifest.
- Because every Netlify production deploy replaces the whole site, `deploy-guide.sh` adds three checks. Before it builds or copies anything, it refuses to run when `dist/` or `packages/` has uncommitted or untracked files, so release inputs and retained artifacts come from one clean commit. Before deploying, it verifies that every version in `dist/releases.json` is present under `dist/v<semver>/` and matches its recorded hashes. After deploying, it fetches every asset of every listed version from the CDN and compares its SHA-384 with the lock value.
- `dist/v*/` is committed to git and is never deleted.
- Versioned paths are served with `Access-Control-Allow-Origin: *`, and kit pages load them with `crossorigin="anonymous"`, because the browser refuses a cross-origin integrity check without CORS.
- Kit mode permits no runtime JavaScript `import()`, worker script, JSONP callback, injected script element, or configurable executable URL. Kit apps cannot use `cfg.voiceAgentEsmUrl`. `deploy-guide.sh` fails a versioned release whose bundle contains a remote or dynamic executable import.
- The Guide entry script bundles `soma-assist-core`. The voice adapter is a separate script in the same release, emitted with its own integrity value only when `guide.voice.enabled` is true, so apps without voice do not carry the voice client. Non-executable media may use content-addressed relative paths listed in the lock.
- `soma-assist-core` is a separate global script today, and Legends does not load it. When it is absent, the Guide shows its legacy panel. Bundling it into a kit release therefore changes the Guide's interface for kit apps, and Golden Journeys must cover the panel that actually ships. The lock lists every asset the release actually loads.

**Guide kit mode** [2.7]

- Today `cfg.identity.recordSeen` receives four different things: a walkthrough ID when a tour starts, a Do action ID, `{ display_name }`, and `{ email }`. In kit mode the Guide does not call `recordSeen`. It calls three separate hooks instead: `cfg.kit.concepts.told(concept_id)` when it presents a concept's `tell` text without being asked, `cfg.kit.concepts.workflowCompleted(workflow_id)` after the last step of a workflow, and `cfg.kit.concepts.acknowledged(concept_id)` from an explicit "I already know this" control.
- The vendored adapter maps a workflow to a concept only through the manifest's `concepts[].show` field, and only then records `shown`. Action IDs never become concept state, because `done` comes only from receipts. The adapter rejects every argument that is not a declared ID.
- The Guide never writes `name` or `email` to `localStorage`. It reads the display name from `GET /api/soma/v1/me`.
- The Guide persists only UI preferences on the app origin: panel size, text or voice mode, and mute. It writes no `anon-id`, no transcript, no `default-account`, and no `introduced` or `last-seen` key; concept state replaces “introduce once.” Session diagnostics stay in memory. The Guide ignores `cfg.telemetry.logUrl` unless the manifest declares the Guide transcript as a data flow, and then every record carries the route path without its query or fragment.
- The observer records element labels only. It captures no field values. Intake attaches recent activity only when the person ticks “include what I just did” in the feedback form.
- Ask sends the `AskRequest` from section 2.6a. It sends `page_context` only when `guide.ask.page_context` is true. The Guide renders the response's `citations`, the `grounded: false` escalation, and the server's `offers`; it adds no keyword-matched walkthrough offer of its own.
- Do calls `cfg.kit.actions.prepare` and `cfg.kit.actions.execute` from the vendored `@soma/actions` client, with the AI host as actor. The Guide calls `execute` only from the person's click on the Look or Do control for that prepared request (section 2.6). The server's preview and risk gate replace the Guide's local confirm text and its `risk: 'high'` flag. DOM-replay `steps` remain available only for `view` actions.
- The scaffolder compiles each manifest step's `text` field into the Guide's `narration` field.
- The release's Content Security Policy must allow what the Guide actually does: the known inline `<style>` from `soma-assist-core` by hash or nonce rather than blanket `unsafe-inline`, and `data:` audio when voice is enabled. Golden Journeys run under the generated policy, not a relaxed one.

### M6: Legends preview

- **Publish directory** [4.1]. Legends' build copies only public pages and assets into `_site/` and publishes that directory, so Function source, SQL, migrations, agent documents, and `package.json` stop being served. Landed 2026-10-07 (legends-membership PR #2; `ESTATE.md` changelog). C24 keeps it true.

### M8: PlayMaker action PRs

- **Existing idempotency ledger** [2.4]. PlayMaker's `agent_command_requests` (`playmaker/supabase/migrations/0081_agent_api.sql`, used by `playmaker/netlify/functions/agent-v1.ts`) is the idempotency ledger M8 generalizes, rather than adding a second one. It claims, runs, and settles in three separate requests today. M8 first wraps those existing effects (section 4.2), then moves PlayMaker's database effects into the single-RPC form in later pull requests.

### Before public MVP (C18, C18a)

These constraints have no build milestone of their own. They gate an app's move from prototype to public MVP.

- **Private files** [2.5a]. Private files use an app-specific private bucket or prefix. An upload requires a short-lived signed grant bound to the person, the app, a MIME allowlist, a byte limit, a checksum, and the destination. A download requires a fresh authorization check. A user-supplied filename never becomes a storage path. Public buckets, permanent signed URLs, and client-held storage administration keys fail conformance.
- **Global export and erasure routes** [2.5a]. The identity origin serves `POST /me/exports`, `GET /me/exports/:id`, `POST /me/erasures`, and `GET /me/erasures/:id`; no app OpenAPI document lists them. Each `POST` returns `202` and a job ID. Each `GET` reports every target as pending, complete, failed, or lawfully retained.
- **Global erasure completion** [2.4]. A global request is complete only when every target is complete or shows the person a lawful retained exception.
- **Receipt erasure** [2.4]. Erasure deletes the receipt's `action_receipt_payloads` rows and its `effect_summary`, replaces `principal` with a tombstone, and keeps only the signed, non-sensitive envelope for the declared retention period. Erasure deletes the person's `soma.receipt_index` rows. The keyed request fingerprint is never exported, and it becomes unlinkable once the app's fingerprint key rotates.

_Authorship: Mike Wolf, principal and product owner; source plans by OpenAI Sol, Anthropic Claude Opus, and Google Gemini 3.1 Pro; merged by OpenAI Codex for the SOMA brain trust, 2026-10-07._

_Simplification pass: Claude Opus 5.5 (Claude Code), 2026-10-07, for Mike Wolf as the brain trust's simplification editor. Merged duplicate statements, moved per-milestone mechanics to Appendix A, moved merge notes to `plans/merge-notes-r1.md`, and fixed the contradictions listed in `plans/simplify-ledger.md`._
