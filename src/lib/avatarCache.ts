// Avatar cache to reduce egress
// [OPTIMIZATION: Phase 3.2] Migrated to StorageManager for better performance and Capacitor support
import { getStorageManager } from "./storage/StorageManager";
import { getCacheDurationMultiplier } from "./connectionAware";

const AVATAR_CACHE_KEY = "avatar_cache";
const STORAGE_PREFIX = "avatar:"; // [OPTIMIZATION: Phase 3.2] StorageManager prefix
const BASE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours (base duration)

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

interface CachedAvatar {
  url: string;
  timestamp: number;
}

interface AvatarCache {
  [userId: string]: CachedAvatar;
}

// Helper functions for avatar caching
// [OPTIMIZATION: Phase 3.2] Now uses StorageManager with localStorage fallback
// Note: Function remains synchronous for backward compatibility
export function getCachedAvatar(userId: string): string | null {
  try {
    // [OPTIMIZATION: Phase 3.2] Use legacy localStorage for synchronous access (backward compatibility)
    const cache = getFromLocalStorageLegacy<AvatarCache>(AVATAR_CACHE_KEY);
    if (!cache) return null;

    const avatarData = cache[userId];
    if (!avatarData) return null;

    const now = Date.now();
    // [OPTIMIZATION: Phase 6 - Connection] Use connection-aware cache duration
    if (now - avatarData.timestamp < getCacheDuration()) {
      return avatarData.url;
    }

    // Cache expired, remove it
    delete cache[userId];
    setToLocalStorageLegacy(AVATAR_CACHE_KEY, cache);
    return null;
  } catch (error) {
    console.error("Error reading cached avatar:", error);
    return null;
  }
}

// [OPTIMIZATION: Phase 3.2] Now uses StorageManager with localStorage fallback
export function setCachedAvatar(userId: string, url: string): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${userId}`;
    const entry: CachedAvatar = {
      url,
      timestamp: Date.now(),
    };
    const ttl = getCacheDuration();

    // [OPTIMIZATION: Phase 3.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, ttl).catch((error) => {
        console.warn("[AvatarCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // [OPTIMIZATION: Phase 3.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<AvatarCache>(AVATAR_CACHE_KEY) || {};
    cache[userId] = entry;
    setToLocalStorageLegacy(AVATAR_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error caching avatar:", error);
  }
}

export function preloadAvatar(url: string): void {
  if (!url) return;

  const img = new Image();
  img.src = url;
}

// [OPTIMIZATION: Phase 3 - Cache] Clear cached avatar for a specific user
// Why: Allows cache invalidation when avatar changes
// [OPTIMIZATION: Phase 3.2] Now clears from both StorageManager and localStorage
export function clearCachedAvatar(userId: string): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${userId}`;

    // [OPTIMIZATION: Phase 3.2] Clear from StorageManager
    if (storage) {
      storage.delete(storageKey).catch(() => {
        // Ignore errors
      });
    }

    // [OPTIMIZATION: Phase 3.2] Clear from legacy localStorage
    const cache = getFromLocalStorageLegacy<AvatarCache>(AVATAR_CACHE_KEY);
    if (!cache) return;

    delete cache[userId];
    setToLocalStorageLegacy(AVATAR_CACHE_KEY, cache);
  } catch (error) {
    console.error("Error clearing cached avatar:", error);
  }
}