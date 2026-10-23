#!/usr/bin/env node
// CLI: validate a Soma app spec, or scaffold an app from it.
//   soma-scaffold validate <spec.json>
//   soma-scaffold migrate-spec <v0.json>
//   soma-scaffold scaffold <spec.json> [outDir]           # static-site affordance files
//   soma-scaffold react-app <spec.json> [outDir]          # full app, cloned from soma-app-template
//   soma-scaffold provision <spec.json> [appDir]

import { dirname, resolve } from "node:path";
import { loadSpec, validate } from "../src/spec.mjs";
import { migrateSpecV0 } from "../src/migrate-spec.mjs";
import { scaffold } from "../src/scaffold.mjs";
import { scaffoldReactApp } from "../src/scaffoldReactApp.mjs";
import { provision } from "../src/provision.mjs";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const [cmd, specPath, outDir] = args.filter((a) => a !== "--execute");

function die(msg) { console.error(msg); process.exit(1); }

async function main() {
if (!cmd || !["validate", "migrate-spec", "scaffold", "react-app", "provision"].includes(cmd) || !specPath) {
  die(
    "usage:\n" +
      "  soma-scaffold validate <spec.json>\n" +
      "  soma-scaffold migrate-spec <v0.json>\n" +
      "  soma-scaffold scaffold <spec.json> [outDir]    # static-site affordance files (Legends-style)\n" +
      "  soma-scaffold react-app <spec.json> [outDir]   # full Vite/React/Supabase/Netlify app, cloned from soma-app-template\n" +
      "  soma-scaffold provision <spec.json> [appDir]   # emits provision.sh (dry-run); add --execute to run",
  );
}

let doc;
try { doc = loadSpec(specPath); } catch (e) { die(e.message); }

if (cmd === "migrate-spec") {
  const v0Errors = validate(doc);
  if (v0Errors.length) {
    console.error("✗ v0 spec invalid:");
    for (const error of v0Errors) console.error("  - " + error);
    process.exit(1);
  }
  const { manifest, unmapped, placeholders } = migrateSpecV0(doc);
  const v1Errors = validate(manifest);
  if (v1Errors.length) {
    console.error("✗ converted v1 manifest invalid:");
    for (const error of v1Errors) console.error("  - " + error);
    process.exit(1);
  }
  console.error("Unmapped v0 fields:");
  for (const field of unmapped) console.error("  - " + field);
  console.error("Placeholder values (confirm before use):");
  for (const p of placeholders) console.error(`  - ${p.path} = ${JSON.stringify(p.value)}: ${p.why}`);
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  process.exit(0);
}

const errors = validate(doc);
if (errors.length) {
  console.error("✗ spec invalid:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("✓ spec valid");

if (doc.schema_version === "soma.app/1" && cmd !== "validate" && cmd !== "react-app") {
  die(`soma.app/1 ${cmd} generation is not implemented in this contract-only slice`);
}

if (cmd === "scaffold") {
  const res = scaffold(doc, { outDir });
  console.log(`✓ scaffolded ${doc.soma_app.slug} → ${res.outDir}`);
  console.log(`  ${res.written.length} files written`);
  if (res.unresolved.length) console.log(`  ⚠ ${res.unresolved.length} unresolved placeholder(s): ${res.unresolved.join(", ")}`);
}

if (cmd === "react-app") {
  const manifestDir = dirname(resolve(specPath));
  const res = await scaffoldReactApp(doc, { outDir, manifestDir });
  const slug = doc.schema_version === "soma.app/1" ? doc.app.id : doc.soma_app.slug;
  console.log(`✓ react-app scaffolded ${slug} → ${res.outDir}`);
  console.log(`  run: cd ${res.outDir} && npm install && npm run dev`);
  if (res.unresolved.length) {
    console.log(`  ⚠ ${res.unresolved.length} unresolved guide-config placeholder(s): ${res.unresolved.join(", ")}`);
  }
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
}

await main();
