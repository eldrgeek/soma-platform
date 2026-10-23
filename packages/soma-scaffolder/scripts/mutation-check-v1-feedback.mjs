#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const testPath = join(packageRoot, "test", "scaffoldReactApp.v1-feedback.test.mjs");

function runFeedbackTests() {
  const result = spawnSync(
    process.execPath,
    ["--test", "test/scaffoldReactApp.v1-feedback.test.mjs"],
    { cwd: packageRoot, encoding: "utf8", timeout: 900_000 },
  );
  return result.status === 0;
}

if (!runFeedbackTests()) {
  console.error("mutation-check-v1-feedback: baseline feedback tests must pass first");
  process.exit(2);
}

const original = readFileSync(testPath, "utf8");
const mutant = original.replace(
  'assert.match(html, /data-label="Feedback"/);',
  'assert.match(html, /data-label="Ignored"/);',
);

if (mutant === original) {
  console.error("mutation-check-v1-feedback: could not apply data-label assertion mutation");
  process.exit(1);
}

writeFileSync(testPath, mutant);

let exitCode = 1;
try {
  if (!runFeedbackTests()) {
    console.log("mutation-check-v1-feedback: caught mutant in feedback label assertion");
    exitCode = 0;
  } else {
    console.error("mutation-check-v1-feedback: mutant survived");
  }
} finally {
  writeFileSync(testPath, original);
}

process.exit(exitCode);
