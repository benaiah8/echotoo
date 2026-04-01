/**
 * Create-flow limits: post-level (caption / hashtags) + per-activity wizard fields.
 * Keep activity limits in sync with {@link createFlowLimitUtils}.
 */
export const CREATE_FLOW_CAPTION_MAX = 800;
export const CREATE_FLOW_HASHTAG_MAX = 12;
export const CREATE_FLOW_HASHTAG_TOKEN_MAX = 24;

/** Per-step activity builder (stops, images, location, etc.) — used across create sections. */
export const CREATE_FLOW_LIMITS = {
  activities: {
    maxStopsPerPost: 10,
    customActivityMaxChars: 80,
    maxActivityTagLinesPerStop: 6,
    activityPrimaryLineMaxChars: 40,
    /** Second+ lines in the per-stop activity notes list (composer only). */
    activityNoteLineMaxChars: 180,
    placeNameMaxChars: 120,
    googleMapsLinkMaxChars: 2048,
    locationExtraDetailsMaxChars: 500,
    maxAdditionalDetailItemsPerStop: 8,
    additionalDetailCustomTitleMaxChars: 40,
    additionalDetailValueMaxChars: 200,
    maxImagesPerStop: 10,
    maxTotalImagesPerPost: 30,
  },
} as const;

/**
 * Truncates to max length only — preserves line breaks and does not strip newline characters.
 */
export function clampCaption(value: string): string {
  if (value.length <= CREATE_FLOW_CAPTION_MAX) return value;
  return value.slice(0, CREATE_FLOW_CAPTION_MAX);
}

/** Normalize a single hashtag token (lowercase, max length). */
export function normalizeHashtagToken(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return "";
  return t.length > CREATE_FLOW_HASHTAG_TOKEN_MAX
    ? t.slice(0, CREATE_FLOW_HASHTAG_TOKEN_MAX)
    : t;
}

/** Cap list length and token length for publish payload. */
export function sanitizeTagsForPublish(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (out.length >= CREATE_FLOW_HASHTAG_MAX) break;
    const v = normalizeHashtagToken(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
