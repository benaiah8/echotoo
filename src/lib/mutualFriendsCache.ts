// src/lib/mutualFriendsCache.ts
// Cache for mutual friends list to minimize egress data
// [OPTIMIZATION: Phase 1.2 - Horizontal Rail] Caches mutual friends Set for reuse
// [PHASE 1.2] Migrated to StorageManager for better performance and Capacitor support

import { supabase } from "./supabaseClient";
import { getCacheDurationMultiplier } from "./connectionAware";
import { getStorageManager } from "./storage/StorageManager";

interface MutualFriendsCacheEntry {
  mutualFriendIds: string[]; // Array of profile IDs (Set converted to array for JSON storage)
  timestamp: number;
}

interface MutualFriendsCache {
  [viewerProfileId: string]: MutualFriendsCacheEntry;
}

const BASE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes base
const CACHE_KEY = "mutual_friends_cache";
const STORAGE_PREFIX = "mutual:"; // [PHASE 1.2] StorageManager prefix

// [PHASE 1.2] Get StorageManager instance (with fallback)
function getStorage(): {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any, ttl?: number) => Promise<void>;
  delete: (key: string) => Promise<void>;
  keys: (prefix?: string) => Promise<string[]>;
} | null {
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

// [OPTIMIZATION: Phase 6 - Connection] Get cache duration based on connection speed
// Why: Longer cache duration on slow connections to reduce network requests
function getCacheDuration(): number {
  try {
    const multiplier = getCacheDurationMultiplier();
    return BASE_CACHE_DURATION * multiplier;
  } catch {
    // Fallback if connectionAware not available
    return BASE_CACHE_DURATION;
  }
}

/**
 * Get cached mutual friends for a viewer
 * Returns null if not cached or expired
 * [PHASE 1.2] Uses localStorage for synchronous access (backward compatibility)
 * StorageManager is used for writes, but reads use localStorage for instant access
 */
function getCachedMutualFriends(viewerProfileId: string): Set<string> | null {
  try {
    // [PHASE 1.2] Use legacy localStorage for synchronous access (backward compatibility)
    // StorageManager is used for writes, but reads use localStorage for instant access
    // This ensures backward compatibility while benefiting from StorageManager for writes
    const cache = getFromLocalStorageLegacy<MutualFriendsCache>(CACHE_KEY);
    if (!cache) return null;

    const entry = cache[viewerProfileId];
    if (!entry) return null;

    // Check if cache is expired
    const cacheDuration = getCacheDuration();
    if (Date.now() - entry.timestamp > cacheDuration) {
      // Remove expired entry
      delete cache[viewerProfileId];
      setToLocalStorageLegacy(CACHE_KEY, cache);
      return null;
    }

    // Convert array back to Set
    return new Set(entry.mutualFriendIds);
  } catch (error) {
    console.error("[MutualFriendsCache] Error reading cache:", error);
    return null;
  }
}

/**
 * Set cached mutual friends for a viewer
 * [PHASE 1.2] Now uses StorageManager with localStorage fallback
 */
function setCachedMutualFriends(
  viewerProfileId: string,
  mutualFriendIds: Set<string>
): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${viewerProfileId}`;
    const entry: MutualFriendsCacheEntry = {
      mutualFriendIds: Array.from(mutualFriendIds), // Convert Set to array for JSON storage
      timestamp: Date.now(),
    };
    const ttl = getCacheDuration();

    // [PHASE 1.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, ttl).catch((error) => {
        console.warn(
          "[MutualFriendsCache] StorageManager failed, using localStorage fallback:",
          error
        );
      });
    }

    // [PHASE 1.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache =
      getFromLocalStorageLegacy<MutualFriendsCache>(CACHE_KEY) || {};
    cache[viewerProfileId] = entry;
    setToLocalStorageLegacy(CACHE_KEY, cache);
  } catch (error) {
    console.error("[MutualFriendsCache] Error setting cache:", error);
  }
}

/**
 * Fetch mutual friends from database and cache the result
 * Returns Set of mutual friend profile IDs
 */
async function fetchAndCacheMutualFriends(
  viewerProfileId: string
): Promise<Set<string>> {
  try {
    // Get users who follow you (with status = 'approved')
    const { data: followersData, error: followersError } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("following_id", viewerProfileId)
      .eq("status", "approved");

    if (followersError) {
      console.error(
        "[MutualFriendsCache] Error fetching followers:",
        followersError
      );
      return new Set();
    }

    // Get users you follow (with status = 'approved')
    const { data: followingData, error: followingError } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerProfileId)
      .eq("status", "approved");

    if (followingError) {
      console.error(
        "[MutualFriendsCache] Error fetching following:",
        followingError
      );
      return new Set();
    }

    const followerIds = new Set(followersData?.map((f) => f.follower_id) || []);
    const followingIds = new Set(
      followingData?.map((f) => f.following_id) || []
    );

    // Mutual friends = intersection of followers and following
    const mutualFriendIds = new Set(
      [...followerIds].filter((id) => followingIds.has(id))
    );

    // Cache the result (even if empty - prevents repeated queries)
    setCachedMutualFriends(viewerProfileId, mutualFriendIds);

    return mutualFriendIds;
  } catch (error) {
    console.error("[MutualFriendsCache] Error fetching mutual friends:", error);
    return new Set();
  }
}

/**
 * Get mutual friends for a viewer (cached or fetched)
 * Returns Set of mutual friend profile IDs
 */
export async function getMutualFriends(
  viewerProfileId: string
): Promise<Set<string>> {
  if (!viewerProfileId) {
    return new Set();
  }

  // Check cache first
  const cached = getCachedMutualFriends(viewerProfileId);
  if (cached !== null) {
    return cached;
  }

  // Fetch if not cached
  return await fetchAndCacheMutualFriends(viewerProfileId);
}

/**
 * Clear cached mutual friends for a specific viewer
 * [PHASE 1.2] Now clears from both StorageManager and localStorage
 */
export function clearMutualFriendsCache(viewerProfileId: string): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${viewerProfileId}`;

    // [PHASE 1.2] Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    const cache = getFromLocalStorageLegacy<MutualFriendsCache>(CACHE_KEY);
    if (!cache) return;

    if (cache[viewerProfileId]) {
      delete cache[viewerProfileId];
      setToLocalStorageLegacy(CACHE_KEY, cache);
    }
  } catch (error) {
    console.error(
      "[MutualFriendsCache] Error clearing cache for viewer:",
      error
    );
  }
}

/**
 * Clear all mutual friends cache
 * Called on auth changes to prevent cross-user data leakage
 * [PHASE 1.2] Now clears from both StorageManager and localStorage
 */
export function clearAllMutualFriendsCache(): void {
  try {
    const storage = getStorage();

    // [PHASE 1.2] Clear all mutual friends entries from StorageManager
    if (storage && storage.keys) {
      storage
        .keys(STORAGE_PREFIX)
        .then((keys) => {
          Promise.all(keys.map((key) => storage.delete(key))).catch(() => {
            // Ignore errors
          });
        })
        .catch(() => {
          // Ignore errors
        });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.error("[MutualFriendsCache] Error clearing localStorage:", error);
    }
  } catch (error) {
    console.error("[MutualFriendsCache] Error clearing all cache:", error);
  }
}
