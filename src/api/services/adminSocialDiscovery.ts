import { supabase } from "../../lib/supabaseClient";
import { dataCache } from "../../lib/dataCache";
import { clearAllPersistedHomeFeeds } from "../../lib/homeFeedListCache";
import { emitPostChanged } from "../../lib/postEvents";
import { invalidatePostDetailCache } from "../queries/getPostById";

export type SetPostSocialDiscoveryBoostResult = {
  ok: boolean;
  postId: string;
  enabled: boolean;
  socialDiscoveryBoostedAt: string | null;
};

/**
 * Reviewer-only: set/clear posts.social_discovery_boosted_at for Event rails.
 * Invalidates Home feed/discovery caches narrowly + patches live cards.
 */
export async function setPostSocialDiscoveryBoost(
  postId: string,
  enabled: boolean
): Promise<SetPostSocialDiscoveryBoostResult> {
  if (!postId?.trim()) throw new Error("Missing post id");

  const { data, error } = await supabase.rpc("set_post_social_discovery_boost", {
    p_post_id: postId,
    p_enabled: enabled,
  });

  if (error) {
    throw new Error(error.message || "Could not update social priority");
  }

  const row = (data ?? {}) as {
    ok?: boolean;
    post_id?: string;
    enabled?: boolean;
    social_discovery_boosted_at?: string | null;
  };

  const boostedAt =
    typeof row.social_discovery_boosted_at === "string"
      ? row.social_discovery_boosted_at
      : null;

  const result: SetPostSocialDiscoveryBoostResult = {
    ok: row.ok === true,
    postId: row.post_id ?? postId,
    enabled: row.enabled === true,
    socialDiscoveryBoostedAt: boostedAt,
  };

  emitPostChanged(result.postId, {
    social_discovery_boosted_at: result.socialDiscoveryBoostedAt,
  });
  invalidatePostDetailCache(result.postId);
  clearAllPersistedHomeFeeds();
  await dataCache.clearFeedCache();

  return result;
}
