#!/usr/bin/env node
// CLI: validate a Soma app spec, or scaffold an app from it.
//   soma-scaffold validate <spec.json>
//   soma-scaffold scaffold <spec.json> [outDir]

import { loadSpec, validate } from "../src/spec.mjs";
import { scaffold } from "../src/scaffold.mjs";
import { provision } from "../src/provision.mjs";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const [cmd, specPath, outDir] = args.filter((a) => a !== "--execute");

function die(msg) { console.error(msg); process.exit(1); }

if (!cmd || !["validate", "scaffold", "provision"].includes(cmd) || !specPath) {
  die("usage:\n  soma-scaffold validate <spec.json>\n  soma-scaffold scaffold <spec.json> [outDir]\n  soma-scaffold provision <spec.json> [appDir]   # emits provision.sh (dry-run); add --execute to run");
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

if (cmd === "provision") {
  const res = provision(doc, { appDir: outDir, execute });
  console.log(`✓ provision plan for ${doc.soma_app.slug} → ${res.scriptPath}`);
  console.log(`  steps: ${res.steps.map((s, i) => `${i + 1}. ${s}`).join("  ")}`);
  for (const w of res.warnings) console.log(`  ⚠ ${w}`);
  if (execute) {
    console.log(`\n  --execute requested. Run the reviewed script yourself:`);
    console.log(`    bash ${res.scriptPath}`);
    console.log(`  (soma-scaffold does not auto-run provisioning — it creates real infra and needs your credentials/secrets.)`);
  } else {
    console.log(`\n  dry-run: review ${res.scriptPath}, then run it (or re-run with --execute for instructions).`);
  }
}
