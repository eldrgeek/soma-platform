function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function remoteActions(manifest) {
  const actions = manifest?.actions ?? [];
  if (!Array.isArray(actions)) {
    throw new TypeError("manifest.actions must be an array");
  }
  return actions
    .filter((action) => Array.isArray(action.surfaces) && action.surfaces.includes("remote"))
    .sort((left, right) => compareUtf16(left.id, right.id));
}

function asBytes(value, sourcePath) {
  const bytes = value?.bytes ?? value;
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`readFile must return bytes for ${sourcePath}`);
  }
  return bytes;
}

export async function resolveRemoteActionSchemas(manifest, readFile) {
  if (typeof readFile !== "function") {
    throw new TypeError("readFile must be a function");
  }
  const resolved = [];
  for (const action of remoteActions(manifest)) {
    const inputPath = action.input_schema;
    const outputPath = action.output_schema;
    const inputBytes = asBytes(await readFile(inputPath), inputPath);
    const outputBytes = asBytes(await readFile(outputPath), outputPath);
    let inputSchema;
    let outputSchema;
    try {
      inputSchema = JSON.parse(inputBytes.toString("utf8"));
    } catch (error) {
      throw new Error(`action ${action.id} input_schema ${inputPath}: ${error.message}`);
    }
    try {
      outputSchema = JSON.parse(outputBytes.toString("utf8"));
    } catch (error) {
      throw new Error(`action ${action.id} output_schema ${outputPath}: ${error.message}`);
    }
    resolved.push({
      action,
      inputPath,
      outputPath,
      inputSchema,
      outputSchema,
    });
  }
  return resolved;
}

export function compileActionRecord({ action, inputPath, outputPath, inputSchema, outputSchema }) {
  const record = {
    id: action.id,
    version: action.version,
    kind: action.kind,
    required_scopes: [...action.required_scopes].sort(compareUtf16),
    required_role: action.required_role,
    effects: [...action.effects],
    input_schema_path: inputPath,
    output_schema_path: outputPath,
    input_schema: inputSchema,
    output_schema: outputSchema,
  };
  if (action.kind === "effect") {
    record.risk = action.risk;
  }
  if (typeof action.title === "string" && action.title.length > 0) {
    record.title = action.title;
  }
  if (typeof action.description === "string" && action.description.length > 0) {
    record.description = action.description;
  }
  return record;
}
