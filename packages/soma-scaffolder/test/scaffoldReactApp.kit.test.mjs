import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { loadSpec } from "../src/spec.mjs";
import {
  scaffoldReactApp,
  VENDORED_TICKETS_DIR,
  VENDORED_METER_DIR,
  TICKETS_ADAPTER,
  METER_ADAPTER,
  TICKETS_SCHEMA,
  METER_SCHEMA,
} from "../src/scaffoldReactApp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLDER_ROOT = join(__dirname, "..");
const PLATFORM_ROOT = join(SCAFFOLDER_ROOT, "..", "..");
const LEGENDS_SPEC = join(SCAFFOLDER_ROOT, "examples", "legends.soma.json");
const APP_TEMPLATE = process.env.SOMA_APP_TEMPLATE_DIR || join(PLATFORM_ROOT, "..", "soma-app-template");

function scaffoldLegendsToTemp() {
  const outDir = join(tmpdir(), `soma-react-app-kit-${randomBytes(8).toString("hex")}`);
  const doc = loadSpec(LEGENDS_SPEC);
  scaffoldReactApp(doc, { outDir, appTemplateDir: APP_TEMPLATE, platformRoot: PLATFORM_ROOT });
  return outDir;
}

test("react-app scaffolds vendored @soma/tickets and @soma/meter trees", () => {
  const outDir = scaffoldLegendsToTemp();
  try {
    assert.ok(existsSync(join(outDir, VENDORED_TICKETS_DIR, "index.js")));
    assert.ok(existsSync(join(outDir, VENDORED_TICKETS_DIR, "VENDORED.md")));
    assert.ok(existsSync(join(outDir, TICKETS_SCHEMA)));
    assert.ok(existsSync(join(outDir, VENDORED_METER_DIR, "meter.js")));
    assert.ok(existsSync(join(outDir, VENDORED_METER_DIR, "VENDORED.md")));
    assert.ok(existsSync(join(outDir, METER_SCHEMA)));

    const vendored = readFileSync(join(outDir, VENDORED_TICKETS_DIR, "VENDORED.md"), "utf8");
    assert.match(vendored, /Do not edit these files in place/);
    assert.match(vendored, /packages\/soma-tickets\/src\//);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("react-app emits tickets and meter adapters wired to the spec APP_ID", () => {
  const outDir = scaffoldLegendsToTemp();
  try {
    const tickets = readFileSync(join(outDir, TICKETS_ADAPTER), "utf8");
    assert.match(tickets, /createTickets\(\{ supabase, app: APP_ID \}\)/);

    const meter = readFileSync(join(outDir, METER_ADAPTER), "utf8");
    assert.match(meter, /createMeter\(/);
    assert.match(meter, /app: APP_ID/);
    assert.match(meter, /adminEnv\(\)/);

    const appConfig = readFileSync(join(outDir, "src/lib/appConfig.ts"), "utf8");
    assert.match(appConfig, /APP_ID = 'legends'/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("SETUP.md documents shared kit schema.sql paths", () => {
  const outDir = scaffoldLegendsToTemp();
  try {
    const setup = readFileSync(join(outDir, "SETUP.md"), "utf8");
    assert.match(setup, new RegExp(TICKETS_SCHEMA.replace(/\//g, "\\/")));
    assert.match(setup, new RegExp(METER_SCHEMA.replace(/\//g, "\\/")));
    assert.match(setup, /scoped by the `app` column/);
    assert.match(setup, /@soma\/tickets/);
    assert.match(setup, /@soma\/meter/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
