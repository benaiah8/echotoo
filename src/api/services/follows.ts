// src/api/services/follows.ts
import { supabase } from "../../lib/supabaseClient";

// Cache for authentication to prevent multiple calls
let authCache: { userId: string | null; timestamp: number } | null = null;
const AUTH_CACHE_DURATION = 30 * 1000; // 30 seconds

// Function to clear auth cache (call when auth state changes)
export function clearAuthCache() {
  authCache = null;
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
    const [followingRes, followersRes] = await Promise.all([
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profileId),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profileId),
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
    const { count, error } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", viewerProfileId)
      .eq("following_id", targetProfileId);

    if (error) {
      console.error("Error checking follow status:", error);
      return false;
    }

    return (count ?? 0) > 0;
  } catch (error) {
    console.error("Exception checking follow status:", error);
    return false;
  }
}

export async function getFollowStatus(
  viewerProfileId: string,
  targetProfileId: string
): Promise<"none" | "following" | "friends"> {
  try {
    if (!viewerProfileId || !targetProfileId) {
      return "none";
    }

    const [followingRes, followedByRes] = await Promise.all([
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", viewerProfileId)
        .eq("following_id", targetProfileId),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", targetProfileId)
        .eq("following_id", viewerProfileId),
    ]);

    const isUserFollowing = (followingRes.count ?? 0) > 0;
    const isFollowedByTarget = (followedByRes.count ?? 0) > 0;

    const result =
      isUserFollowing && isFollowedByTarget
        ? "friends"
        : isUserFollowing
        ? "following"
        : "none";

    return result;
  } catch (error) {
    console.error("Error getting follow status:", error);
    return "none";
  }
}

/**
 * Batch check follow statuses for multiple users
 * More efficient than checking one by one
 */
export async function getBatchFollowStatuses(
  viewerProfileId: string,
  targetProfileIds: string[]
): Promise<{ [targetId: string]: "none" | "following" | "friends" }> {
  try {
    if (!viewerProfileId || targetProfileIds.length === 0) {
      return {};
    }

    // Get all follows where viewer follows any of the targets
    const { data: followingData } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", viewerProfileId)
      .in("following_id", targetProfileIds);

    // Get all follows where targets follow the viewer (mutual follows)
    const { data: followedByData } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("following_id", viewerProfileId)
      .in("follower_id", targetProfileIds);

    const followingSet = new Set(
      (followingData || []).map((f) => f.following_id)
    );
    const followedBySet = new Set(
      (followedByData || []).map((f) => f.follower_id)
    );

    const result: { [targetId: string]: "none" | "following" | "friends" } =
      {};

    for (const targetId of targetProfileIds) {
      const isUserFollowing = followingSet.has(targetId);
      const isFollowedByTarget = followedBySet.has(targetId);

      result[targetId] =
        isUserFollowing && isFollowedByTarget
          ? "friends"
          : isUserFollowing
          ? "following"
          : "none";
    }

    return result;
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
      return { error: null };
    }

    console.log("Attempting to follow profile:", targetProfileId);

    // Step 2: Verify target profile exists
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, user_id")
      .eq("id", targetProfileId)
      .single();

    if (profileError || !targetProfile) {
      console.error("Target profile not found:", targetProfileId, profileError);
      return { error: { message: "Target profile not found" } };
    }

    console.log("Target profile verified:", targetProfile);

    // Step 3: Check current follow status
    const currentStatus = await isFollowing(me, targetProfileId);
    console.log("Current follow status:", currentStatus);

    if (currentStatus) {
      console.log("Already following this user");
      return { error: null };
    }

    // Step 4: Create the follow relationship
    console.log("Creating follow relationship:", {
      follower_id: me,
      following_id: targetProfileId,
    });

    // Try different approaches to avoid the "id" field trigger issue

    // Method 1: Simple insert without select
    let { error: followError } = await supabase.from("follows").insert({
      follower_id: me,
      following_id: targetProfileId,
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

    // Step 5: Enable notifications for this user by default
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

    return { error: null };
  } catch (error) {
    console.error("Follow exception:", error);
    return { error: { message: "Failed to follow" } };
  } finally {
    console.log("=== FOLLOW API CALL END ===");
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

    // Check current follow status
    const currentStatus = await isFollowing(me, targetProfileId);
    console.log("Current follow status before unfollow:", currentStatus);

    if (!currentStatus) {
      console.log("Not following this user");
      return { error: null };
    }

    // Delete the follow relationship
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
    return { error: null };
  } catch (error) {
    console.error("Unfollow exception:", error);
    return { error: { message: "Failed to unfollow" } };
  } finally {
    console.log("=== UNFOLLOW API CALL END ===");
  }
}
