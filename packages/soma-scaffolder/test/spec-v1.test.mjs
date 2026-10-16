import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { migrateSpecV0 } from "../src/migrate-spec.mjs";
import { loadSpec, validate } from "../src/spec.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "bin", "soma-scaffold.mjs");
const examples = [
  "legends.soma.json",
  "legends-billing.soma.json",
  "soma-forge.soma.json",
];

function runCli(...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
}

test("migrate-spec converts all three v0 examples to valid v1 manifests", () => {
  for (const example of examples) {
    const result = runCli("migrate-spec", join(root, "examples", example));
    assert.equal(result.status, 0, `${example}\n${result.stderr}`);
    const manifest = JSON.parse(result.stdout);
    assert.deepEqual(validate(manifest), [], example);
    assert.equal(manifest.identity.subject, "pairwise");
    assert.equal("legacy_auth_storage_keys" in manifest.identity, false);
    assert.match(
      result.stderr,
      /soma_app\.targets\.supabase\.identity_project/,
      example,
    );
    assert.match(result.stderr, /Placeholder values/, example);
    assert.match(result.stderr, /identity\.subject = "pairwise"/, example);
    assert.match(result.stderr, /hosts\.ai\.persona = /, example);
  }
});

test("validate dispatches v1 to contracts and keeps the v0 path", () => {
  const v0 = loadSpec(join(root, "examples", "legends.soma.json"));
  assert.deepEqual(validate(v0), []);

  const converted = runCli(
    "migrate-spec",
    join(root, "examples", "legends.soma.json"),
  );
  assert.equal(converted.status, 0, converted.stderr);

  const directory = mkdtempSync(join(tmpdir(), "soma-scaffolder-v1-"));
  const manifestPath = join(directory, "soma-app.json");
  try {
    writeFileSync(manifestPath, converted.stdout);
    const valid = runCli("validate", manifestPath);
    assert.equal(valid.status, 0, valid.stderr);
    assert.match(valid.stdout, /spec valid/);

    const doc = JSON.parse(readFileSync(manifestPath, "utf8"));
    doc.unknown_root_key = true;
    writeFileSync(manifestPath, JSON.stringify(doc));
    const invalid = runCli("validate", manifestPath);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /additional properties/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("dispatch rejects unknown versions and migration normalizes v1 identifiers", () => {
  assert.match(validate({ schema_version: "soma.app/2" })[0], /unsupported/);

  const v0 = loadSpec(join(root, "examples", "legends.soma.json"));
  v0.soma_app.slug = "123-example";
  v0.soma_app.targets.repo = "not a repository";
  const { manifest, unmapped } = migrateSpecV0(v0);
  assert.equal(manifest.app.id, "app-123-example");
  assert.equal(validate(manifest).length, 0);
  assert.ok(unmapped.includes("soma_app.targets.repo"));
});
