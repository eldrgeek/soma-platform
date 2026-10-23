import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
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
const monorepoRoot = join(testDirectory, "..", "..", "..");
const feedbackWidgetDir = join(monorepoRoot, "packages", "soma-feedback", "widget");

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function copyFixture(t) {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "soma-c15-"));
  cpSync(minimalFixture, repositoryRoot, { recursive: true });

  const jsBytes = readFileSync(join(feedbackWidgetDir, "soma-feedback.js"));
  const cssBytes = readFileSync(join(feedbackWidgetDir, "soma-feedback.css"));
  const jsPath = "public/vendor/soma-feedback/soma-feedback.js";
  const cssPath = "public/vendor/soma-feedback/soma-feedback.css";
  mkdirSync(join(repositoryRoot, "public", "vendor", "soma-feedback"), { recursive: true });
  writeFileSync(join(repositoryRoot, jsPath), jsBytes);
  writeFileSync(join(repositoryRoot, cssPath), cssBytes);

  const manifest = JSON.parse(readFileSync(join(repositoryRoot, "soma-app.json"), "utf8"));
  writeFileSync(
    join(repositoryRoot, "index.html"),
    `<!doctype html><html><head><title>T</title></head><body>
    <link rel="stylesheet" href="/vendor/soma-feedback/soma-feedback.css">
    <script src="/vendor/soma-feedback/soma-feedback.js"
            data-no-google
            data-label="Feedback"
            data-site="${manifest.app.id}" defer></script>
  </body></html>
`,
  );

  const lock = JSON.parse(readFileSync(join(repositoryRoot, "soma-kit.lock.json"), "utf8"));
  lock.feedback_chip = {
    widget_files: {
      [jsPath]: sha256Bytes(jsBytes),
      [cssPath]: sha256Bytes(cssBytes),
    },
  };
  writeFileSync(join(repositoryRoot, "soma-kit.lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

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
