import { checkResult } from "../src/result.mjs";

export function checkC5(manifest) {
  const failures = [];

  if (!Array.isArray(manifest?.actions)) {
    failures.push("manifest.actions must be an array");
    return checkResult("C5", failures);
  }

  for (const [index, action] of manifest.actions.entries()) {
    const path = `actions[${index}]`;
    const hasUiBinding = Array.isArray(action?.surfaces)
      && action.surfaces.includes("ui");
    const hasException = action?.ui_exception !== undefined;

    if (action?.kind === "effect" && !hasUiBinding && !hasException) {
      failures.push(
        `${path}.surfaces needs a ui binding or ${path}.ui_exception with a reason`,
      );
    }
    if (action?.kind === "effect" && hasException) {
      if (
        typeof action.ui_exception?.reason !== "string"
        || action.ui_exception.reason.length === 0
      ) {
        failures.push(`${path}.ui_exception.reason is required`);
      }
      if (action.risk !== "reversible") {
        failures.push(
          `${path}.ui_exception is refused for ${action.risk ?? "undeclared"} risk; only reversible actions may declare one`,
        );
      }
    }
  }

  return checkResult("C5", failures, [
    "effect actions have UI bindings or permitted reversible exceptions",
  ]);
}
