/**
 * Preserve UI-critical post fields when merging prev (feed/initial) with next (fetched).
 * Prevents "modal hydration drops UI fields" regressions (e.g. counts snapping to 0).
 *
 * For the listed fields, preserves prev when next is null/undefined.
 */
const UI_CRITICAL_FIELDS = [
  "like_count",
  "comment_count",
  "save_count",
  "is_liked",
  "is_saved",
  "follow_status",
] as const;

export function mergeUiCriticalPostFields(prev: any, next: any): any {
  if (!prev) return next ?? {};
  if (!next) return prev ?? {};
  const merged = { ...prev, ...next };
  for (const k of UI_CRITICAL_FIELDS) {
    merged[k] = next[k] ?? prev[k];
  }
  return merged;
}
