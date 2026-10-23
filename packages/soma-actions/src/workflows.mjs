/**
 * @typedef {import('./types.mjs').WorkflowSpec} WorkflowSpec
 */

/**
 * @param {WorkflowSpec} workflow
 * @returns {string[]}
 */
export function workflowCommands(workflow) {
  const steps = [...(workflow.personReaches ?? []), ...workflow.steps];
  return [...new Set(steps.flatMap((step) => (typeof step.command === "string" ? [step.command] : [...step.command])))];
}

/**
 * @param {WorkflowSpec} workflow
 * @param {readonly string[]} invoked
 * @returns {string[]}
 */
export function compareInvocations(workflow, invoked) {
  const problems = [];
  const allowed = new Set(workflow.steps.flatMap((step) => (typeof step.command === "string" ? [step.command] : [...step.command])));
  for (const command of invoked) {
    if (!allowed.has(command)) problems.push(`invoked ${command}, which workflow ${workflow.id} does not declare`);
  }
  for (const step of workflow.steps) {
    const options = typeof step.command === "string" ? [step.command] : [...step.command];
    if (!options.some((command) => invoked.includes(command))) {
      problems.push(`declared step ${options.join(" | ")} was never invoked`);
    }
  }
  return problems;
}

/**
 * @param {readonly WorkflowSpec[]} workflows
 * @param {string} id
 * @returns {WorkflowSpec}
 */
export function findWorkflow(workflows, id) {
  const workflow = workflows.find((entry) => entry.id === id);
  if (!workflow) throw new Error(`Unknown workflow: ${id}`);
  return workflow;
}
