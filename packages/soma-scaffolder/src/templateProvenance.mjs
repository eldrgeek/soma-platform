import { execSync } from "node:child_process";

function git(cwd, args) {
  return execSync(["git", ...args].join(" "), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitOk(cwd, args) {
  try {
    execSync(["git", ...args].join(" "), {
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

  let defaultBranch = "main";
  if (gitOk(templateDir, ["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"])) {
    defaultBranch = "main";
  } else if (gitOk(templateDir, ["show-ref", "--verify", "--quiet", "refs/remotes/origin/master"])) {
    defaultBranch = "master";
  } else {
    throw new Error(
      "template provenance: no fetched origin/main or origin/master — run git fetch origin in the template",
    );
  }

  if (!gitOk(templateDir, ["merge-base", "--is-ancestor", commit, `origin/${defaultBranch}`])) {
    throw new Error(
      `template provenance: template commit ${commit} is not on origin/${defaultBranch}`,
    );
  }

  return { repository, commit };
}
