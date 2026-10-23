/**
 * Rewrites JSON Schema $ref pointers so a schema file can be embedded under
 * OpenAPI components without dangling #/$defs references.
 */
export function embedSchemaForOpenApi(schema, componentName) {
  const rootPointer = `#/components/schemas/${componentName}`;
  return rewriteNode(schema, rootPointer);
}

function rewriteNode(node, rootPointer) {
  if (node === null || typeof node !== "object") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => rewriteNode(item, rootPointer));
  }
  if (typeof node.$ref === "string") {
    return { $ref: rewriteRef(node.$ref, rootPointer) };
  }
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = rewriteNode(value, rootPointer);
  }
  return out;
}

function rewriteRef(ref, rootPointer) {
  if (!ref.startsWith("#")) {
    throw new Error(`external $ref is not supported in action schemas: ${ref}`);
  }
  if (ref.startsWith("#/components/schemas/")) {
    return ref;
  }
  const localSuffix = ref.slice(1);
  return `${rootPointer}${localSuffix}`;
}

export function resolveJsonPointer(root, pointer) {
  if (!pointer.startsWith("#/")) {
    throw new Error(`expected JSON pointer, got ${pointer}`);
  }
  const segments = pointer
    .slice(2)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current = root;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      throw new Error(`pointer ${pointer} does not resolve`);
    }
    current = current[segment];
  }
  return current;
}
