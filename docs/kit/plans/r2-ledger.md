# Ledger, round 2: integration of Gemini 3.1 Pro revisions

_Integrator: Claude Opus 5.5 (Claude Code), fresh conversation, 2026-10-07. Plan edited: `docs/kit/10-plan.md`._

| Revision id | Title | Decision | One-line reason |
|---|---|---|---|
| R1 | Secure, direct Supabase access for static apps | Somewhat agree | Applied broker-minted JWTs with `app_id` and `app_person_id` claims, and added that they reach only the app's own `app_<app_id>` tables, never the `soma` schema, are signed by a key the project trusts rather than the legacy JWT secret, and are probed under C12. |
| R2 | Principal-scoped idempotency to prevent key collisions | Agree | Applied as given; also scoped the conflicting-input-hash rule to the same principal and stated why. |
| R3 | Asynchronous approval flow for outside AIs | Somewhat agree | Kept the bound approval token instead of replacing it, and made `403 approval_required` plus `approval_url` the way the AI obtains it; added `GET /api/soma/v1/approvals/:id`, the irreversible path, C6 and Golden Journey step 12. |
| R4 | Permit AI-only writes that are reversible | Somewhat agree | Allowed AI-only `reversible` actions only with a reviewed manifest `ui_exception` and receipts that offer undo in the UI, so the person can still see and reverse the effect; tied it to the existing C5 exception. |
| R5 | Require explicit SLA for human escalation | Somewhat agree | Added `expected_response` to the manifest, `soma.app_hosts`, C2 and Golden Journey step 1, framed as a stated expectation rather than a contractual SLA, and kept exposure in the discovery document, which the diff had dropped. |
| R6 | Make manifest hashes verifiable without execution | Agree | Applied to C20 and defined the RFC 8785 canonical hash once in section 3.1 so the beacon, `soma.apps.manifest_sha256` and the evidence bundle use the same value. |

Applied: 2 agree, 4 somewhat, 0 disagree.
