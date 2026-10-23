import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readLock } from "@soma/contracts";
import { checkResult, notRun } from "../src/result.mjs";

const FEEDBACK_SCRIPT = "/vendor/soma-feedback/soma-feedback.js";
const FEEDBACK_STYLESHEET = "/vendor/soma-feedback/soma-feedback.css";
const WIDGET_PATHS = [
  "public/vendor/soma-feedback/soma-feedback.js",
  "public/vendor/soma-feedback/soma-feedback.css",
];

function sha256File(repositoryRoot, relPath) {
  const full = join(repositoryRoot, relPath);
  const bytes = readFileSync(full);
  return createHash("sha256").update(bytes).digest("hex");
}

function indexHtmlPath(repositoryRoot) {
  const full = join(repositoryRoot, "index.html");
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

export async function checkC15(manifest, repositoryRoot) {
  let lock;
  try {
    lock = readLock(join(repositoryRoot, "soma-kit.lock.json"));
  } catch (error) {
    return notRun("C15", `feedback chip check needs soma-kit.lock.json (${error.message})`);
  }

  if (!lock.feedback_chip?.widget_files) {
    return notRun("C15", "soma-kit.lock.json has no feedback_chip.widget_files (pre-feedback scaffold)");
  }

  const failures = [];
  const html = indexHtmlPath(repositoryRoot);
  const appId = manifest?.app?.id;

  if (!html) {
    failures.push("index.html: file is missing");
  } else {
    if (!html.includes(FEEDBACK_STYLESHEET)) {
      failures.push(
        `index.html: missing feedback chip stylesheet link (${FEEDBACK_STYLESHEET})`,
      );
    }
    if (!html.includes(FEEDBACK_SCRIPT)) {
      failures.push(`index.html: missing feedback chip script tag (${FEEDBACK_SCRIPT})`);
    } else if (appId && !html.includes(`data-site="${appId}"`)) {
      failures.push(
        `index.html: feedback chip script data-site must be the manifest app id (${appId})`,
      );
    }
    if (html.includes(FEEDBACK_SCRIPT) && !html.includes("data-no-google")) {
      failures.push("index.html: feedback chip script must include data-no-google");
    }
  }

  for (const relPath of WIDGET_PATHS) {
    const full = join(repositoryRoot, relPath);
    if (!existsSync(full)) {
      failures.push(`${relPath}: file is missing`);
      continue;
    }
    const pinned = lock.feedback_chip.widget_files[relPath];
    if (!pinned) {
      failures.push(`soma-kit.lock.json feedback_chip.widget_files: missing entry for ${relPath}`);
      continue;
    }
    const actual = sha256File(repositoryRoot, relPath);
    if (actual !== pinned) {
      failures.push(
        `${relPath}: sha256 ${actual} does not match soma-kit.lock.json feedback_chip.widget_files.${relPath} ${pinned}`,
      );
    }
  }

  if (failures.length === 0) {
    return checkResult("C15", failures, [
      "feedback chip script, vendored widget files, and lock hashes are present",
    ]);
  }
  return checkResult("C15", failures, []);
}
