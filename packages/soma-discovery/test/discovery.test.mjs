import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateDiscoveryFromRepository,
  remoteActions,
  assertNoForbiddenRoutes,
} from "../src/index.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(testDirectory, "..", "..", "soma-conformance", "test", "fixtures", "minimal-app");

function readManifest() {
  return JSON.parse(readFileSync(join(fixtureRoot, "soma-app.json"), "utf8"));
}

test("remoteActions lists only manifest actions with the remote surface", () => {
  const manifest = readManifest();
  const ids = remoteActions(manifest).map((action) => action.id);
  assert.deepEqual(ids, ["coaching.inspect-agenda", "coaching.save-reflection"]);
  assert.equal(ids.includes("coaching.notify-host"), false);
});

test("discovery artifacts exclude approval decision and consent routes", async () => {
  const manifest = readManifest();
  const { files, llms, openapi } = await generateDiscoveryFromRepository(
    manifest,
    fixtureRoot,
  );
  assertNoForbiddenRoutes(files);
  const combined = `${llms}\n${JSON.stringify(openapi)}`;
  assert.doesNotMatch(combined, /approvals\/.*\/decision/);
  assert.doesNotMatch(combined, /\/api\/soma\/v1\/me\/answers/);
});

test("effect execute operations require Idempotency-Key in OpenAPI", async () => {
  const manifest = readManifest();
  const { openapi } = await generateDiscoveryFromRepository(manifest, fixtureRoot);
  const executePath = "/api/soma/v1/actions/coaching.save-reflection/execute";
  const operation = openapi.paths[executePath]?.post;
  assert.ok(operation);
  const idempotency = operation.parameters?.find(
    (parameter) => parameter.name === "Idempotency-Key",
  );
  assert.equal(idempotency?.required, true);
  assert.equal(operation["x-soma-requires-idempotency-key"], true);

  const observePath = "/api/soma/v1/actions/coaching.inspect-agenda/execute";
  const observeOperation = openapi.paths[observePath]?.post;
  assert.ok(observeOperation);
  assert.equal(observeOperation.parameters, undefined);
});

test("generateDiscoveryFromRepository is byte-stable across repeated runs", async () => {
  const manifest = readManifest();
  const first = await generateDiscoveryFromRepository(manifest, fixtureRoot);
  const second = await generateDiscoveryFromRepository(manifest, fixtureRoot);
  for (const relPath of Object.keys(first.files)) {
    assert.equal(
      first.files[relPath].equals(second.files[relPath]),
      true,
      relPath,
    );
  }
});

test("OpenAPI documents common error schema and bearer authentication", async () => {
  const manifest = readManifest();
  const { openapi } = await generateDiscoveryFromRepository(manifest, fixtureRoot);
  assert.ok(openapi.components.schemas.SomaErrorResponse);
  assert.ok(openapi.components.securitySchemes.somaAgentBearer);
  assert.match(openapi.info.description, /Rate limits use platform-derived/);
});
