import { join } from "node:path";
import {
  contractSha256,
  readLock,
  readSourceFile,
} from "@soma/contracts";
import {
  vendoredPackageHash,
  vendoredPackageNames,
} from "../src/package-hash.mjs";
import { checkResult } from "../src/result.mjs";

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export async function checkC13(manifest, repositoryRoot) {
  const failures = [];
  let lock;
  let actualContractSha256 = null;

  try {
    lock = readLock(join(repositoryRoot, "soma-kit.lock.json"));
  } catch (error) {
    failures.push(`soma-kit.lock.json: ${error.message}`);
  }

  try {
    actualContractSha256 = await contractSha256(
      manifest,
      (sourcePath) => readSourceFile(repositoryRoot, sourcePath, {
        maxBytes: MAX_SOURCE_BYTES,
      }),
    );
  } catch (error) {
    failures.push(`referenced source path: ${error.message}`);
  }

  if (lock && actualContractSha256
      && lock.contract_sha256 !== actualContractSha256) {
    failures.push(
      `soma-kit.lock.json contract_sha256 ${lock.contract_sha256} does not match manifest contract_sha256 ${actualContractSha256}`,
    );
  }

  if (lock) {
    try {
      const pinnedPackages = new Set(Object.keys(lock.packages));
      for (const packageName of vendoredPackageNames(repositoryRoot)) {
        if (!pinnedPackages.has(packageName)) {
          failures.push(
            `vendor/soma/${packageName.slice("@soma/".length)}: vendored package ${packageName} is not pinned in soma-kit.lock.json packages`,
          );
        }
      }
    } catch (error) {
      failures.push(`vendor/soma: cannot enumerate vendored packages: ${error.message}`);
    }
  }

  for (const [packageName, pinned] of Object.entries(lock?.packages ?? {})) {
    try {
      const actual = vendoredPackageHash(repositoryRoot, packageName);
      if (actual !== pinned.sha256) {
        failures.push(
          `soma-kit.lock.json packages.${packageName}.sha256 ${pinned.sha256} does not match vendored package hash ${actual}`,
        );
      }
    } catch (error) {
      failures.push(`soma-kit.lock.json packages.${packageName}: ${error.message}`);
    }
  }

  return {
    check: checkResult("C13", failures, [
      "local contract, source-path, and vendored-package integrity checks passed",
      "Guide asset integrity not_run: local mode makes no network calls",
      "template-commit check not_run: not built in M1 slice 2",
    ]),
    contractSha256: actualContractSha256,
  };
}
