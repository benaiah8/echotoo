/**
 * [OPTIMIZATION FILE: Phase 3]
 * 
 * This file contains the unified cache invalidation system.
 * 
 * Optimizations included:
 * - Cache: Unified invalidation for all related caches
 * - Event: Event-based cache invalidation
 * - Smart: Only clears what's needed, updates when possible
 * 
 * Related optimizations:
 * - See: src/lib/requestManager.ts for request deduplication
 */

import { clearCachedProfile } from "./profileCache";
import { clearCachedFollowStatus } from "./followStatusCache";
import { clearCachedFollowRequestStatus } from "./followRequestStatusCache";
import { clearCachedFollowCounts } from "./followCountsCache";
import { clearCachedNotificationSettings } from "./notificationSettingsCache";
import { clearPrivacyCache } from "./postPrivacyFilter";
import { clearCachedProfilePosts } from "./profilePostsCache";
import { clearCachedAvatar } from "./avatarCache";

/**
 * [OPTIMIZATION: Phase 3 - Cache] Cache relationship mapping
 * Why: Maps which caches need to be invalidated when a profile changes
 */
interface CacheRelationships {
  profile: string[]; // Related profile IDs
  followStatus: string[]; // Profile IDs involved in follow relationships
  followRequestStatus: string[]; // Profile IDs involved in follow requests
  followCounts: string[]; // Profile IDs whose counts need updating
  notificationSettings: string[]; // Profile IDs whose notification settings changed
  privacy: string[]; // Profile IDs whose privacy settings changed
  posts: string[]; // User IDs whose posts need refreshing
  avatar: string[]; // User IDs whose avatars changed
}

/**
 * [OPTIMIZATION: Phase 3 - Cache] Unified cache invalidation function
 * Why: Single function to invalidate all related caches, prevents cache inconsistencies
 * 
 * @param profileId - The profile ID that changed
 * @param relationships - Which related caches to invalidate
 * @param updateData - Optional: Update cache instead of invalidating (prevents flicker)
 */
export function invalidateRelatedCaches(
  profileId: string,
  relationships: Partial<CacheRelationships> = {},
  updateData?: {
    profile?: any;
    followStatus?: { viewerId: string; targetId: string; status: any };
    followCounts?: { profileId: string; following: number; followers: number };
    avatar?: { userId: string; avatarUrl: string };
  }
): void {
  console.log("[CacheInvalidation] Invalidating caches for profile:", profileId, relationships);

  // [OPTIMIZATION: Phase 3 - Smart] Update cache instead of invalidating when possible
  // Why: Prevents flicker, shows updated data immediately
  if (updateData?.profile) {
    const { setCachedProfile } = require("./profileCache");
    setCachedProfile(updateData.profile);
    console.log("[CacheInvalidation] Updated profile cache instead of invalidating");
  } else if (relationships.profile?.includes(profileId)) {
    clearCachedProfile(profileId);
  }

  // Invalidate follow status caches
  if (relationships.followStatus) {
    relationships.followStatus.forEach((id) => {
      clearCachedFollowStatus(id);
    });
  }

  // Invalidate follow request status caches
  if (relationships.followRequestStatus && relationships.followRequestStatus.length > 0) {
    // Note: followRequestStatus cache requires both follower and following IDs
    // For now, we clear all if any profile in the relationship changes
    // In production, you'd want to track both IDs for more precise clearing
    const { clearAllFollowRequestStatusCache } = require("./followRequestStatusCache");
    // Clear all follow request status cache when any relationship changes
    // This is safe because follow request status is checked frequently
    clearAllFollowRequestStatusCache();
  }

  // Invalidate follow counts caches
  if (relationships.followCounts) {
    relationships.followCounts.forEach((id) => {
      clearCachedFollowCounts(id);
    });
  }

  // Invalidate notification settings caches
  if (relationships.notificationSettings) {
    relationships.notificationSettings.forEach((id) => {
      clearCachedNotificationSettings(id);
    });
  }

  // Invalidate privacy caches
  if (relationships.privacy) {
    relationships.privacy.forEach((id) => {
      clearPrivacyCache(id);
    });
  }

  // Invalidate profile posts caches
  if (relationships.posts) {
    relationships.posts.forEach((userId) => {
      clearCachedProfilePosts(userId, "created");
      clearCachedProfilePosts(userId, "interacted");
      clearCachedProfilePosts(userId, "saved");
    });
  }

  // Invalidate avatar caches
  if (relationships.avatar) {
    relationships.avatar.forEach((userId) => {
      clearCachedAvatar(userId);
    });
  }
}

/**
 * [OPTIMIZATION: Phase 3 - Event] Event-based cache invalidation
 * Why: Automatically invalidates caches when profile or follow status changes
 */
export function setupCacheInvalidationListeners(): void {
  // Listen for profile updates
  window.addEventListener("profile:updated", (event: any) => {
    const profileId = event.detail?.id;
    if (!profileId) return;

    console.log("[CacheInvalidation] Profile updated event:", profileId);

    // Invalidate related caches
    invalidateRelatedCaches(profileId, {
      profile: [profileId],
      followCounts: [profileId],
      posts: [profileId], // Assuming profileId is user_id for posts
    });
  });

  // Listen for follow status changes
  window.addEventListener("follow:changed", (event: any) => {
    const targetId = event.detail?.targetId;
    if (!targetId) return;

    console.log("[CacheInvalidation] Follow changed event:", targetId);

    // Invalidate follow-related caches
    invalidateRelatedCaches(targetId, {
      followStatus: [targetId],
      followCounts: [targetId],
    });
  });
}

/**
 * [OPTIMIZATION: Phase 3 - Smart] Smart cache invalidation for profile updates
 * Why: Only invalidates what's needed, updates when possible
 */
export function invalidateProfileCaches(
  profileId: string,
  changes: {
    profile?: boolean;
    followStatus?: boolean;
    followCounts?: boolean;
    privacy?: boolean;
    avatar?: boolean;
    posts?: boolean;
  } = {}
): void {
  const relationships: Partial<CacheRelationships> = {};

  if (changes.profile) relationships.profile = [profileId];
  if (changes.followStatus) relationships.followStatus = [profileId];
  if (changes.followCounts) relationships.followCounts = [profileId];
  if (changes.privacy) relationships.privacy = [profileId];
  if (changes.avatar) relationships.avatar = [profileId];
  if (changes.posts) relationships.posts = [profileId];

  invalidateRelatedCaches(profileId, relationships);
}

/**
 * [OPTIMIZATION: Phase 3 - Smart] Smart cache invalidation for follow changes
 * Why: Only invalidates follow-related caches, not everything
 */
export function invalidateFollowCaches(
  followerId: string,
  followingId: string
): void {
  invalidateRelatedCaches(followerId, {
    followStatus: [followerId, followingId],
    followCounts: [followerId, followingId],
    followRequestStatus: [followerId, followingId],
  });
}

