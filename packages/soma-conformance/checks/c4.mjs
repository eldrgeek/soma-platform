import { readSourceFile } from "@soma/contracts";
import { checkResult } from "../src/result.mjs";

const MAX_SCHEMA_BYTES = 1024 * 1024;

function present(action, field, path, failures) {
  if (!Object.hasOwn(action, field)) {
    failures.push(`${path}.${field} is required`);
    return false;
  }
  return true;
}

function checkExecutor(action, path, failures) {
  const required = action.kind === "observe" || action.kind === "effect";
  if (required && !action.executor) {
    failures.push(`${path}.executor is required for ${action.kind} actions`);
    return;
  }
  if (!action.executor) return;

  if (action.kind === "view") {
    failures.push(`${path}.executor is not allowed for view actions`);
  }

  if (action.executor.kind === "rpc") {
    if (typeof action.executor.name !== "string" || action.executor.name.length === 0) {
      failures.push(`${path}.executor.name is required for an rpc executor`);
    }
  } else if (action.executor.kind === "external") {
    if (
      typeof action.executor.provider !== "string"
      || action.executor.provider.length === 0
    ) {
      failures.push(`${path}.executor.provider is required for an external executor`);
    }
    if (
      typeof action.executor.operation !== "string"
      || action.executor.operation.length === 0
    ) {
      failures.push(`${path}.executor.operation is required for an external executor`);
    }
  } else {
    failures.push(`${path}.executor.kind must be rpc or external`);
  }

  if (action.kind === "effect" && action.effect_target === "database"
      && action.executor.kind !== "rpc") {
    failures.push(`${path}.executor.kind must be rpc for a database effect`);
  }
  if (action.kind === "effect" && action.effect_target === "external"
      && action.executor.kind !== "external") {
    failures.push(`${path}.executor.kind must be external for an external effect`);
  }
}

function checkEffectFields(action, path, failures) {
  if (action.kind !== "effect") return;
  if (present(action, "risk", path, failures)
      && !["reversible", "consequential", "irreversible"].includes(action.risk)) {
    failures.push(`${path}.risk must declare a supported effect risk`);
  }
  if (present(action, "effect_target", path, failures)
      && !["database", "external"].includes(action.effect_target)) {
    failures.push(`${path}.effect_target must be database or external`);
  }
  if (action.effect_target === "external") {
    if (!Number.isInteger(action.timeout_seconds) || action.timeout_seconds < 1) {
      failures.push(
        `${path}.timeout_seconds must be a positive integer for an external effect`,
      );
    }
    if (!["provider-idempotency-key", "reconcile"].includes(action.recovery)) {
      failures.push(`${path}.recovery is required for an external effect`);
    }
  }
  if (
    action.risk === "irreversible"
    && (!Number.isInteger(action.cool_off_seconds) || action.cool_off_seconds < 1)
  ) {
    failures.push(
      `${path}.cool_off_seconds must be a positive integer for an irreversible action`,
    );
  }
}

function checkSchema(repositoryRoot, action, actionPath, field, failures) {
  if (!present(action, field, actionPath, failures)) return;
  const sourcePath = action[field];
  try {
    const source = readSourceFile(repositoryRoot, sourcePath, {
      maxBytes: MAX_SCHEMA_BYTES,
    });
    JSON.parse(source.bytes.toString("utf8"));
  } catch (error) {
    failures.push(`${actionPath}.${field} "${sourcePath}": ${error.message}`);
  }
}

export function checkC4(manifest, repositoryRoot) {
  const failures = [];
  for (const [index, action] of (manifest?.actions ?? []).entries()) {
    const path = `actions[${index}]`;
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      failures.push(`${path} must be an action object`);
      continue;
    }
    if (present(action, "kind", path, failures)
        && !["view", "observe", "effect"].includes(action.kind)) {
      failures.push(`${path}.kind must be view, observe, or effect`);
    }
    if (present(action, "required_scopes", path, failures)
        && !Array.isArray(action.required_scopes)) {
      failures.push(`${path}.required_scopes must be an array`);
    }
    if (present(action, "effects", path, failures)
        && !Array.isArray(action.effects)) {
      failures.push(`${path}.effects must be an array`);
    }
    checkExecutor(action, path, failures);
    checkEffectFields(action, path, failures);
    checkSchema(repositoryRoot, action, path, "input_schema", failures);
    checkSchema(repositoryRoot, action, path, "output_schema", failures);
  }

  return checkResult("C4", failures, [
    "action declarations and referenced JSON schemas pass static checks",
    "applied RPC executor check not_run: local mode has no network or database",
  ]);
}
