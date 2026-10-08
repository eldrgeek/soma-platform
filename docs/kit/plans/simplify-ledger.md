# Simplification ledger: 10-plan.md, after round 8

_Written by Claude Opus 5.5 (Claude Code) for Mike Wolf, 2026-10-07, as the brain trust's simplification editor, following `plans/simplify-prompt.md`. The pass edits `10-plan.md` in place, moves the merge notes to `plans/merge-notes-r1.md`, and records here what moved and why. Nothing is committed._

## Size

| | Lines | Words |
|---|---|---|
| Before: whole file | 1,478 | 22,395 |
| Before: body (sections 0–8, without merge notes) | 1,442 | 21,976 |
| Before: merge notes | 36 | 419 |
| After: body (sections 0–8) | 1,191 | 18,923 |
| After: Appendix A (with the two authorship lines) | 207 | 3,951 |
| After: whole file | 1,398 | 22,874 |
| Moved out: `plans/merge-notes-r1.md` | 38 | — |

The body is 251 lines (17%) and about 3,050 words (14%) shorter. The whole file is about 2% longer in words than the old body. The reason is the rule in the prompt: each moved item keeps its decision and one sentence of why in the body, and its mechanics in full in the appendix, so a moved item costs a pointer sentence. Literal duplicates (the same rule stated two or three times) were removed outright. A mechanical check found no sentence of eight or more words repeated anywhere in the new file, apart from code.

## Checks run on the result

- All 32 conformance checks (C1–C24 with C8a, C11a–c, C12a–b, C18a, C19a) are present, in order, with unchanged text.
- All four product questions, all eleven assumption rows, all 23 Golden Journey steps, and all twelve migration phases are present.
- Every backticked identifier in the old file outside code blocks still appears in the new file or in the merge notes, except three that were reworded (`app_*_api`, `sub = app_agent_id` → `sub = <app_agent_id>`).
- Every old sentence was matched against the new text by word trigrams. The 56 weakest matches were read by hand. All but one were rewordings or pointers. The one real loss (voice provisioning needs both `guide.voice.enabled` and `guide.voice.provision`) was restored.
- Every "section x.y" reference points to an existing heading. Code fences balance.
- The section order the brief requires (capability list, architecture, contract, migration, second-app test, product questions, assumptions, risks) is unchanged.

## What was merged or moved, and why

| What | From | To | Why |
|---|---|---|---|
| Merge notes ("What I took from Sol / Opus / Gemini", "Rejected") | old `## Appendix A: Merge notes` | `plans/merge-notes-r1.md`; one line remains | History builders do not need (prompt step 4). |
| Contact-route mechanics (feedback row, estate event, notification job, worker retry) | 1.1 host-pair row | 2.7 "Contact" | The capability list says what, the architecture says how (step 3). |
| Receipt-writing rules (which attempts write receipts, which traffic writes none) | 1.1 consent row and 2.6 | 2.6 "Receipts" only | Same fact in two sections. |
| Ask endpoint shape | 1.1 Ask/Show/Do row | 2.6a | Same. |
| Ticket v2 functions, columns, redemption table, data-store listing | 1.2 tickets row | Appendix A, M5 | Builder detail for one milestone; 1.2 keeps the decision and why the old RPCs are restricted. |
| `createBrokerStore`, `resolveBillingSubject` rename, chip source | 1.2 meter row | Appendix A, M5 | Same. |
| Guide voice-adapter detail | 1.2 Guide row | 2.8 "Guide delivery" | Stated twice. |
| "Isolation covers new apps only until M11", interim `sb_secret_…` keys | 2.1, 2.3a, 8.1, 8.2 | 2.3a "Isolation before M11"; others point to it | Stated four times. |
| Broker-outage behavior (fail closed, public pages, degraded Ask, contact route, no local sign-in) | 2.3, 2.3a, 8.1 | 2.3 "Broker outage"; 2.6a keeps degraded Ask; 8.1 points | Stated three times. |
| Feedback atomicity (one transaction, unique key, legacy retry) | 0, 1.1, 2.4 (twice), 8.1 | 2.4 "One transaction across two schemas"; 0 and C15 unchanged | Stated five times. |
| `/me` returns everything in one call | 2.3 and 2.7 | 2.7 route list; 2.3 points | Stated twice. |
| Latency measurement and the 800 ms observational target | 2.3 | Appendix A, M1 | Conformance mechanics. |
| OAuth transaction storage, callback rejection list, `return_to`, CSRF header, cookie attributes | 2.2 and 2.7 | Appendix A, M3 | Builder detail; 2.2 keeps exact redirect match, CSRF + Origin rule, and redaction list. |
| Access-token claims, `FOR SHARE` grant read, device-code limits, rate limit, no prefilled link | 2.2, 2.4, 2.7 | Appendix A, M4 | Builder detail; 2.7 keeps lifetime, audience binding, online authorization, revocation. |
| Pooler, role privileges, request-context store, `statement_timeout`, `soma_estate` privileges, broker secrets list, identity-origin headers and cookie rules | 2.3b | Appendix A, M3 | Builder detail; 2.3b keeps the role split, the no-`set_config` rule, the Auth-admin placement, and why. |
| Catalog baseline contents | 2.4a | Appendix A, M0 | It is M0 work. |
| Schema naming, migration-runner catalog checks, credential scopes per context, origin verification, `sync-contract` packaging | 2.4a | Appendix A, M3 | Builder detail; 2.4a keeps seats, separation of duties, the five steps, the privileged projection, and contract acceptance and retirement. |
| Receipt preparation steps, fingerprint, signing, repeat-key responses, claiming, reconciliation | 2.4 | Appendix A, M2 | Builder detail; 2.4 keeps the state machine and the one-RPC rule for database effects. |
| `agent_command_requests` generalization | 2.4 | Appendix A, M8 | It is M8 work. |
| Receipt erasure, private-file rules, global-erasure completion | 2.4, 2.5a | Appendix A, "Before public MVP" | No build milestone owns them; they gate public MVP (C18, C18a). |
| Crash-alert thresholds and event shape | 2.4 per-app table | Appendix A, M5 | Builder detail. |
| Concept-state write rules | 2.4 table cell and 2.5 | 2.5 only | Stated twice. |
| Refresh-credential rotation | 2.4 and 2.7 (twice) | 2.4 tables plus one 2.7 bullet | Stated three times. |
| Visitor-role rule for public actions | 2.6 and 2.7 | 2.6 | Stated twice. |
| Guide kit-mode hooks, storage limits, observer, CSP | 2.7 (misplaced in the AI-visitor section) | Appendix A, M5; 2.8 keeps the decision | Builder detail for M5; it is a Guide concern, not an AI-door one. |
| Guide release mechanics (`deploy-guide.sh` checks, CORS, `releases.json`, assist-core panel) | 2.8 | Appendix A, M5 | Builder detail. |
| Lock-file JSON example, template-checkout rule | 2.8 | Appendix A, M1 | Builder detail; 2.8 keeps what the lock pins and that it replaces `VENDORED.md`. |
| "Updater refuses to overwrite modified files" | 2.8 and 2.8a | 2.8a | Stated twice. |
| Ajv dispatch, `migrate-spec` usage, source-path rules | 3.1 | Appendix A, M1 | Builder detail; 3.1 keeps the v0/v1 split, the contract hash, and field meanings. |
| Runner mechanics (alias hold), staging test sign-in, fixture app, cleanup, production smoke | 3.3 | Appendix A, M1 | Builder detail; 3.3 keeps staging/production separation, "no production bypass", the staging-vs-smoke distinction, and legacy exceptions. |
| M0 Legends counts, `guide_seen` count, outside-AI classes | 4.1 M0 row | Appendix A, M0 | Long table cell. |
| M3 template-cleanup file list | 4.1 M3 row | Appendix A, M3 | Long table cell; the demonstration column is unchanged. |
| Legends publish fix | 4.1 M6 row, 8.2 | Appendix A, M6 | Builder detail; marked as landed. |
| 2.1, 4.2, 4.3, section 5, 8.3 one-sentence paragraphs | — | Lists or single paragraphs | Same words, fewer lines. |

## Contradictions fixed

1. **`done` could be posted by the app.** The 2.7 route list said `POST /api/soma/v1/me/concepts/:id` records "told, shown, done, or acknowledged". Section 2.5 and the Guide rules say `done` comes only from a successful receipt. The route now records told, shown, or acknowledged, and 2.5 says the broker records `done` when it settles a bound receipt.
2. **Who holds the conformance credential.** `soma.conformance_runs` said the runner writes "with the steward's conformance credential", but 2.4a says the `kit-release` seat runs conformance and `kit-steward` owns no such key. The credential now belongs to `kit-release`, in both places.
3. **`SOMA_APP_INSTALLATION_KEY_NEXT` "during rotation".** The M3 row said the second installation key exists only during rotation. Sections 2.3 and 2.4a and check C12b say every app always holds two overlapping keys. The appendix now says both are always present.
4. **App tables held a column named `grant_id`.** Section 2.2 says apps never receive `grant_id`, yet `action_receipts.grant_id` held the per-app `grant_ref`. The column is renamed `grant_ref`.
5. **"Public reads" of `soma` tables.** `soma.apps` and `soma.app_hosts` allowed "public reads", while 2.3 says no `soma` table is exposed to browser PostgREST. The data model now defines public reads as the broker's unauthenticated discovery calls.
6. **Two names for one worker.** `soma.app_hosts` said "the contact notifier" reads `notify_address`; 2.3b said one scheduled notification worker reads the mail key. Both now say the notification worker.
7. **The example manifest listed one origin.** Section 2.4a registers exactly two origins (production and the `preview--` alias), but the example listed only the alias. The example now lists both, and 3.1 says `register` registers exactly the listed two.
8. **"One-tap recognition offer" versus the neutral control.** Section 1.1 described a "recognition offer" on the app, which reads as the app showing who the person is. Section 2.2 forbids that: the app shows the same neutral control to everyone, and recognition happens on the identity origin. Section 1.1 now says so.
9. **Status page contents.** Section 2.9 said the public status route exposes "only release and pass/fail metadata", while 1.1, 2.8a and 3.3 put the kit lock hash, security-floor state and declared exceptions on it. Section 2.9 now lists all of them as public, and keeps failed-check detail, infrastructure identifiers and evidence URLs behind steward authorization.
10. **"No legacy-app code change" in the two-week slice.** Section 8.2 said the release changes no legacy app, then scheduled the Legends publish fix in week one. It now says the kit release itself changes no legacy app, and the two interim controls are separate. The Legends fix already landed on 2026-10-07 (legends-membership PR #2, `ESTATE.md` changelog), so M6 and 8.2 now say so.
11. **Optional idempotency key.** `executeAction` typed `idempotencyKey` as optional, while 2.6 requires it on every effect request. The signature now carries a comment that it is required for effect actions; it stays optional because `view` and `observe` actions need none.

## Clarifications that are not contradictions

- Section 2.2 now lists the membership roles (`visitor`, `member`, `editor`, `owner`, `admin`). The plan used `editor` in `requiredRole` without ever defining the role set.
- Section 2.4a now sits after the per-app schema, so the data model reads as one block before registration. Its content is unchanged apart from the moves above.

## Not changed, but worth a reviewer's look

- Check C11c tests `invitation` admission, and the two-week slice runs it while excluding invitation consolidation. The no-ticket path does not need tickets, so this is not a contradiction, but the slice's fixture needs an `invitation`-admission app for the check to mean anything.
- Data export and erasure have no build milestone. Golden Journey step 19 needs export inside the four-hour test, but no phase in 4.1 builds it. The appendix groups these constraints under "Before public MVP"; a planner should assign export to a milestone (M3 or M5 fit).
