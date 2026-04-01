import { supabase } from "../../lib/supabaseClient";
import { requestManager } from "../../lib/requestManager";
import { dataCache } from "../../lib/dataCache";
import { isDraftPostId } from "../../lib/drafts";
import { getViewerAuthUserId } from "./follows";
import { invalidateOnLike } from "../../lib/cacheInvalidation";
import { emitPostChanged } from "../../lib/postEvents";

// Cache for likes to reduce egress
const LIKES_CACHE_KEY = "likes_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedLikes {
  data: { [postId: string]: boolean };
  timestamp: number;
  userId: string;
}

// Helper functions for caching
function getCachedLikes(userId: string): { [postId: string]: boolean } | null {
  try {
    const cached = localStorage.getItem(LIKES_CACHE_KEY);
    if (!cached) return null;

    const parsed: CachedLikes = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is valid (not expired and for correct user)
    if (parsed.userId === userId && now - parsed.timestamp < CACHE_DURATION) {
      console.log("Using cached likes");
      return parsed.data;
    }

    return null;
  } catch (error) {
    console.error("Error reading cached likes:", error);
    return null;
  }
}

function setCachedLikes(
  userId: string,
  data: { [postId: string]: boolean }
): void {
  try {
    const cache: CachedLikes = {
      data,
      timestamp: Date.now(),
      userId,
    };
    localStorage.setItem(LIKES_CACHE_KEY, JSON.stringify(cache));
    console.log("Cached likes");
  } catch (error) {
    console.error("Error caching likes:", error);
  }
}

function invalidateLikesCache(): void {
  try {
    localStorage.removeItem(LIKES_CACHE_KEY);
    console.log("Invalidated likes cache");
  } catch (error) {
    console.error("Error invalidating likes cache:", error);
  }
}

export interface PostLike {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
}

export interface LikeCount {
  post_id: string;
  count: number;
}

/**
 * Like a post for the current user.
 * Uses upsert with ignoreDuplicates to avoid 409 - idempotent.
 * Only emits likesDelta when a new row is actually created.
 */
export async function likePost(
  postId: string
): Promise<{ data: PostLike | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("post_likes")
      .upsert(
        { user_id: userId, post_id: postId },
        { onConflict: "user_id,post_id", ignoreDuplicates: true }
      )
      .select("id, user_id, post_id, created_at");

    // With ignoreDuplicates: inserted -> returns row(s); conflict -> returns []
    const inserted =
      !error && data && (Array.isArray(data) ? data.length > 0 : !!data);
    if (!error) {
      invalidateLikesCache();
      invalidateOnLike(postId, userId);
      if (inserted) {
        emitPostChanged(postId, { viewerLiked: true });
      } else {
        // Conflict: reconcile server count so stale local count (e.g. 0) gets fixed
        const { count: likeCount } = await supabase
          .from("post_likes")
          .select("*", { count: "exact", head: true })
          .eq("post_id", postId);
        if (typeof likeCount === "number") {
          emitPostChanged(postId, { viewerLiked: true, likeCount });
        } else {
          emitPostChanged(postId, { viewerLiked: true });
        }
      }
      const row = Array.isArray(data) ? data[0] : data;
      return { data: row as PostLike, error: null };
    }

    return { data: null, error };
  } catch (error) {
    console.error("Like post error:", error);
    return { data: null, error };
  }
}

/**
 * Unlike a post for the current user.
 * Only emits likesDelta when a row was actually deleted.
 */
export async function unlikePost(
  postId: string
): Promise<{ data: any; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("post_likes")
      .delete()
      .eq("user_id", userId)
      .eq("post_id", postId)
      .select("post_id");

    const deleted =
      !error && data && (Array.isArray(data) ? data.length > 0 : !!data);
    if (!error) {
      invalidateLikesCache();
      invalidateOnLike(postId, userId);
      if (deleted) {
        emitPostChanged(postId, { viewerLiked: false });
      } else {
        // Already unliked: reconcile server count to fix stale local count
        const { count: likeCount } = await supabase
          .from("post_likes")
          .select("*", { count: "exact", head: true })
          .eq("post_id", postId);
        if (typeof likeCount === "number") {
          emitPostChanged(postId, { viewerLiked: false, likeCount });
        } else {
          emitPostChanged(postId, { viewerLiked: false });
        }
      }
    }

    return { data, error };
  } catch (error) {
    console.error("Unlike post error:", error);
    return { data: null, error };
  }
}

/**
 * Check if a post is liked by the current user
 */
export async function isPostLiked(
  postId: string
): Promise<{ data: boolean; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    // Skip checking for draft posts (they have invalid UUIDs)
    if (isDraftPostId(postId)) {
      return { data: false, error: null };
    }

    const { data, error } = await supabase
      .from("post_likes")
      .select("id")
      .eq("user_id", userId)
      .eq("post_id", postId)
      .maybeSingle();

    if (error) {
      console.error("Check liked post error:", error);
      return { data: false, error };
    }

    return { data: !!data, error: null };
  } catch (error) {
    console.error("Check liked post error:", error);
    return { data: false, error };
  }
}

/**
 * Get like counts for multiple posts
 */
export async function getLikeCounts(
  postIds: string[]
): Promise<{ data: LikeCount[] | null; error: any }> {
  try {
    if (postIds.length === 0) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id")
      .in("post_id", postIds);

    if (error) {
      console.error("Get like counts error:", error);
      return { data: null, error };
    }

    // Count likes per post
    const counts: { [postId: string]: number } = {};
    postIds.forEach((id) => (counts[id] = 0));

    data?.forEach((like) => {
      counts[like.post_id] = (counts[like.post_id] || 0) + 1;
    });

    const result: LikeCount[] = Object.entries(counts).map(
      ([post_id, count]) => ({
        post_id,
        count,
      })
    );

    return { data: result, error: null };
  } catch (error) {
    console.error("Get like counts error:", error);
    return { data: null, error };
  }
}

/**
 * Get all liked posts for the current user (with caching)
 */
export async function getLikedPosts(): Promise<{
  data: string[] | null;
  error: any;
}> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    console.log("Getting liked posts for user:", userId);

    // Check cache first
    const cachedData = getCachedLikes(userId);
    if (cachedData) {
      const likedPostIds = Object.entries(cachedData)
        .filter(([_, isLiked]) => isLiked)
        .map(([postId, _]) => postId);
      return { data: likedPostIds, error: null };
    }

    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get liked posts error:", error);
      return { data: null, error };
    }

    const likedPostIds = data?.map((like) => like.post_id) || [];

    // Cache the result (convert to boolean map)
    const likeMap: { [postId: string]: boolean } = {};
    likedPostIds.forEach((postId) => {
      likeMap[postId] = true;
    });
    setCachedLikes(userId, likeMap);

    return { data: likedPostIds, error: null };
  } catch (error) {
    console.error("Get liked posts error:", error);
    return { data: null, error };
  }
}

export interface LikedPostWithDetails {
  id: string;
  post_id: string;
  created_at: string;
  posts: {
    id: string;
    caption: string | null;
    type: "experience" | "hangout";
    visibility: "public" | "friends" | "private";
    is_anonymous: boolean;
    created_at: string;
    author_id: string;
    profiles: {
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
    };
    activities: {
      id: string;
      activity_type: string;
      images: string[];
      tags: string[];
    }[];
  };
}

/**
 * [OPTIMIZATION: Phase 3.3] Optimized version using PostgreSQL function
 * Returns LikedPostWithDetails format with all related data included
 */
export async function getLikedPostsWithDetailsForUserOptimized(
  userId: string,
  viewerUserId: string | null = null,
  limit = 20,
  offset = 0
): Promise<{
  data: LikedPostWithDetails[] | null;
  error: any;
}> {
  const dedupeKey = `liked_posts_${userId}_${offset}_${limit}_${
    viewerUserId || "null"
  }`;

  if (import.meta.env.DEV) {
    console.log("[likes] getLikedPostsWithDetailsForUserOptimized ENTER", {
      dedupeKey,
      offset,
      limit,
    });
  }

  try {
    const execResult = await requestManager.execute(
      dedupeKey,
      async (signal: AbortSignal) => {
        if (signal.aborted) throw new Error("Request aborted");

        const { data, error } = await supabase.rpc(
          "get_user_posts_liked_with_related_data",
          {
            p_user_id: userId,
            p_viewer_user_id: viewerUserId || null,
            p_limit: limit,
            p_offset: offset,
          }
        );

        if (signal.aborted) throw new Error("Request aborted");
        return { data, error };
      },
      "high"
    );

    const { data, error } = execResult.data || {
      data: null,
      error: execResult.error,
    };

    if (error) {
      console.error(
        "[getLikedPostsWithDetailsForUserOptimized] RPC error:",
        error
      );
      return { data: null, error };
    }

    if (!data || !data.posts) {
      console.warn(
        "[getLikedPostsWithDetailsForUserOptimized] Invalid response structure"
      );
      return { data: [], error: null };
    }

    // Transform PostgreSQL result to LikedPostWithDetails format
    // Pass through like_count, comment_count, is_liked, is_saved, follow_status when RPC returns them
    const result: LikedPostWithDetails[] = data.posts.map((post: any) => ({
      id: post.like_id,
      post_id: post.id,
      created_at: post.liked_at,
      posts: {
        id: post.id,
        caption: post.caption,
        type: post.type,
        visibility: "public" as const, // Default, privacy already filtered in SQL
        is_anonymous: post.is_anonymous || false,
        anonymous_name: post.anonymous_name,
        anonymous_avatar: post.anonymous_avatar,
        created_at: post.created_at,
        author_id: post.author_id,
        profiles: {
          username: post.author?.username || null,
          display_name: post.author?.display_name || null,
          avatar_url: post.author?.avatar_url || null,
        },
        activities: post.activities || [],
        like_count: post.like_count,
        comment_count: post.comment_count,
        is_liked: post.is_liked,
        is_saved: post.is_saved,
        follow_status: post.follow_status,
        has_images: post.has_images,
      } as any,
    }));

    if (import.meta.env.DEV) {
      console.log("[likes] getLikedPostsWithDetailsForUserOptimized RETURN", {
        dedupeKey,
        offset,
        limit,
      });
    }
    return { data: result, error: null };
  } catch (error: any) {
    console.error("[getLikedPostsWithDetailsForUserOptimized] Error:", error);
    return { data: null, error };
  }
}

/**
 * Get all liked posts with full details for the current user (with caching)
 * [DEPRECATED] Use getLikedPostsWithDetailsForUserOptimized for better performance
 */
export async function getLikedPostsWithDetailsForUser(userId: string): Promise<{
  data: LikedPostWithDetails[] | null;
  error: any;
}> {
  try {
    console.log("Getting liked posts with details for user:", userId);

    // First, get the liked posts for the specified user
    const { data: likedPosts, error: likedError } = await supabase
      .from("post_likes")
      .select("id, post_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (likedError) {
      console.error("Error fetching liked posts:", likedError);
      return { data: null, error: likedError };
    }

    console.log("Found liked posts:", likedPosts);

    if (!likedPosts || likedPosts.length === 0) {
      return { data: [], error: null };
    }

    // Get the post IDs
    const postIds = likedPosts.map((lp) => lp.post_id);

    // Fetch posts with their details
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select(
        `
        id,
        caption,
        type,
        visibility,
        is_anonymous,
        anonymous_name,
        anonymous_avatar,
        created_at,
        author_id,
        profiles!author_id (
          username,
          display_name,
          avatar_url
        ),
        activities (
          id,
          activity_type,
          images,
          tags
        )
      `
      )
      .in("id", postIds);

    if (postsError) {
      console.error("Error fetching posts:", postsError);
      return { data: null, error: postsError };
    }

    console.log("Found posts:", posts);

    // Combine liked posts with post details
    const result = likedPosts
      .map((likedPost) => {
        const post = posts?.find((p) => p.id === likedPost.post_id);
        return {
          id: likedPost.id,
          post_id: likedPost.post_id,
          created_at: likedPost.created_at,
          posts: post,
        };
      })
      .filter((item) => item.posts); // Filter out any posts that weren't found

    console.log("Final result:", result);

    return { data: result as unknown as LikedPostWithDetails[], error: null };
  } catch (error) {
    console.error("Get liked posts with details error:", error);
    return { data: null, error };
  }
}

export async function getLikedPostsWithDetails(): Promise<{
  data: LikedPostWithDetails[] | null;
  error: any;
}> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    console.log("Getting liked posts with details for user:", userId);

    // First, get the liked posts
    const { data: likedPosts, error: likedError } = await supabase
      .from("post_likes")
      .select("id, post_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (likedError) {
      console.error("Error fetching liked posts:", likedError);
      return { data: null, error: likedError };
    }

    console.log("Found liked posts:", likedPosts);

    if (!likedPosts || likedPosts.length === 0) {
      return { data: [], error: null };
    }

    // Get the post IDs
    const postIds = likedPosts.map((lp) => lp.post_id);

    // Fetch posts with their details
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select(
        `
        id,
        caption,
        type,
        visibility,
        is_anonymous,
        anonymous_name,
        anonymous_avatar,
        created_at,
        author_id,
        profiles!author_id (
          username,
          display_name,
          avatar_url
        ),
        activities (
          id,
          activity_type,
          images,
          tags
        )
      `
      )
      .in("id", postIds);

    if (postsError) {
      console.error("Error fetching posts:", postsError);
      return { data: null, error: postsError };
    }

    console.log("Found posts:", posts);

    // Combine liked posts with post details
    const result = likedPosts
      .map((likedPost) => {
        const post = posts?.find((p) => p.id === likedPost.post_id);
        return {
          id: likedPost.id,
          post_id: likedPost.post_id,
          created_at: likedPost.created_at,
          posts: post,
        };
      })
      .filter((item) => item.posts); // Filter out any posts that weren't found

    console.log("Final result:", result);

    return { data: result as unknown as LikedPostWithDetails[], error: null };
  } catch (error) {
    console.error("Get liked posts with details error:", error);
    return { data: null, error };
  }
}
