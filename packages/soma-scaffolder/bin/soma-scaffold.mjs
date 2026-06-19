#!/usr/bin/env node
// CLI: validate a Soma app spec, or scaffold an app from it.
//   soma-scaffold validate <spec.json>
//   soma-scaffold scaffold <spec.json> [outDir]

import { loadSpec, validate } from "../src/spec.mjs";
import { scaffold } from "../src/scaffold.mjs";

const [cmd, specPath, outDir] = process.argv.slice(2);

function die(msg) { console.error(msg); process.exit(1); }

if (!cmd || !["validate", "scaffold"].includes(cmd) || !specPath) {
  die("usage:\n  soma-scaffold validate <spec.json>\n  soma-scaffold scaffold <spec.json> [outDir]");
}

let doc;
try { doc = loadSpec(specPath); } catch (e) { die(e.message); }

const errors = validate(doc);
if (errors.length) {
  console.error("✗ spec invalid:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("✓ spec valid");

if (cmd === "scaffold") {
  const res = scaffold(doc, { outDir });
  console.log(`✓ scaffolded ${doc.soma_app.slug} → ${res.outDir}`);
  console.log(`  ${res.written.length} files written`);
  if (res.unresolved.length) console.log(`  ⚠ ${res.unresolved.length} unresolved placeholder(s): ${res.unresolved.join(", ")}`);
}
