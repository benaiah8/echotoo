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
