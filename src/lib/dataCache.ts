// src/lib/dataCache.ts
// Simple in-memory cache with TTL for API responses
// [OPTIMIZATION: Phase 1 - Storage Abstraction] Now uses unified storage layer
// [PHASE 2.2] Integrated with SmartCacheValidator for unified cache validation

import type { StorageManager } from './storage/StorageManager';
import { getStorageManager } from './storage/StorageManager';
import { cacheValidator, CACHE_SCHEMA_VERSION, type CacheEntry } from './cacheValidation';
import { getCacheDurationMultiplier } from './connectionAware';

const DEBUG_DATACACHE = false;
const dcDbg = (...a: Parameters<typeof console.log>) => {
  if (!DEBUG_DATACACHE) return;
  console.log(...a);
};
const dcDbgVerbose = (...a: Parameters<typeof console.debug>) => {
  if (!DEBUG_DATACACHE) return;
  console.debug(...a);
};

// [PHASE 2.2] Use CacheEntry from cacheValidation for consistency
// CacheEntry interface is now defined in cacheValidation.ts

class DataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly LOCAL_STORAGE_KEY = "echotoo_cache";
  private readonly MAX_CACHE_SIZE = 15; // Maximum number of cached post sets
  
  // [OPTIMIZATION: Phase 1 - Storage Abstraction] Optional storage manager
  // If available, uses unified storage layer for better performance and Capacitor support
  private storageManager: StorageManager | null = null;
  private useStorageManager: boolean = false;
  private migrationInProgress: boolean = false; // Track migration to prevent duplicate migrations
  
  // [PHASE 2.3 - FIX] Promise that resolves when preload is complete
  // Why: Ensures cache is ready before use, preventing cache misses on second load
  private _readyPromise: Promise<void>;
  public get ready(): Promise<void> {
    return this._readyPromise;
  }

  constructor() {
    // [PHASE 1.2] Version checking is now handled by unified cacheVersionManager
    // Called during app startup in initializeDefaultStorage.ts
    this.initializeStorageManager();
    // [PHASE 2.1] Migrate existing cache data to StorageManager
    // [PHASE 2.3 - FIX] Preload must complete before cache is used
    this._readyPromise = Promise.all([
      this.migrateLegacyCacheToStorageManager(),
      this.loadFromStorageManager(),
    ]).then(() => {
      dcDbg('[DataCache] ✅ DataCache is now ready after preload');
    }).catch((error) => {
      console.warn('[DataCache] Preload completed with errors (cache will still work):', error);
      // Don't throw - cache will work, just might miss on first access
    });
  }

  // [OPTIMIZATION: Phase 1 - Storage Abstraction] Initialize storage manager if available
  private initializeStorageManager(): void {
    try {
      this.storageManager = getStorageManager();
      this.useStorageManager = true;
      dcDbg('[DataCache] Using unified storage layer');
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

      dcDbg(`[DataCache] Migrating ${feedKeys.length} feed cache entries to StorageManager`);

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
        dcDbg(`[DataCache] Successfully migrated ${migratedCount} feed cache entries to StorageManager`);
      }
    } catch (error) {
      console.warn('[DataCache] Cache migration failed:', error);
      // Continue with legacy mode if migration fails
    } finally {
      this.migrationInProgress = false;
    }
  }

  // [PHASE 1.1] Load feed data from StorageManager into memory cache on startup
  // Why: Ensures cached data is available synchronously on first get() call
  // Prevents cache misses and unnecessary API calls
  private async loadFromStorageManager(): Promise<void> {
    if (!this.useStorageManager || !this.storageManager) {
      return;
    }

    try {
      // Get all feed cache keys from StorageManager
      const feedKeys = await this.storageManager.keys("feed:");
      
      if (feedKeys.length === 0) {
        return; // No feed data to load
      }

      dcDbg(`[DataCache] Preloading ${feedKeys.length} feed cache entries from StorageManager`);

      // Load each feed entry into memory cache
      let loadedCount = 0;
      for (const key of feedKeys) {
        try {
          const entry = await this.storageManager.get<CacheEntry<any>>(key);
          if (entry) {
            // StorageManager already checked expiration, so entry is valid
            // Load into memory cache for fast synchronous access
            this.cache.set(key, entry);
            loadedCount++;
          }
        } catch (error) {
          // Continue with other keys - don't fail entire preload for one key
          dcDbgVerbose(`[DataCache] Failed to load key ${key} from StorageManager:`, error);
        }
      }

      if (loadedCount > 0) {
        dcDbg(`[DataCache] Successfully preloaded ${loadedCount} feed cache entries into memory`);
      }
    } catch (error) {
      // Don't throw - preload failure shouldn't break the app
      // Cache will be populated on-demand via get() method
      console.warn('[DataCache] Failed to preload feed cache from StorageManager:', error);
    }
  }

  // [PHASE 1.2] Version checking removed - now handled by unified cacheVersionManager
  // The unified version manager clears all caches (including dataCache) on startup
  // if the version changes. This prevents duplicate version checking logic.

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

    // [PHASE 1.1] For feed data, use StorageManager only (legacy localStorage removed)
    if (key.startsWith("feed:")) {
      if (this.useStorageManager && this.storageManager) {
        // [PHASE 1.1] Primary path: Use StorageManager (better performance, Capacitor support)
        this.storageManager.set(key, entry, adjustedTtl).catch((error) => {
          // Log error but don't fallback - will fetch from API on next get()
          console.warn('[DataCache] StorageManager failed, will fetch from API on next access:', error);
        });
      } else {
        // StorageManager not available - this is expected if not initialized
        // Use debug log instead of warning to reduce console noise
        // Data will be fetched from API on next get() call
        dcDbgVerbose('[DataCache] StorageManager not available, will fetch from API on next access');
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

    // [PHASE 1.1] For feed data, try StorageManager (legacy localStorage removed)
    // Note: StorageManager is async, but we maintain synchronous API for backward compatibility
    // We try StorageManager (async load into memory), returns null if not found (triggers API call)
    if (key.startsWith("feed:")) {
      // [PHASE 1.1] Try StorageManager (primary path)
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
          // Silently fail - will fetch from API on next access
          dcDbgVerbose('[DataCache] StorageManager load failed, will fetch from API:', error);
        });
      }
      // No localStorage fallback - returns null to trigger API call
    }

    return null;
  }


  // [OPTIMIZATION: Phase 6 - Connection] Get adjusted TTL based on connection speed
  // Why: Longer cache duration on slow connections
  private getAdjustedTtl(baseTtl: number): number {
    try {
      const multiplier = getCacheDurationMultiplier();
      return baseTtl * multiplier;
    } catch {
      // Fallback if connectionAware not available
      return baseTtl;
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

    // [PHASE 1.1] Clear from unified storage (legacy localStorage removed)
    if (this.useStorageManager && this.storageManager) {
      try {
        const feedKeys = await this.storageManager.keys("feed:");
        await Promise.all(feedKeys.map((key) => this.storageManager!.delete(key)));
        dcDbg(
          `[DataCache] Cleared ${feedKeys.length} feed cache entries from unified storage`
        );
      } catch (error) {
        console.warn("[DataCache] Failed to clear feed cache from unified storage:", error);
      }
    }

    dcDbg(
      `[DataCache] Cleared ${keysToDelete.length} feed cache entries from memory`
    );
  }

  // Generate cache key from feed options
  // [CACHE FIX] Now includes viewerProfileId for user-specific caching (security fix)
  // [OPTIMIZATION: Phase 1.2 - Horizontal Rail] Added filters parameter for horizontal rail filtering
  generateFeedKey(opts: {
    type?: string;
    q?: string;
    tags?: string[];
    filters?: string[]; // Filter types: "friends", "today", "anonymous"
    limit?: number;
    offset?: number;
    viewerProfileId?: string | null; // User-specific cache key (prevents cross-user data leakage)
    occursOn?: string | null;
    occursTz?: string | null;
  }): string {
    const { type, q, tags, filters, limit, offset, viewerProfileId, occursOn, occursTz } =
      opts;
    // Include viewerProfileId in key to prevent cross-user cache pollution
    // Defaults to "guest" for backward compatibility
    const userId = viewerProfileId || "guest";
    // Sort filters for consistent key generation (order doesn't matter for filtering)
    const filtersKey = filters && filters.length > 0 
      ? filters.slice().sort().join(",") 
      : "";
    const occursOnSeg = occursOn || "";
    const occursTzSeg = occursTz || "";
    return `feed:${type || "all"}:${q || ""}:${tags?.join(",") || ""}:${filtersKey}:${
      limit || 12
    }:${offset || 0}:${occursOnSeg}:${occursTzSeg}:${userId}`;
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
      dcDbg(
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
    dcDbg("[DataCache] Using cached data, no new posts found");
    return cachedData;
  }

  // [REMOVED] prefetchRelatedData() - obsolete batch loader replaced by PostgreSQL RPC functions
  // All related data now comes from optimized database functions:
  // - get_feed_with_related_data (home feed)
  // - get_user_posts_created_with_related_data (profile posts)
  // - get_post_detail_with_related_data (detail pages)
  // - get_rsvp_list_with_profiles (RSVP lists)

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
      dcDbg("[DataCache] Prefetching next page:", nextPageOpts);

      // Import getPublicFeed dynamically to avoid circular dependency
      try {
        const { getPublicFeed } = await import("../api/queries/getPublicFeed");
        const nextPageData = await getPublicFeed(nextPageOpts);

        // Cache the prefetched data
        this.set(nextPageKey, nextPageData, 2 * 60 * 1000); // 2 minutes TTL
        dcDbg("[DataCache] Successfully prefetched and cached next page");
      } catch (error) {
        dcDbg("[DataCache] Failed to prefetch next page:", error);
      }
    }
  }

  // Prefetch user profiles for posts being displayed
  async prefetchUserProfiles(userIds: string[]): Promise<void> {
    // This would integrate with your user profile fetching system
    dcDbg("[DataCache] Prefetching user profiles for:", userIds);
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
