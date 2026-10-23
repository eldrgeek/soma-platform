import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { loadSpec } from "../src/spec.mjs";
import { scaffoldReactApp } from "../src/scaffoldReactApp.mjs";
import { assertCleanTemplateProvenance } from "../src/templateProvenance.mjs";
import { reportPassed } from "@soma/conformance";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLDER_ROOT = join(__dirname, "..");
const PLATFORM_ROOT = join(SCAFFOLDER_ROOT, "..", "..");
const FIXTURE_MANIFEST = join(SCAFFOLDER_ROOT, "test", "fixtures", "v1-disposable", "soma-app.json");
const FIXTURE_DIR = dirname(FIXTURE_MANIFEST);
const CONFORM_CLI = join(SCAFFOLDER_ROOT, "..", "soma-conformance", "bin", "soma-conform.mjs");

// export-app-schema / erase-app-schema are one-line prose stubs (not executable handlers);
// conformance only needs repository-relative paths with stable bytes for C13 contract hashing.

function runGit(cwd, args, env = {}) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@test",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@test",
      ...env,
    },
  });
}

function writeMinimalTemplateTree(dir) {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "soma-app-template", private: true }, null, 2) + "\n",
  );
  writeFileSync(join(dir, "index.html"), "<!doctype html><html><head><title>T</title></head><body></body></html>\n");
  const appConfig = `export const APP_ID = 'template';\nexport const APP_NAME = 'Template';\n`;
  mkdirSync(join(dir, "src", "lib"), { recursive: true });
  mkdirSync(join(dir, "netlify", "functions", "lib"), { recursive: true });
  writeFileSync(join(dir, "src", "lib", "appConfig.ts"), appConfig);
  writeFileSync(join(dir, "netlify", "functions", "lib", "appConfig.ts"), appConfig);
  writeFileSync(
    join(dir, "src", "lib", "hostPair.ts"),
    `export const hostPair = {
  human: { name: '(unassigned — name your human host here)' },
  ai: { name: 'Guide', avatar: '🤖' },
};\n`,
  );
  writeFileSync(join(dir, "src", "lib", "supabase.ts"), "export const supabase = {} as any;\n");
  writeFileSync(
    join(dir, "src", "lib", "lastLocation.ts"),
    "export async function fetchLastLocation() { return null; }\n",
  );
  writeFileSync(
    join(dir, "netlify", "functions", "lib", "supabaseAdmin.ts"),
    "export function adminEnv() { throw new Error('no env'); }\n",
  );
}

const TEMPLATE_GITHUB_ORIGIN = "https://github.com/test/soma-app-template.git";

function wireTemplateOrigin(templateDir, bareDir) {
  runGit(templateDir, ["remote", "add", "origin", TEMPLATE_GITHUB_ORIGIN]);
  runGit(templateDir, ["config", `url.${bareDir}.insteadOf`, TEMPLATE_GITHUB_ORIGIN]);
  runGit(templateDir, ["push", "-u", "origin", "main"]);
}

function createCleanTemplateRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "soma-template-root-"));
  const bareDir = join(repoRoot, "origin.git");
  runGit(repoRoot, ["init", "--bare", bareDir]);
  runGit(bareDir, ["symbolic-ref", "HEAD", "refs/heads/main"]);

  const templateDir = mkdtempSync(join(tmpdir(), "soma-template-"));
  runGit(templateDir, ["init"]);
  writeMinimalTemplateTree(templateDir);
  runGit(templateDir, ["add", "."]);
  runGit(templateDir, ["commit", "-m", "template seed"]);
  runGit(templateDir, ["branch", "-M", "main"]);
  wireTemplateOrigin(templateDir, bareDir);
  return { templateDir, bareDir, repoRoot };
}

function runConformance(repositoryRoot) {
  const result = spawnSync(
    process.execPath,
    [
      CONFORM_CLI,
      "--contract",
      join(repositoryRoot, "soma-app.json"),
      "--repo",
      repositoryRoot,
      "--tier",
      "prototype",
      "--json",
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

async function scaffoldDisposable({ templateDir }) {
  const outDir = join(tmpdir(), `soma-v1-conform-${randomBytes(8).toString("hex")}`);
  const manifest = loadSpec(FIXTURE_MANIFEST);
  await scaffoldReactApp(manifest, {
    outDir,
    manifestDir: FIXTURE_DIR,
    appTemplateDir: templateDir,
    platformRoot: PLATFORM_ROOT,
  });
  return outDir;
}

function cleanupTemplateFixture({ templateDir, repoRoot }) {
  rmSync(templateDir, { recursive: true, force: true });
  if (repoRoot) rmSync(repoRoot, { recursive: true, force: true });
}

test("v1 disposable app passes local conformance", async () => {
  const { templateDir, repoRoot } = createCleanTemplateRepo();
  const outDir = await scaffoldDisposable({ templateDir });
  try {
    assert.ok(existsSync(join(outDir, "soma-kit.lock.json")));
    const report = runConformance(outDir);
    assert.equal(reportPassed(report), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    cleanupTemplateFixture({ templateDir, repoRoot });
  }
});

test("conformance fails C13 when a host field changes in soma-app.json", async () => {
  const { templateDir, repoRoot } = createCleanTemplateRepo();
  const outDir = await scaffoldDisposable({ templateDir });
  try {
    const manifest = JSON.parse(readFileSync(join(outDir, "soma-app.json"), "utf8"));
    manifest.hosts.human.name = "Someone else";
    writeFileSync(join(outDir, "soma-app.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync(
      process.execPath,
      [CONFORM_CLI, "--contract", join(outDir, "soma-app.json"), "--repo", outDir, "--tier", "prototype"],
      { encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^C13 fail:/m);
    assert.match(result.stdout, /contract_sha256/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    cleanupTemplateFixture({ templateDir, repoRoot });
  }
});

test("conformance fails C5 when an effect action loses its UI binding", async () => {
  const { templateDir, repoRoot } = createCleanTemplateRepo();
  const outDir = await scaffoldDisposable({ templateDir });
  try {
    const manifest = JSON.parse(readFileSync(join(outDir, "soma-app.json"), "utf8"));
    manifest.actions[1].surfaces = ["guide", "remote"];
    writeFileSync(join(outDir, "soma-app.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync(
      process.execPath,
      [CONFORM_CLI, "--contract", join(outDir, "soma-app.json"), "--repo", outDir, "--tier", "prototype"],
      { encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^C5 fail:/m);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    cleanupTemplateFixture({ templateDir, repoRoot });
  }
});

test("conformance fails C13 when a vendored file byte changes", async () => {
  const { templateDir, repoRoot } = createCleanTemplateRepo();
  const outDir = await scaffoldDisposable({ templateDir });
  try {
    appendFileSync(join(outDir, "vendor", "soma", "actions", "index.mjs"), " ");
    const result = spawnSync(
      process.execPath,
      [CONFORM_CLI, "--contract", join(outDir, "soma-app.json"), "--repo", outDir, "--tier", "prototype"],
      { encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^C13 fail:/m);
    assert.match(result.stdout, /packages\.@soma\/actions\.sha256/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    cleanupTemplateFixture({ templateDir, repoRoot });
  }
});

test("dirty template checkout is refused", () => {
  const { templateDir, repoRoot } = createCleanTemplateRepo();
  try {
    writeFileSync(join(templateDir, "dirty.txt"), "x\n");
    assert.throws(
      () => assertCleanTemplateProvenance(templateDir),
      /uncommitted or untracked files/,
    );
  } finally {
    cleanupTemplateFixture({ templateDir, repoRoot });
  }
});

test("template commit not on default branch is refused", () => {
  const { templateDir, repoRoot } = createCleanTemplateRepo();
  try {
    runGit(templateDir, ["checkout", "-b", "feature"]);
    writeFileSync(join(templateDir, "feature-only.txt"), "x\n");
    runGit(templateDir, ["add", "feature-only.txt"]);
    runGit(templateDir, ["commit", "-m", "feature work"]);
    assert.throws(
      () => assertCleanTemplateProvenance(templateDir),
      /is not on origin\/main/,
    );
  } finally {
    cleanupTemplateFixture({ templateDir, repoRoot });
  }
});

test("conformance fails when soma-kit.lock.json is missing", async () => {
  const { templateDir, repoRoot } = createCleanTemplateRepo();
  const outDir = await scaffoldDisposable({ templateDir });
  try {
    rmSync(join(outDir, "soma-kit.lock.json"));
    const result = spawnSync(
      process.execPath,
      [CONFORM_CLI, "--contract", join(outDir, "soma-app.json"), "--repo", outDir, "--tier", "prototype"],
      { encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^C13 fail:/m);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    cleanupTemplateFixture({ templateDir, repoRoot });
  }
});
