# Merge notes, round 1 (moved from 10-plan.md)

_Moved out of `10-plan.md` by the simplification pass on 2026-10-07 (Claude Opus 5.5, Claude Code, for Mike Wolf). Builders do not need this history; it records which source plan each idea came from. Text unchanged below._

### What I took from OpenAI Sol

- The kit is a constitutional runtime, not a catalog of every SOMA idea.
- The app manifest should declare promises, failure modes, actions, concepts, and hosts.
- Actions need typed inputs, server-enforced risk gates, idempotency, receipts, and compensation.
- The Guide should use immutable CDN releases, while code executing inside an app should be vendored and hash-locked.
- Migration should use adapters, additive database changes, feature flags, and Golden Journeys instead of rewrites.

### What I took from Anthropic Claude Opus

- The current `soma-app.json` and scaffolder are the correct starting point.
- “Do not re-ask” requires a versioned answer store in addition to concept-seen state.
- PlayMaker’s command registry is the strongest implementation source for Ask, Show, and Do.
- “Where your words go” and the kit beacon turn abstract trust and drift concerns into visible product behavior.
- Four working hours is a credible full stand-up target when deployment and host configuration are included.

### What I took from Google Gemini 3.1 Pro

- Its shorter plan made three sharp product calls: guaranteed human handoff, portable context export, and a universal activity log.
- Cross-app recognition should always be offered before an unvisited app receives identity.
- An outside AI may read public discovery material anonymously, but it must authenticate before acting.
- A fifteen-minute scaffold-to-local-build milestone is useful inside the broader four-hour stand-up test.

### Rejected from the source plans

- I rejected direct browser writes to shared tables that trust a caller-supplied `app_id`. A malicious client could impersonate another app.
- I rejected distributing the Supabase service-role key to app runtimes. One compromised app would expose the shared project.
- I rejected globally reusable AI authority as the default. Pairing and authorization are separate decisions.
- I rejected generated legal prose as a substitute for an operator’s ratified terms.
- I rejected “working Vite app” as the complete stand-up definition. The test must demonstrate identity, Ask/Show/Do, outside-AI access, feedback, and revocation.
- I rejected cutting Do from a two-week release. Ask, Show, and Do is one of the two capabilities Mike explicitly required.
- I rejected a package for every small helper. Toasts, tooltips, deploy reload, and share-image recipes stay in the template until two independent apps need the same maintained API.

_Authorship: Mike Wolf, principal and product owner; source plans by OpenAI Sol, Anthropic Claude Opus, and Google Gemini 3.1 Pro; merged by OpenAI Codex for the SOMA brain trust, 2026-10-07._
