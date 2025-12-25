// src/lib/dataCache.ts
// Simple in-memory cache with TTL for API responses
// [OPTIMIZATION: Phase 1 - Storage Abstraction] Now uses unified storage layer
// [PHASE 2.2] Integrated with SmartCacheValidator for unified cache validation

import type { StorageManager } from './storage/StorageManager';
import { getStorageManager } from './storage/StorageManager';
import { cacheValidator, CACHE_SCHEMA_VERSION, type CacheEntry } from './cacheValidation';

// [PHASE 2.2] Use CacheEntry from cacheValidation for consistency
// CacheEntry interface is now defined in cacheValidation.ts

class DataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly LOCAL_STORAGE_KEY = "echotoo_cache";
  private readonly MAX_CACHE_SIZE = 15; // Maximum number of cached post sets
  // [PWA FIX] Cache version for invalidation on updates
  // [CACHE FIX] Bumped to v3 to invalidate old cache without user ID
  private readonly CACHE_VERSION = "v3";
  private readonly CACHE_VERSION_KEY = "echotoo_cache_version";
  
  // [OPTIMIZATION: Phase 1 - Storage Abstraction] Optional storage manager
  // If available, uses unified storage layer for better performance and Capacitor support
  private storageManager: StorageManager | null = null;
  private useStorageManager: boolean = false;
  private migrationInProgress: boolean = false; // Track migration to prevent duplicate migrations

  constructor() {
    this.checkCacheVersion();
    this.loadFromLocalStorage();
    this.initializeStorageManager();
    // [PHASE 2.1] Migrate existing cache data to StorageManager
    this.migrateLegacyCacheToStorageManager();
  }

  // [OPTIMIZATION: Phase 1 - Storage Abstraction] Initialize storage manager if available
  private initializeStorageManager(): void {
    try {
      this.storageManager = getStorageManager();
      this.useStorageManager = true;
      console.log('[DataCache] Using unified storage layer');
    } catch {
      // Storage manager not initialized yet, use legacy mode
      this.useStorageManager = false;
    }
  }

  // [PHASE 2.1] Migrate existing localStorage cache to StorageManager
  // Why: One-time migration to move data to unified storage for better performance
  private async migrateLegacyCacheToStorageManager(): Promise<void> {
    if (!this.useStorageManager || !this.storageManager || this.migrationInProgress) {
      return;
    }

    // Check if migration already completed
    try {
      const migrationFlag = localStorage.getItem('echotoo_cache_migrated_to_storage_manager');
      if (migrationFlag === 'true') {
        return; // Already migrated
      }
    } catch {
      // Ignore errors checking migration flag
    }

    this.migrationInProgress = true;

    try {
      // Get all feed cache entries from localStorage
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (!stored) {
        return; // No data to migrate
      }

      const cacheData = JSON.parse(stored);
      const feedKeys = Object.keys(cacheData).filter((k) => k.startsWith("feed:"));

      if (feedKeys.length === 0) {
        return; // No feed data to migrate
      }

      console.log(`[DataCache] Migrating ${feedKeys.length} feed cache entries to StorageManager`);

      // Migrate each feed entry to StorageManager
      let migratedCount = 0;
      for (const key of feedKeys) {
        try {
          const entry = cacheData[key];
          if (entry && entry.data && entry.timestamp && entry.ttl) {
            // Check if expired - skip expired entries
            const isExpired = Date.now() - entry.timestamp > entry.ttl;
            if (!isExpired) {
              // Store in StorageManager
              await this.storageManager!.set(key, entry, entry.ttl);
              migratedCount++;
            }
          }
        } catch (error) {
          console.warn(`[DataCache] Failed to migrate key ${key}:`, error);
          // Continue with other keys
        }
      }

      // Mark migration as complete
      if (migratedCount > 0) {
        localStorage.setItem('echotoo_cache_migrated_to_storage_manager', 'true');
        console.log(`[DataCache] Successfully migrated ${migratedCount} feed cache entries to StorageManager`);
      }
    } catch (error) {
      console.warn('[DataCache] Cache migration failed:', error);
      // Continue with legacy mode if migration fails
    } finally {
      this.migrationInProgress = false;
    }
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
    // [PHASE 2.2] Use SmartCacheValidator for TTL management
    // If ttlMs is provided, use it; otherwise, infer from key type
    let adjustedTtl = ttlMs;
    if (key.startsWith('feed:')) {
      // Use SmartCacheValidator for feed data
      adjustedTtl = cacheValidator.getTTL('feed');
    } else {
      // [OPTIMIZATION: Phase 6 - Connection] Adjust TTL based on connection speed
      // Why: Longer cache duration on slow connections to reduce network requests
      adjustedTtl = this.getAdjustedTtl(ttlMs);
    }

    // [PHASE 2.2] Create entry with schema version
    const entry = cacheValidator.createEntry(data, adjustedTtl, CACHE_SCHEMA_VERSION);

    // Always update in-memory cache for fast access
    this.cache.set(key, entry);

    // [PHASE 2.1] For feed data, use StorageManager as primary path, with legacy localStorage as fallback
    if (key.startsWith("feed:")) {
      if (this.useStorageManager && this.storageManager) {
        // [PHASE 2.1] Primary path: Use StorageManager (better performance, Capacitor support)
        this.storageManager.set(key, entry, adjustedTtl).catch((error) => {
          // Fallback to legacy localStorage if storage manager fails
          console.warn('[DataCache] StorageManager failed, falling back to localStorage:', error);
          this.saveToLocalStorage(key, entry);
        });
      } else {
        // Legacy localStorage for feed data (fallback if StorageManager not available)
        this.saveToLocalStorage(key, entry);
      }
    }
  }

  get<T>(key: string): T | null {
    // First check in-memory cache (fastest)
    const entry = this.cache.get(key);
    if (entry) {
      const isExpired = Date.now() - entry.timestamp > entry.ttl;
      if (isExpired) {
        this.cache.delete(key);
        return null;
      }
      return entry.data as T;
    }

    // [PHASE 2.1] For feed data, try StorageManager first (primary path), then fallback to legacy localStorage
    // Note: StorageManager is async, but we maintain synchronous API for backward compatibility
    // We try StorageManager first (async load into memory), then fallback to legacy localStorage (synchronous)
    if (key.startsWith("feed:")) {
      // [PHASE 2.1] Try StorageManager first (primary path)
      if (this.useStorageManager && this.storageManager) {
        // Load asynchronously from StorageManager and populate memory cache
        // This ensures next access is fast (from memory)
        // Note: StorageManager already handles expiration checking internally
        this.storageManager.get<CacheEntry<T>>(key).then((entry) => {
          if (entry) {
            // StorageManager already checked expiration, so entry is valid
            // Load back into memory cache for fast access
            this.cache.set(key, entry);
          }
        }).catch((error) => {
          // Silently fail - will try legacy localStorage as fallback
          console.debug('[DataCache] StorageManager load failed, trying legacy localStorage:', error);
        });
      }

      // Fallback to legacy localStorage (synchronous, for immediate return)
      const legacyData = this.getFromLocalStorageLegacy<T>(key);
      if (legacyData) {
        return legacyData;
      }
    }

    return null;
  }

  // Legacy localStorage getter (for backward compatibility)
  private getFromLocalStorageLegacy<T>(key: string): T | null {
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
  // [OPTIMIZATION: Phase 1 - Storage Abstraction] Now also clears unified storage
  async clearFeedCache(): Promise<void> {
    // Clear in-memory cache entries that start with "feed:"
    const keysToDelete: string[] = [];
    this.cache.forEach((_, key) => {
      if (key.startsWith("feed:")) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.cache.delete(key));

    // [OPTIMIZATION: Phase 1 - Storage Abstraction] Clear from unified storage
    if (this.useStorageManager && this.storageManager) {
      try {
        const feedKeys = await this.storageManager.keys("feed:");
        await Promise.all(feedKeys.map((key) => this.storageManager!.delete(key)));
        console.log(
          `[DataCache] Cleared ${feedKeys.length} feed cache entries from unified storage`
        );
      } catch (error) {
        console.warn("[DataCache] Failed to clear feed cache from unified storage:", error);
      }
    }

    // Clear localStorage feed cache (legacy)
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

  // [PHASE 2.2] Enhanced cache update with SmartCacheValidator
  // Uses unified cache validation logic for consistent behavior
  async updateFeedCache(newPosts: any[], currentOpts: any): Promise<any[]> {
    const currentKey = this.generateFeedKey(currentOpts);
    const cachedEntry = this.cache.get(currentKey);
    const cachedData = cachedEntry ? cachedEntry.data : null;

    // [BATCH LOADER FIX] Disabled prefetchRelatedData - PostgreSQL function already provides all data
    // Why: Batch loader is no longer needed, PostgreSQL function includes follow_status, is_liked, is_saved, rsvp_data
    // Components handle their own lazy loading when data is not provided
    // This prevents unnecessary batch loader calls and reduces console noise
    // if (newPosts.length > 0) {
    //   await this.prefetchRelatedData(newPosts);
    // }

    // [PHASE 2.2] Use SmartCacheValidator for validation
    if (!cachedData || !Array.isArray(cachedData) || cachedData.length === 0) {
      // No cached data or invalid format, just cache the new data
      const ttl = cacheValidator.getTTL('feed');
      this.set(currentKey, newPosts, ttl);
      return newPosts;
    }

    // [PHASE 2.2] Use SmartCacheValidator to detect new posts (Twitter-style)
    const newPostsDetected = cacheValidator.detectNewPosts(cachedData, newPosts);

    if (newPostsDetected.length > 0) {
      console.log(
        `[DataCache] Found ${newPostsDetected.length} new posts (Twitter-style detection), updating cache`
      );

      // Remove oldest posts to make room for new ones, keeping total around limit
      const limit = currentOpts.limit || 15;
      const updatedCache = [...newPostsDetected, ...cachedData].slice(0, limit);

      const ttl = cacheValidator.getTTL('feed');
      this.set(currentKey, updatedCache, ttl);
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
