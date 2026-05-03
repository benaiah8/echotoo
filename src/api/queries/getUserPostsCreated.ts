// src/api/queries/getUserPostsCreated.ts
import { supabase } from "../../lib/supabaseClient";
import { type FeedItem } from "./getPublicFeed";
import { requestManager } from "../../lib/requestManager";
import { publishProfileTrace } from "../../lib/debugProfileFeed";

// [OPTIMIZATION: Phase 3.3] Optimized version using PostgreSQL function
// Returns FeedItem format with all related data (follow_status, is_liked, is_saved, rsvp_data, etc.)
// [PERF] Added RequestManager for request deduplication to prevent duplicate RPC calls
export async function getUserPostsCreatedOptimized(
  authorId: string,
  from = 0,
  limit = 20,
  includeDrafts = true,
  isOwner = false,
  viewerUserId: string | null = null
): Promise<{ data: FeedItem[]; error: any }> {
  if (!authorId) {
    return { data: [], error: null };
  }

  // [PERF] Use RequestManager for deduplication - prevents multiple simultaneous calls with same params
  // This is especially important for ProgressiveFeed which may make multiple calls (offset 0, 5, 10)
  const dedupeKey = `user_posts_created_${authorId}_${from}_${limit}_${includeDrafts}_${isOwner}_${
    viewerUserId || "null"
  }`;

  try {
    const result = await requestManager.execute(
      dedupeKey,
      async (signal: AbortSignal) => {
        publishProfileTrace("CREATED_QUERY_START", {
          authorId,
          offset: from,
          limit,
        });
        const { data, error } = await supabase.rpc(
          "get_user_posts_created_with_related_data",
          {
            p_user_id: authorId,
            p_viewer_user_id: viewerUserId || null,
            p_limit: limit,
            p_offset: from,
            p_include_drafts: includeDrafts,
            p_is_owner: isOwner,
          }
        );

        if (signal.aborted) {
          throw new Error("Aborted");
        }

        return { data, error };
      },
      "high" // High priority for profile page posts
    );

    const { data, error } = result.data || { data: null, error: result.error };

    if (error) {
      console.error("[getUserPostsCreatedOptimized] RPC error:", error);
      return { data: [], error };
    }

    if (!data || !data.posts) {
      console.warn("[getUserPostsCreatedOptimized] Invalid response structure");
      return { data: [], error: null };
    }

    const feedItems: FeedItem[] = data.posts.map((post: any) => ({
      id: post.id,
      type: post.type,
      caption: post.caption,
      is_anonymous: post.is_anonymous,
      anonymous_name: post.anonymous_name,
      anonymous_avatar: post.anonymous_avatar,
      created_at: post.created_at,
      selected_dates: post.selected_dates,
      tags: post.tags,
      author_id: post.author_id,
      author: post.author,
      follow_status: post.follow_status as
        | "none"
        | "pending"
        | "following"
        | "friends"
        | undefined,
      is_liked: post.is_liked,
      is_saved: post.is_saved,
      like_count: post.like_count ?? 0,
      save_count: post.save_count ?? 0,
      effective_like_count: post.effective_like_count ?? (post.like_count ?? 0),
      effective_save_count: post.effective_save_count ?? (post.save_count ?? 0),
      comment_count: post.comment_count ?? 0,
      has_images: post.has_images,
      rating_enabled: post.rating_enabled,
      rating_average: post.rating_average ?? null,
      rating_count: post.rating_count ?? null,
      effective_rating_average:
        post.effective_rating_average ?? (post.rating_average ?? null),
      effective_rating_count:
        post.effective_rating_count ?? (post.rating_count ?? null),
      viewer_rating: post.viewer_rating ?? null,
      rsvp_data: post.rsvp_data || null,
      rsvp_capacity: post.rsvp_capacity ?? null,
      // [PHASE 4.1.1 FIX] Include activities from PostgreSQL to prevent extra queries
      // This eliminates 1 activities query per post (5+ fewer network requests)
      activities: post.activities || [],
    }));

    publishProfileTrace("CREATED_QUERY_DONE", {
      returnedCount: feedItems.length,
      firstPostId: feedItems[0]?.id ?? null,
    });

    return { data: feedItems, error: null };
  } catch (error: any) {
    console.error("[getUserPostsCreatedOptimized] Error:", error);
    return { data: [], error };
  }
}

// Legacy function - kept for backward compatibility
// [DEPRECATED] Use getUserPostsCreatedOptimized instead
export async function getUserPostsCreated(
  authorId: string,
  from = 0,
  limit = 20,
  includeDrafts = true,
  isOwner = false
) {
  console.log("[getUserPostsCreated] Starting query with params:", {
    authorId,
    from,
    limit,
    includeDrafts,
    isOwner,
  });

  let query = supabase
    .from("posts")
    .select(
      `
      id, 
      caption, 
      created_at, 
      type,
      is_anonymous,
      anonymous_name,
      anonymous_avatar,
      selected_dates,
      tags,
      status,
      rsvp_capacity
    `
    )
    .eq("author_id", authorId);

  if (!isOwner) {
    query = query.or("is_anonymous.is.null,is_anonymous.eq.false");
  }

  if (!isOwner) {
    query = query.eq("status", "published");
  } else if (isOwner && !includeDrafts) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1)
    .abortSignal(AbortSignal.timeout(20000));

  console.log("[getUserPostsCreated] Query result:", {
    dataLength: data?.length,
    error: error?.message,
    hasError: !!error,
  });

  return { data: data ?? [], error };
}
