import { createRandomUuid } from "./createRandomUuid";
import { clearCreateFlowResumedLocalDraft } from "./draftEntryGate";
import { clearFreshCreateLeaveBaseline } from "./createFlowFreshLeaveBaseline";
import { dispatchCreateFlowDraftContentChanged } from "./createFlowLeaveRequest";
import { EDIT_POST_DATA_KEY } from "./editPostBootstrap";
import type { DraftVideo } from "./createDraftVideo/types";
import type { DraftImage } from "./createDraftImage/types";
import { readDraftVideoMeta } from "./createDraftVideo/draftVideoMeta";
import { scheduleDraftVideoDiscardCleanup } from "./createDraftVideo/discardCleanup";
import { readDraftImagesMeta } from "./createDraftImage/draftImageMeta";
import { scheduleDraftImageDiscardCleanup } from "./createDraftImage/discardCleanup";
import type {
  DraftImageClientIdMap,
  DraftMediaOrderItem,
} from "./createDraftMediaOrder";

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
  /** Pending Start Time when no concrete dates are selected yet (V4 schedule sheet). */
  pendingStartTime?: { hours: number; minutes: number } | null;
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
  /** V3G0 local-first draft video metadata (bytes in IDB / native FS). */
  draftVideo?: DraftVideo;
  /**
   * LI1A local-first draft images (bytes in IDB / native FS).
   * Optional — legacy drafts without this field remain valid.
   */
  draftImages?: DraftImage[];
  /** Auth user id (`session.user.id`) that owns this local create draft */
  ownerUserId?: string;
  /** V4 create flow: persisted Place/Event choice (survives Place→Event conversion). */
  createPostType?: "hangout" | "experience";
  /** PASS C1: stable local media order (images + at most one video). */
  mediaOrder?: DraftMediaOrderItem[];
  /** PASS C1: storage URL → stable image clientId map. */
  imageMediaClientIds?: DraftImageClientIdMap;
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

/** Stored create type when user converted Place→Event or resumed a typed draft. */
export function readDraftCreatePostType(): "hangout" | "experience" | null {
  const t = readDraftMetaRecord().createPostType;
  return t === "hangout" || t === "experience" ? t : null;
}

/** Persist canonical create type into draftMeta (new create only). */
export function persistDraftCreatePostType(
  type: "hangout" | "experience",
): void {
  if (isEditModeActive()) return;
  const prev = readDraftMetaRecord();
  writeDraftMetaRecord({ ...prev, createPostType: type });
  notifyLocalDraftPersisted();
}

function writeDraftMetaRecord(meta: DraftMeta): void {
  localStorage.setItem(DRAFT_META_KEY, JSON.stringify(meta));
}

/** Returns `draftMeta.ownerUserId` when set, else null. */
export function readDraftOwnerUserId(): string | null {
  const owner = readDraftMetaRecord().ownerUserId;
  return typeof owner === "string" && owner.trim() ? owner.trim() : null;
}

/**
 * True when local create draft data exists and `draftMeta.ownerUserId` matches `userId`.
 * Missing or mismatched owner → false (privacy-first; ownerless drafts are not owned).
 */
export function isLocalCreateDraftOwnedBy(userId: string): boolean {
  if (!userId || !hasAnyDraftData()) return false;
  const owner = readDraftOwnerUserId();
  if (!owner) return false;
  return owner === userId;
}

/**
 * Authoritative new-create publish guard. Throws before any post INSERT/RPC when the
 * stored draft is missing an owner or belongs to another account.
 */
export function assertLocalCreateDraftOwnedBy(userId: string): void {
  if (!userId) {
    throw new Error("Not authenticated");
  }
  if (!hasAnyDraftData()) {
    throw new Error(
      "Missing draft data. Leave and re-enter the create flow, then try again."
    );
  }
  const owner = readDraftOwnerUserId();
  if (!owner || owner !== userId) {
    throw new Error(
      "This draft belongs to another account. Leave and start a new post."
    );
  }
}

function isEditModeActive(): boolean {
  try {
    return localStorage.getItem(EDIT_POST_DATA_KEY) !== null;
  } catch {
    return false;
  }
}

/** True when owner/admin Edit draft (`editPostData`) is active — not NEW Create. */
export function isCreateEditModeActive(): boolean {
  return isEditModeActive();
}

/**
 * Owner Edit: existing `editPostData.postId` is the draft/upload scope id
 * (durable local video + bunny-upload-init edit_staging). Never mint a new UUID.
 */
function resolveOwnerEditPublishPostId(
  ownerUserId?: string,
): string | null {
  try {
    const raw = localStorage.getItem(EDIT_POST_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { postId?: unknown };
    const postId =
      typeof parsed?.postId === "string" ? parsed.postId.trim() : "";
    if (!isPublishPostIdShape(postId)) return null;

    const prev = readDraftMetaRecord();
    const next: DraftMeta = { ...prev, publishPostId: postId };
    if (ownerUserId) {
      next.ownerUserId = ownerUserId;
    }
    if (
      prev.publishPostId !== postId ||
      (ownerUserId && prev.ownerUserId !== ownerUserId)
    ) {
      writeDraftMetaRecord(next);
    }
    return postId;
  } catch {
    return null;
  }
}

/**
 * Ensures a stable publish UUID for the current local create draft.
 * Owner Edit: returns existing {@link EDIT_POST_DATA_KEY} postId (synced into draftMeta).
 */
export function ensureDraftPublishPostId(options?: {
  fresh?: boolean;
  /** Set on fresh draft init; preserved on resume via spread merge. */
  ownerUserId?: string;
}): string | null {
  if (isEditModeActive()) {
    // Never invent a second post id for Edit — use the published post id.
    return resolveOwnerEditPublishPostId(options?.ownerUserId);
  }

  try {
    const prev = readDraftMetaRecord();
    const fresh = options?.fresh === true;

    if (!fresh && isPublishPostIdShape(prev.publishPostId)) {
      return prev.publishPostId!;
    }

    const publishPostId = createRandomUuid();
    const next: DraftMeta = { ...prev, publishPostId };
    if (options?.ownerUserId) {
      next.ownerUserId = options.ownerUserId;
    }
    writeDraftMetaRecord(next);
    return publishPostId;
  } catch {
    return null;
  }
}

/**
 * Discards any existing local create draft and initializes a fresh owned draft with a new publishPostId.
 */
export function prepareFreshOwnedCreateDraft(
  ownerUserId: string,
  createPostType?: "hangout" | "experience",
): string | null {
  if (!ownerUserId) return null;
  discardAllDrafts();
  const publishPostId = ensureDraftPublishPostId({
    fresh: true,
    ownerUserId,
  });
  if (createPostType) {
    const prev = readDraftMetaRecord();
    writeDraftMetaRecord({ ...prev, createPostType, ownerUserId });
    touchDraftSavedAt();
  }
  return publishPostId;
}

/**
 * Returns draftMeta.publishPostId when valid, else null (legacy paths without Phase 2 id).
 * Owner Edit: returns the published post id from edit bootstrap (same as upload scope).
 */
export function readDraftPublishPostId(): string | null {
  if (isEditModeActive()) {
    return resolveOwnerEditPublishPostId();
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
    const publishPostId = readDraftPublishPostId();
    const draftVideo = readDraftVideoMeta();
    const draftImages = readDraftImagesMeta();
    let userId: string | null = null;
    try {
      const meta = readDraftMetaRecord();
      if (typeof meta.ownerUserId === "string" && meta.ownerUserId.trim()) {
        userId = meta.ownerUserId.trim();
      } else {
        userId = localStorage.getItem("my_user_id");
      }
    } catch {
      userId = null;
    }
    scheduleDraftVideoDiscardCleanup({ publishPostId, draftVideo });
    scheduleDraftImageDiscardCleanup({ publishPostId, draftImages, userId });
    DRAFT_KEYS.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(DRAFT_SAVED_AT_KEY);
    clearDraftDirty();
    clearCreateFlowResumedLocalDraft();
    clearFreshCreateLeaveBaseline();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LOCAL_DRAFT_DISCARDED_EVENT));
    }
  } catch {}
}

/**
 * Owner Edit Exit/Discard: clear local Edit DraftVideo + edit bootstrap.
 * Never detaches/deletes attached published post_media.
 * Local bytes only — unattached remote staging GC is a separate backend concern.
 */
export function discardOwnerPublishedEditLocalState(): void {
  try {
    let publishPostId: string | null = null;
    try {
      const raw = localStorage.getItem(EDIT_POST_DATA_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { postId?: unknown };
        const id =
          typeof parsed?.postId === "string" ? parsed.postId.trim() : "";
        publishPostId = id || null;
      }
    } catch {
      publishPostId = null;
    }

    const draftVideo = readDraftVideoMeta();
    const localDraft =
      draftVideo &&
      typeof draftVideo.localId === "string" &&
      !draftVideo.localId.startsWith("published-ref:")
        ? draftVideo
        : null;

    void (async () => {
      try {
        const { cancelActiveDraftVideoPreparation } = await import(
          "./createDraftVideo/draftVideoPreparationController"
        );
        await cancelActiveDraftVideoPreparation("discard");
      } catch {
        /* best-effort */
      }
      try {
        const { cleanupDraftVideoAssets } = await import("./createDraftVideo");
        await cleanupDraftVideoAssets({
          publishPostId,
          draftVideo: localDraft,
        });
      } catch (err) {
        console.warn("[drafts] edit discard local video cleanup failed", err);
      }
    })();

    DRAFT_KEYS.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(DRAFT_SAVED_AT_KEY);
    clearDraftDirty();
    clearCreateFlowResumedLocalDraft();
    clearFreshCreateLeaveBaseline();
    localStorage.removeItem(EDIT_POST_DATA_KEY);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LOCAL_DRAFT_DISCARDED_EVENT));
    }
  } catch {
    try {
      localStorage.removeItem(EDIT_POST_DATA_KEY);
    } catch {
      /* ignore */
    }
  }
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
  dispatchCreateFlowDraftContentChanged();
}

/**
 * Call when opening Create (chooser or /create): migrate timestamp, remove draft if expired.
 * @returns true if an expired draft was cleared
 */
export function runCreateEntryDraftCleanup(): boolean {
  return clearExpiredDraftIfNeeded();
}
