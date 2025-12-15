// Cache for follow status to improve performance
// No expiration - cache is cleared only when follow relationship changes
const FOLLOW_STATUS_CACHE_KEY = "follow_status_cache";

export type FollowStatus = "none" | "pending" | "following" | "friends";

interface FollowStatusCacheEntry {
  status: FollowStatus;
}

interface FollowStatusCache {
  [key: string]: FollowStatusCacheEntry; // key format: "viewerId-targetProfileId"
}

// Generate cache key from viewer and target profile IDs
function getCacheKey(viewerId: string, targetProfileId: string): string {
  return `${viewerId}-${targetProfileId}`;
}

// Get cached follow status
export function getCachedFollowStatus(
  viewerId: string,
  targetProfileId: string
): FollowStatus | null {
  try {
    if (!viewerId || !targetProfileId) return null;

    const cacheStr = localStorage.getItem(FOLLOW_STATUS_CACHE_KEY);
    if (!cacheStr) return null;

    const cache: FollowStatusCache = JSON.parse(cacheStr);
    const key = getCacheKey(viewerId, targetProfileId);
    const entry = cache[key];

    if (!entry) return null;

    return entry.status;
  } catch (error) {
    console.error("Error reading follow status cache:", error);
    return null;
  }
}

// Set cached follow status
export function setCachedFollowStatus(
  viewerId: string,
  targetProfileId: string,
  status: FollowStatus
): void {
  try {
    if (!viewerId || !targetProfileId) return;

    const cacheStr = localStorage.getItem(FOLLOW_STATUS_CACHE_KEY);
    const cache: FollowStatusCache = cacheStr ? JSON.parse(cacheStr) : {};

    const key = getCacheKey(viewerId, targetProfileId);
    cache[key] = {
      status,
    };

    localStorage.setItem(FOLLOW_STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error setting follow status cache:", error);
  }
}

// Clear cached follow status for a specific profile
// This clears all relationships involving this profile (as viewer or target)
export function clearCachedFollowStatus(profileId: string): void {
  try {
    const cacheStr = localStorage.getItem(FOLLOW_STATUS_CACHE_KEY);
    if (!cacheStr) return;

    const cache: FollowStatusCache = JSON.parse(cacheStr);

    // Find and remove all cache entries that involve this profileId
    const keysToDelete: string[] = [];
    for (const key of Object.keys(cache)) {
      // Key format is "viewerId-targetProfileId"
      const [viewerId, targetProfileId] = key.split("-");
      if (viewerId === profileId || targetProfileId === profileId) {
        keysToDelete.push(key);
      }
    }

    // Delete all matching entries
    keysToDelete.forEach((key) => delete cache[key]);

    localStorage.setItem(FOLLOW_STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error clearing follow status cache:", error);
  }
}

// Clear all follow status cache (useful for logout or cache reset)
export function clearAllFollowStatusCache(): void {
  try {
    localStorage.removeItem(FOLLOW_STATUS_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all follow status cache:", error);
  }
}

