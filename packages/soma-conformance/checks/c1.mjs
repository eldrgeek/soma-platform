import { formatValidationErrors, validateManifest } from "@soma/contracts";
import { checkResult } from "../src/result.mjs";

export function checkC1(manifest) {
  const validation = validateManifest(manifest);
  return checkResult(
    "C1",
    formatValidationErrors(validation.errors).map(
      (error) => `manifest field ${error}`,
    ),
    ["manifest passes soma.app/1 JSON Schema validation"],
  );
}
