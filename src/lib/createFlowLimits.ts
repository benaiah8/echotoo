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
    /** Max images for the whole post (all stops combined). No separate per-stop cap. */
    maxTotalImagesPerPost: 10,
  },
} as const;

/**
 * Truncates to max length only — preserves line breaks and does not strip newline characters.
 */
export function clampCaption(value: string): string {
  if (value.length <= CREATE_FLOW_CAPTION_MAX) return value;
  return value.slice(0, CREATE_FLOW_CAPTION_MAX);
}

/**
 * Normalize a single post-level hashtag token: trim, lowercase, strip leading `#`
 * (including repeated `#` so legacy `##fun` matches `fun`), then cap length.
 */
export function normalizeHashtagToken(raw: string): string {
  let t = raw.trim().toLowerCase();
  while (t.startsWith("#")) {
    t = t.slice(1);
  }
  if (!t) return "";
  return t.length > CREATE_FLOW_HASHTAG_TOKEN_MAX
    ? t.slice(0, CREATE_FLOW_HASHTAG_TOKEN_MAX)
    : t;
}

/**
 * Post-level hashtag display: always exactly one leading `#` for non-empty stored values.
 * Safe for legacy rows that still include one or more leading `#`.
 */
export function formatHashtagForDisplay(raw: string): string {
  const core = normalizeHashtagToken(raw);
  if (!core) return "";
  return `#${core}`;
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
