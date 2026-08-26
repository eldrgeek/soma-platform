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
export function fill(content, values, unresolved) {
  return content.replace(/\{\{([A-Z_0-9]+)\}\}/g, (m, key) => {
    if (key === "DOUBLE_BRACE") return m; // doc example, leave as-is
    const v = values[key];
    if (v === undefined || v === null || v === "") { unresolved.add(key); return m; }
    return String(v);
  });
}

export function removeLineContaining(content, substr) {
  return content.split("\n").filter((l) => !l.includes(substr)).join("\n");
}

// Remove a `key: { ... },` block via brace counting (best-effort, for disabled features).
export function removeBlock(content, key) {
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

export function buildValues(app) {
  const g = app.affordances.guide || {};
  const au = app.affordances.auth || {};
  const cl = app.affordances.changelog || {};
  const fb = app.affordances.feedback || {};
  const bl = app.affordances.billing || {};
  const persona = g.persona || {};
  const site = app.targets.netlify_site;
  const plans = Array.isArray(bl.plans) ? bl.plans : [];
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
    DONATE_AMOUNTS: Array.isArray(bl.amounts) && bl.amounts.length ? bl.amounts.join(",") : "5,10,25,50",
    BILLING_PLANS_JSON: JSON.stringify(
      Object.fromEntries(plans.map((p) => [p.id, { priceId: p.price_id, monthlyUsd: p.monthly_usd }])),
    ),
    BILLING_PLANS_DATA_ATTR: plans.map((p) => `${p.id}:${p.id}:${p.monthly_usd}`).join(";"),
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
  const billingSubscription = a.billing?.enabled && a.billing.mode === "subscription";
  const needsBackend = a.changelog?.enabled || a.feedback?.enabled || a.identity?.enabled || a.intake?.enabled || billingSubscription;
  const env = [];
  if (needsBackend) { env.push("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"); }
  if (a.feedback?.enabled) { env.push("OWNER_EMAIL (optional)", "ASSISTANT_ID (optional)"); }
  if (a.billing?.enabled) {
    env.push("STRIPE_SECRET_KEY");
    if (a.billing.mode === "donate" && a.billing.webhook !== false) {
      env.push("STRIPE_WEBHOOK_SECRET (optional — only needed since the donate webhook was scaffolded; safe to skip if you never wire it up)");
    }
    if (billingSubscription) {
      env.push("STRIPE_WEBHOOK_SECRET");
      for (const p of a.billing.plans || []) {
        env.push(
          `STRIPE_PRICE_ID for plan "${p.id}" — NOT a Netlify env var; baked into netlify/functions/soma-billing-checkout.ts at scaffold time (currently \`${p.price_id || "(unset — add price_id to the spec)"}\`). Change it by editing the spec and re-scaffolding, or editing the function directly.`,
        );
      }
    }
  }

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
  }
  if (env.length) {
    lines.push(`## Netlify env vars`);
    for (const e of env) lines.push(`- \`${e}\``);
    lines.push("");
  }
  if (a.billing?.enabled) {
    lines.push(`## Billing (Stripe — ${a.billing.mode})`);
    if (a.billing.mode === "donate") {
      lines.push(`- One-time / pay-what-you-want. A thin wrapper around the already-proven \`soma-stripe\` package (\`SOMA/standards/soma-stripe/\`) — the files here are that package's, templatized, not redesigned.`);
      lines.push(`- Paste \`SNIPPETS/billing-donate-embed.html\` onto any page that needs a Donate button.`);
      lines.push(`- Thank-you page scaffolded at \`public/thank-you.html\`.`);
      if (a.billing.webhook === false) {
        lines.push(`- Webhook NOT scaffolded (\`billing.webhook: false\`). Fine for v1 donate — the Checkout \`success_url\` + thank-you page is enough; there is no entitlement to unlock.`);
      } else {
        lines.push(`- \`soma-stripe-webhook.ts\` scaffolded but optional to wire — only needed if you want server-confirmed fulfillment beyond "say thanks."`);
      }
    } else {
      lines.push(`- Recurring subscriptions. **This is the B0-B2 slice of SOMA-STD-billing.md ONLY** (\`~/Projects/playmaker/SOMA-STD-billing.md\` §9) — manifest + a Checkout Session in \`mode: 'subscription'\` + a signature-verified, idempotent webhook that resolves \`public.subscriptions.status\` to \`active\` / \`past_due\` / \`canceled\`.`);
      lines.push(`- **NOT implemented — explicitly out of scope for this pass:** metering (B4), BYOK (B3), the pre-call spend gate (SOMA-STD-billing.md §4). This tells you whether a subscriber is currently entitled; it does not meter usage, accept a subscriber's own provider keys, or gate individual calls against a cap.`);
      lines.push(`- Plans (baked into \`netlify/functions/soma-billing-checkout.ts\` at scaffold time): ${(a.billing.plans || []).map((p) => `\`${p.id}\` → \`${p.price_id || "(unset)"}\` ($${p.monthly_usd}/mo)`).join(", ") || "(none — add billing.plans to the spec)"}`);
      lines.push(`- Paste \`SNIPPETS/billing-subscribe-embed.html\` onto your pricing page.`);
    }
    lines.push(`- **Manual steps remaining (Mike-gated — this scaffolder never touches a Stripe dashboard or handles a real key):**`);
    lines.push(`  1. Create/confirm the Stripe account.`);
    lines.push(`  2. ${a.billing.mode === "donate" ? "Nothing to create in Stripe for donate — Checkout line items are built on the fly from the amount the donor picks." : "Create a Product + Price per plan in the Stripe Dashboard; put each Price id into the spec's `billing.plans[].price_id` and re-scaffold (or hand-edit the checkout function's `PLANS` map)."}`);
    lines.push(`  3. Set the \`STRIPE_*\` env vars listed above in Netlify (Site settings → Environment) — test-mode key first (\`sk_test_...\`).`);
    lines.push(`  4. Add the webhook endpoint in Stripe Dashboard → Developers → Webhooks, pointing at \`/.netlify/functions/${a.billing.mode === "donate" ? "soma-stripe-webhook" : "soma-billing-webhook"}\`, and copy its signing secret into \`STRIPE_WEBHOOK_SECRET\`.`);
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

  // Billing (Stripe) — donate (thin wrapper on soma-stripe) or subscription
  // (B0-B2 slice of SOMA-STD-billing.md: manifest + Checkout + webhook-driven
  // entitlement.status; no metering/BYOK/spend-gate — see setupDoc()).
  if (a.billing?.enabled) {
    const bl = a.billing;
    if (bl.mode === "donate") {
      const fns = ["soma-stripe-checkout.ts", "lib/stripeClient.ts"];
      if (bl.webhook !== false) fns.push("soma-stripe-webhook.ts");
      for (const fn of fns) {
        const tpl = fn.replace(/\.ts$/, ".template.ts");
        const content = fill(read(T(`billing/donate/functions/${tpl}`)), values, unresolved);
        written.push(write(outDir, `netlify/functions/${fn}`, content));
      }
      written.push(
        write(
          outDir,
          "public/vendor/soma-stripe/soma-stripe-donate.js",
          fill(read(T("billing/donate/widget/soma-stripe-donate.template.js")), values, unresolved),
        ),
      );
      written.push(
        write(
          outDir,
          "public/vendor/soma-stripe/soma-stripe-donate.css",
          fill(read(T("billing/donate/widget/soma-stripe-donate.template.css")), values, unresolved),
        ),
      );
      written.push(
        write(outDir, "public/thank-you.html", fill(read(T("billing/donate/public/thank-you.template.html")), values, unresolved)),
      );
      written.push(
        write(
          outDir,
          "SNIPPETS/billing-donate-embed.html",
          fill(read(T("billing/donate/widget/embed-snippet.template.html")), values, unresolved),
        ),
      );
    } else if (bl.mode === "subscription") {
      for (const fn of ["soma-billing-checkout.ts", "soma-billing-webhook.ts", "lib/stripeClient.ts"]) {
        const tpl = fn.replace(/\.ts$/, ".template.ts");
        const content = fill(read(T(`billing/subscription/functions/${tpl}`)), values, unresolved);
        written.push(write(outDir, `netlify/functions/${fn}`, content));
      }
      written.push(
        write(
          outDir,
          "public/vendor/soma-billing/soma-billing-subscribe.js",
          fill(read(T("billing/subscription/widget/soma-billing-subscribe.template.js")), values, unresolved),
        ),
      );
      written.push(
        write(
          outDir,
          "public/vendor/soma-billing/soma-billing-subscribe.css",
          fill(read(T("billing/subscription/widget/soma-billing-subscribe.template.css")), values, unresolved),
        ),
      );
      written.push(
        write(
          outDir,
          "SNIPPETS/billing-subscribe-embed.html",
          fill(read(T("billing/subscription/widget/embed-snippet.template.html")), values, unresolved),
        ),
      );
    }
  }

  // Shared schema (any backend affordance) + billing subscription schema,
  // concatenated into one sql/schema.sql (gated independently, same file).
  const needsSharedSchema = a.changelog?.enabled || a.feedback?.enabled || a.identity?.enabled || a.intake?.enabled;
  const needsBillingSchema = a.billing?.enabled && a.billing.mode === "subscription";
  if (needsSharedSchema || needsBillingSchema) {
    const parts = [];
    if (needsSharedSchema) parts.push(fill(read(T("sql/schema.sql")), values, unresolved));
    if (needsBillingSchema) parts.push(fill(read(T("billing/subscription/sql/billing-schema.template.sql")), values, unresolved));
    written.push(write(outDir, "sql/schema.sql", parts.join("\n\n")));
  }

  // Provenance + setup
  written.push(write(outDir, "soma-app.json", JSON.stringify(doc, null, 2) + "\n"));
  const setup = setupDoc(app, written, unresolved);
  write(outDir, "SETUP.md", setup);

  return { outDir, written: [...written, "SETUP.md"], unresolved: [...unresolved] };
}
