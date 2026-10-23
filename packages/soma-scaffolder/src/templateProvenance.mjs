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
import { REFUSAL_FIX, ScaffoldRefusal } from "./scaffoldRefusal.mjs";

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

function resolveLockRepository(rawRemoteUrl) {
  const remote = String(rawRemoteUrl).trim();
  const fromGithub = parseGithubRepository(remote);
  if (fromGithub) return fromGithub;
  if (/^file:\/\/\/[^\s\u0000-\u001F\u007F]+$/.test(remote)) {
    return remote;
  }
  throw new ScaffoldRefusal(
    `template provenance: origin URL must be github.com or file://; got: ${rawRemoteUrl}`,
  );
}

/**
 * Refuse to scaffold from a dirty or unprovenanced template checkout.
 * @param {string} templateDir
 * @returns {{ repository: string, commit: string }}
 */
export function assertCleanTemplateProvenance(templateDir) {
  if (!gitOk(templateDir, ["rev-parse", "--git-dir"])) {
    throw new ScaffoldRefusal(
      `template provenance: ${templateDir} is not a git repository`,
    );
  }

  const status = git(templateDir, ["status", "--porcelain"]);
  if (status.length > 0) {
    throw new ScaffoldRefusal(
      "template provenance: template checkout has uncommitted or untracked files",
      { fix: REFUSAL_FIX.templateDirty },
    );
  }

  let remoteUrl;
  try {
    remoteUrl = git(templateDir, ["config", "--get", "remote.origin.url"]);
  } catch {
    throw new ScaffoldRefusal(
      "template provenance: template has no git remote named origin",
    );
  }

  assertOriginUrlNotRewritten(templateDir, { label: "template provenance" });

  const repository = resolveLockRepository(remoteUrl);

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
    throw new ScaffoldRefusal(
      `template provenance: commit ${commit} is not on origin/${defaultBranch}; push and merge it, then scaffold. A lock records only a published commit.`,
      { fix: REFUSAL_FIX.templateNotOnOrigin },
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
    throw new ScaffoldRefusal("template provenance: template has no tracked files");
  }
  for (const rel of tracked) {
    const src = join(templateDir, rel);
    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
}
