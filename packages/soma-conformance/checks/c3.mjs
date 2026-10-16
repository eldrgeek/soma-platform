import { checkResult } from "../src/result.mjs";

function hasValue(value) {
  return typeof value === "string" && value.length > 0;
}

function checkNamespace(item, path, appId, failures) {
  if (!hasValue(item?.id)) {
    failures.push(`${path}.id is required`);
    return;
  }
  const ownPrefix = hasValue(appId) ? `${appId}:` : null;
  if (!item.id.startsWith("soma:") && !(ownPrefix && item.id.startsWith(ownPrefix))) {
    failures.push(
      `${path}.id "${item.id}" must use the soma: namespace or app namespace ${ownPrefix ?? "<missing app.id>"}`
    );
  }
}

export function checkC3(manifest) {
  const failures = [];
  const appId = manifest?.app?.id;

  for (const [index, concept] of (manifest?.concepts ?? []).entries()) {
    const path = `concepts[${index}]`;
    checkNamespace(concept, path, appId, failures);
    if (!hasValue(concept?.version)) failures.push(`${path}.version is required`);
  }

  for (const [index, question] of (manifest?.questions ?? []).entries()) {
    const path = `questions[${index}]`;
    checkNamespace(question, path, appId, failures);
    if (!hasValue(question?.schema_version)) {
      failures.push(`${path}.schema_version is required`);
    }
  }

  return checkResult("C3", failures, [
    "concept and question IDs, versions, and namespaces pass static checks",
    "platform-registry hash comparison not_run: no registry yet",
  ]);
}
