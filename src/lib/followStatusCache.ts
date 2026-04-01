// Cache for follow status to improve performance
// No expiration - cache is cleared only when follow relationship changes
// [PHASE 1.2] Migrated to StorageManager for better performance and Capacitor support

import { getStorageManager } from "./storage/StorageManager";

const FOLLOW_STATUS_CACHE_KEY = "follow_status_cache";
const STORAGE_PREFIX = "follow_status:"; // [PHASE 1.2] StorageManager prefix

// [PHASE 1.2] Get StorageManager instance (with fallback)
function getStorage(): { get: (key: string) => Promise<any>; set: (key: string, value: any, ttl?: number) => Promise<void>; delete: (key: string) => Promise<void>; keys: (prefix?: string) => Promise<string[]> } | null {
  try {
    return getStorageManager();
  } catch {
    return null;
  }
}

// [PHASE 1.2] Legacy localStorage fallback for backward compatibility
function getFromLocalStorageLegacy<T>(key: string): T | null {
  try {
    const cacheStr = localStorage.getItem(key);
    return cacheStr ? JSON.parse(cacheStr) : null;
  } catch {
    return null;
  }
}

function setToLocalStorageLegacy(key: string, value: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error setting ${key} to localStorage:`, error);
  }
}

export type FollowStatus = "none" | "pending" | "following" | "friends";

interface FollowStatusCacheEntry {
  status: FollowStatus;
}

interface FollowStatusCache {
  [key: string]: FollowStatusCacheEntry; // key format: "viewerId-targetProfileId"
}

// Generate cache key from viewer and target profile IDs
function getCacheKey(viewerId: string, targetProfileId: string): string {
  return `${viewerId}-${targetProfileId}`;
}

// Get cached follow status
// [PHASE 1.2] Uses localStorage for synchronous access (backward compatibility)
// StorageManager is used for writes, but reads use localStorage for instant access
export function getCachedFollowStatus(
  viewerId: string,
  targetProfileId: string
): FollowStatus | null {
  try {
    if (!viewerId || !targetProfileId) return null;

    // [PHASE 1.2] Use legacy localStorage for synchronous access (backward compatibility)
    // StorageManager is used for writes, but reads use localStorage for instant access
    // This ensures backward compatibility while benefiting from StorageManager for writes
    const cache = getFromLocalStorageLegacy<FollowStatusCache>(FOLLOW_STATUS_CACHE_KEY);
    if (!cache) return null;

    const key = getCacheKey(viewerId, targetProfileId);
    const entry = cache[key];

    if (!entry) return null;

    return entry.status;
  } catch (error) {
    console.error("Error reading follow status cache:", error);
    return null;
  }
}

// Set cached follow status
// [PHASE 1.2] Now uses StorageManager with localStorage fallback
// Note: No TTL - cache is cleared only when follow relationship changes
export function setCachedFollowStatus(
  viewerId: string,
  targetProfileId: string,
  status: FollowStatus
): void {
  try {
    if (!viewerId || !targetProfileId) return;

    const storage = getStorage();
    const key = getCacheKey(viewerId, targetProfileId);
    const storageKey = `${STORAGE_PREFIX}${key}`;
    const entry: FollowStatusCacheEntry = {
      status,
    };
    // No expiration - cache is cleared only when follow relationship changes
    // Use a very long TTL (1 year) since cache is manually invalidated
    const longTtl = 365 * 24 * 60 * 60 * 1000; // 1 year

    // [PHASE 1.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, longTtl).catch((error) => {
        console.warn("[FollowStatusCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // [PHASE 1.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<FollowStatusCache>(FOLLOW_STATUS_CACHE_KEY) || {};
    cache[key] = entry;
    setToLocalStorageLegacy(FOLLOW_STATUS_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error setting follow status cache:", error);
  }
}

// Clear cached follow status for a specific profile
// This clears all relationships involving this profile (as viewer or target)
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearCachedFollowStatus(profileId: string): void {
  try {
    const storage = getStorage();

    // [PHASE 1.2] Get all follow status entries from localStorage to find matching keys
    const cache = getFromLocalStorageLegacy<FollowStatusCache>(FOLLOW_STATUS_CACHE_KEY);
    if (!cache) return;

    // Find and remove all cache entries that involve this profileId
    const keysToDelete: string[] = [];
    for (const key of Object.keys(cache)) {
      // Key format is "viewerId-targetProfileId"
      const [viewerId, targetProfileId] = key.split("-");
      if (viewerId === profileId || targetProfileId === profileId) {
        keysToDelete.push(key);
      }
    }

    // [PHASE 1.2] Clear from StorageManager
    if (storage) {
      keysToDelete.forEach((key) => {
        const storageKey = `${STORAGE_PREFIX}${key}`;
        storage.delete(storageKey).catch(() => {
          // Ignore errors
        });
      });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    keysToDelete.forEach((key) => delete cache[key]);
    if (keysToDelete.length > 0) {
      setToLocalStorageLegacy(FOLLOW_STATUS_CACHE_KEY, cache);
    }
  } catch (error) {
    console.error("Error clearing follow status cache:", error);
  }
}

// Clear all follow status cache (useful for logout or cache reset)
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearAllFollowStatusCache(): void {
  try {
    const storage = getStorage();

    // [PHASE 1.2] Clear all follow status entries from StorageManager
    if (storage && storage.keys) {
      storage.keys(STORAGE_PREFIX).then((keys) => {
        // Delete all keys with the follow_status prefix
        return Promise.all(keys.map((key) => storage.delete(key)));
      }).catch(() => {
        // Ignore errors - StorageManager may not be available
      });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    try {
      localStorage.removeItem(FOLLOW_STATUS_CACHE_KEY);
    } catch (error) {
      console.error("[FollowStatusCache] Error clearing localStorage:", error);
    }
  } catch (error) {
    console.error("Error clearing all follow status cache:", error);
  }
}

