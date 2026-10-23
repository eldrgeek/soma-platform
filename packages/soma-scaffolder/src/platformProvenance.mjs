import { assertHeadOnOriginDefaultBranch } from "./gitProvenance.mjs";

/**
 * Refuse when soma-platform HEAD is not on origin's default branch (source_commit must be publishable).
 * @param {string} platformRoot
 */
export function assertCleanPlatformProvenance(platformRoot) {
  assertHeadOnOriginDefaultBranch(platformRoot, { label: "soma-platform" });
}
