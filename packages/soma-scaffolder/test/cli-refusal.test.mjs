// CLI refusal output (bead sp-nju): refusals exit 1 with Error: lines, no stack; bugs still stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCleanPlatformRepo,
  initBareOrigin,
  runGit,
  TEMPLATE_GITHUB_ORIGIN,
  toFileOriginUrl,
  wireFileOriginToBare,
} from "./gitTestHelpers.mjs";

const SCAFFOLDER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(SCAFFOLDER_ROOT, "bin", "soma-scaffold.mjs");
const MONOREPO_ROOT = join(SCAFFOLDER_ROOT, "..", "..");
const FIXTURE_MANIFEST = join(SCAFFOLDER_ROOT, "test", "fixtures", "v1-disposable", "soma-app.json");

function writeMinimalTemplateTree(dir) {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "soma-app-template", private: true }, null, 2) + "\n",
  );
  writeFileSync(join(dir, "index.html"), "<!doctype html><html><head><title>T</title></head><body></body></html>\n");
  mkdirSync(join(dir, "src", "lib"), { recursive: true });
  mkdirSync(join(dir, "netlify", "functions", "lib"), { recursive: true });
  const appConfig = `export const APP_ID = 'template';\nexport const APP_NAME = 'Template';\n`;
  writeFileSync(join(dir, "src", "lib", "appConfig.ts"), appConfig);
  writeFileSync(join(dir, "netlify", "functions", "lib", "appConfig.ts"), appConfig);
  writeFileSync(
    join(dir, "src", "lib", "hostPair.ts"),
    `export const hostPair = {
  human: { name: '(unassigned — name your human host here)' },
  ai: { name: 'Guide', avatar: '🤖' },
};\n`,
  );
}

function createCleanTemplateRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "soma-template-root-"));
  const bareDir = initBareOrigin(repoRoot);

  const templateDir = mkdtempSync(join(tmpdir(), "soma-template-"));
  runGit(templateDir, ["init"]);
  writeMinimalTemplateTree(templateDir);
  runGit(templateDir, ["add", "."]);
  runGit(templateDir, ["commit", "-m", "template seed"]);
  runGit(templateDir, ["branch", "-M", "main"]);
  wireFileOriginToBare(templateDir, bareDir, { branch: "main" });
  return { templateDir, bareDir, repoRoot };
}

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: SCAFFOLDER_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 120_000,
  });
}

function assertRefusalCli(result, messagePattern) {
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stderr, /^Error: /m, result.stderr);
  assert.match(result.stderr, messagePattern, result.stderr);
  assert.doesNotMatch(result.stderr, /    at /, "refusal must not print a stack trace");
}

function freshOutDir() {
  return join(tmpdir(), `soma-cli-refusal-out-${randomBytes(8).toString("hex")}`);
}

function reactAppArgs(outDir) {
  return ["react-app", FIXTURE_MANIFEST, outDir];
}

function scaffoldEnv({ platformRoot, templateDir, extra = {} }) {
  return {
    SOMA_PLATFORM_ROOT: platformRoot,
    SOMA_APP_TEMPLATE_DIR: templateDir,
    ...extra,
  };
}

test("CLI refuses dirty soma-platform kit packages without a stack trace", () => {
  const { platformRoot, repoRoot } = createCleanPlatformRepo({ monorepoRoot: MONOREPO_ROOT });
  const { templateDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = freshOutDir();
  try {
    writeFileSync(join(platformRoot, "packages", "soma-guide", "dirty.txt"), "x\n");
    const result = runCli(reactAppArgs(outDir), scaffoldEnv({ platformRoot, templateDir }));
    assertRefusalCli(result, /uncommitted changes in kit packages/);
    assert.match(result.stderr, /Commit or stash the listed kit packages/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(platformRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(templateRepoRoot, { recursive: true, force: true });
  }
});

test("CLI refuses soma-platform HEAD not on origin without a stack trace", () => {
  const { platformRoot, repoRoot } = createCleanPlatformRepo({ monorepoRoot: MONOREPO_ROOT });
  const { templateDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = freshOutDir();
  try {
    runGit(platformRoot, ["checkout", "-b", "feature"]);
    writeFileSync(join(platformRoot, "packages", "soma-tickets", "feature.txt"), "x\n");
    runGit(platformRoot, ["add", "packages/soma-tickets/feature.txt"]);
    runGit(platformRoot, ["commit", "-m", "feature work"]);
    const result = runCli(reactAppArgs(outDir), scaffoldEnv({ platformRoot, templateDir }));
    assertRefusalCli(result, /is not on origin\/main/);
    assert.match(result.stderr, /Push and merge soma-platform/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(platformRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(templateRepoRoot, { recursive: true, force: true });
  }
});

test("CLI refuses template origin url.insteadOf rewrite without a stack trace", () => {
  const { platformRoot, repoRoot } = createCleanPlatformRepo({ monorepoRoot: MONOREPO_ROOT });
  const { templateDir, bareDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = freshOutDir();
  try {
    runGit(templateDir, ["remote", "set-url", "origin", TEMPLATE_GITHUB_ORIGIN]);
    runGit(templateDir, [
      "config",
      `url.${toFileOriginUrl(bareDir)}.insteadOf`,
      TEMPLATE_GITHUB_ORIGIN,
    ]);
    const result = runCli(reactAppArgs(outDir), scaffoldEnv({ platformRoot, templateDir }));
    assertRefusalCli(result, /origin URL is rewritten by url\.\*\.insteadOf/);
    assert.match(result.stderr, /Remove url\.\*\.insteadOf rules/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(platformRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(templateRepoRoot, { recursive: true, force: true });
  }
});

test("CLI refuses missing template directory without a stack trace", () => {
  const { platformRoot, repoRoot } = createCleanPlatformRepo({ monorepoRoot: MONOREPO_ROOT });
  const outDir = freshOutDir();
  const missingTemplate = join(tmpdir(), `no-template-${Date.now()}`);
  try {
    const result = runCli(
      reactAppArgs(outDir),
      scaffoldEnv({ platformRoot, templateDir: missingTemplate }),
    );
    assertRefusalCli(result, /source template not found/);
    assert.match(result.stderr, /SOMA_APP_TEMPLATE_DIR/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(platformRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("CLI prints a stack trace for an unexpected error", () => {
  const { platformRoot, repoRoot } = createCleanPlatformRepo({ monorepoRoot: MONOREPO_ROOT });
  const { templateDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = freshOutDir();
  try {
    const result = runCli(
      reactAppArgs(outDir),
      scaffoldEnv({
        platformRoot,
        templateDir,
        extra: { SOMA_SCAFFOLD_TEST_UNEXPECTED_ERROR: "1" },
      }),
    );
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /deliberate unexpected failure for CLI tests/);
    assert.match(result.stderr, /    at /, "unexpected errors must include a stack trace");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(platformRoot, { recursive: true, force: true });
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(templateRepoRoot, { recursive: true, force: true });
  }
});
