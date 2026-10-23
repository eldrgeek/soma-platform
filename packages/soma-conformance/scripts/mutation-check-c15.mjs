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

const mutants = [
  {
    name: "script-tag check",
    apply: (source) =>
      source.replace(
        "index.html: missing feedback chip script tag",
        "index.html: missing feedback chip script tag IGNORED",
      ),
    mustCatchTest: /missing feedback chip script tag/,
  },
  {
    name: "missing feedback_chip must fail not not_run",
    apply: (source) =>
      source.replace(
        '["soma-kit.lock.json has no feedback_chip (v1 apps must ship the chip)"]',
        '["soma-kit.lock.json has no feedback_chip IGNORED"]',
      ),
    mustCatchTest: /has no feedback_chip section/,
  },
];

let exitCode = 1;
for (const mutant of mutants) {
  const mutated = mutant.apply(original);
  if (mutated === original) {
    console.error(`mutation-check-c15: could not apply ${mutant.name} mutation`);
    process.exit(1);
  }

  writeFileSync(c15Path, mutated);
  try {
    const passed = runTests();
    if (!passed) {
      console.log(`mutation-check-c15: caught mutant (${mutant.name})`);
      exitCode = 0;
    } else {
      console.error(`mutation-check-c15: mutant was not caught (${mutant.name})`);
      exitCode = 1;
      break;
    }
  } finally {
    writeFileSync(c15Path, original);
  }
}

process.exit(exitCode);
