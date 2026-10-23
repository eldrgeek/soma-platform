#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const validationPath = join(packageRoot, "src", "validation.mjs");
const registryPath = join(packageRoot, "src", "registry.mjs");

function runTests() {
  const result = spawnSync("node", ["--test", "test/fixtures.test.mjs"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  return result.status === 0;
}

function withRestored(path, mutant, label) {
  const original = readFileSync(path, "utf8");
  if (mutant === original) {
    console.error(`mutation-check: could not apply ${label}`);
    process.exit(1);
  }
  writeFileSync(path, mutant);
  try {
    const passed = runTests();
    if (!passed) {
      console.log(`mutation-check: caught mutant (${label})`);
      return true;
    }
    console.error(`mutation-check: mutant was not caught (${label})`);
    return false;
  } finally {
    writeFileSync(path, original);
  }
}

if (!runTests()) {
  console.error("mutation-check: baseline tests must pass first");
  process.exit(1);
}

const validationOriginal = readFileSync(validationPath, "utf8");
const validationMutant = validationOriginal.replace(
  'return "Arguments must be an object.";',
  'return "Arguments must be an array.";',
);

const registryOriginal = readFileSync(registryPath, "utf8");
const registryMutant = registryOriginal.replace(
  ".catch((cause) => fail(id, args, normalizedActor, { error: asMessage(cause) }));",
  ".then((result) => succeed(id, args, normalizedActor, result));",
);

const caughtValidation = withRestored(validationPath, validationMutant, "src/validation.mjs non-object args message");
const caughtAsync = withRestored(registryPath, registryMutant, "src/registry.mjs async rejection handling");

if (caughtValidation && caughtAsync) {
  process.exit(0);
}
process.exit(1);
