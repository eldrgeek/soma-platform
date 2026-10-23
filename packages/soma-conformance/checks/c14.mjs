import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  DISCOVERY_FILE_PATHS,
  generateDiscoveryFromRepository,
  sortValue,
} from "@soma/discovery";
import { checkResult } from "../src/result.mjs";

function readBytes(repositoryRoot, relPath) {
  const full = join(repositoryRoot, relPath);
  if (!existsSync(full)) {
    return null;
  }
  return readFileSync(full);
}

function compareDiscoveryFile(relPath, expected, actual, failures) {
  if (!actual) {
    failures.push(`${relPath}: file is missing`);
    return;
  }
  if (expected.length !== actual.length || !expected.equals(actual)) {
    failures.push(`${relPath}: does not match manifest-derived discovery`);
  }
}

function stableFieldJson(value) {
  return JSON.stringify(sortValue(value ?? null));
}

function compareSomaAppActions(expectedDoc, actualDoc, failures) {
  const expectedById = new Map(
    (expectedDoc.actions ?? []).map((action) => [action.id, action]),
  );
  const actualById = new Map(
    (actualDoc.actions ?? []).map((action) => [action.id, action]),
  );

  for (const [id, expected] of expectedById) {
    const actual = actualById.get(id);
    if (!actual) {
      failures.push(`action ${id}: missing from public/.well-known/soma-app.json`);
      continue;
    }
    for (const field of [
      "version",
      "kind",
      "risk",
      "required_scopes",
      "input_schema",
      "output_schema",
    ]) {
      const left = stableFieldJson(expected[field]);
      const right = stableFieldJson(actual[field]);
      if (left !== right) {
        failures.push(`action ${id}: field ${field} does not match manifest`);
      }
    }
  }

  for (const id of actualById.keys()) {
    if (!expectedById.has(id)) {
      failures.push(
        `action ${id}: appears in public/.well-known/soma-app.json but is not a remote manifest action`,
      );
    }
  }
}

function compareOpenApiActions(expectedDoc, actualDoc, failures) {
  const expectedIds = new Set(
    (expectedDoc.paths ? Object.keys(expectedDoc.paths) : [])
      .filter((path) => path.includes("/actions/") && path.endsWith("/execute"))
      .map((path) => path.split("/actions/")[1].replace("/execute", "")),
  );
  const actualIds = new Set(
    Object.keys(actualDoc.paths ?? {})
      .filter((path) => path.includes("/actions/") && path.endsWith("/execute"))
      .map((path) => path.split("/actions/")[1].replace("/execute", "")),
  );

  for (const id of expectedIds) {
    if (!actualIds.has(id)) {
      failures.push(`action ${id}: missing execute path in public/api/soma/v1/openapi.json`);
    }
  }
  for (const id of actualIds) {
    if (!expectedIds.has(id)) {
      failures.push(
        `action ${id}: execute path in public/api/soma/v1/openapi.json is not a remote manifest action`,
      );
    }
  }
}

export async function checkC14(manifest, repositoryRoot) {
  const failures = [];
  let generated;

  try {
    generated = await generateDiscoveryFromRepository(manifest, repositoryRoot);
  } catch (error) {
    failures.push(`discovery generation: ${error.message}`);
    return checkResult("C14", failures, []);
  }

  for (const relPath of Object.values(DISCOVERY_FILE_PATHS)) {
    compareDiscoveryFile(
      relPath,
      generated.files[relPath],
      readBytes(repositoryRoot, relPath),
      failures,
    );
  }

  if (failures.length === 0) {
    return checkResult("C14", failures, [
      "static portion passed; discovery files match manifest-derived soma-app.json, llms.txt, and openapi.json",
      "runtime actions not_run: requires live HTTP action endpoints (M4 slice 2)",
      "executors applied not_run: requires broker-backed execution (M4 slice 2)",
      "error-envelope contract tests not_run: requires runtime API responses (M4 slice 2)",
    ]);
  }

  const wellKnownBytes = readBytes(repositoryRoot, DISCOVERY_FILE_PATHS.wellKnown);
  if (wellKnownBytes) {
    try {
      const actualSomaApp = JSON.parse(wellKnownBytes.toString("utf8"));
      compareSomaAppActions(generated.somaApp, actualSomaApp, failures);
    } catch (error) {
      failures.push(
        `public/.well-known/soma-app.json: could not parse for field diff (${error.message})`,
      );
    }
  }

  const openApiBytes = readBytes(repositoryRoot, DISCOVERY_FILE_PATHS.openApi);
  if (openApiBytes) {
    try {
      const actualOpenApi = JSON.parse(openApiBytes.toString("utf8"));
      compareOpenApiActions(generated.openapi, actualOpenApi, failures);
    } catch (error) {
      failures.push(
        `public/api/soma/v1/openapi.json: could not parse for field diff (${error.message})`,
      );
    }
  }

  return checkResult("C14", failures, []);
}
