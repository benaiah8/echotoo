/**
 * In-memory cache for post activities (images, order_idx).
 * Used by ProgressiveFeed batch fetch and Post fallback check.
 * Key: post_id -> Array<{ images, order_idx }>
 */

export type CachedActivity = {
  images: string[] | null;
  order_idx: number | null;
};

const activitiesByPostId = new Map<string, CachedActivity[]>();
const pendingPostIds = new Set<string>();

type ActivitiesCacheListener = () => void;
const listenersByPostId = new Map<string, Set<ActivitiesCacheListener>>();

/**
 * Subscribe when batch fetch writes activities for this post only (avoids notifying every mounted Post).
 */
export function subscribeActivitiesCache(
  postId: string,
  listener: ActivitiesCacheListener
): () => void {
  let set = listenersByPostId.get(postId);
  if (!set) {
    set = new Set();
    listenersByPostId.set(postId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) listenersByPostId.delete(postId);
  };
}

function notifyActivitiesCache(postId: string): void {
  const set = listenersByPostId.get(postId);
  if (!set) return;
  for (const l of set) {
    try {
      l();
    } catch (e) {
      console.warn("[activitiesCache] listener error", e);
    }
  }
}

export function setCachedActivities(
  postId: string,
  activities: CachedActivity[]
): void {
  activitiesByPostId.set(postId, activities);
  notifyActivitiesCache(postId);
}

export function getCachedActivities(postId: string): CachedActivity[] | null {
  return activitiesByPostId.get(postId) ?? null;
}

export function hasCachedActivities(postId: string): boolean {
  return activitiesByPostId.has(postId);
}

export function markActivitiesPending(postId: string): void {
  pendingPostIds.add(postId);
}

export function isActivitiesPending(postId: string): boolean {
  return pendingPostIds.has(postId);
}

export function clearActivitiesPending(postId: string): void {
  pendingPostIds.delete(postId);
}
