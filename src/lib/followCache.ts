// src/lib/followCache.ts
// Cache for follow relationships to improve performance and consistency

interface FollowCacheEntry {
  status: "none" | "following" | "friends" | "self";
  timestamp: number;
}

interface FollowCache {
  [key: string]: FollowCacheEntry;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = "follow_cache";

// Get cached follow status
export function getCachedFollowStatus(
  viewerId: string,
  targetId: string
): "none" | "following" | "friends" | "self" | null {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return null;

    const cache: FollowCache = JSON.parse(cacheStr);
    const key = `${viewerId}-${targetId}`;
    const entry = cache[key];

    if (!entry) return null;

    // Check if cache is expired
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      // Remove expired entry
      delete cache[key];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      return null;
    }

    return entry.status;
  } catch (error) {
    console.error("Error reading follow cache:", error);
    return null;
  }
}

// Set cached follow status
export function setCachedFollowStatus(
  viewerId: string,
  targetId: string,
  status: "none" | "following" | "friends" | "self"
): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    const cache: FollowCache = cacheStr ? JSON.parse(cacheStr) : {};

    const key = `${viewerId}-${targetId}`;
    cache[key] = {
      status,
      timestamp: Date.now(),
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error setting follow cache:", error);
  }
}

// Clear cached follow status for a specific user
export function clearCachedFollowStatus(
  viewerId: string,
  targetId: string
): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return;

    const cache: FollowCache = JSON.parse(cacheStr);
    const key = `${viewerId}-${targetId}`;
    delete cache[key];

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error clearing follow cache:", error);
  }
}

// Clear all follow cache
export function clearAllFollowCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all follow cache:", error);
  }
}

// Get all cached follow relationships for a viewer
export function getCachedFollowsForViewer(viewerId: string): {
  [targetId: string]: "none" | "following" | "friends" | "self";
} {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return {};

    const cache: FollowCache = JSON.parse(cacheStr);
    const result: {
      [targetId: string]: "none" | "following" | "friends" | "self";
    } = {};

    Object.keys(cache).forEach((key) => {
      if (key.startsWith(`${viewerId}-`)) {
        const entry = cache[key];
        // Check if cache is expired
        if (Date.now() - entry.timestamp <= CACHE_DURATION) {
          const targetId = key.replace(`${viewerId}-`, "");
          result[targetId] = entry.status;
        }
      }
    });

    return result;
  } catch (error) {
    console.error("Error getting cached follows for viewer:", error);
    return {};
  }
}
