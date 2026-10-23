#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const c15Path = join(packageRoot, "checks", "c15.mjs");

function runTests() {
  const result = spawnSync(process.execPath, ["--test", "test/c15.test.mjs"], {
    cwd: packageRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
  return result.status === 0;
}

const baseline = runTests();
if (!baseline) {
  console.error("mutation-check-c15: baseline C15 tests must pass first");
  process.exit(1);
}

const original = readFileSync(c15Path, "utf8");
const mutant = original.replace(
  "index.html: missing feedback chip script tag",
  "index.html: missing feedback chip script tag IGNORED",
);

if (mutant === original) {
  console.error("mutation-check-c15: could not apply script-tag mutation");
  process.exit(1);
}

writeFileSync(c15Path, mutant);

let exitCode = 1;
try {
  const passed = runTests();
  if (!passed) {
    console.log("mutation-check-c15: caught mutant in C15 script-tag check");
    exitCode = 0;
  } else {
    console.error("mutation-check-c15: mutant was not caught by C15 tests");
  }
} finally {
  writeFileSync(c15Path, original);
}

process.exit(exitCode);
