import { type FeedItem } from "../api/queries/getPublicFeed";

/**
 * First image URL for horizontal rail card cover: shrink feed `first_image_url`,
 * else first image from activities ordered by `order_idx`.
 */
export function getRailCoverImageUrl(
  post: FeedItem | null | undefined
): string | null {
  if (!post) return null;
  const first = post.first_image_url?.trim();
  if (first) return first;

  const activities = post.activities;
  if (!activities?.length) return null;

  const sorted = [...activities].sort(
    (a, b) => (a.order_idx ?? 0) - (b.order_idx ?? 0)
  );
  for (const a of sorted) {
    const imgs = a.images?.filter(
      (u): u is string => !!u && typeof u === "string"
    );
    if (imgs?.length) return imgs[0];
  }
  return null;
}
