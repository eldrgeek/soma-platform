// Guards on what a v1 scaffold may read (bead sp-n1g / sp-3ke, Skip's second pass, 2026-10-23):
// a symlink beside the manifest is refused, and a git failure on the platform is not "clean".
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyManifestSources } from "../src/copyManifestSources.mjs";
import { assertCleanPlatformPackages } from "../src/assertCleanPlatformPackages.mjs";
import { assertCleanPlatformProvenance } from "../src/platformProvenance.mjs";
import { assertCleanTemplateProvenance } from "../src/templateProvenance.mjs";
import {
  createCleanPlatformRepo,
  initBareOrigin,
  runGit,
  TEMPLATE_GITHUB_ORIGIN,
  toFileOriginUrl,
  wireFileOriginToBare,
} from "./gitTestHelpers.mjs";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "v1-disposable");

function writeMinimalTemplateTree(dir) {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "soma-app-template", private: true }, null, 2) + "\n",
  );
  writeFileSync(join(dir, "index.html"), "<!doctype html><html><head><title>T</title></head><body></body></html>\n");
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

function cleanupFixture({ templateDir, platformRoot, repoRoot }) {
  if (templateDir) rmSync(templateDir, { recursive: true, force: true });
  if (platformRoot) rmSync(platformRoot, { recursive: true, force: true });
  if (repoRoot) rmSync(repoRoot, { recursive: true, force: true });
}

test("a referenced source that is a symlink is refused, not followed", () => {
  const root = mkdtempSync(join(tmpdir(), "soma-v1-guard-"));
  try {
    const src = join(root, "spec");
    cpSync(FIXTURE, src, { recursive: true });
    const manifest = JSON.parse(readFileSync(join(src, "soma-app.json"), "utf8"));
    const target = join(src, "knowledge", "host-pair.md");
    unlinkSync(target);
    symlinkSync("/etc/hosts", target);
    assert.throws(
      () => copyManifestSources(src, join(root, "out"), manifest),
      /symlink \(refused\)/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a platform root where git status fails is refused, not treated as clean", () => {
  const notGit = mkdtempSync(join(tmpdir(), "soma-v1-nogit-"));
  try {
    assert.throws(() => assertCleanPlatformPackages(notGit), /cannot read git status/);
  } finally {
    rmSync(notGit, { recursive: true, force: true });
  }
});

test("uncommitted changes in soma-guide are refused before scaffolding", () => {
  const { platformRoot, repoRoot } = createCleanPlatformRepo();
  try {
    writeFileSync(join(platformRoot, "packages", "soma-guide", "dirty.txt"), "x\n");
    assert.throws(
      () => assertCleanPlatformPackages(platformRoot),
      /packages\/soma-guide/,
    );
  } finally {
    cleanupFixture({ platformRoot, repoRoot });
  }
});

test("soma-platform HEAD not on origin default branch is refused", () => {
  const { platformRoot, repoRoot } = createCleanPlatformRepo();
  try {
    runGit(platformRoot, ["checkout", "-b", "feature"]);
    writeFileSync(join(platformRoot, "packages", "soma-tickets", "feature.txt"), "x\n");
    runGit(platformRoot, ["add", "packages/soma-tickets/feature.txt"]);
    runGit(platformRoot, ["commit", "-m", "feature work"]);
    assert.throws(
      () => assertCleanPlatformProvenance(platformRoot),
      /is not on origin\/main/,
    );
    assert.throws(
      () => assertCleanPlatformProvenance(platformRoot),
      /push and merge it, then scaffold/,
    );
  } finally {
    cleanupFixture({ platformRoot, repoRoot });
  }
});

test("template git fetch origin failure is refused", () => {
  const { templateDir, repoRoot } = createCleanTemplateRepo();
  try {
    runGit(templateDir, ["remote", "set-url", "origin", "file:///nonexistent-bare-origin.git"]);
    assert.throws(
      () => assertCleanTemplateProvenance(templateDir),
      /git fetch origin failed/,
    );
  } finally {
    cleanupFixture({ templateDir, repoRoot });
  }
});

test("origin url.insteadOf rewrite is refused", () => {
  const { templateDir, bareDir, repoRoot } = createCleanTemplateRepo();
  try {
    runGit(templateDir, ["remote", "set-url", "origin", TEMPLATE_GITHUB_ORIGIN]);
    runGit(templateDir, [
      "config",
      `url.${toFileOriginUrl(bareDir)}.insteadOf`,
      TEMPLATE_GITHUB_ORIGIN,
    ]);
    assert.throws(
      () => assertCleanTemplateProvenance(templateDir),
      /origin URL is rewritten by url\.\*\.insteadOf/,
    );
  } finally {
    cleanupFixture({ templateDir, repoRoot });
  }
});
