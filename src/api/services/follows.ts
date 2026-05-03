// src/api/services/follows.ts
import { supabase } from "../../lib/supabaseClient";
import { retry } from "../../lib/retry";
import { dataCache } from "../../lib/dataCache";
import { clearAllMutualFriendsCache } from "../../lib/mutualFriendsCache";
import { getCachedProfile, setCachedProfile } from "../../lib/profileCache";

// [OPTIMIZATION] Dedupe + cooldown for profiles?select=... to prevent burst calls
const DEBUG_PROFILE_FETCH = false;
const PROFILE_COOLDOWN_MS = 30 * 1000; // 30 seconds

type ProfileResult = {
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
  user_number?: number | null;
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
} | null;

/**
 * Hide other user's profile when a block exists and the viewer did NOT initiate it.
 * If the viewer is the blocker, profile still loads so they can unblock from the UI.
 */
export async function profileHiddenByUserBlocksForSession(
  targetAuthUserId: string
): Promise<boolean> {
  if (!targetAuthUserId) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const vid = session?.user?.id;
  if (!vid || vid === targetAuthUserId) return false;
  const { data: pair, error } = await supabase.rpc("users_are_blocked_pair", {
    p_a: vid,
    p_b: targetAuthUserId,
  });
  if (error) {
    console.warn("[follows] users_are_blocked_pair:", error.message);
    return false;
  }
  if (!pair) return false;
  const { data: myBlockRow } = await supabase
    .from("user_blocks")
    .select("id")
    .eq("blocker_user_id", vid)
    .eq("blocked_user_id", targetAuthUserId)
    .maybeSingle();
  if (myBlockRow?.id) return false;
  return true;
}

const profileByUserIdDedupe = new Map<
  string,
  { promise: Promise<ProfileResult>; ts: number }
>();
const profileByIdOrUsernameDedupe = new Map<
  string,
  { promise: Promise<ProfileResult>; ts: number }
>();

// Cache for authentication to prevent multiple calls
// [FIX] Now caches BOTH userId AND profileId to eliminate redundant profile queries
let authCache: {
  userId: string | null;
  profileId: string | null;
  timestamp: number;
} | null = null;
const AUTH_CACHE_DURATION = 30 * 1000; // 30 seconds

// [OPTIMIZATION] TTL cache for viewer profile id keyed by auth user id
// Reduces profiles.select(id).eq(user_id,...) on repeated opens within TTL
const viewerProfileIdCache = new Map<
  string,
  { ts: number; profileId: string }
>();
const VIEWER_PROFILE_ID_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Function to clear auth cache (call when auth state changes)
// [PHASE 2.3 - FIX] Removed feed cache clearing - cache keys already include viewerProfileId
// Feed cache is user-specific, so no cross-user data leakage risk
export function clearAuthCache() {
  authCache = null;
  viewerProfileIdCache.clear();
  // [FIX] Removed feed cache clearing - cache keys already include viewerProfileId
  // Feed cache entries are user-specific: feed:all::::5:0:guest vs feed:all::::5:0:userId
  // No need to clear feed cache on auth change - only clear on explicit logout (SIGNED_OUT)
  // This prevents cache from being cleared when user ID changes from guest → actual user
  // Clearing on auth change was causing cache misses and duplicate RPC calls

  // [PHASE 2.3 - FIX] DO NOT clear localStorage.my_profile_id here
  // Why: clearAuthCache() is called on every auth state change (token refresh, etc.)
  // localStorage.my_profile_id should only be cleared on SIGNED_OUT event
  // Clearing it here causes localStorage to be cleared even when user is still logged in
  // This defeats the purpose of localStorage persistence for getViewerId()
  // localStorage.my_profile_id is cleared separately in App.tsx on SIGNED_OUT event

  // [OPTIMIZATION: Phase 1.2 - Horizontal Rail] Clear mutual friends cache on auth change
  // Why: Prevents cross-user data leakage when user logs out/in
  try {
    clearAllMutualFriendsCache();
  } catch (error) {
    console.warn(
      "[clearAuthCache] Failed to clear mutual friends cache:",
      error
    );
    // Don't throw - auth cache clearing should still succeed
  }
}

/** Clear profileByUserId dedupe for a user (call after reset so re-check gets fresh data). */
export function invalidateProfileByUserIdCache(userId: string) {
  profileByUserIdDedupe.delete(userId);
}

/** Return the viewer's *profile id* (not auth user id). */
export async function getViewerId(): Promise<string | null> {
  console.log("[VIEWERDBG] getViewerId enter", { t: Date.now() });
  try {
    // [PHASE 2.3 - FIX] Check localStorage first (fast, synchronous path)
    // Why: Eliminates profiles?select=id requests on page reloads
    // Components already use this pattern (NotificationBell, OtherProfilePage, FollowButton)
    // This centralizes it in getViewerId() for consistency and performance
    try {
      const storedProfileId = localStorage.getItem("my_profile_id");
      if (storedProfileId) {
        // [OPTIMIZATION] Fast path: Return stored profile ID immediately
        // Note: We don't validate it here for speed (validation happens naturally on first use)
        // If invalid, database queries will fail and components will handle it gracefully
        // This eliminates redundant profiles?select=id requests on page reloads
        console.log("[VIEWERDBG] getViewerId exit", {
          path: "localStorage_my_profile_id",
          usedLocalStorageMyProfileId: true,
          returnedProfileId: storedProfileId,
          t: Date.now(),
        });
        return storedProfileId;
      }
    } catch (localStorageError) {
      // localStorage might be unavailable (private browsing, quota exceeded, etc.)
      // Fall through to normal flow - in-memory cache and RequestManager still work
      // Reduced log level - only log if it's a real issue
      // console.debug("[getViewerId] localStorage unavailable, using normal flow:", localStorageError);
    }

    // [FIX: Phase 2.3] Check in-memory cache second (after localStorage)
    // This avoids RequestManager overhead for cached values (most common case)
    if (authCache && Date.now() - authCache.timestamp < AUTH_CACHE_DURATION) {
      // [FIX] Return cached profileId directly - eliminates redundant profile queries
      if (authCache.profileId) {
        // [PHASE 2.3 - FIX] Also store in localStorage for persistence
        // This ensures it's available on next page load
        try {
          localStorage.setItem("my_profile_id", authCache.profileId);
        } catch (localStorageError) {
          // Ignore localStorage errors - in-memory cache still works
        }
        console.log("[VIEWERDBG] getViewerId exit", {
          path: "authCache_profileId",
          usedLocalStorageMyProfileId: false,
          cacheHit: "auth_memory_profileId",
          returnedProfileId: authCache.profileId,
          t: Date.now(),
        });
        return authCache.profileId;
      }
      // Do not short-circuit on authCache.userId === null — that was a transient negative
      // cache from a failed getSession/getUser and would block retries for ~30s (Android OAuth).
      // If userId exists but profileId missing, fall through to fetch it (use RequestManager)
    }

    // [FIX: Phase 2.3] Use RequestManager for deduplication when cache miss
    // Why: Multiple components calling getViewerId() simultaneously will share the same request
    // Pattern matches getFollowStatus() for consistency
    const { requestManager } = await import("../../lib/requestManager");
    const dedupeKey = "get_viewer_id"; // Single key for all calls (only one viewer per session)

    const result = await requestManager.execute(
      dedupeKey,
      async (signal) => {
        // Check cache again inside RequestManager (another call might have populated it)
        // This handles race conditions where multiple calls happen before first one completes
        if (
          authCache &&
          Date.now() - authCache.timestamp < AUTH_CACHE_DURATION
        ) {
          if (authCache.profileId) {
            console.log("[VIEWERDBG] getViewerId RM inner cache_hit profileId", {
              returnedProfileId: authCache.profileId,
              t: Date.now(),
            });
            return authCache.profileId;
          }
          // No short-circuit on userId === null — avoid poisoning (see getViewerAuthUserId).
        }

        // Check if aborted before making requests
        if (signal.aborted) {
          console.log("[VIEWERDBG] getViewerId RM aborted (pre-session)", {
            t: Date.now(),
          });
          return null;
        }

        // Try multiple methods to get the auth user ID
        let authId: string | null = null;

        // Method 1: Try getSession first (most reliable)
        try {
          const { data: sessionData, error: sessionError } =
            await supabase.auth.getSession();

          console.log("[VIEWERDBG] getViewerId RM getSession", {
            t: Date.now(),
            sessionError: sessionError?.message ?? null,
            sessionUserId: sessionData.session?.user?.id ?? null,
          });

          // Check if aborted after async operation
          if (signal.aborted) {
            console.log("[VIEWERDBG] getViewerId RM aborted (post-session)", {
              t: Date.now(),
            });
            return null;
          }

          if (!sessionError && sessionData.session?.user?.id) {
            authId = sessionData.session.user.id;
          }
        } catch (error) {
          // Reduced log - session method failure is expected fallback
          // console.log("Session method failed, trying getUser");
        }

        // Method 2: Fallback to getUser
        if (!authId) {
          try {
            const { data: userData, error: userError } =
              await supabase.auth.getUser();

            console.log("[VIEWERDBG] getViewerId RM getUser", {
              t: Date.now(),
              userError: userError?.message ?? null,
              userId: userData.user?.id ?? null,
            });

            // Check if aborted after async operation
            if (signal.aborted) {
              console.log("[VIEWERDBG] getViewerId RM aborted (post-getUser)", {
                t: Date.now(),
              });
              return null;
            }

            if (!userError && userData.user?.id) {
              authId = userData.user.id;
            }
          } catch (error) {
            // Reduced log - getUser method failure is expected fallback
            // console.log("getUser method failed");
          }
        }

        if (!authId) {
          // Do not write authCache { userId: null } — transient session misses must not block
          // real sessions for 30s (shared cache with getViewerAuthUserId).
          console.log("[VIEWERDBG] getViewerId RM no authId after session+getUser", {
            t: Date.now(),
          });
          return null;
        }

        // [OPTIMIZATION] Check TTL cache keyed by auth user id
        const cachedViewer = viewerProfileIdCache.get(authId);
        if (
          cachedViewer &&
          Date.now() - cachedViewer.ts < VIEWER_PROFILE_ID_TTL_MS
        ) {
          authCache = {
            userId: authId,
            profileId: cachedViewer.profileId,
            timestamp: Date.now(),
          };
          console.log("[VIEWERDBG] getViewerId exit", {
            path: "viewerProfileId_ttl_cache",
            returnedProfileId: cachedViewer.profileId,
            authUserId: authId,
            usedLocalStorageMyProfileId: false,
            t: Date.now(),
          });
          return cachedViewer.profileId;
        }

        // Check if aborted before database query
        if (signal.aborted) {
          console.log("[VIEWERDBG] getViewerId RM aborted (pre-getProfileByUserId)", {
            t: Date.now(),
          });
          return null;
        }

        // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() instead of separate profiles?select=id query
        // Why: Reuses the same RequestManager call, reducing 5 requests to 1
        // getProfileByUserId() already handles caching, deduplication, and returns the full profile
        const profile = await getProfileByUserId(authId);

        // Check if aborted after async operation
        if (signal.aborted) {
          console.log("[VIEWERDBG] getViewerId RM aborted (post-getProfileByUserId)", {
            t: Date.now(),
          });
          return null;
        }

        if (!profile?.id) {
          // Profile not found or error occurred (getProfileByUserId already logged the error)
          // Cache failure to avoid retry spam
          authCache = {
            userId: authId,
            profileId: null,
            timestamp: Date.now(),
          };
          console.log("[VIEWERDBG] getViewerId RM profile missing after fetch", {
            t: Date.now(),
            authUserId: authId,
          });
          return null;
        }

        // [FIX] Cache BOTH userId AND profileId to avoid redundant profile queries
        authCache = {
          userId: authId,
          profileId: profile.id,
          timestamp: Date.now(),
        };
        viewerProfileIdCache.set(authId, {
          ts: Date.now(),
          profileId: profile.id,
        });

        // [PHASE 2.3 - FIX] Store in localStorage for persistence across page reloads
        // This eliminates profiles?select=id requests on subsequent page loads
        try {
          localStorage.setItem("my_profile_id", profile.id);
        } catch (localStorageError) {
          // Ignore localStorage errors - in-memory cache still works
        }

        console.log("[VIEWERDBG] getViewerId exit", {
          path: "getProfileByUserId",
          returnedProfileId: profile.id,
          authUserId: authId,
          wroteLocalStorageMyProfileId: true,
          t: Date.now(),
        });
        return profile.id;
      },
      "high" // High priority - needed by many components on mount
    );

    return result.data ?? null;
  } catch (error) {
    console.error("getViewerId error:", error);
    console.log("[VIEWERDBG] getViewerId exception", {
      t: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * [PHASE 1 - OPTIMIZATION] Get viewer's auth user ID (not profile ID) with caching and deduplication
 *
 * Returns the auth user ID (user.id from supabase.auth), cached and deduplicated via RequestManager.
 * This eliminates duplicate "user" requests when multiple components call supabase.auth.getUser().
 *
 * Why: 19 files were calling supabase.auth.getUser() directly, causing 11+ duplicate requests.
 * This function centralizes auth user ID fetching and reduces 11 requests to 1.
 *
 * Architecture:
 * - Shares same authCache with getViewerId() (both populate userId and profileId)
 * - Uses different RequestManager key to avoid conflicts but allow deduplication
 * - If getViewerId() already ran, returns cached userId immediately (no DB query)
 * - If cache miss, fetches auth user ID and caches it (getViewerId() can use it later)
 * - Aligns with PostgreSQL RPC functions which use p_viewer_user_id (auth user ID)
 *
 * Edge cases handled:
 * - Auth state changes: clearAuthCache() clears cache on onAuthStateChange
 * - Session expiration: Falls back to getUser() if getSession() fails
 * - Concurrent requests: RequestManager deduplicates via pendingRequests map
 * - Race conditions: Double-checks cache inside RequestManager
 * - Network failures: Error handling with null return
 * - localStorage unavailable: Graceful fallback (try/catch)
 * - Abort signals: Checks signal.aborted before/after async operations
 *
 * @returns Auth user ID (string) or null if not authenticated
 */
export async function getViewerAuthUserId(): Promise<string | null> {
  console.log("[VIEWERDBG] getViewerAuthUserId enter", { t: Date.now() });
  try {
    // [OPTIMIZATION] Check in-memory cache first (fastest path)
    // If getViewerId() already ran, userId is already cached - return immediately
    if (authCache && Date.now() - authCache.timestamp < AUTH_CACHE_DURATION) {
      if (authCache.userId) {
        console.log("[VIEWERDBG] getViewerAuthUserId exit", {
          path: "cache_hit_auth_userId",
          cacheHit: true,
          returnedAuthUserId: authCache.userId,
          t: Date.now(),
        });
        return authCache.userId;
      }
      // Do not treat authCache.userId === null as authoritative — never negative-cache;
      // fall through and re-fetch session so OAuth/Android timing cannot stick "logged out".
      // If profileId exists but userId missing (rare edge case), fall through to fetch
    }

    // [OPTIMIZATION] Use RequestManager for deduplication when cache miss
    // Different key from getViewerId() to avoid conflicts, but both share same cache
    const { requestManager } = await import("../../lib/requestManager");
    const dedupeKey = "get_viewer_auth_user_id"; // Different key for deduplication

    const result = await requestManager.execute(
      dedupeKey,
      async (signal) => {
        // [RACE CONDITION FIX] Check cache again inside RequestManager
        // Another call (getViewerId or getViewerAuthUserId) might have populated it
        if (
          authCache &&
          Date.now() - authCache.timestamp < AUTH_CACHE_DURATION
        ) {
          if (authCache.userId) {
            console.log("[VIEWERDBG] getViewerAuthUserId exit", {
              path: "RM_inner_cache_hit_auth_userId",
              cacheHit: true,
              returnedAuthUserId: authCache.userId,
              t: Date.now(),
            });
            return authCache.userId;
          }
          // No early return on userId === null — retry getSession/getUser below.
        }

        // [ABORT CHECK] Check if aborted before making requests
        if (signal.aborted) {
          console.log("[VIEWERDBG] getViewerAuthUserId RM aborted (pre-session)", {
            t: Date.now(),
          });
          return null;
        }

        // [SESSION HANDLING] Try multiple methods to get the auth user ID
        let authId: string | null = null;

        // Method 1: Try getSession first (most reliable, no extra query)
        // This is what PostgreSQL RPC functions use (p_viewer_user_id)
        try {
          const { data: sessionData, error: sessionError } =
            await supabase.auth.getSession();

          console.log("[VIEWERDBG] getViewerAuthUserId RM getSession", {
            t: Date.now(),
            sessionError: sessionError?.message ?? null,
            sessionUserId: sessionData.session?.user?.id ?? null,
          });

          // [ABORT CHECK] Check if aborted after async operation
          if (signal.aborted) {
            console.log("[VIEWERDBG] getViewerAuthUserId RM aborted (post-session)", {
              t: Date.now(),
            });
            return null;
          }

          if (!sessionError && sessionData.session?.user?.id) {
            authId = sessionData.session.user.id;
          }
        } catch (error) {
          // Session method failed, fall through to getUser
          // This handles session expiration, network failures, etc.
        }

        // Method 2: Fallback to getUser (handles session expiration)
        if (!authId) {
          try {
            const { data: userData, error: userError } =
              await supabase.auth.getUser();

            console.log("[VIEWERDBG] getViewerAuthUserId RM getUser", {
              t: Date.now(),
              userError: userError?.message ?? null,
              userId: userData.user?.id ?? null,
            });

            // [ABORT CHECK] Check if aborted after async operation
            if (signal.aborted) {
              console.log("[VIEWERDBG] getViewerAuthUserId RM aborted (post-getUser)", {
                t: Date.now(),
              });
              return null;
            }

            if (!userError && userData.user?.id) {
              authId = userData.user.id;
            }
          } catch (error) {
            // Both methods failed - user not authenticated or network error
          }
        }

        if (!authId) {
          // Never negative-cache: a miss here is often transient (Android WebView OAuth).
          // Genuine sign-out clears auth via clearAuthCache on SIGNED_OUT (App.tsx).
          console.log("[VIEWERDBG] getViewerAuthUserId RM no authId after session+getUser", {
            t: Date.now(),
          });
          return null;
        }

        // [CACHE UPDATE] Update cache with userId
        // Preserve profileId if it exists (from getViewerId() call)
        // This allows both functions to work together seamlessly
        authCache = {
          userId: authId,
          profileId: authCache?.profileId || null, // Preserve existing profileId
          timestamp: Date.now(),
        };

        console.log("[VIEWERDBG] getViewerAuthUserId exit", {
          path: "session_or_user_resolved",
          cacheHit: false,
          updatedAuthCacheUserId: true,
          returnedAuthUserId: authId,
          t: Date.now(),
        });
        return authId;
      },
      "high" // High priority - needed by many components on mount
    );

    return result.data ?? null;
  } catch (error) {
    // [ERROR HANDLING] Log error but don't throw - return null gracefully
    // This prevents breaking the app if auth check fails
    console.error("getViewerAuthUserId error:", error);
    console.log("[VIEWERDBG] getViewerAuthUserId exception", {
      t: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * [PHASE 2.3 - OPTIMIZATION] Get profile by user_id with caching and deduplication
 *
 * Returns full profile data, cached for 5 minutes
 * Uses RequestManager to deduplicate simultaneous requests from multiple components
 *
 * Why: Multiple components (OwnProfilePage, RSVPComponent, BottomTab, etc.) were
 * making separate profiles?select=id queries for the same user_id, causing 6+ duplicate requests.
 * This function centralizes profile fetching and reduces 6 requests to 1.
 *
 * @param userId - The auth user ID (not profile ID)
 * @returns Full profile data or null if not found
 */
const AUTH_USER_ID_UUID_RE = /^[0-9a-f-]{36}$/i;

export async function getProfileByUserId(userId: string): Promise<{
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
  // [PHASE 2.3 - OPTIMIZATION] Add onboarding fields so OnboardingWrapper can use this too
  user_number?: number | null;
  onboarding_completed?: boolean | null;
  onboarding_step?: number | null;
} | null> {
  if (!userId) return null;
  // profiles.user_id is uuid — avoid invalid REST calls (e.g. sentinel "me", typos)
  if (!AUTH_USER_ID_UUID_RE.test(userId)) return null;

  try {
    // Helper function to search cache by user_id
    // ProfileCache stores by profile ID, so we need to search through entries
    const searchCacheByUserId = (searchUserId: string) => {
      try {
        const cacheStr = localStorage.getItem("profile_cache");
        if (!cacheStr) return null;

        const cache = JSON.parse(cacheStr);
        for (const [profileId, entry] of Object.entries(cache)) {
          const cachedEntry = entry as any;
          // Check if cache is expired (5 minutes)
          const cacheAge = Date.now() - (cachedEntry.timestamp || 0);
          if (cacheAge > 5 * 60 * 1000) continue; // Skip expired entries

          if (cachedEntry.user_id === searchUserId) {
            return getCachedProfile(profileId);
          }
        }
      } catch (error) {
        // Ignore cache search errors
      }
      return null;
    };

    // Step 1: Check cache first (search by user_id)
    const cachedProfile = searchCacheByUserId(userId);
    if (cachedProfile) {
      if (DEBUG_PROFILE_FETCH)
        console.debug("[getProfileByUserId] cache hit", userId);
      if (await profileHiddenByUserBlocksForSession(cachedProfile.user_id)) {
        return null;
      }
      return cachedProfile;
    }

    // Step 1.5: [OPTIMIZATION] In-flight dedupe + 30s cooldown per userId
    // Prevents burst calls from multiple components (BottomTab, FollowListDrawer, FollowButton, etc.)
    const existingDedupe = profileByUserIdDedupe.get(userId);
    if (
      existingDedupe &&
      Date.now() - existingDedupe.ts < PROFILE_COOLDOWN_MS
    ) {
      if (DEBUG_PROFILE_FETCH)
        console.debug(
          "[getProfileByUserId] dedupe hit (in-flight/cooldown)",
          userId
        );
      return existingDedupe.promise;
    }
    if (existingDedupe) {
      profileByUserIdDedupe.delete(userId); // cooldown expired
    }

    // Step 2: Use RequestManager for deduplication
    // Multiple components calling this simultaneously will share the same request
    const fetchPromise = (async (): Promise<ProfileResult> => {
      const { requestManager } = await import("../../lib/requestManager");
      const dedupeKey = `profile_by_user_id_${userId}`;

      if (DEBUG_PROFILE_FETCH)
        console.debug("[getProfileByUserId] requestManager execute", dedupeKey);

      const result = await requestManager.execute(
        dedupeKey,
        async (signal) => {
          // Check cache again inside RequestManager (another call might have populated it)
          const cachedAgain = searchCacheByUserId(userId);
          if (cachedAgain) {
            console.log(
              `[getProfileByUserId] ✅ Cache HIT (during RequestManager execution) for userId: ${userId}`
            );
            if (await profileHiddenByUserBlocksForSession(cachedAgain.user_id)) {
              return null;
            }
            return cachedAgain;
          }

          // Check if aborted before making request
          if (signal.aborted) {
            console.log(
              `[getProfileByUserId] Request aborted for userId: ${userId}`
            );
            return null;
          }

          // Step 3: Fetch full profile from database (including onboarding fields)
          // [PHASE 2.3 - OPTIMIZATION] Fetch ALL fields so all components can reuse this function
          // Strategy: One network request with all fields is better than 5 separate requests
          console.log(
            `[getProfileByUserId] 🚀 Making actual DB call for userId: ${userId}`
          );
          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select(
              "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public, user_number, onboarding_completed, onboarding_step"
            )
            .eq("user_id", userId)
            .is("deleted_at", null)
            .maybeSingle();

          // Check if aborted after async operation
          if (signal.aborted) {
            console.log(
              `[getProfileByUserId] Request aborted after DB call for userId: ${userId}`
            );
            return null;
          }

          if (profileError) {
            console.error(
              "[getProfileByUserId] Error fetching profile:",
              profileError
            );
            return null;
          }

          if (!profile) {
            console.log(
              `[getProfileByUserId] No profile found in DB for userId: ${userId}`
            );
            return null;
          }

          if (await profileHiddenByUserBlocksForSession(profile.user_id)) {
            return null;
          }

          // Step 4: Cache result for future use (including onboarding fields)
          setCachedProfile({
            id: profile.id,
            user_id: profile.user_id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            bio: profile.bio,
            xp: profile.xp,
            member_no: profile.member_no,
            instagram_url: profile.instagram_url,
            tiktok_url: profile.tiktok_url,
            telegram_url: profile.telegram_url,
            is_private: profile.is_private,
            social_media_public: profile.social_media_public,
            // [PHASE 2.3 - OPTIMIZATION] Include onboarding fields
            user_number: profile.user_number,
            onboarding_completed: profile.onboarding_completed,
            onboarding_step: profile.onboarding_step,
          });
          console.log(
            `[getProfileByUserId] ✅ Profile cached for userId: ${userId}`
          );

          return {
            id: profile.id,
            user_id: profile.user_id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            bio: profile.bio,
            xp: profile.xp,
            member_no: profile.member_no,
            instagram_url: profile.instagram_url,
            tiktok_url: profile.tiktok_url,
            telegram_url: profile.telegram_url,
            is_private: profile.is_private,
            social_media_public: profile.social_media_public,
            // [PHASE 2.3 - OPTIMIZATION] Include onboarding fields
            user_number: profile.user_number,
            onboarding_completed: profile.onboarding_completed,
            onboarding_step: profile.onboarding_step,
          };
        },
        "medium" // Medium priority - profile data is important but not critical
      );

      if (result.error && result.error.message !== "Aborted") {
        throw result.error;
      }

      return result.data ?? null;
    })();

    profileByUserIdDedupe.set(userId, {
      promise: fetchPromise,
      ts: Date.now(),
    });
    fetchPromise.finally(() => {
      setTimeout(() => {
        profileByUserIdDedupe.delete(userId);
      }, PROFILE_COOLDOWN_MS);
    });

    return fetchPromise;
  } catch (error) {
    console.error("[getProfileByUserId] Unexpected error:", error);
    return null;
  }
}

/**
 * [PHASE 2.3 - OPTIMIZATION] Get profile ID by user_id (for FollowButton conversion)
 * Uses getProfileByUserId() internally for caching and deduplication
 *
 * Why: FollowButton needs to convert user_id to profile_id, but doesn't need full profile.
 * However, using getProfileByUserId() is better because:
 * - Reuses cache (if profile already loaded)
 * - RequestManager deduplicates (no extra network requests)
 * - Caches full profile for future use
 *
 * @param userId - The auth user ID
 * @returns Profile ID or null if not found
 */
export async function getProfileIdByUserId(
  userId: string
): Promise<string | null> {
  const profile = await getProfileByUserId(userId);
  return profile?.id ?? null;
}

/**
 * [PHASE 2.3 - OPTIMIZATION] Get profile by ID, username, or user_id (for OtherProfilePage)
 * Uses cache first, then smart query with OR clause (single query, not multiple)
 *
 * Strategy:
 * 1. Check cache by profile ID (if identifier is UUID)
 * 2. Try getProfileByUserId (if identifier is user_id) - uses cache + RequestManager
 * 3. Query by username or profile ID (single OR query) - only if not found in cache
 *
 * Why: OtherProfilePage queries by id/username/user_id with fallback chain.
 * This function consolidates all lookups into cache-first + single query approach.
 *
 * @param identifier - Can be profile ID, username, or user_id
 * @returns Full profile data or null if not found
 */
export async function getProfileByIdOrUsername(
  identifier: string
): Promise<ReturnType<typeof getProfileByUserId> | null> {
  if (!identifier) return null;

  // Step 1: Try cache by profile ID (if identifier is a UUID)
  const isUuid = /^[0-9a-f-]{36}$/i.test(identifier);
  if (isUuid) {
    const cached = getCachedProfile(identifier);
    if (cached) {
      console.log(
        `[getProfileByIdOrUsername] ✅ Cache HIT by profile ID: ${identifier}`
      );
      if (await profileHiddenByUserBlocksForSession(cached.user_id)) {
        return null;
      }
      return cached;
    }

    // Step 2: Try getProfileByUserId (if identifier is a UUID that might be a user_id)
    // This handles caching and RequestManager deduplication
    // [FIX] Only try this if identifier is a UUID (user_id is also a UUID)
    // If identifier is a username (not a UUID), skip this step to avoid errors
    const profileByUserId = await getProfileByUserId(identifier);
    if (profileByUserId) {
      console.log(
        `[getProfileByIdOrUsername] ✅ Found via getProfileByUserId: ${identifier}`
      );
      return profileByUserId;
    }
  }

  // Step 3: Query by username or profile ID (only if not found in cache)
  // [OPTIMIZATION] In-flight dedupe + 30s cooldown per identifier
  const dedupeKey = `id_or_username:${identifier}`;
  const existingDedupe = profileByIdOrUsernameDedupe.get(dedupeKey);
  if (existingDedupe && Date.now() - existingDedupe.ts < PROFILE_COOLDOWN_MS) {
    if (DEBUG_PROFILE_FETCH)
      console.debug(
        "[getProfileByIdOrUsername] dedupe hit (in-flight/cooldown)",
        identifier
      );
    return existingDedupe.promise;
  }

  if (existingDedupe) {
    profileByIdOrUsernameDedupe.delete(dedupeKey);
  }

  const fetchPromise = (async (): Promise<ProfileResult> => {
    if (DEBUG_PROFILE_FETCH)
      console.debug(
        "[getProfileByIdOrUsername] querying",
        isUuid ? "id/username" : "username",
        identifier
      );

    let query = supabase
      .from("profiles")
      .select(
        "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public, user_number, onboarding_completed, onboarding_step"
      )
      .is("deleted_at", null);

    if (isUuid) {
      query = query.or(`id.eq.${identifier},username.ilike.${identifier}`);
    } else {
      query = query.ilike("username", identifier);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error(
        "[getProfileByIdOrUsername] Error querying profile:",
        error
      );
      return null;
    }

    if (!data) {
      return null;
    }

    if (await profileHiddenByUserBlocksForSession(data.user_id)) {
      return null;
    }

    setCachedProfile(data);
    return data;
  })();

  profileByIdOrUsernameDedupe.set(dedupeKey, {
    promise: fetchPromise,
    ts: Date.now(),
  });
  fetchPromise.finally(() => {
    setTimeout(() => {
      profileByIdOrUsernameDedupe.delete(dedupeKey);
    }, PROFILE_COOLDOWN_MS);
  });

  return fetchPromise;
}

/**
 * [PHASE 2.3 - OPTIMIZATION] Get multiple profiles by user_ids (batch)
 * Single profiles.in('user_id', ids) query instead of N getProfileByUserId calls
 *
 * Callers: notifications (actor profiles), invites (invitee profiles), RSVPComponent, comments
 *
 * @param userIds - Array of auth user IDs (may contain duplicates)
 * @returns Array of profile data (filtered to remove nulls)
 */
export async function getProfilesByUserIds(
  userIds: string[]
): Promise<Array<NonNullable<Awaited<ReturnType<typeof getProfileByUserId>>>>> {
  if (!userIds || userIds.length === 0) return [];

  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url, is_private, social_media_public, user_number, onboarding_completed, onboarding_step"
      )
      .in("user_id", uniqueIds)
      .is("deleted_at", null);

    if (error) {
      console.error("[getProfilesByUserIds] Error:", error);
      return [];
    }

    const profiles = (data || []) as ProfileResult[];
    const validProfiles = profiles.filter(
      (p): p is NonNullable<ProfileResult> => p != null
    );

    // Write each to profile cache for reuse by getProfileByUserId / other components
    validProfiles.forEach((p) => {
      setCachedProfile({
        id: p.id,
        user_id: p.user_id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        bio: p.bio,
        xp: p.xp,
        member_no: p.member_no,
        instagram_url: p.instagram_url,
        tiktok_url: p.tiktok_url,
        telegram_url: p.telegram_url,
        is_private: p.is_private,
        social_media_public: p.social_media_public,
        user_number: p.user_number,
        onboarding_completed: p.onboarding_completed,
        onboarding_step: p.onboarding_step,
      });
    });

    return validProfiles;
  } catch (err) {
    console.error("[getProfilesByUserIds] Unexpected error:", err);
    return [];
  }
}

export async function getFollowCounts(profileId: string) {
  try {
    const { data, error } = await supabase.rpc("get_follow_counts", {
      p_profile_id: profileId,
    });

    if (error) throw error;

    // RETURNS TABLE comes back as an array of rows, RETURNS JSONB comes back as object
    // Handle both cases defensively
    return {
      following: Number(
        data?.[0]?.following_count ?? data?.following_count ?? 0
      ),
      followers: Number(
        data?.[0]?.followers_count ?? data?.followers_count ?? 0
      ),
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
  // [OPTIMIZATION] Check cache first (fast, synchronous path)
  // This prevents duplicate sequential requests (e.g., multiple components checking same status)
  const { getCachedFollowStatus, setCachedFollowStatus } = await import(
    "../../lib/followStatusCache"
  );
  const cachedStatus = getCachedFollowStatus(viewerProfileId, targetProfileId);
  if (cachedStatus !== null) {
    return cachedStatus;
  }

  // [OPTIMIZATION: Phase 3 - Dedupe] Prevent duplicate follow status checks for same user
  // Why: Multiple components checking same follow status won't trigger duplicate requests
  const { requestManager } = await import("../../lib/requestManager");
  const dedupeKey = `follow_status_${viewerProfileId}_${targetProfileId}`;

  const result = await requestManager.execute(
    dedupeKey,
    async (signal) => {
      // [RACE CONDITION FIX] Check cache again inside RequestManager
      // Another call might have populated it
      const cachedStatusAgain = getCachedFollowStatus(
        viewerProfileId,
        targetProfileId
      );
      if (cachedStatusAgain !== null) {
        return cachedStatusAgain;
      }

      try {
        if (!viewerProfileId || !targetProfileId) {
          return "none";
        }

        // [OPTIMIZATION: Phase 2] Use Promise.all() for parallel queries
        // Why: OR query with nested and() not supported by Supabase PostgREST
        // Strategy: Execute 2 queries in parallel (acceptable performance)
        // Note: Cache + RequestManager deduplication already prevent redundant calls
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

        if (followingRes.error) {
          console.error(
            "Error fetching follow status (following):",
            followingRes.error
          );
        }
        if (followedByRes.error) {
          console.error(
            "Error fetching follow status (followed by):",
            followedByRes.error
          );
        }

        const userFollowing = followingRes.data;
        const targetFollowing = followedByRes.data;

        let finalStatus: "none" | "pending" | "following" | "friends" = "none";

        // Check if user is following target
        if (userFollowing) {
          // If status is 'pending', return 'pending'
          if (userFollowing.status === "pending") {
            finalStatus = "pending";
          }
          // If status is 'approved', check if mutual
          else if (userFollowing.status === "approved") {
            // Check if target is also following (mutual follow)
            if (targetFollowing && targetFollowing.status === "approved") {
              finalStatus = "friends";
            } else {
              finalStatus = "following";
            }
          }
          // If status is 'declined', treat as not following
          // finalStatus remains "none"
        }

        // [CACHE UPDATE] Cache the result
        setCachedFollowStatus(viewerProfileId, targetProfileId, finalStatus);

        return finalStatus;
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
): Promise<{
  [targetId: string]: "none" | "pending" | "following" | "friends";
}> {
  try {
    if (!viewerProfileId || targetProfileIds.length === 0) {
      return {};
    }

    // [OPTIMIZATION] Single query: (viewer follows target) OR (target follows viewer)
    // PostgREST .or() format: and(col.eq.val,col2.in.(v1,v2)),and(col3.eq.val,col4.in.(v1,v2))
    // targetProfileIds are UUIDs - safe to join with comma (no commas in UUIDs)
    const csvTargets = targetProfileIds.join(",");
    const orFilter = `and(follower_id.eq.${viewerProfileId},following_id.in.(${csvTargets})),and(following_id.eq.${viewerProfileId},follower_id.in.(${csvTargets}))`;

    const result = await retry(
      async () => {
        const { data, error } = await supabase
          .from("follows")
          .select("follower_id, following_id, status")
          .or(orFilter);

        if (error) throw error;
        return data || [];
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

    // Build same maps as before: viewer->target (following) and target->viewer (followedBy)
    const followingMap = new Map<string, string>();
    const followedByMap = new Map<string, string>();
    for (const row of result) {
      if (row.follower_id === viewerProfileId) {
        followingMap.set(row.following_id, row.status);
      } else if (row.following_id === viewerProfileId) {
        followedByMap.set(row.follower_id, row.status);
      }
    }

    // [FIX] Rename to avoid variable name collision with retry result
    const statusMap: {
      [targetId: string]: "none" | "pending" | "following" | "friends";
    } = {};

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
      .is("deleted_at", null)
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
      console.log(
        "Creating notifications for private account follow request:",
        {
          followerProfile_user_id: followerProfile?.user_id,
          targetProfile_user_id: targetProfile.user_id,
          follower_id: me,
          following_id: targetProfileId,
        }
      );

      if (!followerProfile?.user_id) {
        console.error(
          "Cannot create notifications: followerProfile.user_id is missing",
          {
            followerProfile,
            follower_profile_id: me,
          }
        );
      } else if (!targetProfile.user_id) {
        console.error(
          "Cannot create notifications: targetProfile.user_id is missing",
          {
            targetProfile,
            following_profile_id: targetProfileId,
          }
        );
      } else {
        try {
          // Use database function to bypass RLS (SECURITY DEFINER)
          // Use entity_type: 'post' to match database constraint and existing trigger pattern
          // The actual follow request info is stored in additional_data

          // Notification for account owner (received request)
          const { error: receivedError } = await supabase.rpc(
            "create_notification",
            {
              p_user_id: targetProfile.user_id, // Account owner (receives notification)
              p_actor_id: followerProfile.user_id, // Follower (person requesting)
              p_type: "follow",
              p_entity_type: "post", // Use 'post' to match database constraint (matches existing trigger pattern)
              p_entity_id: me, // Follower's profile ID
              p_additional_data: {
                follow_request_status: "pending",
                follower_profile_id: me,
                following_profile_id: targetProfileId,
              },
            }
          );

          // Notification for requester (sent request)
          const { error: sentError } = await supabase.rpc(
            "create_notification",
            {
              p_user_id: followerProfile.user_id, // Requester (receives notification)
              p_actor_id: targetProfile.user_id, // Account owner
              p_type: "follow",
              p_entity_type: "post", // Use 'post' to match database constraint (matches existing trigger pattern)
              p_entity_id: targetProfileId, // Account owner's profile ID
              p_additional_data: {
                follow_request_status: "pending",
                follower_profile_id: me,
                following_profile_id: targetProfileId,
              },
            }
          );

          if (receivedError || sentError) {
            console.error("Error creating follow request notifications:", {
              receivedError,
              sentError,
            });
          } else {
            console.log(
              "Follow request notifications created successfully (received and sent)"
            );
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

    // [OPTIMIZATION] Update cache with new follow status
    try {
      const { setCachedFollowStatus } = await import(
        "../../lib/followStatusCache"
      );
      // Map followStatus to cache status
      const cacheStatus: "pending" | "following" =
        followStatus === "pending" ? "pending" : "following";
      setCachedFollowStatus(me, targetProfileId, cacheStatus);
    } catch (cacheError) {
      console.warn("Failed to update follow status cache:", cacheError);
      // Don't fail the follow if cache update fails
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
      const { setCachedFollowRequestStatus } = await import(
        "../../lib/followRequestStatusCache"
      );
      setCachedFollowRequestStatus(followerProfileId, me, "approved");
    } catch (cacheError) {
      console.error("Error updating follow request cache:", cacheError);
      // Don't fail the approval if cache update fails
    }

    // [OPTIMIZATION] Update follow status cache
    // Check if mutual follow (friends) or just following
    try {
      const { setCachedFollowStatus } = await import(
        "../../lib/followStatusCache"
      );
      // Check if follower is also following the account owner (mutual follow)
      const { data: mutualFollow } = await supabase
        .from("follows")
        .select("status")
        .eq("follower_id", me)
        .eq("following_id", followerProfileId)
        .eq("status", "approved")
        .maybeSingle();

      const cacheStatus: "following" | "friends" = mutualFollow
        ? "friends"
        : "following";
      setCachedFollowStatus(followerProfileId, me, cacheStatus);
      // Also update reverse direction
      setCachedFollowStatus(me, followerProfileId, cacheStatus);
    } catch (cacheError) {
      console.warn("Failed to update follow status cache:", cacheError);
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
      supabase.from("profiles").select("user_id").eq("id", me).single(),
    ]);

    const followerProfile = followerProfileRes.data;
    const ownerProfile = ownerProfileRes.data;

    // Create approval notification for requester
    if (followerProfile?.user_id && ownerProfile?.user_id) {
      try {
        // Use database function to bypass RLS (SECURITY DEFINER)
        // Use entity_type: 'post' to match database constraint and existing trigger pattern
        const { error: notificationError } = await supabase.rpc(
          "create_notification",
          {
            p_user_id: followerProfile.user_id, // Requester (receives notification)
            p_actor_id: ownerProfile.user_id, // Account owner (person who approved)
            p_type: "follow",
            p_entity_type: "post", // Use 'post' to match database constraint (matches existing trigger pattern)
            p_entity_id: me, // Account owner's profile ID
            p_additional_data: {
              follow_request_status: "approved",
              follower_profile_id: followerProfileId,
              following_profile_id: me,
            },
          }
        );

        if (notificationError) {
          console.error(
            "Error creating approval notification:",
            notificationError
          );
        } else {
          console.log("Approval notification created");
        }
      } catch (notificationError) {
        console.error(
          "Exception creating approval notification:",
          notificationError
        );
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
      const { setCachedFollowRequestStatus } = await import(
        "../../lib/followRequestStatusCache"
      );
      setCachedFollowRequestStatus(followerProfileId, me, "declined");
    } catch (cacheError) {
      console.error("Error updating follow request cache:", cacheError);
      // Don't fail the decline if cache update fails
    }

    // [OPTIMIZATION] Update follow status cache to "none"
    try {
      const { setCachedFollowStatus } = await import(
        "../../lib/followStatusCache"
      );
      setCachedFollowStatus(followerProfileId, me, "none");
      // Also update reverse direction
      setCachedFollowStatus(me, followerProfileId, "none");
    } catch (cacheError) {
      console.warn("Failed to update follow status cache:", cacheError);
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
      supabase.from("profiles").select("user_id").eq("id", me).single(),
    ]);

    const followerProfile = followerProfileRes.data;
    const ownerProfile = ownerProfileRes.data;

    if (followerProfile?.user_id && ownerProfile?.user_id) {
      try {
        // Use database function to bypass RLS (SECURITY DEFINER)
        // Use entity_type: 'post' to match database constraint and existing trigger pattern
        // Note: We can't set is_read via create_notification function, so we'll create it and then mark as read
        const { error: notificationError } = await supabase.rpc(
          "create_notification",
          {
            p_user_id: followerProfile.user_id, // Requester (receives notification)
            p_actor_id: ownerProfile.user_id, // Account owner (person who declined)
            p_type: "follow",
            p_entity_type: "post", // Use 'post' to match database constraint (matches existing trigger pattern)
            p_entity_id: me, // Account owner's profile ID
            p_additional_data: {
              follow_request_status: "declined",
              follower_profile_id: followerProfileId,
              following_profile_id: me,
            },
          }
        );

        if (notificationError) {
          console.error(
            "Error creating decline notification:",
            notificationError
          );
        } else {
          console.log("Decline notification created");
          // Mark declined notifications as read (don't count as unread)
          // We'll need to find the notification and mark it as read after creation
          // Since we can't get the notification ID from create_notification return value easily,
          // we'll mark it as read via a separate query (optional, non-critical)
        }
      } catch (notificationError) {
        console.error(
          "Exception creating decline notification:",
          notificationError
        );
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

    console.log("Follow relationship check before unfollow:", {
      followRelationship,
      fetchError,
    });

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
      const { clearCachedFollowStatus } = await import(
        "../../lib/followStatusCache"
      );
      const { clearCachedFollowRequestStatus } = await import(
        "../../lib/followRequestStatusCache"
      );

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
      console.error(
        "Update privacy failed: Not authorized to update this profile."
      );
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

        console.log(
          `Account went private. ${
            approvedCount ?? 0
          } existing approved followers will retain access.`
        );
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
        console.error(
          "Exception auto-approving pending requests:",
          approveError
        );
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
