import { SOMA_IDENTITY_ORIGIN } from "./constants.mjs";

function publicKnowledgePath(sourcePath) {
  return `/${sourcePath}`;
}

export function buildLlmsTxt(manifest, resolvedActions) {
  const lines = [];
  lines.push(`# ${manifest.app.name}`);
  lines.push("");
  lines.push(`App id: ${manifest.app.id}`);
  lines.push(`Manifest schema: ${manifest.schema_version}`);
  lines.push("");
  lines.push("## Discovery");
  lines.push("- /.well-known/soma-app.json — machine-readable app and action contract");
  lines.push("- /api/soma/v1/openapi.json — OpenAPI 3.1 for outside AIs");
  lines.push("- /llms.txt — this file");
  lines.push("");
  lines.push("## Hosts");
  lines.push(
    `- Human: ${manifest.hosts.human.name} (${manifest.hosts.human.role}), escalation ${manifest.hosts.human.escalation_url}, expected response ${manifest.hosts.human.expected_response}`,
  );
  lines.push(
    `- AI: ${manifest.hosts.ai.name} (${manifest.hosts.ai.role})`,
  );
  lines.push("");
  lines.push("## Public knowledge");
  const knowledge = manifest.guide?.ask?.knowledge ?? [];
  if (knowledge.length === 0) {
    lines.push("- (none declared)");
  } else {
    for (const path of [...knowledge].sort()) {
      lines.push(`- ${publicKnowledgePath(path)}`);
    }
  }
  lines.push("");
  lines.push("## Remote actions");
  if (resolvedActions.length === 0) {
    lines.push("- (none declared with the remote surface)");
  } else {
    for (const { action } of resolvedActions) {
      const risk = action.kind === "effect" ? ` risk=${action.risk}` : "";
      const scopes = action.required_scopes.join(", ");
      lines.push(
        `- ${action.id}@${action.version} kind=${action.kind}${risk} scopes=${scopes} role=${action.required_role}`,
      );
    }
  }
  lines.push("");
  lines.push("## Acting as an outside AI");
  lines.push(
    "Fetch-only assistants should read this file and the discovery JSON, then tell the person how to connect an AI that can act.",
  );
  lines.push(
    `Tool-capable assistants pair through the identity broker at ${SOMA_IDENTITY_ORIGIN} (device authorization), receive per-app grants, then call /api/soma/v1/actions/{action_id}/prepare and /execute with bearer tokens.`,
  );
  lines.push(
    "Human-only approval and consent routes are not listed here; an outside AI must never be invited to approve its own request.",
  );
  lines.push("");
  return lines.join("\n");
}
