/**
 * Batch fetch activities for multiple posts in one request.
 * Used by ProgressiveFeed to eliminate per-post N+1 queries.
 */
import { supabase } from "../../lib/supabaseClient";
import {
  setCachedActivities,
  markActivitiesPending,
  clearActivitiesPending,
  hasCachedActivities,
  type CachedActivity,
} from "../../lib/activitiesCache";

const MAX_IDS_PER_QUERY = 100;

/** In-flight dedupe: same sorted postIds key reuses the same Promise */
const activitiesRpcInFlight = new Map<string, Promise<void>>();

function dedupeKey(postIds: string[]): string {
  return [...postIds].sort().join(",");
}

export async function batchFetchActivitiesForPosts(
  postIds: string[]
): Promise<void> {
  if (postIds.length === 0) return;

  const ids = [...new Set(postIds)].slice(0, MAX_IDS_PER_QUERY);

  // Only fetch postIds not already in cache
  const idsNeedingFetch = ids.filter((id) => !hasCachedActivities(id));
  if (idsNeedingFetch.length === 0) return;

  for (const id of idsNeedingFetch) {
    markActivitiesPending(id);
  }

  const key = dedupeKey(idsNeedingFetch);
  let promise = activitiesRpcInFlight.get(key);
  if (promise) {
    return promise;
  }

  promise = (async () => {
    try {
      const { data: rows, error } = await supabase.rpc(
        "get_activities_for_posts_sanitized",
        { p_post_ids: idsNeedingFetch }
      );

      if (error) throw error;

      const byPostId = new Map<string, CachedActivity[]>();
      for (const id of idsNeedingFetch) {
        byPostId.set(id, []); // Initialize so we cache "no activities" for queried posts
      }
      for (const row of rows ?? []) {
        const postId = row.post_id as string;
        if (!postId) continue;

        const rawImages = row.images;
        const images: string[] = Array.isArray(rawImages)
          ? rawImages.filter((x): x is string => typeof x === "string")
          : [];

        const activity: CachedActivity = {
          images: images.length > 0 ? images : null,
          order_idx: typeof row.order_idx === "number" ? row.order_idx : 0,
        };

        const list = byPostId.get(postId);
        if (list) list.push(activity);
      }

      byPostId.forEach((activities, postId) => {
        setCachedActivities(postId, activities);
      });
    } catch (err) {
      console.warn("[activitiesBatch] Batch fetch failed:", err);
    } finally {
      for (const id of idsNeedingFetch) {
        clearActivitiesPending(id);
      }
      activitiesRpcInFlight.delete(key);
    }
  })();

  activitiesRpcInFlight.set(key, promise);
  return promise;
}
