// Cache for invite status to improve performance and prevent flickering
// No expiration - cache is cleared only when invite status changes
const INVITE_STATUS_CACHE_KEY = "invite_status_cache";

export type InviteStatus = "pending" | "accepted" | "declined";

interface InviteStatusCacheEntry {
  status: InviteStatus;
}

interface InviteStatusCache {
  [inviteId: string]: InviteStatusCacheEntry;
}

// Get cached invite status
export function getCachedInviteStatus(
  inviteId: string
): InviteStatus | null {
  try {
    if (!inviteId) return null;

    const cacheStr = localStorage.getItem(INVITE_STATUS_CACHE_KEY);
    if (!cacheStr) return null;

    const cache: InviteStatusCache = JSON.parse(cacheStr);
    const entry = cache[inviteId];

    if (!entry) return null;

    return entry.status;
  } catch (error) {
    console.error("Error reading invite status cache:", error);
    return null;
  }
}

// Set cached invite status
export function setCachedInviteStatus(
  inviteId: string,
  status: InviteStatus
): void {
  try {
    if (!inviteId) return;

    const cacheStr = localStorage.getItem(INVITE_STATUS_CACHE_KEY);
    const cache: InviteStatusCache = cacheStr ? JSON.parse(cacheStr) : {};

    cache[inviteId] = {
      status,
    };

    localStorage.setItem(INVITE_STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error setting invite status cache:", error);
  }
}

// Clear cached invite status for a specific invite
export function clearCachedInviteStatus(inviteId: string): void {
  try {
    if (!inviteId) return;

    const cacheStr = localStorage.getItem(INVITE_STATUS_CACHE_KEY);
    if (!cacheStr) return;

    const cache: InviteStatusCache = JSON.parse(cacheStr);
    delete cache[inviteId];

    localStorage.setItem(INVITE_STATUS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error clearing invite status cache:", error);
  }
}

// Clear all invite status cache (for cleanup)
export function clearAllInviteStatusCache(): void {
  try {
    localStorage.removeItem(INVITE_STATUS_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all invite status cache:", error);
  }
}

