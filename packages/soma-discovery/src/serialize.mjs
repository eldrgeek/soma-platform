function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const sorted = {};
    for (const key of Object.keys(value).sort(compareUtf16)) {
      sorted[key] = sortValue(value[key]);
    }
    return sorted;
  }
  return value;
}

export function stableJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(sortValue(value), null, 2)}\n`, "utf8");
}

export function stableTextBytes(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.endsWith("\n")) {
    return Buffer.from(`${normalized}\n`, "utf8");
  }
  return Buffer.from(normalized, "utf8");
}
