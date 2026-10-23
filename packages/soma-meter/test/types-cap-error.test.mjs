import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("index.d.ts CapError constructor matches runtime API", () => {
  const tsc = spawnSync(
    "npx",
    ["--yes", "-p", "typescript@5", "tsc", "-p", "test/tsconfig.types.json"],
    { cwd: root, encoding: "utf8", timeout: 120_000 },
  );
  assert.equal(tsc.status, 0, tsc.stderr || tsc.stdout);
});
