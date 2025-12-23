/**
 * [OPTIMIZATION: Phase 1 - Batch Data Loader]
 *
 * Unified batch data loader that fetches all related data for posts in single batched queries
 * instead of individual queries per post. Reduces API calls from ~50 to ~8 for homepage.
 *
 * Why: Dramatically reduces egress data and improves performance by batching related queries
 */

import { supabase } from "./supabaseClient";
import { getBatchFollowStatuses } from "../api/services/follows";
import { getViewerId } from "../api/services/follows";

// RSVP User interface (matches rsvpCache.ts)
export interface RSVPUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: "going" | "maybe" | "not_going";
  created_at: string;
}

// Profile interface (matches profileCache.ts)
export interface Profile {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private?: boolean | null;
  social_media_public?: boolean | null;
}

// RSVP Data structure
export interface RSVPData {
  users: RSVPUser[];
  currentUserStatus: string | null;
}

// Batch load options
export interface BatchLoadOptions {
  postIds: string[];
  authorIds: string[]; // Profile IDs of post authors
  hangoutPostIds: string[]; // Post IDs that are hangouts (need RSVP data)
  currentUserId: string; // Auth user ID
  currentProfileId: string; // Profile ID of current user
}

// Batch load result
export interface BatchLoadResult {
  followStatuses: Map<string, "none" | "pending" | "following" | "friends">;
  likeStatuses: Map<string, boolean>;
  saveStatuses: Map<string, boolean>;
  rsvpData: Map<string, RSVPData>;
  profiles: Map<string, Profile>;
}

/**
 * Load all related data for posts in batched queries
 *
 * This function replaces individual queries per post with batched queries:
 * - Follow statuses: 1 query for all authors
 * - Like statuses: 1 query for all posts
 * - Save statuses: 1 query for all posts
 * - RSVP data: 2-3 queries for all hangout posts
 * - Profiles: 1 query for all authors
 *
 * Total: ~5-8 queries instead of ~50 queries for 6 posts
 */
export async function loadBatchData(
  options: BatchLoadOptions
): Promise<BatchLoadResult> {
  const {
    postIds,
    authorIds,
    hangoutPostIds,
    currentUserId,
    currentProfileId,
  } = options;

  // Initialize result maps
  const result: BatchLoadResult = {
    followStatuses: new Map(),
    likeStatuses: new Map(),
    saveStatuses: new Map(),
    rsvpData: new Map(),
    profiles: new Map(),
  };

  // Early return if no data to load
  if (
    postIds.length === 0 &&
    authorIds.length === 0 &&
    hangoutPostIds.length === 0
  ) {
    return result;
  }

  // Log batch loading start
  console.log(
    "%c🔄 [BATCH LOADER] Starting batch load...",
    "color: #3b82f6; font-weight: bold;",
    {
      posts: postIds.length,
      authors: authorIds.length,
      hangouts: hangoutPostIds.length,
    }
  );

  try {
    // Execute all batch queries in parallel for maximum efficiency
    const [
      followStatusesResult,
      likeStatusesResult,
      saveStatusesResult,
      rsvpDataResult,
      profilesResult,
    ] = await Promise.allSettled([
      // 1. Batch follow statuses for all authors
      loadBatchFollowStatuses(currentProfileId, authorIds),
      // 2. Batch like statuses for all posts
      loadBatchLikeStatuses(currentUserId, postIds),
      // 3. Batch save statuses for all posts
      loadBatchSaveStatuses(currentUserId, postIds),
      // 4. Batch RSVP data for all hangout posts
      loadBatchRSVPData(currentUserId, hangoutPostIds),
      // 5. Batch profiles for all authors
      loadBatchProfiles(authorIds),
    ]);

    // Process follow statuses
    if (followStatusesResult.status === "fulfilled") {
      followStatusesResult.value.forEach((status, authorId) => {
        result.followStatuses.set(authorId, status);
      });
    } else {
      console.error(
        "[BatchDataLoader] Error loading follow statuses:",
        followStatusesResult.reason
      );
    }

    // Process like statuses
    if (likeStatusesResult.status === "fulfilled") {
      likeStatusesResult.value.forEach((isLiked, postId) => {
        result.likeStatuses.set(postId, isLiked);
      });
    } else {
      console.error(
        "[BatchDataLoader] Error loading like statuses:",
        likeStatusesResult.reason
      );
    }

    // Process save statuses
    if (saveStatusesResult.status === "fulfilled") {
      saveStatusesResult.value.forEach((isSaved, postId) => {
        result.saveStatuses.set(postId, isSaved);
      });
    } else {
      console.error(
        "[BatchDataLoader] Error loading save statuses:",
        saveStatusesResult.reason
      );
    }

    // Process RSVP data
    if (rsvpDataResult.status === "fulfilled") {
      rsvpDataResult.value.forEach((rsvpData, postId) => {
        result.rsvpData.set(postId, rsvpData);
      });
    } else {
      console.error(
        "[BatchDataLoader] Error loading RSVP data:",
        rsvpDataResult.reason
      );
    }

    // Process profiles
    if (profilesResult.status === "fulfilled") {
      profilesResult.value.forEach((profile, profileId) => {
        result.profiles.set(profileId, profile);
      });
    } else {
      console.error(
        "[BatchDataLoader] Error loading profiles:",
        profilesResult.reason
      );
    }

    // Count successful queries
    const successfulQueries = [
      followStatusesResult.status === "fulfilled",
      likeStatusesResult.status === "fulfilled",
      saveStatusesResult.status === "fulfilled",
      rsvpDataResult.status === "fulfilled",
      profilesResult.status === "fulfilled",
    ].filter(Boolean).length;

    // Calculate estimated query reduction
    // Before: ~8 queries per post (follow + like + save + RSVP + profiles + images + etc.)
    // After: 5 batched queries total
    const estimatedOldQueries = postIds.length * 8; // Rough estimate
    const actualQueries = successfulQueries;
    const reduction =
      estimatedOldQueries > 0
        ? Math.round((1 - actualQueries / estimatedOldQueries) * 100)
        : 0;

    // Prominent success log
    console.log(
      "%c✅ [BATCH LOADER] Successfully loaded data",
      "color: #10b981; font-weight: bold; font-size: 14px;",
      {
        posts: postIds.length,
        authors: authorIds.length,
        hangouts: hangoutPostIds.length,
        queries: `${actualQueries} batched queries`,
        reduction: `~${reduction}% fewer queries`,
        breakdown: {
          followStatuses:
            followStatusesResult.status === "fulfilled" ? "✅" : "❌",
          likeStatuses: likeStatusesResult.status === "fulfilled" ? "✅" : "❌",
          saveStatuses: saveStatusesResult.status === "fulfilled" ? "✅" : "❌",
          rsvpData: rsvpDataResult.status === "fulfilled" ? "✅" : "❌",
          profiles: profilesResult.status === "fulfilled" ? "✅" : "❌",
        },
      }
    );

    return result;
  } catch (error) {
    console.error("[BatchDataLoader] Error in loadBatchData:", error);
    // Return partial results even on error
    return result;
  }
}

/**
 * Batch load follow statuses for multiple authors
 * Uses existing getBatchFollowStatuses function
 */
async function loadBatchFollowStatuses(
  viewerProfileId: string,
  authorIds: string[]
): Promise<Map<string, "none" | "pending" | "following" | "friends">> {
  if (!viewerProfileId || authorIds.length === 0) {
    return new Map();
  }

  try {
    // Filter out self from authors (no need to check follow status for self)
    const otherAuthorIds = authorIds.filter((id) => id !== viewerProfileId);

    if (otherAuthorIds.length === 0) {
      return new Map();
    }

    // Use existing batch function
    const statuses = await getBatchFollowStatuses(
      viewerProfileId,
      otherAuthorIds
    );

    // Convert to Map
    const statusMap = new Map<
      string,
      "none" | "pending" | "following" | "friends"
    >();
    Object.entries(statuses).forEach(([authorId, status]) => {
      statusMap.set(authorId, status);
    });

    return statusMap;
  } catch (error) {
    console.error(
      "[BatchDataLoader] Error loading batch follow statuses:",
      error
    );
    return new Map();
  }
}

/**
 * Batch load like statuses for multiple posts
 * Single query: .in("post_id", postIds)
 */
async function loadBatchLikeStatuses(
  currentUserId: string,
  postIds: string[]
): Promise<Map<string, boolean>> {
  if (!currentUserId || postIds.length === 0) {
    return new Map();
  }

  try {
    // Filter out draft posts (they have invalid UUIDs)
    const validPostIds = postIds.filter((id) => !id.startsWith("draft-"));

    if (validPostIds.length === 0) {
      // Initialize all as false
      const result = new Map<string, boolean>();
      postIds.forEach((id) => result.set(id, false));
      return result;
    }

    // Single batch query for all posts
    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", currentUserId)
      .in("post_id", validPostIds);

    if (error) {
      console.error(
        "[BatchDataLoader] Error loading batch like statuses:",
        error
      );
      // Return all false on error
      const result = new Map<string, boolean>();
      postIds.forEach((id) => result.set(id, false));
      return result;
    }

    // Create set of liked post IDs
    const likedPostIds = new Set(data?.map((like) => like.post_id) || []);

    // Build result map (true if liked, false otherwise)
    const result = new Map<string, boolean>();
    postIds.forEach((postId) => {
      if (postId.startsWith("draft-")) {
        result.set(postId, false);
      } else {
        result.set(postId, likedPostIds.has(postId));
      }
    });

    return result;
  } catch (error) {
    console.error(
      "[BatchDataLoader] Error loading batch like statuses:",
      error
    );
    // Return all false on error
    const result = new Map<string, boolean>();
    postIds.forEach((id) => result.set(id, false));
    return result;
  }
}

/**
 * Batch load save statuses for multiple posts
 * Single query: .in("post_id", postIds)
 */
async function loadBatchSaveStatuses(
  currentUserId: string,
  postIds: string[]
): Promise<Map<string, boolean>> {
  if (!currentUserId || postIds.length === 0) {
    return new Map();
  }

  try {
    // Filter out draft posts (they have invalid UUIDs)
    const validPostIds = postIds.filter((id) => !id.startsWith("draft-"));

    if (validPostIds.length === 0) {
      // Initialize all as false
      const result = new Map<string, boolean>();
      postIds.forEach((id) => result.set(id, false));
      return result;
    }

    // Single batch query for all posts
    const { data, error } = await supabase
      .from("saved_posts")
      .select("post_id")
      .eq("user_id", currentUserId)
      .in("post_id", validPostIds);

    if (error) {
      console.error(
        "[BatchDataLoader] Error loading batch save statuses:",
        error
      );
      // Return all false on error
      const result = new Map<string, boolean>();
      postIds.forEach((id) => result.set(id, false));
      return result;
    }

    // Create set of saved post IDs
    const savedPostIds = new Set(data?.map((saved) => saved.post_id) || []);

    // Build result map (true if saved, false otherwise)
    const result = new Map<string, boolean>();
    postIds.forEach((postId) => {
      if (postId.startsWith("draft-")) {
        result.set(postId, false);
      } else {
        result.set(postId, savedPostIds.has(postId));
      }
    });

    return result;
  } catch (error) {
    console.error(
      "[BatchDataLoader] Error loading batch save statuses:",
      error
    );
    // Return all false on error
    const result = new Map<string, boolean>();
    postIds.forEach((id) => result.set(id, false));
    return result;
  }
}

/**
 * Batch load RSVP data for multiple hangout posts
 * Uses 2-3 queries total instead of 3 queries per post
 */
async function loadBatchRSVPData(
  currentUserId: string,
  hangoutPostIds: string[]
): Promise<Map<string, RSVPData>> {
  if (!currentUserId || hangoutPostIds.length === 0) {
    return new Map();
  }

  try {
    // Initialize result map with empty data
    const result = new Map<string, RSVPData>();
    hangoutPostIds.forEach((postId) => {
      result.set(postId, { users: [], currentUserStatus: null });
    });

    // Query 1: Get all RSVP responses for all hangout posts (only "going" status)
    const { data: rsvpData, error: rsvpError } = await supabase
      .from("rsvp_responses")
      .select("id, post_id, user_id, status, created_at")
      .in("post_id", hangoutPostIds)
      .eq("status", "going")
      .order("created_at", { ascending: false });

    if (rsvpError) {
      console.error(
        "[BatchDataLoader] Error loading batch RSVP responses:",
        rsvpError
      );
      return result; // Return empty data
    }

    // Query 2: Get current user's RSVP status for all hangout posts
    const { data: currentUserRsvpData, error: currentUserRsvpError } =
      await supabase
        .from("rsvp_responses")
        .select("post_id, status")
        .in("post_id", hangoutPostIds)
        .eq("user_id", currentUserId);

    if (currentUserRsvpError) {
      console.error(
        "[BatchDataLoader] Error loading current user RSVP statuses:",
        currentUserRsvpError
      );
    }

    // Create map of current user's RSVP statuses
    const currentUserRsvpMap = new Map<string, string | null>();
    currentUserRsvpData?.forEach((rsvp) => {
      currentUserRsvpMap.set(rsvp.post_id, rsvp.status);
    });

    // Group RSVP responses by post_id
    const rsvpByPost = new Map<string, typeof rsvpData>();
    rsvpData?.forEach((rsvp) => {
      if (!rsvpByPost.has(rsvp.post_id)) {
        rsvpByPost.set(rsvp.post_id, []);
      }
      rsvpByPost.get(rsvp.post_id)!.push(rsvp);
    });

    // Get unique auth user IDs from all RSVP responses
    const authUserIds = [
      ...new Set(rsvpData?.map((rsvp) => rsvp.user_id) || []),
    ];

    // Query 3: Get profiles for all RSVP users (only if we have RSVP users)
    let profilesData: any[] = [];
    if (authUserIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, user_id, username, display_name, avatar_url")
        .in("user_id", authUserIds);

      if (profilesError) {
        console.error(
          "[BatchDataLoader] Error loading RSVP user profiles:",
          profilesError
        );
      } else {
        profilesData = profiles || [];
      }
    }

    // Build RSVP data for each post
    hangoutPostIds.forEach((postId) => {
      const postRsvps = rsvpByPost.get(postId) || [];
      const currentUserStatus = currentUserRsvpMap.get(postId) || null;

      // Map RSVP responses to RSVPUser format
      const users: RSVPUser[] = postRsvps
        .slice(0, 10) // Limit to 10 users per post (matching dataCache behavior)
        .map((rsvp) => {
          const profile = profilesData.find((p) => p.user_id === rsvp.user_id);
          return {
            id: profile?.id || rsvp.user_id,
            username: profile?.username || null,
            display_name: profile?.display_name || null,
            avatar_url: profile?.avatar_url || null,
            status: rsvp.status as "going" | "maybe" | "not_going",
            created_at: rsvp.created_at || new Date().toISOString(),
          };
        });

      result.set(postId, {
        users,
        currentUserStatus,
      });
    });

    return result;
  } catch (error) {
    console.error("[BatchDataLoader] Error loading batch RSVP data:", error);
    // Return empty data on error
    const result = new Map<string, RSVPData>();
    hangoutPostIds.forEach((postId) => {
      result.set(postId, { users: [], currentUserStatus: null });
    });
    return result;
  }
}

/**
 * Batch load profiles for multiple authors
 * Single query: .in("id", profileIds)
 */
async function loadBatchProfiles(
  profileIds: string[]
): Promise<Map<string, Profile>> {
  if (profileIds.length === 0) {
    return new Map();
  }

  try {
    // Single batch query for all profiles
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public"
      )
      .in("id", profileIds);

    if (error) {
      console.error("[BatchDataLoader] Error loading batch profiles:", error);
      return new Map();
    }

    // Convert to Map
    const profileMap = new Map<string, Profile>();
    data?.forEach((profile) => {
      profileMap.set(profile.id, profile as Profile);
    });

    return profileMap;
  } catch (error) {
    console.error("[BatchDataLoader] Error loading batch profiles:", error);
    return new Map();
  }
}
