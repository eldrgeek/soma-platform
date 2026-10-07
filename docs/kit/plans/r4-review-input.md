You are a reviewer in a revision round of SOMA's brain trust. The document under review is the living plan `~/Projects/soma-platform/docs/kit/10-plan.md` (the SOMA app kit v1). Its brief is `~/Projects/soma-platform/docs/kit/01-brief.md`. You are in a fresh conversation on purpose: you have no stake in earlier rounds.

Carefully review the entire plan. Then give your best revisions: changes that make it better on architecture, missing capabilities, correctness, security, robustness, simplicity, or usefulness to the people who will use SOMA apps and to the builders who will implement it. Cut what does not earn its place. Check concrete claims against the code under `~/Projects/` where you can.

Do not write a critique essay. Write revisions. For each one give:

### R<n>: <short title>
- **Why:** one to three sentences.
- **Change:** the exact edit as a unified diff against `10-plan.md` (```diff fenced, with enough context lines to locate it), or, for a large new section, the full replacement text and where it goes.

Order revisions by importance. There is no quota: if the plan is close to right, give few revisions. If you think you have found everything, look again; first passes usually miss a good deal.

Output only the revisions document, starting with `# Revisions, round 4, <your model name>`.

Do not read anything in ~/Projects/soma-platform/docs/kit/plans/ except this prompt.
