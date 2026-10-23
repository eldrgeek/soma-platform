import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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

export function initBareOrigin(repoRoot, branch = "main") {
  const bareDir = join(repoRoot, "origin.git");
  runGit(repoRoot, ["init", "--bare", bareDir]);
  runGit(bareDir, ["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
  return bareDir;
}

export function wireGithubOriginToBare(workDir, bareDir, githubUrl, branch = "main") {
  runGit(workDir, ["remote", "add", "origin", githubUrl]);
  runGit(workDir, ["config", `url.${bareDir}.insteadOf`, githubUrl]);
  runGit(workDir, ["push", "-u", "origin", branch]);
}

export function seedKitPackageDirs(platformRoot) {
  for (const name of V1_KIT_PACKAGES) {
    const dir = join(platformRoot, "packages", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitkeep"), "\n");
  }
}

export function createCleanPlatformRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "soma-platform-root-"));
  const bareDir = initBareOrigin(repoRoot);

  const platformRoot = mkdtempSync(join(tmpdir(), "soma-platform-"));
  runGit(platformRoot, ["init"]);
  seedKitPackageDirs(platformRoot);
  runGit(platformRoot, ["add", "."]);
  runGit(platformRoot, ["commit", "-m", "platform seed"]);
  runGit(platformRoot, ["branch", "-M", "main"]);
  wireGithubOriginToBare(platformRoot, bareDir, PLATFORM_GITHUB_ORIGIN);
  return { platformRoot, bareDir, repoRoot };
}
