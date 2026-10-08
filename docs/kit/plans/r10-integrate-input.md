You are the integrator in a revision round of SOMA's brain trust. You are in a fresh conversation on purpose.

Inputs:
- The living plan `~/Projects/soma-platform/docs/kit/10-plan.md` (the SOMA app kit v1) and its brief `~/Projects/soma-platform/docs/kit/01-brief.md`.
- A reviewer's revisions: `~/Projects/soma-platform/docs/kit/plans/r10-revisions-claude.md`.

Read the plan, the brief and every revision. For each revision decide one of:
- **Agree** — apply it as given.
- **Somewhat agree** — apply a better version of it; say what you changed.
- **Disagree** — do not apply; say why in one or two sentences.

Then apply your decisions by editing `10-plan.md` in place. Keep the plan coherent: when a change in one section implies changes elsewhere, make them. Do not make changes no revision asked for, except to keep the plan consistent. Keep the merge notes section as history; do not rewrite it.

Finally write `~/Projects/soma-platform/docs/kit/plans/r10-ledger.md` with a table: revision id | title | decision | one-line reason. End it with one line: `Applied: <a> agree, <s> somewhat, <d> disagree.`

Do not touch any other file. Do not commit.

Judge each revision on its merits; check claims against the code before agreeing. Per-milestone detail goes in Appendix A, not the body. Disagree with revisions that only add detail a builder could derive from a bead.
