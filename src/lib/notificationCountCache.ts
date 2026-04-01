// Cache for notification count to improve performance
// [OPTIMIZATION: Phase 2] Notification count caching with RequestManager deduplication
import { getStorageManager } from "./storage/StorageManager";
import { getCacheDurationMultiplier } from "./connectionAware";

const NOTIFICATION_COUNT_CACHE_KEY = "notification_count_cache";
const STORAGE_PREFIX = "notif_count:"; // StorageManager prefix
const BASE_CACHE_DURATION = 60 * 1000; // 60 seconds (notification count changes frequently)

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

interface NotificationCountCacheEntry {
  count: number;
  timestamp: number;
  userId: string; // Auth user ID to prevent cross-user cache leakage
}

interface NotificationCountCache {
  [userId: string]: NotificationCountCacheEntry;
}

/**
 * Get cached notification count
 * Returns null if cache miss or expired
 */
export function getCachedNotificationCount(userId: string): number | null {
  try {
    const cache = getFromLocalStorageLegacy<NotificationCountCache>(NOTIFICATION_COUNT_CACHE_KEY);
    if (!cache) return null;

    const entry = cache[userId];
    if (!entry) return null;

    // Check if cache is expired
    if (Date.now() - entry.timestamp > getCacheDuration()) {
      // Remove expired entry
      delete cache[userId];
      setToLocalStorageLegacy(NOTIFICATION_COUNT_CACHE_KEY, cache);
      return null;
    }

    return entry.count;
  } catch (error) {
    console.error("Error reading notification count cache:", error);
    return null;
  }
}

/**
 * Set cached notification count
 */
export function setCachedNotificationCount(userId: string, count: number): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${userId}`;
    const entry: NotificationCountCacheEntry = {
      count,
      timestamp: Date.now(),
      userId,
    };
    const ttl = getCacheDuration();

    // Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, ttl).catch((error) => {
        console.warn("[NotificationCountCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<NotificationCountCache>(NOTIFICATION_COUNT_CACHE_KEY) || {};
    cache[userId] = entry;
    setToLocalStorageLegacy(NOTIFICATION_COUNT_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error setting notification count cache:", error);
  }
}

/**
 * Clear cached notification count for a specific user
 */
export function clearCachedNotificationCount(userId: string): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${userId}`;

    // Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // Clear from legacy localStorage
    const cache = getFromLocalStorageLegacy<NotificationCountCache>(NOTIFICATION_COUNT_CACHE_KEY);
    if (!cache) return;

    delete cache[userId];
    setToLocalStorageLegacy(NOTIFICATION_COUNT_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error clearing notification count cache:", error);
  }
}

/**
 * Clear all notification count caches (e.g., on logout)
 */
export function clearAllNotificationCountCache(): void {
  try {
    const storage = getStorage();

    // Clear from StorageManager (all keys with prefix)
    if (storage) {
      // Note: StorageManager doesn't have a "clear all with prefix" method
      // We'll rely on localStorage clearing for now
      // In the future, we could iterate through StorageManager keys
    }

    // Clear from legacy localStorage
    localStorage.removeItem(NOTIFICATION_COUNT_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all notification count cache:", error);
  }
}

