// Spec -> scaffolded Soma app. Reads templates/soma-affordances, fills placeholders
// from the spec, emits only the files the enabled affordances need, and writes a
// generated SETUP.md with the manual steps that remain.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATES = join(__dirname, "..", "..", "..", "templates", "soma-affordances");

function read(p) { return readFileSync(p, "utf8"); }
function write(outDir, rel, content) {
  const full = join(outDir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return rel;
}

// Replace {{KEY}} with values. Records any placeholder left unresolved.
function fill(content, values, unresolved) {
  return content.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, key) => {
    if (key === "DOUBLE_BRACE") return m; // doc example, leave as-is
    const v = values[key];
    if (v === undefined || v === null || v === "") { unresolved.add(key); return m; }
    return String(v);
  });
}

function removeLineContaining(content, substr) {
  return content.split("\n").filter((l) => !l.includes(substr)).join("\n");
}

// Remove a `key: { ... },` block via brace counting (best-effort, for disabled features).
function removeBlock(content, key) {
  const start = content.indexOf(`${key}: {`);
  if (start === -1) return content;
  let i = content.indexOf("{", start);
  let depth = 0;
  for (; i < content.length; i++) {
    if (content[i] === "{") depth++;
    else if (content[i] === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  if (content[i] === ",") i++;
  return content.slice(0, start) + content.slice(i);
}

function buildValues(app) {
  const g = app.affordances.guide || {};
  const au = app.affordances.auth || {};
  const cl = app.affordances.changelog || {};
  const fb = app.affordances.feedback || {};
  const persona = g.persona || {};
  const site = app.targets.netlify_site;
  return {
    SITE_NAME: app.name,
    SITE_URL: site ? `https://${site}.netlify.app` : "",
    SUPABASE_PROJECT_REF: app.targets.supabase?.app_project?.ref,
    PERSONA_NAME: persona.name,
    PERSONA_AVATAR: persona.avatar,
    APP_ID: app.slug,
    ASSISTANT_ID: persona.assistant_id,
    ADMIN_EMAIL_1: au.admin_emails?.[0],
    ADMIN_EMAIL_2: au.admin_emails?.[1],
    ADMIN_CONTACT_EMAIL: app.human_manager?.email || app.owner?.email,
    PUBLISH_AGENT_EMAIL: cl.publish_agent_email,
    LOGIN_PATH: au.login_path,
    ACCEPT_STORAGE_KEY: cl.accept_storage_key,
    ADMIN_HOME_PATH: cl.admin_home_path,
    VOICE_AGENT_ID: g.voice?.agent_id,
    TTS_PROXY_URL: g.narration?.tts_proxy_url,
    INFERENCE_URL: g.ask?.inference_url,
    OWNER_EMAIL: fb.owner_email,
  };
}

function pageIncludes(app) {
  const a = app.affordances;
  const lines = [];
  if (a.identity?.enabled)
    lines.push(`<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>`);
  if (a.auth?.enabled) {
    lines.push(`<script src="/js/soma-auth-config.js"></script>`);
    lines.push(`<script src="/js/soma-auth.js"></script>`);
  }
  if (a.guide?.enabled) {
    lines.push(`<script src="/js/knowledge.js"></script>`);
    lines.push(`<script src="/js/soma-guide-config.js"></script>`);
    const engine = app.targets.delivery === "vendored"
      ? `<script type="module" src="/js/soma-guide.js"></script>`
      : `<script type="module" src="https://soma-guide.netlify.app/soma-guide.js"></script>`;
    lines.push(`${engine}  <!-- engine, LAST -->`);
  }
  return lines;
}

function setupDoc(app, written, unresolved) {
  const a = app.affordances;
  const needsBackend = a.changelog?.enabled || a.feedback?.enabled || a.identity?.enabled || a.intake?.enabled;
  const env = [];
  if (needsBackend) { env.push("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"); }
  if (a.feedback?.enabled) { env.push("OWNER_EMAIL (optional)", "ASSISTANT_ID (optional)"); }

  const lines = [];
  lines.push(`# ${app.name} — generated setup`);
  lines.push("");
  lines.push(`Scaffolded by soma-scaffolder from the app spec (\`soma-app.json\`). Follow these`);
  lines.push(`steps to bring the app online. See \`docs/soma-apps/\` for the full model.`);
  lines.push("");
  lines.push(`- **Slug / app_id:** \`${app.slug}\``);
  lines.push(`- **Netlify site:** ${app.targets.netlify_site || "(set one)"}  ·  push-to-rebuild`);
  lines.push(`- **Repo:** ${app.targets.repo || "(create one)"}`);
  lines.push(`- **Delivery:** ${app.targets.delivery}`);
  lines.push("");
  lines.push(`## Enabled affordances`);
  for (const [k, v] of Object.entries(a)) lines.push(`- ${v?.enabled ? "✅" : "⬜"} ${k}`);
  lines.push("");
  if (needsBackend) {
    lines.push(`## Supabase`);
    lines.push(`- Identity (\`soma_profiles\`) lives in the **shared SOMA project** (\`${app.targets.supabase?.identity_project || "shared-soma"}\`).`);
    const ap = app.targets.supabase?.app_project;
    lines.push(`- App data project: ${ap?.ref ? `\`${ap.ref}\`` : "(set ref)"}${ap?.shared ? " (shared)" : ""}.`);
    lines.push(`- Run \`sql/schema.sql\` in the SQL editor (idempotent). Confirm RLS-enabled tables exist.`);
    lines.push("");
    lines.push(`## Netlify env vars`);
    for (const e of env) lines.push(`- \`${e}\``);
    lines.push("");
  }
  lines.push(`## Page includes (every page Bill should appear on, in this order)`);
  lines.push("```html");
  for (const l of pageIncludes(app)) lines.push(l);
  lines.push("```");
  lines.push("");
  if (a.auth?.enabled) {
    lines.push(`## Not generated — wire these yourself`);
    lines.push(`- \`js/soma-auth-config.js\` and \`js/soma-auth.js\` (from \`packages/auth/\`) — auth is enabled but the auth bundle is per-deployment.`);
    lines.push("");
  }
  if (a.room?.enabled) {
    lines.push(`## Room (community tier)`);
    lines.push(`- The Room is converging (FrontRow + campus). Wire against FrontRow source; not auto-scaffolded yet.`);
    lines.push("");
  }
  if (unresolved.size) {
    lines.push(`## ⚠️ Unresolved placeholders`);
    lines.push(`These had no value in the spec and remain as \`{{...}}\` in the output — fill or extend the spec:`);
    for (const u of [...unresolved].sort()) lines.push(`- \`{{${u}}}\``);
    lines.push("");
  }
  lines.push(`## Files written`);
  for (const f of written) lines.push(`- \`${f}\``);
  lines.push("");
  return lines.join("\n");
}

export function scaffold(doc, { outDir, templatesDir = DEFAULT_TEMPLATES } = {}) {
  const app = doc.soma_app;
  if (!outDir) outDir = join(process.cwd(), `${app.slug}-soma`);
  const values = buildValues(app);
  const unresolved = new Set();
  const written = [];
  const a = app.affordances;
  const T = (rel) => join(templatesDir, rel);

  // Guide: config + knowledge
  if (a.guide?.enabled) {
    let cfg = read(T("bill/soma-guide-config.template.js"));
    // Strip disabled-feature lines/blocks BEFORE fill, keyed on the placeholder
    // token, so removed placeholders are never recorded as "unresolved".
    if (!a.guide.voice?.enabled) cfg = removeLineContaining(cfg, "{{VOICE_AGENT_ID}}");
    if (!a.guide.narration?.enabled) cfg = removeLineContaining(cfg, "{{TTS_PROXY_URL}}");
    if (!a.guide.ask?.enabled) cfg = removeLineContaining(cfg, "{{INFERENCE_URL}}");
    if (!a.identity?.enabled) cfg = removeBlock(cfg, "identity");
    cfg = fill(cfg, values, unresolved);
    written.push(write(outDir, "js/soma-guide-config.js", cfg));

    let kn = fill(read(T("bill/knowledge.template.js")), values, unresolved);
    written.push(write(outDir, "js/knowledge.js", kn));
  }

  // Change Log page
  if (a.changelog?.enabled) {
    const html = fill(read(T("changelog/admin-changelog.template.html")), values, unresolved);
    written.push(write(outDir, "admin-changelog.html", html));
  }

  // Feedback / telemetry functions
  if (a.feedback?.enabled) {
    for (const fn of ["submit-feedback.js", "log-bill.js"]) {
      const js = fill(read(T(`functions/${fn}`)), values, unresolved);
      written.push(write(outDir, `netlify/functions/${fn}`, js));
    }
  }

  // Shared schema (any backend affordance)
  if (a.changelog?.enabled || a.feedback?.enabled || a.identity?.enabled || a.intake?.enabled) {
    const sql = fill(read(T("sql/schema.sql")), values, unresolved);
    written.push(write(outDir, "sql/schema.sql", sql));
  }

  // Provenance + setup
  written.push(write(outDir, "soma-app.json", JSON.stringify(doc, null, 2) + "\n"));
  const setup = setupDoc(app, written, unresolved);
  write(outDir, "SETUP.md", setup);

  return { outDir, written: [...written, "SETUP.md"], unresolved: [...unresolved] };
}
