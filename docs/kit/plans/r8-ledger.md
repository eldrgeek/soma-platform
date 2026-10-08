# Round 8 revision ledger

| Revision id | Title | Decision | One-line reason |
|---|---|---|---|
| R1 | Make every identifier pairwise | Somewhat agree | Pairwise coverage is necessary; I also added an explicit `soma.grant_app_handles` lookup so `grant_ref` can map back without exposing a global grant ID. |
| R2 | Add an admission policy | Agree | Sign-in and app admission are separate decisions, and invitation-only or approval-based apps need enforceable visitor states. |
| R3 | Specify tickets v2 against reality | Somewhat agree | The code confirms reusable shared tickets, anonymous admission, plaintext tokens, and email-derived names; I also made anonymous admissions count through keyed guest-session redemption rows. |
| R4 | Approve answer sharing on the identity origin | Agree | A cross-app disclosure needs a witness the requesting app cannot script, bound to the exact projection and a short expiry. |
| R5 | Remove unsafe template migrations | Somewhat agree | The trigger collision and `auth.uid()` mismatch are real; I also required replacement of dependent template callers and removal of both scaffold and provision schema instructions. |
| R6 | Stop Guide storage and page-text leaks | Agree | Current Guide code persists an anonymous ID, transcript, full URLs, form values, and page text, so kit mode and C10 must cover all of them. |
| R7 | Degrade Ask without an unmetered provider call | Agree | Broker-backed quotas cannot be enforced during a broker outage, so the safe fallback is bundled provider-free search. |
| R8 | Isolate the identity origin | Somewhat agree | A dedicated domain is sound defense in depth; I retained exact-Origin and CSRF checks and use Fetch Metadata as an additional check only when the browser supplies it. |
| R9 | Add brokered notifications | Agree | Existing promises require mail delivery, and brokered templates let apps notify people without receiving their correlating email address. |
| R10 | State the legacy recognition gap | Agree | Existing app-origin sessions do not create an identity-origin session, so the one-tap claim must wait until the broker sign-in path ships. |
| R11 | Create real steward and release seats | Agree | The plan depends on authorities absent from the current seat registry, and policy authorship must be separated from approval. |
| R12 | Define auth routes and CSRF delivery | Agree | The route inventory was incomplete, and callback cleanup plus a defined CSRF source closes concrete logging and redirect gaps. |
| R13 | Pin the app template | Agree | The scaffolder currently copies an arbitrary sibling checkout, so the lock and second-app test must cover the template commit too. |
| R14 | Define kit updates and security floors | Agree | Vendored security fixes need a repeatable update path and a broker-enforced deadline rather than voluntary drift detection alone. |
| R15 | Declare action state-machine fields | Agree | The existing execution and reconciliation rules depend on effect target, timeout, recovery, cool-off, and UI-exception fields that were missing from the contract. |
| R16 | Add a legacy conformance profile | Somewhat agree | Legacy gaps should be visible and dated, but exceptions apply to individual assertions within C12, C12b, and C22 so unrelated failures cannot hide. |
| R17 | Give the estate processor a narrow role | Somewhat agree | A dedicated role is required; I also required forced-RLS policies because column grants alone cannot operate through forced RLS. |
| R18 | Complete the contact reply path | Agree | The existing handoff promise ended at receipt; a reply thread, anonymous bearer link, expiry, and declared notice address complete it. |
| R19 | Make Ask stateless | Agree | Client-supplied, bounded, untrusted history removes an otherwise undeclared store of anonymous questions and answers. |
| R20 | Measure and bound broker latency | Somewhat agree | The two-hop path needs evidence; I made `/me` include declared compatible answers too and kept 800 ms observational until measurements justify a failing budget. |
| R21 | Remove single-value manifest fields | Agree | Fixed protocol behavior should live in the schema and runtime, not be repeated as manifest knobs that can only drift. |
| R22 | Drop the undefined host-chat interface | Agree | Keeping host chat app-specific removes a contract the plan neither defines nor tests while preserving shared offers and authority rules. |
| R23 | Correct the PlayMaker migration count | Agree | `origin/master` contains numbered migrations through `0089`, and the dated wording avoids presenting that bound as timeless. |

Applied: 16 agree, 7 somewhat, 0 disagree.
