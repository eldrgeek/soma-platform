import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalize,
  contractSha256,
  readLock,
  readSourceFile,
  validateLock,
  validateManifest,
  validateSourcePath,
} from "../src/index.mjs";

function manifest() {
  return {
    $schema: "./vendor/soma/soma-app-v1.schema.json",
    schema_version: "soma.app/1",
    app: {
      id: "test-app",
      name: "Test App",
      tier: "prototype",
      origins: {
        production: "https://test-app.example",
        staging: "https://staging.test-app.example",
      },
      repository: "example/test-app",
    },
    hosts: {
      human: {
        id: "host",
        name: "Human Host",
        role: "Human host",
        escalation_url: "/contact",
        expected_response: "Within two working days",
      },
      ai: {
        id: "guide",
        name: "Guide",
        role: "AI host",
        persona: "personas/guide.md",
      },
    },
    guide: {
      ask: {
        knowledge: ["knowledge/app.md"],
        page_context: false,
        web: false,
      },
      voice: { enabled: false },
    },
    identity: {
      subject: "pairwise",
      admission: "open",
      profile_fields: ["display_name", "locale"],
    },
    concepts: [],
    questions: [],
    actions: [
      {
        id: "test.inspect",
        version: "1",
        kind: "observe",
        required_scopes: ["test:read"],
        required_role: "member",
        surfaces: ["ui", "guide", "remote"],
        input_schema: "schemas/inspect.input.json",
        output_schema: "schemas/inspect.output.json",
        executor: { kind: "rpc", name: "inspect_test" },
        effects: [],
      },
    ],
    workflows: [],
    ai_visitors: {
      enabled: false,
      default_grant_minutes: 60,
      maximum_standing_risk: "reversible",
    },
    promises: [],
    data_flows: [],
    data_stores: [],
    legal: {
      operator: "Example operator",
      privacy: "/privacy",
      terms: "/terms",
      data_export: "/settings/export",
      app_forget: "/settings/leave",
      agent_revocation: "/settings/agents",
    },
    credits: {
      page: "/credits",
      require_artifact_byline: true,
    },
    dependencies: {
      identity_broker: {
        required: true,
        fallback: "public-pages-and-knowledge-search",
      },
      guide_cdn: {
        required: false,
        fallback: "/help",
      },
    },
  };
}

test("v1 schema validates the canonical shape and enforces conditional fields", () => {
  assert.equal(validateManifest(manifest()).valid, true);

  const unknown = manifest();
  unknown.surprise = true;
  assert.equal(validateManifest(unknown).valid, false);

  const legacy = manifest();
  legacy.identity.subject = "legacy-global";
  assert.equal(validateManifest(legacy).valid, false);
  legacy.identity.legacy_auth_storage_keys = ["^sb-test-auth-token(?:\\..+)?$"];
  assert.equal(validateManifest(legacy).valid, true);

  const pairwise = manifest();
  pairwise.identity.legacy_auth_storage_keys = ["auth-token"];
  assert.equal(validateManifest(pairwise).valid, false);

  const aiOnlyEffect = manifest();
  Object.assign(aiOnlyEffect.actions[0], {
    kind: "effect",
    risk: "reversible",
    effect_target: "database",
    surfaces: ["remote"],
  });
  assert.equal(validateManifest(aiOnlyEffect).valid, false);
  aiOnlyEffect.actions[0].ui_exception = { reason: "No honest visual equivalent" };
  assert.equal(validateManifest(aiOnlyEffect).valid, true);

  const publicMvp = manifest();
  publicMvp.app.tier = "public-mvp";
  Object.assign(publicMvp.legal, {
    privacy_source: "legal/privacy.md",
    terms_source: "legal/terms.md",
    ratified_by: "Operator",
    ratified_at: "2026-10-16T00:00:00Z",
  });
  publicMvp.data_flows.push({
    vendor: "Provider",
    what: "A request",
    why: "Provide a response",
    retention_days: "undeclared",
  });
  assert.equal(validateManifest(publicMvp).valid, false);
  publicMvp.data_flows[0].retention_days = 0;
  assert.equal(validateManifest(publicMvp).valid, true);
});

function ieee754(hex) {
  return Buffer.from(hex, "hex").readDoubleBE();
}

test("JCS implements the RFC 8785 Appendix B number table", () => {
  const samples = [
    ["0000000000000000", "0"],
    ["8000000000000000", "0"],
    ["0000000000000001", "5e-324"],
    ["8000000000000001", "-5e-324"],
    ["7fefffffffffffff", "1.7976931348623157e+308"],
    ["ffefffffffffffff", "-1.7976931348623157e+308"],
    ["4340000000000000", "9007199254740992"],
    ["c340000000000000", "-9007199254740992"],
    ["4430000000000000", "295147905179352830000"],
    ["7fffffffffffffff", null],
    ["7ff0000000000000", null],
    ["44b52d02c7e14af5", "9.999999999999997e+22"],
    ["44b52d02c7e14af6", "1e+23"],
    ["44b52d02c7e14af7", "1.0000000000000001e+23"],
    ["444b1ae4d6e2ef4e", "999999999999999700000"],
    ["444b1ae4d6e2ef4f", "999999999999999900000"],
    ["444b1ae4d6e2ef50", "1e+21"],
    ["3eb0c6f7a0b5ed8c", "9.999999999999997e-7"],
    ["3eb0c6f7a0b5ed8d", "0.000001"],
    ["41b3de4355555553", "333333333.3333332"],
    ["41b3de4355555554", "333333333.33333325"],
    ["41b3de4355555555", "333333333.3333333"],
    ["41b3de4355555556", "333333333.3333334"],
    ["41b3de4355555557", "333333333.33333343"],
    ["becbf647612f3696", "-0.0000033333333333333333"],
    ["43143ff3c1cb0959", "1424953923781206.2"],
  ];

  for (const [bits, expected] of samples) {
    const number = ieee754(bits);
    if (expected === null) {
      assert.throws(() => canonicalize(number), /non-finite number/, bits);
    } else {
      assert.equal(canonicalize(number), expected, bits);
    }
  }
});

test("JCS implements the RFC 8785 section 3.2.2.2 string-escape example", () => {
  const value = JSON.parse(
    String.raw`"\u20ac$\u000F\u000aA'\u0042\u0022\u005c\\\"\/"`,
  );
  assert.equal(
    canonicalize(value),
    String.raw`"€$\u000f\nA'B\"\\\\\"/"`,
  );
});

test("JCS implements RFC 8785 sample number serialization and UTF-16 key order", () => {
  assert.equal(
    canonicalize([333333333.33333329, 1e30, 4.50, 2e-3, 1e-27]),
    "[333333333.3333333,1e+30,4.5,0.002,1e-27]",
  );

  const keyOrder = {
    "\u20ac": "Euro Sign",
    "\r": "Carriage Return",
    "\ufb33": "Hebrew Letter Dalet With Dagesh",
    "1": "One",
    "\ud83d\ude00": "Emoji",
    "\u0080": "Control",
    "\u00f6": "Latin Small Letter O With Diaeresis",
  };
  assert.equal(
    canonicalize(keyOrder),
    "{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\u0080\":\"Control\",\"ö\":\"Latin Small Letter O With Diaeresis\",\"€\":\"Euro Sign\",\"😀\":\"Emoji\",\"דּ\":\"Hebrew Letter Dalet With Dagesh\"}",
  );
  assert.throws(() => canonicalize("\ud800"), /lone Unicode surrogate/);
  assert.throws(() => canonicalize(Array(1)), /missing array item/);
});

test("contract hash ignores manifest formatting, changes with file bytes, and reads once", async () => {
  const compact = JSON.parse(JSON.stringify(manifest()));
  const reformatted = JSON.parse(JSON.stringify(compact, null, 4));
  const files = new Map([
    ["personas/guide.md", Buffer.from("guide")],
    ["knowledge/app.md", Buffer.from("knowledge")],
    ["schemas/inspect.input.json", Buffer.from("{}")],
    ["schemas/inspect.output.json", Buffer.from('{"type":"object"}')],
  ]);
  const reads = new Map();
  const readFile = (path) => {
    reads.set(path, (reads.get(path) ?? 0) + 1);
    return files.get(path);
  };

  const first = await contractSha256(compact, readFile);
  reads.clear();
  const reformattedHash = await contractSha256(reformatted, readFile);
  assert.equal(reformattedHash, first);
  assert.deepEqual([...reads.values()], [1, 1, 1, 1]);

  files.set("knowledge/app.md", Buffer.from("changed"));
  assert.notEqual(await contractSha256(compact, readFile), first);

  const mutable = manifest();
  const readBeforeMutation = [];
  await contractSha256(mutable, (path) => {
    mutable.guide.ask.knowledge.push("knowledge/late.md");
    readBeforeMutation.push(path);
    return files.get(path);
  });
  assert.equal(readBeforeMutation.includes("knowledge/late.md"), false);
});

test("safe source paths reject traversal, URLs, controls, and empty segments", () => {
  for (const unsafe of [
    "/absolute.md",
    "../outside.md",
    "dir/../outside.md",
    "https://example.test/file",
    "bad\u0000name",
    "dir//file.md",
    "dir/./file.md",
    "dir\\file.md",
  ]) {
    assert.throws(() => validateSourcePath(unsafe), unsafe);
  }
  assert.equal(validateSourcePath("knowledge/app.md"), "knowledge/app.md");
});

test("safe source paths reject every non-NUL control character", () => {
  const controlCodePoints = [
    ...Array.from({ length: 31 }, (_, index) => index + 1),
    ...Array.from({ length: 33 }, (_, index) => index + 0x7f),
  ];
  for (const codePoint of controlCodePoints) {
    const path = `bad${String.fromCodePoint(codePoint)}name`;
    assert.throws(
      () => validateSourcePath(path),
      /control characters/,
      `U+${codePoint.toString(16).padStart(4, "0")}`,
    );
  }
});

test("safe source reader rejects symlinks, escapes, non-files, and oversized files", () => {
  const parent = mkdtempSync(join(tmpdir(), "soma-contracts-"));
  const root = join(parent, "repo");
  const outside = join(parent, "outside.md");
  mkdirSync(join(root, "files"), { recursive: true });
  writeFileSync(join(root, "files", "ok.md"), "safe bytes");
  writeFileSync(join(root, "files", "large.md"), "12345");
  writeFileSync(outside, "outside");
  symlinkSync("ok.md", join(root, "files", "inside-link.md"));
  symlinkSync(outside, join(root, "files", "outside-link.md"));

  try {
    const result = readSourceFile(root, "files/ok.md", { maxBytes: 10 });
    assert.equal(result.bytes.toString(), "safe bytes");
    assert.equal(result.sha256.length, 64);
    assert.throws(
      () => readSourceFile(root, "files/inside-link.md", { maxBytes: 100 }),
      /symlink/,
    );
    assert.throws(
      () => readSourceFile(root, "files/outside-link.md", { maxBytes: 100 }),
      /outside the repository/,
    );
    assert.throws(
      () => readSourceFile(root, "files", { maxBytes: 100 }),
      /not a regular file/,
    );
    assert.throws(
      () => readSourceFile(root, "files/large.md", { maxBytes: 4 }),
      /exceeds 4 bytes/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("safe source reader rejects a symlinked parent directory", () => {
  const parent = mkdtempSync(join(tmpdir(), "soma-contracts-"));
  const root = join(parent, "repo");
  mkdirSync(join(root, "files"), { recursive: true });
  writeFileSync(join(root, "files", "ok.md"), "safe bytes");
  symlinkSync("files", join(root, "linked-files"), "dir");

  try {
    assert.throws(
      () => readSourceFile(root, "linked-files/ok.md", { maxBytes: 100 }),
      /symlink/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("safe source reader rejects a FIFO", (t) => {
  if (process.platform === "win32") {
    t.skip("Windows does not provide POSIX FIFOs");
    return;
  }

  const parent = mkdtempSync(join(tmpdir(), "soma-contracts-"));
  const root = join(parent, "repo");
  const fifo = join(root, "source.fifo");
  mkdirSync(root);

  try {
    const result = spawnSync("mkfifo", [fifo], {
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.throws(
      () => readSourceFile(root, "source.fifo", { maxBytes: 100 }),
      /not a regular file/,
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

function minimalLock(overrides = {}) {
  return {
    kit_version: "1.0.0",
    source_commit: "a".repeat(40),
    template: {
      repository: "eldrgeek/soma-app-template",
      commit: "b".repeat(40),
    },
    contract_sha256: "c".repeat(64),
    guide: {
      version: "1.0.0",
      assets: [
        {
          url: "https://soma-guide.netlify.app/v1.0.0/soma-guide.js",
          integrity: `sha384-${Buffer.alloc(48).toString("base64")}`,
        },
      ],
    },
    packages: {
      "@soma/actions": {
        version: "1.0.0",
        sha256: "d".repeat(64),
      },
    },
    ...overrides,
  };
}

test("kit lock template.repository accepts GitHub owner/name or absolute file:// URL", () => {
  assert.equal(validateLock(minimalLock()).valid, true);

  const fileLock = minimalLock();
  fileLock.template.repository =
    "file:///tmp/soma-app-template-origin.git";
  assert.equal(validateLock(fileLock).valid, true);

});

test("kit lock template.repository rejects non-GitHub http URLs and relative paths", () => {
  const httpLock = minimalLock();
  httpLock.template.repository = "http://example.test/repo.git";
  assert.equal(validateLock(httpLock).valid, false);

  const relativeLock = minimalLock();
  relativeLock.template.repository = "file://relative/path.git";
  assert.equal(validateLock(relativeLock).valid, false);
});

test("readLock accepts the exact lock shape and rejects extra fields", () => {
  const directory = mkdtempSync(join(tmpdir(), "soma-lock-"));
  const lockPath = join(directory, "soma-kit.lock.json");
  const lock = minimalLock();

  try {
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.deepEqual(readLock(lockPath), lock);
    lock.extra = true;
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.throws(() => readLock(lockPath), /Invalid SOMA kit lock/);
    delete lock.extra;
    lock.guide.assets[0].integrity = "sha384-QQ==";
    writeFileSync(lockPath, JSON.stringify(lock));
    assert.throws(() => readLock(lockPath), /Invalid SOMA kit lock/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
