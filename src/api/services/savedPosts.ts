import { supabase } from "../../lib/supabaseClient";
import { requestManager } from "../../lib/requestManager";
import { isDraftPostId } from "../../lib/drafts";
import { getViewerAuthUserId } from "./follows";
import { invalidateOnSave } from "../../lib/cacheInvalidation";
import { emitPostChanged } from "../../lib/postEvents";

// Cache for saved posts to reduce egress
const SAVED_POSTS_CACHE_KEY = "saved_posts_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedSavedPosts {
  data: SavedPostWithDetails[];
  timestamp: number;
  userId: string;
}

// Helper functions for caching
export function getCachedSavedPosts(
  userId: string
): SavedPostWithDetails[] | null {
  try {
    const cached = localStorage.getItem(SAVED_POSTS_CACHE_KEY);
    if (!cached) return null;

    const parsed: CachedSavedPosts = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is valid (not expired and for correct user)
    if (parsed.userId === userId && now - parsed.timestamp < CACHE_DURATION) {
      console.log("Using cached saved posts");
      return parsed.data;
    }

    return null;
  } catch (error) {
    console.error("Error reading cached saved posts:", error);
    return null;
  }
}

function setCachedSavedPosts(
  userId: string,
  data: SavedPostWithDetails[]
): void {
  try {
    const cache: CachedSavedPosts = {
      data,
      timestamp: Date.now(),
      userId,
    };
    localStorage.setItem(SAVED_POSTS_CACHE_KEY, JSON.stringify(cache));
    console.log("Cached saved posts");
  } catch (error) {
    console.error("Error caching saved posts:", error);
    // If quota exceeded, try to clear old cache and retry
    if (error instanceof Error && error.name === "QuotaExceededError") {
      try {
        localStorage.removeItem(SAVED_POSTS_CACHE_KEY);
        console.log("Cleared old cache due to quota exceeded");
      } catch (clearError) {
        console.error("Error clearing cache:", clearError);
      }
    }
  }
}

function invalidateSavedPostsCache(): void {
  try {
    localStorage.removeItem(SAVED_POSTS_CACHE_KEY);
    console.log("Invalidated saved posts cache");
  } catch (error) {
    console.error("Error invalidating cache:", error);
  }
}

export interface SavedPost {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
}

export interface SavedPostWithDetails {
  id: string;
  post_id: string;
  created_at: string;
  posts: {
    id: string;
    caption: string;
    type: "experience" | "hangout";
    visibility: "public" | "friends" | "private";
    is_anonymous: boolean;
    created_at: string;
    author_id: string;
    profiles: {
      username: string;
      display_name: string;
      avatar_url: string;
    };
    activities: {
      id: string;
      activity_type: string;
      image_url: string;
      description: string;
      location_notes: string;
      location_url: string;
      additional_info: any;
      tags: string[];
    }[];
  };
}

/**
 * Save a post for the current user
 */
export async function savePost(
  postId: string
): Promise<{ data: SavedPost | null; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    // Use upsert to handle duplicate saves gracefully (prevents 409 errors)
    const { data, error } = await supabase
      .from("saved_posts")
      .upsert(
        {
          user_id: userId,
          post_id: postId,
        },
        {
          onConflict: "user_id,post_id", // Handle duplicate constraint
          ignoreDuplicates: false, // Return the existing row if duplicate
        }
      )
      .select("*")
      .single();

    // Invalidate cache when saving
    if (!error) {
      invalidateSavedPostsCache();
      invalidateOnSave(postId, userId);
      emitPostChanged(postId, { viewerSaved: true });
    }

    return { data, error };
  } catch (error) {
    console.error("Save post error:", error);
    return { data: null, error };
  }
}

/**
 * Unsave a post for the current user
 */
export async function unsavePost(
  postId: string
): Promise<{ data: any; error: any }> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("saved_posts")
      .delete()
      .eq("user_id", userId)
      .eq("post_id", postId);

    // Invalidate cache when unsaving
    if (!error) {
      invalidateSavedPostsCache();
      invalidateOnSave(postId, userId);
      emitPostChanged(postId, { viewerSaved: false });
    }

    return { data, error };
  } catch (error) {
    console.error("Unsave post error:", error);
    return { data: null, error };
  }
}

/**
 * Check if a post is saved by the current user
 */
export async function isPostSaved(
  postId: string
): Promise<{ data: boolean; error: any }> {
  try {
    if (isDraftPostId(postId)) {
      return { data: false, error: null };
    }
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("saved_posts")
      .select("id")
      .eq("user_id", userId)
      .eq("post_id", postId)
      .maybeSingle(); // Use maybeSingle instead of single to handle 0 rows gracefully

    if (error) {
      console.error("Check saved post error:", error);
      return { data: false, error };
    }

    return { data: !!data, error: null };
  } catch (error) {
    console.error("Check saved post error:", error);
    return { data: false, error };
  }
}

/**
 * [OPTIMIZATION: Phase 3.3] Optimized version using PostgreSQL function
 * Returns SavedPostWithDetails format with all related data included
 */
export async function getSavedPostsOptimized(
  userId: string,
  viewerUserId: string | null = null,
  limit = 20,
  offset = 0
): Promise<{
  data: SavedPostWithDetails[] | null;
  error: any;
}> {
  const dedupeKey = `saved_posts_${userId}_${offset}_${limit}_${
    viewerUserId || "null"
  }`;

  try {
    const execResult = await requestManager.execute(
      dedupeKey,
      async (signal: AbortSignal) => {
        if (signal.aborted) throw new Error("Request aborted");

        const { data, error } = await supabase.rpc(
          "get_user_posts_saved_with_related_data",
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
      console.error("[getSavedPostsOptimized] RPC error:", error);
      return { data: null, error };
    }

    if (!data || !data.posts) {
      console.warn("[getSavedPostsOptimized] Invalid response structure");
      return { data: [], error: null };
    }

    // Transform PostgreSQL result to SavedPostWithDetails format
    // Pass through like_count, comment_count, is_liked, is_saved, follow_status when RPC returns them
    const result: SavedPostWithDetails[] = data.posts.map((post: any) => ({
      id: post.saved_post_id,
      post_id: post.id,
      created_at: post.saved_at,
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
      console.log("[saved] getSavedPostsOptimized RETURN", {
        dedupeKey,
        offset,
        limit,
      });
    }
    return { data: result, error: null };
  } catch (error: any) {
    console.error("[getSavedPostsOptimized] Error:", error);
    return { data: null, error };
  }
}

/**
 * Get all saved posts for the current user
 * [DEPRECATED] Use getSavedPostsOptimized for better performance
 */
export async function getSavedPosts(): Promise<{
  data: SavedPostWithDetails[] | null;
  error: any;
}> {
  try {
    const userId = await getViewerAuthUserId();
    if (!userId) throw new Error("Not authenticated");

    console.log("Getting saved posts for user:", userId);

    // Check cache first
    const cachedData = getCachedSavedPosts(userId);
    if (cachedData) {
      return { data: cachedData, error: null };
    }

    // First, get the saved posts
    const { data: savedPosts, error: savedError } = await supabase
      .from("saved_posts")
      .select("id, post_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (savedError) {
      console.error("Error fetching saved posts:", savedError);
      return { data: null, error: savedError };
    }

    console.log("Found saved posts:", savedPosts);

    if (!savedPosts || savedPosts.length === 0) {
      const emptyResult: SavedPostWithDetails[] = [];
      setCachedSavedPosts(userId, emptyResult);
      return { data: emptyResult, error: null };
    }

    // Get the post IDs
    const postIds = savedPosts.map((sp) => sp.post_id);

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

    // Combine saved posts with post details
    let result = savedPosts
      .map((savedPost) => {
        const post = posts?.find((p) => p.id === savedPost.post_id);
        return {
          id: savedPost.id,
          post_id: savedPost.post_id,
          created_at: savedPost.created_at,
          posts: post,
        };
      })
      .filter((item) => item.posts); // Filter out any posts that weren't found

    console.log("Final result:", result);

    // [OPTIMIZATION: Phase 1 - Privacy Filter] Filter saved posts by privacy
    // Why: Hide saved posts from private accounts that viewer can't access
    if (result.length > 0) {
      const { filterPostsByPrivacy } = await import(
        "../../lib/postPrivacyFilter"
      );
      const { getViewerId } = await import("./follows");
      const viewerProfileId = await getViewerId();
      result = await filterPostsByPrivacy(result, viewerProfileId);
    }

    // Cache the result
    setCachedSavedPosts(userId, result as unknown as SavedPostWithDetails[]);

    return { data: result as unknown as SavedPostWithDetails[], error: null };
  } catch (error) {
    console.error("Get saved posts error:", error);
    return { data: null, error };
  }
}
