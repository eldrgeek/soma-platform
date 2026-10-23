import test from "node:test";
import assert from "node:assert/strict";
import {
  appendFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkC15 } from "../checks/c15.mjs";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const minimalFixture = join(testDirectory, "fixtures", "minimal-app");

function copyFixture(t) {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "soma-c15-"));
  cpSync(minimalFixture, repositoryRoot, { recursive: true });
  t.after(() => rmSync(repositoryRoot, { recursive: true, force: true }));
  return repositoryRoot;
}

function readManifest(repositoryRoot) {
  return JSON.parse(readFileSync(join(repositoryRoot, "soma-app.json"), "utf8"));
}

test("C15 passes when feedback chip files and index.html match the lock", async (t) => {
  const repositoryRoot = copyFixture(t);
  const manifest = readManifest(repositoryRoot);
  const result = await checkC15(manifest, repositoryRoot);
  assert.equal(result.result, "pass", result.reasons.join("\n"));
});

test("C15 fails when the feedback chip script tag is removed from index.html", async (t) => {
  const repositoryRoot = copyFixture(t);
  const htmlPath = join(repositoryRoot, "index.html");
  let html = readFileSync(htmlPath, "utf8");
  html = html.replace(
    /<script[^>]*\/vendor\/soma-feedback\/soma-feedback\.js[^>]*>\s*<\/script>\s*/s,
    "",
  );
  writeFileSync(htmlPath, html);

  const manifest = readManifest(repositoryRoot);
  const result = await checkC15(manifest, repositoryRoot);
  assert.equal(result.result, "fail");
  assert.deepEqual(result.reasons, [
    "index.html: missing feedback chip script tag (/vendor/soma-feedback/soma-feedback.js)",
  ]);
});

test("C15 fails when the feedback chip script tag is only inside an HTML comment", async (t) => {
  const repositoryRoot = copyFixture(t);
  const htmlPath = join(repositoryRoot, "index.html");
  let html = readFileSync(htmlPath, "utf8");
  html = html.replace(
    /<script[^>]*\/vendor\/soma-feedback\/soma-feedback\.js[^>]*>\s*<\/script>\s*/s,
    "",
  );
  html = html.replace(
    "</body>",
    `<!-- <script src="/vendor/soma-feedback/soma-feedback.js" data-no-google data-site="veric-coaching"></script> --></body>`,
  );
  writeFileSync(htmlPath, html);

  const manifest = readManifest(repositoryRoot);
  const result = await checkC15(manifest, repositoryRoot);
  assert.equal(result.result, "fail");
  assert.deepEqual(result.reasons, [
    "index.html: missing feedback chip script tag (/vendor/soma-feedback/soma-feedback.js)",
  ]);
});

test("C15 fails when soma-kit.lock.json has no feedback_chip section", async (t) => {
  const repositoryRoot = copyFixture(t);
  const lock = JSON.parse(readFileSync(join(repositoryRoot, "soma-kit.lock.json"), "utf8"));
  delete lock.feedback_chip;
  writeFileSync(join(repositoryRoot, "soma-kit.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

  const manifest = readManifest(repositoryRoot);
  const result = await checkC15(manifest, repositoryRoot);
  assert.equal(result.result, "fail");
  assert.deepEqual(result.reasons, [
    "soma-kit.lock.json has no feedback_chip (v1 apps must ship the chip)",
  ]);
});

test("C15 fails when soma-kit.lock.json is unreadable", async (t) => {
  const repositoryRoot = copyFixture(t);
  writeFileSync(join(repositoryRoot, "soma-kit.lock.json"), "{ not valid json\n");

  const manifest = readManifest(repositoryRoot);
  const result = await checkC15(manifest, repositoryRoot);
  assert.equal(result.result, "fail");
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /^soma-kit\.lock\.json: unreadable \(/);
});

test("C15 fails when a locked widget file byte changes", async (t) => {
  const repositoryRoot = copyFixture(t);
  appendFileSync(join(repositoryRoot, "public/vendor/soma-feedback/soma-feedback.js"), " ");
  const manifest = readManifest(repositoryRoot);
  const result = await checkC15(manifest, repositoryRoot);
  assert.equal(result.result, "fail");
  assert.equal(result.reasons.length, 1);
  assert.match(
    result.reasons[0],
    /^public\/vendor\/soma-feedback\/soma-feedback\.js: sha256 [0-9a-f]{64} does not match/,
  );
});
