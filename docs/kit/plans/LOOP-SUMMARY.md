# The first brain-trust convergence loop: what happened

_Bead sp-zf0. Run 2026-10-07 by Claude Opus 5.5 (Claude Code, lead seat) for Mike Wolf, after he asked to take the planning half of Jeffrey Emanuel's agentic coding flywheel and make the app kit "our first attempt". This page records the loop so the next one can be compared with it._

## Rounds

| Round | Reviewer | Integrator | Revisions | Applied (agree / somewhat / disagree) | Lines changed | Plan length | Share changed |
|---|---|---|---|---|---|---|---|
| 0 | Sol, Claude, Gemini each wrote a plan | — | — | — | — | 932 / 622 / 93 | — |
| 1 | — | Sol merged the three | — | — | — | 926 | — |
| 2 | Gemini 3.1 Pro | Claude Opus | 6 | 2 / 4 / 0 | 70 | 962 | 7% |
| 3 | Claude Opus | Sol | 23 | 22 / 1 / 0 | 409 | 1,124 | 36% |
| 4 | Sol | Claude Opus | 13 | 8 / 5 / 0 | 361 | 1,183 | 30% |
| 5 | Gemini 3.1 Pro | Claude Opus | 6 | 1 / 5 / 0 | 69 | 1,202 | 6% |
| 6 | Claude Opus | Sol | 16 | 9 / 7 / 0 | 185 | 1,303 | 14% |
| 7 | Sol | Claude Opus | 12 | 3 / 9 / 0 | 260 | 1,399 | 19% |
| 8 | Claude Opus | Sol | 23 | 16 / 7 / 0 | 157 | 1,478 | 11% |
| S | Claude Opus simplification: body 1,442 → 1,191 lines, 207 lines moved to Appendix A, 11 contradictions fixed | | | | | 1,398 | — |
| 9 | Sol | Claude Opus | 11 | 3 / 8 / 0 | 122 | 1,422 | 8.6% |
| 10 | Claude Opus | Sol | 9 | 4 / 5 / 0 | 87 | 1,433 | 6.1% |
| 11 | Sol | Claude Opus | 10 | 1 / 9 / 0 | 72 | 1,443 | 5.0% |
| 12 | Claude Opus | Sol | 17 | 13 / 4 / 0 | 82 | 1,457 | 5.6% |

Sol = OpenAI `gpt-5.6-sol` through Codex at high reasoning. Gemini = `Gemini 3.1 Pro (High)` through `agy`; it could not read files or code. Grok was skipped because its CLI was logged out.

## Where it stopped, and why

- The stop rule was "a round changes under 5% of lines". Rounds 10–12 changed 6.1%, 5.0% and 5.6%. By size, the plan converged.
- By substance it did not fully converge. Round 12 still found two database trust-boundary defects (cross-app capture through PostgreSQL's temporary schema; a migration runner able to leave the app role). Claude's reviews found 23, 16, 23, 9 and 17 revisions in its last five turns.
- Security review of a design does not run out of findings. Further rounds would keep finding them at falling value. The remaining depth belongs in a per-milestone threat checklist and a security review of the built code, not in more plan rounds.

## What we learned about the loop

1. **Revisions, not critiques, worked.** Every round changed the one plan; nothing piled up as prose.
2. **Integrators differ.** Sol accepted 22 of 23 as written in round 3; Claude rarely accepts as written and usually improves the revision. No revision was ever rejected outright, which suggests the integrator prompt should make rejection easier.
3. **Reviewers differ.** Gemini without code access found internal contradictions only (6 each time). Claude with code access found the most real defects, including a live exposure on the Legends site (fixed the same day).
4. **Plans grow unless someone cuts.** The plan grew every round until a dedicated simplification round. Build a simplification pass into the loop every three or four rounds.
5. **Raise the bar mid-loop.** From round 9 the review prompt said to prefer real defects over detail a builder could derive from a bead. That is what brought rounds under 10%.
6. **Line share alone is a weak stop signal.** Next loop: tag every revision product / architecture / detail (started in round 12), and stop when a full round changes no product decision and no architecture boundary.
7. **Cost in wall time:** 15:00 to 21:43 EDT on 2026-10-07, about 6¾ hours, of which almost 3 hours were a pause between rounds 5 and 6 waiting for Mike to say "keep going". Codex steps took 15–35 minutes; Claude steps 2–18 minutes.
