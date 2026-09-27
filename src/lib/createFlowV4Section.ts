/**
 * V4 Finalize Sections — body-only rows marked activity_type V4Section.
 * Stored in activities.section_body; max 5 sections × 800 chars.
 */
import { arrayMove } from "@dnd-kit/sortable";
import { extractV4KeyInfoValues } from "./createFlowV4KeyInfo";
import type { MeaningfulActivityInput } from "./createFlowMeaningfulActivity";

export const V4_SECTION_ACTIVITY_TYPE = "V4Section";
export const V4_SECTION_MAX = 5;
export const V4_SECTION_BODY_MAX = 800;

let v4SectionClientIdCounter = 0;

export type V4SectionActivityLike = {
  activityType?: string;
  sectionBody?: string;
  v4SectionClientId?: string;
};

export function createV4SectionClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `v4sec_${crypto.randomUUID()}`;
  }
  v4SectionClientIdCounter += 1;
  return `v4sec_${Date.now()}_${v4SectionClientIdCounter}`;
}

export function getV4SectionClientId(
  activity: V4SectionActivityLike
): string | null {
  const id = (activity.v4SectionClientId ?? "").trim();
  return id.length > 0 ? id : null;
}

/** Assign a draft-only client id when missing (hydrate / legacy rows). */
export function ensureV4SectionClientId<T extends V4SectionActivityLike>(
  activity: T
): T {
  if (!isV4Section(activity)) return activity;
  if (getV4SectionClientId(activity)) return activity;
  return { ...activity, v4SectionClientId: createV4SectionClientId() };
}

export function findV4SectionDraftIndexByClientId<
  T extends V4SectionActivityLike,
>(activities: readonly T[], clientId: string): number {
  return activities.findIndex(
    (activity) =>
      isV4Section(activity) && getV4SectionClientId(activity) === clientId
  );
}

export function findV4SectionDisplayIndexByClientId<
  T extends V4SectionActivityLike,
>(activities: readonly T[], clientId: string): number {
  return listV4SectionDraftIndices(activities).findIndex(
    (draftIndex) =>
      getV4SectionClientId(activities[draftIndex]!) === clientId
  );
}

export function isV4Section(activity: V4SectionActivityLike): boolean {
  return (activity.activityType ?? "").trim() === V4_SECTION_ACTIVITY_TYPE;
}

export function clampV4SectionBody(raw: string): string {
  if (raw.length <= V4_SECTION_BODY_MAX) return raw;
  return raw.slice(0, V4_SECTION_BODY_MAX);
}

/** Trim ends only; preserve internal newlines for publish/commit. */
export function sanitizeV4SectionBodyForCommit(raw: string): string {
  return clampV4SectionBody(raw.trim());
}

export function isV4SectionMeaningful(activity: V4SectionActivityLike): boolean {
  if (!isV4Section(activity)) return false;
  return (activity.sectionBody ?? "").trim().length > 0;
}

export function countV4Sections(
  activities: readonly V4SectionActivityLike[]
): number {
  return activities.filter(isV4Section).length;
}

/** Slot 0 post-level carrier content (persist-worthy, not legacy Activity identity). */
export function hasV4Slot0CarrierContent(
  activity: MeaningfulActivityInput
): boolean {
  if ((activity.images?.length ?? 0) > 0) return true;
  if ((activity.location ?? "").trim()) return true;
  if ((activity.locationUrl ?? "").trim()) return true;
  if ((activity.locationNotes ?? "").trim()) return true;
  if ((activity.locationDesc ?? "").trim()) return true;
  if (extractV4KeyInfoValues(activity.additionalInfo).length > 0) return true;
  return false;
}

export function createEmptyV4SectionActivity(seedTitle: string) {
  return {
    title: seedTitle,
    activityType: V4_SECTION_ACTIVITY_TYPE,
    customActivity: "",
    locationDesc: "",
    tags: [] as string[],
    location: "",
    locationNotes: "",
    locationUrl: "",
    images: [] as string[],
    additionalInfo: [] as { title: string; value: string }[],
    sectionBody: "",
    v4SectionClientId: createV4SectionClientId(),
  };
}

export function appendV4SectionToActivities<
  T extends V4SectionActivityLike & { title?: string },
>(activities: readonly T[], seedTitlePrefix = "Stop"): T[] {
  if (countV4Sections(activities) >= V4_SECTION_MAX) return [...activities];
  const insertAt = getAppendV4SectionIndex(activities);
  return insertV4SectionAt(activities, insertAt, seedTitlePrefix);
}

/** Index to insert a new V4Section after the last existing Section row. */
export function getAppendV4SectionIndex(
  activities: readonly V4SectionActivityLike[]
): number {
  const sectionIndices = listV4SectionDraftIndices(activities);
  if (sectionIndices.length === 0) return activities.length;
  return sectionIndices[sectionIndices.length - 1]! + 1;
}

/** First whitespace-only V4Section client id in display order, if any. */
export function findEmptyV4SectionClientId(
  activities: readonly V4SectionActivityLike[]
): string | null {
  for (const draftIndex of listV4SectionDraftIndices(activities)) {
    const activity = activities[draftIndex]!;
    if (!sanitizeV4SectionBodyForCommit(activity.sectionBody ?? "")) {
      return getV4SectionClientId(ensureV4SectionClientId(activity));
    }
  }
  return null;
}

/** Remove all whitespace-only V4Section rows; preserve every other row. */
export function removeEmptyV4Sections<T extends V4SectionActivityLike>(
  activities: readonly T[]
): T[] {
  return activities.filter(
    (activity) => !isV4Section(activity) || isV4SectionMeaningful(activity)
  );
}

/** @deprecated Insert context ignored — always appends after last V4Section. */
export type V4SectionInsertContext =
  | { kind: "caption" }
  | { kind: "section"; sectionClientId: string }
  | null;

/** Insert index for a new V4Section row within the full activities array. */
export function resolveV4SectionInsertIndex<
  T extends V4SectionActivityLike,
>(activities: readonly T[]): number {
  return getAppendV4SectionIndex(activities);
}

export function insertV4SectionAt<
  T extends V4SectionActivityLike & { title?: string },
>(
  activities: readonly T[],
  insertAt: number,
  seedTitlePrefix = "Stop"
): T[] {
  if (countV4Sections(activities) >= V4_SECTION_MAX) return [...activities];
  const seedTitle = `${seedTitlePrefix} ${activities.length + 1}`;
  const next = [...activities];
  const clampedAt = Math.max(0, Math.min(insertAt, next.length));
  next.splice(clampedAt, 0, createEmptyV4SectionActivity(seedTitle) as unknown as T);
  return next;
}

/** Draft indices of V4Section rows in display order. */
export function listV4SectionDraftIndices(
  activities: readonly V4SectionActivityLike[]
): number[] {
  return activities
    .map((activity, index) => (isV4Section(activity) ? index : -1))
    .filter((index) => index >= 0);
}

/**
 * Reorder V4Section rows by display index while keeping non-section rows fixed.
 * Only the content at each V4Section slot is permuted — draft indices stay put.
 */
export function reorderV4SectionsInActivities<
  T extends V4SectionActivityLike,
>(activities: readonly T[], fromDisplayIndex: number, toDisplayIndex: number): T[] {
  const sectionIndices = listV4SectionDraftIndices(activities);
  if (
    fromDisplayIndex < 0 ||
    toDisplayIndex < 0 ||
    fromDisplayIndex >= sectionIndices.length ||
    toDisplayIndex >= sectionIndices.length ||
    fromDisplayIndex === toDisplayIndex
  ) {
    return [...activities];
  }

  const sectionRows = sectionIndices.map((index) => activities[index]!);
  const reordered = arrayMove(sectionRows, fromDisplayIndex, toDisplayIndex);
  const next = [...activities] as T[];
  sectionIndices.forEach((draftIndex, displayIndex) => {
    next[draftIndex] = reordered[displayIndex]!;
  });
  return next;
}

export function reorderV4SectionsByClientId<T extends V4SectionActivityLike>(
  activities: readonly T[],
  activeClientId: string,
  overClientId: string
): T[] {
  const fromDisplay = findV4SectionDisplayIndexByClientId(
    activities,
    activeClientId
  );
  const toDisplay = findV4SectionDisplayIndexByClientId(
    activities,
    overClientId
  );
  return reorderV4SectionsInActivities(activities, fromDisplay, toDisplay);
}

export function moveV4SectionAtDisplayIndex<T extends V4SectionActivityLike>(
  activities: readonly T[],
  displayIndex: number,
  direction: "up" | "down"
): T[] {
  const delta = direction === "up" ? -1 : 1;
  return reorderV4SectionsInActivities(
    activities,
    displayIndex,
    displayIndex + delta
  );
}
