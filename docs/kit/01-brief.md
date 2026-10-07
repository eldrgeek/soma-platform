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
