// Guards on what a v1 scaffold may read (bead sp-n1g, Skip's second pass, 2026-10-23):
// a symlink beside the manifest is refused, and a git failure on the platform is not "clean".
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyManifestSources } from "../src/copyManifestSources.mjs";
import { assertCleanPlatformPackages } from "../src/assertCleanPlatformPackages.mjs";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "v1-disposable");

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
