import { EDIT_POST_DATA_KEY } from "./editPostBootstrap";
import { isCreateFlowResumedLocalDraft } from "./draftEntryGate";
import {
  buildFreshCreateLeaveBaseline,
  clearFreshCreateLeaveBaseline,
  type FreshCreateLeaveBaseline,
  readFreshCreateLeaveBaseline,
  defaultRatingEnabledForCreatePostType,
} from "./createFlowFreshLeaveBaseline";
import {
  DRAFT_META_KEY,
  discardAllDrafts,
  type DraftMeta,
} from "./drafts";
import {
  hasMeaningfulActivityContent,
  type MeaningfulActivityInput,
} from "./createFlowMeaningfulActivity";
import { isV4Section, isV4SectionMeaningful } from "./createFlowV4Section";

export type { FreshCreateLeaveBaseline };
export {
  buildFreshCreateLeaveBaseline,
  clearFreshCreateLeaveBaseline,
  establishFreshCreateLeaveBaseline,
  readFreshCreateLeaveBaseline,
  defaultRatingEnabledForCreatePostType,
  FRESH_CREATE_LEAVE_BASELINE_KEY,
} from "./createFlowFreshLeaveBaseline";

const DRAFT_ACTIVITIES_KEY = "draftActivities";

function readDraftMeta(): DraftMeta {
  try {
    const raw = localStorage.getItem(DRAFT_META_KEY);
    if (!raw || raw === "{}") return {};
    return JSON.parse(raw) as DraftMeta;
  } catch {
    return {};
  }
}

function readDraftActivities(): MeaningfulActivityInput[] {
  try {
    const raw = localStorage.getItem(DRAFT_ACTIVITIES_KEY);
    if (!raw || raw === "[]") return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as MeaningfulActivityInput[]) : [];
  } catch {
    return [];
  }
}

function coerceDraftVisibility(
  v: DraftMeta["visibility"],
): "public" | "friends" {
  return String(v || "public").toLowerCase() === "friends"
    ? "friends"
    : "public";
}

function resolveDraftCreatePostType(
  meta: DraftMeta,
  fallback: "hangout" | "experience" = "experience",
): "hangout" | "experience" {
  if (meta.createPostType === "hangout" || meta.createPostType === "experience") {
    return meta.createPostType;
  }
  return fallback;
}

function resolveDraftRatingEnabled(
  meta: DraftMeta,
  postType: "hangout" | "experience",
): boolean {
  if (typeof meta.ratingEnabled === "boolean") return meta.ratingEnabled;
  return defaultRatingEnabledForCreatePostType(postType);
}

/** Selected local media in draftMeta (images / video / ordered items). */
function hasMeaningfulDraftMedia(meta: DraftMeta): boolean {
  if (Array.isArray(meta.draftImages) && meta.draftImages.length > 0) {
    return true;
  }
  if (meta.draftVideo && typeof meta.draftVideo === "object") {
    const localId = String(
      (meta.draftVideo as { localId?: unknown }).localId ?? "",
    ).trim();
    if (localId) return true;
  }
  if (Array.isArray(meta.mediaOrder) && meta.mediaOrder.length > 0) {
    return true;
  }
  return false;
}

/**
 * User content / saved schedule — not default settings.
 * Uncommitted picker working copies never reach draftMeta.
 */
export function hasMeaningfulCreateDraftContent(
  meta: DraftMeta,
  activities: MeaningfulActivityInput[] = [],
): boolean {
  if (String(meta.caption ?? "").trim()) return true;

  if (Array.isArray(meta.tags) && meta.tags.some((t) => String(t).trim())) {
    return true;
  }

  if (Array.isArray(meta.selectedDates) && meta.selectedDates.length > 0) {
    return true;
  }

  if (meta.isRecurring) return true;

  if (Array.isArray(meta.recurrenceDays) && meta.recurrenceDays.length > 0) {
    return true;
  }

  const pending = meta.pendingStartTime;
  if (
    pending != null &&
    typeof pending === "object" &&
    typeof pending.hours === "number" &&
    typeof pending.minutes === "number"
  ) {
    return true;
  }

  if (String(meta.title ?? "").trim()) return true;
  if (String(meta.description ?? "").trim()) return true;
  if (String(meta.duration ?? "").trim()) return true;
  if (String(meta.durationNotes ?? "").trim()) return true;

  if (hasMeaningfulDraftMedia(meta)) return true;

  if (activities.some((a) => isV4Section(a) && isV4SectionMeaningful(a))) {
    return true;
  }

  return hasMeaningfulActivityContent(activities);
}

export function hasCreateDraftSettingsDriftFromBaseline(
  meta: DraftMeta,
  baseline: FreshCreateLeaveBaseline,
): boolean {
  if (coerceDraftVisibility(meta.visibility) !== baseline.visibility) {
    return true;
  }

  const postType = resolveDraftCreatePostType(meta, baseline.createPostType);
  if (postType !== baseline.createPostType) return true;

  if (resolveDraftRatingEnabled(meta, postType) !== baseline.ratingEnabled) {
    return true;
  }

  if ((meta.rsvpEnabled === true) !== baseline.rsvpEnabled) return true;

  return false;
}

function impliedFreshBaselineFromMeta(meta: DraftMeta): FreshCreateLeaveBaseline {
  const createPostType = resolveDraftCreatePostType(meta, "experience");
  return buildFreshCreateLeaveBaseline({
    publishPostId:
      typeof meta.publishPostId === "string" ? meta.publishPostId : null,
    createPostType,
    visibility: "public",
    ratingEnabled: defaultRatingEnabledForCreatePostType(createPostType),
    rsvpEnabled: false,
  });
}

/**
 * True when Create entry should show Continue draft / Start new.
 * Scaffolding-only owned shells (publishPostId / owner / type) do not qualify —
 * reuse the same meaningful-content + settings-drift rules as leave confirm
 * (without resume/edit always-on flags; those belong to leave, not entry).
 */
export function shouldOfferCreateDraftEntryDialog(): boolean {
  try {
    const meta = readDraftMeta();
    const activities = readDraftActivities();

    if (hasMeaningfulCreateDraftContent(meta, activities)) return true;

    const baseline =
      readFreshCreateLeaveBaseline() ?? impliedFreshBaselineFromMeta(meta);

    return hasCreateDraftSettingsDriftFromBaseline(meta, baseline);
  } catch {
    return false;
  }
}

/**
 * True when leaving `/create/*` should show Save draft / Discard / Stay.
 * Fresh untouched composers (defaults only) do not confirm.
 * Resumed local drafts and published edits always confirm.
 */
export function shouldConfirmCreateFlowLeave(): boolean {
  try {
    if (localStorage.getItem(EDIT_POST_DATA_KEY)) return true;

    // Explicit Continue draft — always protect, even if currently empty-looking.
    if (isCreateFlowResumedLocalDraft()) return true;

    return shouldOfferCreateDraftEntryDialog();
  } catch {
    return false;
  }
}

/**
 * When a fresh session exits without confirmation, remove scaffolding-only
 * local draft keys for that session. Never runs for resume/edit, never when
 * leave should confirm, and never when publishPostId does not match baseline.
 *
 * @returns true if local draft keys were discarded
 */
export function cleanupEmptyFreshCreateDraftIfNeeded(): boolean {
  try {
    if (localStorage.getItem(EDIT_POST_DATA_KEY)) return false;
    if (isCreateFlowResumedLocalDraft()) return false;
    if (shouldConfirmCreateFlowLeave()) return false;

    const meta = readDraftMeta();
    const activities = readDraftActivities();
    if (hasMeaningfulCreateDraftContent(meta, activities)) return false;

    const baseline = readFreshCreateLeaveBaseline();
    if (baseline) {
      if (hasCreateDraftSettingsDriftFromBaseline(meta, baseline)) {
        return false;
      }
      const currentId =
        typeof meta.publishPostId === "string" ? meta.publishPostId.trim() : "";
      if (
        baseline.publishPostId &&
        currentId &&
        currentId !== baseline.publishPostId
      ) {
        return false;
      }
    } else if (
      hasCreateDraftSettingsDriftFromBaseline(
        meta,
        impliedFreshBaselineFromMeta(meta),
      )
    ) {
      return false;
    }

    const rawMeta = localStorage.getItem(DRAFT_META_KEY);
    const rawActs = localStorage.getItem(DRAFT_ACTIVITIES_KEY);
    const hasScaffolding =
      (rawMeta != null && rawMeta !== "{}" && rawMeta.trim() !== "") ||
      (rawActs != null && rawActs !== "[]" && rawActs.trim() !== "") ||
      localStorage.getItem("draftCategories") != null;

    if (!hasScaffolding) {
      clearFreshCreateLeaveBaseline();
      return false;
    }

    discardAllDrafts();
    return true;
  } catch {
    return false;
  }
}
