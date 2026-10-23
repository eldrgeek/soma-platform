/**
 * Declarative registry replay scripts — shared by freeze-playmaker and fixture tests.
 * Each case is replayed verbatim; missing replay coverage fails the test harness.
 */

/** @typedef {{ op: 'provide', impls: Record<string, ImplSpec> }} ProvideStep */
/** @typedef {{ op: 'invoke', command: string, args?: Record<string, unknown>, repeat?: number }} InvokeStep */
/** @typedef {{ op: 'withdraw', auditIdFromStep: number }} WithdrawStep */
/** @typedef {ProvideStep | InvokeStep | WithdrawStep} RegistryScriptStep */

/**
 * @typedef {{
 *   kind: 'throw';
 *   message?: string;
 * } | {
 *   kind: 'return';
 *   value?: unknown;
 * } | {
 *   kind: 'async-resolve';
 *   value?: unknown;
 * } | {
 *   kind: 'async-reject-error';
 *   message?: string;
 * } | {
 *   kind: 'async-reject-value';
 *   value: unknown;
 * } | {
 *   kind: 'unavailable';
 *   reason?: string;
 * } | {
 *   kind: 'undefined';
 * }} ImplSpec
 */

/** @type {{ id: string, script: RegistryScriptStep[] }[]} */
export const REGISTRY_CASE_SCRIPTS = [
  {
    id: "unknown-command",
    script: [{ op: "invoke", command: "no.such.command", args: {} }],
  },
  {
    id: "invalid-args",
    script: [{ op: "invoke", command: "play.rename", args: { title: 42 } }],
  },
  {
    id: "no-impl",
    script: [{ op: "invoke", command: "play.rename", args: { title: "Hi" } }],
  },
  {
    id: "impl-unavailable",
    script: [
      {
        op: "provide",
        impls: {
          "play.newScene": { kind: "unavailable", reason: "Scene editor is closed." },
        },
      },
      { op: "invoke", command: "play.newScene", args: {} },
    ],
  },
  {
    id: "impl-throws",
    script: [
      {
        op: "provide",
        impls: {
          "play.newScene": { kind: "throw", message: "boom" },
        },
      },
      { op: "invoke", command: "play.newScene", args: {} },
    ],
  },
  {
    id: "successful-impl",
    script: [
      {
        op: "provide",
        impls: {
          "edit.undo": { kind: "return", value: { done: true } },
        },
      },
      { op: "invoke", command: "edit.undo", args: {} },
    ],
  },
  {
    id: "async-resolve",
    script: [
      {
        op: "provide",
        impls: {
          "edit.redo": { kind: "async-resolve", value: { redone: true } },
        },
      },
      { op: "invoke", command: "edit.redo", args: {} },
    ],
  },
  {
    id: "async-reject-error",
    script: [
      {
        op: "provide",
        impls: {
          "import.goToStart": { kind: "async-reject-error", message: "async boom" },
        },
      },
      { op: "invoke", command: "import.goToStart", args: {} },
    ],
  },
  {
    id: "async-reject-non-error",
    script: [
      {
        op: "provide",
        impls: {
          "file.exportFountain": { kind: "async-reject-value", value: { code: "E_BUSY" } },
        },
      },
      { op: "invoke", command: "file.exportFountain", args: {} },
    ],
  },
  {
    id: "truncation-300-char",
    script: [
      {
        op: "provide",
        impls: {
          "note.save": { kind: "return", value: true },
        },
      },
      {
        op: "invoke",
        command: "note.save",
        args: { body: { repeatChar: "x", repeat: 300 }, sceneId: "s1" },
      },
    ],
  },
  {
    id: "audit-limit-501",
    script: [
      {
        op: "provide",
        impls: {
          "play.newScene": { kind: "undefined" },
        },
      },
      { op: "invoke", command: "play.newScene", args: {}, repeat: 501 },
    ],
  },
  {
    id: "withdraw-unavailable-audit",
    script: [
      {
        op: "provide",
        impls: {
          "play.newScene": { kind: "unavailable", reason: "Modal open." },
        },
      },
      { op: "invoke", command: "play.newScene", args: {} },
      { op: "withdraw", auditIdFromStep: 1 },
      { op: "withdraw", auditIdFromStep: 1 },
      {
        op: "provide",
        impls: {
          "edit.undo": { kind: "return", value: null },
        },
      },
      { op: "invoke", command: "edit.undo", args: {} },
      { op: "withdraw", auditIdFromStep: 5 },
    ],
  },
];
