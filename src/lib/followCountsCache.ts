// Cache for follow counts to improve performance
const FOLLOW_COUNTS_CACHE_KEY = "follow_counts_cache";
const BASE_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (base duration)

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

interface FollowCountsCacheEntry {
  following: number;
  followers: number;
  timestamp: number;
}

interface FollowCountsCache {
  [profileId: string]: FollowCountsCacheEntry;
}

// Get cached follow counts
export function getCachedFollowCounts(profileId: string): {
  following: number;
  followers: number;
} | null {
  try {
    const cacheStr = localStorage.getItem(FOLLOW_COUNTS_CACHE_KEY);
    if (!cacheStr) return null;

    const cache: FollowCountsCache = JSON.parse(cacheStr);
    const entry = cache[profileId];

    if (!entry) return null;

    // [OPTIMIZATION: Phase 6 - Connection] Use connection-aware cache duration
    if (Date.now() - entry.timestamp > getCacheDuration()) {
      // Remove expired entry
      delete cache[profileId];
      localStorage.setItem(FOLLOW_COUNTS_CACHE_KEY, JSON.stringify(cache));
      return null;
    }

    return {
      following: entry.following,
      followers: entry.followers,
    };
  } catch (error) {
    console.error("Error reading follow counts cache:", error);
    return null;
  }
}

// Set cached follow counts
export function setCachedFollowCounts(
  profileId: string,
  counts: { following: number; followers: number }
): void {
  try {
    const cacheStr = localStorage.getItem(FOLLOW_COUNTS_CACHE_KEY);
    const cache: FollowCountsCache = cacheStr ? JSON.parse(cacheStr) : {};

    cache[profileId] = {
      ...counts,
      timestamp: Date.now(),
    };

    localStorage.setItem(FOLLOW_COUNTS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error setting follow counts cache:", error);
  }
}

// Clear cached follow counts for a specific profile
export function clearCachedFollowCounts(profileId: string): void {
  try {
    const cacheStr = localStorage.getItem(FOLLOW_COUNTS_CACHE_KEY);
    if (!cacheStr) return;

    const cache: FollowCountsCache = JSON.parse(cacheStr);
    delete cache[profileId];
    localStorage.setItem(FOLLOW_COUNTS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error clearing follow counts cache:", error);
  }
}

