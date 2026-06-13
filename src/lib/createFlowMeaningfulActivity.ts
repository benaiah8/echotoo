import { visibleActivityTagLines } from "./createFlowLimitUtils";

/**
 * Detects whether create-flow draft activities contain real user content vs an untouched
 * seeded default stop (e.g. only "Stop 1" with empty fields). Used on Create post (finalize)
 * to avoid showing a fake "Stop 1" timeline when the user only opened Activities briefly.
 */

export type MeaningfulActivityInput = {
  title?: string;
  activityType?: string;
  customActivity?: string;
  locationDesc?: string;
  location?: string;
  locationNotes?: string;
  locationUrl?: string;
  tags?: string[];
  /** Already cleaned the same way as finalize / publish (http URLs, Cloudinary rules). */
  images?: string[];
  additionalInfo?: { title: string; value: string }[];
};

/** True when title is empty or matches the auto-generated "Stop n" for this index (seed / Next stop). */
export function isDefaultStopTitle(raw: string, stopIndex: number): boolean {
  const t = raw.trim().toLowerCase();
  if (!t) return true;
  return t === `stop ${stopIndex + 1}`;
}

const CHIP_LABEL_MAX = 14;

/**
 * Activities header chips: same resolution as before, but the first stop never shows literal
 * "Stop 1" until the user names it (draft data still uses seeded titles for stability).
 */
export function getActivityChipDisplayLabel(
  a: {
    title?: string;
    activityType?: string;
    customActivity?: string;
  },
  index: number
): string {
  let raw =
    (a.customActivity?.trim() ||
      a.activityType?.trim() ||
      a.title?.trim() ||
      `Stop ${index + 1}`) ??
    `Stop ${index + 1}`;

  const legacy = /^Activity\s+(\d+)$/i.exec(raw.trim());
  if (legacy) raw = `Stop ${legacy[1]}`;

  if (index === 0 && isDefaultStopTitle(raw, 0)) {
    raw = "Stop";
  }

  return raw.length > CHIP_LABEL_MAX
    ? raw.slice(0, CHIP_LABEL_MAX - 1) + "…"
    : raw;
}

/**
 * Finalize / read-only timeline when there are no tag lines: hide numeric "Stop 1" default.
 */
export function getTimelineStopHeadingText(
  resolvedTitle: string | null | undefined,
  index: number
): string {
  const t = (resolvedTitle || "").trim() || `Stop ${index + 1}`;
  if (index === 0 && isDefaultStopTitle(t, 0)) return "Stop";
  return t;
}

function hasMeaningfulExtras(
  additionalInfo: MeaningfulActivityInput["additionalInfo"]
): boolean {
  if (!Array.isArray(additionalInfo)) return false;
  return additionalInfo.some(
    (x) =>
      (x?.title ?? "").trim().length > 0 && (x?.value ?? "").trim().length > 0
  );
}

/**
 * Returns true when at least one activity has content worth showing in the finalize preview
 * timeline (images, location, tags, custom text, multiple stops, etc.).
 */
export function hasMeaningfulActivityContent(
  activities: MeaningfulActivityInput[]
): boolean {
  if (!activities.length) return false;
  if (activities.length > 1) return true;

  const a = activities[0];
  if ((a.images?.length ?? 0) > 0) return true;

  const title = (a.title ?? "").trim();
  if (title && !isDefaultStopTitle(title, 0)) return true;

  if ((a.customActivity ?? "").trim()) return true;
  if ((a.activityType ?? "").trim()) return true;
  if ((a.locationDesc ?? "").trim()) return true;
  if ((a.location ?? "").trim()) return true;
  if ((a.locationNotes ?? "").trim()) return true;
  if ((a.locationUrl ?? "").trim()) return true;

  const tags = Array.isArray(a.tags)
    ? a.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (tags.length > 0) return true;

  if (hasMeaningfulExtras(a.additionalInfo)) return true;

  return false;
}

/** True when any draft activity has place, maps link, notes, or legacy desc. */
export function hasAnyDraftActivityLocation(
  activities: MeaningfulActivityInput[]
): boolean {
  return activities.some((a) => {
    if ((a.location ?? "").trim()) return true;
    if ((a.locationUrl ?? "").trim()) return true;
    if ((a.locationNotes ?? "").trim()) return true;
    if ((a.locationDesc ?? "").trim()) return true;
    return false;
  });
}

/** Published / preview detail activity row (server shape). */
export type DetailTimelineActivity = {
  title?: string | null;
  images?: string[] | null;
  location_name?: string | null;
  location_desc?: string | null;
  location_url?: string | null;
  location_notes?: string | null;
  tags?: string[] | null;
  additional_info?: { title: string; value: string }[] | null;
};

export function toMeaningfulActivityInputFromDetail(
  a: DetailTimelineActivity
): MeaningfulActivityInput {
  return {
    title: a.title ?? undefined,
    images: Array.isArray(a.images) ? a.images : [],
    location: a.location_name ?? undefined,
    locationDesc: a.location_desc ?? undefined,
    locationUrl: a.location_url ?? undefined,
    locationNotes: a.location_notes ?? undefined,
    tags: Array.isArray(a.tags) ? a.tags.map(String) : [],
    additionalInfo: Array.isArray(a.additional_info) ? a.additional_info : [],
  };
}

/** Per-index meaningful check (matches publish filtering; display-only). */
export function isMeaningfulActivityAtIndex(
  activity: MeaningfulActivityInput,
  index: number
): boolean {
  if ((activity.images?.length ?? 0) > 0) return true;

  const title = (activity.title ?? "").trim();
  if (title && !isDefaultStopTitle(title, index)) return true;

  if ((activity.customActivity ?? "").trim()) return true;
  if ((activity.activityType ?? "").trim()) return true;
  if ((activity.locationDesc ?? "").trim()) return true;
  if ((activity.location ?? "").trim()) return true;
  if ((activity.locationNotes ?? "").trim()) return true;
  if ((activity.locationUrl ?? "").trim()) return true;

  const tags = Array.isArray(activity.tags)
    ? activity.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  if (tags.length > 0) return true;

  if (hasMeaningfulExtras(activity.additionalInfo)) return true;

  return false;
}

function hasLocationContent(activity: MeaningfulActivityInput): boolean {
  return (
    !!(activity.location ?? "").trim() ||
    !!(activity.locationUrl ?? "").trim() ||
    !!(activity.locationNotes ?? "").trim() ||
    !!(activity.locationDesc ?? "").trim()
  );
}

/**
 * True when the stop has location data but no user-authored stop identity
 * (default seeded title, no tag lines, no custom fields).
 */
export function isLocationOnlyDefaultStop(
  activity: MeaningfulActivityInput,
  index: number,
  visibleTagLineCount: number
): boolean {
  if (visibleTagLineCount > 0) return false;
  if (!hasLocationContent(activity)) return false;

  const title = (activity.title ?? "").trim();
  if (title && !isDefaultStopTitle(title, index)) return false;
  if ((activity.customActivity ?? "").trim()) return false;
  if ((activity.activityType ?? "").trim()) return false;

  return true;
}

/**
 * Suppress fake "Stop" / "Stop n" headings for placeholder stops that only carry location.
 */
export function shouldShowTimelineStopHeading(
  activity: MeaningfulActivityInput,
  index: number,
  visibleTagLineCount: number
): boolean {
  if (visibleTagLineCount > 0) return false;
  if (isLocationOnlyDefaultStop(activity, index, visibleTagLineCount)) {
    return false;
  }

  const title = (activity.title ?? "").trim();
  if (title && !isDefaultStopTitle(title, index)) return true;

  if ((activity.images?.length ?? 0) > 0) return true;
  if (hasMeaningfulExtras(activity.additionalInfo)) return true;

  if (isDefaultStopTitle(title, index)) return false;

  return !!title;
}

/** Section label for the activities timeline block on post detail. */
export function getTimelineSectionLabel(
  meaningfulItems: {
    input: MeaningfulActivityInput;
    index: number;
    visibleTagLineCount: number;
  }[]
): "Location" | "Activities" | null {
  if (meaningfulItems.length === 0) return null;
  if (
    meaningfulItems.length === 1 &&
    isLocationOnlyDefaultStop(
      meaningfulItems[0].input,
      meaningfulItems[0].index,
      meaningfulItems[0].visibleTagLineCount
    )
  ) {
    return "Location";
  }
  return "Activities";
}

export function buildTimelineDisplayItems(
  activities: DetailTimelineActivity[]
): {
  activity: DetailTimelineActivity;
  index: number;
  input: MeaningfulActivityInput;
  visibleTagLineCount: number;
}[] {
  return (activities ?? [])
    .map((activity, index) => {
      const input = toMeaningfulActivityInputFromDetail(activity);
      const visibleTagLineCount = visibleActivityTagLines(
        Array.isArray(activity.tags) ? activity.tags.map(String) : []
      ).length;
      return { activity, index, input, visibleTagLineCount };
    })
    .filter(({ input, index }) => isMeaningfulActivityAtIndex(input, index));
}
