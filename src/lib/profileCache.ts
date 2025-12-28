// src/lib/profileCache.ts
// Cache for profile data and avatars to improve performance
// [OPTIMIZATION: Phase 3.2] Migrated to StorageManager for better performance and Capacitor support

import { getStorageManager } from "./storage/StorageManager";
import { getCacheDurationMultiplier } from "./connectionAware";

interface ProfileCacheEntry {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  // [OPTIMIZATION: Phase 1 - Cache] Privacy settings cached in profile cache
  // Why: Instant display of privacy status without flicker, prevents "Sign in" message
  is_private?: boolean | null;
  social_media_public?: boolean | null;
  timestamp: number;
}

interface ProfileCache {
  [key: string]: ProfileCacheEntry; // key is profile ID
}

interface UsernameCache {
  [username: string]: string; // username -> profile ID mapping
}

const BASE_CACHE_DURATION = 5 * 60 * 1000; // [OPTIMIZATION: Phase 3.2] 5 minutes for own profile (was 30 min)
const CACHE_KEY = "profile_cache";
const USERNAME_CACHE_KEY = "profile_username_cache";
const STORAGE_PREFIX = "profile:"; // [OPTIMIZATION: Phase 3.2] StorageManager prefix

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
function getStorage(): { get: (key: string) => Promise<any>; set: (key: string, value: any, ttl?: number) => Promise<void>; delete: (key: string) => Promise<void>; keys: () => Promise<string[]> } | null {
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

// [OPTIMIZATION: Phase 1 - Cache] Get cached profile data including privacy settings
// Why: Instant display of profile data and privacy status without database queries
// [OPTIMIZATION: Phase 3.2] Now uses StorageManager with localStorage fallback
// Note: Function remains synchronous for backward compatibility (StorageManager loads async in background)
export function getCachedProfile(profileId: string): {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private?: boolean | null;
  social_media_public?: boolean | null;
} | null {
  try {
    // [OPTIMIZATION: Phase 3.2] Use legacy localStorage for synchronous access (backward compatibility)
    // StorageManager is used for writes, but reads use localStorage for instant access
    // This ensures backward compatibility while benefiting from StorageManager for writes
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY);
    if (!cache) return null;

    const entry = cache[profileId];
    if (!entry) return null;

    // Check if cache is expired
    // [OPTIMIZATION: Phase 6 - Connection] Use connection-aware cache duration
    if (Date.now() - entry.timestamp > getCacheDuration()) {
      // Remove expired entry
      delete cache[profileId];
      setToLocalStorageLegacy(CACHE_KEY, cache);
      return null;
    }

    return {
      id: entry.id,
      user_id: entry.user_id,
      username: entry.username,
      display_name: entry.display_name,
      avatar_url: entry.avatar_url,
      bio: entry.bio,
      xp: entry.xp,
      member_no: entry.member_no,
      instagram_url: entry.instagram_url,
      tiktok_url: entry.tiktok_url,
      telegram_url: entry.telegram_url,
      is_private: entry.is_private,
      social_media_public: entry.social_media_public,
    };
  } catch (error) {
    console.error("Error reading profile cache:", error);
    return null;
  }
}

// Helper function to get username cache
function getUsernameCache(): UsernameCache {
  try {
    return getFromLocalStorageLegacy<UsernameCache>(USERNAME_CACHE_KEY) || {};
  } catch (error) {
    console.error("Error reading username cache:", error);
    return {};
  }
}

// Helper function to set username cache
function setUsernameCache(usernameCache: UsernameCache): void {
  try {
    setToLocalStorageLegacy(USERNAME_CACHE_KEY, usernameCache);
  } catch (error) {
    console.error("Error setting username cache:", error);
  }
}

// [OPTIMIZATION: Phase 1 - Cache] Set cached profile data including privacy settings
// Why: Caches privacy settings for instant display and prevents flicker
// [OPTIMIZATION: Phase 3.2] Now uses StorageManager with localStorage fallback
export function setCachedProfile(profileData: {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private?: boolean | null;
  social_media_public?: boolean | null;
}): void {
  try {
    const storage = getStorage();
    const storageKey = `${STORAGE_PREFIX}${profileData.id}`;
    const entry: ProfileCacheEntry = {
      ...profileData,
      timestamp: Date.now(),
    };
    const ttl = getCacheDuration();

    // [OPTIMIZATION: Phase 3.2] Store in StorageManager (primary path)
    if (storage) {
      storage.set(storageKey, entry, ttl).catch((error) => {
        console.warn("[ProfileCache] StorageManager failed, using localStorage fallback:", error);
      });
    }

    // [OPTIMIZATION: Phase 3.2] Also store in legacy localStorage (for backward compatibility and sync access)
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY) || {};
    cache[profileData.id] = entry;
    setToLocalStorageLegacy(CACHE_KEY, cache);

    // Also update username cache if username exists
    if (profileData.username) {
      const usernameCache = getUsernameCache();
      usernameCache[profileData.username.toLowerCase()] = profileData.id;
      setUsernameCache(usernameCache);
    }
  } catch (error) {
    console.error("Error setting profile cache:", error);
  }
}

// Clear cached profile data for a specific profile
// [OPTIMIZATION: Phase 3.2] Now clears from both StorageManager and localStorage
export function clearCachedProfile(profileId: string): void {
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
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY);
    if (!cache) return;

    const profile = cache[profileId];
    if (profile) {
      delete cache[profileId];
      setToLocalStorageLegacy(CACHE_KEY, cache);

      // Also remove from username cache if it exists
      if (profile.username) {
        const usernameCache = getUsernameCache();
        delete usernameCache[profile.username.toLowerCase()];
        setUsernameCache(usernameCache);
      }
    }
  } catch (error) {
    console.error("Error clearing profile cache:", error);
  }
}

// Clear all profile cache
// [OPTIMIZATION: Phase 3.2] Now clears from both StorageManager and localStorage
export function clearAllProfileCache(): void {
  try {
    const storage = getStorage();

    // [OPTIMIZATION: Phase 3.2] Clear all profile entries from StorageManager
    if (storage && storage.keys) {
      storage.keys().then((keys: string[]) => {
        const profileKeys = keys.filter((key: string) => key.startsWith(STORAGE_PREFIX));
        return Promise.all(profileKeys.map((key: string) => storage!.delete(key)));
      }).catch(() => {
        // Ignore errors
      });
    }

    // [OPTIMIZATION: Phase 3.2] Clear from legacy localStorage
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(USERNAME_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all profile cache:", error);
  }
}

// Get cached profile by username or ID
export function getProfileCached(usernameOrId: string): {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
} | null {
  try {
    // First, try to get by ID if it looks like a UUID
    const isUuid = /^[0-9a-f-]{36}$/i.test(usernameOrId);
    if (isUuid) {
      return getCachedProfile(usernameOrId);
    }

    // If it's not a UUID, treat it as a username
    const usernameCache = getUsernameCache();
    const profileId = usernameCache[usernameOrId.toLowerCase()];

    if (profileId) {
      return getCachedProfile(profileId);
    }

    // Fallback: search through all cached profiles by username (less efficient but works)
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY);
    if (!cache) return null;

    for (const [id, entry] of Object.entries(cache)) {
      // Check if cache is expired
      // [OPTIMIZATION: Phase 6 - Connection] Use connection-aware cache duration
    if (Date.now() - entry.timestamp > getCacheDuration()) {
        continue;
      }

      if (
        entry.username &&
        entry.username.toLowerCase() === usernameOrId.toLowerCase()
      ) {
        return {
          id: entry.id,
          user_id: entry.user_id,
          username: entry.username,
          display_name: entry.display_name,
          avatar_url: entry.avatar_url,
          bio: entry.bio,
          xp: entry.xp,
          member_no: entry.member_no,
          instagram_url: entry.instagram_url,
          tiktok_url: entry.tiktok_url,
          telegram_url: entry.telegram_url,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Error getting cached profile:", error);
    return null;
  }
}

// [OPTIMIZATION: Phase 1 - Cache] Cache a profile (alias for setCachedProfile for backward compatibility)
// Why: Maintains backward compatibility while supporting privacy settings caching
export function primeProfileCache(profileData: {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private?: boolean | null;
  social_media_public?: boolean | null;
}): void {
  setCachedProfile(profileData);
}

// Invalidate profile cache (alias for clearCachedProfile for backward compatibility)
export function invalidateProfile(profileId: string): void {
  clearCachedProfile(profileId);
}

// [OPTIMIZATION: Phase 1 - Cache] Batch cache multiple profiles including privacy settings
// Why: Efficiently caches multiple profiles at once, including privacy status
// [OPTIMIZATION: Phase 3.2] Now uses StorageManager with localStorage fallback
export function setCachedProfiles(
  profiles: Array<{
    id: string;
    user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    xp: number | null;
    member_no: number | null;
    instagram_url: string | null;
    tiktok_url: string | null;
    telegram_url: string | null;
    is_private?: boolean | null;
    social_media_public?: boolean | null;
  }>
): void {
  try {
    const storage = getStorage();
    const cache = getFromLocalStorageLegacy<ProfileCache>(CACHE_KEY) || {};
    const usernameCache = getUsernameCache();
    const ttl = getCacheDuration();

    profiles.forEach((profile) => {
      const entry: ProfileCacheEntry = {
        ...profile,
        timestamp: Date.now(),
      };
      const storageKey = `${STORAGE_PREFIX}${profile.id}`;

      // [OPTIMIZATION: Phase 3.2] Store in StorageManager
      if (storage) {
        storage.set(storageKey, entry, ttl).catch(() => {
          // Ignore errors
        });
      }

      // [OPTIMIZATION: Phase 3.2] Also store in legacy localStorage
      cache[profile.id] = entry;

      // Also update username cache if username exists
      if (profile.username) {
        usernameCache[profile.username.toLowerCase()] = profile.id;
      }
    });

    setToLocalStorageLegacy(CACHE_KEY, cache);
    setUsernameCache(usernameCache);
  } catch (error) {
    console.error("Error setting multiple profiles cache:", error);
  }
}
