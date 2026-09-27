/**
 * Groups source-post open eligibility — same hangout/experience truth as Duo.
 * Does not invent a new fetch; callers use navigateToPostDetailInApp.
 */
import type { PublishedMediaItem } from "../publishedMedia";

export function canOpenGroupSourcePost(row: {
  source_post_id?: string | null;
  source_type?: string | null;
  source_unavailable?: boolean | null;
}): boolean {
  if (row.source_unavailable === true) return false;
  const id =
    typeof row.source_post_id === "string" ? row.source_post_id.trim() : "";
  if (!id) return false;
  return row.source_type === "hangout" || row.source_type === "experience";
}

/**
 * Active Group media key for Detail `initialMediaKey`.
 * Preserves PublishedMediaItem[] order — never reorders or forces index 0.
 */
export function resolveGroupSourcePostInitialMediaKey(
  items: readonly PublishedMediaItem[],
  activeIndex: number,
): string | undefined {
  if (!items.length) return undefined;
  const safe = Math.max(0, Math.min(items.length - 1, activeIndex));
  const key = items[safe]?.key?.trim();
  return key || undefined;
}
