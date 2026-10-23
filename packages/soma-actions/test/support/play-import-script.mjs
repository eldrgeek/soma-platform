/** PlayMaker import-script arg parsing (test / fixture parity only). */

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFileEntry(value) {
  if (!isRecord(value)) return null;
  const fileName = typeof value.fileName === "string" ? value.fileName : "";
  const text = typeof value.text === "string" ? value.text : "";
  if (!fileName.trim()) return null;
  return { fileName, text };
}

function parseNoteEntry(value) {
  if (!isRecord(value)) return null;
  const comment = typeof value.comment === "string" ? value.comment : "";
  if (!comment.trim()) return null;
  const page = typeof value.page === "number" && Number.isFinite(value.page) ? value.page : 0;
  const anchorQuote = value.anchorQuote === null
    ? null
    : typeof value.anchorQuote === "string"
      ? value.anchorQuote
      : null;
  return {
    sourceId: typeof value.sourceId === "string" ? value.sourceId : undefined,
    page,
    comment,
    author: value.author === null || typeof value.author === "string" ? value.author : undefined,
    anchorQuote,
    anchorParagraphIndex: typeof value.anchorParagraphIndex === "number"
      ? value.anchorParagraphIndex
      : undefined,
  };
}

export function parsePlayImportScriptArgs(args) {
  const files = Array.isArray(args.files)
    ? args.files.map(parseFileEntry).filter((entry) => Boolean(entry))
    : undefined;
  const notes = Array.isArray(args.notes)
    ? args.notes.map(parseNoteEntry).filter((entry) => Boolean(entry))
    : undefined;
  return {
    fileName: typeof args.fileName === "string" ? args.fileName : undefined,
    text: typeof args.text === "string" ? args.text : undefined,
    files: files && files.length > 0 ? files : undefined,
    notes: notes && notes.length > 0 ? notes : undefined,
  };
}

export function validatePlayImportScriptArgs(args) {
  const fileParts = args.files ?? [];
  const hasFiles = fileParts.length > 0;
  const hasText = Boolean(args.text?.trim());
  if (!hasFiles && !hasText) {
    return "Provide script text or at least one file.";
  }
  if (!hasFiles && hasText && !args.fileName?.trim()) {
    return "fileName is required when importing a single text payload.";
  }
  return null;
}

/**
 * @param {import('../../src/types.mjs').CommandSpec} spec
 * @param {Record<string, unknown>} args
 */
export function playmakerAfterSchemaValidate(spec, args) {
  if (spec.id === "play.importScript") {
    return validatePlayImportScriptArgs(parsePlayImportScriptArgs(args));
  }
  return null;
}
