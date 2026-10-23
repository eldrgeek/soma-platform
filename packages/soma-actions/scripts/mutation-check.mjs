#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const validationPath = join(packageRoot, "src", "validation.mjs");

function runTests() {
  const result = spawnSync("node", ["--test", "test/fixtures.test.mjs"], {
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

const original = readFileSync(validationPath, "utf8");
const mutant = original.replace(
  'return "Arguments must be an object.";',
  'return "Arguments must be an array.";',
);

if (mutant === original) {
  console.error("mutation-check: could not apply validation mutation");
  process.exit(1);
}

writeFileSync(validationPath, mutant);

let exitCode = 1;
try {
  const passed = runTests();
  if (!passed) {
    console.log("mutation-check: caught mutant in src/validation.mjs (non-object args message)");
    exitCode = 0;
  } else {
    console.error("mutation-check: mutant was not caught by fixture tests");
  }
} finally {
  writeFileSync(validationPath, original);
}

process.exit(exitCode);
