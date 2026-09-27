/**
 * Map mixed PublishedMediaItem[] ↔ image-only lightbox indices.
 */

import type { PublishedMediaItem } from "./types";

/** Image URLs only — never include video slides. */
export function publishedLightboxImageUrls(
  items: PublishedMediaItem[],
): string[] {
  return items
    .filter(
      (item): item is Extract<PublishedMediaItem, { kind: "image" }> =>
        item.kind === "image",
    )
    .map((item) => item.url);
}

/**
 * Mixed carousel index → image-only lightbox index.
 * Returns null when the mixed slide is not an image.
 */
export function mixedIndexToLightboxImageIndex(
  items: PublishedMediaItem[],
  mixedIndex: number,
): number | null {
  if (mixedIndex < 0 || mixedIndex >= items.length) return null;
  const item = items[mixedIndex];
  if (!item || item.kind !== "image") return null;
  let imageIndex = 0;
  for (let i = 0; i < mixedIndex; i++) {
    if (items[i]?.kind === "image") imageIndex += 1;
  }
  return imageIndex;
}
