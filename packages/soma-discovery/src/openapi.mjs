import {
  APPROVAL_REQUIRED_SCHEMA,
  COMMON_ERROR_SCHEMA,
  NOT_LIVE_ROUTE_DESCRIPTION,
  RATE_LIMIT_DESCRIPTION,
} from "./constants.mjs";
import { embedSchemaForOpenApi } from "./schema-ref.mjs";

function schemaNameForAction(actionId, suffix) {
  return `${actionId.replace(/[^A-Za-z0-9]+/g, "_")}_${suffix}`;
}

function jsonErrorResponse(description) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/SomaErrorResponse" },
      },
    },
  };
}

function bearerSecurity() {
  return [{ somaAgentBearer: [] }];
}

function markOperationsNotLive(pathItem) {
  for (const [key, operation] of Object.entries(pathItem)) {
    if (key === "parameters" || !operation || typeof operation !== "object") {
      continue;
    }
    operation["x-soma-status"] = "not_live";
  }
  return pathItem;
}

export function buildOpenApiDocument(manifest, resolvedActions) {
  const schemas = {
    SomaErrorResponse: COMMON_ERROR_SCHEMA,
    SomaApprovalRequired: APPROVAL_REQUIRED_SCHEMA,
  };

  for (const { action, inputSchema, outputSchema } of resolvedActions) {
    const inputName = schemaNameForAction(action.id, "Input");
    const outputName = schemaNameForAction(action.id, "Output");
    schemas[inputName] = embedSchemaForOpenApi(inputSchema, inputName);
    schemas[outputName] = embedSchemaForOpenApi(outputSchema, outputName);
  }

  const paths = {
    "/api/soma/v1/ask": markOperationsNotLive({
      post: {
        operationId: "ask",
        summary: "Ask the app host from declared knowledge",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["question"],
                additionalProperties: false,
                properties: {
                  question: { type: "string", maxLength: 2000 },
                  route: { type: "string" },
                  page_context: { type: "string", maxLength: 4000 },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Grounded or degraded answer",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          429: jsonErrorResponse("Admission limit"),
        },
      },
    }),
    "/api/soma/v1/contact": markOperationsNotLive({
      post: {
        operationId: "contact",
        summary: "Contact the human host",
        security: [],
        responses: {
          200: { description: "Contact accepted" },
          429: jsonErrorResponse("Admission limit"),
        },
      },
    }),
    "/api/soma/v1/actions": markOperationsNotLive({
      get: {
        operationId: "listActions",
        summary: "List remote actions visible to the caller",
        security: bearerSecurity(),
        responses: {
          200: { description: "Action catalogue" },
          401: jsonErrorResponse("Missing or invalid authentication"),
        },
      },
    }),
    "/api/soma/v1/status": markOperationsNotLive({
      get: {
        operationId: "status",
        summary: "Release and dependency status",
        security: [],
        responses: {
          200: { description: "Status snapshot" },
        },
      },
    }),
    "/api/soma/v1/approvals/{approval_id}": markOperationsNotLive({
      get: {
        operationId: "getApproval",
        summary: "Poll an approval by id",
        security: bearerSecurity(),
        parameters: [
          {
            name: "approval_id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Approval state" },
          401: jsonErrorResponse("Missing or invalid authentication"),
          404: jsonErrorResponse("Not found"),
        },
      },
    }),
    "/api/soma/v1/receipts/{receipt_id}": markOperationsNotLive({
      get: {
        operationId: "getReceipt",
        summary: "Fetch a receipt by id",
        security: bearerSecurity(),
        parameters: [
          {
            name: "receipt_id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Receipt" },
          401: jsonErrorResponse("Missing or invalid authentication"),
          404: jsonErrorResponse("Not found"),
        },
      },
    }),
  };

  for (const { action } of resolvedActions) {
    const inputRef = `#/components/schemas/${schemaNameForAction(action.id, "Input")}`;
    const outputRef = `#/components/schemas/${schemaNameForAction(action.id, "Output")}`;
    const preparePath = `/api/soma/v1/actions/${action.id}/prepare`;
    const executePath = `/api/soma/v1/actions/${action.id}/execute`;

    paths[preparePath] = markOperationsNotLive({
      post: {
        operationId: `prepare_${action.id.replace(/[^A-Za-z0-9]+/g, "_")}`,
        summary: `Prepare ${action.id}`,
        security: bearerSecurity(),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: inputRef },
            },
          },
        },
        responses: {
          200: {
            description: "Prepared preview or immediate result",
            content: {
              "application/json": {
                schema: { $ref: outputRef },
              },
            },
          },
          202: {
            description: "Approval required before execution",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SomaApprovalRequired" },
              },
            },
          },
          401: jsonErrorResponse("Missing or invalid authentication"),
          403: jsonErrorResponse("Authenticated but unauthorized"),
        },
        "x-soma-action-id": action.id,
        "x-soma-action-version": action.version,
        "x-soma-action-kind": action.kind,
      },
    });

    const executeOperation = {
      operationId: `execute_${action.id.replace(/[^A-Za-z0-9]+/g, "_")}`,
      summary: `Execute ${action.id}`,
      security: bearerSecurity(),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: inputRef },
          },
        },
      },
      responses: {
        200: {
          description: "Execution result",
          content: {
            "application/json": {
              schema: { $ref: outputRef },
            },
          },
        },
        401: jsonErrorResponse("Missing or invalid authentication"),
        403: jsonErrorResponse("Authenticated but unauthorized"),
        409: jsonErrorResponse("State conflict"),
      },
      "x-soma-action-id": action.id,
      "x-soma-action-version": action.version,
      "x-soma-action-kind": action.kind,
    };

    if (action.kind === "effect") {
      executeOperation.parameters = [
        {
          name: "Idempotency-Key",
          in: "header",
          required: true,
          schema: { type: "string" },
          description: "Required for every effect execution (kit plan §2.6).",
        },
      ];
      executeOperation["x-soma-requires-idempotency-key"] = true;
    }

    paths[executePath] = markOperationsNotLive({ post: executeOperation });
  }

  return {
    openapi: "3.1.0",
    info: {
      title: `${manifest.app.name} SOMA API`,
      version: "1.0.0",
      description: [
        "Routes intended for outside AIs at this app origin.",
        NOT_LIVE_ROUTE_DESCRIPTION,
        RATE_LIMIT_DESCRIPTION,
        "Every response carries X-Request-Id.",
        "Errors use the SomaErrorResponse schema; responses never include stack traces, SQL, provider payloads, or credentials.",
      ].join("\n\n"),
    },
    servers: [{ url: manifest.app.origins.production }],
    paths,
    components: {
      securitySchemes: {
        somaAgentBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Broker-issued app-audience access token (kit plan §2.7). Public discovery requires no authentication.",
        },
      },
      schemas,
    },
  };
}
