// Cache for notification settings to improve performance
// No expiration - cache is cleared only when notification settings change or when unfollowing
// [PHASE 1.2] Migrated to StorageManager for better performance and Capacitor support

import { getStorageManager } from "./storage/StorageManager";

const NOTIFICATION_SETTINGS_CACHE_KEY = "notification_settings_cache";
const STORAGE_PREFIX = "notification_settings:"; // [PHASE 1.2] StorageManager prefix

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

interface NotificationSettingsCacheEntry {
  enabled: boolean;
}

interface NotificationSettingsCache {
  [key: string]: NotificationSettingsCacheEntry; // key format: "viewerId-targetProfileId"
}

// Generate cache key from viewer and target profile IDs
function getCacheKey(viewerId: string, targetProfileId: string): string {
  return `${viewerId}-${targetProfileId}`;
}

// Get cached notification settings
// [PHASE 1.2] Uses localStorage for synchronous access (backward compatibility)
// StorageManager is used for writes, but reads use localStorage for instant access
export function getCachedNotificationSettings(
  viewerId: string,
  targetProfileId: string
): boolean | null {
  try {
    if (!viewerId || !targetProfileId) return null;

    // [PHASE 1.2] Use legacy localStorage for synchronous access (backward compatibility)
    // StorageManager is used for writes, but reads use localStorage for instant access
    // This ensures backward compatibility while benefiting from StorageManager for writes
    const cache = getFromLocalStorageLegacy<NotificationSettingsCache>(NOTIFICATION_SETTINGS_CACHE_KEY);
    if (!cache) return null;

    const key = getCacheKey(viewerId, targetProfileId);
    const entry = cache[key];

    if (!entry) return null;

    return entry.enabled;
  } catch (error) {
    console.error("Error reading notification settings cache:", error);
    return null;
  }
}

// Set cached notification settings
// [PHASE 1.2] Now uses StorageManager with localStorage fallback
// Note: No TTL - cache is cleared only when notification settings change or when unfollowing
export function setCachedNotificationSettings(
  viewerId: string,
  targetProfileId: string,
  enabled: boolean
): void {
  try {
    if (!viewerId || !targetProfileId) return;

    const storage = getStorage();
    const key = getCacheKey(viewerId, targetProfileId);
    const storageKey = `${STORAGE_PREFIX}${key}`;
    const entry: NotificationSettingsCacheEntry = {
      enabled,
    };
    // No expiration - cache is cleared only when notification settings change or when unfollowing
    // Use a very long TTL (1 year) since cache is manually invalidated
    const longTtl = 365 * 24 * 60 * 60 * 1000; // 1 year

    // [PHASE 1.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, longTtl).catch((error) => {
        console.warn("[NotificationSettingsCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // [PHASE 1.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<NotificationSettingsCache>(NOTIFICATION_SETTINGS_CACHE_KEY) || {};
    cache[key] = entry;
    setToLocalStorageLegacy(NOTIFICATION_SETTINGS_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error setting notification settings cache:", error);
  }
}

// Clear cached notification settings for a specific profile
// This clears all settings involving this profile (as viewer or target)
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearCachedNotificationSettings(profileId: string): void {
  try {
    const storage = getStorage();

    // [PHASE 1.2] Get all notification settings entries from localStorage to find matching keys
    const cache = getFromLocalStorageLegacy<NotificationSettingsCache>(NOTIFICATION_SETTINGS_CACHE_KEY);
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
      setToLocalStorageLegacy(NOTIFICATION_SETTINGS_CACHE_KEY, cache);
    }
  } catch (error) {
    console.error("Error clearing notification settings cache:", error);
  }
}

// Clear all notification settings cache (useful for logout or cache reset)
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearAllNotificationSettingsCache(): void {
  try {
    const storage = getStorage();

    // [PHASE 1.2] Clear all notification settings entries from StorageManager
    if (storage && storage.keys) {
      storage.keys(STORAGE_PREFIX).then((keys) => {
        // Delete all keys with the notification_settings prefix
        return Promise.all(keys.map((key) => storage.delete(key)));
      }).catch(() => {
        // Ignore errors - StorageManager may not be available
      });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    try {
      localStorage.removeItem(NOTIFICATION_SETTINGS_CACHE_KEY);
    } catch (error) {
      console.error("[NotificationSettingsCache] Error clearing localStorage:", error);
    }
  } catch (error) {
    console.error("Error clearing all notification settings cache:", error);
  }
}

