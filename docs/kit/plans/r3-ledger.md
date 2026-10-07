# Round 3 revision ledger

| Revision ID | Title | Decision | One-line reason |
|---|---|---|---|
| R1 | The v1 manifest is a new format, not an extension of the existing spec | Agree | The existing v0 root shape and generated filename make a distinct v1 schema plus an explicit converter necessary. |
| R2 | Disclose legacy global identity and shared secrets, then remove them | Agree | The plan must state the current trust boundary honestly and include a migration that eliminates app-held shared secrets. |
| R3 | Never present an outside AI's long-lived credential to an app | Agree | Broker-only refresh credentials and app-audience access tokens prevent one app from replaying authority at another. |
| R4 | Keep receipts, idempotency, and resume state in each app's schema | Somewhat agree | Applied the per-app records and shared index, but stale pending actions require recovery proof before retry so external effects cannot be duplicated. |
| R5 | Specify session mechanics and remove local sign-in fallback | Agree | Server-side code exchange, pairwise JWT subjects, and no direct Supabase fallback preserve the consent and identity boundary. |
| R6 | Add the person-facing API and make undo a receipt operation | Agree | The Guide and settings need explicit broker-backed routes, and receipt-based undo removes conflicting compensation models. |
| R7 | Name shared-project provisioning and count it in stand-up | Agree | Registration, schema exposure, migration history, credentials, and stable redirects are mandatory deployment work. |
| R8 | Reconcile the action model with PlayMaker's registry | Agree | Explicit view, observe, and effect kinds preserve PlayMaker semantics and apply risk controls only where they belong. |
| R9 | Fix invitation app binding and membership checks | Agree | Invitation authority must derive the app from authenticated context and use that app's membership policy. |
| R10 | Make the pinned Guide fully pinned | Agree | Bundling the pinned ElevenLabs client closes the transitive latest-import hole while retaining a compatibility channel. |
| R11 | Define Ask's runtime and include its setup time | Agree | The plan now identifies ElevenLabs, compiled knowledge, disclosure, and agent provisioning as part of stand-up. |
| R12 | State which outside AIs can act and reuse broker auth for MCP | Agree | Fetch-only assistants and tool-capable agents have materially different abilities, and MCP should share the established grants. |
| R13 | Isolate concept namespaces and define suppression semantics | Agree | Namespace enforcement prevents cross-app inference, while state-specific behavior makes “do not re-teach” testable. |
| R14 | Hash the whole contract | Agree | Referenced schemas, persona, and knowledge files are enforced contract inputs and must affect drift detection. |
| R15 | Follow PlayMaker's ship rule and preserve AI routes | Agree | Direct-to-production flags and temporary route aliases match current operations without breaking paired agents. |
| R16 | Make live conformance safe on the shared production project | Agree | Test-only identities, a fixture app, deterministic sign-in, cleanup, and persisted run results make live checks repeatable. |
| R17 | Settle soma-assist-core feedback and heartbeat behavior | Agree | Restricting those clients to their extension consumers avoids a third app feedback and health path. |
| R18 | Decouple the feedback outbox from the Mac | Agree | A shared durable inbox lets apps deliver while the Mac is offline and makes dead letters observable. |
| R19 | Replace the settled product question | Agree | Eric's migration consent and flag ownership require Mike's judgment; the pre-consent name rule does not. |
| R20 | Rebalance the two-week release | Agree | Provisioning, test fixtures, and secret isolation are prerequisites; the static fixture already proves the path Legends would test. |
| R21 | Make accessibility executable conformance | Agree | Keyboard, screen-reader, mobile-width, and axe checks must fail loudly rather than rely on a review day. |
| R22 | Move merge history out of the builders' path | Agree | Keeping decisions first and moving provenance intact to an appendix improves usability without losing history. |
| R23 | Correct citations, vendoring provenance, and package naming | Agree | The corrections align the plan with the repository's actual paths and existing vendoring record. |

Applied: 22 agree, 1 somewhat, 0 disagree.
