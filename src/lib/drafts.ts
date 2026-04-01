export const DRAFT_KEYS = ["draftMeta", "draftActivities", "draftCategories"];

/** Returns true if id is falsy, "draft", or "draft-*". Use to skip DB/RPC for draft previews. */
export function isDraftPostId(id?: string | null): boolean {
  return !id || id === "draft" || id.startsWith("draft-");
}
const DIRTY_FLAG = "draftDirty";

export function markDraftDirty() {
  try {
    localStorage.setItem(DIRTY_FLAG, "1");
  } catch {}
}
export function clearDraftDirty() {
  try {
    localStorage.removeItem(DIRTY_FLAG);
  } catch {}
}
export function isDraftDirty(): boolean {
  try {
    return localStorage.getItem(DIRTY_FLAG) === "1";
  } catch {
    return false;
  }
}
export function hasAnyDraftData(): boolean {
  try {
    return DRAFT_KEYS.some((k) => {
      const raw = localStorage.getItem(k);
      return !!raw && raw !== "[]" && raw !== "{}" && raw.trim() !== "";
    });
  } catch {
    return false;
  }
}
export function discardAllDrafts() {
  try {
    DRAFT_KEYS.forEach((k) => localStorage.removeItem(k));
    clearDraftDirty();
  } catch {}
}
