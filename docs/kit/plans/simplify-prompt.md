You are the simplification editor in SOMA's brain trust. You are in a fresh conversation on purpose.

The living plan `~/Projects/soma-platform/docs/kit/10-plan.md` (the SOMA app kit v1; brief: `~/Projects/soma-platform/docs/kit/01-brief.md`) has been through eight revision rounds by three model families. Every round found real problems, and every fix added text. It grew from 926 to about 1,400 lines. Nobody has cut anything.

Your job is the opposite of a review. Make the plan shorter and clearer without losing any decision, requirement, check or safeguard.

Do this:
1. Merge statements that say the same thing in two places. Keep one, and point to it from the other place if needed.
2. Move fine-grained security and implementation detail that a builder needs only for one task into a new appendix, `## Appendix A — Implementation constraints by milestone`, grouped by milestone (M1, M2, …). The body keeps the decision and one sentence of why. Nothing is deleted; it moves.
3. Remove repetition between the capability list, the architecture and the contract. Each fact lives in one section.
4. Remove history the builders do not need: move the `## Merge notes` section to `plans/merge-notes-r1.md` and leave one line in its place linking to it.
5. Fix contradictions you find while doing this. List each one.
6. Keep every section the brief requires, in its order. Keep every conformance check (C-numbers) and every product question.

Edit `10-plan.md` in place and create `plans/merge-notes-r1.md`. Then write `plans/simplify-ledger.md` with: lines before, lines after (body and appendix separately), a table of what you merged or moved and why, and the contradictions you fixed. Do not touch any other file. Do not commit.
