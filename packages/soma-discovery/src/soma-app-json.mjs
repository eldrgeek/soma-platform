import { DISCOVERY_SCHEMA_VERSION } from "./constants.mjs";
import { compileActionRecord } from "./actions.mjs";

function publicKnowledgePath(sourcePath) {
  return `/${sourcePath}`;
}

export function buildSomaAppJsonDocument(manifest, resolvedActions) {
  const knowledge = [...(manifest.guide?.ask?.knowledge ?? [])]
    .map(publicKnowledgePath)
    .sort();

  const publicRoutes = [
    "/.well-known/soma-app.json",
    "/llms.txt",
    "/api/soma/v1/openapi.json",
    "/api/soma/v1/ask",
    "/api/soma/v1/contact",
    "/api/soma/v1/actions",
    "/api/soma/v1/status",
    ...resolvedActions.flatMap(({ action }) => [
      `/api/soma/v1/actions/${action.id}/prepare`,
      `/api/soma/v1/actions/${action.id}/execute`,
    ]),
    "/api/soma/v1/approvals/{approval_id}",
    "/api/soma/v1/receipts/{receipt_id}",
  ].sort();

  return {
    schema_version: DISCOVERY_SCHEMA_VERSION,
    manifest_schema_version: manifest.schema_version,
    app: {
      id: manifest.app.id,
      name: manifest.app.name,
      tier: manifest.app.tier,
      origins: manifest.app.origins,
    },
    hosts: manifest.hosts,
    ai_visitors: manifest.ai_visitors,
    legal: {
      privacy: manifest.legal.privacy,
      terms: manifest.legal.terms,
      data_export: manifest.legal.data_export,
      app_forget: manifest.legal.app_forget,
      agent_revocation: manifest.legal.agent_revocation,
    },
    discovery: {
      soma_app: "/.well-known/soma-app.json",
      llms_txt: "/llms.txt",
      openapi: "/api/soma/v1/openapi.json",
      knowledge,
    },
    identity: {
      pairing: "not_available",
    },
    api: {
      base_path: "/api/soma/v1",
      public_routes: publicRoutes,
    },
    actions: resolvedActions.map(compileActionRecord),
  };
}
