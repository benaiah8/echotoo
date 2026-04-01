// Cache for follow request status to improve performance and prevent flickering
// No expiration - cache is cleared only when follow request status changes
// Note: This uses the same follows table as followStatusCache, but provides
// specific functions for follow request operations (pending/approved/declined)
// [PHASE 1.2] Migrated to StorageManager for better performance and Capacitor support

import { getStorageManager } from "./storage/StorageManager";

const FOLLOW_REQUEST_STATUS_CACHE_KEY = "follow_request_status_cache";
const STORAGE_PREFIX = "follow_request_status:"; // [PHASE 1.2] StorageManager prefix

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

export type FollowRequestStatus = "pending" | "approved" | "declined";

interface FollowRequestStatusCacheEntry {
  status: FollowRequestStatus;
}

interface FollowRequestStatusCache {
  [key: string]: FollowRequestStatusCacheEntry; // key format: "followerId-followingId"
}

// Generate cache key from follower and following profile IDs
function getCacheKey(followerId: string, followingId: string): string {
  return `${followerId}-${followingId}`;
}

// Get cached follow request status
// [PHASE 1.2] Uses localStorage for synchronous access (backward compatibility)
// StorageManager is used for writes, but reads use localStorage for instant access
export function getCachedFollowRequestStatus(
  followerId: string,
  followingId: string
): FollowRequestStatus | null {
  try {
    if (!followerId || !followingId) return null;

    // [PHASE 1.2] Use legacy localStorage for synchronous access (backward compatibility)
    // StorageManager is used for writes, but reads use localStorage for instant access
    // This ensures backward compatibility while benefiting from StorageManager for writes
    const cache = getFromLocalStorageLegacy<FollowRequestStatusCache>(FOLLOW_REQUEST_STATUS_CACHE_KEY);
    if (!cache) return null;

    const key = getCacheKey(followerId, followingId);
    const entry = cache[key];

    if (!entry) return null;

    return entry.status;
  } catch (error) {
    console.error("Error reading follow request status cache:", error);
    return null;
  }
}

// Set cached follow request status
// [PHASE 1.2] Now uses StorageManager with localStorage fallback
// Note: No TTL - cache is cleared only when follow request status changes
export function setCachedFollowRequestStatus(
  followerId: string,
  followingId: string,
  status: FollowRequestStatus
): void {
  try {
    if (!followerId || !followingId) return;

    const storage = getStorage();
    const key = getCacheKey(followerId, followingId);
    const storageKey = `${STORAGE_PREFIX}${key}`;
    const entry: FollowRequestStatusCacheEntry = {
      status,
    };
    // No expiration - cache is cleared only when follow request status changes
    // Use a very long TTL (1 year) since cache is manually invalidated
    const longTtl = 365 * 24 * 60 * 60 * 1000; // 1 year

    // [PHASE 1.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, longTtl).catch((error) => {
        console.warn("[FollowRequestStatusCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // [PHASE 1.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<FollowRequestStatusCache>(FOLLOW_REQUEST_STATUS_CACHE_KEY) || {};
    cache[key] = entry;
    setToLocalStorageLegacy(FOLLOW_REQUEST_STATUS_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error setting follow request status cache:", error);
  }
}

// Clear cached follow request status for a specific follow relationship
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearCachedFollowRequestStatus(
  followerId: string,
  followingId: string
): void {
  try {
    if (!followerId || !followingId) return;

    const storage = getStorage();
    const key = getCacheKey(followerId, followingId);
    const storageKey = `${STORAGE_PREFIX}${key}`;

    // [PHASE 1.2] Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    const cache = getFromLocalStorageLegacy<FollowRequestStatusCache>(FOLLOW_REQUEST_STATUS_CACHE_KEY);
    if (!cache) return;

    if (cache[key]) {
      delete cache[key];
      setToLocalStorageLegacy(FOLLOW_REQUEST_STATUS_CACHE_KEY, cache);
    }
  } catch (error) {
    console.error("Error clearing follow request status cache:", error);
  }
}

// Clear all follow request status cache (for cleanup)
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearAllFollowRequestStatusCache(): void {
  try {
    const storage = getStorage();

    // [PHASE 1.2] Clear all follow request status entries from StorageManager
    if (storage && storage.keys) {
      storage.keys(STORAGE_PREFIX).then((keys) => {
        // Delete all keys with the follow_request_status prefix
        return Promise.all(keys.map((key) => storage.delete(key)));
      }).catch(() => {
        // Ignore errors - StorageManager may not be available
      });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    try {
      localStorage.removeItem(FOLLOW_REQUEST_STATUS_CACHE_KEY);
    } catch (error) {
      console.error("[FollowRequestStatusCache] Error clearing localStorage:", error);
    }
  } catch (error) {
    console.error("Error clearing all follow request status cache:", error);
  }
}

