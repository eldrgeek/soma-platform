import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  commandArgsJsonSchema,
  compareInvocations,
  createCommandRegistry,
  validateCommandArgs,
  workflowCommands,
} from "../src/index.mjs";
import { installDeterministicHarness } from "./support/deterministic.mjs";
import { playmakerAfterSchemaValidate } from "./support/play-import-script.mjs";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(packageRoot, "fixtures", "playmaker-9ebc364c");

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
}

function buildCatalogue() {
  const { catalogue } = loadFixture("catalogue.json");
  return catalogue;
}

function specById(catalogue, id) {
  const spec = catalogue.find((entry) => entry.id === id);
  assert.ok(spec, `missing spec ${id}`);
  return spec;
}

test("catalogue fixture commit marker", () => {
  const meta = loadFixture("catalogue.json");
  assert.equal(meta.playmakerCommit, "9ebc364c");
});

test("commandArgsJsonSchema matches frozen PlayMaker output for every command", () => {
  const catalogue = buildCatalogue();
  const { jsonSchemaByCommand } = loadFixture("command-args-json-schema.json");
  for (const spec of catalogue) {
    assert.deepEqual(
      commandArgsJsonSchema(spec),
      jsonSchemaByCommand[spec.id],
      spec.id,
    );
  }
});

test("validateCommandArgs matches frozen PlayMaker cases", () => {
  const catalogue = buildCatalogue();
  const { validationCases } = loadFixture("validate-command-args.json");
  for (const caseEntry of validationCases) {
    const spec = specById(catalogue, caseEntry.commandId);
    const actual = validateCommandArgs(spec, caseEntry.args, playmakerAfterSchemaValidate);
    assert.equal(actual, caseEntry.error, caseEntry.label);
  }
});

test("workflowCommands match frozen PlayMaker workflows", () => {
  const { workflows, workflowSnapshots } = loadFixture("workflows.json");
  for (const snapshot of workflowSnapshots) {
    const workflow = workflows.find((entry) => entry.id === snapshot.id);
    assert.ok(workflow, snapshot.id);
    assert.deepEqual(workflowCommands(workflow), snapshot.workflowCommands);
  }
});

test("compareInvocations matching lists match frozen PlayMaker workflows", () => {
  const { workflows, workflowSnapshots } = loadFixture("workflows.json");
  for (const snapshot of workflowSnapshots) {
    const workflow = workflows.find((entry) => entry.id === snapshot.id);
    const matching = [];
    for (const step of workflow.steps) {
      const options = typeof step.command === "string" ? [step.command] : [...step.command];
      matching.push(options[0]);
    }
    assert.deepEqual(compareInvocations(workflow, matching), snapshot.compareInvocations.matching);
  }
});

test("workflow compareInvocations missing and extra steps", () => {
  const { workflows, workflowSnapshots } = loadFixture("workflows.json");
  for (const snapshot of workflowSnapshots) {
    const workflow = workflows.find((entry) => entry.id === snapshot.id);
    const missing = snapshot.compareInvocations.missingStep;
    const extra = snapshot.compareInvocations.extraStep;
    assert.deepEqual(compareInvocations(workflow, []), missing);
    const matching = [];
    for (const step of workflow.steps) {
      const options = typeof step.command === "string" ? [step.command] : [...step.command];
      matching.push(options[0]);
    }
    assert.deepEqual(compareInvocations(workflow, [...matching, "play.newScene"]), extra);
  }
});

test("registry invoke and audit match frozen PlayMaker cases", () => {
  const catalogue = buildCatalogue();
  const { registryCases } = loadFixture("registry-invoke.json");

  for (const caseEntry of registryCases) {
    const restore = installDeterministicHarness();
    const registry = createCommandRegistry(catalogue, {
      afterSchemaValidate: playmakerAfterSchemaValidate,
    });
    registry.clearAudit();

    let invoke;
    if (caseEntry.id === "impl-throws") {
      registry.provide({
        "play.newScene": {
          run: () => {
            throw new Error("boom");
          },
        },
      });
      invoke = registry.invoke("play.newScene", {});
    } else if (caseEntry.id === "successful-impl") {
      registry.provide({
        "edit.undo": {
          run: () => ({ done: true }),
        },
      });
      invoke = registry.invoke("edit.undo", {});
    } else if (caseEntry.id === "truncation-300-char") {
      registry.provide({
        "note.save": {
          run: () => true,
        },
      });
      invoke = registry.invoke("note.save", { body: "x".repeat(300), sceneId: "s1" });
    } else if (caseEntry.id === "audit-limit-501") {
      registry.provide({
        "play.newScene": {
          run: () => undefined,
        },
      });
      for (let i = 0; i < 501; i += 1) {
        invoke = registry.invoke("play.newScene", {});
      }
    } else if (caseEntry.id === "unknown-command") {
      invoke = registry.invoke("no.such.command", {});
    } else if (caseEntry.id === "invalid-args") {
      invoke = registry.invoke("play.rename", { title: 42 });
    } else {
      assert.fail(`unhandled registry case ${caseEntry.id}`);
    }

    assert.deepEqual(invoke, caseEntry.invoke);
    assert.deepEqual(registry.audit(), caseEntry.audit);
    assert.equal(registry.audit().length, caseEntry.auditLength);
    restore();
  }
});
