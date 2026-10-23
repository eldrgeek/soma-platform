#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const meterPath = join(packageRoot, 'src', 'meter.js');

function runTests() {
  const result = spawnSync(process.execPath, ['--test', 'test/store-normalize.test.js'], {
    cwd: packageRoot,
    encoding: 'utf8',
  });
  return result.status === 0;
}

const baseline = runTests();
if (!baseline) {
  console.error('mutation-check: baseline store-normalize tests must pass first');
  process.exit(1);
}

const original = readFileSync(meterPath, 'utf8');
const mutant = original.replace(
  `  if (typeof store.resolveStudioId === 'function') {
    const resolveStudioId = store.resolveStudioId.bind(store);
    return {
      ...store,
      resolveBillingSubject: resolveStudioId,
    };
  }`,
  '',
);

if (mutant === original) {
  console.error('mutation-check: could not apply resolveStudioId fallback removal');
  process.exit(1);
}

writeFileSync(meterPath, mutant);

let exitCode = 1;
try {
  const passed = runTests();
  if (!passed) {
    console.log('mutation-check: caught mutant (removed resolveStudioId fallback)');
    exitCode = 0;
  } else {
    console.error('mutation-check: mutant survived store-normalize tests');
  }
} finally {
  writeFileSync(meterPath, original);
}

process.exit(exitCode);
