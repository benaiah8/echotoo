// src/api/services/follows.ts
import { supabase } from "../../lib/supabaseClient";
import { retry } from "../../lib/retry";
import { dataCache } from "../../lib/dataCache";

// Cache for authentication to prevent multiple calls
let authCache: { userId: string | null; timestamp: number } | null = null;
const AUTH_CACHE_DURATION = 30 * 1000; // 30 seconds

// Function to clear auth cache (call when auth state changes)
// [CACHE FIX] Now also clears feed cache to prevent cross-user data leakage
export function clearAuthCache() {
  authCache = null;
  // Clear feed cache when auth state changes
  // This prevents User A's cached feed from being shown to User B
  // [CACHE FIX] Use static import instead of require() for browser compatibility
  try {
    dataCache.clearFeedCache();
  } catch (error) {
    console.warn("[clearAuthCache] Failed to clear feed cache:", error);
    // Don't throw - auth cache clearing should still succeed
  }
}

/** Return the viewer's *profile id* (not auth user id). */
export async function getViewerId(): Promise<string | null> {
  try {
    // Check cache first
    if (authCache && Date.now() - authCache.timestamp < AUTH_CACHE_DURATION) {
      if (authCache.userId) {
        // Still need to get profile ID from cached user ID
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", authCache.userId)
          .maybeSingle();

        if (!profileError && profile?.id) {
          return profile.id;
        }
      }
      // If profile lookup failed, fall through to fresh auth check
    }

    // Try multiple methods to get the auth user ID
    let authId: string | null = null;

    // Method 1: Try getSession first (most reliable)
    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (!sessionError && sessionData.session?.user?.id) {
        authId = sessionData.session.user.id;
      }
    } catch (error) {
      console.log("Session method failed, trying getUser");
    }

    // Method 2: Fallback to getUser
    if (!authId) {
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (!userError && userData.user?.id) {
          authId = userData.user.id;
        }
      } catch (error) {
        console.log("getUser method failed");
      }
    }

    if (!authId) {
      console.log("No auth user ID found");
      // Cache the null result to prevent repeated failed checks
      authCache = { userId: null, timestamp: Date.now() };
      return null;
    }

    // console.log("Found auth user ID:", authId);

    // Cache the auth result
    authCache = { userId: authId, timestamp: Date.now() };

    // Get the profile ID for this auth user
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", authId)
      .maybeSingle();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      return null;
    }

    if (!profile?.id) {
      console.error("No profile found for auth user:", authId);
      return null;
    }

    console.log("Found profile ID:", profile.id);
    return profile.id;
  } catch (error) {
    console.error("getViewerId error:", error);
    return null;
  }
}

export async function getFollowCounts(profileId: string) {
  try {
    // Only count approved follows (not pending or declined)
    const [followingRes, followersRes] = await Promise.all([
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profileId)
        .eq("status", "approved"),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profileId)
        .eq("status", "approved"),
    ]);

    return {
      following: followingRes.count ?? 0,
      followers: followersRes.count ?? 0,
    };
  } catch (error) {
    console.error("Error getting follow counts:", error);
    return { following: 0, followers: 0 };
  }
}

export async function isFollowing(
  viewerProfileId: string,
  targetProfileId: string
) {
  try {
    // Only return true if status is 'approved' (not 'pending' or 'declined')
    const { data, error } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", viewerProfileId)
      .eq("following_id", targetProfileId)
      .eq("status", "approved")
      .maybeSingle();

    if (error) {
      console.error("Error checking follow status:", error);
      return false;
    }

    return data !== null && data.status === "approved";
  } catch (error) {
    console.error("Exception checking follow status:", error);
    return false;
  }
}

export async function getFollowStatus(
  viewerProfileId: string,
  targetProfileId: string
): Promise<"none" | "pending" | "following" | "friends"> {
  // [OPTIMIZATION: Phase 3 - Dedupe] Prevent duplicate follow status checks for same user
  // Why: Multiple components checking same follow status won't trigger duplicate requests
  const { requestManager } = await import("../../lib/requestManager");
  const dedupeKey = `follow_status_${viewerProfileId}_${targetProfileId}`;
  
  const result = await requestManager.execute(
    dedupeKey,
    async (signal) => {
      try {
        if (!viewerProfileId || !targetProfileId) {
          return "none";
        }

        // Get the actual follow relationship with status
        const [followingRes, followedByRes] = await Promise.all([
          supabase
            .from("follows")
            .select("status")
            .eq("follower_id", viewerProfileId)
            .eq("following_id", targetProfileId)
            .maybeSingle(),
          supabase
            .from("follows")
            .select("status")
            .eq("follower_id", targetProfileId)
            .eq("following_id", viewerProfileId)
            .maybeSingle(),
        ]);

        const userFollowing = followingRes.data;
        const targetFollowing = followedByRes.data;

        // Check if user is following target
        if (userFollowing) {
          // If status is 'pending', return 'pending'
          if (userFollowing.status === "pending") {
            return "pending";
          }
          // If status is 'approved', check if mutual
          if (userFollowing.status === "approved") {
            // Check if target is also following (mutual follow)
            if (targetFollowing && targetFollowing.status === "approved") {
              return "friends";
            }
            return "following";
          }
          // If status is 'declined', treat as not following
          return "none";
        }

        // User is not following target
        return "none";
      } catch (error) {
        console.error("Error getting follow status:", error);
        return "none";
      }
    },
    "high" // High priority for follow status checks
  );

  return result.data ?? "none";
}

/**
 * Batch check follow statuses for multiple users
 * More efficient than checking one by one
 */
export async function getBatchFollowStatuses(
  viewerProfileId: string,
  targetProfileIds: string[]
): Promise<{ [targetId: string]: "none" | "pending" | "following" | "friends" }> {
  try {
    if (!viewerProfileId || targetProfileIds.length === 0) {
      return {};
    }

    // [OPTIMIZATION: Phase 7.2] Add retry logic to database queries
    // Why: Handles transient network failures gracefully, improves reliability
    const result = await retry(
      async () => {
        // Get all follows where viewer follows any of the targets (with status)
        const { data: followingData, error: followingError } = await supabase
          .from("follows")
          .select("following_id, status")
          .eq("follower_id", viewerProfileId)
          .in("following_id", targetProfileIds);

        if (followingError) throw followingError;

        // Get all follows where targets follow the viewer (mutual follows, with status)
        const { data: followedByData, error: followedByError } = await supabase
          .from("follows")
          .select("follower_id, status")
          .eq("following_id", viewerProfileId)
          .in("follower_id", targetProfileIds);

        if (followedByError) throw followedByError;

        return { followingData, followedByData };
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        onRetry: (attempt, err) => {
          console.log(
            `[getBatchFollowStatuses] Retry attempt ${attempt}:`,
            err
          );
        },
      }
    );

    const { followingData, followedByData } = result;

    // Create maps with status information
    const followingMap = new Map(
      (followingData || []).map((f) => [f.following_id, f.status])
    );
    const followedByMap = new Map(
      (followedByData || []).map((f) => [f.follower_id, f.status])
    );

    // [FIX] Rename to avoid variable name collision with retry result
    const statusMap: { [targetId: string]: "none" | "pending" | "following" | "friends" } =
      {};

    for (const targetId of targetProfileIds) {
      const userFollowingStatus = followingMap.get(targetId);
      const targetFollowingStatus = followedByMap.get(targetId);

      // Check if user is following target
      if (userFollowingStatus) {
        // If status is 'pending', return 'pending'
        if (userFollowingStatus === "pending") {
          statusMap[targetId] = "pending";
          continue;
        }
        // If status is 'approved', check if mutual
        if (userFollowingStatus === "approved") {
          // Check if target is also following (mutual follow)
          if (targetFollowingStatus === "approved") {
            statusMap[targetId] = "friends";
            continue;
          }
          statusMap[targetId] = "following";
          continue;
        }
        // If status is 'declined', treat as not following
      }

      // User is not following target
      statusMap[targetId] = "none";
    }

    return statusMap;
  } catch (error) {
    console.error("Error getting batch follow statuses:", error);
    return {};
  }
}

export async function follow(targetProfileId: string) {
  console.log("=== FOLLOW API CALL START ===");

  try {
    // Step 1: Get the current user's profile ID
    const me = await getViewerId();
    console.log("Follow attempt - viewer profile ID:", me);

    if (!me) {
      console.error("Follow failed: No viewer ID found");
      return { error: { message: "Not signed in" } };
    }

    if (me === targetProfileId) {
      console.log("Follow skipped: Trying to follow self");
      return { error: null, status: "self" as const };
    }

    console.log("Attempting to follow profile:", targetProfileId);

    // Step 2: Verify target profile exists and check if it's private
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, user_id, is_private")
      .eq("id", targetProfileId)
      .single();

    if (profileError || !targetProfile) {
      console.error("Target profile not found:", targetProfileId, profileError);
      return { error: { message: "Target profile not found" } };
    }

    console.log("Target profile verified:", targetProfile);
    const isPrivateAccount = targetProfile.is_private === true;

    // Step 3: Check current follow status
    const currentStatus = await isFollowing(me, targetProfileId);
    console.log("Current follow status:", currentStatus);

    if (currentStatus) {
      console.log("Already following this user");
      // Return "approved" status (could be "friends" if mutual, but we'll let the component verify)
      return { error: null, status: "approved" as const };
    }

    // Step 4: Determine follow status based on account privacy
    // If private: status = 'pending', if public: status = 'approved'
    const followStatus = isPrivateAccount ? "pending" : "approved";
    console.log("Creating follow relationship with status:", followStatus, {
      follower_id: me,
      following_id: targetProfileId,
      is_private: isPrivateAccount,
    });

    // Get follower's auth user_id for notifications
    const { data: followerProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("id", me)
      .single();

    // Try different approaches to avoid the "id" field trigger issue

    // Method 1: Simple insert without select
    let { error: followError } = await supabase.from("follows").insert({
      follower_id: me,
      following_id: targetProfileId,
      status: followStatus,
    });

    console.log("Follow result (method 1):", { followError });

    // If that fails with the "id" field error, try using upsert instead
    if (
      followError &&
      followError.message.includes('record "new" has no field "id"')
    ) {
      console.log("Retrying with upsert to avoid trigger issue...");

      const { error: upsertError } = await supabase.from("follows").upsert(
        {
          follower_id: me,
          following_id: targetProfileId,
          status: followStatus,
        },
        {
          onConflict: "follower_id,following_id",
        }
      );

      followError = upsertError;
      console.log("Follow result (upsert method):", { followError });
    }

    if (followError) {
      console.error("Follow API error:", followError);

      // Check if it's a duplicate key error (user already following)
      if (
        followError.code === "23505" ||
        followError.message.includes("duplicate key")
      ) {
        console.log("User is already following - treating as success");
        return { error: null };
      }

      return { error: followError };
    }

    console.log("Follow successful");

    // Step 5: Create follow request notifications if account is private
    if (isPrivateAccount) {
      // Enhanced logging to debug notification creation issues
      console.log("Creating notifications for private account follow request:", {
        followerProfile_user_id: followerProfile?.user_id,
        targetProfile_user_id: targetProfile.user_id,
        follower_id: me,
        following_id: targetProfileId,
      });

      if (!followerProfile?.user_id) {
        console.error("Cannot create notifications: followerProfile.user_id is missing", {
          followerProfile,
          follower_profile_id: me,
        });
      } else if (!targetProfile.user_id) {
        console.error("Cannot create notifications: targetProfile.user_id is missing", {
          targetProfile,
          following_profile_id: targetProfileId,
        });
      } else {
        try {
          // Use database function to bypass RLS (SECURITY DEFINER)
          // Use entity_type: 'post' to match database constraint and existing trigger pattern
          // The actual follow request info is stored in additional_data
          
          // Notification for account owner (received request)
          const { error: receivedError } = await supabase.rpc('create_notification', {
            p_user_id: targetProfile.user_id, // Account owner (receives notification)
            p_actor_id: followerProfile.user_id, // Follower (person requesting)
            p_type: 'follow',
            p_entity_type: 'post', // Use 'post' to match database constraint (matches existing trigger pattern)
            p_entity_id: me, // Follower's profile ID
            p_additional_data: {
              follow_request_status: 'pending',
              follower_profile_id: me,
              following_profile_id: targetProfileId,
            }
          });

          // Notification for requester (sent request)
          const { error: sentError } = await supabase.rpc('create_notification', {
            p_user_id: followerProfile.user_id, // Requester (receives notification)
            p_actor_id: targetProfile.user_id, // Account owner
            p_type: 'follow',
            p_entity_type: 'post', // Use 'post' to match database constraint (matches existing trigger pattern)
            p_entity_id: targetProfileId, // Account owner's profile ID
            p_additional_data: {
              follow_request_status: 'pending',
              follower_profile_id: me,
              following_profile_id: targetProfileId,
            }
          });

          if (receivedError || sentError) {
            console.error("Error creating follow request notifications:", {
              receivedError,
              sentError,
            });
          } else {
            console.log("Follow request notifications created successfully (received and sent)");
          }
        } catch (notificationError) {
          console.error("Exception creating follow request notifications:", {
            error: notificationError,
            stack: (notificationError as Error)?.stack,
          });
          // Don't fail the follow if notification creation fails
        }
      }
    }

    // Step 6: Enable notifications for this user by default (only if approved)
    if (followStatus === "approved") {
      try {
        await supabase.from("notification_settings").upsert({
          user_id: me,
          target_user_id: targetProfileId,
          enabled: true,
        });
        console.log("Notifications enabled for followed user");
      } catch (notificationError) {
        console.error("Failed to enable notifications:", notificationError);
        // Don't fail the follow if notification setup fails
      }
    }

    // Return the actual status created (pending or approved)
    return { error: null, status: followStatus };
  } catch (error) {
    console.error("Follow exception:", error);
    return { error: { message: "Failed to follow" } };
  } finally {
    console.log("=== FOLLOW API CALL END ===");
  }
}

/**
 * Approve a pending follow request
 * Only the account owner can approve follow requests
 */
export async function approveFollowRequest(
  followerProfileId: string
): Promise<{ error: any }> {
  console.log("=== APPROVE FOLLOW REQUEST START ===");

  try {
    const me = await getViewerId();
    if (!me) {
      console.error("Approve failed: No viewer ID found");
      return { error: { message: "Not signed in" } };
    }

    // Verify that the follow request exists and is pending
    const { data: followRequest, error: fetchError } = await supabase
      .from("follows")
      .select("follower_id, following_id, status")
      .eq("follower_id", followerProfileId)
      .eq("following_id", me)
      .eq("status", "pending")
      .single();

    if (fetchError || !followRequest) {
      console.error("Follow request not found or not pending:", fetchError);
      return { error: { message: "Follow request not found" } };
    }

    // Update follow status from 'pending' to 'approved'
    const { error: updateError } = await supabase
      .from("follows")
      .update({ status: "approved" })
      .eq("follower_id", followerProfileId)
      .eq("following_id", me)
      .eq("status", "pending");

    if (updateError) {
      console.error("Error approving follow request:", updateError);
      return { error: updateError };
    }

    console.log("Follow request approved successfully");

    // [OPTIMIZATION: Phase 2 - Cache] Update cache immediately when status changes
    // Why: Instant UI updates, prevents flickering, cache both sent and received statuses
    try {
      const { setCachedFollowRequestStatus } = await import("../../lib/followRequestStatusCache");
      setCachedFollowRequestStatus(followerProfileId, me, "approved");
    } catch (cacheError) {
      console.error("Error updating follow request cache:", cacheError);
      // Don't fail the approval if cache update fails
    }

    // [OPTIMIZATION: Phase 2 - Batch] Parallelize independent operations
    // Why: Fetch both profiles simultaneously instead of sequentially
    const [followerProfileRes, ownerProfileRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id")
        .eq("id", followerProfileId)
        .single(),
      supabase
        .from("profiles")
        .select("user_id")
        .eq("id", me)
        .single(),
    ]);

    const followerProfile = followerProfileRes.data;
    const ownerProfile = ownerProfileRes.data;

    // Create approval notification for requester
    if (followerProfile?.user_id && ownerProfile?.user_id) {
      try {
        // Use database function to bypass RLS (SECURITY DEFINER)
        // Use entity_type: 'post' to match database constraint and existing trigger pattern
        const { error: notificationError } = await supabase.rpc('create_notification', {
          p_user_id: followerProfile.user_id, // Requester (receives notification)
          p_actor_id: ownerProfile.user_id, // Account owner (person who approved)
          p_type: 'follow',
          p_entity_type: 'post', // Use 'post' to match database constraint (matches existing trigger pattern)
          p_entity_id: me, // Account owner's profile ID
          p_additional_data: {
            follow_request_status: 'approved',
            follower_profile_id: followerProfileId,
            following_profile_id: me,
          }
        });

        if (notificationError) {
          console.error("Error creating approval notification:", notificationError);
        } else {
          console.log("Approval notification created");
        }
      } catch (notificationError) {
        console.error("Exception creating approval notification:", notificationError);
        // Don't fail the approval if notification creation fails
      }
    }

    // Enable notifications for this user by default
    try {
      await supabase.from("notification_settings").upsert({
        user_id: followerProfileId,
        target_user_id: me,
        enabled: true,
      });
      console.log("Notifications enabled for approved follower");
    } catch (notificationError) {
      console.error("Failed to enable notifications:", notificationError);
      // Don't fail the approval if notification setup fails
    }

    return { error: null };
  } catch (error) {
    console.error("Approve follow request exception:", error);
    return { error: { message: "Failed to approve follow request" } };
  } finally {
    console.log("=== APPROVE FOLLOW REQUEST END ===");
  }
}

/**
 * Decline a pending follow request
 * Only the account owner can decline follow requests
 */
export async function declineFollowRequest(
  followerProfileId: string
): Promise<{ error: any }> {
  console.log("=== DECLINE FOLLOW REQUEST START ===");

  try {
    const me = await getViewerId();
    if (!me) {
      console.error("Decline failed: No viewer ID found");
      return { error: { message: "Not signed in" } };
    }

    // Verify that the follow request exists and is pending
    const { data: followRequest, error: fetchError } = await supabase
      .from("follows")
      .select("follower_id, following_id, status")
      .eq("follower_id", followerProfileId)
      .eq("following_id", me)
      .eq("status", "pending")
      .single();

    if (fetchError || !followRequest) {
      console.error("Follow request not found or not pending:", fetchError);
      return { error: { message: "Follow request not found" } };
    }

    // Update follow status from 'pending' to 'declined'
    const { error: updateError } = await supabase
      .from("follows")
      .update({ status: "declined" })
      .eq("follower_id", followerProfileId)
      .eq("following_id", me)
      .eq("status", "pending");

    if (updateError) {
      console.error("Error declining follow request:", updateError);
      return { error: updateError };
    }

    console.log("Follow request declined successfully");

    // [OPTIMIZATION: Phase 2 - Cache] Update cache immediately when status changes
    // Why: Instant UI updates, prevents flickering, cache both sent and received statuses
    try {
      const { setCachedFollowRequestStatus } = await import("../../lib/followRequestStatusCache");
      setCachedFollowRequestStatus(followerProfileId, me, "declined");
    } catch (cacheError) {
      console.error("Error updating follow request cache:", cacheError);
      // Don't fail the decline if cache update fails
    }

    // [OPTIMIZATION: Phase 2 - Batch] Parallelize independent operations
    // Why: Fetch both profiles simultaneously instead of sequentially
    const [followerProfileRes, ownerProfileRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id")
        .eq("id", followerProfileId)
        .single(),
      supabase
        .from("profiles")
        .select("user_id")
        .eq("id", me)
        .single(),
    ]);

    const followerProfile = followerProfileRes.data;
    const ownerProfile = ownerProfileRes.data;

    if (followerProfile?.user_id && ownerProfile?.user_id) {
      try {
        // Use database function to bypass RLS (SECURITY DEFINER)
        // Use entity_type: 'post' to match database constraint and existing trigger pattern
        // Note: We can't set is_read via create_notification function, so we'll create it and then mark as read
        const { error: notificationError } = await supabase.rpc('create_notification', {
          p_user_id: followerProfile.user_id, // Requester (receives notification)
          p_actor_id: ownerProfile.user_id, // Account owner (person who declined)
          p_type: 'follow',
          p_entity_type: 'post', // Use 'post' to match database constraint (matches existing trigger pattern)
          p_entity_id: me, // Account owner's profile ID
          p_additional_data: {
            follow_request_status: 'declined',
            follower_profile_id: followerProfileId,
            following_profile_id: me,
          }
        });

        if (notificationError) {
          console.error("Error creating decline notification:", notificationError);
        } else {
          console.log("Decline notification created");
          // Mark declined notifications as read (don't count as unread)
          // We'll need to find the notification and mark it as read after creation
          // Since we can't get the notification ID from create_notification return value easily,
          // we'll mark it as read via a separate query (optional, non-critical)
        }
      } catch (notificationError) {
        console.error("Exception creating decline notification:", notificationError);
        // Don't fail the decline if notification creation fails
      }
    }

    return { error: null };
  } catch (error) {
    console.error("Decline follow request exception:", error);
    return { error: { message: "Failed to decline follow request" } };
  } finally {
    console.log("=== DECLINE FOLLOW REQUEST END ===");
  }
}

/**
 * Remove a follower (kick them out)
 * Only the account owner can remove their followers
 * Changes status to 'declined' to remove access immediately
 */
export async function removeFollower(
  followerProfileId: string
): Promise<{ error: any }> {
  console.log("=== REMOVE FOLLOWER START ===");

  try {
    const me = await getViewerId();
    if (!me) {
      console.error("Remove follower failed: No viewer ID found");
      return { error: { message: "Not signed in" } };
    }

    // Verify that the follow relationship exists
    const { data: followRelationship, error: fetchError } = await supabase
      .from("follows")
      .select("follower_id, following_id, status")
      .eq("follower_id", followerProfileId)
      .eq("following_id", me)
      .single();

    if (fetchError || !followRelationship) {
      console.error("Follow relationship not found:", fetchError);
      return { error: { message: "Follow relationship not found" } };
    }

    // Update follow status to 'declined' to remove access immediately
    const { error: updateError } = await supabase
      .from("follows")
      .update({ status: "declined" })
      .eq("follower_id", followerProfileId)
      .eq("following_id", me);

    if (updateError) {
      console.error("Error removing follower:", updateError);
      return { error: updateError };
    }

    console.log("Follower removed successfully");

    return { error: null };
  } catch (error) {
    console.error("Remove follower exception:", error);
    return { error: { message: "Failed to remove follower" } };
  } finally {
    console.log("=== REMOVE FOLLOWER END ===");
  }
}

export async function unfollow(targetProfileId: string) {
  console.log("=== UNFOLLOW API CALL START ===");

  try {
    const me = await getViewerId();
    console.log("Unfollow attempt - viewer profile ID:", me);

    if (!me) {
      console.error("Unfollow failed: No viewer ID found");
      return { error: { message: "Not signed in" } };
    }

    console.log("Attempting to unfollow profile:", targetProfileId);

    // Check if any follow relationship exists (pending, approved, or declined)
    // This allows canceling pending requests, not just unfollowing approved follows
    const { data: followRelationship, error: fetchError } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", me)
      .eq("following_id", targetProfileId)
      .maybeSingle();

    console.log("Follow relationship check before unfollow:", { followRelationship, fetchError });

    if (!followRelationship) {
      console.log("No follow relationship found");
      return { error: null };
    }

    // Delete the follow relationship (works for pending, approved, or declined statuses)
    const { error: deleteError } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", me)
      .eq("following_id", targetProfileId);

    console.log("Unfollow result:", { deleteError });

    if (deleteError) {
      console.error("Unfollow API error:", deleteError);
      return { error: deleteError };
    }

    console.log("Unfollow successful");

    // If this was a pending request, clean up related notifications
    if (followRelationship?.status === "pending") {
      try {
        // Get user IDs for notification cleanup
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, id")
          .in("id", [me, targetProfileId]);

        const followerUser = profiles?.find((p) => p.id === me);
        const followingUser = profiles?.find((p) => p.id === targetProfileId);

        if (followerUser?.user_id && followingUser?.user_id) {
          // Delete notifications related to this canceled follow request
          // Delete both the "sent" (requester receives) and "received" (owner receives) notifications
          // We delete notifications where:
          // 1. Owner receives: user_id = followingUser, actor_id = followerUser, type = follow
          // 2. Requester receives: user_id = followerUser, actor_id = followingUser, type = follow
          
          // Delete notification for account owner (received request)
          // Note: entity_type is 'post' to match database constraint (matches existing trigger pattern)
          await supabase
            .from("notifications")
            .delete()
            .eq("type", "follow")
            .eq("entity_type", "post")
            .eq("user_id", followingUser.user_id)
            .eq("actor_id", followerUser.user_id);

          // Delete notification for requester (sent request)
          // Note: entity_type is 'post' to match database constraint (matches existing trigger pattern)
          await supabase
            .from("notifications")
            .delete()
            .eq("type", "follow")
            .eq("entity_type", "post")
            .eq("user_id", followerUser.user_id)
            .eq("actor_id", followingUser.user_id);

          console.log("Cleaned up follow request notifications");
        }
      } catch (notificationError) {
        // Don't fail unfollow if notification cleanup fails
        console.error("Error cleaning up notifications:", notificationError);
      }
    }

    // Clear caches after successful unfollow
    try {
      const { clearCachedFollowStatus } = await import("../../lib/followStatusCache");
      const { clearCachedFollowRequestStatus } = await import("../../lib/followRequestStatusCache");
      
      // Clear follow status cache (clears all relationships for this profile)
      clearCachedFollowStatus(me);
      
      // Clear follow request status cache if it was a pending request
      if (followRelationship?.status === "pending") {
        clearCachedFollowRequestStatus(me, targetProfileId);
      }
    } catch (cacheError) {
      console.error("Error clearing cache:", cacheError);
      // Don't fail unfollow if cache clear fails
    }

    return { error: null };
  } catch (error) {
    console.error("Unfollow exception:", error);
    return { error: { message: "Failed to unfollow" } };
  } finally {
    console.log("=== UNFOLLOW API CALL END ===");
  }
}

/**
 * Update profile privacy settings
 * Handles auto-approve logic when privacy changes
 */
export async function updateProfilePrivacy(
  profileId: string,
  isPrivate: boolean,
  socialMediaPublic: boolean
): Promise<{ error: any }> {
  console.log("=== UPDATE PROFILE PRIVACY START ===");

  try {
    // Verify the user is authorized to update this profile
    const me = await getViewerId();
    if (!me) {
      console.error("Update privacy failed: No viewer ID found");
      return { error: { message: "Not signed in" } };
    }

    // Ensure the current user is the owner of the profile
    if (me !== profileId) {
      console.error("Update privacy failed: Not authorized to update this profile.");
      return { error: { message: "Not authorized" } };
    }

    // Get current privacy settings to detect changes
    const { data: currentProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("is_private")
      .eq("id", profileId)
      .single();

    if (fetchError || !currentProfile) {
      console.error("Profile not found:", fetchError);
      return { error: { message: "Profile not found" } };
    }

    const wasPrivate = currentProfile.is_private === true;
    const isGoingPrivate = isPrivate && !wasPrivate;
    const isGoingPublic = !isPrivate && wasPrivate;

    // Update privacy settings
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        is_private: isPrivate,
        social_media_public: socialMediaPublic,
      })
      .eq("id", profileId);

    if (updateError) {
      console.error("Error updating privacy settings:", updateError);
      return { error: updateError };
    }

    console.log("Privacy settings updated successfully");

    // [OPTIMIZATION: Phase 1 - Cache] Clear privacy cache when privacy settings change
    // Why: Ensures privacy filter uses fresh data, prevents showing incorrect privacy status
    try {
      const { clearPrivacyCache } = await import("../../lib/postPrivacyFilter");
      clearPrivacyCache(profileId);
      console.log("Privacy cache cleared for profile:", profileId);
    } catch (cacheError) {
      console.error("Error clearing privacy cache:", cacheError);
      // Don't fail the privacy update if cache clear fails
    }

    // Handle auto-approve existing followers when going private
    // When an account goes private, all existing approved followers should remain approved
    // We only need to ensure approved followers stay approved (they already are, so no update needed)
    // We should NOT auto-approve declined followers - they were explicitly removed
    // We should NOT auto-approve pending requests - they need explicit approval
    if (isGoingPrivate) {
      try {
        // Count existing approved followers for logging
        const { count: approvedCount } = await supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", profileId)
          .eq("status", "approved");

        console.log(`Account went private. ${approvedCount ?? 0} existing approved followers will retain access.`);
        // No database update needed - approved followers are already approved
      } catch (error) {
        console.error("Error checking existing followers:", error);
        // Don't fail the privacy update if check fails
      }
    }

    // Handle auto-approve pending requests when going public
    if (isGoingPublic) {
      try {
        const { error: approveError } = await supabase
          .from("follows")
          .update({ status: "approved" })
          .eq("following_id", profileId)
          .eq("status", "pending");

        if (approveError) {
          console.error("Error auto-approving pending requests:", approveError);
        } else {
          console.log("Pending requests auto-approved");
        }
      } catch (approveError) {
        console.error("Exception auto-approving pending requests:", approveError);
        // Don't fail the privacy update if auto-approve fails
      }
    }

    return { error: null };
  } catch (error) {
    console.error("Update profile privacy exception:", error);
    return { error: { message: "Failed to update profile privacy" } };
  } finally {
    console.log("=== UPDATE PROFILE PRIVACY END ===");
  }
}
