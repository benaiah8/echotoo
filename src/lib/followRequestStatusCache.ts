// Cache for follow request status to improve performance and prevent flickering
// No expiration - cache is cleared only when follow request status changes
// Note: This uses the same follows table as followStatusCache, but provides
// specific functions for follow request operations (pending/approved/declined)

const FOLLOW_REQUEST_STATUS_CACHE_KEY = "follow_request_status_cache";

export type FollowRequestStatus = "pending" | "approved" | "declined";

interface FollowRequestStatusCacheEntry {
  status: FollowRequestStatus;
}

interface FollowRequestStatusCache {
  [key: string]: FollowRequestStatusCacheEntry; // key format: "followerId-followingId"
}

// Generate cache key from follower and following profile IDs
function getCacheKey(followerId: string, followingId: string): string {
  return `${followerId}-${followingId}`;
}

// Get cached follow request status
export function getCachedFollowRequestStatus(
  followerId: string,
  followingId: string
): FollowRequestStatus | null {
  try {
    if (!followerId || !followingId) return null;

    const cacheStr = localStorage.getItem(FOLLOW_REQUEST_STATUS_CACHE_KEY);
    if (!cacheStr) return null;

    const cache: FollowRequestStatusCache = JSON.parse(cacheStr);
    const key = getCacheKey(followerId, followingId);
    const entry = cache[key];

    if (!entry) return null;

    return entry.status;
  } catch (error) {
    console.error("Error reading follow request status cache:", error);
    return null;
  }
}

// Set cached follow request status
export function setCachedFollowRequestStatus(
  followerId: string,
  followingId: string,
  status: FollowRequestStatus
): void {
  try {
    if (!followerId || !followingId) return;

    const cacheStr = localStorage.getItem(FOLLOW_REQUEST_STATUS_CACHE_KEY);
    const cache: FollowRequestStatusCache = cacheStr ? JSON.parse(cacheStr) : {};

    const key = getCacheKey(followerId, followingId);
    cache[key] = {
      status,
    };

    localStorage.setItem(FOLLOW_REQUEST_STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error setting follow request status cache:", error);
  }
}

// Clear cached follow request status for a specific follow relationship
export function clearCachedFollowRequestStatus(
  followerId: string,
  followingId: string
): void {
  try {
    if (!followerId || !followingId) return;

    const cacheStr = localStorage.getItem(FOLLOW_REQUEST_STATUS_CACHE_KEY);
    if (!cacheStr) return;

    const cache: FollowRequestStatusCache = JSON.parse(cacheStr);
    const key = getCacheKey(followerId, followingId);
    delete cache[key];

    localStorage.setItem(FOLLOW_REQUEST_STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error clearing follow request status cache:", error);
  }
}

// Clear all follow request status cache (for cleanup)
export function clearAllFollowRequestStatusCache(): void {
  try {
    localStorage.removeItem(FOLLOW_REQUEST_STATUS_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all follow request status cache:", error);
  }
}

