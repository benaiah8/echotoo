/**
 * Pure helpers for Group source-media visuals / atmosphere.
 */
import type { PublishedMediaItem } from "../publishedMedia";

export function publishedMediaVisualUrl(
  item: PublishedMediaItem | null | undefined,
): string | null {
  if (!item) return null;
  if (item.kind === "image") {
    const url = item.url?.trim();
    return url || null;
  }
  const poster = item.posterUrl?.trim();
  return poster || null;
}

/** First stable media drives atmosphere (not the tap-cycled index). */
export function groupAtmospherePathFromMedia(
  items: readonly PublishedMediaItem[],
): string | null {
  return publishedMediaVisualUrl(items[0] ?? null);
}
