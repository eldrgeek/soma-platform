// Spec loading + zero-dep structural validation aligned to schema/soma-app.schema.json.
// (The JSON Schema is the canonical contract for ajv-based tooling; this is a
// dependency-free check good enough to gate scaffolding.)

import { readFileSync } from "node:fs";

export function loadSpec(path) {
  const raw = readFileSync(path, "utf8");
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Spec is not valid JSON: ${e.message}`);
  }
  return doc;
}

const SKILLS = ["low", "medium", "high"];
const DELIVERIES = ["embedded", "vendored", "iframe"];
const STATUSES = ["draft", "approved", "building", "preview", "live"];

// Returns an array of human-readable error strings ([] = valid).
export function validate(doc) {
  const errs = [];
  const req = (cond, msg) => { if (!cond) errs.push(msg); };

  const app = doc && doc.soma_app;
  if (!app || typeof app !== "object") {
    return ["missing top-level `soma_app` object"];
  }

  req(typeof app.name === "string" && app.name.length, "soma_app.name is required");
  req(typeof app.slug === "string" && /^[a-z0-9][a-z0-9-]*$/.test(app.slug || ""),
      "soma_app.slug is required and must be lowercase kebab (^[a-z0-9][a-z0-9-]*$)");
  if (app.requester_skill !== undefined)
    req(SKILLS.includes(app.requester_skill), `requester_skill must be one of ${SKILLS.join(", ")}`);

  const t = app.targets;
  req(t && typeof t === "object", "soma_app.targets is required");
  if (t) {
    req(DELIVERIES.includes(t.delivery), `targets.delivery must be one of ${DELIVERIES.join(", ")}`);
    req(t.supabase && typeof t.supabase === "object", "targets.supabase is required");
  }

  const aff = app.affordances;
  req(aff && typeof aff === "object", "soma_app.affordances is required");
  if (aff) {
    for (const [name, a] of Object.entries(aff)) {
      if (a && typeof a === "object")
        req(typeof a.enabled === "boolean", `affordances.${name}.enabled (boolean) is required`);
    }
    const g = aff.guide;
    if (g && g.enabled) {
      req(g.persona && typeof g.persona === "object", "guide.persona is required when guide is enabled");
      if (g.persona) {
        req(typeof g.persona.name === "string" && g.persona.name, "guide.persona.name is required");
        req(typeof g.persona.assistant_id === "string" && g.persona.assistant_id, "guide.persona.assistant_id is required");
      }
    }
    const au = aff.auth;
    if (au && au.enabled)
      req(Array.isArray(au.admin_emails) && au.admin_emails.length, "auth.admin_emails is required when auth is enabled");
    const cl = aff.changelog;
    if (cl && cl.enabled)
      req(typeof cl.publish_agent_email === "string" && cl.publish_agent_email, "changelog.publish_agent_email is required when changelog is enabled");
  }

  const m = app.meta;
  req(m && typeof m === "object", "soma_app.meta is required");
  if (m) {
    req(typeof m.spec_version === "string" && m.spec_version, "meta.spec_version is required");
    req(STATUSES.includes(m.status), `meta.status must be one of ${STATUSES.join(", ")}`);
  }

  return errs;
}
