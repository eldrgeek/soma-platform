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
import { embedSchemaForOpenApi, resolveJsonPointer } from "../src/schema-ref.mjs";

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

test("embedded action schemas rewrite local $ref pointers into OpenAPI components", () => {
  const inputSchema = JSON.parse(
    readFileSync(join(testDirectory, "fixtures", "with-local-ref.input.json"), "utf8"),
  );
  const componentName = "demo_Input";
  const embedded = embedSchemaForOpenApi(inputSchema, componentName);
  const ref = embedded.properties.payload.$ref;
  assert.equal(ref, `#/components/schemas/${componentName}/$defs/payload`);
  const openapi = {
    components: {
      schemas: {
        [componentName]: embedded,
      },
    },
  };
  const resolved = resolveJsonPointer(openapi, ref);
  assert.equal(resolved.type, "object");
  assert.equal(resolved.properties.note.type, "string");
});

test("embedded action schemas refuse external $ref pointers", () => {
  assert.throws(
    () => embedSchemaForOpenApi({ $ref: "other.schema.json" }, "demo_Input"),
    /external \$ref is not supported/,
  );
});

test("OpenAPI marks every /api/soma/v1 path as not_live and uses a dedicated 202 schema", async () => {
  const manifest = readManifest();
  const { openapi } = await generateDiscoveryFromRepository(manifest, fixtureRoot);
  assert.match(openapi.info.description, /does not serve them yet/);
  for (const [path, item] of Object.entries(openapi.paths)) {
    assert.match(path, /^\/api\/soma\/v1\//);
    for (const operation of Object.values(item)) {
      if (operation && typeof operation === "object" && "responses" in operation) {
        assert.equal(operation["x-soma-status"], "not_live");
      }
    }
  }
  const preparePath = "/api/soma/v1/actions/coaching.save-reflection/prepare";
  const response202 = openapi.paths[preparePath].post.responses["202"];
  assert.match(
    response202.content["application/json"].schema.$ref,
    /SomaApprovalRequired$/,
  );
});

test("discovery documents name no identity origin until the broker ships", async () => {
  const manifest = readManifest();
  const { somaApp, llms, files } = await generateDiscoveryFromRepository(
    manifest,
    fixtureRoot,
  );
  assert.equal(somaApp.identity?.pairing, "not_available");
  assert.equal(somaApp.identity?.origin, undefined);
  assert.equal(somaApp.identity?.oauth_authorization_server, undefined);
  assert.doesNotMatch(llms, /mike-wolf\.com/i);
  const combined = Object.values(files)
    .map((bytes) => bytes.toString("utf8"))
    .join("\n");
  assert.doesNotMatch(combined, /mike-wolf\.com/i);
  assert.doesNotMatch(combined, /https:\/\/id\./i);
});
