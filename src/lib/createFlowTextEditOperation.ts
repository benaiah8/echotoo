/**
 * Classify browser text edits for Finalize composer Undo/Redo grouping.
 * Groups are keyed by field + operation kind (insert / delete / replace).
 */

export type TextEditOperationKind = "insert" | "delete" | "replace";

const DELETE_INPUT_TYPES = new Set([
  "deleteContentBackward",
  "deleteContentForward",
  "deleteWordBackward",
  "deleteWordForward",
  "deleteSoftLineBackward",
  "deleteSoftLineForward",
  "deleteHardLineBackward",
  "deleteHardLineForward",
  "deleteByCut",
  "deleteByDrag",
]);

const REPLACE_INPUT_TYPES = new Set([
  "insertFromPaste",
  "insertReplacementText",
  "insertFromDrop",
  "insertFromYank",
]);

/** Map `InputEvent.inputType` to a coarse operation kind; null = ignore (e.g. historyUndo). */
export function classifyTextInputType(
  inputType: string
): TextEditOperationKind | null {
  if (!inputType) return null;
  if (inputType === "historyUndo" || inputType === "historyRedo") {
    return null;
  }
  if (DELETE_INPUT_TYPES.has(inputType) || inputType.startsWith("delete")) {
    return "delete";
  }
  if (REPLACE_INPUT_TYPES.has(inputType)) {
    return "replace";
  }
  if (inputType.startsWith("insert")) {
    return "insert";
  }
  return null;
}

/** Fallback when `inputType` is missing (older WebViews). */
export function inferTextEditOperationKind(
  prev: string,
  next: string
): TextEditOperationKind {
  if (next.length < prev.length) return "delete";
  if (next.length > prev.length) return "insert";
  if (next !== prev) return "replace";
  return "insert";
}

export function textEditGroupKey(
  fieldId: string,
  operation: TextEditOperationKind
): string {
  return `${fieldId}:${operation}`;
}
