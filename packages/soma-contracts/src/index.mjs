import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestSchema = JSON.parse(
  readFileSync(join(packageRoot, "schema", "soma-app-v1.schema.json"), "utf8"),
);
const lockSchema = JSON.parse(
  readFileSync(join(packageRoot, "schema", "soma-kit-lock.schema.json"), "utf8"),
);

const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  allowUnionTypes: false,
});
const manifestValidator = ajv.compile(manifestSchema);
const lockValidator = ajv.compile(lockSchema);

function validationResult(valid, errors) {
  return {
    valid: Boolean(valid),
    errors: valid
      ? []
      : (errors ?? []).map((error) => ({
          instancePath: error.instancePath,
          schemaPath: error.schemaPath,
          keyword: error.keyword,
          params: error.params,
          message: error.message,
        })),
  };
}

export function validateManifest(doc) {
  const valid = manifestValidator(doc);
  return validationResult(valid, manifestValidator.errors);
}

export function validateLock(doc) {
  const valid = lockValidator(doc);
  return validationResult(valid, lockValidator.errors);
}

export function formatValidationErrors(errors) {
  return errors.map((error) => {
    const location = error.instancePath || "/";
    return `${location} ${error.message}`;
  });
}

export function readLock(path) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read SOMA kit lock ${path}: ${error.message}`, { cause: error });
  }
  const result = validateLock(doc);
  if (!result.valid) {
    throw new Error(
      `Invalid SOMA kit lock ${path}:\n${formatValidationErrors(result.errors)
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
  }
  return doc;
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertValidUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError("JCS cannot canonicalize a lone Unicode surrogate");
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("JCS cannot canonicalize a lone Unicode surrogate");
    }
  }
}

export function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "string") {
    assertValidUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("JCS cannot canonicalize a non-finite number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const values = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError(`JCS cannot canonicalize missing array item ${index}`);
      }
      const item = value[index];
      if (item === undefined || typeof item === "function" || typeof item === "symbol") {
        throw new TypeError(`JCS cannot canonicalize array item ${index}`);
      }
      values.push(canonicalize(item));
    }
    return `[${values.join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("JCS accepts only JSON objects");
    }
    const entries = Object.keys(value)
      .sort(compareUtf16)
      .map((key) => {
        assertValidUnicode(key);
        const item = value[key];
        if (item === undefined || typeof item === "function" || typeof item === "symbol") {
          throw new TypeError(`JCS cannot canonicalize object member ${key}`);
        }
        return `${JSON.stringify(key)}:${canonicalize(item)}`;
      });
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`JCS cannot canonicalize ${typeof value}`);
}

export function validateSourcePath(sourcePath) {
  if (typeof sourcePath !== "string" || sourcePath.length === 0) {
    throw new TypeError("Source path must be a non-empty string");
  }
  if (isAbsolute(sourcePath) || sourcePath.startsWith("/")) {
    throw new Error(`Source path must be repository-relative: ${sourcePath}`);
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(sourcePath)) {
    throw new Error(`Source path must not be a URL: ${sourcePath}`);
  }
  if (/[\p{Cc}]/u.test(sourcePath)) {
    throw new Error("Source path must not contain control characters");
  }
  if (sourcePath.includes("\\")) {
    throw new Error(`Source path must use POSIX separators: ${sourcePath}`);
  }
  const segments = sourcePath.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error(`Source path must not contain an empty segment: ${sourcePath}`);
  }
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Source path must not contain '..': ${sourcePath}`);
  }
  if (segments.some((segment) => segment === ".")) {
    throw new Error(`Source path must be normalized: ${sourcePath}`);
  }
  return sourcePath;
}

function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

export function readSourceFile(repositoryRoot, sourcePath, { maxBytes } = {}) {
  validateSourcePath(sourcePath);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new TypeError("maxBytes must be a non-negative safe integer");
  }

  const root = realpathSync(resolve(repositoryRoot));
  const fullPath = join(root, ...sourcePath.split("/"));

  const realPath = realpathSync(fullPath);
  if (!isWithin(root, realPath)) {
    throw new Error(`Source path resolves outside the repository: ${sourcePath}`);
  }

  const segments = sourcePath.split("/");
  let cursor = root;
  for (const [index, segment] of segments.entries()) {
    cursor = join(cursor, segment);
    const entry = lstatSync(cursor);
    if (entry.isSymbolicLink()) {
      throw new Error(`Source path contains a symlink: ${sourcePath}`);
    }
    if (index === segments.length - 1 && !entry.isFile()) {
      throw new Error(`Source path is not a regular file: ${sourcePath}`);
    }
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const descriptor = openSync(
    fullPath,
    constants.O_RDONLY | noFollow | constants.O_NONBLOCK,
  );
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile()) {
      throw new Error(`Source path is not a regular file: ${sourcePath}`);
    }
    if (before.size > maxBytes) {
      throw new Error(`Source file exceeds ${maxBytes} bytes: ${sourcePath}`);
    }

    const openedRealPath = realpathSync(fullPath);
    const openedEntry = statSync(fullPath);
    if (
      !isWithin(root, openedRealPath)
      || openedEntry.dev !== before.dev
      || openedEntry.ino !== before.ino
    ) {
      throw new Error(`Source path changed while being opened: ${sourcePath}`);
    }
    cursor = root;
    for (const segment of segments) {
      cursor = join(cursor, segment);
      if (lstatSync(cursor).isSymbolicLink()) {
        throw new Error(`Source path contains a symlink: ${sourcePath}`);
      }
    }

    const buffer = Buffer.alloc(before.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(descriptor, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > maxBytes) {
      throw new Error(`Source file exceeds ${maxBytes} bytes: ${sourcePath}`);
    }
    const bytes = buffer.subarray(0, length);

    const after = fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino) {
      throw new Error(`Source file changed while being read: ${sourcePath}`);
    }

    return {
      path: sourcePath,
      realPath: openedRealPath,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    closeSync(descriptor);
  }
}

export function referencedSourcePaths(manifest) {
  const paths = [];
  const add = (value) => {
    if (value !== undefined) paths.push(validateSourcePath(value));
  };

  add(manifest?.hosts?.ai?.persona);
  for (const path of manifest?.guide?.ask?.knowledge ?? []) add(path);
  for (const concept of manifest?.concepts ?? []) add(concept.tell);
  for (const action of manifest?.actions ?? []) {
    add(action.input_schema);
    add(action.output_schema);
  }
  for (const store of manifest?.data_stores ?? []) {
    add(store.export);
    add(store.erase);
  }
  add(manifest?.legal?.privacy_source);
  add(manifest?.legal?.terms_source);

  return [...new Set(paths)].sort(compareUtf16);
}

function asBytes(value, sourcePath) {
  const bytes = value?.bytes ?? value;
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`readFile must return bytes for ${sourcePath}`);
  }
  return bytes;
}

export async function contractSha256(manifest, readFile) {
  if (typeof readFile !== "function") {
    throw new TypeError("readFile must be a function");
  }

  const manifestSnapshot = JSON.parse(canonicalize(manifest));
  const files = {};
  for (const sourcePath of referencedSourcePaths(manifestSnapshot)) {
    const bytes = asBytes(await readFile(sourcePath), sourcePath);
    files[sourcePath] = createHash("sha256").update(bytes).digest("hex");
  }

  return createHash("sha256")
    .update(canonicalize({ manifest: manifestSnapshot, files }), "utf8")
    .digest("hex");
}

export { manifestSchema, lockSchema };
