// src/lib/profileCache.ts
// Cache for profile data and avatars to improve performance

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

const BASE_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes for profile data (base duration)
const CACHE_KEY = "profile_cache";
const USERNAME_CACHE_KEY = "profile_username_cache";

// [OPTIMIZATION: Phase 6 - Connection] Get cache duration based on connection speed
// Why: Longer cache duration on slow connections to reduce network requests
function getCacheDuration(): number {
  try {
    const { getCacheDurationMultiplier } = require("./connectionAware");
    const multiplier = getCacheDurationMultiplier();
    return BASE_CACHE_DURATION * multiplier;
  } catch {
    // Fallback if connectionAware not available
    return BASE_CACHE_DURATION;
  }
}

// [OPTIMIZATION: Phase 1 - Cache] Get cached profile data including privacy settings
// Why: Instant display of profile data and privacy status without database queries
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
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return null;

    const cache: ProfileCache = JSON.parse(cacheStr);
    const entry = cache[profileId];

    if (!entry) return null;

    // Check if cache is expired
    // [OPTIMIZATION: Phase 6 - Connection] Use connection-aware cache duration
    if (Date.now() - entry.timestamp > getCacheDuration()) {
      // Remove expired entry
      delete cache[profileId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
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
    const cacheStr = localStorage.getItem(USERNAME_CACHE_KEY);
    return cacheStr ? JSON.parse(cacheStr) : {};
  } catch (error) {
    console.error("Error reading username cache:", error);
    return {};
  }
}

// Helper function to set username cache
function setUsernameCache(usernameCache: UsernameCache): void {
  try {
    localStorage.setItem(USERNAME_CACHE_KEY, JSON.stringify(usernameCache));
  } catch (error) {
    console.error("Error setting username cache:", error);
  }
}

// [OPTIMIZATION: Phase 1 - Cache] Set cached profile data including privacy settings
// Why: Caches privacy settings for instant display and prevents flicker
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
    const cacheStr = localStorage.getItem(CACHE_KEY);
    const cache: ProfileCache = cacheStr ? JSON.parse(cacheStr) : {};

    cache[profileData.id] = {
      ...profileData,
      timestamp: Date.now(),
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));

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
export function clearCachedProfile(profileId: string): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return;

    const cache: ProfileCache = JSON.parse(cacheStr);
    const profile = cache[profileId];

    if (profile) {
      delete cache[profileId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));

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
export function clearAllProfileCache(): void {
  try {
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
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return null;

    const cache: ProfileCache = JSON.parse(cacheStr);

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
    const cacheStr = localStorage.getItem(CACHE_KEY);
    const cache: ProfileCache = cacheStr ? JSON.parse(cacheStr) : {};
    const usernameCache = getUsernameCache();

    profiles.forEach((profile) => {
      cache[profile.id] = {
        ...profile,
        timestamp: Date.now(),
      };

      // Also update username cache if username exists
      if (profile.username) {
        usernameCache[profile.username.toLowerCase()] = profile.id;
      }
    });

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    setUsernameCache(usernameCache);
  } catch (error) {
    console.error("Error setting multiple profiles cache:", error);
  }
}
