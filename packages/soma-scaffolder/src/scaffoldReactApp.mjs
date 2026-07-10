// Spec -> a full, runnable React/Vite/Supabase/Netlify app, derived from
// ~/Projects/soma-app-template (SOMA-APP-STANDARD's reference implementation
// repo). This is the "birth a new SOMA app already compliant" path: instead
// of assembling static-site affordance files one-by-one (scaffold.mjs's job,
// aimed at Legends-style static sites), this COPIES the template app whole
// and substitutes the small set of per-app values, per SOMA-APP-STANDARD
// §15b's federation model — "fork = change 2 constants" — plus the guide
// persona and host-pair names, which the template deliberately ships as
// loud placeholders (see soma-app-template/src/lib/hostPair.ts) so a spec
// that omits them still produces an app that visibly says "unfilled."
//
// Reuses buildValues()/fill()/removeLineContaining()/removeBlock() from
// scaffold.mjs so the guide-config/knowledge templating logic has ONE
// source, not two competing placeholder engines.

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildValues, fill, removeLineContaining, removeBlock } from "./scaffold.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_APP_TEMPLATE = join(__dirname, "..", "..", "..", "..", "soma-app-template");
const DEFAULT_AFFORDANCES_TEMPLATES = join(__dirname, "..", "..", "..", "templates", "soma-affordances");

// Directories/files never copied from the source template into a fresh app.
const EXCLUDE = new Set([
  "node_modules",
  "dist",
  "dist-ssr",
  ".git",
  ".netlify",
  ".env.local",
]);

function copyTemplateTree(srcDir, outDir) {
  mkdirSync(outDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    if (EXCLUDE.has(entry)) continue;
    const src = join(srcDir, entry);
    const dest = join(outDir, entry);
    const st = statSync(src);
    if (st.isDirectory()) {
      // Top-level EXCLUDE check above already keeps node_modules/dist/.git/etc
      // out (they're direct children of the template root); nothing in this
      // template nests a second copy of those inside src/public/netlify/supabase.
      cpSync(src, dest, { recursive: true });
    } else {
      cpSync(src, dest);
    }
  }
}

function writeFile(outDir, rel, content) {
  const full = join(outDir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return rel;
}

/**
 * Replace THIS app's two identity constants — SOMA-APP-STANDARD §15b's
 * "copy the repo, change these two constants" — in both appConfig.ts twins.
 */
function rewriteAppConfig(outDir, rel, appId, appName) {
  const full = join(outDir, rel);
  if (!existsSync(full)) return;
  let src = readFileSync(full, "utf8");
  src = src.replace(/APP_ID = '[^']*'/, `APP_ID = '${appId}'`);
  src = src.replace(/APP_NAME = '[^']*'/, `APP_NAME = '${appName}'`);
  writeFileSync(full, src);
}

function rewriteHostPair(outDir, app) {
  const rel = "src/lib/hostPair.ts";
  const full = join(outDir, rel);
  if (!existsSync(full)) return;
  let src = readFileSync(full, "utf8");
  const human = app.human_manager || app.owner;
  if (human?.name) {
    src = src.replace(
      /name: '\(unassigned — name your human host here\)'/,
      `name: '${human.name.replace(/'/g, "\\'")}'`,
    );
  }
  const persona = app.affordances?.guide?.persona;
  if (persona?.name) {
    src = src
      .replace(/name: 'Guide'/, `name: '${persona.name.replace(/'/g, "\\'")}'`)
      .replace(/avatar: '🤖'/, `avatar: '${(persona.avatar || "🤖").replace(/'/g, "\\'")}'`);
  }
  writeFileSync(full, src);
}

/** Fill public/js/soma-guide-config.js + knowledge.js from the SAME templates
 *  (and the SAME buildValues()) the static-site scaffold path uses — one
 *  templating engine, two output shapes. */
function rewriteGuideConfig(outDir, app, values, unresolved, templatesDir) {
  const g = app.affordances?.guide;
  if (!g?.enabled) return;

  let cfg = readFileSync(join(templatesDir, "bill/soma-guide-config.template.js"), "utf8");
  if (!g.voice?.enabled) cfg = removeLineContaining(cfg, "{{VOICE_AGENT_ID}}");
  if (!g.narration?.enabled) cfg = removeLineContaining(cfg, "{{TTS_PROXY_URL}}");
  if (!g.ask?.enabled) cfg = removeLineContaining(cfg, "{{INFERENCE_URL}}");
  cfg = removeBlock(cfg, "identity"); // template's own identity wiring already lives in AuthProvider
  cfg = fill(cfg, values, unresolved);
  writeFile(outDir, "public/js/soma-guide-config.js", cfg);

  const kn = fill(readFileSync(join(templatesDir, "bill/knowledge.template.js"), "utf8"), values, unresolved);
  writeFile(outDir, "public/js/knowledge.js", kn);
}

function rewritePackageJson(outDir, app) {
  const full = join(outDir, "package.json");
  const pkg = JSON.parse(readFileSync(full, "utf8"));
  pkg.name = app.slug;
  pkg.description = app.description || `${app.name} — a SOMA app scaffolded from soma-app-template.`;
  writeFileSync(full, JSON.stringify(pkg, null, 2) + "\n");
}

function rewriteIndexHtml(outDir, app) {
  const full = join(outDir, "index.html");
  if (!existsSync(full)) return;
  let html = readFileSync(full, "utf8");
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${app.name}</title>`);
  writeFileSync(full, html);
}

function setupDoc(app, unresolved) {
  const lines = [];
  lines.push(`# ${app.name} — generated setup (react-app scaffold)`);
  lines.push("");
  lines.push(`Scaffolded by soma-scaffolder's react-app mode from soma-app-template.`);
  lines.push(`This is a full clone of the template, not a file-by-file assembly — every`);
  lines.push(`SOMA-APP-STANDARD affordance the template implements ships here too. See`);
  lines.push(`the copied \`SOMA-STANDARD-CHECKLIST.md\` and \`README.md\` for what's live vs. stubbed.`);
  lines.push("");
  lines.push(`- **Slug / app_id:** \`${app.slug}\``);
  lines.push(`- **Repo:** ${app.targets.repo || "(create one)"}`);
  lines.push(`- **Netlify site:** ${app.targets.netlify_site || "(create one)"}`);
  lines.push("");
  lines.push(`## What was substituted`);
  lines.push(`- \`src/lib/appConfig.ts\` + \`netlify/functions/lib/appConfig.ts\` — APP_ID/APP_NAME (§15b).`);
  lines.push(`- \`src/lib/hostPair.ts\` — human host name (from `);
  lines.push(`  \`human_manager\`/\`owner\`) + AI host name/avatar (from \`affordances.guide.persona\`).`);
  if (app.affordances?.guide?.enabled) {
    lines.push(`- \`public/js/soma-guide-config.js\` + \`knowledge.js\` — persona, scope guard, site map.`);
  }
  lines.push(`- \`package.json\` name/description, \`index.html\` title.`);
  lines.push("");
  lines.push(`## What you still do by hand`);
  lines.push(`1. \`npm install\``);
  lines.push(`2. Provision a Supabase project; run every file in \`supabase/migrations/\` in order.`);
  lines.push(`3. Copy \`.env.example\` -> \`.env.local\`, fill in your project's URL/keys (client) and`);
  lines.push(`   service-role key + JWT secret (server, Netlify env — never commit).`);
  lines.push(`4. Seed a \`profiles.is_admin = true\` row or set \`ADMIN_EMAILS\`.`);
  lines.push(`5. Regenerate the favicon set (\`public/favicon*.png\`, \`apple-touch-icon.png\`) for`);
  lines.push(`   this app's own mark — the copied ones are still the template's placeholder mark.`);
  lines.push(`6. Fill in a real tour in \`public/js/soma-guide-config.js\`'s \`walkthroughs\` once the`);
  lines.push(`   app has its own real UI (§7).`);
  if (unresolved.size) {
    lines.push("");
    lines.push(`## ⚠️ Unresolved guide-config placeholders`);
    lines.push(`No value in the spec — left as \`{{...}}\` in \`public/js/soma-guide-config.js\`:`);
    for (const u of [...unresolved].sort()) lines.push(`- \`{{${u}}}\``);
  }
  lines.push("");
  return lines.join("\n");
}

export function scaffoldReactApp(
  doc,
  { outDir, appTemplateDir = DEFAULT_APP_TEMPLATE, affordancesTemplatesDir = DEFAULT_AFFORDANCES_TEMPLATES } = {},
) {
  const app = doc.soma_app;
  if (!existsSync(appTemplateDir)) {
    throw new Error(
      `scaffoldReactApp: source template not found at ${appTemplateDir}. ` +
        `Expected ~/Projects/soma-app-template to exist as a sibling of soma-platform.`,
    );
  }
  if (!outDir) outDir = join(process.cwd(), `${app.slug}-soma`);
  if (existsSync(outDir)) {
    throw new Error(`scaffoldReactApp: outDir already exists: ${outDir} (refusing to overwrite)`);
  }

  copyTemplateTree(appTemplateDir, outDir);

  const values = buildValues(app);
  const unresolved = new Set();

  rewriteAppConfig(outDir, "src/lib/appConfig.ts", app.slug, app.name);
  rewriteAppConfig(outDir, "netlify/functions/lib/appConfig.ts", app.slug, app.name);
  rewriteHostPair(outDir, app);
  rewriteGuideConfig(outDir, app, values, unresolved, affordancesTemplatesDir);
  rewritePackageJson(outDir, app);
  rewriteIndexHtml(outDir, app);

  writeFile(outDir, "soma-app.json", JSON.stringify(doc, null, 2) + "\n");
  writeFile(outDir, "SETUP.md", setupDoc(app, unresolved));

  return { outDir, unresolved: [...unresolved] };
}
