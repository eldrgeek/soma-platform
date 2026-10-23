import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitOk(cwd, args) {
  try {
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

function parseGithubRepository(remoteUrl) {
  const normalized = String(remoteUrl)
    .trim()
    .replace(/\.git$/, "");
  const ssh = normalized.match(/^git@github\.com:([^/]+\/[^/]+)$/);
  if (ssh) return ssh[1];
  const https = normalized.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/);
  if (https) return https[1];
  const scp = normalized.match(/^ssh:\/\/git@github\.com\/([^/]+\/[^/]+)$/);
  if (scp) return scp[1];
  return null;
}

function resolveDefaultBranch(templateDir) {
  try {
    const symbolic = git(templateDir, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
    ]);
    const match = symbolic.match(/^refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1];
  } catch {
    // fall through
  }
  if (gitOk(templateDir, ["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"])) {
    return "main";
  }
  if (gitOk(templateDir, ["show-ref", "--verify", "--quiet", "refs/remotes/origin/master"])) {
    return "master";
  }
  throw new Error(
    "template provenance: no fetched origin — set refs/remotes/origin/HEAD or origin/main or origin/master",
  );
}

/**
 * Refuse to scaffold from a dirty or unprovenanced template checkout.
 * @param {string} templateDir
 * @returns {{ repository: string, commit: string }}
 */
export function assertCleanTemplateProvenance(templateDir) {
  if (!gitOk(templateDir, ["rev-parse", "--git-dir"])) {
    throw new Error(
      `template provenance: ${templateDir} is not a git repository`,
    );
  }

  const status = git(templateDir, ["status", "--porcelain"]);
  if (status.length > 0) {
    throw new Error(
      "template provenance: template checkout has uncommitted or untracked files",
    );
  }

  let remoteUrl;
  try {
    remoteUrl = git(templateDir, ["remote", "get-url", "origin"]);
  } catch {
    throw new Error(
      "template provenance: template has no git remote named origin",
    );
  }

  const repository = parseGithubRepository(remoteUrl);
  if (!repository) {
    throw new Error(
      `template provenance: origin URL is not a github.com repository: ${remoteUrl}`,
    );
  }

  const commit = git(templateDir, ["rev-parse", "HEAD"]);
  const defaultBranch = resolveDefaultBranch(templateDir);

  if (!gitOk(templateDir, ["merge-base", "--is-ancestor", commit, `origin/${defaultBranch}`])) {
    throw new Error(
      `template provenance: template commit ${commit} is not on origin/${defaultBranch}`,
    );
  }

  return { repository, commit };
}

/**
 * Copy only git-tracked files from the template checkout (excludes .env, etc.).
 * @param {string} templateDir
 * @param {string} outDir
 */
export function copyTrackedTemplateTree(templateDir, outDir) {
  const tracked = git(templateDir, ["ls-files", "-z"]).split("\0").filter(Boolean);
  if (tracked.length === 0) {
    throw new Error("template provenance: template has no tracked files");
  }
  for (const rel of tracked) {
    const src = join(templateDir, rel);
    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
}
