import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readLock } from "@soma/contracts";
import { checkResult } from "../src/result.mjs";

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

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

function parseAttributeValue(attrs, name) {
  const quoted = new RegExp(
    `\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`,
    "i",
  ).exec(attrs);
  if (quoted) {
    return quoted[1] ?? quoted[2];
  }
  const bare = new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i").exec(attrs);
  return bare ? bare[1] : null;
}

function hasBooleanAttribute(attrs, name) {
  return new RegExp(`\\b${name}\\b(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`, "i").test(
    attrs,
  );
}

function normalizeScriptSrc(src) {
  if (!src) {
    return "";
  }
  try {
    const url = new URL(src, "https://app.local");
    return url.pathname;
  } catch {
    return src.split("?")[0].split("#")[0];
  }
}

function findFeedbackChipScriptTag(html) {
  const active = stripHtmlComments(html);
  const tagPattern = /<script\b([^>]*)>/gi;
  let match;
  while ((match = tagPattern.exec(active)) !== null) {
    const attrs = match[1];
    const src = parseAttributeValue(attrs, "src");
    if (normalizeScriptSrc(src) === FEEDBACK_SCRIPT) {
      return attrs;
    }
  }
  return null;
}

function findFeedbackChipStylesheetLink(html) {
  const active = stripHtmlComments(html);
  const tagPattern = /<link\b([^>]*)>/gi;
  let match;
  while ((match = tagPattern.exec(active)) !== null) {
    const attrs = match[1];
    if (!/\brel\s*=\s*["']?stylesheet/i.test(attrs)) {
      continue;
    }
    const href = parseAttributeValue(attrs, "href");
    if (normalizeScriptSrc(href) === FEEDBACK_STYLESHEET) {
      return attrs;
    }
  }
  return null;
}

export async function checkC15(manifest, repositoryRoot) {
  const lockPath = join(repositoryRoot, "soma-kit.lock.json");
  let lockDoc;
  try {
    lockDoc = JSON.parse(readFileSync(lockPath, "utf8"));
  } catch (error) {
    return checkResult(
      "C15",
      [`soma-kit.lock.json: unreadable (${error.message})`],
      [],
    );
  }

  if (!lockDoc.feedback_chip?.widget_files) {
    return checkResult(
      "C15",
      ["soma-kit.lock.json has no feedback_chip (v1 apps must ship the chip)"],
      [],
    );
  }

  let lock;
  try {
    lock = readLock(lockPath);
  } catch (error) {
    return checkResult(
      "C15",
      [`soma-kit.lock.json: unreadable (${error.message})`],
      [],
    );
  }

  const failures = [];
  const html = indexHtmlPath(repositoryRoot);
  const appId = manifest?.app?.id;

  if (!html) {
    failures.push("index.html: file is missing");
  } else {
    if (!findFeedbackChipStylesheetLink(html)) {
      failures.push(
        `index.html: missing feedback chip stylesheet link (${FEEDBACK_STYLESHEET})`,
      );
    }

    const scriptAttrs = findFeedbackChipScriptTag(html);
    if (!scriptAttrs) {
      failures.push(`index.html: missing feedback chip script tag (${FEEDBACK_SCRIPT})`);
    } else {
      if (!hasBooleanAttribute(scriptAttrs, "data-no-google")) {
        failures.push("index.html: feedback chip script must include data-no-google");
      }
      if (hasBooleanAttribute(scriptAttrs, "data-endpoint")) {
        failures.push("index.html: feedback chip script must not include data-endpoint");
      }
      const dataSite = parseAttributeValue(scriptAttrs, "data-site");
      if (appId && dataSite !== appId) {
        failures.push(
          `index.html: feedback chip script data-site must be the manifest app id (${appId})`,
        );
      }
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
