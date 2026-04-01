// Cache for invite status to improve performance and prevent flickering
// No expiration - cache is cleared only when invite status changes
// [PHASE 1.2] Migrated to StorageManager for better performance and Capacitor support

import { getStorageManager } from "./storage/StorageManager";

const INVITE_STATUS_CACHE_KEY = "invite_status_cache";
const STORAGE_PREFIX = "invite_status:"; // [PHASE 1.2] StorageManager prefix

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

export type InviteStatus = "pending" | "accepted" | "declined";

interface InviteStatusCacheEntry {
  status: InviteStatus;
}

interface InviteStatusCache {
  [inviteId: string]: InviteStatusCacheEntry;
}

// Get cached invite status
// [PHASE 1.2] Uses localStorage for synchronous access (backward compatibility)
// StorageManager is used for writes, but reads use localStorage for instant access
export function getCachedInviteStatus(
  inviteId: string
): InviteStatus | null {
  try {
    if (!inviteId) return null;

    // [PHASE 1.2] Use legacy localStorage for synchronous access (backward compatibility)
    // StorageManager is used for writes, but reads use localStorage for instant access
    // This ensures backward compatibility while benefiting from StorageManager for writes
    const cache = getFromLocalStorageLegacy<InviteStatusCache>(INVITE_STATUS_CACHE_KEY);
    if (!cache) return null;

    const entry = cache[inviteId];
    if (!entry) return null;

    return entry.status;
  } catch (error) {
    console.error("Error reading invite status cache:", error);
    return null;
  }
}

// Set cached invite status
// [PHASE 1.2] Now uses StorageManager with localStorage fallback
// Note: No TTL - cache is cleared only when invite status changes
export function setCachedInviteStatus(
  inviteId: string,
  status: InviteStatus
): void {
  try {
    if (!inviteId) return;

    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${inviteId}`;
    const entry: InviteStatusCacheEntry = {
      status,
    };
    // No expiration - cache is cleared only when invite status changes
    // Use a very long TTL (1 year) since cache is manually invalidated
    const longTtl = 365 * 24 * 60 * 60 * 1000; // 1 year

    // [PHASE 1.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, longTtl).catch((error) => {
        console.warn("[InviteStatusCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // [PHASE 1.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<InviteStatusCache>(INVITE_STATUS_CACHE_KEY) || {};
    cache[inviteId] = entry;
    setToLocalStorageLegacy(INVITE_STATUS_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error setting invite status cache:", error);
  }
}

// Clear cached invite status for a specific invite
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearCachedInviteStatus(inviteId: string): void {
  try {
    if (!inviteId) return;

    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${inviteId}`;

    // [PHASE 1.2] Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    const cache = getFromLocalStorageLegacy<InviteStatusCache>(INVITE_STATUS_CACHE_KEY);
    if (!cache) return;

    if (cache[inviteId]) {
      delete cache[inviteId];
      setToLocalStorageLegacy(INVITE_STATUS_CACHE_KEY, cache);
    }
  } catch (error) {
    console.error("Error clearing invite status cache:", error);
  }
}

// Clear all invite status cache (for cleanup)
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearAllInviteStatusCache(): void {
  try {
    const storage = getStorage();

    // [PHASE 1.2] Clear all invite status entries from StorageManager
    if (storage && storage.keys) {
      storage.keys(STORAGE_PREFIX).then((keys) => {
        // Delete all keys with the invite_status prefix
        return Promise.all(keys.map((key) => storage.delete(key)));
      }).catch(() => {
        // Ignore errors - StorageManager may not be available
      });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    try {
      localStorage.removeItem(INVITE_STATUS_CACHE_KEY);
    } catch (error) {
      console.error("[InviteStatusCache] Error clearing localStorage:", error);
    }
  } catch (error) {
    console.error("Error clearing all invite status cache:", error);
  }
}

