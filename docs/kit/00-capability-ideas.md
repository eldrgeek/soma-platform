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
