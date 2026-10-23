// Proves cli-refusal tests catch a disabled refusal handler in the CLI bin.
//
//   node scripts/mutation-check-cli-refusal.mjs
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binPath = join(root, "bin/soma-scaffold.mjs");
const MUTANT_FROM = `  if (isScaffoldRefusal(err)) {
    process.stderr.write(formatRefusalStderr(err));
    process.exit(1);
  }`;
const MUTANT_TO = `  if (false && isScaffoldRefusal(err)) {
    process.stderr.write(formatRefusalStderr(err));
    process.exit(1);
  }`;

async function cliRefusalPass() {
  try {
    await run(process.execPath, ["--test", "test/cli-refusal.test.mjs"], {
      cwd: root,
      timeout: 300_000,
    });
    return true;
  } catch {
    return false;
  }
}

if (!(await cliRefusalPass())) {
  console.error("cli-refusal tests fail on unmutated copy; fix tests first.");
  process.exit(2);
}

const original = await readFile(binPath, "utf8");
if (!original.includes(MUTANT_FROM)) {
  console.error("STALE: could not find refusal handler in bin to mutate");
  process.exit(2);
}
await writeFile(binPath, original.replace(MUTANT_FROM, MUTANT_TO));
const caught = !(await cliRefusalPass());
await writeFile(binPath, original);

if (!caught) {
  console.error("mutation-check: mutant survived (cli-refusal tests did not catch disabled handler)");
  process.exit(1);
}
console.log("mutation-check: caught mutant (disabled CLI refusal handler)");
