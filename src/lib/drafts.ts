import { clearCreateFlowResumedLocalDraft } from "./draftEntryGate";
import { EDIT_POST_DATA_KEY } from "./editPostBootstrap";

export const DRAFT_META_KEY = "draftMeta";

export const DRAFT_KEYS = ["draftMeta", "draftActivities", "draftCategories"];

/** Shared local create draft metadata (finalize + legacy wizard pages). */
export type DraftMeta = {
  caption?: string;
  tags?: string[];
  visibility?: "public" | "friends" | "anonymous";
  rsvpCapacity?: number | null | "";
  rsvpEnabled?: boolean;
  selectedDates?: string[];
  isRecurring?: boolean;
  recurrenceDays?: string[];
  ratingEnabled?: boolean;
  /** Legacy title step fields */
  duration?: string;
  durationNotes?: string;
  /** Legacy categories compact section */
  title?: string;
  description?: string;
  /** Legacy preview anonymous fields */
  anonymousName?: string;
  anonymousAvatar?: string;
  /** Stable client id for Phase 3 owner_create_post idempotency */
  publishPostId?: string;
};

const UUID_V4ISH =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPublishPostIdShape(value: unknown): value is string {
  return typeof value === "string" && UUID_V4ISH.test(value.trim());
}

function readDraftMetaRecord(): DraftMeta {
  try {
    const raw = localStorage.getItem(DRAFT_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as DraftMeta) : {};
  } catch {
    return {};
  }
}

function writeDraftMetaRecord(meta: DraftMeta): void {
  localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta));
}

function isEditModeActive(): boolean {
  try {
    return localStorage.getItem(EDIT_POST_DATA_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Ensures a stable publish UUID for the current local create draft.
 * Never used in owner/admin edit mode ({@link EDIT_POST_DATA_KEY} present).
 */
export function ensureDraftPublishPostId(options?: {
  fresh?: boolean;
}): string | null {
  if (isEditModeActive()) {
    return null;
  }

  try {
    const prev = readDraftMetaRecord();
    const fresh = options?.fresh === true;

    if (!fresh && isPublishPostIdShape(prev.publishPostId)) {
      return prev.publishPostId!;
    }

    const publishPostId = crypto.randomUUID();
    writeDraftMetaRecord({ ...prev, publishPostId });
    return publishPostId;
  } catch {
    return null;
  }
}

/**
 * Returns draftMeta.publishPostId when valid, else null (legacy paths without Phase 2 id).
 */
export function readDraftPublishPostId(): string | null {
  if (isEditModeActive()) {
    return null;
  }
  try {
    const prev = readDraftMetaRecord();
    if (isPublishPostIdShape(prev.publishPostId)) {
      return prev.publishPostId!;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Strict publish id for atomic owner_create_post. Throws if missing/invalid — never generates a new UUID.
 */
export function getDraftPublishPostIdForPublish(): string {
  const id = readDraftPublishPostId();
  if (!id) {
    throw new Error(
      "Missing publish id for this draft. Leave and re-enter the create flow, then try again."
    );
  }
  return id;
}

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
/** ISO timestamp for local draft TTL (not used for server drafts). */
export const DRAFT_SAVED_AT_KEY = "draftSavedAt";

/** Seven days — local create draft expiration. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Dispatched after {@link discardAllDrafts} so UI (e.g. profile draft card) can refresh. */
export const LOCAL_DRAFT_DISCARDED_EVENT = "local-draft:discarded";

export function discardAllDrafts() {
  try {
    DRAFT_KEYS.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(DRAFT_SAVED_AT_KEY);
    clearDraftDirty();
    clearCreateFlowResumedLocalDraft();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LOCAL_DRAFT_DISCARDED_EVENT));
    }
  } catch {}
}

/** If draft data exists but no timestamp (legacy), stamp now so users are not expired on first gate. */
export function migrateDraftSavedAtIfMissing(): void {
  try {
    if (!hasAnyDraftData()) return;
    if (localStorage.getItem(DRAFT_SAVED_AT_KEY)) return;
    localStorage.setItem(DRAFT_SAVED_AT_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/**
 * If saved draft is older than {@link DRAFT_TTL_MS}, clears all local draft keys.
 * @returns true if an expired draft was cleared
 */
export function clearExpiredDraftIfNeeded(): boolean {
  try {
    migrateDraftSavedAtIfMissing();
    const raw = localStorage.getItem(DRAFT_SAVED_AT_KEY);
    if (!raw) return false;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return false;
    if (Date.now() - t <= DRAFT_TTL_MS) return false;
    discardAllDrafts();
    return true;
  } catch {
    return false;
  }
}

/** Call after persisting draft keys in create mode so TTL reflects last activity. */
export function touchDraftSavedAt(): void {
  try {
    if (!hasAnyDraftData()) return;
    localStorage.setItem(DRAFT_SAVED_AT_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/**
 * Call after any create-mode write to draftMeta / draftActivities / draftCategories
 * so leave-confirm and TTL stay consistent.
 */
export function notifyLocalDraftPersisted(): void {
  markDraftDirty();
  touchDraftSavedAt();
}

/**
 * Call when opening Create (chooser or /create): migrate timestamp, remove draft if expired.
 * @returns true if an expired draft was cleared
 */
export function runCreateEntryDraftCleanup(): boolean {
  return clearExpiredDraftIfNeeded();
}
