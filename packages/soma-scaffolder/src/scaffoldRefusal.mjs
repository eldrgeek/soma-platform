/** User-actionable scaffold refusal (CLI prints message + fix, no stack trace). */
export class ScaffoldRefusal extends Error {
  /**
   * @param {string} message
   * @param {{ fix?: string }} [options]
   */
  constructor(message, { fix } = {}) {
    super(message);
    this.name = "ScaffoldRefusal";
    this.fix = fix ?? null;
  }
}

export function isScaffoldRefusal(err) {
  return err instanceof ScaffoldRefusal || (err && err.name === "ScaffoldRefusal");
}

/**
 * @param {ScaffoldRefusal} err
 */
export function formatRefusalStderr(err) {
  const lines = String(err.message).split("\n");
  const out = [`Error: ${lines[0]}`];
  for (let i = 1; i < lines.length; i++) out.push(lines[i]);
  if (err.fix) out.push(err.fix);
  return out.join("\n") + "\n";
}

export const REFUSAL_FIX = {
  dirtyPlatform:
    "Commit or stash the listed kit packages under soma-platform, then run soma-scaffold again.",
  platformNotOnOrigin:
    "Push and merge soma-platform to origin's default branch, then scaffold again.",
  templateNotOnOrigin:
    "Push and merge the template repository to origin's default branch, then scaffold again.",
  templateDirty:
    "Commit or discard uncommitted changes in the template checkout, then scaffold again.",
  insteadOf:
    "Remove url.*.insteadOf rules from this repository's git config so the stored origin URL matches git remote get-url.",
  missingTemplate:
    "Check out soma-app-template beside soma-platform or set SOMA_APP_TEMPLATE_DIR to a valid template directory.",
  missingManifestSource:
    "Add the missing paths beside the manifest file, or update the manifest to reference files that exist.",
  symlinkManifestSource:
    "Replace symlinked manifest sources with regular files or directories beside the spec.",
};
