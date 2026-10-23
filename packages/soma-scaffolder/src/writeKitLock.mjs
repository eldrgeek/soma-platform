import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { contractSha256, validateLock } from "@soma/contracts";
import { readSourceFile } from "@soma/contracts";
import {
  vendoredPackageHash,
  vendoredPackageNames,
} from "@soma/conformance/package-hash";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLDER_ROOT = join(__dirname, "..");

function readPackageVersion(platformRoot, unscopedName) {
  const pkgPath = join(platformRoot, "packages", `soma-${unscopedName}`, "package.json");
  if (existsSync(pkgPath)) {
    return JSON.parse(readFileSync(pkgPath, "utf8")).version;
  }
  return "1.0.0";
}

function readScaffolderVersion() {
  return JSON.parse(readFileSync(join(SCAFFOLDER_ROOT, "package.json"), "utf8")).version;
}

function guideSectionFromManifest(manifest, platformRoot) {
  const guideRequired = manifest?.dependencies?.guide_cdn?.required === true;
  const distGuide = join(platformRoot, "dist", "soma-guide.js");
  const distCss = join(platformRoot, "dist", "soma-guide.css");

  if (guideRequired && existsSync(distGuide)) {
    const versionMatch = readFileSync(distGuide, "utf8").match(
      /SOMA_GUIDE_VERSION = '([^']+)'/,
    );
    const version = versionMatch?.[1] ?? "0.0.0";
    const assets = [];
    for (const [file, urlPath] of [
      [distGuide, `https://soma-guide.netlify.app/soma-guide.js`],
      [distCss, `https://soma-guide.netlify.app/soma-guide.css`],
    ]) {
      try {
        const bytes = readFileSync(file);
        const integrity =
          "sha384-" + createHash("sha384").update(bytes).digest("base64");
        assets.push({ url: urlPath, integrity });
      } catch {
        // skip missing css
      }
    }
    if (assets.length > 0) {
      return { version, assets };
    }
  }

  // Guide CDN not required — pin a schema-valid placeholder (integrity not verified in M1 local mode).
  return {
    version: "1.0.0",
    assets: [
      {
        url: "https://soma-guide.netlify.app/v1.0.0/soma-guide.js",
        integrity: "sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      },
    ],
  };
}

/**
 * @param {object} options
 * @param {string} options.outDir
 * @param {object} options.manifest — v1 manifest written to soma-app.json
 * @param {string} options.platformRoot
 * @param {string} options.sourceCommit — soma-platform HEAD
 * @param {{ repository: string, commit: string }} options.template
 */
export async function writeKitLock({
  outDir,
  manifest,
  platformRoot,
  sourceCommit,
  template,
}) {
  const contract_sha256 = await contractSha256(manifest, (sourcePath) =>
    readSourceFile(outDir, sourcePath, { maxBytes: 50 * 1024 * 1024 }),
  );

  const packages = {};
  for (const packageName of vendoredPackageNames(outDir)) {
    const unscoped = packageName.slice("@soma/".length);
    const version = readPackageVersion(platformRoot, unscoped);
    packages[packageName] = {
      version,
      sha256: vendoredPackageHash(outDir, packageName),
    };
  }

  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error(
      `writeKitLock: source_commit must be a 40-character git SHA (got ${JSON.stringify(sourceCommit)})`,
    );
  }

  const lock = {
    kit_version: readScaffolderVersion(),
    source_commit: sourceCommit,
    template,
    contract_sha256,
    guide: guideSectionFromManifest(manifest, platformRoot),
    packages,
  };

  const validation = validateLock(lock);
  if (!validation.valid) {
    throw new Error(
      `generated soma-kit.lock.json failed schema validation: ${validation.errors.map((e) => e.message).join("; ")}`,
    );
  }

  writeFileSync(
    join(outDir, "soma-kit.lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  return lock;
}
