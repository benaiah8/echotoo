/**
 * Groups deck ↔ publishedMediaCache bridge (data only).
 * No UI; reuses Feed/Profile/Detail viewer-scoped media cache.
 */

import {
  dedupePublishedMediaPostIds,
  getOrFetchPublishedMediaMany,
  getPublishedMediaCache,
  isPublishedMediaCacheFresh,
  publishedMediaViewerKey,
  type PublishedMediaItem,
} from "./publishedMedia";

export function collectGroupUpSourcePostIds(
  rows: readonly { source_post_id?: string | null }[],
): string[] {
  return dedupePublishedMediaPostIds(
    rows.map((row) => row.source_post_id ?? null),
  );
}

export type GroupPublishedMediaLookupStatus =
  | "pending"
  | "settled"
  | "unavailable";

export type GroupPublishedMediaLookup = {
  status: GroupPublishedMediaLookupStatus;
  items: readonly PublishedMediaItem[];
};

/**
 * Distinguish enrichment pending (key absent) from settled empty ([]).
 * Missing/unavailable source posts are settled empty — not "still loading".
 */
export function lookupGroupPublishedMedia(
  byPostId: Readonly<Record<string, PublishedMediaItem[]>>,
  sourcePostId: string | null | undefined,
  sourceUnavailable?: boolean,
): GroupPublishedMediaLookup {
  if (sourceUnavailable === true) {
    return { status: "unavailable", items: [] };
  }
  const id = typeof sourcePostId === "string" ? sourcePostId.trim() : "";
  if (!id) {
    return { status: "settled", items: [] };
  }
  if (!Object.prototype.hasOwnProperty.call(byPostId, id)) {
    return { status: "pending", items: [] };
  }
  return { status: "settled", items: byPostId[id] ?? [] };
}

/** Sync snapshot of fresh cache entries for the given source posts. */
export function readFreshGroupUpPublishedMediaMap(options: {
  postIds: readonly string[];
  viewerUserId: string | null | undefined;
}): Record<string, PublishedMediaItem[]> {
  const viewerKey = publishedMediaViewerKey(options.viewerUserId);
  const out: Record<string, PublishedMediaItem[]> = {};
  for (const postId of options.postIds) {
    const entry = getPublishedMediaCache(postId, viewerKey);
    if (!entry || !isPublishedMediaCacheFresh(entry)) continue;
    out[postId] = entry.items;
  }
  return out;
}

export async function ensureGroupUpPublishedMediaMap(options: {
  postIds: readonly string[];
  viewerUserId: string | null | undefined;
  forceRevalidate?: boolean;
}): Promise<{
  byPostId: Record<string, PublishedMediaItem[]>;
  fetchedPostIds: string[];
}> {
  const result = await getOrFetchPublishedMediaMany({
    postIds: options.postIds,
    viewerUserId: options.viewerUserId,
    forceRevalidate: options.forceRevalidate,
  });
  const byPostId: Record<string, PublishedMediaItem[]> = {};
  for (const [postId, items] of result.byPostId) {
    byPostId[postId] = items;
  }
  return { byPostId, fetchedPostIds: result.fetchedPostIds };
}
