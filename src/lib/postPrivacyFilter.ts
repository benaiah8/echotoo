/**
 * [OPTIMIZATION FILE: Phase 1]
 * 
 * This file contains the centralized privacy filtering utility for posts.
 * 
 * Optimizations included:
 * - Privacy Filter: Centralized filtering logic for all post types
 * - Cache: Privacy status caching with 5-minute TTL
 * - Batch: Batch operations for privacy and follow status checks
 * 
 * Related optimizations:
 * - See: src/lib/profileCache.ts for profile caching
 * - See: src/api/services/follows.ts for batch follow status checks
 */

import { supabase } from "./supabaseClient";
import { getBatchFollowStatuses } from "../api/services/follows";

/**
 * Generic post type that has an author ID
 * Supports multiple post structures: FeedItem, LikedPostWithDetails, etc.
 */
type PostWithAuthor = {
  author_id?: string;
  author?: { id?: string | null } | null;
  posts?: { author_id?: string } | null;
  [key: string]: any; // Allow other properties
};

/**
 * [OPTIMIZATION: Phase 1 - Cache] Privacy status cache with 5-minute TTL
 * Why: Reduces database queries by caching which profiles are private
 */
interface PrivacyStatusCacheEntry {
  isPrivate: boolean;
  timestamp: number;
}

const privacyStatusCache = new Map<string, PrivacyStatusCacheEntry>();
const PRIVACY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * [OPTIMIZATION: Phase 1 - Privacy Filter] Extract author ID from various post structures
 * Why: Supports different post formats (FeedItem, LikedPostWithDetails, etc.) flexibly
 */
function getAuthorId(post: PostWithAuthor): string | null {
  // Try different possible structures
  if (post.author_id) return post.author_id;
  if (post.author?.id) return post.author.id;
  if (post.posts?.author_id) return post.posts.author_id;
  return null;
}

/**
 * [OPTIMIZATION: Phase 1 - Cache] Check if authors are private (with caching)
 * Why: Caches privacy status to avoid repeated database queries for the same profiles
 */
async function getPrivateAuthorIds(authorIds: string[]): Promise<Set<string>> {
  if (authorIds.length === 0) return new Set();

  // Check cache first
  const uncachedIds: string[] = [];
  const cachedPrivateIds = new Set<string>();

  for (const id of authorIds) {
    const cached = privacyStatusCache.get(id);
    if (cached && Date.now() - cached.timestamp < PRIVACY_CACHE_TTL) {
      if (cached.isPrivate) {
        cachedPrivateIds.add(id);
      }
    } else {
      uncachedIds.push(id);
    }
  }

  // [OPTIMIZATION: Phase 3 - Dedupe] Prevent duplicate privacy status checks for same profile
  // Why: Multiple components checking same privacy status won't trigger duplicate requests
  if (uncachedIds.length > 0) {
    const { requestManager } = await import("./requestManager");
    const dedupeKey = `privacy_status_${uncachedIds.sort().join("_")}`;
    
    const result = await requestManager.execute(
      dedupeKey,
      async (signal) => {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, is_private")
          .in("id", uncachedIds);
        return profiles;
      },
      "medium" // Medium priority for privacy checks
    );
    
    const profiles = result.data;

    if (profiles) {
      for (const profile of profiles) {
        const isPrivate = profile.is_private === true;
        privacyStatusCache.set(profile.id, {
          isPrivate,
          timestamp: Date.now(),
        });
        if (isPrivate) {
          cachedPrivateIds.add(profile.id);
        }
      }
    }
  }

  return cachedPrivateIds;
}

/**
 * [OPTIMIZATION: Phase 1 - Privacy Filter] Filter posts to only show those from public accounts
 * or private accounts where the viewer is an approved follower
 * 
 * Why: Centralized filtering logic eliminates code duplication and ensures consistent
 * privacy behavior across feed, profile sections, and saved posts
 * 
 * @param posts - Array of posts (any structure with author info)
 * @param viewerProfileId - Viewer's profile ID (null/undefined = not logged in, show only public)
 * @returns Filtered array of posts
 */
export async function filterPostsByPrivacy<T extends PostWithAuthor>(
  posts: T[],
  viewerProfileId?: string | null
): Promise<T[]> {
  if (!posts || posts.length === 0) return posts;

  // [OPTIMIZATION: Phase 1 - Batch] Extract all author IDs at once
  // Why: Single pass through posts to collect all unique author IDs
  const authorIds = Array.from(
    new Set(
      posts
        .map(getAuthorId)
        .filter((id): id is string => !!id)
    )
  );

  if (authorIds.length === 0) return posts;

  // [OPTIMIZATION: Phase 1 - Cache] Get privacy status with caching
  // Why: Uses cached privacy status when available, reduces database queries
  const privateAuthorIds = await getPrivateAuthorIds(authorIds);

  if (privateAuthorIds.size === 0) {
    // All authors are public, return all posts
    return posts;
  }

  if (!viewerProfileId) {
    // Not logged in - only show public account posts
    return posts.filter((post) => {
      const authorId = getAuthorId(post);
      return !authorId || !privateAuthorIds.has(authorId);
    });
  }

  // Logged in - check follow status for private accounts
  // [OPTIMIZATION: Phase 2 - Batch] Batch follow status check for all private authors
  // Why: Single API call instead of multiple sequential calls
  const followStatuses = await getBatchFollowStatuses(
    viewerProfileId,
    Array.from(privateAuthorIds)
  );

  // Filter posts
  return posts.filter((post) => {
    const authorId = getAuthorId(post);
    if (!authorId) return true;

    // If author is not private, show the post
    if (!privateAuthorIds.has(authorId)) return true;

    // If author is private, check if viewer is approved follower
    const status = followStatuses[authorId];
    return status === "following" || status === "friends";
  });
}

/**
 * [OPTIMIZATION: Phase 1 - Cache] Clear privacy cache (useful when privacy settings change)
 * Why: Ensures cache is invalidated when privacy settings are updated
 */
export function clearPrivacyCache(profileId?: string): void {
  if (profileId) {
    privacyStatusCache.delete(profileId);
  } else {
    privacyStatusCache.clear();
  }
}

