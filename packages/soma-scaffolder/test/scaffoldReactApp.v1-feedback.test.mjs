import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FEEDBACK_WIDGET_DIR,
  VENDORED_FEEDBACK_DIR,
} from "../src/scaffoldReactAppV1.mjs";
import {
  createCleanPlatformRepo,
  initBareOrigin,
  installScaffolderInPlatform,
  runGit,
  wireFileOriginToBare,
} from "./gitTestHelpers.mjs";
import { writeMinimalV1ReactTemplateTree } from "./minimalV1ReactTemplate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLDER_ROOT = join(__dirname, "..");
const MONOREPO_ROOT = join(SCAFFOLDER_ROOT, "..", "..");
const FIXTURE_MANIFEST = join(SCAFFOLDER_ROOT, "test", "fixtures", "v1-disposable", "soma-app.json");
const CONFORM_CLI = join(SCAFFOLDER_ROOT, "..", "soma-conformance", "bin", "soma-conform.mjs");

function createCleanTemplateRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "soma-template-root-"));
  const bareDir = initBareOrigin(repoRoot);

  const templateDir = mkdtempSync(join(tmpdir(), "soma-template-"));
  runGit(templateDir, ["init"]);
  writeMinimalV1ReactTemplateTree(templateDir, { viteBuild: true });
  runGit(templateDir, ["add", "."]);
  runGit(templateDir, ["commit", "-m", "template seed"]);
  runGit(templateDir, ["branch", "-M", "main"]);
  wireFileOriginToBare(templateDir, bareDir, { branch: "main" });
  return { templateDir, bareDir, repoRoot };
}

function runCli(cliPath, outDir, templateDir, platformRoot) {
  return spawnSync(
    process.execPath,
    [cliPath, "react-app", FIXTURE_MANIFEST, outDir],
    {
      cwd: join(dirname(cliPath), ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        SOMA_APP_TEMPLATE_DIR: templateDir,
      },
      timeout: 120_000,
    },
  );
}

function c15FailReasons(stdout) {
  const line = stdout.split("\n").find((candidate) => candidate.startsWith("C15 fail:"));
  assert.ok(line, `expected C15 fail line in:\n${stdout}`);
  return line.slice("C15 fail: ".length).split("; ").filter(Boolean);
}

function runConformance(outDir) {
  return spawnSync(
    process.execPath,
    [
      CONFORM_CLI,
      "--contract",
      join(outDir, "soma-app.json"),
      "--repo",
      outDir,
      "--tier",
      "prototype",
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
}

function assertSingleC15Failure(stdout, expectedReason) {
  const reasons = c15FailReasons(stdout);
  assert.equal(reasons.length, 1, reasons.join("; "));
  assert.equal(reasons[0], expectedReason);
}

function cleanup({ templateDir, templateRepoRoot, platformRoot, platformRepoRoot, outDir }) {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
  if (templateDir) rmSync(templateDir, { recursive: true, force: true });
  if (templateRepoRoot) rmSync(templateRepoRoot, { recursive: true, force: true });
  if (platformRoot) rmSync(platformRoot, { recursive: true, force: true });
  if (platformRepoRoot) rmSync(platformRepoRoot, { recursive: true, force: true });
}

test("v1 disposable scaffold ships feedback chip, lock entry, and builds", async () => {
  const { platformRoot, repoRoot: platformRepoRoot } = createCleanPlatformRepo({
    monorepoRoot: MONOREPO_ROOT,
  });
  const cli = installScaffolderInPlatform(platformRoot, SCAFFOLDER_ROOT);
  const { templateDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = join(tmpdir(), `soma-v1-feedback-${randomBytes(8).toString("hex")}`);
  try {
    const scaffold = runCli(cli, outDir, templateDir, platformRoot);
    assert.equal(scaffold.status, 0, scaffold.stderr || scaffold.stdout);

    const manifest = JSON.parse(readFileSync(join(outDir, "soma-app.json"), "utf8"));
    assert.ok(existsSync(join(outDir, VENDORED_FEEDBACK_DIR, "index.js")));
    assert.ok(existsSync(join(outDir, FEEDBACK_WIDGET_DIR, "soma-feedback.js")));
    assert.ok(existsSync(join(outDir, FEEDBACK_WIDGET_DIR, "soma-feedback.css")));

    const lock = JSON.parse(readFileSync(join(outDir, "soma-kit.lock.json"), "utf8"));
    assert.ok(lock.packages["@soma/feedback"]?.sha256);
    assert.ok(lock.feedback_chip?.widget_files["public/vendor/soma-feedback/soma-feedback.js"]);

    const html = readFileSync(join(outDir, "index.html"), "utf8");
    assert.match(html, /\/vendor\/soma-feedback\/soma-feedback\.js/);
    assert.match(html, /data-no-google/);
    assert.match(html, /data-label="Feedback"/);
    assert.match(html, new RegExp(`data-site="${manifest.app.id}"`));
    assert.doesNotMatch(html, /data-endpoint=/);

    const main = readFileSync(join(outDir, "src/main.tsx"), "utf8");
    assert.match(main, /@vendor\/soma\/feedback\/index\.js/);
    assert.match(main, /installSomaFeedbackHooks\(\{ supabase \}\)/);

    const conform = runConformance(outDir);
    assert.equal(conform.status, 0, conform.stderr || conform.stdout);

    const install = spawnSync("npm", ["install"], {
      cwd: outDir,
      encoding: "utf8",
      timeout: 600_000,
    });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const build = spawnSync("npm", ["run", "build"], {
      cwd: outDir,
      encoding: "utf8",
      timeout: 600_000,
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);
  } finally {
    cleanup({
      outDir,
      templateDir,
      templateRepoRoot,
      platformRoot,
      platformRepoRoot,
    });
  }
});

test("C15 names a missing feedback chip script tag", async () => {
  const { platformRoot, repoRoot: platformRepoRoot } = createCleanPlatformRepo({
    monorepoRoot: MONOREPO_ROOT,
  });
  const cli = installScaffolderInPlatform(platformRoot, SCAFFOLDER_ROOT);
  const { templateDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = join(tmpdir(), `soma-v1-feedback-mut-${randomBytes(8).toString("hex")}`);
  try {
    assert.equal(runCli(cli, outDir, templateDir, platformRoot).status, 0);
    const htmlPath = join(outDir, "index.html");
    let html = readFileSync(htmlPath, "utf8");
    html = html.replace(
      /<script[^>]*\/vendor\/soma-feedback\/soma-feedback\.js[^>]*>\s*<\/script>\s*/s,
      "",
    );
    writeFileSync(htmlPath, html);
    const result = runConformance(outDir);
    assert.equal(result.status, 1);
    assertSingleC15Failure(
      result.stdout,
      "index.html: missing feedback chip script tag (/vendor/soma-feedback/soma-feedback.js)",
    );
  } finally {
    cleanup({
      outDir,
      templateDir,
      templateRepoRoot,
      platformRoot,
      platformRepoRoot,
    });
  }
});

test("C15 names a missing feedback widget file", async () => {
  const { platformRoot, repoRoot: platformRepoRoot } = createCleanPlatformRepo({
    monorepoRoot: MONOREPO_ROOT,
  });
  const cli = installScaffolderInPlatform(platformRoot, SCAFFOLDER_ROOT);
  const { templateDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = join(tmpdir(), `soma-v1-feedback-mut-${randomBytes(8).toString("hex")}`);
  try {
    assert.equal(runCli(cli, outDir, templateDir, platformRoot).status, 0);
    rmSync(join(outDir, FEEDBACK_WIDGET_DIR, "soma-feedback.js"));
    const result = runConformance(outDir);
    assert.equal(result.status, 1);
    assertSingleC15Failure(
      result.stdout,
      "public/vendor/soma-feedback/soma-feedback.js: file is missing",
    );
  } finally {
    cleanup({
      outDir,
      templateDir,
      templateRepoRoot,
      platformRoot,
      platformRepoRoot,
    });
  }
});

test("C15 names a feedback widget byte change against the lock", async () => {
  const { platformRoot, repoRoot: platformRepoRoot } = createCleanPlatformRepo({
    monorepoRoot: MONOREPO_ROOT,
  });
  const cli = installScaffolderInPlatform(platformRoot, SCAFFOLDER_ROOT);
  const { templateDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = join(tmpdir(), `soma-v1-feedback-mut-${randomBytes(8).toString("hex")}`);
  const widgetPath = join(outDir, FEEDBACK_WIDGET_DIR, "soma-feedback.js");
  try {
    assert.equal(runCli(cli, outDir, templateDir, platformRoot).status, 0);
    appendFileSync(widgetPath, " ");
    const lock = JSON.parse(readFileSync(join(outDir, "soma-kit.lock.json"), "utf8"));
    const pinned =
      lock.feedback_chip.widget_files["public/vendor/soma-feedback/soma-feedback.js"];
    const result = runConformance(outDir);
    assert.equal(result.status, 1);
    const reasons = c15FailReasons(result.stdout);
    assert.equal(reasons.length, 1);
    assert.match(
      reasons[0],
      /^public\/vendor\/soma-feedback\/soma-feedback\.js: sha256 [0-9a-f]{64} does not match soma-kit\.lock\.json feedback_chip\.widget_files\.public\/vendor\/soma-feedback\/soma-feedback\.js /,
    );
    assert.match(reasons[0], new RegExp(`${pinned}$`));
  } finally {
    cleanup({
      outDir,
      templateDir,
      templateRepoRoot,
      platformRoot,
      platformRepoRoot,
    });
  }
});
