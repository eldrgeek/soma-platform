import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readSourceFile } from "@soma/contracts";
import {
  compileActionRecord,
  resolveRemoteActionSchemas,
  remoteActions,
} from "./actions.mjs";
import { DISCOVERY_FILE_PATHS, FORBIDDEN_ROUTE_MARKERS } from "./constants.mjs";
import { buildLlmsTxt } from "./llms-txt.mjs";
import { buildOpenApiDocument } from "./openapi.mjs";
import { buildSomaAppJsonDocument } from "./soma-app-json.mjs";
import { stableJsonBytes, stableTextBytes } from "./serialize.mjs";

const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export {
  DISCOVERY_FILE_PATHS,
  FORBIDDEN_ROUTE_MARKERS,
  remoteActions,
  compileActionRecord,
};

export async function generateDiscoveryArtifacts(manifest, readFile) {
  const resolvedActions = await resolveRemoteActionSchemas(manifest, readFile);
  const somaApp = buildSomaAppJsonDocument(manifest, resolvedActions);
  const llms = buildLlmsTxt(manifest, resolvedActions);
  const openapi = buildOpenApiDocument(manifest, resolvedActions);

  const files = {
    [DISCOVERY_FILE_PATHS.wellKnown]: stableJsonBytes(somaApp),
    [DISCOVERY_FILE_PATHS.llmsTxt]: stableTextBytes(llms),
    [DISCOVERY_FILE_PATHS.openApi]: stableJsonBytes(openapi),
  };

  assertNoForbiddenRoutes(files);

  return {
    somaApp,
    llms,
    openapi,
    files,
    resolvedActions,
  };
}

export function assertNoForbiddenRoutes(files) {
  for (const [path, bytes] of Object.entries(files)) {
    const text = bytes.toString("utf8");
    for (const marker of FORBIDDEN_ROUTE_MARKERS) {
      if (text.includes(marker)) {
        throw new Error(`discovery artifact ${path} must not include forbidden route ${marker}`);
      }
    }
    if (text.includes("/decision")) {
      throw new Error(`discovery artifact ${path} must not include an approval decision route`);
    }
  }
}

export async function generateDiscoveryFromRepository(manifest, repositoryRoot) {
  return generateDiscoveryArtifacts(manifest, (sourcePath) =>
    readSourceFile(repositoryRoot, sourcePath, { maxBytes: MAX_SOURCE_BYTES }),
  );
}

export async function writeDiscoveryFiles({ repositoryRoot, manifest }) {
  const { files } = await generateDiscoveryFromRepository(manifest, repositoryRoot);
  for (const [relPath, bytes] of Object.entries(files)) {
    const full = join(repositoryRoot, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
  }
  return files;
}
