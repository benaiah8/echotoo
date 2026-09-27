/**
 * Canonical FeedItem → publishedMediaCache seed (PV3.3).
 * Reuses seedPublishedMediaFromList / buildPublishedMediaItems — no second builder.
 */

import {
  seedPublishedMediaFromList,
  type SeedPublishedMediaFromListInput,
} from "./publishedMediaCache";
import {
  resolvePublishedPostImageUrls,
  type PublishedPostImageUrlSources,
} from "./resolvePublishedPostImageUrls";

export type FeedItemPublishedMediaFields = {
  id: string;
  media_order?: unknown;
  post_media?: unknown;
  activities?: Array<{ images?: string[] | null } | null> | null;
  first_image_url?: string | null;
};

export type { PublishedPostImageUrlSources };
export { resolvePublishedPostImageUrls };

export type SeedPublishedMediaFromFeedItemsOptions = {
  items: readonly FeedItemPublishedMediaFields[] | null | undefined;
  viewerUserId: string | null | undefined;
  source: SeedPublishedMediaFromListInput["source"];
  /** Persist/warm snapshot timestamp for stale protection. */
  snapshotTs?: number;
};

/**
 * Seed publishedMediaCache from FeedItem-like rows that already carry
 * media_order / post_media. Synchronous; no network.
 */
export function seedPublishedMediaFromFeedItems(
  options: SeedPublishedMediaFromFeedItemsOptions,
): void {
  if (!options.items?.length) return;

  for (const item of options.items) {
    const postId = typeof item?.id === "string" ? item.id.trim() : "";
    if (!postId) continue;
    if (
      item.media_order == null &&
      !(Array.isArray(item.post_media) && item.post_media.length > 0)
    ) {
      continue;
    }

    const built = seedPublishedMediaFromList({
      postId,
      viewerUserId: options.viewerUserId,
      mediaOrder: item.media_order,
      postMedia: item.post_media,
      imageUrls: resolvePublishedPostImageUrls(item),
      source: options.source,
      snapshotTs: options.snapshotTs,
    });

    if (
      import.meta.env.DEV &&
      built &&
      (options.source === "warm" || options.source === "persist")
    ) {
      console.log("[echotoo published media] warm-seed", {
        postId,
        orderKinds: Array.isArray(item.media_order)
          ? item.media_order.map((e: { kind?: string }) => e?.kind)
          : [],
        postMediaCount: Array.isArray(item.post_media)
          ? item.post_media.length
          : 0,
        builtKinds: built.map((b) => b.kind),
        source: options.source,
      });
    }
  }
}
