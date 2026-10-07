# App kit inventory: what exists on 2026-10-07

_Input to the app-kit spec (bead sp-zf0). Research by a Claude Opus 5.5 Explore agent for Mike Wolf, 2026-10-07, read from `origin/master` of soma-platform and playmaker. "pm" = `playmaker`, "lms" = `legends-membership-site` (`legends-greg-changes` is a second checkout of the same repo), "tmpl" = `soma-app-template`. Paths are relative to `~/Projects/`._

## Packaged in soma-platform (PlayMaker runs these from one source)

| Part | Where | Notes |
|---|---|---|
| Sign-in | `soma-platform/packages/soma-signin` (React); older static version `soma-platform/packages/auth`; copies in `lms/js/soma-auth.js`, `legends-connect/js/soma-auth.js` | Spec `SOMA/standards/SOMA-AUTH.md`. Shared Supabase project `omfwcodoimjmbrhssvfl`. |
| Tickets (single-use invitations) | `soma-platform/packages/soma-tickets` | Tables shared across apps through an `app` column. |
| Usage meter (server) | `soma-platform/packages/soma-meter` | The client chip `pm/src/components/UsageChip.tsx` is still PlayMaker-only. |
| Feedback chip (hooks only) | `soma-platform/packages/soma-feedback` | The widget itself is copied: `SOMA/standards/soma-feedback/`, `pm/public/vendor/soma-feedback/` (drifted from canonical), `tmpl/public/vendor/`. |
| Guide / Bill (Tell, Show, Do) | `soma-platform/packages/soma-guide` (served from a CDN) | 22 Legends pages use it. |
| Shared chat window | `soma-platform/packages/soma-assist-core` | |
| Onboarding | `soma-platform/packages/soma-onboard` | One of five invitation variants. |
| Scaffolder + standup-check | `soma-platform/packages/soma-scaffolder` | Scaffold, install, typecheck and build timed at 6.59 s on 2026-10-05. |

## Copy-in templates or `SOMA/standards/` folders

| Part | Where | Notes |
|---|---|---|
| Changelog, admin approval queue | `lms/admin-changelog.html`, `lms/js/changelog-diff.js`, `soma-platform/templates/soma-affordances/changelog/` | Legends' design. |
| Changelog, user-facing "What's new" | `pm/src/features/guide/{Changelog,WhatsNewList}.tsx`, `pm/src/lib/whatsNew.ts`, `pm/netlify/functions/changelog-append.ts` | PlayMaker's design. Different from Legends'. |
| Payments (donate, subscription) | `soma-platform/templates/soma-affordances/billing/`, `SOMA/standards/soma-stripe/`, pm's own functions | Spec `pm/SOMA-STD-billing.md`. |
| Live in-place editing | `SOMA/standards/soma-live-edit/`, `pm/src/features/admin/LiveEdit.tsx` | |
| Admin roles and allowlist | `pm/netlify/functions/lib/appAdmin.ts` (copied to tmpl), `SOMA/standards/soma-allowlist/` | |
| Email sending | `pm/netlify/functions/lib/smtp-send.ts` (copied to tmpl) | |
| Agent pairing and delegation | pm `agent-pair-*.ts`; tmpl migrations `0002_delegations.sql`, `0003`, `0006` | |
| Deployment checks | `SOMA/tools/ship/soma-ship-check.py`, `SOMA/standards/DEPLOY-TARGET-POLICY.md` | |

## Inside one app only

| Part | Where | Notes |
|---|---|---|
| Feedback queue and build requests (the outer improvement loop) | `pm/src/features/admin/FeedbackQueue.tsx`, `pm/netlify/functions/{update-build-request,check-stale-build-requests,dispatch-feedback}.ts` | tmpl has a stub. |
| Error reporting, crash alarm | `pm/src/lib/{errorReport,crashDetect}.ts`, `pm/netlify/functions/{errors,crash-report}.ts` | Shared `soma-errors/` service is dead (last commit 07-08). |
| Agent API, agent portal, llms.txt | `pm/netlify/functions/agent-v1.ts`, `pm/src/agent-portal/`, `pm/public/llms.txt` | |
| AI host chat (V'Eric) | `pm/netlify/functions/{manager-chat,convai-session}.ts` | |
| Themes, reload on new deploy, front-door analytics, share image | pm | |
| Community chat and video | `lms/js/soma-community-{chat,video}.js` | Spec `SOMA/standards/SOMA-COMMUNITY.md`. |
| Small UI pieces (toast, one voice at a time, resume where you left off, tooltip) | `tmpl/src/lib/`, `tmpl/src/components/` | |

## Duplication and gaps

- **Invitations and guest access: about five overlapping versions** (`soma-onboard`, `SOMA/standards/soma-invite/`, `soma-warm-invite/`, `soma-guest-gatehouse/`, PlayMaker's own flow).
- **Two changelog designs** that do different jobs.
- **Legal pages are missing** from every app except a Legends note. PlayMaker's are PR #86, open since 2026-09-12.
- **No single kit spec.** Overlapping catalogs: `soma-platform/docs/soma-apps/AFFORDANCES.md` (+ `APP-SPEC.md`, `BUILD-MODEL.md`), `SOMA/SOMA-APP-STANDARD.md`, `tmpl/SOMA-STANDARD-CHECKLIST.md`, `_shared/CAPABILITY-OWNERS.md`.
