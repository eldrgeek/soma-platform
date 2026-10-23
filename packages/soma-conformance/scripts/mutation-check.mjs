#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const c14Path = join(packageRoot, "checks", "c14.mjs");

function runTests() {
  const result = spawnSync(process.execPath, ["--test", "test/c14.test.mjs"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  return result.status === 0;
}

const baseline = runTests();
if (!baseline) {
  console.error("mutation-check: baseline C14 tests must pass first");
  process.exit(1);
}

const original = readFileSync(c14Path, "utf8");
const mutant = original.replace("sortValue(value ?? null)", "value ?? null");

if (mutant === original) {
  console.error("mutation-check: could not apply stable field comparison mutation");
  process.exit(1);
}

writeFileSync(c14Path, mutant);

let exitCode = 1;
try {
  const passed = runTests();
  if (!passed) {
    console.log("mutation-check: caught mutant in C14 field comparison");
    exitCode = 0;
  } else {
    console.error("mutation-check: mutant was not caught by C14 tests");
  }
} finally {
  writeFileSync(c14Path, original);
}

process.exit(exitCode);
