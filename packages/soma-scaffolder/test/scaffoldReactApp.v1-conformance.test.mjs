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
import { execFileSync, execSync, spawnSync } from "node:child_process";
import { loadSpec } from "../src/spec.mjs";
import { scaffoldReactApp } from "../src/scaffoldReactApp.mjs";
import { assertCleanTemplateProvenance } from "../src/templateProvenance.mjs";
import { reportPassed } from "@soma/conformance";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLDER_ROOT = join(__dirname, "..");
const PLATFORM_ROOT = join(SCAFFOLDER_ROOT, "..", "..");
const FIXTURE_MANIFEST = join(SCAFFOLDER_ROOT, "test", "fixtures", "v1-disposable", "soma-app.json");
const FIXTURE_BUNDLE = join(SCAFFOLDER_ROOT, "test", "fixtures", "v1-disposable");
const CONFORM_CLI = join(SCAFFOLDER_ROOT, "..", "soma-conformance", "bin", "soma-conform.mjs");

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

function createCleanTemplateRepo() {
  const bare = mkdtempSync(join(tmpdir(), "soma-template-bare-"));
  runGit(bare, ["init", "--bare"]);
  const templateDir = mkdtempSync(join(tmpdir(), "soma-template-clone-"));
  execSync(`git clone "${bare}" "${templateDir}"`, { stdio: "pipe" });
  writeMinimalTemplateTree(templateDir);
  runGit(templateDir, ["add", "."]);
  runGit(templateDir, ["commit", "-m", "template seed"]);
  runGit(templateDir, ["branch", "-M", "main"]);
  runGit(templateDir, ["remote", "set-url", "origin", "https://github.com/test/soma-app-template"]);
  runGit(templateDir, ["remote", "set-url", "--push", "origin", bare]);
  runGit(templateDir, ["push", "-u", "origin", "main"]);
  return { templateDir, bare };
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

async function scaffoldDisposable({ skipKitLock = false, templateDir }) {
  const outDir = join(tmpdir(), `soma-v1-conform-${randomBytes(8).toString("hex")}`);
  const manifest = loadSpec(FIXTURE_MANIFEST);
  await scaffoldReactApp(manifest, {
    outDir,
    appTemplateDir: templateDir,
    platformRoot: PLATFORM_ROOT,
    conformanceBundleDir: FIXTURE_BUNDLE,
    skipTemplateProvenance: true,
    skipKitLock,
  });
  return outDir;
}

test("v1 disposable app passes local conformance", async () => {
  const { templateDir, bare } = createCleanTemplateRepo();
  const outDir = await scaffoldDisposable({ templateDir });
  try {
    assert.ok(existsSync(join(outDir, "soma-kit.lock.json")));
    const report = runConformance(outDir);
    assert.equal(reportPassed(report), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test("conformance fails C13 when a host field changes in soma-app.json", async () => {
  const { templateDir, bare } = createCleanTemplateRepo();
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
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test("conformance fails C5 when an effect action loses its UI binding", async () => {
  const { templateDir, bare } = createCleanTemplateRepo();
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
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test("conformance fails C13 when a vendored file byte changes", async () => {
  const { templateDir, bare } = createCleanTemplateRepo();
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
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test("dirty template checkout is refused", () => {
  const { templateDir, bare } = createCleanTemplateRepo();
  try {
    writeFileSync(join(templateDir, "dirty.txt"), "x\n");
    assert.throws(
      () => assertCleanTemplateProvenance(templateDir),
      /uncommitted or untracked files/,
    );
  } finally {
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});

test("conformance fails when kit lock writer is stubbed out", async () => {
  const { templateDir, bare } = createCleanTemplateRepo();
  const outDir = await scaffoldDisposable({ templateDir, skipKitLock: true });
  try {
    const result = spawnSync(
      process.execPath,
      [CONFORM_CLI, "--contract", join(outDir, "soma-app.json"), "--repo", outDir, "--tier", "prototype"],
      { encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stdout, /^C13 fail:/m);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(templateDir, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
});
