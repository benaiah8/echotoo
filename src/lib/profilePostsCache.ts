// src/lib/profilePostsCache.ts
// Comprehensive cache for profile page posts (created, saved, interacted)

interface ProfilePostsCacheEntry<T> {
  data: T[];
  timestamp: number;
  userId: string;
  version: number; // To handle data structure changes
}

interface CreatedPost {
  id: string;
  caption: string | null;
  created_at: string;
  type: "experience" | "hangout";
  status?: "draft" | "published";
  isDraft?: boolean;
  selected_dates?: string[] | null;
  tags?: string[] | null;
  activities?: any[];
  images?: string[];
}

interface ProfilePostsCache {
  [key: string]: ProfilePostsCacheEntry<any>;
}

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 10; // Cache first 10 posts for each tab
const CACHE_KEY = "profile_posts_cache";
const CACHE_VERSION = 1;

// Helper function to generate cache key for profile posts
function generateProfilePostsKey(
  userId: string,
  tab: "created" | "saved" | "interacted"
): string {
  return `${userId}_${tab}`;
}

// Get cached profile posts
export function getCachedProfilePosts<T>(
  userId: string,
  tab: "created" | "saved" | "interacted"
): T[] | null {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return null;

    const cache: ProfilePostsCache = JSON.parse(cacheStr);
    const key = generateProfilePostsKey(userId, tab);
    const entry = cache[key];

    if (!entry) return null;

    // Check if cache is valid (not expired, correct user, and correct version)
    const now = Date.now();
    if (
      entry.userId === userId &&
      now - entry.timestamp < CACHE_DURATION &&
      entry.version === CACHE_VERSION
    ) {
      console.log(
        `[ProfilePostsCache] Using cached ${tab} posts for user:`,
        userId
      );
      return entry.data as T[];
    }

    // Cache is expired or invalid version, remove it
    delete cache[key];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return null;
  } catch (error) {
    console.error("Error reading cached profile posts:", error);
    return null;
  }
}

// Set cached profile posts
export function setCachedProfilePosts<T>(
  userId: string,
  tab: "created" | "saved" | "interacted",
  data: T[]
): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    const cache: ProfilePostsCache = cacheStr ? JSON.parse(cacheStr) : {};

    const key = generateProfilePostsKey(userId, tab);
    const entry: ProfilePostsCacheEntry<T> = {
      data: data.slice(0, MAX_CACHE_SIZE), // Only cache first MAX_CACHE_SIZE posts
      timestamp: Date.now(),
      userId,
      version: CACHE_VERSION,
    };

    cache[key] = entry;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));

    console.log(
      `[ProfilePostsCache] Cached ${data.length} ${tab} posts for user:`,
      userId
    );
  } catch (error) {
    console.error("Error caching profile posts:", error);
  }
}

// Clear cached profile posts for a specific user and tab
export function clearCachedProfilePosts(
  userId: string,
  tab?: "created" | "saved" | "interacted"
): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return;

    const cache: ProfilePostsCache = JSON.parse(cacheStr);

    if (tab) {
      // Clear specific tab
      const key = generateProfilePostsKey(userId, tab);
      delete cache[key];
    } else {
      // Clear all tabs for user
      const keys = Object.keys(cache).filter((key) =>
        key.startsWith(`${userId}_`)
      );
      keys.forEach((key) => delete cache[key]);
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    console.log(
      `[ProfilePostsCache] Cleared cached ${tab || "all"} posts for user:`,
      userId
    );
  } catch (error) {
    console.error("Error clearing cached profile posts:", error);
  }
}

// Clear all profile posts cache
export function clearAllProfilePostsCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log("[ProfilePostsCache] Cleared all profile posts cache");
  } catch (error) {
    console.error("Error clearing all profile posts cache:", error);
  }
}

// Preload images for cached posts
export async function preloadProfilePostImages<
  T extends { activities?: any[]; images?: string[] }
>(posts: T[]): Promise<void> {
  try {
    const imageUrls: string[] = [];

    posts.forEach((post) => {
      // Collect images from activities
      if (post.activities) {
        post.activities.forEach((activity: any) => {
          if (activity.images && Array.isArray(activity.images)) {
            imageUrls.push(...activity.images);
          }
          if (activity.image_url && typeof activity.image_url === "string") {
            imageUrls.push(activity.image_url);
          }
        });
      }

      // Collect images directly from post
      if (post.images && Array.isArray(post.images)) {
        imageUrls.push(...post.images);
      }
    });

    // Preload unique images
    const uniqueUrls = [...new Set(imageUrls)].filter(
      (url) => url && url.trim()
    );

    if (uniqueUrls.length > 0) {
      console.log(`[ProfilePostsCache] Preloading ${uniqueUrls.length} images`);

      // Preload images in background
      uniqueUrls.forEach((url) => {
        const img = new Image();
        img.src = url;
      });
    }
  } catch (error) {
    console.warn("[ProfilePostsCache] Failed to preload images:", error);
  }
}

// Smart cache update - removes oldest and adds new posts when needed
export function updateProfilePostsCache<T>(
  userId: string,
  tab: "created" | "saved" | "interacted",
  newPosts: T[]
): T[] {
  try {
    const cachedPosts = getCachedProfilePosts<T>(userId, tab);

    if (!cachedPosts) {
      // No existing cache, just cache the new posts
      setCachedProfilePosts(userId, tab, newPosts);
      return newPosts;
    }

    // Check for new posts (compare by ID or created_at)
    const cachedIds = new Set(
      cachedPosts.map((post: any) => post.id || post.post_id || post.created_at)
    );

    const newPostIds = new Set(
      newPosts.map((post: any) => post.id || post.post_id || post.created_at)
    );

    // Find truly new posts
    const trulyNewPosts = newPosts.filter((post: any) => {
      const postId = post.id || post.post_id || post.created_at;
      return !cachedIds.has(postId);
    });

    if (trulyNewPosts.length > 0) {
      console.log(
        `[ProfilePostsCache] Found ${trulyNewPosts.length} new ${tab} posts, updating cache`
      );

      // Combine new posts with cached ones, keeping limit
      const updatedCache = [...trulyNewPosts, ...cachedPosts].slice(
        0,
        MAX_CACHE_SIZE
      );
      setCachedProfilePosts(userId, tab, updatedCache);

      // Preload images for new posts
      preloadProfilePostImages(trulyNewPosts as any[]);

      return updatedCache;
    }

    // No new posts, return cached data
    console.log(
      `[ProfilePostsCache] No new ${tab} posts found, using cached data`
    );
    return cachedPosts;
  } catch (error) {
    console.error("Error updating profile posts cache:", error);
    // Fallback to caching new posts
    setCachedProfilePosts(userId, tab, newPosts);
    return newPosts;
  }
}

// Export types for use in components
export type { CreatedPost };
