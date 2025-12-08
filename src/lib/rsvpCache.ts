// src/lib/rsvpCache.ts
// Cache for RSVP data to improve performance

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

// Get cached RSVP data for a post
export function getCachedRSVPData(postId: string): {
  users: RSVPUser[];
  currentUserRsvp: string | null;
} | null {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return null;

    const cache: RSVPCache = JSON.parse(cacheStr);
    const entry = cache[postId];

    if (!entry) return null;

    // Check if cache is expired
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      // Remove expired entry
      delete cache[postId];
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
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
export function setCachedRSVPData(
  postId: string,
  users: RSVPUser[],
  currentUserRsvp: string | null
): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    const cache: RSVPCache = cacheStr ? JSON.parse(cacheStr) : {};

    cache[postId] = {
      users,
      currentUserRsvp,
      timestamp: Date.now(),
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error setting RSVP cache:", error);
  }
}

// Clear cached RSVP data for a specific post
export function clearCachedRSVPData(postId: string): void {
  try {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    if (!cacheStr) return;

    const cache: RSVPCache = JSON.parse(cacheStr);
    delete cache[postId];

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error clearing RSVP cache:", error);
  }
}

// Clear all RSVP cache
export function clearAllRSVPCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all RSVP cache:", error);
  }
}

