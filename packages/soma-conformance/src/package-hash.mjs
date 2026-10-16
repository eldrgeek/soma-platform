import { createHash } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalize,
  readSourceFile,
  validateSourcePath,
} from "@soma/contracts";

const MAX_VENDORED_FILE_BYTES = 50 * 1024 * 1024;

function packageSourcePath(packageName) {
  if (!packageName.startsWith("@soma/") || packageName.length === "@soma/".length) {
    throw new Error(`Unsupported vendored package name: ${packageName}`);
  }
  return validateSourcePath(`vendor/soma/${packageName.slice("@soma/".length)}`);
}

function absolutePath(repositoryRoot, sourcePath) {
  return join(repositoryRoot, ...sourcePath.split("/"));
}

export function vendoredPackageNames(repositoryRoot) {
  const vendorRoot = validateSourcePath("vendor/soma");
  let entries;
  try {
    entries = readdirSync(absolutePath(repositoryRoot, vendorRoot), {
      withFileTypes: true,
    });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => {
      validateSourcePath(`${vendorRoot}/${entry.name}`);
      return `@soma/${entry.name}`;
    })
    .sort();
}

function collectFiles(repositoryRoot, sourcePath, files) {
  const entry = lstatSync(absolutePath(repositoryRoot, sourcePath));
  if (entry.isSymbolicLink()) {
    throw new Error(`Source path contains a symlink: ${sourcePath}`);
  }
  if (entry.isFile()) {
    files.push(sourcePath);
    return;
  }
  if (!entry.isDirectory()) {
    throw new Error(`Source path is not a regular file or directory: ${sourcePath}`);
  }
  for (const name of readdirSync(absolutePath(repositoryRoot, sourcePath)).sort()) {
    collectFiles(
      repositoryRoot,
      validateSourcePath(`${sourcePath}/${name}`),
      files,
    );
  }
}

export function vendoredPackageHash(repositoryRoot, packageName) {
  const root = packageSourcePath(packageName);
  const files = [];
  collectFiles(repositoryRoot, root, files);
  if (files.length === 0) {
    throw new Error(`Vendored package directory is empty: ${root}`);
  }

  const hashes = {};
  for (const sourcePath of files) {
    const relativePath = sourcePath.slice(root.length + 1);
    hashes[relativePath] = readSourceFile(repositoryRoot, sourcePath, {
      maxBytes: MAX_VENDORED_FILE_BYTES,
    }).sha256;
  }
  return createHash("sha256")
    .update(canonicalize(hashes), "utf8")
    .digest("hex");
}
