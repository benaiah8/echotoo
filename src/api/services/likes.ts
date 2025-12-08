import { supabase } from "../../lib/supabaseClient";
import { clearCachedProfilePosts } from "../../lib/profilePostsCache";

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
 * Like a post for the current user
 */
export async function likePost(
  postId: string
): Promise<{ data: PostLike | null; error: any }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("post_likes")
      .insert({
        user_id: user.id,
        post_id: postId,
      })
      .select("*")
      .single();

    // Invalidate cache when liking
    if (!error) {
      invalidateLikesCache();
      // Also clear profile posts cache for interacted tab
      clearCachedProfilePosts(user.id, "interacted");
    }

    return { data, error };
  } catch (error) {
    console.error("Like post error:", error);
    return { data: null, error };
  }
}

/**
 * Unlike a post for the current user
 */
export async function unlikePost(
  postId: string
): Promise<{ data: any; error: any }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("post_likes")
      .delete()
      .eq("user_id", user.id)
      .eq("post_id", postId);

    // Invalidate cache when unliking
    if (!error) {
      invalidateLikesCache();
      // Also clear profile posts cache for interacted tab
      clearCachedProfilePosts(user.id, "interacted");
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Skip checking for draft posts (they have invalid UUIDs)
    if (postId.startsWith("draft-")) {
      return { data: false, error: null };
    }

    const { data, error } = await supabase
      .from("post_likes")
      .select("id")
      .eq("user_id", user.id)
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    console.log("Getting liked posts for user:", user.id);

    // Check cache first
    const cachedData = getCachedLikes(user.id);
    if (cachedData) {
      const likedPostIds = Object.entries(cachedData)
        .filter(([_, isLiked]) => isLiked)
        .map(([postId, _]) => postId);
      return { data: likedPostIds, error: null };
    }

    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", user.id)
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
    setCachedLikes(user.id, likeMap);

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
 * Get all liked posts with full details for the current user (with caching)
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    console.log("Getting liked posts with details for user:", user.id);

    // First, get the liked posts
    const { data: likedPosts, error: likedError } = await supabase
      .from("post_likes")
      .select("id, post_id, created_at")
      .eq("user_id", user.id)
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
