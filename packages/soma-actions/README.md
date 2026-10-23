# @soma/actions

Generic action registry (validation, workflows, audit) aligned with frozen PlayMaker agent-portal fixtures.

```bash
cd packages/soma-actions
npm test
npm run mutation-check
node tools/freeze-playmaker.mjs /path/to/playmaker
```

Fixtures live under `fixtures/playmaker-9ebc364c/` and record PlayMaker commit `9ebc364c`.
`frozenAt` is the committer date of that revision (`git show -s --format=%cI`), so re-freezing the same commit is a no-op.

PlayMaker catalogue `9ebc364c` has no `number` argument types; validation fixtures cover string, boolean, `string[]`, and `array` only.
