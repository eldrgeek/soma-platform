import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { V1_KIT_PACKAGES } from "../src/assertCleanPlatformPackages.mjs";

export const TEMPLATE_GITHUB_ORIGIN = "https://github.com/test/soma-app-template.git";
export const PLATFORM_GITHUB_ORIGIN = "https://github.com/test/soma-platform.git";

export function runGit(cwd, args) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@test",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@test",
    },
  });
}

export function toFileOriginUrl(bareDir) {
  if (bareDir.startsWith("file:")) return bareDir;
  return `file://${bareDir}`;
}

export function initBareOrigin(repoRoot, branch = "main") {
  const bareDir = join(repoRoot, "origin.git");
  runGit(repoRoot, ["init", "--bare", bareDir]);
  runGit(bareDir, ["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
  return bareDir;
}

/** Local bare origin via file:// (no url.insteadOf). */
export function wireFileOriginToBare(workDir, bareDir, { branch = "main" } = {}) {
  const fileUrl = toFileOriginUrl(bareDir);
  runGit(workDir, ["remote", "add", "origin", fileUrl]);
  runGit(workDir, ["push", "-u", "origin", branch]);
  return fileUrl;
}

export function seedKitPackageDirs(platformRoot) {
  for (const name of V1_KIT_PACKAGES) {
    const dir = join(platformRoot, "packages", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitkeep"), "\n");
  }
}

function shouldCopyFromMonorepo(srcPath) {
  const base = srcPath.split("/").pop();
  return base !== "node_modules" && base !== ".git";
}

export function copyKitPackagesFromMonorepo(monorepoRoot, platformRoot) {
  for (const name of V1_KIT_PACKAGES) {
    const src = join(monorepoRoot, "packages", name);
    const dest = join(platformRoot, "packages", name);
    cpSync(src, dest, {
      recursive: true,
      filter: shouldCopyFromMonorepo,
    });
  }
}

/**
 * @param {{ monorepoRoot?: string }} [options]
 */
export function createCleanPlatformRepo({ monorepoRoot = null } = {}) {
  const repoRoot = mkdtempSync(join(tmpdir(), "soma-platform-root-"));
  const bareDir = initBareOrigin(repoRoot);

  const platformRoot = mkdtempSync(join(tmpdir(), "soma-platform-"));
  runGit(platformRoot, ["init"]);
  if (monorepoRoot) {
    copyKitPackagesFromMonorepo(monorepoRoot, platformRoot);
  } else {
    seedKitPackageDirs(platformRoot);
  }
  runGit(platformRoot, ["add", "."]);
  runGit(platformRoot, ["commit", "-m", "platform seed"]);
  runGit(platformRoot, ["branch", "-M", "main"]);
  wireFileOriginToBare(platformRoot, bareDir, { branch: "main" });
  return { platformRoot, bareDir, repoRoot };
}
