/**
 * Shared published-post image URL resolution (Feed seed + Detail/Groups batch).
 * Kept free of cache imports to avoid cycles with getPublishedPostMediaForDetail.
 */

import { imageUrlsFromMediaOrder } from "./mapCompactPostMedia";

export type PublishedPostImageUrlSources = {
  media_order?: unknown;
  activities?: Array<{ images?: string[] | null } | null> | null;
  first_image_url?: string | null;
};

function activityImageUrls(
  activities: PublishedPostImageUrlSources["activities"],
): string[] {
  if (!Array.isArray(activities)) return [];
  const out: string[] = [];
  for (const a of activities) {
    if (!a || !Array.isArray(a.images)) continue;
    for (const u of a.images) {
      if (typeof u === "string" && u) out.push(u);
    }
  }
  return out;
}

/**
 * Same image URL priority as Feed/Profile seed + Post Detail gallery handoff:
 * 1. media_order image urls
 * 2. activities[].images
 * 3. first_image_url
 */
export function resolvePublishedPostImageUrls(
  item: PublishedPostImageUrlSources,
): string[] {
  const fromOrder = imageUrlsFromMediaOrder(item.media_order);
  if (fromOrder.length > 0) return fromOrder;
  const fromActivities = activityImageUrls(item.activities);
  if (fromActivities.length > 0) return fromActivities;
  const first =
    typeof item.first_image_url === "string" && item.first_image_url.trim()
      ? item.first_image_url.trim()
      : "";
  return first ? [first] : [];
}
