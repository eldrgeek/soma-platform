import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { referencedSourcePaths, validateSourcePath } from "@soma/contracts";
import { REFUSAL_FIX, ScaffoldRefusal } from "./scaffoldRefusal.mjs";

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
}

/**
 * True for a directory, false for a regular file. A symlink or any other kind of entry is refused,
 * so nothing outside the manifest directory can be pulled into the scaffold (C13).
 */
function isDirectoryNoLinks(path) {
  const st = lstatSync(path);
  if (st.isSymbolicLink()) {
    throw new ScaffoldRefusal(`manifest source is a symlink (refused): ${path}`, {
      fix: REFUSAL_FIX.symlinkManifestSource,
    });
  }
  if (st.isDirectory()) return true;
  if (st.isFile()) return false;
  throw new ScaffoldRefusal(`manifest source is not a regular file or directory (refused): ${path}`);
}

function copyTree(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const from = join(src, entry);
    const to = join(dest, entry);
    if (isDirectoryNoLinks(from)) {
      copyTree(from, to);
    } else {
      copyFile(from, to);
    }
  }
}

/**
 * Copy manifest-referenced paths and vendored bundle files from the manifest directory.
 * @param {string} manifestDir — directory containing the source soma-app.json
 * @param {string} outDir — scaffold output root
 * @param {object} manifest — parsed v1 manifest
 */
export function copyManifestSources(manifestDir, outDir, manifest) {
  const missing = [];
  const paths = new Set(referencedSourcePaths(manifest));

  const schemaRef = manifest.$schema;
  if (typeof schemaRef === "string" && schemaRef.startsWith("./")) {
    paths.add(validateSourcePath(schemaRef.slice(2)));
  }

  for (const rel of [...paths].sort()) {
    const src = join(manifestDir, rel);
    if (!existsSync(src)) {
      missing.push(rel);
      continue;
    }
    const dest = join(outDir, rel);
    if (isDirectoryNoLinks(src)) {
      copyTree(src, dest);
    } else {
      copyFile(src, dest);
    }
  }

  const vendorSoma = join(manifestDir, "vendor", "soma");
  if (existsSync(vendorSoma)) {
    const destVendor = join(outDir, "vendor", "soma");
    mkdirSync(destVendor, { recursive: true });
    for (const entry of readdirSync(vendorSoma)) {
      const from = join(vendorSoma, entry);
      const to = join(destVendor, entry);
      if (isDirectoryNoLinks(from)) {
        copyTree(from, to);
      } else {
        copyFile(from, to);
      }
    }
  }

  if (missing.length > 0) {
    throw new ScaffoldRefusal(
      `manifest source paths missing beside the spec:\n${missing.map((p) => `  - ${p}`).join("\n")}`,
      { fix: REFUSAL_FIX.missingManifestSource },
    );
  }
}
