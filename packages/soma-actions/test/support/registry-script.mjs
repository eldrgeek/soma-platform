/**
 * Replay declarative registry scripts (see tools/registry-scripts.mjs).
 */

/**
 * @param {() => void} run
 * @param {{ count: number }} runCallCounter
 */
function trackRun(run, runCallCounter) {
  return (...args) => {
    runCallCounter.count += 1;
    return run(...args);
  };
}

/**
 * @param {import('../../tools/registry-scripts.mjs').ImplSpec} spec
 * @param {{ count: number }} runCallCounter
 */
export function buildImplFromSpec(spec, runCallCounter) {
  switch (spec.kind) {
    case "throw":
      return {
        run: trackRun(() => {
          throw new Error(spec.message ?? "boom");
        }, runCallCounter),
      };
    case "return":
      return {
        run: trackRun(() => spec.value, runCallCounter),
      };
    case "async-resolve":
      return {
        run: trackRun(async () => spec.value, runCallCounter),
      };
    case "async-reject-error":
      return {
        run: trackRun(async () => {
          throw new Error(spec.message ?? "async fail");
        }, runCallCounter),
      };
    case "async-reject-value":
      return {
        run: trackRun(async () => {
          // eslint-disable-next-line no-throw-literal
          throw spec.value;
        }, runCallCounter),
      };
    case "unavailable":
      return {
        unavailable: () => spec.reason ?? "unavailable",
        run: trackRun(() => undefined, runCallCounter),
      };
    case "undefined":
      return {
        run: trackRun(() => undefined, runCallCounter),
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
  const runCallCounter = { count: 0 };

  for (let stepIndex = 0; stepIndex < script.length; stepIndex += 1) {
    const step = script[stepIndex];
    if (step.op === "provide") {
      const impls = {};
      for (const [commandId, spec] of Object.entries(step.impls)) {
        impls[commandId] = buildImplFromSpec(spec, runCallCounter);
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
    runCallCount: runCallCounter.count,
  };
}
