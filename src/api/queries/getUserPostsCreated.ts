// src/api/queries/getUserPostsCreated.ts
import { supabase } from "../../lib/supabaseClient";
import { type FeedItem } from "./getPublicFeed";

// [OPTIMIZATION: Phase 3.3] Optimized version using PostgreSQL function
// Returns FeedItem format with all related data (follow_status, is_liked, is_saved, rsvp_data, etc.)
export async function getUserPostsCreatedOptimized(
  authorId: string,
  from = 0,
  limit = 20,
  includeDrafts = true,
  isOwner = false,
  viewerUserId: string | null = null
): Promise<{ data: FeedItem[]; error: any }> {
  try {
    console.log("[getUserPostsCreatedOptimized] Starting query with params:", {
      authorId,
      from,
      limit,
      includeDrafts,
      isOwner,
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

    if (error) {
      console.error("[getUserPostsCreatedOptimized] RPC error:", error);
      return { data: [], error };
    }

    if (!data || !data.posts) {
      console.warn("[getUserPostsCreatedOptimized] Invalid response structure");
      return { data: [], error: null };
    }

    // Map to FeedItem format (same as feed function)
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
      comment_count: post.comment_count,
      has_images: post.has_images,
      rsvp_data: post.rsvp_data || null,
    }));

    console.log("[getUserPostsCreatedOptimized] Query result:", {
      dataLength: feedItems.length,
      error: null,
      hasError: false,
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
      status
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
