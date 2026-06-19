# The build model — the dark factory

How an approved [app spec](APP-SPEC.md) becomes a live Soma app. The principle:
**agents build, humans assist, and the human watches what the workers are doing and
thinking — not the code.** It's a dark factory with a glass wall.

## Topology: repo-per-app, site-per-app, push-to-rebuild

Each Soma app is its own:

- **Git repo** — scaffolded fresh per app.
- **Netlify site** — connected to that repo; **push to rebuild**, deploy previews on
  PRs, production on the main branch.
- **Supabase project** — its own, or sharing the SOMA project for `soma_profiles`
  (see the open question in APP-SPEC.md).

This mirrors how Legends and Levinese already run, generalized from "modify one app"
to "stand up a new one."

## The build sequence

```
approved spec
  → scaffold repo (templates + chosen affordances)
  → create Netlify site + set env vars
  → run schema.sql in Supabase (only the tables the enabled affordances need)
  → fill placeholders from the spec; wire page includes in order
  → deploy preview
  → human sign-off (Review with Bill / Change Log)
  → promote to production (push to main)
```

Every step maps to an existing piece. The scaffolder is the
`templates/soma-affordances/` kit plus `auto-mapper` (to seed the `siteMap`). The
placeholder-fill is the INTEGRATION-CHECKLIST executed from the spec instead of by
hand. The sign-off is the Change Log's existing accept/preview flow.

## Who builds: agents with human assist

The team is **human-manager + AI specialists**. The workers are **`cc-dispatch`**
jobs — the canonical local delegate that runs multi-turn agentic work, writes
structured reports, and reports status. The build is a fan-out of dispatched workers,
each owning a slice (scaffold, schema, config, deploy). The human guide/manager owns
judgment and approvals; AI specialists do the work.

### Adaptive autonomy — checkpoints scale with the human

How much the human decides vs. defers is a function of the requester's skill and
intent (`requester_skill` in the spec):

- **Low-skill requester:** the team makes all the decisions and builds; the human
  reviews the result and **changes what they don't like.** Few up-front gates.
- **High-skill requester:** the human edits the spec directly and gates more steps.

The default for an unknown requester is team-decides-with-easy-undo, because every
change is reversible (preview before production; revert is just another change
request).

The routing/vetting spine is the same one Intake already uses: the
`claude-email-daemon` (`_second_opinion` for safety/reversibility, role-based
auto-dispatch vs escalate-to-approval) and the Change Log queue as the approval
surface.

## The glass wall: observation without code

The dark factory's defining feature is **what the human sees**: which workers are
active and **what each is currently working on (status), with the ability to drill
into its thinking trace.** The default view is status; the human can open any
worker's reasoning to follow how it's thinking — **not** to read diffs. The human
supervises intent and progress, not source.

**This is also a learning loop, not just supervision.** A stated goal is to *learn
from what the workers think about* — so the thinking trace is a first-class,
browsable artifact (retained, searchable), not an ephemeral debug stream. Drill-in
should make a worker's reasoning legible to a human who wants to understand it, and
worth mining later.

This is not new infrastructure. It's three existing layers pointed at one surface:

- **`cc-dispatch`** already emits per-job status, transcripts, and structured
  reports — that *is* the "what it's doing / thinking" stream.
- **`soma-console`**'s fleet panel already launches dispatches and watches
  status/transcripts — the raw observability.
- **The Room** (community tier) turns that fleet telemetry into a *watchable place* —
  presence and ambient activity — instead of a developer console.

So the observation surface for building a Soma app is itself a **Soma Room**. The
recursion closes: the thing that builds Soma apps is a Soma app, and the place you
watch it build is a Soma Room. Build that Room well once and it serves both as a
community affordance apps can include and as the factory's glass wall.

## Decisions

- **Worker thought model:** surface **current status** by default, with **drill-in to
  the full thinking trace**; retain traces as browsable artifacts for learning, not
  just live debugging.
- **The scaffolder is a new package** — `soma-platform/packages/soma-scaffolder/`
  (name TBD). It consumes an approved spec and emits a repo + Netlify site +
  Supabase setup from the affordances kit, idempotently.
- **Checkpoints are adaptive** (see above) — gated by `requester_skill`, with
  team-decides-with-easy-undo as the default.

## Still to design / build

1. **The trace shape `cc-dispatch` emits** and how the Room renders status + drill-in
   (summarize for the glass wall; keep the full trace addressable underneath).
2. **The `soma-scaffolder` package** — ✅ v0 built (`packages/soma-scaffolder/`).
   `validate` + `scaffold` (spec → per-affordance files, round-tripped on Legends) +
   `provision` (emits a reviewable, dry-run-by-default `provision.sh`: repo → push →
   Netlify site + env → Supabase SQL → deploy; secrets stay in the environment).
   Next: intent→action expansion for the Do registry; ajv-backed validation; actually
   wiring `provision.sh` execution into the dispatch fleet.
3. **Room/fleet wiring** — FrontRow today is a theater, not a generalized Room, and
   `soma-console` (the fleet panel) is at design-v0; both need build-out before the
   glass wall is real. Grounded in source (see AFFORDANCES.md); flagged honestly.
