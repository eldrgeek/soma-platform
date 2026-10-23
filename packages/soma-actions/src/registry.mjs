import { validateCommandArgs as validateArgs } from "./validation.mjs";

/**
 * @typedef {import('./types.mjs').Actor} Actor
 * @typedef {import('./types.mjs').CommandArgs} CommandArgs
 * @typedef {import('./types.mjs').CommandAuditRecord} CommandAuditRecord
 * @typedef {import('./types.mjs').CommandImpl} CommandImpl
 * @typedef {import('./types.mjs').CommandSpec} CommandSpec
 * @typedef {import('./types.mjs').CommandStateSnapshot} CommandStateSnapshot
 * @typedef {import('./types.mjs').InvokeResult} InvokeResult
 */

const AUDIT_LIMIT = 500;
const ARG_TRUNCATE_AT = 200;
const DEFAULT_ACTOR = { kind: "ai", via: "in-page" };

function randomId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function asMessage(cause) {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === "string") return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return "Command failed.";
  }
}

function normalizeActor(actor) {
  if (!actor) return DEFAULT_ACTOR;
  return {
    kind: actor.kind === "person" ? "person" : "ai",
    via: actor.via === "ui" ? "ui" : "in-page",
    ...(typeof actor.name === "string" && actor.name.trim() ? { name: actor.name.trim() } : {}),
  };
}

function truncateString(input) {
  if (input.length <= ARG_TRUNCATE_AT) return input;
  return `${input.slice(0, ARG_TRUNCATE_AT)}…`;
}

function sanitizeForAudit(value) {
  if (typeof value === "string") return truncateString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeForAudit(item));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = sanitizeForAudit(nested);
  }
  return out;
}

function isPromiseLike(value) {
  return !!value
    && (typeof value === "object" || typeof value === "function")
    && typeof value.then === "function";
}

/**
 * @param {readonly CommandSpec[]} catalogue
 * @param {{
 *   afterSchemaValidate?: (spec: CommandSpec, args: CommandArgs) => string | null;
 *   dispatchAuditEvent?: (record: CommandAuditRecord) => void;
 * }} [options]
 */
export function createCommandRegistry(catalogue, options = {}) {
  const { afterSchemaValidate, dispatchAuditEvent } = options;
  const instanceId = randomId("registry");
  const specById = new Map(catalogue.map((spec) => [spec.id, spec]));
  const providers = new Map();
  const stateProviders = new Map();
  const records = [];
  let nextProviderId = 1;
  let nextStateProviderId = 1;

  const readState = () => {
    const active = [...stateProviders.values()];
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const snapshot = active[index]();
      if (snapshot) return snapshot;
    }
    return null;
  };

  const appendAudit = (command, args, actor, status) => {
    const state = readState();
    const record = {
      auditId: status.auditId,
      at: new Date().toISOString(),
      command,
      args: sanitizeForAudit(args),
      actor,
      userId: state?.userId ?? null,
      playId: state?.playId ?? null,
      ok: status.ok,
      ...(status.error ? { error: status.error } : {}),
      ...(status.unavailable ? { unavailable: status.unavailable } : {}),
    };
    records.push(record);
    if (records.length > AUDIT_LIMIT) records.splice(0, records.length - AUDIT_LIMIT);
    if (dispatchAuditEvent) dispatchAuditEvent(record);
    else if (typeof globalThis.window !== "undefined" && typeof globalThis.window.dispatchEvent === "function") {
      globalThis.window.dispatchEvent(new CustomEvent("soma:command", { detail: record }));
    }
    return record;
  };

  const resolveImpl = (id) => {
    const ordered = [...providers.values()];
    for (let at = ordered.length - 1; at >= 0; at -= 1) {
      const impl = ordered[at][id];
      if (impl) return impl;
    }
    return null;
  };

  const fail = (command, args, actor, failOptions) => {
    const auditId = randomId("audit");
    appendAudit(command, args, actor, {
      ok: false,
      auditId,
      ...(failOptions.error ? { error: failOptions.error } : {}),
      ...(failOptions.unavailable ? { unavailable: failOptions.unavailable } : {}),
    });
    return {
      ok: false,
      command,
      auditId,
      ...(failOptions.error ? { error: failOptions.error } : {}),
      ...(failOptions.unavailable ? { unavailable: failOptions.unavailable } : {}),
    };
  };

  const succeed = (command, args, actor, result) => {
    const auditId = randomId("audit");
    appendAudit(command, args, actor, { ok: true, auditId });
    return {
      ok: true,
      command,
      auditId,
      ...(result === undefined ? {} : { result }),
    };
  };

  return {
    instanceId,
    provide(impls) {
      const id = nextProviderId;
      nextProviderId += 1;
      providers.set(id, impls);
      return () => {
        providers.delete(id);
      };
    },
    provideState(provider) {
      const id = nextStateProviderId;
      nextStateProviderId += 1;
      stateProviders.set(id, provider);
      return () => {
        stateProviders.delete(id);
      };
    },
    invoke(id, args = {}, actor) {
      const normalizedActor = normalizeActor(actor);
      const spec = specById.get(id);
      if (!spec) return fail(id, args, normalizedActor, { error: `Unknown command: ${id}.` });
      const invalid = validateArgs(spec, args, afterSchemaValidate);
      if (invalid) return fail(id, args, normalizedActor, { error: invalid });
      const impl = resolveImpl(id);
      if (!impl) {
        return fail(id, args, normalizedActor, { unavailable: `Command "${id}" is unavailable on this page.` });
      }
      try {
        const unavailable = impl.unavailable?.(args) ?? null;
        if (unavailable) return fail(id, args, normalizedActor, { unavailable });
        const output = impl.run(args);
        if (!isPromiseLike(output)) return succeed(id, args, normalizedActor, output);
        return output
          .then((result) => succeed(id, args, normalizedActor, result))
          .catch((cause) => fail(id, args, normalizedActor, { error: asMessage(cause) }));
      } catch (cause) {
        return fail(id, args, normalizedActor, { error: asMessage(cause) });
      }
    },
    list() {
      return [...catalogue];
    },
    describe(id) {
      return specById.get(id) ?? null;
    },
    audit() {
      return records.slice();
    },
    clearAudit() {
      records.length = 0;
    },
    withdrawUnavailableAudit(auditId) {
      const index = records.findIndex((record) => (
        record.auditId === auditId && Boolean(record.unavailable)
      ));
      if (index < 0) return false;
      records.splice(index, 1);
      return true;
    },
    state() {
      return readState();
    },
  };
}

export { AUDIT_LIMIT, ARG_TRUNCATE_AT };
