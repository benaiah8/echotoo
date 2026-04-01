/**
 * Batched enrichment for post like_count and comment_count.
 * Used when profile RPCs (Saved/Interacted) don't return counts.
 */

import { supabase } from "./supabaseClient";
import { getCommentCounts } from "../api/services/comments";
import { isDraftPostId } from "../lib/drafts";
import type { FeedItem } from "../api/queries/getPublicFeed";

/**
 * Fetch like_count and comment_count for a batch of post IDs in one round-trip each.
 * Merges counts into items and returns enriched copy.
 */
export async function enrichFeedItemsWithCounts(
  items: FeedItem[]
): Promise<FeedItem[]> {
  const postIds = items.map((i) => i.id).filter((id) => !isDraftPostId(id));

  if (postIds.length === 0) return items;

  const [likeCounts, commentCounts] = await Promise.all([
    fetchLikeCounts(postIds),
    getCommentCounts(postIds),
  ]);

  const likeMap = new Map(postIds.map((id) => [id, 0]));
  likeCounts.forEach((row) => {
    likeMap.set(row.post_id, (likeMap.get(row.post_id) ?? 0) + 1);
  });

  const commentMap = new Map(commentCounts.map((c) => [c.post_id, c.count]));

  return items.map((item) => {
    if (isDraftPostId(item.id)) return item;
    const likeCount = likeMap.get(item.id) ?? item.like_count ?? 0;
    const commentCount = commentMap.get(item.id) ?? item.comment_count ?? 0;
    return {
      ...item,
      like_count: likeCount,
      comment_count: commentCount,
    };
  });
}

async function fetchLikeCounts(
  postIds: string[]
): Promise<{ post_id: string }[]> {
  const { data, error } = await supabase
    .from("post_likes")
    .select("post_id")
    .in("post_id", postIds);

  if (error) {
    console.error("[postCountsEnrichment] Like counts error:", error);
    return [];
  }
  return data ?? [];
}
