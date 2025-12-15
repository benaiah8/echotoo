// Avatar cache to reduce egress
const AVATAR_CACHE_KEY = "avatar_cache";
const BASE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours (base duration)

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

interface CachedAvatar {
  url: string;
  timestamp: number;
}

interface AvatarCache {
  [userId: string]: CachedAvatar;
}

// Helper functions for avatar caching
export function getCachedAvatar(userId: string): string | null {
  try {
    const cached = localStorage.getItem(AVATAR_CACHE_KEY);
    if (!cached) return null;

    const parsed: AvatarCache = JSON.parse(cached);
    const avatarData = parsed[userId];

    if (!avatarData) return null;

    const now = Date.now();
    // [OPTIMIZATION: Phase 6 - Connection] Use connection-aware cache duration
    if (now - avatarData.timestamp < getCacheDuration()) {
      return avatarData.url;
    }

    // Cache expired, remove it
    delete parsed[userId];
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(parsed));
    return null;
  } catch (error) {
    console.error("Error reading cached avatar:", error);
    return null;
  }
}

export function setCachedAvatar(userId: string, url: string): void {
  try {
    const cached = localStorage.getItem(AVATAR_CACHE_KEY);
    const parsed: AvatarCache = cached ? JSON.parse(cached) : {};

    parsed[userId] = {
      url,
      timestamp: Date.now(),
    };

    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(parsed));
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
export function clearCachedAvatar(userId: string): void {
  try {
    const cached = localStorage.getItem(AVATAR_CACHE_KEY);
    if (!cached) return;

    const parsed: AvatarCache = JSON.parse(cached);
    delete parsed[userId];
    localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.error("Error clearing cached avatar:", error);
  }
}