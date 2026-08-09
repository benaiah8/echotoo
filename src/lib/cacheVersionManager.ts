/**
 * [PHASE 1.2] Unified Cache Version Manager
 * 
 * Provides centralized cache version management and invalidation.
 * When the cache schema version changes, all caches are cleared to prevent
 * stale data issues.
 * 
 * Features:
 * - Unified version checking on app startup
 * - Clears all caches (StorageManager + localStorage) when version changes
 * - Handles graceful migrations
 * - Prevents stale data from old cache formats
 */

import { CACHE_SCHEMA_VERSION } from './cacheValidation';
import { getStorageManager } from './storage/StorageManager';
import { dataCache } from './dataCache';
import { clearAllPersistedHomeFeeds } from './homeFeedListCache';

// Import all clearAll cache functions
import { clearAllProfileCache } from './profileCache';
// [PHASE D.2] Removed clearAllProfilePostsCache - now using dataCache
import { clearAllRSVPCache } from './rsvpCache';
import { clearAllMutualFriendsCache } from './mutualFriendsCache';
import { clearAllFollowRequestStatusCache } from './followRequestStatusCache';
import { clearAllFollowStatusCache } from './followStatusCache';
import { clearAllNotificationSettingsCache } from './notificationSettingsCache';
import { clearAllInviteStatusCache } from './inviteStatusCache';
import { clearAllFollowCache } from './followCache';

/**
 * LocalStorage key for storing the current cache version
 */
const CACHE_VERSION_KEY = 'echotoo_cache_version';

/** Feed-only schema version — clears home_feed_v1 / feed caches without touching auth or drafts */
export const FEED_CACHE_SCHEMA_VERSION = 'v2';
const FEED_CACHE_SCHEMA_VERSION_KEY = 'echotoo_feed_cache_schema_version';

const LEGACY_FEED_LOCAL_STORAGE_PREFIXES = [
  'home_feed_v1:',
  'storage:feed:',
  'feed:',
] as const;

function clearLegacyFeedLocalStorageKeys(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        LEGACY_FEED_LOCAL_STORAGE_PREFIXES.some((prefix) =>
          key.startsWith(prefix)
        )
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    if (keysToRemove.length > 0) {
      console.log(
        `[FeedCacheMigration] Removed ${keysToRemove.length} legacy feed localStorage keys`
      );
    }
  } catch (error) {
    console.warn('[FeedCacheMigration] Failed clearing legacy feed keys:', error);
  }
}

/**
 * Synchronous feed-cache migration — must finish before React reads persisted Home rows.
 * Does not clear auth, session, drafts, or editPostData keys.
 */
export function migrateFeedCacheSchemaSync(): boolean {
  try {
    const storedVersion = localStorage.getItem(FEED_CACHE_SCHEMA_VERSION_KEY);
    if (storedVersion === FEED_CACHE_SCHEMA_VERSION) {
      return false;
    }

    console.log(
      `[FeedCacheMigration] Feed cache schema changed from ${storedVersion || 'none'} to ${FEED_CACHE_SCHEMA_VERSION}`
    );

    clearAllPersistedHomeFeeds();
    clearLegacyFeedLocalStorageKeys();
    localStorage.setItem(
      FEED_CACHE_SCHEMA_VERSION_KEY,
      FEED_CACHE_SCHEMA_VERSION
    );
    return true;
  } catch (error) {
    console.error('[FeedCacheMigration] Sync migration failed:', error);
    return false;
  }
}

/**
 * Async portion of feed-cache migration (in-memory + StorageManager feed entries).
 * Call after {@link migrateFeedCacheSchemaSync} when it returned true.
 */
export async function checkAndMigrateFeedCacheSchema(): Promise<void> {
  try {
    await dataCache.clearFeedCache();
    console.log(
      '[FeedCacheMigration] Feed caches cleared for schema',
      FEED_CACHE_SCHEMA_VERSION
    );
  } catch (error) {
    console.error('[FeedCacheMigration] Async feed cache clear failed:', error);
  }
}

/** One-shot sync + async feed cache migration (e.g. tests or manual repair). */
export async function migrateFeedCacheSchema(): Promise<void> {
  const migrated = migrateFeedCacheSchemaSync();
  if (!migrated) return;
  await checkAndMigrateFeedCacheSchema();
}

export function getStoredFeedCacheSchemaVersion(): string | null {
  try {
    return localStorage.getItem(FEED_CACHE_SCHEMA_VERSION_KEY);
  } catch {
    return null;
  }
}

/**
 * StorageManager prefixes for all cache types
 * Used to clear StorageManager caches when version changes
 */
const CACHE_PREFIXES = [
  'feed:',                    // dataCache (feed data)
  'profile:',                  // profileCache
  // [PHASE D.2] Removed 'profile_posts:' - now using dataCache with keys like 'profile_created_${userId}'
  'rsvp:',                    // rsvpCache
  'mutual:',                  // mutualFriendsCache
  'follow_request_status:',   // followRequestStatusCache
  'follow_status:',           // followStatusCache
  'notification_settings:',   // notificationSettingsCache
  'invite_status:',          // inviteStatusCache
  // Note: followCache hasn't been migrated to StorageManager yet
];

/**
 * Check cache version and clear all caches if version changed
 * 
 * This should be called once during app initialization (before any cache operations).
 * 
 * @returns Promise that resolves when version check and potential cache clearing is complete
 */
export async function checkAndClearAllCaches(): Promise<void> {
  try {
    // Get stored version from localStorage
    const storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
    
    // If version matches, no action needed
    if (storedVersion === CACHE_SCHEMA_VERSION) {
      console.log('[CacheVersionManager] Cache version is current:', CACHE_SCHEMA_VERSION);
      return;
    }

    // Version changed - clear all caches
    console.log(
      `[CacheVersionManager] Cache version changed from ${storedVersion || 'none'} to ${CACHE_SCHEMA_VERSION}. Clearing all caches...`
    );

    // Clear all cache-specific clearAll functions
    // These handle both StorageManager and localStorage clearing
    clearAllProfileCache();
    // [PHASE D.2] Profile posts cache now handled by dataCache (cleared below)
    clearAllRSVPCache();
    clearAllMutualFriendsCache();
    clearAllFollowRequestStatusCache();
    clearAllFollowStatusCache();
    clearAllNotificationSettingsCache();
    clearAllInviteStatusCache();
    clearAllFollowCache(); // Still uses localStorage only

    // Clear dataCache (feed data)
    // dataCache has its own clearFeedCache method
    await dataCache.clearFeedCache();

    // Clear all StorageManager caches by prefix
    // This ensures we catch any caches that might not have clearAll functions
    try {
      const storageManager = getStorageManager();
      
      // Clear each prefix
      for (const prefix of CACHE_PREFIXES) {
        try {
          const keys = await storageManager.keys(prefix);
          if (keys.length > 0) {
            await Promise.all(keys.map((key) => storageManager.delete(key)));
            console.log(`[CacheVersionManager] Cleared ${keys.length} entries with prefix: ${prefix}`);
          }
        } catch (error) {
          // Log but continue - some prefixes might not exist
          console.debug(`[CacheVersionManager] Error clearing prefix ${prefix}:`, error);
        }
      }
    } catch (error) {
      // StorageManager might not be initialized yet - that's okay
      // The individual clearAll functions will handle it
      console.debug('[CacheVersionManager] StorageManager not available, skipping prefix clearing:', error);
    }

    // Clear dataCache in-memory cache
    dataCache.clear();

    // Update stored version
    localStorage.setItem(CACHE_VERSION_KEY, CACHE_SCHEMA_VERSION);
    
    console.log('[CacheVersionManager] All caches cleared and version updated to:', CACHE_SCHEMA_VERSION);
  } catch (error) {
    // Log error but don't throw - we don't want to break app startup
    console.error('[CacheVersionManager] Error checking/clearing cache version:', error);
  }
}

/**
 * Get the current cache version
 * @returns The current cache schema version
 */
export function getCacheVersion(): string {
  return CACHE_SCHEMA_VERSION;
}

/**
 * Get the stored cache version from localStorage
 * @returns The stored version, or null if not set
 */
export function getStoredCacheVersion(): string | null {
  try {
    return localStorage.getItem(CACHE_VERSION_KEY);
  } catch {
    return null;
  }
}

