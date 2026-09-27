import { type FeedItem } from "../api/queries/getPublicFeed";
import { imgUrlPublic } from "./img";
import { imageUrlsFromMediaOrder } from "./publishedMedia/mapCompactPostMedia";

function mediaOrderHasEntries(mediaOrder: unknown): boolean {
  return Array.isArray(mediaOrder) && mediaOrder.length > 0;
}

/**
 * First image URL for horizontal rail cards.
 * Image media only — never video sources, video IDs, or video posters.
 *
 * Priority:
 * 1. First `kind === "image"` URL from `media_order`
 * 2. Legacy image fields (`first_image_url`, activity images) when media_order
 *    is absent or does not imply a video-only post
 * 3. Otherwise undefined
 */
export function getRailCardCoverUrl(
  post: FeedItem | null | undefined
): string | undefined {
  if (!post) return undefined;

  const orderImages = imageUrlsFromMediaOrder(post.media_order);
  if (orderImages.length > 0) {
    const u = imgUrlPublic(orderImages[0]);
    if (u) return u;
  }

  // media_order present with no images → video-only (or non-image) manifest.
  // Do not fall back to first_image_url / posters.
  if (mediaOrderHasEntries(post.media_order)) {
    return undefined;
  }

  if (post.first_image_url) {
    const u = imgUrlPublic(post.first_image_url);
    if (u) return u;
  }

  const activities = post.activities;
  if (!activities?.length) return undefined;

  const sorted = [...activities].sort(
    (a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0)
  );

  for (const a of sorted) {
    const imgs = a.images;
    if (!imgs?.length) continue;
    for (const raw of imgs) {
      if (!raw) continue;
      const u = imgUrlPublic(raw);
      if (u) return u;
    }
  }

  return undefined;
}
