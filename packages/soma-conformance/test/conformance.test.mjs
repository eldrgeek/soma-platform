import test from "node:test";
import assert from "node:assert/strict";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CHECK_IDS,
  reportPassed,
  runConformance,
} from "../src/index.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = join(testDirectory, "fixtures", "minimal-app");
const cli = join(testDirectory, "..", "bin", "soma-conform.mjs");
const builtChecks = new Set(["C1", "C3", "C4", "C5", "C13"]);

function copyFixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "soma-conformance-"));
  const repositoryRoot = join(parent, "app");
  cpSync(fixture, repositoryRoot, { recursive: true });
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return repositoryRoot;
}

function manifestPath(repositoryRoot) {
  return join(repositoryRoot, "soma-app.json");
}

function lockPath(repositoryRoot) {
  return join(repositoryRoot, "soma-kit.lock.json");
}

function readManifest(repositoryRoot) {
  return JSON.parse(readFileSync(manifestPath(repositoryRoot), "utf8"));
}

function writeManifest(repositoryRoot, manifest) {
  writeFileSync(manifestPath(repositoryRoot), `${JSON.stringify(manifest, null, 2)}\n`);
}

function readLock(repositoryRoot) {
  return JSON.parse(readFileSync(lockPath(repositoryRoot), "utf8"));
}

function writeLock(repositoryRoot, lock) {
  writeFileSync(lockPath(repositoryRoot), `${JSON.stringify(lock, null, 2)}\n`);
}

async function run(repositoryRoot) {
  return runConformance({
    manifest: readManifest(repositoryRoot),
    repositoryRoot,
    tier: "prototype",
  });
}

function check(report, id) {
  return report.checks.find((candidate) => candidate.id === id);
}

function assertCheckFails(report, id, reasonPattern) {
  const result = check(report, id);
  assert.equal(result.result, "fail", `${id} should fail`);
  assert.match(result.reasons.join("\n"), reasonPattern);
}

function runCli(repositoryRoot, json = false) {
  return spawnSync(process.execPath, [
    cli,
    "--contract", manifestPath(repositoryRoot),
    "--repo", repositoryRoot,
    "--tier", "prototype",
    ...(json ? ["--json"] : []),
  ], {
    encoding: "utf8",
    timeout: 10_000,
  });
}

function assertCliFails(repositoryRoot, id) {
  const result = runCli(repositoryRoot);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, new RegExp(`^${id} fail:`, "m"));
}

test("minimal app passes the five static checks and discloses all omitted coverage", async (t) => {
  const repositoryRoot = copyFixture(t);
  const report = await run(repositoryRoot);

  assert.equal(reportPassed(report), true);
  assert.equal(
    report.contract_sha256,
    "89ca1cda6b736698bb00c64279b50fdd164f64354ed880248a8a437503d97751",
  );
  assert.deepEqual(report.checks.map(({ id }) => id), CHECK_IDS);
  for (const result of report.checks) {
    if (builtChecks.has(result.id)) {
      assert.equal(result.result, "pass", result.reasons.join("\n"));
    } else {
      assert.deepEqual(result, {
        id: result.id,
        result: "not_run",
        reasons: ["not built in M1 slice 2"],
      });
    }
  }

  const cliResult = runCli(repositoryRoot, true);
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.deepEqual(JSON.parse(cliResult.stdout), report);
});

test("C5 fails when an effect action loses its UI binding", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  manifest.actions[1].surfaces = ["guide", "remote"];
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C5", /surfaces needs a ui binding/);
  assertCliFails(repositoryRoot, "C5");
});

test("C4 fails when an action executor is removed", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  delete manifest.actions[0].executor;
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C4", /actions\[0\]\.executor/);
  assertCliFails(repositoryRoot, "C4");
});

test("C5 refuses a UI exception on a consequential action", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  manifest.actions[1].ui_exception = { reason: "Use the Guide instead" };
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C5", /ui_exception is refused for consequential risk/);
  assertCliFails(repositoryRoot, "C5");
});

test("C13 fails when one byte of a locked vendored package changes", async (t) => {
  const repositoryRoot = copyFixture(t);
  appendFileSync(join(repositoryRoot, "vendor", "soma", "actions", "index.mjs"), " ");

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C13", /packages\.@soma\/actions\.sha256/);
  assertCliFails(repositoryRoot, "C13");
});

test("C13 fails when the manifest no longer matches the locked contract hash", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  manifest.app.name = "Changed coaching app";
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C13", /contract_sha256 .* does not match/);
  assertCliFails(repositoryRoot, "C13");
});

test("C4 and C13 reject a symlinked schema path", async (t) => {
  const repositoryRoot = copyFixture(t);
  const schema = join(repositoryRoot, "schemas", "inspect-agenda.input.json");
  rmSync(schema);
  symlinkSync("inspect-agenda.output.json", schema);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C4", /input_schema .*symlink/);
  assertCheckFails(report, "C13", /referenced source path: .*symlink/);
  assertCliFails(repositoryRoot, "C13");
});

test("C3 fails when a concept version is removed", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  delete manifest.concepts[0].version;
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C3", /concepts\[0\]\.version/);
  assertCliFails(repositoryRoot, "C3");
});

test("C1 reports an invalid manifest field", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  manifest.app.tier = "invalid-tier";
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C1", /manifest field \/app\/tier/);
  assertCliFails(repositoryRoot, "C1");
});

test("C3 rejects an ID outside SOMA and app namespaces", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  manifest.questions[0].id = "another-app:coaching-goal";
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C3", /questions\[0\]\.id .*must use the soma: namespace or app namespace/);
  assertCliFails(repositoryRoot, "C3");
});

test("C4 requires risk on an effect action", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  delete manifest.actions[1].risk;
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C4", /actions\[1\]\.risk is required/);
  assertCliFails(repositoryRoot, "C4");
});

test("C4 requires an effect target on an effect action", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  delete manifest.actions[1].effect_target;
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C4", /actions\[1\]\.effect_target is required/);
  assertCliFails(repositoryRoot, "C4");
});

test("C4 requires a timeout on an external effect", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  delete manifest.actions[2].timeout_seconds;
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C4", /actions\[2\]\.timeout_seconds .*external effect/);
  assertCliFails(repositoryRoot, "C4");
});

test("C4 requires recovery on an external effect", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  delete manifest.actions[2].recovery;
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C4", /actions\[2\]\.recovery .*external effect/);
  assertCliFails(repositoryRoot, "C4");
});

test("C4 requires a cool-off on an irreversible action", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  delete manifest.actions[3].cool_off_seconds;
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C4", /actions\[3\]\.cool_off_seconds .*irreversible action/);
  assertCliFails(repositoryRoot, "C4");
});

test("C4 rejects a schema file that is not JSON", async (t) => {
  const repositoryRoot = copyFixture(t);
  const schemaPath = join(repositoryRoot, "schemas", "inspect-agenda.input.json");
  writeFileSync(schemaPath, "{not-json}\n");

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C4", /actions\[0\]\.input_schema "schemas\/inspect-agenda\.input\.json"/);
  assertCliFails(repositoryRoot, "C4");
});

test("C13 rejects an absolute referenced source path", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  manifest.actions[0].input_schema = "/tmp/input.json";
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C13", /referenced source path: .*repository-relative: \/tmp\/input\.json/);
  assertCliFails(repositoryRoot, "C13");
});

test("C13 rejects traversal in a referenced source path", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  manifest.actions[0].input_schema = "../input.json";
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C13", /referenced source path: .*must not contain '\.\.': \.\.\/input\.json/);
  assertCliFails(repositoryRoot, "C13");
});

test("C13 rejects a vendored package absent from the lock", async (t) => {
  const repositoryRoot = copyFixture(t);
  const packageDirectory = join(repositoryRoot, "vendor", "soma", "other");
  mkdirSync(packageDirectory);
  writeFileSync(join(packageDirectory, "index.mjs"), "export {};\n");

  const report = await run(repositoryRoot);
  assertCheckFails(
    report,
    "C13",
    /vendor\/soma\/other: vendored package @soma\/other is not pinned/,
  );
  assertCliFails(repositoryRoot, "C13");
});

test("C13 rejects a removed lock entry for an existing package", async (t) => {
  const repositoryRoot = copyFixture(t);
  const lock = readLock(repositoryRoot);
  delete lock.packages["@soma/actions"];
  writeLock(repositoryRoot, lock);

  const report = await run(repositoryRoot);
  assertCheckFails(
    report,
    "C13",
    /vendor\/soma\/actions: vendored package @soma\/actions is not pinned/,
  );
  assertCliFails(repositoryRoot, "C13");
});

test("C13 rejects a lock entry whose package directory is missing", async (t) => {
  const repositoryRoot = copyFixture(t);
  rmSync(join(repositoryRoot, "vendor", "soma", "actions"), {
    recursive: true,
  });

  const report = await run(repositoryRoot);
  assertCheckFails(report, "C13", /packages\.@soma\/actions:.*vendor\/soma\/actions/);
  assertCliFails(repositoryRoot, "C13");
});

test("C5 does not apply the effect exception rule to an observe action", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  manifest.actions[0].ui_exception = { reason: "Not an effect action" };
  writeManifest(repositoryRoot, manifest);

  const report = await run(repositoryRoot);
  assert.equal(check(report, "C5").result, "pass");
  assertCliFails(repositoryRoot, "C1");
});

test("malformed action collection fails without crashing the CLI", (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  manifest.actions = {};
  writeManifest(repositoryRoot, manifest);

  const result = runCli(repositoryRoot);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /^C1 fail:.*\/actions must be array/m);
  assert.match(result.stdout, /^C4 fail: manifest\.actions must be an array/m);
  assert.match(result.stdout, /^C5 fail: manifest\.actions must be an array/m);
  assert.doesNotMatch(result.stdout, /check could not complete|entries is not a function/);
});
