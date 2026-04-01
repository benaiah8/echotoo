// Cache for available tags to improve performance
// [OPTIMIZATION: Phase 2] Tags caching with RequestManager deduplication
import { getStorageManager } from "./storage/StorageManager";
import { getCacheDurationMultiplier } from "./connectionAware";

const TAGS_CACHE_KEY = "tags_cache";
const STORAGE_PREFIX = "tags:"; // StorageManager prefix
const BASE_CACHE_DURATION = 30 * 1000; // 30 seconds (tags don't change frequently, but short cache for freshness)

// [OPTIMIZATION: Phase 6 - Connection] Get cache duration based on connection speed
function getCacheDuration(): number {
  try {
    const multiplier = getCacheDurationMultiplier();
    return BASE_CACHE_DURATION * multiplier;
  } catch {
    return BASE_CACHE_DURATION;
  }
}

// Get StorageManager instance (with fallback)
function getStorage(): { get: (key: string) => Promise<any>; set: (key: string, value: any, ttl?: number) => Promise<void>; delete: (key: string) => Promise<void> } | null {
  try {
    return getStorageManager();
  } catch {
    return null;
  }
}

// Legacy localStorage fallback for backward compatibility
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

interface TagsCacheEntry {
  tags: string[];
  timestamp: number;
}

/**
 * Get cached tags
 * Returns null if cache miss or expired
 */
export function getCachedTags(): string[] | null {
  try {
    const cache = getFromLocalStorageLegacy<TagsCacheEntry>(TAGS_CACHE_KEY);
    if (!cache) return null;

    // Check if cache is expired
    if (Date.now() - cache.timestamp > getCacheDuration()) {
      // Remove expired entry
      localStorage.removeItem(TAGS_CACHE_KEY);
      return null;
    }

    return cache.tags;
  } catch (error) {
    console.error("Error reading tags cache:", error);
    return null;
  }
}

/**
 * Set cached tags
 */
export function setCachedTags(tags: string[]): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}available`;
    const entry: TagsCacheEntry = {
      tags,
      timestamp: Date.now(),
    };
    const ttl = getCacheDuration();

    // Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, ttl).catch((error) => {
        console.warn("[TagsCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // Also store in legacy localStorage (for backward compatibility and sync access)
    setToLocalStorageLegacy(TAGS_CACHE_KEY, entry);
  } catch (error) {
    console.error("Error setting tags cache:", error);
  }
}

/**
 * Clear cached tags (e.g., when new posts are created with new tags)
 */
export function clearCachedTags(): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}available`;

    // Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // Clear from legacy localStorage
    localStorage.removeItem(TAGS_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing tags cache:", error);
  }
}

