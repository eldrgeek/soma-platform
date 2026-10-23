/**
 * @typedef {import('./types.mjs').ArgSchema} ArgSchema
 * @typedef {import('./types.mjs').CommandArgs} CommandArgs
 * @typedef {import('./types.mjs').CommandSpec} CommandSpec
 */

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @param {CommandSpec} spec
 * @param {CommandArgs} args
 * @param {(spec: CommandSpec, args: CommandArgs) => string | null} [afterSchema]
 * @returns {string | null}
 */
export function validateCommandArgs(spec, args, afterSchema) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return "Arguments must be an object.";
  }
  const schema = spec.args;
  for (const [name, def] of Object.entries(schema)) {
    const value = args[name];
    if ((value === undefined || value === null) && def.required) {
      return `Missing required argument: ${name}.`;
    }
    if (value === undefined || value === null) continue;
    if (def.type === "string") {
      if (typeof value !== "string") return `Argument "${name}" must be a string.`;
      if (def.enum && !def.enum.includes(value)) {
        return `Argument "${name}" must be one of: ${def.enum.join(", ")}.`;
      }
    } else if (def.type === "number") {
      if (!isFiniteNumber(value)) return `Argument "${name}" must be a finite number.`;
    } else if (def.type === "boolean") {
      if (typeof value !== "boolean") return `Argument "${name}" must be a boolean.`;
    } else if (def.type === "string[]") {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        return `Argument "${name}" must be an array of strings.`;
      }
    } else if (def.type === "array") {
      if (!Array.isArray(value)) return `Argument "${name}" must be an array.`;
    }
  }
  for (const key of Object.keys(args)) {
    if (!(key in schema)) return `Unknown argument: ${key}.`;
  }
  if (afterSchema) {
    const extra = afterSchema(spec, args);
    if (extra) return extra;
  }
  return null;
}

/**
 * @param {CommandSpec} spec
 * @returns {{
 *   type: 'object';
 *   additionalProperties: boolean;
 *   properties: Record<string, object>;
 *   required?: string[];
 * }}
 */
export function commandArgsJsonSchema(spec) {
  const properties = {};
  const required = [];
  for (const [name, arg] of Object.entries(spec.args)) {
    properties[name] = arg.type === "string[]"
      ? { type: "array", items: { type: "string" }, description: arg.description }
      : {
        type: arg.type,
        description: arg.description,
        ...(arg.enum ? { enum: arg.enum } : {}),
      };
    if (arg.required) required.push(name);
  }
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
