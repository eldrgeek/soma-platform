#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const actionsPath = join(packageRoot, "src", "actions.mjs");

function runTests() {
  const result = spawnSync(process.execPath, ["--test", "test/discovery.test.mjs"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  return result.status === 0;
}

const baseline = runTests();
if (!baseline) {
  console.error("mutation-check: baseline tests must pass first");
  process.exit(1);
}

const original = readFileSync(actionsPath, "utf8");
const mutant = original.replace(
  'action.surfaces.includes("remote")',
  'action.surfaces.includes("ui")',
);

if (mutant === original) {
  console.error("mutation-check: could not apply remote-surface filter mutation");
  process.exit(1);
}

writeFileSync(actionsPath, mutant);

let exitCode = 1;
try {
  const passed = runTests();
  if (!passed) {
    console.log("mutation-check: caught mutant in remote action filter");
    exitCode = 0;
  } else {
    console.error("mutation-check: mutant was not caught by discovery tests");
  }
} finally {
  writeFileSync(actionsPath, original);
}

process.exit(exitCode);
