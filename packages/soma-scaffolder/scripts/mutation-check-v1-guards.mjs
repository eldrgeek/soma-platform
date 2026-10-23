// Proves v1-source-guards tests catch real breakage in platform/template gates.
// Runs on a copy in a temp folder so the source tree is never mutated.
//
//   node scripts/mutation-check-v1-guards.mjs
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MUTANTS = [
  [
    "src/assertCleanPlatformPackages.mjs",
    '"soma-guide",',
    "",
    "dirty soma-guide is not checked",
  ],
  [
    "src/gitProvenance.mjs",
    "  const onOrigin = assertGitAncestor(cwd, commit, `origin/${defaultBranch}`, { label });",
    "  const onOrigin = true;",
    "platform commit off origin is allowed",
  ],
  [
    "src/gitProvenance.mjs",
    "  } catch (err) {\n    throw new ScaffoldRefusal(\n      `${label}: git fetch origin failed: ${String(err.message).split(\"\\n\")[0]}`",
    "  } catch (err) {\n    return;\n    throw new ScaffoldRefusal(\n      `${label}: git fetch origin failed: ${String(err.message).split(\"\\n\")[0]}`",
    "template fetch failure is ignored",
  ],
  [
    "src/templateProvenance.mjs",
    "  fetchOrigin(templateDir, { label: \"template provenance\" });",
    "",
    "template never fetches origin before branch check",
  ],
  [
    "src/gitProvenance.mjs",
    "  if (rawUrl !== resolvedUrl) {",
    "  if (false && rawUrl !== resolvedUrl) {",
    "url.insteadOf rewrite on origin is allowed",
  ],
  [
    "src/assertCleanPlatformPackages.mjs",
    "    } catch (err) {\n      // A git failure is not a clean tree: refuse rather than skip the gate.\n      throw new ScaffoldRefusal(",
    "    } catch (err) {\n      // A git failure is not a clean tree: refuse rather than skip the gate.\n      continue;\n      throw new ScaffoldRefusal(",
    "git status failure is treated as clean",
  ],
];

const work = await mkdtemp(join(tmpdir(), "scaffolder-v1-guard-mutants-"));
for (const name of ["src", "test", "package.json", "node_modules"]) {
  await cp(join(root, name), join(work, name), { recursive: true });
}

async function guardsPass() {
  try {
    await run(
      process.execPath,
      ["--test", "test/v1-source-guards.test.mjs"],
      { cwd: work, timeout: 120_000 },
    );
    return true;
  } catch {
    return false;
  }
}

if (!(await guardsPass())) {
  console.error("v1-source-guards fails on unmutated copy; fix tests first.");
  process.exit(2);
}

let survivors = 0;
for (const [file, from, to, meaning] of MUTANTS) {
  const path = join(work, file);
  const original = await readFile(path, "utf8");
  if (!original.includes(from)) {
    console.log(`STALE  ${file}: ${meaning}`);
    survivors += 1;
    continue;
  }
  await writeFile(path, original.replace(from, to));
  const caught = !(await guardsPass());
  await writeFile(path, original);
  console.log(`${caught ? "caught  " : "SURVIVED"} ${file}: ${meaning}`);
  if (!caught) survivors += 1;
}

if (survivors > 0) {
  console.error(`\n${survivors} mutant(s) survived.`);
  process.exit(1);
}
console.log("\nAll mutants caught.");

try {
  await run(process.execPath, ["--test"], { cwd: root, timeout: 300_000 });
  console.log("Full soma-scaffolder test suite passed.");
} catch (err) {
  console.error("Full test suite failed after mutation checks.");
  console.error(err.stderr || err.stdout || err.message);
  process.exit(1);
}
