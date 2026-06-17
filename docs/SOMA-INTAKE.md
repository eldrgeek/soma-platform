# SOMA Intake — Bill as the intelligent change membrane

When a user mentions a bug or a desired change in conversation, Bill runs a
context-rich intake, has a smart model vet it for safety, and routes it into the
existing build pipeline — to a dev worker directly (for permitted requesters) or
to a manager for approval (everyone else). Bill is the front door; the Change
Log + cc-dispatch + preview/deploy are the back office we already built.

## Flow

1. **Trigger.** In any conversation, Bill detects a bug report / change request
   intent ("I noticed X is broken", "could you change Y").
2. **Handoff.** Bill says "let me bring in our intake specialist" and switches to
   a **specialist persona** (different avatar/voice/greeting — "same Bill, different
   costume") to run a structured intake.
3. **Context (from the always-on observer).** The specialist already knows: the
   page, where on the page, and the user's recent actions. It opens with
   "Is this about *<the thing you just did>*?" — and for questions, the same.
4. **Identify.** If not logged in, ask name (+ email for follow-up). If logged in,
   pull the `soma_profiles` record (who they are, what they know).
5. **Capture.** User explains → Bill **restates it back** until they agree. Optional:
   user *shows* Bill (Bill observes the interaction), user **points to** the relevant
   area, Bill takes a **screenshot**.
6. **Vet.** The assembled request (text + page + recent actions + screenshot +
   requester) goes to a **strong thinking model** (the daemon's `_second_opinion`
   rubric) for safety/feasibility/reversibility.
7. **Route by role.**
   - Requester is a manager / admin-permitted → straight to a **dev worker**
     (`cc-dispatch`), per the breaking/non-breaking deploy policy.
   - Otherwise → **manager approval**: file into the Change Log queue. Bill opens
     the Change Log page to show the manager the task is queued.
8. **Notify.** On completion or decline, email the requester (captured address).

## Reuses what exists
- Safety vet: `claude-email-daemon` `_second_opinion` (reversibility/blast-radius).
- Dispatch to dev: `cc-dispatch`; deploy gate: breaking→preview / non-breaking→push.
- Approval queue + preview + publish-on-accept: `admin-changelog.html`.
- Role/identity: `isAdmin` + `soma_profiles`.
- Recording substrate: `bill_transcripts` + the engine `_log` decision trace.

## New components to build
1. **Always-on observer** — a lightweight page-activity recorder (navigations,
   clicks with element labels, JS errors; **never** form input values). Feeds the
   "is this about <last action>?" opener and the request context. Privacy: labels
   and selectors, not contents; per-session, opt-out aware.
2. **Specialist persona handoff** — mid-session switch to an intake persona
   (avatar/voice/greeting/prompt). Engine already personas via config; add a
   `cfg.personas.intake` + a `handoffTo('intake')` that re-skins + re-voices.
3. **Screenshot** — capture the host page (html2canvas) attached to the request.
   In iframe delivery this runs in the host shim.
4. **Active-task health in the Change Log** — in-progress items show age/runtime,
   running/stalled/errored status, last heartbeat. Source: cc-dispatch status
   (a `bill_tasks` row or status file the dispatcher updates) surfaced in the page.

## Review the completed change (closes the loop)

On a Change Log card for a **completed** change, a "Review with Bill" affordance.
Bill takes over: "Let me show you what we did," **navigates to the exact place**
(the entry's `page`/anchor — already stored and driving the inline preview), walks
through *what changed* (narrating the entry summary + the agent's completion
report), then converses: "Does this look right, or want changes?"
- Happy → **Accept** (the sign-off we already built) — loop closed.
- Wants changes → drops straight into **intake** (Phase 1) as a refinement request.

Reuses: changelog `page` field, the Show walkthrough engine (navigate + narrate),
Accept, and the intake flow. New: the card affordance + sourcing "what changed"
from the entry summary + audit report.

## Routing backbone (Phase 2) — reuse the email daemon

The `claude-email-daemon` already IS the vet + role-route + dispatch + notify
pipeline: `_second_opinion` (safety/reversibility), trusted-requester tiers
(owner/member → auto-dispatch vs escalate-to-manager), `cc-dispatch` to a dev
worker, and completion emails. So Bill's structured intake should **feed that
pipeline** rather than re-implement it. Cleanest bridge (no new secrets): intake
writes to a `change_requests` Supabase table; the daemon polls it (alongside email),
runs each through the same classify→route logic, marks processed, and notifies the
captured requester email on done/declined. Manager-approval items surface in the
Change Log queue; auto-dispatch items go straight to `cc-dispatch`.

## Unified queue + approval model (canonical)

One queue (`change_requests`), two front doors:
- **Bill conversation** (primary) → writes a request.
- **Email** (still supported) → the daemon enqueues it, treated identically.

The daemon is the **queue processor**: vet (`_second_opinion`) → decide approval →
route. Approval need = function of requester + vet:
- Requester is **Greg/owner** → no approval; safety-vetted, then auto-proceeds.
- Requester is **other** → approval may be required (non-trivial / breaking / by
  policy). If required → status `awaiting-approval`, emailed to Greg, shown in the
  Change Log. If not → auto-proceeds.

Greg's **two approvals**, both in the Change Log:
1. **Approve** a pending request → kicks off the build (pre-build gate, when needed).
2. **Review work** on a completed change → sign-off (Accept lives here; this is the
   "Review with Bill" walkthrough).

### Change Log states → card buttons
| State | Meaning | Buttons |
|-------|---------|---------|
| `awaiting-approval` | needs Greg's go before building | **Approve** · **Cancel** |
| `in-progress` | dev worker building | (progress/health) · **Cancel** |
| `awaiting-review` | built; needs sign-off | **Review work** (→ Accept) · **Revert** |
| `accepted` | signed off | **Revert** |
| `declined` / `cancelled` | terminal | — |

## Suggested improvements
1. **Show the vet's reasoning on the card.** Store and display *why* a request needs
   approval (or why it auto-proceeded) — reversibility/risk/one-line reason. Trust +
   diagnosability, same spirit as the decision trace.
2. **Revert = just another (reversible) change request.** Store the commit SHA on
   completed entries; "Revert" files a revert request (git revert + redeploy) through
   the same gate. Makes the "tricky" one tractable and auto-approvable.
3. **Link each queue item to its origin transcript** (`bill_transcripts`) so Greg sees
   the full intake context (page, recent actions, the conversation) when approving.
4. **Approval as a deep-linked digest, not spam.** One email → a link straight to the
   Change Log item (or a periodic "N awaiting" digest) rather than an email per item.
5. **Approve-with-edits.** Let Greg tweak the request text before approving.
6. **De-dup / link duplicates.** Same ask from multiple people → one task, notify all.
7. **Cancel semantics by state.** Pending → drop from queue; in-progress → signal the
   dev worker to stop.

## Phased plan
- **Phase 1 — Observer + intake handoff (conversational core).** ✅ DONE (preview).
  Activity observer; bug/change intent detection; specialist persona handoff;
  context-aware opener; restate-to-agreement → structured request object.
- **Phase 2 — Vet + route + register.** Name/email capture for anon; route the
  structured request into the email-daemon pipeline (vet + role-route + dispatch +
  notify) via the `change_requests` bridge above; manager items to the Change Log
  queue; notify on done/declined.
- **Phase 3 — Review the completed change.** "Review with Bill" on a completed card;
  navigate + narrate what changed; converse → Accept or → new refinement intake.
- **Phase 4 — Show-me / screenshot / point-to + Change-Log health.** User-shows-Bill
  observation, point-to-area, screenshot attach; active-task runtime/health in the
  Change Log.

## Decisions
- Observer scope: ✅ nav + clicks + errors + input focus, privacy-guarded values.
- Specialist persona: ✅ separate voice agent supported (slot), defaults to same.
- Screenshot: deferred to Phase 4.
- **Phase 2 routing mechanism: open** — daemon polls `change_requests` (recommended),
  vs intake→email into the daemon, vs a self-contained function (manager-queue only).
