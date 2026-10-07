# The SOMA App Kit Plan

## 1. Capabilities
**Sign-in and identity.** A person authenticates once to establish their identity. SOMA needs this to fulfill the "Be known" principle. Keep `soma-signin`. Drop the legacy `soma-auth` static version. Path: `soma-platform/packages/soma-signin`.

**Tell, show, do.** A person can ask how to achieve a goal. The app demonstrates the action or executes it. SOMA needs this to assist users at their preferred abstraction level. Keep `soma-guide`. Path: `soma-platform/packages/soma-guide`.

**Agent portal.** An external AI can inspect state and execute commands. SOMA needs this to treat visiting AIs as first-class citizens. Extract `pm/src/agent-portal/` into a shared package. Path: `soma-platform/packages/soma-agent-portal`.

**Universal activity log.** A person can view every action they or their partner AI executed across all SOMA apps in one feed. SOMA needs this to guarantee trust and transparency for automated actions.

**Explicit human handoff.** A person can pause any AI interaction. The person routes the interaction directly to the named human host. SOMA needs this to ensure a guaranteed human escalation path.

**Context export.** A person can download a plain-text markdown file containing their entire profile and interaction history. SOMA needs this so users own their data and can transport it to outside agents.

**Invitations.** A person receives a personalized entry token. Keep `soma-onboard`. Merge `soma-warm-invite` and `soma-guest-gatehouse` into it. Drop PlayMaker's custom flow.

**Changelog.** A person sees what improved since their last visit. Keep PlayMaker's user-facing `WhatsNewList.tsx`. Drop Legends' admin-focused `changelog-diff.js`.

## 2. Architecture
The shared Supabase project `omfwcodoimjmbrhssvfl` holds all kit state.
Identity uses the `soma_profiles` table.
Identity columns are `id`, `name`, `email`, and `created_at`.
Device recognition uses the `soma_devices` table.
Device columns are `token`, `profile_id`, and `last_seen`.
Knowledge tracking uses the `soma_seen_events` table.
Knowledge columns are `profile_id`, `app_id`, `feature_key`, and `seen_at`.
The action registry uses the `soma_actions` table.
Action columns are `id`, `app_id`, `command_name`, and `risk_level`.
Row Level Security policies restrict read access to the owning `profile_id`.
The kit packages reside in `soma-platform/packages/`.
The auth package exports `function useSomaIdentity(): Profile`.
The guide package exports `function GuideEngine(props: GuideProps)`.
The agent portal package exports `function registerAction(action: ActionDef)`.
Apps vendor packages via `npm install`.
The AI-visitor door operates via `/.well-known/soma-ai.json`.
This file exposes the agent API endpoint.

## 3. App Contract
An app declares its boundaries in `soma.config.ts`.
The config exports `humanHost`, `aiHost`, `concepts`, and `actions`.
The config defines the risk level for every exported action.
The app receives managed authentication, guide routing, and AI command execution.
The conformance check is a runnable command.
Execute `npx @soma/conformance-cli check --config ./soma.config.ts --url http://localhost:3000`.
The check fails loudly if a declared action returns a non-200 status code.
The check fails loudly if the AI door JSON is missing.

## 4. Migration
Work happens in four sequential phases.
First, extract Legends Tell/Show/Do logic into `soma-platform/packages/soma-guide`.
Second, extract PlayMaker identity flows into `soma-platform/packages/soma-signin`.
Third, update `playmaker/package.json` to vendor and mount `@soma/guide`.
Fourth, update `legends-membership-site/package.json` to vendor and mount `@soma/signin`.

## 5. Second-App Test
A new app stands up on the kit when `npm create @soma/app olli-app` outputs a working Vite app.
The generated app must have Auth, Guide, and Agent Portal fully wired to Supabase.
The time target is fifteen minutes from command execution to a live Netlify URL.

## 6. Contradictions Resolved
1. **Identity substrate.** Use Supabase `soma_profiles`. DIDs add unnecessary complexity for our single ecosystem.
2. **Silent or offered.** Recognize and offer. A person must always remain aware of when and how they are known.
3. **What the device remembers.** Store an opaque token. The server must hold all PII to enable central revocation.
4. **Trust model for AI partners.** Demand explicit scopes. An external AI must only access capabilities the person explicitly authorized.
5. **How identity crosses sites.** Use a shared identity origin. Third-party iframes are fragile under modern browser privacy policies.
6. **Invitations.** Use centralized `soma_profiles`. Per-app member tables fork identity and violate the core principle.
7. **AI-only commands.** Permit AI-only inspection commands. AIs require explicit state visibility that humans acquire visually.
8. **Vendors.** Standardize on SomaAuth, Supabase, and Netlify. The shared Supabase project is already provisioned and proven.
9. **Feedback routing.** Route all feedback to the central estate board. A single queue guarantees no feedback is lost in a neglected app.
10. **Greeting.** Do not greet by name on an unvisited app. The app must first ask the person to explicitly link their SOMA profile.
11. **Clause numbering.** Ratify and merge §22 into origin/main. The conversation front door is fundamental to the SOMA experience.
12. **Campus personas vs hosts.** Hosts hold the Do rung and execute tasks. Campus personas remain distinct background entities.
13. **Name clash.** Rename the SRMW "AI portal" to "AI Settings". The "Agent Portal" remains the MVC interface for external AIs.
14. **Scope of the kit.** Expand the kit to include the Agent Portal and Guide engine. Both are strictly required to fulfill the "Ask, show, do" capability.

## 7. Product Questions
1. Does an AI host require a distinct identity row, or is it an app attribute? Recommendation: Distinct identity row.
2. Should Stripe billing reside in the shared Supabase or remain per-app? Recommendation: Shared Supabase.
3. Do we charge a single shared subscription for SOMA, or per-app subscriptions? Recommendation: Single shared subscription.
4. What is the SLA for human host escalation? Recommendation: 24 hours.
5. Can a person bring an anonymous AI partner, or must the AI authenticate? Recommendation: The AI must authenticate.

## 8. Assumptions to Test
1. Users prefer the "Show me" guide over reading static text. Test: Serve a page with both options and count clicks.
2. Users want explicit control over AI scopes. Test: Present a scope selection screen and measure completion rate.
3. Users value the context export feature. Test: Place a dummy "Export Context" button and measure engagement.

## 9. Risks and Cuts
1. Risk: Cross-origin identity fails due to strict browser cookie policies.
2. Cut: Drop silent reconnect and require explicit email login per app.
3. Risk: The Agent Portal API is too complex to stabilize in two weeks.
4. Cut: Drop the "Do" capability and only ship "Ask" and "Show".
