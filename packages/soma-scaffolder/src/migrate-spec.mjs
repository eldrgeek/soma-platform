function slug(value, fallback) {
  let normalized = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  if (/^[0-9]/.test(normalized)) normalized = `app-${normalized}`;
  return (normalized || fallback).slice(0, 40).replace(/-+$/g, "");
}

function repositoryName(value, appId) {
  if (!value) return { value: `unmapped/${appId}`, mapped: false };
  const normalized = String(value)
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)) {
    return { value: `unmapped/${appId}`, mapped: false };
  }
  return { value: normalized, mapped: true };
}

function origins(site, appId) {
  const host = String(site || `${appId}.netlify.app`)
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  const validHost = /^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(host);
  const safeHost = validHost ? host : `${appId}.netlify.app`;
  const productionHost = safeHost.includes(".") ? safeHost : `${safeHost}.netlify.app`;
  const stagingHost = productionHost.endsWith(".netlify.app")
    ? `preview--${productionHost}`
    : `staging.${productionHost}`;
  return {
    value: {
      production: `https://${productionHost}`,
      staging: `https://${stagingHost}`,
    },
    mapped: Boolean(site) && validHost,
  };
}

function leafPaths(value, prefix, output) {
  if (Array.isArray(value)) {
    if (value.length === 0) output.push(prefix);
    value.forEach((item, index) => leafPaths(item, `${prefix}[${index}]`, output));
    return;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) output.push(prefix);
    for (const [key, item] of entries) {
      leafPaths(item, prefix ? `${prefix}.${key}` : key, output);
    }
    return;
  }
  output.push(prefix);
}

export function migrateSpecV0(doc) {
  if (!doc?.soma_app || typeof doc.soma_app !== "object") {
    throw new TypeError("migrate-spec requires a v0 document with a root `soma_app` object");
  }

  const source = doc.soma_app;
  const appId = slug(source.slug, "migrated-app");
  const guide = source.affordances?.guide ?? {};
  const persona = guide.persona ?? {};
  const human = source.human_manager ?? source.owner ?? {};
  const repository = repositoryName(source.targets?.repo, appId);
  const appOrigins = origins(source.targets?.netlify_site, appId);
  const mapped = new Set([
    "soma_app.name",
    "soma_app.slug",
    "soma_app.description",
    "soma_app.affordances.guide.persona.name",
    "soma_app.affordances.guide.persona.assistant_id",
    "soma_app.affordances.guide.voice.enabled",
  ]);
  if (repository.mapped) mapped.add("soma_app.targets.repo");
  if (appOrigins.mapped) mapped.add("soma_app.targets.netlify_site");

  if (source.human_manager) {
    mapped.add("soma_app.human_manager.name");
  } else {
    mapped.add("soma_app.owner.name");
  }
  if (source.owner?.name) mapped.add("soma_app.owner.name");

  const workflows = (guide.walkthroughs ?? []).flatMap((walkthrough, workflowIndex) => {
    if (!Array.isArray(walkthrough.steps) || walkthrough.steps.length === 0) {
      return [];
    }
    mapped.add(`soma_app.affordances.guide.walkthroughs[${workflowIndex}].id`);
    return [
      {
        id: slug(walkthrough.id, `workflow-${workflowIndex + 1}`),
        steps: walkthrough.steps.map((step, stepIndex) => {
          const base = `soma_app.affordances.guide.walkthroughs[${workflowIndex}].steps[${stepIndex}]`;
          if (typeof step.target === "string" && step.target.length > 0) {
            mapped.add(`${base}.target`);
          }
          const textParts = [];
          for (const field of ["narration", "instruction", "label"]) {
            if (step[field]) {
              textParts.push(step[field]);
              mapped.add(`${base}.${field}`);
            }
          }
          return {
            target: step.target || `[data-soma=step-${stepIndex + 1}]`,
            text: textParts.join(" ") || "Continue",
          };
        }),
      },
    ];
  });

  const manifest = {
    schema_version: "soma.app/1",
    app: {
      id: appId,
      name: source.name,
      ...(source.description ? { description: source.description } : {}),
      tier: "prototype",
      origins: appOrigins.value,
      repository: repository.value,
    },
    hosts: {
      human: {
        id: slug(human.name, "human-host"),
        name: human.name || "Human host",
        role: "Human host",
        escalation_url: "/contact",
        expected_response: "Not yet declared",
      },
      ai: {
        id: slug(persona.assistant_id || persona.name, "ai-host"),
        name: persona.name || "AI host",
        role: "AI host",
        persona: `personas/${slug(persona.assistant_id || persona.name, "ai-host")}.md`,
      },
    },
    guide: {
      ask: {
        knowledge: [],
        page_context: false,
        web: false,
      },
      voice: {
        enabled: Boolean(guide.voice?.enabled),
      },
    },
    identity: {
      subject: "pairwise",
      admission: "open",
      profile_fields: [],
    },
    concepts: [],
    questions: [],
    actions: [],
    workflows,
    ai_visitors: {
      enabled: false,
      default_grant_minutes: 60,
      maximum_standing_risk: "reversible",
    },
    promises: [],
    data_flows: [],
    data_stores: [],
    legal: {
      operator: source.owner?.name || human.name || "Unratified operator",
      privacy: "/privacy",
      terms: "/terms",
      data_export: "/settings/export",
      app_forget: "/settings/leave",
      agent_revocation: "/settings/agents",
    },
    credits: {
      page: "/credits",
      require_artifact_byline: true,
    },
    dependencies: {
      identity_broker: {
        required: true,
        fallback: "public-pages-and-knowledge-search",
      },
      guide_cdn: {
        required: false,
        fallback: "/help",
      },
    },
  };

  const leaves = [];
  leafPaths(doc, "", leaves);
  const unmapped = leaves
    .filter((path) => !mapped.has(path))
    .sort();

  // Values the converter had to supply because v0 has no field for them. Each
  // is a guess a person must confirm before the manifest is trusted.
  const placeholders = [
    { path: "identity.subject", value: manifest.identity.subject, why: "v0 has no identity model; a legacy-global app (Legends, PlayMaker) must change this and declare legacy_auth_storage_keys" },
    { path: "identity.admission", value: manifest.identity.admission, why: "v0 has no admission rule" },
    { path: "app.tier", value: manifest.app.tier, why: "v0 has no tier" },
    { path: "hosts.human.expected_response", value: manifest.hosts.human.expected_response, why: "v0 has no response time" },
    { path: "hosts.human.escalation_url", value: manifest.hosts.human.escalation_url, why: "v0 has no escalation route" },
    { path: "hosts.ai.persona", value: manifest.hosts.ai.persona, why: "path invented from the persona name; the file is not created" },
  ];
  if (!repository.mapped) {
    placeholders.push({ path: "app.repository", value: manifest.app.repository, why: "v0 targets.repo missing or not owner/name" });
  }
  if (!appOrigins.mapped) {
    placeholders.push({ path: "app.origins", value: manifest.app.origins, why: "v0 targets.netlify_site missing" });
  }
  if (!source.owner?.name) {
    placeholders.push({ path: "legal.operator", value: manifest.legal.operator, why: "v0 has no owner.name; filled from the human host or a stand-in" });
  }

  return { manifest, unmapped, placeholders };
}
