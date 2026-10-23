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

/**
 * @returns {true} when `ancestor` is an ancestor of `descendant`
 * @throws when git fails for reasons other than "not an ancestor" (exit 1)
 */
export function assertGitAncestor(cwd, ancestor, descendant, { label }) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const code = err && typeof err === "object" ? err.status : undefined;
    if (code === 1) {
      return false;
    }
    const detail = String(err?.message ?? err).split("\n")[0];
    throw new Error(`${label}: git merge-base --is-ancestor failed: ${detail}`);
  }
  return true;
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
 * Refuse when url.*.insteadOf makes `git remote get-url` differ from the stored remote URL.
 * @param {string} cwd
 * @param {{ label: string }} options
 */
export function assertOriginUrlNotRewritten(cwd, { label }) {
  let rawUrl;
  try {
    rawUrl = git(cwd, ["config", "--get", "remote.origin.url"]);
  } catch {
    throw new Error(`${label}: no git remote named origin`);
  }
  let resolvedUrl;
  try {
    resolvedUrl = git(cwd, ["remote", "get-url", "origin"]);
  } catch (err) {
    const detail = String(err?.message ?? err).split("\n")[0];
    throw new Error(`${label}: cannot read origin URL: ${detail}`);
  }
  if (rawUrl !== resolvedUrl) {
    throw new Error(
      `${label}: origin URL is rewritten by url.*.insteadOf (stored ${rawUrl}, resolved ${resolvedUrl}); remove insteadOf rules so provenance matches fetch`,
    );
  }
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

function notOnOriginMessage(label, commit, defaultBranch) {
  return `${label}: commit ${commit} is not on origin/${defaultBranch}; push and merge it, then scaffold. A lock records only a published commit.`;
}

/**
 * Refuse when HEAD is not an ancestor of the tip of origin's default branch.
 * @param {string} cwd
 * @param {{ label: string, fetch?: boolean }} options
 */
export function assertHeadOnOriginDefaultBranch(cwd, { label, fetch = true }) {
  if (!gitOk(cwd, ["rev-parse", "--git-dir"])) {
    throw new Error(`${label}: ${cwd} is not a git repository`);
  }

  assertOriginUrlNotRewritten(cwd, { label });

  if (fetch) {
    fetchOrigin(cwd, { label });
  }

  const commit = git(cwd, ["rev-parse", "HEAD"]);
  let defaultBranch;
  try {
    defaultBranch = resolveDefaultBranch(cwd);
  } catch (err) {
    throw new Error(`${label}: ${err.message}`);
  }

  const onOrigin = assertGitAncestor(cwd, commit, `origin/${defaultBranch}`, { label });
  if (!onOrigin) {
    throw new Error(notOnOriginMessage(label, commit, defaultBranch));
  }
}
