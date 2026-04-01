import { type FeedItem } from "../api/queries/getPublicFeed";
import { imgUrlPublic } from "./img";

/**
 * First image URL for horizontal rail cards: shrink feed `first_image_url`, else first image from ordered activities.
 */
export function getRailCardCoverUrl(
  post: FeedItem | null | undefined
): string | undefined {
  if (!post) return undefined;

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
