import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  assertGitAncestor,
  assertOriginUrlNotRewritten,
  fetchOrigin,
  git,
  gitOk,
  resolveDefaultBranch,
} from "./gitProvenance.mjs";

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

function resolveLockRepository(templateDir, rawRemoteUrl) {
  const fromGithub = parseGithubRepository(rawRemoteUrl);
  if (fromGithub) return fromGithub;
  try {
    const canonical = git(templateDir, [
      "config",
      "--get",
      "remote.origin.githubRepository",
    ]);
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(canonical)) {
      return canonical;
    }
  } catch {
    // fall through
  }
  throw new Error(
    `template provenance: origin URL is not a github.com repository: ${rawRemoteUrl}`,
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
    remoteUrl = git(templateDir, ["config", "--get", "remote.origin.url"]);
  } catch {
    throw new Error(
      "template provenance: template has no git remote named origin",
    );
  }

  assertOriginUrlNotRewritten(templateDir, { label: "template provenance" });

  const repository = resolveLockRepository(templateDir, remoteUrl);

  fetchOrigin(templateDir, { label: "template provenance" });

  const commit = git(templateDir, ["rev-parse", "HEAD"]);
  const defaultBranch = resolveDefaultBranch(templateDir);

  const onOrigin = assertGitAncestor(
    templateDir,
    commit,
    `origin/${defaultBranch}`,
    { label: "template provenance" },
  );
  if (!onOrigin) {
    throw new Error(
      `template provenance: commit ${commit} is not on origin/${defaultBranch}; push and merge it, then scaffold. A lock records only a published commit.`,
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
