import { execFileSync } from "node:child_process";

export function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function gitOk(cwd, args) {
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

export function resolveDefaultBranch(cwd) {
  try {
    const symbolic = git(cwd, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
    const match = symbolic.match(/^refs\/remotes\/origin\/(.+)$/);
    if (match) return match[1];
  } catch {
    // fall through
  }
  if (gitOk(cwd, ["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"])) {
    return "main";
  }
  if (gitOk(cwd, ["show-ref", "--verify", "--quiet", "refs/remotes/origin/master"])) {
    return "master";
  }
  throw new Error(
    "no fetched origin — set refs/remotes/origin/HEAD or origin/main or origin/master",
  );
}

/**
 * @param {string} cwd
 * @param {{ label: string }} options
 */
export function fetchOrigin(cwd, { label }) {
  try {
    execFileSync("git", ["fetch", "origin"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
  } catch (err) {
    throw new Error(
      `${label}: git fetch origin failed: ${String(err.message).split("\n")[0]}`,
    );
  }
}

/**
 * Refuse when HEAD is not an ancestor of the tip of origin's default branch.
 * @param {string} cwd
 * @param {{ label: string }} options
 */
export function assertHeadOnOriginDefaultBranch(cwd, { label }) {
  if (!gitOk(cwd, ["rev-parse", "--git-dir"])) {
    throw new Error(`${label}: ${cwd} is not a git repository`);
  }

  const commit = git(cwd, ["rev-parse", "HEAD"]);
  let defaultBranch;
  try {
    defaultBranch = resolveDefaultBranch(cwd);
  } catch (err) {
    throw new Error(`${label}: ${err.message}`);
  }

  if (
    !gitOk(cwd, [
      "merge-base",
      "--is-ancestor",
      commit,
      `origin/${defaultBranch}`,
    ])
  ) {
    throw new Error(
      `${label}: current commit ${commit} is not on origin/${defaultBranch}`,
    );
  }
}
