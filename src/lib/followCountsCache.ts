// Cache for follow counts to improve performance
// [OPTIMIZATION: Phase 3.2] Migrated to StorageManager for better performance and Capacitor support
import { getStorageManager } from "./storage/StorageManager";
import { getCacheDurationMultiplier } from "./connectionAware";

const FOLLOW_COUNTS_CACHE_KEY = "follow_counts_cache";
const STORAGE_PREFIX = "counts:"; // [OPTIMIZATION: Phase 3.2] StorageManager prefix
const BASE_CACHE_DURATION = 2 * 60 * 1000; // [OPTIMIZATION: Phase 3.2] 2 minutes for own profile (was 5 min)

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

// [OPTIMIZATION: Phase 3.2] Get StorageManager instance (with fallback)
function getStorage(): { get: (key: string) => Promise<any>; set: (key: string, value: any, ttl?: number) => Promise<void>; delete: (key: string) => Promise<void> } | null {
  try {
    return getStorageManager();
  } catch {
    return null;
  }
}

// [OPTIMIZATION: Phase 3.2] Legacy localStorage fallback for backward compatibility
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

interface FollowCountsCacheEntry {
  following: number;
  followers: number;
  timestamp: number;
}

interface FollowCountsCache {
  [profileId: string]: FollowCountsCacheEntry;
}

// Get cached follow counts
// [OPTIMIZATION: Phase 3.2] Now uses StorageManager with localStorage fallback
// Note: Function remains synchronous for backward compatibility
export function getCachedFollowCounts(profileId: string): {
  following: number;
  followers: number;
} | null {
  try {
    // [OPTIMIZATION: Phase 3.2] Use legacy localStorage for synchronous access (backward compatibility)
    const cache = getFromLocalStorageLegacy<FollowCountsCache>(FOLLOW_COUNTS_CACHE_KEY);
    if (!cache) return null;

    const entry = cache[profileId];
    if (!entry) return null;

    // [OPTIMIZATION: Phase 6 - Connection] Use connection-aware cache duration
    if (Date.now() - entry.timestamp > getCacheDuration()) {
      // Remove expired entry
      delete cache[profileId];
      setToLocalStorageLegacy(FOLLOW_COUNTS_CACHE_KEY, cache);
      return null;
    }

    return {
      following: entry.following,
      followers: entry.followers,
    };
  } catch (error) {
    console.error("Error reading follow counts cache:", error);
    return null;
  }
}

// Set cached follow counts
// [OPTIMIZATION: Phase 3.2] Now uses StorageManager with localStorage fallback
export function setCachedFollowCounts(
  profileId: string,
  counts: { following: number; followers: number }
): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${profileId}`;
    const entry: FollowCountsCacheEntry = {
      ...counts,
      timestamp: Date.now(),
    };
    const ttl = getCacheDuration();

    // [OPTIMIZATION: Phase 3.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, ttl).catch((error) => {
        console.warn("[FollowCountsCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // [OPTIMIZATION: Phase 3.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<FollowCountsCache>(FOLLOW_COUNTS_CACHE_KEY) || {};
    cache[profileId] = entry;
    setToLocalStorageLegacy(FOLLOW_COUNTS_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error setting follow counts cache:", error);
  }
}

// Clear cached follow counts for a specific profile
// [OPTIMIZATION: Phase 3.2] Now clears from both StorageManager and localStorage
export function clearCachedFollowCounts(profileId: string): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${profileId}`;

    // [OPTIMIZATION: Phase 3.2] Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // [OPTIMIZATION: Phase 3.2] Clear from legacy localStorage
    const cache = getFromLocalStorageLegacy<FollowCountsCache>(FOLLOW_COUNTS_CACHE_KEY);
    if (!cache) return;

    delete cache[profileId];
    setToLocalStorageLegacy(FOLLOW_COUNTS_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error clearing follow counts cache:", error);
  }
}

