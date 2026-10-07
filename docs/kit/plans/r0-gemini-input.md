You are one of several independent planners in SOMA's brain trust. Other frontier models from other companies are writing their own plans for the same brief right now. Nobody will see yours until all are done; then one model merges the best of each. Write the best plan you can, on your own judgment. Do not hedge toward what you think the others will say.

Your inputs are three files in `~/Projects/soma-platform/docs/kit/`:
- `01-brief.md` — the job and what the plan must contain. Follow its section list.
- `00-inventory.md` — what is already built.
- `00-capability-ideas.md` — the SOMA capability ideas in the canon, and 14 places where documents disagree.

If you can read files, read those three first, then anything under `~/Projects/` that helps (cite paths you rely on). Do not read anything in `~/Projects/soma-platform/docs/kit/plans/` other than this prompt.

Rules for your plan:
- Resolve every one of the 14 contradictions: pick a side or propose a third answer, and say why in one or two sentences. If a contradiction is a product question only Mike can settle, put it in the product-questions section with your recommendation.
- Propose at least three capabilities that are in neither input file, and say why SOMA needs each.
- Be concrete: table names and columns, package names, function signatures, file paths, the conformance checks as runnable commands.
- Plain English. One claim per sentence. No filler.

Output only the plan, as one markdown document starting with a level-1 heading.


You cannot read files, so the three input files follow in full.

===== 01-brief.md =====
# Brief: the SOMA app kit spec, v1

_The concept every planner receives in round 0 of the brain-trust convergence loop (bead sp-zf0). Written by Claude Opus 5.5 (Claude Code) for Mike Wolf, 2026-10-07, from Mike's request: "consolidate and spec and make that our first attempt." Read this whole file, then `00-inventory.md` (what is built) and `00-capability-ideas.md` (what SOMA says every app should do). You may read anything else under `~/Projects/` that helps; cite paths._

## What SOMA is, in four lines

SOMA (Society of Minds Aligned) is Mike Wolf's organization of humans and AIs. Its goal is alignment across three axes: human with human, human with AI, and AI with AI. It ships small web apps, each one helping people align with other people. Every app has a named human host and a named AI host (PlayMaker: Eric and V'Eric; Legends: Greg and Bill).

## The job

Write the plan for **the SOMA app kit**: the set of capabilities every SOMA app gets on day one, so the second app (chosen in November 2026; candidates are V'Eric coaching and OLLI) stands up in hours, not weeks, and so every app behaves like a SOMA app, not just a web app with a login.

The kit has two layers. Your plan must cover both and say how they connect.

1. **Plumbing that exists** in pieces across PlayMaker, Legends and soma-platform (`00-inventory.md`). Four parts are packaged already. The rest is copied, duplicated (five invitation variants, two changelog designs) or stuck inside one app.
2. **SOMA capabilities that make an app a SOMA app** (`00-capability-ideas.md`). Mike named two in his request:
   - **Be known.** A person's SOMA identity follows them across every SOMA app and, where possible, beyond SOMA. An app does not re-tell a person what they already know about SOMA, does not re-ask what they already answered, and greets them as who they are.
   - **Ask, show, or do.** On any app, a person can ask how to do something. The app answers, shows them on the page, or does it for them, behind a risk gate.
   Mike said "there may have been other ideas". Find them in the canon, judge them, and propose more.

## Facts that constrain the plan

- **Stack.** Netlify sites with Functions; one shared Supabase project (`omfwcodoimjmbrhssvfl`) for auth and cross-app tables; React + Vite apps (PlayMaker, the react-app scaffold) and plain static sites (Legends). Both kinds must be served.
- **Builders.** Cursor and Codex build from beads; at most three at once. Claude writes briefs, reviews and merges. PlayMaker is Eric's repo and takes pull requests only.
- **Delivery.** Packages in `soma-platform/packages/` are vendored into apps by the scaffolder; the Guide engine is served from a CDN. Say which delivery each part should use and why.
- **Outside AIs are arriving.** OpenAI launched Dots (always-on personal agents), ChatGPT Space and Pages on 2026-09-29. A person may come to a SOMA app with their own AI acting for them. Claude, Gemini and Grok users will too. Plan for the person's own AI as a first-class visitor, not only for our in-app guide.
- **Mike's rules that apply.** Mike's time goes to people, not computer tasks. Every claim of done is a demonstration. Gates are executable checks that fail loudly. AIs are credited as named co-creators.

## What the plan must contain

1. **The capability list.** Each capability: what it does for the person (one sentence), the SOMA principle it serves, what exists today (paths), and the target design. Keep, merge or drop every inventory item; say which and why. Resolve each duplication (pick one invitation design and one changelog design, or say why two are needed).
2. **The architecture.** How identity, the knowledge of what a person has seen, the action registry, consent, and the AI-visitor door fit together. Data model (tables, who owns them, RLS). Package boundaries. What lives in the shared project versus per app.
3. **The contract an app signs.** What an app must declare (hosts, concepts it teaches, actions it exposes, risk levels) and what it gets in return. A conformance check that proves an app meets the contract.
4. **Migration.** How PlayMaker and Legends move onto the kit without breaking Eric's work. Order of work.
5. **The second-app test.** A measurable definition of "a new app stands up on the kit", and the time target.
6. **Product questions for Mike.** At most five, each with your recommendation. Only questions a model cannot settle (taste, people, money, promises to users).
7. **Assumptions to test with a person.** Each with a cheap test that does not need code.
8. **Risks and what you would cut** if the kit had to ship in two weeks.

Write it as one markdown document. Be specific: names, tables, function signatures, file paths. Length is not the goal; completeness and correctness are. Do not pad.

===== 00-inventory.md =====
# App kit inventory: what exists on 2026-10-07

_Input to the app-kit spec (bead sp-zf0). Research by a Claude Opus 5.5 Explore agent for Mike Wolf, 2026-10-07, read from `origin/master` of soma-platform and playmaker. "pm" = `playmaker`, "lms" = `legends-membership-site` (`legends-greg-changes` is a second checkout of the same repo), "tmpl" = `soma-app-template`. Paths are relative to `~/Projects/`._

## Packaged in soma-platform (PlayMaker runs these from one source)

| Part | Where | Notes |
|---|---|---|
| Sign-in | `soma-platform/packages/soma-signin` (React); older static version `soma-platform/packages/auth`; copies in `lms/js/soma-auth.js`, `legends-connect/js/soma-auth.js` | Spec `SOMA/standards/SOMA-AUTH.md`. Shared Supabase project `omfwcodoimjmbrhssvfl`. |
| Tickets (single-use invitations) | `soma-platform/packages/soma-tickets` | Tables shared across apps through an `app` column. |
| Usage meter (server) | `soma-platform/packages/soma-meter` | The client chip `pm/src/components/UsageChip.tsx` is still PlayMaker-only. |
| Feedback chip (hooks only) | `soma-platform/packages/soma-feedback` | The widget itself is copied: `SOMA/standards/soma-feedback/`, `pm/public/vendor/soma-feedback/` (drifted from canonical), `tmpl/public/vendor/`. |
| Guide / Bill (Tell, Show, Do) | `soma-platform/packages/soma-guide` (served from a CDN) | 22 Legends pages use it. |
| Shared chat window | `soma-platform/packages/soma-assist-core` | |
| Onboarding | `soma-platform/packages/soma-onboard` | One of five invitation variants. |
| Scaffolder + standup-check | `soma-platform/packages/soma-scaffolder` | Scaffold, install, typecheck and build timed at 6.59 s on 2026-10-05. |

## Copy-in templates or `SOMA/standards/` folders

| Part | Where | Notes |
|---|---|---|
| Changelog, admin approval queue | `lms/admin-changelog.html`, `lms/js/changelog-diff.js`, `soma-platform/templates/soma-affordances/changelog/` | Legends' design. |
| Changelog, user-facing "What's new" | `pm/src/features/guide/{Changelog,WhatsNewList}.tsx`, `pm/src/lib/whatsNew.ts`, `pm/netlify/functions/changelog-append.ts` | PlayMaker's design. Different from Legends'. |
| Payments (donate, subscription) | `soma-platform/templates/soma-affordances/billing/`, `SOMA/standards/soma-stripe/`, pm's own functions | Spec `pm/SOMA-STD-billing.md`. |
| Live in-place editing | `SOMA/standards/soma-live-edit/`, `pm/src/features/admin/LiveEdit.tsx` | |
| Admin roles and allowlist | `pm/netlify/functions/lib/appAdmin.ts` (copied to tmpl), `SOMA/standards/soma-allowlist/` | |
| Email sending | `pm/netlify/functions/lib/smtp-send.ts` (copied to tmpl) | |
| Agent pairing and delegation | pm `agent-pair-*.ts`; tmpl migrations `0002_delegations.sql`, `0003`, `0006` | |
| Deployment checks | `SOMA/tools/ship/soma-ship-check.py`, `SOMA/standards/DEPLOY-TARGET-POLICY.md` | |

## Inside one app only

| Part | Where | Notes |
|---|---|---|
| Feedback queue and build requests (the outer improvement loop) | `pm/src/features/admin/FeedbackQueue.tsx`, `pm/netlify/functions/{update-build-request,check-stale-build-requests,dispatch-feedback}.ts` | tmpl has a stub. |
| Error reporting, crash alarm | `pm/src/lib/{errorReport,crashDetect}.ts`, `pm/netlify/functions/{errors,crash-report}.ts` | Shared `soma-errors/` service is dead (last commit 07-08). |
| Agent API, agent portal, llms.txt | `pm/netlify/functions/agent-v1.ts`, `pm/src/agent-portal/`, `pm/public/llms.txt` | |
| AI host chat (V'Eric) | `pm/netlify/functions/{manager-chat,convai-session}.ts` | |
| Themes, reload on new deploy, front-door analytics, share image | pm | |
| Community chat and video | `lms/js/soma-community-{chat,video}.js` | Spec `SOMA/standards/SOMA-COMMUNITY.md`. |
| Small UI pieces (toast, one voice at a time, resume where you left off, tooltip) | `tmpl/src/lib/`, `tmpl/src/components/` | |

## Duplication and gaps

- **Invitations and guest access: about five overlapping versions** (`soma-onboard`, `SOMA/standards/soma-invite/`, `soma-warm-invite/`, `soma-guest-gatehouse/`, PlayMaker's own flow).
- **Two changelog designs** that do different jobs.
- **Legal pages are missing** from every app except a Legends note. PlayMaker's are PR #86, open since 2026-09-12.
- **No single kit spec.** Overlapping catalogs: `soma-platform/docs/soma-apps/AFFORDANCES.md` (+ `APP-SPEC.md`, `BUILD-MODEL.md`), `SOMA/SOMA-APP-STANDARD.md`, `tmpl/SOMA-STANDARD-CHECKLIST.md`, `_shared/CAPABILITY-OWNERS.md`.

===== 00-capability-ideas.md =====
# SOMA capability ideas from the canon, 2026-10-07

_Input to the app-kit spec (bead sp-zf0). Harvested from the SOMA canon by a Claude Opus 5.5 Explore agent for Mike Wolf, 2026-10-07. 30 ideas, 14 contradictions. Most ideas are spec-only; the built exceptions are in PlayMaker (Agent Portal, AI pairing, known device and invitations, in-place editing) and Legends (Bill's Tell/Show/Do, the cross-app profile)._

**Path keys** (all under `/Users/mikewolf/Projects/` unless noted): STD = `SOMA/SOMA-APP-STANDARD.md` · PD = `soma-platform/docs/` · W0 = `SOMA/redesign/wave0/` · MOAD = `SOMA/MOTHER-OF-ALL-DEMOS.md` · FAC = `SOMA/specs/full-app-capability-v1.md` · MEM = `~/.claude/projects/-Users-mikewolf-Projects/memory/` · PM = PlayMaker beads (`_estate/bin/bead show <id>`).

Note: the local SOMA checkout is on branch `falsification-ledger-v1`. `SOMA/specs/agent-portal-v1.md` and STD §23 exist only on origin/main (`git -C SOMA show origin/main:<path>`). STD §22 exists only as an uncommitted local edit.

## A. Be known across apps

1. **SOMA ID fast path.** A new app greets you by name, and returning to one needs no sign-in. Principle: one identity, consume don't fork. STD §16; MOAD §3.4, §8.3. Spec only: the handshake is not built; it waits on an apex domain and a substrate choice. Mike directive 2026-07-22.
2. **Two-tier profile ("what you've seen").** Loud for newcomers, quiet for veterans; walkthroughs already seen on any device are dropped. PD `SOMA-IDENTITY.md`; `legends-membership-site/js/legends-guide-config.js` (identity block); `soma-platform/packages/soma-guide/soma-guide.js` `_recordSeen`. Partial: the engine seam is built, only Legends uses it; table in `soma-platform/templates/soma-affordances/sql/schema.sql`. PD `soma-apps/APP-SPEC.md` (undated): profiles live in the shared project.
3. **Identity ladder, "Have we met?", self-knowledge.** The person can ask "what do you know about me?" or "forget me"; the host asks for a name once. PD `SOMA-IDENTITY-STATES.md`; MOAD §3.5. Partial: `set_identity`/`reset_identity` and the opener exist in soma-guide.js; typed parity is next.
4. **Known device and invitations.** A returning device gets a card back that stores no identity; a personal invitation greets by name, a shared one asks once. pm-kgn (live 2026-09-30), pm-y7i. Built in PlayMaker. `SOMA/specs/soma-onboard-identity-v0.md` proposes that an invitation mints a SOMA ID.
5. **Consent, visibility, revocation.** Private by default, a separate identifier per app, revocation list, erasure receipts. W0 `CONSENT-VISIBILITY-REVOCATION.md`, W0 `SOMA-ID-SCHEMA.md`, `SOMA/redesign/soma-id-service/README.md`. Contract frozen; service passes its Golden Journey test locally, not deployed. STD §16 calls this the "far path".
6. **Resume where you left off.** STD §12. Filed, not built (directive 2026-07-04).
7. **Introduce once.** `SOMA/standards/SOMA-AFFORDANCE-INTRO-ONCE.md`. Built (soma-feedback v4.1).
8. **A personal AI that travels with you.** Assistant / "consigliere"; AI-to-AI calendar negotiation; brokered introductions. MOAD §8; PD `soma-apps/AFFORDANCES.md` (Dyad). Idea only; name open.
9. **Cross-app memory.** Per-person memory no app owns; Backstory hooks; cross-app notification stream. W0 schema §3.2; `SOMA/specs/soma-app-component-architecture-2026-05-12.md` §2. Spec or idea only.

## B. Ask the app how; it shows you or does it

10. **Guide Tell/Show/Do with a risk gate.** High-risk actions route to approval. PD `soma-apps/AFFORDANCES.md`; soma-guide.js `_runAction`. Built (Legends).
11. **Agent Portal ("MVC").** One command registry; every UI action maps 1:1 to a command an AI can call. STD §23a; `SOMA/specs/agent-portal-v1.md` (origin/main); MEM `project_agent_portal.md`. Built in PlayMaker (28 commands; remote API live 2026-09-15). Rulings: 09-14 remote API yes; 09-18 AI-only inspection commands yes; 09-20 clause ratified. LEAD parks further work until PlayMaker needs it.
12. **The front door is a conversation.** STD §22 (local only); MOAD §11.6. Directive 2026-09-12. PlayMaker's canvas front door is live.
13. **AI door.** A portable prompt you hand to your own AI, plus `llms.txt`. STD §19. Built on mike-wolf.com and PlayMaker (2026-07-30); `llms.txt` half unbuilt elsewhere.
14. **Tours.** Films, live narrated tours, rrweb recordings reused three ways. STD §7; MOAD §2.4, §3.7. Legends tours built.
15. **Review with Bill.** The host walks you through what changed. PD `SOMA-INTAKE.md` Phase 3. Spec.

## C. Everything else

16. **Host pair, substrate prefixes, kin-bond.** Human host + AI host; escalation queue, disagreement log, office hours. STD §1/§1a; FAC §3.5–3.7, §7. Naming the host pair is a PROTOTYPE gate (§21, ratified 2026-08-21). Kin-bond spec only.
17. **RSI loop.** In-app Development Requests + market personas that use each deploy. `SOMA/specs/rsi-loops-v1.md`, `SOMA/rsi/README.md`. Routing and digest implemented 2026-07-03; spec still "DRAFT pending Mike's read".
18. **Intake as change membrane.** PD `SOMA-INTAKE.md`. Phase 1 done in preview. Phase 2 routing open; the recommended route (claude-email-daemon) was down from 2026-07-23 to 2026-08-11 and is fragile.
19. **In-place edit with a three-answer review** (take it, drop it, revise it). STD §17/§17a. Built in PlayMaker; `soma-edit.js` phase 1.
20. **Partner AI acting on your behalf (OBO).** Pairing with no copy/paste; cost metered to the principal; "Your AI partners" list with revoke. STD §14/§14a; `SOMA/standards/SOMA-AGENT-AUTH.md`. Built in PlayMaker 2026-07-07; platform-wide directory spec only.
21. **Signed provenance.** STD §23b; `SOMA/specs/signed-provenance-v0.md`; `SOMA/standards/SIGNATURES-AND-BYLINES.md`. Ruled 2026-09-20: yes to 1, 2, 4, 5; not yet to 3 (testers signing in with a key). Nothing built (pm-94n).
22. **Every mind gets credit.** Credits roll and making-of per artifact. `SOMA/standards/SOMA-STD-credits.md` v0.9 awaits Mike's verdict. First roll shipped 2026-07-15.
23. **Accord and "We're aligned."** Asks answered Yes / Not yet / No; a frozen ledger when nothing is open. `SOMA/CULTURE.md` (ritual 2026-07-15); MEM `project_soma_accord.md` ("Accord everywhere" ruled 2026-09-19). LEAD stops new Accord features unless PlayMaker needs them.
24. **CoEvolution continuity.** Persona diaries merged nightly. MEM `project_coevolution_continuity_design.md`. Parked.
25. **Elicitation front-of-funnel.** Learn the person's context instead of asking for requirements; an AI onboarding interview. `SOMA/redesign/research/ELICITATION-FRONT-OF-FUNNEL.md`; MOAD §11.5; FAC §3.3. Research only.
26. **Community presence.** Chat and video (`SOMA/standards/SOMA-COMMUNITY.md`, Legends reference built); Room/Atlas (model locked 2026-06-18, unbuilt); AI in Discord (FAC §3.5).
27. **BYOK and KeyDrop.** `playmaker/docs/STRIPE-SETUP.md` B3 (`byok_keys` table unused); `SOMA/specs/soma-keydrop-v0.md` awaiting ratification.
28. **Honest UX.** No silent success (STD §10); cool-off before irreversible actions (FAC §3.2); account deletion and data export (§21, MVP tier, not checkable yet).
29. **Preferences as sentences, "who may act for you", per-line voice consent.** pm-n98, pm-7dm, pm-u5q (open). Voice consent belongs to the human the voice came from (STD §1a).
30. **Lineage: who acted, with which key.** MEM `project_ai_observability_lineage.md`. Fleet-level board live (2026-09-13); nothing app-level.

## Contradictions and open questions

1. **Identity substrate.** W0 uses DIDs (`soma.id/0.1`); PD uses a `soma_profiles` row. STD §16 leaves it to Mike; `APP-SPEC.md` treats the Supabase row as decided.
2. **Silent or offered.** STD §16: reconnect silently, never a login screen. `SOMA-IDENTITY-STATES.md`: "Recognize and offer — never silent."
3. **What the device remembers.** `SOMA-IDENTITY-STATES.md` keeps name and claimed email in localStorage; pm-kgn's marker records "never who."
4. **Trust model for AI partners.** STD §14: no scopes, "trust, not least-privilege." W0: deny by default, closed scope list, requests signed by person and AI. `SOMA-AGENT-AUTH.md`: scope optional. Mike's "not yet" on key sign-in leaves two-signature with no ratified path.
5. **How identity crosses sites.** PD `SOMA-DELIVERY.md`: iframe first-party storage for anonymous visitors. STD §16: shared identity origin + apex domain. PD `SOMA-IDENTITY.md`: iframe only for linking.
6. **Invitations.** `@soma/onboard` keeps per-app member tables, which is §16 drift by its own admission (`soma-onboard-identity-v0.md` §0).
7. **AI-only commands.** Agent Portal says none exist; the 2026-09-18 ruling allows AI-only inspection commands.
8. **Vendors.** FAC picks Clerk and Vercel; canon is SomaAuth/Supabase on Netlify; CAPABILITY-OWNERS calls Clerk out-of-universe.
9. **Feedback routing.** §8 says live sites graduate to Guide intake, which depends on the email daemon; rsi-loops routes to the estate board; §15b keeps queues per app.
10. **Greeting.** §16 greets by name on an app never visited; §19 calls a host that claims to know the visitor an anti-pattern.
11. **Clause numbering.** §22 is not on origin/main.
12. **Campus personas vs hosts.** Campus personas: "no tasks" (AFFORDANCES). Hosts: a Do rung with full authority.
13. **Name clash.** The SRMW "AI portal" is not the Agent Portal (`_estate/IDEAS.md`, 2026-09-28).
14. **Scope of the kit.** LEAD item 2 names only sign-in, feedback chip, tickets, usage meter (all done). Agent Portal, CoEvolution, Rooms, Legends are parked.

Still open with no answer found: the consigliere's name; one Accord scribe or one per room; persona-run cadence; the apex domain.
