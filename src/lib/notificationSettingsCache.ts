// Cache for notification settings to improve performance
// No expiration - cache is cleared only when notification settings change or when unfollowing
const NOTIFICATION_SETTINGS_CACHE_KEY = "notification_settings_cache";

interface NotificationSettingsCacheEntry {
  enabled: boolean;
}

interface NotificationSettingsCache {
  [key: string]: NotificationSettingsCacheEntry; // key format: "viewerId-targetProfileId"
}

// Generate cache key from viewer and target profile IDs
function getCacheKey(viewerId: string, targetProfileId: string): string {
  return `${viewerId}-${targetProfileId}`;
}

// Get cached notification settings
export function getCachedNotificationSettings(
  viewerId: string,
  targetProfileId: string
): boolean | null {
  try {
    if (!viewerId || !targetProfileId) return null;

    const cacheStr = localStorage.getItem(NOTIFICATION_SETTINGS_CACHE_KEY);
    if (!cacheStr) return null;

    const cache: NotificationSettingsCache = JSON.parse(cacheStr);
    const key = getCacheKey(viewerId, targetProfileId);
    const entry = cache[key];

    if (!entry) return null;

    return entry.enabled;
  } catch (error) {
    console.error("Error reading notification settings cache:", error);
    return null;
  }
}

// Set cached notification settings
export function setCachedNotificationSettings(
  viewerId: string,
  targetProfileId: string,
  enabled: boolean
): void {
  try {
    if (!viewerId || !targetProfileId) return;

    const cacheStr = localStorage.getItem(NOTIFICATION_SETTINGS_CACHE_KEY);
    const cache: NotificationSettingsCache = cacheStr ? JSON.parse(cacheStr) : {};

    const key = getCacheKey(viewerId, targetProfileId);
    cache[key] = {
      enabled,
    };

    localStorage.setItem(NOTIFICATION_SETTINGS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error setting notification settings cache:", error);
  }
}

// Clear cached notification settings for a specific profile
// This clears all settings involving this profile (as viewer or target)
export function clearCachedNotificationSettings(profileId: string): void {
  try {
    const cacheStr = localStorage.getItem(NOTIFICATION_SETTINGS_CACHE_KEY);
    if (!cacheStr) return;

    const cache: NotificationSettingsCache = JSON.parse(cacheStr);

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

    localStorage.setItem(NOTIFICATION_SETTINGS_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Error clearing notification settings cache:", error);
  }
}

// Clear all notification settings cache (useful for logout or cache reset)
export function clearAllNotificationSettingsCache(): void {
  try {
    localStorage.removeItem(NOTIFICATION_SETTINGS_CACHE_KEY);
  } catch (error) {
    console.error("Error clearing all notification settings cache:", error);
  }
}

