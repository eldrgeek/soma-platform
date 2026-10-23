#!/usr/bin/env node
/**
 * Freeze PlayMaker agent-portal behaviour into JSON fixtures.
 *
 * Usage:
 *   node tools/freeze-playmaker.mjs /path/to/playmaker
 *
 * Requires `tsx` on PATH (npx tsx) and a PlayMaker checkout at the given path.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const playmakerArg = process.argv[2];
const PLAYMAKER_COMMIT = "9ebc364c";
const fixtureDir = join(packageRoot, "fixtures", `playmaker-${PLAYMAKER_COMMIT}`);

if (!playmakerArg || !String(playmakerArg).trim()) {
  console.error("Usage: node tools/freeze-playmaker.mjs /path/to/playmaker");
  process.exit(1);
}

const playmakerRoot = resolve(playmakerArg);

let frozenAt;
try {
  frozenAt = execFileSync(
    "git",
    ["-C", playmakerRoot, "show", "-s", "--format=%cI", PLAYMAKER_COMMIT],
    { encoding: "utf8" },
  ).trim();
} catch {
  console.error(`freeze-playmaker: cannot resolve PlayMaker commit ${PLAYMAKER_COMMIT} under ${playmakerRoot}`);
  process.exit(1);
}

const pmRoot = playmakerRoot.replace(/\\/g, "/");
const runnerSource = `
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { COMMAND_CATALOGUE } from '${pmRoot}/src/agent-portal/catalogue.ts';
import { validateCommandArgs, commandArgsJsonSchema } from '${pmRoot}/src/agent-portal/validation.ts';
import { WORKFLOWS, workflowCommands, compareInvocations } from '${pmRoot}/src/agent-portal/workflows.ts';
import { createCommandRegistry } from '${pmRoot}/src/agent-portal/registry.ts';

const PLAYMAKER_COMMIT = '${PLAYMAKER_COMMIT}';
const FROZEN_AT = '${frozenAt}';
const outDir = '${fixtureDir.replace(/\\/g, "\\\\")}';

function meta() {
  return { playmakerCommit: PLAYMAKER_COMMIT, frozenAt: FROZEN_AT };
}

function writeJson(name, body) {
  writeFileSync(join(outDir, name), JSON.stringify({ ...meta(), ...body }, null, 2) + '\\n');
}

function installDeterministicHarness() {
  const FIXED_ISO = '2026-06-01T12:00:00.000Z';
  let seq = 0;
  const RealDate = globalThis.Date;
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(FIXED_ISO);
      else super(...args);
    }
    static now() { return new RealDate(FIXED_ISO).getTime(); }
  };
  const priorUuid = globalThis.crypto.randomUUID.bind(globalThis.crypto);
  globalThis.crypto.randomUUID = () => {
    const suffix = String(seq++).padStart(12, '0');
    return \`00000000-0000-4000-8000-\${suffix}\`;
  };
  return () => {
    globalThis.Date = RealDate;
    globalThis.crypto.randomUUID = priorUuid;
  };
}

function specById(id) {
  const spec = COMMAND_CATALOGUE.find((entry) => entry.id === id);
  if (!spec) throw new Error('Missing command ' + id);
  return spec;
}

mkdirSync(outDir, { recursive: true });

const catalogue = COMMAND_CATALOGUE.map(({ id, kind, args }) => ({ id, kind, args }));
writeJson('catalogue.json', { catalogue });

const jsonSchemaByCommand = {};
for (const spec of COMMAND_CATALOGUE) {
  jsonSchemaByCommand[spec.id] = commandArgsJsonSchema(spec);
}
writeJson('command-args-json-schema.json', { jsonSchemaByCommand });

const validationCases = [];

function pushCase(commandId, args, label) {
  validationCases.push({
    commandId,
    label,
    args,
    error: validateCommandArgs(specById(commandId), args),
  });
}

// string
pushCase('play.rename', { title: 'My play' }, 'string-valid-1');
pushCase('note.save', { body: 'hello', sceneId: 's1' }, 'string-valid-2');
pushCase('view.navigate', { to: '/play/p1' }, 'string-valid-3');
pushCase('play.rename', { title: 42 }, 'string-invalid-1');
pushCase('play.rename', { extra: 'x' }, 'string-invalid-2');
pushCase('view.dialog', { dialog: 'not-a-dialog' }, 'string-invalid-enum');

// boolean
pushCase('view.showPageBreaks', { enabled: true }, 'boolean-valid-1');
pushCase('view.showPageBreaks', { enabled: false }, 'boolean-valid-2');
pushCase('landing.toggleRail', { open: true }, 'boolean-valid-3');
pushCase('view.showPageBreaks', { enabled: 'yes' }, 'boolean-invalid-1');
pushCase('view.showPageBreaks', {}, 'boolean-invalid-2');
pushCase('view.showPageBreaks', { enabled: 1 }, 'boolean-invalid-3');

// string[]
pushCase('view.readerView', { playId: 'p1', sceneIds: ['s1'] }, 'string-array-valid-1');
pushCase('view.readerView', { playId: 'p1', sceneIds: [] }, 'string-array-valid-2');
pushCase('view.readerView', { playId: 'p1' }, 'string-array-valid-3');
pushCase('view.readerView', { playId: 'p1', sceneIds: ['s1', 2] }, 'string-array-invalid-1');
pushCase('view.readerView', { playId: 'p1', sceneIds: 's1' }, 'string-array-invalid-2');
pushCase('view.readerView', { playId: 'p1', sceneIds: [null] }, 'string-array-invalid-3');

// array (play.importScript)
pushCase('play.importScript', {
  files: [{ fileName: 'a.fountain', text: 'INT. ROOM - DAY' }],
}, 'array-valid-1');
pushCase('play.importScript', {
  fileName: 'solo.fountain',
  text: 'INT. HALL - NIGHT',
}, 'array-valid-2');
pushCase('play.importScript', {
  files: [{ fileName: 'a.fountain', text: 'A' }, { fileName: 'b.fountain', text: 'B' }],
}, 'array-valid-3');
pushCase('play.importScript', { files: 'nope' }, 'array-invalid-1');
pushCase('play.importScript', {}, 'array-invalid-2');
pushCase('play.importScript', { text: 'orphan text' }, 'array-invalid-3');

// non-object args
validationCases.push({
  commandId: 'play.rename',
  label: 'non-object-args',
  args: null,
  error: validateCommandArgs(specById('play.rename'), null),
});

writeJson('validate-command-args.json', { validationCases });

function matchingInvocation(workflow) {
  const invoked = [];
  for (const step of workflow.steps) {
    const options = typeof step.command === 'string' ? [step.command] : [...step.command];
    invoked.push(options[0]);
  }
  return invoked;
}

const workflowSnapshots = WORKFLOWS.map((workflow) => {
  const matching = matchingInvocation(workflow);
  const extra = [...matching, 'play.newScene'];
  return {
    id: workflow.id,
    workflowCommands: workflowCommands(workflow),
    compareInvocations: {
      matching: compareInvocations(workflow, matching),
      missingStep: compareInvocations(workflow, []),
      extraStep: compareInvocations(workflow, extra),
    },
  };
});
writeJson('workflows.json', { workflows: WORKFLOWS, workflowSnapshots });

const registryCases = [];

function captureRegistryCase(id, run) {
  installDeterministicHarness();
  const registry = createCommandRegistry();
  registry.clearAudit();
  const outcome = run(registry);
  registryCases.push({
    id,
    invoke: outcome.invoke,
    audit: registry.audit(),
    auditLength: registry.audit().length,
  });
}

captureRegistryCase('unknown-command', (registry) => {
  const invoke = registry.invoke('no.such.command', {});
  return { invoke };
});

captureRegistryCase('invalid-args', (registry) => {
  const invoke = registry.invoke('play.rename', { title: 42 });
  return { invoke };
});

captureRegistryCase('impl-throws', (registry) => {
  registry.provide({
    'play.newScene': {
      run: () => {
        throw new Error('boom');
      },
    },
  });
  const invoke = registry.invoke('play.newScene', {});
  return { invoke };
});

captureRegistryCase('successful-impl', (registry) => {
  registry.provide({
    'edit.undo': {
      run: () => ({ done: true }),
    },
  });
  const invoke = registry.invoke('edit.undo', {});
  return { invoke };
});

captureRegistryCase('truncation-300-char', (registry) => {
  registry.provide({
    'note.save': {
      run: () => true,
    },
  });
  const body = 'x'.repeat(300);
  const invoke = registry.invoke('note.save', { body, sceneId: 's1' });
  return { invoke };
});

captureRegistryCase('audit-limit-501', (registry) => {
  registry.provide({
    'play.newScene': {
      run: () => undefined,
    },
  });
  let last;
  for (let i = 0; i < 501; i += 1) {
    last = registry.invoke('play.newScene', {});
  }
  return { invoke: last };
});

writeJson('registry-invoke.json', { registryCases });

console.log('Wrote fixtures to', outDir);
`;

const runnerPath = join(packageRoot, "tools", ".freeze-runner.tmp.mjs");
writeFileSync(runnerPath, runnerSource);

try {
  execFileSync(
    "npx",
    ["--yes", "tsx", "--tsconfig", join(playmakerRoot, "tsconfig.app.json"), runnerPath],
    {
      cwd: playmakerRoot,
      stdio: "inherit",
      env: { ...process.env, TSX_TSCONFIG_PATH: join(playmakerRoot, "tsconfig.app.json") },
    },
  );
} finally {
  try {
    unlinkSync(runnerPath);
  } catch {
    // ignore
  }
}
