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

## Phased plan
- **Phase 1 — Observer + intake handoff (conversational core).** Activity observer;
  bug/change intent detection; specialist persona handoff; context-aware opener;
  restate-to-agreement. Output: a structured request object (no routing yet).
- **Phase 2 — Vet + route + register.** Name/email capture for anon; strong-model
  safety vet; role-based routing (dev-worker vs manager queue); requester email on
  the request; notify on done/declined.
- **Phase 3 — Show-me / screenshot / point-to + Change-Log health.** User-shows-Bill
  observation, point-to-area, screenshot attach; active-task runtime/health in the
  Change Log.

## Open decisions (need Mike)
- Observer scope: clicks+nav+errors only (recommended), or more?
- Screenshot: build now (html2canvas) or Phase 3?
- Specialist persona: separate ElevenLabs voice agent, or same agent + different
  prompt/avatar?
