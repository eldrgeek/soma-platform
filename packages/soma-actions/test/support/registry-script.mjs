/**
 * Replay declarative registry scripts (see tools/registry-scripts.mjs).
 */

/**
 * @param {import('../../tools/registry-scripts.mjs').ImplSpec} spec
 */
export function buildImplFromSpec(spec) {
  switch (spec.kind) {
    case "throw":
      return {
        run: () => {
          throw new Error(spec.message ?? "boom");
        },
      };
    case "return":
      return {
        run: () => spec.value,
      };
    case "async-resolve":
      return {
        run: async () => spec.value,
      };
    case "async-reject-error":
      return {
        run: async () => {
          throw new Error(spec.message ?? "async fail");
        },
      };
    case "async-reject-value":
      return {
        run: async () => {
          // eslint-disable-next-line no-throw-literal
          throw spec.value;
        },
      };
    case "unavailable":
      return {
        unavailable: () => spec.reason ?? "unavailable",
        run: () => {
          throw new Error("run must not be called when unavailable returns a reason");
        },
      };
    case "undefined":
      return {
        run: () => undefined,
      };
    default:
      throw new Error(`Unknown impl kind: ${spec.kind}`);
  }
}

function materializeArgs(args) {
  if (!args || typeof args !== "object") return args ?? {};
  const out = { ...args };
  const body = out.body;
  if (body && typeof body === "object" && !Array.isArray(body) && typeof body.repeat === "number") {
    const ch = typeof body.repeatChar === "string" && body.repeatChar.length > 0 ? body.repeatChar : "x";
    out.body = ch.repeat(body.repeat);
  }
  return out;
}

function isPromiseLike(value) {
  return !!value
    && (typeof value === "object" || typeof value === "function")
    && typeof value.then === "function";
}

/**
 * @param {{
 *   provide: (impls: Record<string, unknown>) => unknown;
 *   invoke: (id: string, args?: Record<string, unknown>) => unknown;
 *   withdrawUnavailableAudit: (auditId: string) => boolean;
 * }} registry
 * @param {import('../../tools/registry-scripts.mjs').RegistryScriptStep[]} script
 */
export async function runRegistryScript(registry, script) {
  let lastInvoke;
  /** @type {unknown[]} */
  const stepResults = [];
  /** @type {Record<number, { auditId?: string }>} */
  const invokeByStep = [];

  for (let stepIndex = 0; stepIndex < script.length; stepIndex += 1) {
    const step = script[stepIndex];
    if (step.op === "provide") {
      const impls = {};
      for (const [commandId, spec] of Object.entries(step.impls)) {
        impls[commandId] = buildImplFromSpec(spec);
      }
      registry.provide(impls);
      stepResults.push(null);
      continue;
    }
    if (step.op === "invoke") {
      const args = materializeArgs(step.args);
      const repeat = typeof step.repeat === "number" ? step.repeat : 1;
      let result;
      for (let n = 0; n < repeat; n += 1) {
        result = registry.invoke(step.command, args);
        if (isPromiseLike(result)) result = await result;
        lastInvoke = result;
      }
      invokeByStep[stepIndex] = lastInvoke;
      stepResults.push(lastInvoke);
      continue;
    }
    if (step.op === "withdraw") {
      const from = invokeByStep[step.auditIdFromStep];
      if (!from || typeof from !== "object" || typeof from.auditId !== "string") {
        throw new Error(`withdraw step ${stepIndex}: no auditId on invoke step ${step.auditIdFromStep}`);
      }
      const ok = registry.withdrawUnavailableAudit(from.auditId);
      stepResults.push(ok);
      continue;
    }
    throw new Error(`Unknown script op: ${step.op}`);
  }

  return {
    invoke: lastInvoke,
    stepResults,
  };
}
