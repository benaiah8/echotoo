// src/lib/dataCache.ts
// Simple in-memory cache with TTL for API responses

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class DataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly LOCAL_STORAGE_KEY = "echotoo_cache";
  private readonly MAX_CACHE_SIZE = 15; // Maximum number of cached post sets
  // [PWA FIX] Cache version for invalidation on updates
  // [CACHE FIX] Bumped to v3 to invalidate old cache without user ID
  private readonly CACHE_VERSION = "v3";
  private readonly CACHE_VERSION_KEY = "echotoo_cache_version";

  constructor() {
    this.checkCacheVersion();
    this.loadFromLocalStorage();
  }

  // [PWA FIX] Check cache version and clear if version changed
  private checkCacheVersion(): void {
    try {
      const storedVersion = localStorage.getItem(this.CACHE_VERSION_KEY);
      if (storedVersion !== this.CACHE_VERSION) {
        // Clear all cache on version change
        this.cache.clear();
        localStorage.removeItem(this.LOCAL_STORAGE_KEY);
        localStorage.setItem(this.CACHE_VERSION_KEY, this.CACHE_VERSION);
        console.log("[DataCache] Cache version changed, cleared cache");
      }
    } catch (error) {
      console.warn("[DataCache] Failed to check cache version:", error);
    }
  }

  set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
    // [OPTIMIZATION: Phase 6 - Connection] Adjust TTL based on connection speed
    // Why: Longer cache duration on slow connections to reduce network requests
    const adjustedTtl = this.getAdjustedTtl(ttlMs);

    const entry = {
      data,
      timestamp: Date.now(),
      ttl: adjustedTtl,
    };

    this.cache.set(key, entry);

    // Also save to localStorage for persistence
    if (key.startsWith("feed:")) {
      this.saveToLocalStorage(key, entry);
    }
  }

  get<T>(key: string): T | null {
    // First check in-memory cache
    const entry = this.cache.get(key);
    if (entry) {
      const isExpired = Date.now() - entry.timestamp > entry.ttl;
      if (isExpired) {
        this.cache.delete(key);
        return null;
      }
      return entry.data as T;
    }

    // If not in memory, try localStorage for feed data
    if (key.startsWith("feed:")) {
      try {
        const stored = this.getFromLocalStorage(key);
        if (stored) {
          const isExpired = Date.now() - stored.timestamp > stored.ttl;
          if (isExpired) {
            this.removeFromLocalStorage(key);
            return null;
          }
          // Load back into memory cache
          this.cache.set(key, stored);
          return stored.data as T;
        }
      } catch (error) {
        // PWA FIX: localStorage access might fail in PWA - retry once
        console.warn("[DataCache] localStorage access failed, retrying:", error);
        try {
          // Small delay and retry (PWA might need time to initialize localStorage)
          const retryStored = this.getFromLocalStorage(key);
          if (retryStored) {
            const isExpired = Date.now() - retryStored.timestamp > retryStored.ttl;
            if (!isExpired) {
              this.cache.set(key, retryStored);
              return retryStored.data as T;
            }
          }
        } catch (retryError) {
          console.warn("[DataCache] Retry also failed:", retryError);
          // Return null on failure - will fetch from API
        }
      }
    }

    return null;
  }

  // [OPTIMIZATION: Phase 6 - Connection] Get adjusted TTL based on connection speed
  // Why: Longer cache duration on slow connections
  private getAdjustedTtl(baseTtl: number): number {
    try {
      const { getCacheDurationMultiplier } = require("./connectionAware");
      const multiplier = getCacheDurationMultiplier();
      return baseTtl * multiplier;
    } catch {
      // Fallback if connectionAware not available
      return baseTtl;
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        const cacheData = JSON.parse(stored);
        Object.entries(cacheData).forEach(([key, value]: [string, any]) => {
          if (key.startsWith("feed:")) {
            // Only load feed data, and only if it's not expired
            const isExpired = Date.now() - value.timestamp > value.ttl;
            if (!isExpired) {
              this.cache.set(key, value);
            }
          }
        });
      }
    } catch (error) {
      console.warn("Failed to load cache from localStorage:", error);
    }
  }

  private saveToLocalStorage(key: string, entry: CacheEntry<any>): void {
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      const cacheData = stored ? JSON.parse(stored) : {};

      // Remove oldest entries if we exceed max size
      const feedKeys = Object.keys(cacheData).filter((k) =>
        k.startsWith("feed:")
      );
      if (feedKeys.length >= this.MAX_CACHE_SIZE) {
        // Sort by timestamp and remove oldest
        feedKeys.sort(
          (a, b) => cacheData[a].timestamp - cacheData[b].timestamp
        );
        const oldestKey = feedKeys[0];
        delete cacheData[oldestKey];
      }

      cacheData[key] = entry;
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.warn("Failed to save cache to localStorage:", error);
    }
  }

  private getFromLocalStorage(key: string): CacheEntry<any> | null {
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        const cacheData = JSON.parse(stored);
        return cacheData[key] || null;
      }
    } catch (error) {
      console.warn("Failed to get cache from localStorage:", error);
    }
    return null;
  }

  private removeFromLocalStorage(key: string): void {
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        const cacheData = JSON.parse(stored);
        delete cacheData[key];
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(cacheData));
      }
    } catch (error) {
      console.warn("Failed to remove cache from localStorage:", error);
    }
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // [CACHE FIX] Clear all feed-related cache entries (both in-memory and localStorage)
  // Why: Called on auth change to prevent cross-user data leakage
  clearFeedCache(): void {
    // Clear in-memory cache entries that start with "feed:"
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.startsWith("feed:")) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.cache.delete(key));

    // Clear localStorage feed cache
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        const cacheData = JSON.parse(stored);
        const feedKeys = Object.keys(cacheData).filter((k) =>
          k.startsWith("feed:")
        );
        feedKeys.forEach((key) => {
          delete cacheData[key];
        });
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(cacheData));
        console.log(
          `[DataCache] Cleared ${feedKeys.length} feed cache entries from localStorage`
        );
      }
    } catch (error) {
      console.warn("[DataCache] Failed to clear feed cache from localStorage:", error);
    }

    console.log(
      `[DataCache] Cleared ${keysToDelete.length} feed cache entries from memory`
    );
  }

  // Generate cache key from feed options
  // [CACHE FIX] Now includes viewerProfileId for user-specific caching (security fix)
  generateFeedKey(opts: {
    type?: string;
    q?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
    viewerProfileId?: string | null; // User-specific cache key (prevents cross-user data leakage)
  }): string {
    const { type, q, tags, limit, offset, viewerProfileId } = opts;
    // Include viewerProfileId in key to prevent cross-user cache pollution
    // Defaults to "guest" for backward compatibility
    const userId = viewerProfileId || "guest";
    return `feed:${type || "all"}:${q || ""}:${tags?.join(",") || ""}:${
      limit || 12
    }:${offset || 0}:${userId}`;
  }

  // Enhanced cache update that includes related data (follow status, RSVP, profiles)
  async updateFeedCache(newPosts: any[], currentOpts: any): Promise<any[]> {
    const currentKey = this.generateFeedKey(currentOpts);
    const cachedData = this.get<any[]>(currentKey);

    // [BATCH LOADER FIX] Disabled prefetchRelatedData - PostgreSQL function already provides all data
    // Why: Batch loader is no longer needed, PostgreSQL function includes follow_status, is_liked, is_saved, rsvp_data
    // Components handle their own lazy loading when data is not provided
    // This prevents unnecessary batch loader calls and reduces console noise
    // if (newPosts.length > 0) {
    //   await this.prefetchRelatedData(newPosts);
    // }

    if (!cachedData || !Array.isArray(cachedData) || cachedData.length === 0) {
      // No cached data or invalid format, just cache the new data
      this.set(currentKey, newPosts, 10 * 60 * 1000); // 10 minutes TTL
      return newPosts;
    }

    // Check if there are new posts at the beginning
    const cachedPostIds = new Set(cachedData.map((post) => post.id));
    const newPostIds = new Set(newPosts.map((post) => post.id));

    // Find truly new posts (not in cache)
    const trulyNewPosts = newPosts.filter(
      (post) => !cachedPostIds.has(post.id)
    );

    if (trulyNewPosts.length > 0) {
      console.log(
        `[DataCache] Found ${trulyNewPosts.length} new posts, updating cache`
      );

      // Remove oldest posts to make room for new ones, keeping total around limit
      const limit = currentOpts.limit || 15;
      const updatedCache = [...trulyNewPosts, ...cachedData].slice(0, limit);

      this.set(currentKey, updatedCache, 10 * 60 * 1000);
      return updatedCache;
    }

    // No new posts, return cached data for faster loading
    console.log("[DataCache] Using cached data, no new posts found");
    return cachedData;
  }

  // [OPTIMIZATION: Phase 1 - Batch] Prefetch related data for posts using batch loader
  // Why: Replaces individual queries per post with batched queries, reducing ~50 queries to ~5-8
  async prefetchRelatedData(posts: any[]): Promise<void> {
    try {
      if (!posts || !Array.isArray(posts) || posts.length === 0) return;

      // Import cache functions and batch loader dynamically to avoid circular dependencies
      const { getCachedFollowStatus, setCachedFollowStatus } = await import(
        "./followStatusCache"
      );
      const { getCachedRSVPData, setCachedRSVPData } = await import(
        "./rsvpCache"
      );
      const { getCachedProfile, setCachedProfile } = await import(
        "./profileCache"
      );
      const { supabase } = await import("../lib/supabaseClient");
      const { loadBatchData } = await import("./batchDataLoader");

      // Get current user for follow status checks
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;

      if (!currentUserId) return;

      // Get profile ID for current user
      const { data: currentUserProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (!currentUserProfile) return;

      // Extract data from posts for batch loading
      const postIds = posts.map((post) => post.id).filter(Boolean);
      const authorIds = [
        ...new Set(
          posts.map((post) => post.author_id || post.author?.id).filter(Boolean)
        ),
      ];
      const hangoutPostIds = posts
        .filter((post) => post.type === "hangout")
        .map((post) => post.id)
        .filter(Boolean);

      // Check what's already cached to optimize batch loading
      // We'll still pass all IDs to batch loader, but skip caching if already cached
      const uncachedHangoutPostIds: string[] = [];

      // Check RSVP cache (only check RSVP since it's the most expensive)
      for (const postId of hangoutPostIds) {
        const cached = getCachedRSVPData(postId);
        if (!cached) {
          uncachedHangoutPostIds.push(postId);
        }
      }

      // Use batch loader to fetch all data
      // Note: Batch loader is efficient even if some data is cached - it batches queries
      // We pass all IDs and let batch loader handle it, then we update caches
      const batchResult = await loadBatchData({
        postIds: postIds, // All post IDs (for like/save status - no cache yet)
        authorIds: authorIds, // All author IDs (for follow status and profiles)
        hangoutPostIds: hangoutPostIds, // All hangout post IDs (batch loader handles efficiently)
        currentUserId: currentUserId,
        currentProfileId: currentUserProfile.id,
      });

      // Update follow status cache (only if not already cached)
      batchResult.followStatuses.forEach((status, authorId) => {
        if (authorId !== currentUserProfile.id) {
          const cached = getCachedFollowStatus(currentUserProfile.id, authorId);
          if (!cached) {
            setCachedFollowStatus(currentUserProfile.id, authorId, status);
          }
        }
      });

      // Update RSVP cache (only if not already cached)
      batchResult.rsvpData.forEach((rsvpData, postId) => {
        const cached = getCachedRSVPData(postId);
        if (!cached) {
          setCachedRSVPData(postId, rsvpData.users, rsvpData.currentUserStatus);
        }
      });

      // Update profile cache (only if not already cached)
      batchResult.profiles.forEach((profile, profileId) => {
        const cached = getCachedProfile(profileId);
        if (!cached) {
          setCachedProfile(profile);
        }
      });

      // Note: Like and save statuses are returned in batchResult but not cached yet
      // Components will use them directly from the batch result when we integrate in Step 4

      console.log(
        "[DataCache] Successfully prefetched related data for",
        posts.length,
        "posts using batch loader"
      );
    } catch (error) {
      console.warn("[DataCache] Failed to prefetch related data:", error);
      // Don't throw - allow app to continue even if prefetching fails
    }
  }

  // Prefetch related data
  async prefetchFeedData(currentOpts: any): Promise<void> {
    // Prefetch next page
    const nextPageOpts = {
      ...currentOpts,
      offset: (currentOpts.offset || 0) + (currentOpts.limit || 12),
    };

    const nextPageKey = this.generateFeedKey(nextPageOpts);

    // Only prefetch if not already cached
    if (!this.cache.has(nextPageKey)) {
      console.log("[DataCache] Prefetching next page:", nextPageOpts);

      // Import getPublicFeed dynamically to avoid circular dependency
      try {
        const { getPublicFeed } = await import("../api/queries/getPublicFeed");
        const nextPageData = await getPublicFeed(nextPageOpts);

        // Cache the prefetched data
        this.set(nextPageKey, nextPageData, 2 * 60 * 1000); // 2 minutes TTL
        console.log("[DataCache] Successfully prefetched and cached next page");
      } catch (error) {
        console.log("[DataCache] Failed to prefetch next page:", error);
      }
    }
  }

  // Prefetch user profiles for posts being displayed
  async prefetchUserProfiles(userIds: string[]): Promise<void> {
    // This would integrate with your user profile fetching system
    console.log("[DataCache] Prefetching user profiles for:", userIds);
    // Implementation would depend on your profile fetching endpoint
  }
}

// Export singleton instance
export const dataCache = new DataCache();

// Helper function to cache feed results
export function cacheFeedResult(
  key: string,
  data: any[],
  ttlMs: number = 2 * 60 * 1000
): void {
  dataCache.set(key, data, ttlMs);
}

// Helper function to get cached feed result
export function getCachedFeedResult<T>(key: string): T[] | null {
  return dataCache.get<T[]>(key);
}
