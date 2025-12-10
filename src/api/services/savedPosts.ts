import { supabase } from "../../lib/supabaseClient";
import { clearCachedProfilePosts } from "../../lib/profilePostsCache";

// Cache for saved posts to reduce egress
const SAVED_POSTS_CACHE_KEY = "saved_posts_cache";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedSavedPosts {
  data: SavedPostWithDetails[];
  timestamp: number;
  userId: string;
}

// Helper functions for caching
export function getCachedSavedPosts(userId: string): SavedPostWithDetails[] | null {
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("saved_posts")
      .insert({
        user_id: user.id,
        post_id: postId,
      })
      .select("*")
      .single();

    // Invalidate cache when saving
    if (!error) {
      invalidateSavedPostsCache();
      // Also clear profile posts cache for saved tab
      clearCachedProfilePosts(user.id, "saved");
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("saved_posts")
      .delete()
      .eq("user_id", user.id)
      .eq("post_id", postId);

    // Invalidate cache when unsaving
    if (!error) {
      invalidateSavedPostsCache();
      // Also clear profile posts cache for saved tab
      clearCachedProfilePosts(user.id, "saved");
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("saved_posts")
      .select("id")
      .eq("user_id", user.id)
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
 * Get all saved posts for the current user
 */
export async function getSavedPosts(): Promise<{
  data: SavedPostWithDetails[] | null;
  error: any;
}> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    console.log("Getting saved posts for user:", user.id);

    // Check cache first
    const cachedData = getCachedSavedPosts(user.id);
    if (cachedData) {
      return { data: cachedData, error: null };
    }

    // First, get the saved posts
    const { data: savedPosts, error: savedError } = await supabase
      .from("saved_posts")
      .select("id, post_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (savedError) {
      console.error("Error fetching saved posts:", savedError);
      return { data: null, error: savedError };
    }

    console.log("Found saved posts:", savedPosts);

    if (!savedPosts || savedPosts.length === 0) {
      const emptyResult: SavedPostWithDetails[] = [];
      setCachedSavedPosts(user.id, emptyResult);
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
    const result = savedPosts
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

    // Cache the result
    setCachedSavedPosts(user.id, result as unknown as SavedPostWithDetails[]);

    return { data: result as unknown as SavedPostWithDetails[], error: null };
  } catch (error) {
    console.error("Get saved posts error:", error);
    return { data: null, error };
  }
}
