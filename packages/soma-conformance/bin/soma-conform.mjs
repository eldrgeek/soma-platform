#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatTextReport,
  reportPassed,
  runConformance,
} from "../src/index.mjs";

const USAGE = "Usage: soma-conform --contract <path> --repo <dir> --tier <prototype|public-mvp> [--json]";

function parseArguments(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (!["--contract", "--repo", "--tier"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }

  for (const required of ["contract", "repo", "tier"]) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  if (!["prototype", "public-mvp"].includes(options.tier)) {
    throw new Error("--tier must be prototype or public-mvp");
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(options.contract), "utf8"));
  } catch (error) {
    console.error(`Cannot read contract ${options.contract}: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const report = await runConformance({
    manifest,
    repositoryRoot: resolve(options.repo),
    tier: options.tier,
  });
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatTextReport(report));
  }
  process.exitCode = reportPassed(report) ? 0 : 1;
}

await main();
