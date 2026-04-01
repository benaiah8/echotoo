// Cache for full invite data to improve performance
// [OPTIMIZATION: Phase 2] Short-term cache (30 seconds) to prevent duplicate sequential requests
import { getStorageManager } from "./storage/StorageManager";
import { getCacheDurationMultiplier } from "./connectionAware";

const INVITE_DATA_CACHE_KEY = "invite_data_cache";
const STORAGE_PREFIX = "invite_data:"; // StorageManager prefix
const BASE_CACHE_DURATION = 30 * 1000; // 30 seconds (short cache for sequential requests)

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

interface InviteDataCacheEntry {
  invite: any; // Full invite data
  timestamp: number;
}

interface InviteDataCache {
  [inviteId: string]: InviteDataCacheEntry;
}

/**
 * Get cached invite data
 * Returns null if cache miss or expired
 */
export function getCachedInviteData(inviteId: string): any | null {
  try {
    const cache = getFromLocalStorageLegacy<InviteDataCache>(INVITE_DATA_CACHE_KEY);
    if (!cache) return null;

    const entry = cache[inviteId];
    if (!entry) return null;

    // Check if cache is expired
    if (Date.now() - entry.timestamp > getCacheDuration()) {
      // Remove expired entry
      delete cache[inviteId];
      setToLocalStorageLegacy(INVITE_DATA_CACHE_KEY, cache);
      return null;
    }

    return entry.invite;
  } catch (error) {
    console.error("Error reading invite data cache:", error);
    return null;
  }
}

/**
 * Set cached invite data
 */
export function setCachedInviteData(inviteId: string, invite: any): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${inviteId}`;
    const entry: InviteDataCacheEntry = {
      invite,
      timestamp: Date.now(),
    };
    const ttl = getCacheDuration();

    // Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, ttl).catch((error) => {
        console.warn("[InviteDataCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<InviteDataCache>(INVITE_DATA_CACHE_KEY) || {};
    cache[inviteId] = entry;
    setToLocalStorageLegacy(INVITE_DATA_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error setting invite data cache:", error);
  }
}

/**
 * Clear cached invite data for a specific invite
 */
export function clearCachedInviteData(inviteId: string): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${inviteId}`;

    // Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // Clear from legacy localStorage
    const cache = getFromLocalStorageLegacy<InviteDataCache>(INVITE_DATA_CACHE_KEY);
    if (!cache) return;

    delete cache[inviteId];
    setToLocalStorageLegacy(INVITE_DATA_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error clearing invite data cache:", error);
  }
}

/**
 * Clear all invite data caches (e.g., on logout)
 */
export function clearAllInviteDataCache(): void {
  try {
    const storage = getStorage();

    // Clear from StorageManager (all keys with prefix)
    if (storage) {
      // Note: StorageManager doesn't have a "clear all with prefix" method
      // We'll rely on localStorage clearing for now
    }

    // Clear from legacy localStorage
    localStorage.removeItem(INVITE_DATA_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all invite data cache:", error);
  }
}

