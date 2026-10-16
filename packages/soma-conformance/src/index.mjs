import { checkC1 } from "../checks/c1.mjs";
import { checkC3 } from "../checks/c3.mjs";
import { checkC4 } from "../checks/c4.mjs";
import { checkC5 } from "../checks/c5.mjs";
import { checkC13 } from "../checks/c13.mjs";
import { notRun } from "./result.mjs";

const CHECK_IDS = [
  "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C8a", "C9",
  "C10", "C11", "C11a", "C11b", "C11c", "C12", "C12a", "C12b",
  "C13", "C14", "C15", "C16", "C17", "C18", "C18a", "C19", "C19a",
  "C20", "C21", "C22", "C23", "C24",
];

function failedCheck(id, error) {
  return {
    id,
    result: "fail",
    reasons: [`check could not complete: ${error.message}`],
  };
}

async function runBuiltCheck(id, callback) {
  try {
    return await callback();
  } catch (error) {
    return failedCheck(id, error);
  }
}

export async function runConformance({ manifest, repositoryRoot, tier }) {
  const built = new Map();
  built.set("C1", await runBuiltCheck("C1", () => checkC1(manifest)));
  built.set("C3", await runBuiltCheck("C3", () => checkC3(manifest)));
  built.set("C4", await runBuiltCheck("C4", () => checkC4(manifest, repositoryRoot)));
  built.set("C5", await runBuiltCheck("C5", () => checkC5(manifest)));

  let contractSha256 = null;
  try {
    const c13 = await checkC13(manifest, repositoryRoot);
    built.set("C13", c13.check);
    contractSha256 = c13.contractSha256;
  } catch (error) {
    built.set("C13", failedCheck("C13", error));
  }

  const checks = CHECK_IDS.map(
    (id) => built.get(id) ?? notRun(id, "not built in M1 slice 2"),
  );
  return {
    tier,
    contract_sha256: contractSha256,
    checks,
  };
}

export function formatTextReport(report) {
  return report.checks.map((check) => {
    const reasons = check.reasons
      .map((reason) => reason.replace(/\s+/g, " ").trim())
      .join("; ");
    return `${check.id} ${check.result}: ${reasons}`;
  }).join("\n");
}

export function reportPassed(report) {
  return report.checks.every((check) => check.result !== "fail");
}

export { CHECK_IDS };
