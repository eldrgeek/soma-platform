import { execFileSync } from "node:child_process";
const V1_KIT_PACKAGES = [
  "soma-tickets",
  "soma-meter",
  "soma-signin",
  "soma-feedback",
];

/**
 * Refuse when kit packages under soma-platform have uncommitted changes.
 * @param {string} platformRoot
 * @param {string[]} [packageDirNames]
 */
export function assertCleanPlatformPackages(
  platformRoot,
  packageDirNames = V1_KIT_PACKAGES,
) {
  const dirty = [];
  for (const name of packageDirNames) {
    const rel = `packages/${name}`;
    let status;
    try {
      status = execFileSync(
        "git",
        ["status", "--porcelain", "--", rel],
        { cwd: platformRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ).trim();
    } catch (err) {
      // A git failure is not a clean tree: refuse rather than skip the gate.
      throw new Error(
        `soma-platform: cannot read git status for ${rel} in ${platformRoot}: ${String(err.message).split("\n")[0]}`,
      );
    }
    if (status.length > 0) dirty.push(rel);
  }
  if (dirty.length > 0) {
    throw new Error(
      `soma-platform has uncommitted changes in kit packages (commit or stash before scaffolding):\n${dirty.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
}
