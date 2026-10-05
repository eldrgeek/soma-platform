#!/usr/bin/env node
// Scaffold legends.soma.json (react-app), install, typecheck, build; emit timing JSON.
//   node tools/standup-check.mjs [--keep]

import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { loadSpec } from "../src/spec.mjs";
import { scaffoldReactApp, resolveAppTemplateDir } from "../src/scaffoldReactApp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLDER_ROOT = join(__dirname, "..");
const PLATFORM_ROOT = join(SCAFFOLDER_ROOT, "..", "..");
const LEGENDS_SPEC = join(SCAFFOLDER_ROOT, "examples", "legends.soma.json");
const TEMPLATE_REPO = "https://github.com/eldrgeek/soma-app-template.git";
const keep = process.argv.includes("--keep");

function elapsedSeconds(startMs) {
  return Math.round(Date.now() - startMs) / 1000;
}

function runStep(cwd, cmd, args, env = {}) {
  const res = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: res.status === 0,
    status: res.status ?? 1,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

function resolveTemplateDir() {
  const candidate = resolveAppTemplateDir();
  if (existsSync(candidate)) return candidate;
  const cloneDir = mkdtempSync(join(tmpdir(), "soma-app-template-"));
  const clone = runStep(process.cwd(), "git", ["clone", "--depth", "1", TEMPLATE_REPO, cloneDir]);
  if (!clone.ok) {
    throw new Error(`Failed to clone ${TEMPLATE_REPO}: ${clone.stderr || clone.stdout}`);
  }
  return cloneDir;
}

function packageScripts(appDir) {
  const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"));
  return pkg.scripts || {};
}

const totalStart = Date.now();
const result = {
  scaffold_s: 0,
  install_s: 0,
  typecheck_s: 0,
  build_s: 0,
  total_s: 0,
  ok: false,
  failed_step: null,
};

let workDir = null;
let clonedTemplate = null;

try {
  const templateDir = resolveTemplateDir();
  if (templateDir.startsWith(join(tmpdir(), "soma-app-template-"))) {
    clonedTemplate = templateDir;
  }

  // scaffoldReactApp refuses to overwrite; mkdtemp would create outDir too early.
  workDir = join(tmpdir(), `soma-standup-check-${randomBytes(8).toString("hex")}`);
  const doc = loadSpec(LEGENDS_SPEC);

  const scaffoldStart = Date.now();
  scaffoldReactApp(doc, {
    outDir: workDir,
    appTemplateDir: templateDir,
    platformRoot: PLATFORM_ROOT,
  });
  result.scaffold_s = elapsedSeconds(scaffoldStart);

  const scripts = packageScripts(workDir);
  const installStart = Date.now();
  const hasLock = existsSync(join(workDir, "package-lock.json"));
  const install = hasLock
    ? runStep(workDir, "npm", ["ci"])
    : runStep(workDir, "npm", ["install"]);
  result.install_s = elapsedSeconds(installStart);
  if (!install.ok) {
    result.failed_step = "install";
    console.error(install.stderr || install.stdout);
    throw new Error("install failed");
  }

  const dummyEnv = {
    VITE_SUPABASE_URL: "https://example.supabase.co",
    VITE_SUPABASE_ANON_KEY: "dummy",
  };

  const typecheckStart = Date.now();
  let typecheck;
  if (scripts.typecheck) {
    typecheck = runStep(workDir, "npm", ["run", "typecheck"], dummyEnv);
  } else {
    typecheck = runStep(workDir, "npx", ["tsc", "-b"], dummyEnv);
  }
  result.typecheck_s = elapsedSeconds(typecheckStart);
  if (!typecheck.ok) {
    result.failed_step = "typecheck";
    console.error(typecheck.stderr || typecheck.stdout);
    throw new Error("typecheck failed");
  }

  const buildStart = Date.now();
  const build = runStep(workDir, "npm", ["run", "build"], dummyEnv);
  result.build_s = elapsedSeconds(buildStart);
  if (!build.ok) {
    result.failed_step = "build";
    console.error(build.stderr || build.stdout);
    throw new Error("build failed");
  }

  result.ok = true;
} catch (e) {
  if (!result.failed_step) {
    if (e.message?.includes("clone")) result.failed_step = "template";
    else if (result.install_s > 0) result.failed_step = result.failed_step || "post-install";
    else if (result.scaffold_s > 0) result.failed_step = result.failed_step || "post-scaffold";
    else result.failed_step = "scaffold";
  }
  if (e.message) console.error(e.message);
  if (!result.failed_step) result.failed_step = "unknown";
} finally {
  result.total_s = elapsedSeconds(totalStart);
  console.log(JSON.stringify(result));
  if (!keep) {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
    if (clonedTemplate) rmSync(clonedTemplate, { recursive: true, force: true });
  } else if (workDir) {
    console.error(`kept scaffold dir: ${workDir}`);
  }
}

process.exit(result.ok ? 0 : 1);
