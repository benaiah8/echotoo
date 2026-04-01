// src/lib/rsvpCache.ts
// Cache for RSVP data to improve performance
// [PHASE 1.2] Migrated to StorageManager for better performance and Capacitor support

import { getStorageManager } from "./storage/StorageManager";

interface RSVPUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: "going" | "maybe" | "not_going";
  created_at: string;
}

interface RSVPCacheEntry {
  users: RSVPUser[];
  currentUserRsvp: string | null;
  timestamp: number;
}

interface RSVPCache {
  [key: string]: RSVPCacheEntry; // key is postId
}

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes
const CACHE_KEY = "rsvp_cache";
const STORAGE_PREFIX = "rsvp:"; // [PHASE 1.2] StorageManager prefix

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

// Get cached RSVP data for a post
// [PHASE 1.2] Uses localStorage for synchronous access (backward compatibility)
// StorageManager is used for writes, but reads use localStorage for instant access
export function getCachedRSVPData(postId: string): {
  users: RSVPUser[];
  currentUserRsvp: string | null;
} | null {
  try {
    // [PHASE 1.2] Use legacy localStorage for synchronous access (backward compatibility)
    // StorageManager is used for writes, but reads use localStorage for instant access
    // This ensures backward compatibility while benefiting from StorageManager for writes
    const cache = getFromLocalStorageLegacy<RSVPCache>(CACHE_KEY);
    if (!cache) return null;

    const entry = cache[postId];
    if (!entry) return null;

    // Check if cache is expired
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      // Remove expired entry
      delete cache[postId];
      setToLocalStorageLegacy(CACHE_KEY, cache);
      return null;
    }

    return {
      users: entry.users,
      currentUserRsvp: entry.currentUserRsvp,
    };
  } catch (error) {
    console.error("Error reading RSVP cache:", error);
    return null;
  }
}

// Set cached RSVP data for a post
// [PHASE 1.2] Now uses StorageManager with localStorage fallback
export function setCachedRSVPData(
  postId: string,
  users: RSVPUser[],
  currentUserRsvp: string | null
): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${postId}`;
    const entry: RSVPCacheEntry = {
      users,
      currentUserRsvp,
      timestamp: Date.now(),
    };

    // [PHASE 1.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, CACHE_DURATION).catch((error) => {
        console.warn(
          "[RSVPCache] StorageManager failed, using localStorage fallback:",
          error
        );
      });
    }

    // [PHASE 1.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<RSVPCache>(CACHE_KEY) || {};
    cache[postId] = entry;
    setToLocalStorageLegacy(CACHE_KEY, cache);
  } catch (error) {
    console.error("Error setting RSVP cache:", error);
  }
}

// Clear cached RSVP data for a specific post
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearCachedRSVPData(postId: string): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${postId}`;

    // [PHASE 1.2] Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // [PHASE 1.2] Clear from legacy localStorage
    const cache = getFromLocalStorageLegacy<RSVPCache>(CACHE_KEY);
    if (!cache) return;

    if (cache[postId]) {
      delete cache[postId];
      setToLocalStorageLegacy(CACHE_KEY, cache);
    }
  } catch (error) {
    console.error("Error clearing RSVP cache:", error);
  }
}

// Clear all RSVP cache
// [PHASE 1.2] Now clears from both StorageManager and localStorage
export function clearAllRSVPCache(): void {
  try {
    const storage = getStorage();

    // [PHASE 1.2] Clear all RSVP entries from StorageManager
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
      console.error("[RSVPCache] Error clearing localStorage:", error);
    }
  } catch (error) {
    console.error("Error clearing all RSVP cache:", error);
  }
}
