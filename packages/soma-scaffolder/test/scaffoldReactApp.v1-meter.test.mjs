import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { METER_ADAPTER } from "../src/scaffoldReactAppV1.mjs";
import {
  createCleanPlatformRepo,
  initBareOrigin,
  installScaffolderInPlatform,
  runGit,
  wireFileOriginToBare,
} from "./gitTestHelpers.mjs";
import { writeMinimalV1ReactTemplateTree } from "./minimalV1ReactTemplate.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAFFOLDER_ROOT = join(__dirname, "..");
const MONOREPO_ROOT = join(SCAFFOLDER_ROOT, "..", "..");
const FIXTURE_MANIFEST = join(SCAFFOLDER_ROOT, "test", "fixtures", "v1-disposable", "soma-app.json");

function createCleanTemplateRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "soma-template-root-"));
  const bareDir = initBareOrigin(repoRoot);

  const templateDir = mkdtempSync(join(tmpdir(), "soma-template-"));
  runGit(templateDir, ["init"]);
  writeMinimalV1ReactTemplateTree(templateDir);
  runGit(templateDir, ["add", "."]);
  runGit(templateDir, ["commit", "-m", "template seed"]);
  runGit(templateDir, ["branch", "-M", "main"]);
  wireFileOriginToBare(templateDir, bareDir, { branch: "main" });
  return { templateDir, bareDir, repoRoot };
}

function runCli(cliPath, outDir, templateDir) {
  return spawnSync(
    process.execPath,
    [cliPath, "react-app", FIXTURE_MANIFEST, outDir],
    {
      cwd: join(dirname(cliPath), ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        SOMA_APP_TEMPLATE_DIR: templateDir,
      },
      timeout: 120_000,
    },
  );
}

function cleanup({ templateDir, templateRepoRoot, platformRoot, platformRepoRoot, outDir }) {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
  if (templateDir) rmSync(templateDir, { recursive: true, force: true });
  if (templateRepoRoot) rmSync(templateRepoRoot, { recursive: true, force: true });
  if (platformRoot) rmSync(platformRoot, { recursive: true, force: true });
  if (platformRepoRoot) rmSync(platformRepoRoot, { recursive: true, force: true });
}

test("v1 disposable scaffold type-checks netlify functions with vendored meter", async () => {
  const { platformRoot, repoRoot: platformRepoRoot } = createCleanPlatformRepo({
    monorepoRoot: MONOREPO_ROOT,
  });
  const cli = installScaffolderInPlatform(platformRoot, SCAFFOLDER_ROOT);
  const { templateDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = join(tmpdir(), `soma-v1-meter-${randomBytes(8).toString("hex")}`);
  try {
    const scaffold = runCli(cli, outDir, templateDir);
    assert.equal(scaffold.status, 0, scaffold.stderr || scaffold.stdout);

    const meterAdapter = readFileSync(join(outDir, METER_ADAPTER), "utf8");
    assert.doesNotMatch(meterAdapter, /resolveStudioId/);
    assert.match(meterAdapter, /createSupabaseRestStore/);

    const vendoredMeter = readFileSync(
      join(outDir, "vendor", "soma", "meter", "store-supabase-rest.js"),
      "utf8",
    );
    assert.match(vendoredMeter, /resolveBillingSubject/);

    const vendoredMeterTypes = readFileSync(
      join(outDir, "vendor", "soma", "meter", "index.d.ts"),
      "utf8",
    );
    assert.match(vendoredMeterTypes, /resolveBillingSubject/);
    assert.doesNotMatch(
      readFileSync(join(outDir, "src", "soma-vendor.d.ts"), "utf8"),
      /@vendor\/soma\/meter/,
    );

    const install = spawnSync("npm", ["install"], {
      cwd: outDir,
      encoding: "utf8",
      timeout: 600_000,
    });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    assert.ok(existsSync(join(outDir, "tsconfig.functions.json")));
    const typecheck = spawnSync(
      "npx",
      ["tsc", "-b", "tsconfig.functions.json"],
      {
        cwd: outDir,
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    assert.equal(typecheck.status, 0, typecheck.stderr || typecheck.stdout);
  } finally {
    cleanup({
      outDir,
      templateDir,
      templateRepoRoot,
      platformRoot,
      platformRepoRoot,
    });
  }
});

test("v1 disposable scaffold tsc fails when meter adapter calls a missing meter API", async () => {
  const { platformRoot, repoRoot: platformRepoRoot } = createCleanPlatformRepo({
    monorepoRoot: MONOREPO_ROOT,
  });
  const cli = installScaffolderInPlatform(platformRoot, SCAFFOLDER_ROOT);
  const { templateDir, repoRoot: templateRepoRoot } = createCleanTemplateRepo();
  const outDir = join(tmpdir(), `soma-v1-meter-bad-${randomBytes(8).toString("hex")}`);
  try {
    const scaffold = runCli(cli, outDir, templateDir);
    assert.equal(scaffold.status, 0, scaffold.stderr || scaffold.stdout);

    const install = spawnSync("npm", ["install"], {
      cwd: outDir,
      encoding: "utf8",
      timeout: 600_000,
    });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const meterPath = join(outDir, METER_ADAPTER);
    writeFileSync(
      meterPath,
      `${readFileSync(meterPath, "utf8")}\nmeter.notARealMeterMethod();\n`,
    );

    const typecheck = spawnSync(
      "npx",
      ["tsc", "-b", "tsconfig.functions.json"],
      {
        cwd: outDir,
        encoding: "utf8",
        timeout: 120_000,
      },
    );
    assert.notEqual(typecheck.status, 0, "expected tsc to reject invalid meter API usage");
    assert.match(typecheck.stderr + typecheck.stdout, /notARealMeterMethod/);
  } finally {
    cleanup({
      outDir,
      templateDir,
      templateRepoRoot,
      platformRoot,
      platformRepoRoot,
    });
  }
});
