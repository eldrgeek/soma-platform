import test from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkC14 } from "../checks/c14.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = join(testDirectory, "fixtures", "minimal-app");

function copyFixture(t) {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "soma-c14-"));
  cpSync(fixture, repositoryRoot, { recursive: true });
  t.after(() => rmSync(repositoryRoot, { recursive: true, force: true }));
  return repositoryRoot;
}

function readManifest(repositoryRoot) {
  return JSON.parse(readFileSync(join(repositoryRoot, "soma-app.json"), "utf8"));
}

test("minimal app passes static C14 discovery checks", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  const result = await checkC14(manifest, repositoryRoot);
  assert.equal(result.result, "pass", result.reasons.join("\n"));
  assert.match(result.reasons.join("\n"), /runtime actions not_run/);
});

test("C14 fails when an action input schema file changes without regenerating discovery", async (t) => {
  const repositoryRoot = copyFixture(t);
  const schemaPath = join(repositoryRoot, "schemas", "inspect-agenda.input.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  schema.properties = { ...(schema.properties ?? {}), mutated: { type: "string" } };
  writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);

  const manifest = readManifest(repositoryRoot);
  const result = await checkC14(manifest, repositoryRoot);
  assert.equal(result.result, "fail");
  assert.match(result.reasons.join("\n"), /action coaching\.inspect-agenda: field input_schema/);
});

test("C14 fails when openapi.json lists a non-remote action by hand", async (t) => {
  const repositoryRoot = copyFixture(t);
  const openApiPath = join(repositoryRoot, "public", "api", "soma", "v1", "openapi.json");
  const doc = JSON.parse(readFileSync(openApiPath, "utf8"));
  doc.paths["/api/soma/v1/actions/coaching.notify-host/execute"] = {
    post: { summary: "rogue" },
  };
  writeFileSync(openApiPath, `${JSON.stringify(doc, null, 2)}\n`);

  const manifest = readManifest(repositoryRoot);
  const result = await checkC14(manifest, repositoryRoot);
  assert.equal(result.result, "fail");
  assert.match(
    result.reasons.join("\n"),
    /action coaching\.notify-host: execute path in public\/api\/soma\/v1\/openapi\.json/,
  );
});

test("C14 fails when soma-app.json risk drifts from the manifest", async (t) => {
  const repositoryRoot = copyFixture(t);
  const wellKnownPath = join(repositoryRoot, "public", ".well-known", "soma-app.json");
  const doc = JSON.parse(readFileSync(wellKnownPath, "utf8"));
  const action = doc.actions.find((entry) => entry.id === "coaching.save-reflection");
  action.risk = "reversible";
  writeFileSync(wellKnownPath, `${JSON.stringify(doc, null, 2)}\n`);

  const manifest = readManifest(repositoryRoot);
  const result = await checkC14(manifest, repositoryRoot);
  assert.equal(result.result, "fail");
  assert.match(result.reasons.join("\n"), /action coaching\.save-reflection: field risk/);
});
