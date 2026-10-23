export const DISCOVERY_SCHEMA_VERSION = "soma.discovery/1";

export const DISCOVERY_FILE_PATHS = {
  wellKnown: "public/.well-known/soma-app.json",
  llmsTxt: "public/llms.txt",
  openApi: "public/api/soma/v1/openapi.json",
};

/** Route path fragments that must never appear in AI discovery (kit plan §2.7). */
export const FORBIDDEN_ROUTE_MARKERS = [
  "approve",
  "approval/decision",
  "consent",
  "/decision",
  "/api/soma/v1/me/concepts",
  "/api/soma/v1/me/answers",
  "/api/soma/v1/me/export",
  "/api/soma/v1/me/forget",
  "/api/soma/v1/me/grants",
  "/api/soma/v1/auth/",
];

export const RATE_LIMIT_DESCRIPTION = [
  "Rate limits use platform-derived client-address metadata, app identity where available,",
  "and account or grant identity after authentication.",
  "They do not trust a caller-supplied forwarding header.",
  "Ask, contact, device pairing, approval polling, and unauthenticated discovery have separate quotas.",
  "A 429 response, and a retryable 409 or 503 response, includes Retry-After.",
].join(" ");

export const NOT_LIVE_ROUTE_DESCRIPTION =
  "Contract routes under /api/soma/v1 are documented for future outside-AI access; this app does not serve them yet (x-soma-status: not_live).";

export const APPROVAL_REQUIRED_SCHEMA = {
  type: "object",
  required: ["status"],
  additionalProperties: false,
  properties: {
    status: { const: "approval_required" },
    approval_id: { type: "string" },
    approval_url: {
      type: "string",
      description:
        "Human-facing page URL for the account holder to approve or deny; outside AIs must not treat it as an API route.",
    },
  },
};

export const COMMON_ERROR_SCHEMA = {
  type: "object",
  required: ["error"],
  additionalProperties: false,
  properties: {
    error: {
      type: "object",
      required: ["code", "message", "retryable", "request_id"],
      additionalProperties: false,
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        retryable: { type: "boolean" },
        request_id: { type: "string" },
        receipt_id: { type: "string" },
        approval_url: {
          type: "string",
          description:
            "Human-facing page URL for the account holder to approve or deny; outside AIs must not treat it as an API route.",
        },
      },
    },
  },
};
