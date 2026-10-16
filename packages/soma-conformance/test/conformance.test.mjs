import test from "node:test";
import assert from "node:assert/strict";
import {
  appendFileSync,
  cpSync,
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

function readManifest(repositoryRoot) {
  return JSON.parse(readFileSync(manifestPath(repositoryRoot), "utf8"));
}

function writeManifest(repositoryRoot, manifest) {
  writeFileSync(manifestPath(repositoryRoot), `${JSON.stringify(manifest, null, 2)}\n`);
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
    "3061f27a2334aae91fa33a8bcfba9aa4887264d34c4661d4669eee38187d2064",
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
  manifest.actions[1].risk = "consequential";
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
