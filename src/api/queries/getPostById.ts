import { supabase } from "../../lib/supabaseClient";
import { type FeedItem } from "./getPublicFeed";

// [OPTIMIZATION: Phase 3.4] Optimized version using PostgreSQL function
// Returns post with all related data (follow_status, is_liked, is_saved, rsvp_data, comment_count, etc.)
export async function getPostByIdOptimized(
  postId: string,
  viewerUserId: string | null = null
): Promise<{ data: FeedItem | null; error: any }> {
  try {
    console.log("[getPostByIdOptimized] Starting query with params:", {
      postId,
      viewerUserId: viewerUserId ? "[REDACTED]" : null,
    });

    const { data, error } = await supabase.rpc(
      "get_post_detail_with_related_data",
      {
        p_post_id: postId,
        p_viewer_user_id: viewerUserId || null,
      }
    );

    if (error) {
      console.error("[getPostByIdOptimized] RPC error:", error);
      return { data: null, error };
    }

    if (!data || !data.post) {
      console.warn("[getPostByIdOptimized] Post not found or access denied");
      return { data: null, error: { message: "Post not found or access denied" } };
    }

    const post = data.post;

    // Map to FeedItem format (compatible with PostDetailBody)
    const feedItem: FeedItem = {
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
      // Additional fields for PostDetailBody compatibility
      status: post.status,
      visibility: post.visibility,
      rsvp_capacity: post.rsvp_capacity,
      is_recurring: post.is_recurring,
      recurrence_days: post.recurrence_days,
      // Activities are included in the post object from PostgreSQL
      activities: post.activities || [],
    };

    console.log("[getPostByIdOptimized] Query result:", {
      postId: feedItem.id,
      hasActivities: (feedItem.activities?.length || 0),
      error: null,
    });

    return { data: feedItem, error: null };
  } catch (error: any) {
    console.error("[getPostByIdOptimized] Unexpected error:", error);
    return { data: null, error };
  }
}

// Legacy function - kept for backward compatibility
// [DEPRECATED] Use getPostByIdOptimized for better performance
export async function getPostById(id: string) {
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
  id,
  type,
  caption,
  created_at,
  author_id,
  visibility,
  is_anonymous,
  anonymous_name,
  anonymous_avatar,
  rsvp_capacity,
  selected_dates,
  is_recurring,
  recurrence_days,
  tags,
  author:profiles!posts_author_id_fkey(
    id,
    display_name,
    username,
    avatar_url
  ),
  activities:activities(
    title,
    images,
    order_idx,
    location_name,
    location_desc,
    location_url,
    location_notes,
    additional_info,
    tags
  )
`
    )
    .eq("id", id)
    .order("order_idx", { foreignTable: "activities", ascending: true })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}
