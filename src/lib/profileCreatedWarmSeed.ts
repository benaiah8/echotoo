/**
 * Profile Created-tab warm seed helpers.
 *
 * ProgressiveFeed remounts (ownership epoch / feed refresh) re-bootstrap from
 * `initialItems` and can write them back via `setCachedItems`. These helpers
 * keep ownership/delete exclusions out of that bootstrap path without changing
 * ProgressiveFeed globally.
 */

import type { FeedItem } from "../api/queries/getPublicFeed";
import { dataCache } from "./dataCache";
import { readPersistedProfilePosts } from "./profilePostListCache";

/** Drop excluded ids from a warm/bootstrap snapshot. Empty → undefined (no seed). */
export function filterProfileCreatedWarmItems(
  items: FeedItem[] | null | undefined,
  excludePostIds: ReadonlySet<string> | null | undefined
): FeedItem[] | undefined {
  if (!items?.length) return undefined;
  if (!excludePostIds?.size) return items;
  const next = items.filter((item) => !excludePostIds.has(item.id));
  return next.length > 0 ? next : undefined;
}

/**
 * Guard Created-cache writes so a stale ProgressiveFeed bootstrap snapshot
 * cannot re-poison profile_created_* after ownership transfer / delete.
 */
export function guardProfileCreatedCacheWrite(
  items: FeedItem[],
  excludePostIds: ReadonlySet<string> | null | undefined
): FeedItem[] {
  if (!Array.isArray(items) || !excludePostIds?.size) return items;
  return items.filter((item) => !excludePostIds.has(item.id));
}

export function noteProfileCreatedExclusion(
  excludePostIds: Set<string>,
  postId: string
): void {
  if (!postId) return;
  excludePostIds.add(postId);
}

/**
 * Fresh memory/persisted read for Created warm `initialItems`.
 * Callers must put remount/ownership/delete epochs in the surrounding memo deps
 * so this re-runs after cache invalidation (do not freeze a stale array).
 */
export function readProfileCreatedWarmInitialItems(args: {
  dataCacheKey: string;
  userId: string;
  excludePostIds?: ReadonlySet<string> | null;
}): FeedItem[] | undefined {
  const { dataCacheKey, userId, excludePostIds } = args;
  if (!userId || !dataCacheKey) return undefined;

  const cached = dataCache.get<FeedItem[]>(dataCacheKey);
  if (Array.isArray(cached) && cached.length > 0) {
    return filterProfileCreatedWarmItems(cached, excludePostIds);
  }

  const persisted = readPersistedProfilePosts("created", userId);
  if (!persisted?.items?.length) return undefined;
  return filterProfileCreatedWarmItems(persisted.items, excludePostIds);
}
