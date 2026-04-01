// src/components/ui/RSVPComponent.tsx
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import { getViewerAuthUserId } from "../../api/services/follows";
import Avatar from "./Avatar";
import RSVPListDrawer from "./RSVPListDrawer";
import FollowButton from "./FollowButton";
import { useDispatch } from "react-redux";
import { setAuthModal } from "../../reducers/modalReducer";
import { imgUrlPublic } from "../../lib/img";
import { isDraftPostId } from "../../lib/drafts";
import { getCachedRSVPData, setCachedRSVPData } from "../../lib/rsvpCache";
import { type RSVPData } from "../../types/legacy";
import { recordSignal } from "../../lib/feedPersonalization";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { incrementMyXp } from "../../api/services/xp";

interface RSVPUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: "going" | "maybe" | "not_going";
  created_at: string;
}

interface RSVPComponentProps {
  postId: string;
  capacity: number;
  className?: string;
  align?: "left" | "right"; // NEW: alignment prop
  postAuthor?: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    is_anonymous?: boolean;
  };
  // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded RSVP data from batch loader
  rsvpData?: RSVPData;
  // [PHASE 3] Optional post data for personalization
  post?: FeedItem;
}

export default function RSVPComponent({
  postId,
  capacity,
  className = "",
  align = "right", // Default to right for backward compatibility
  postAuthor,
  rsvpData: initialRsvpData, // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded RSVP data
  post, // [PHASE 3] Optional post data for personalization
}: RSVPComponentProps) {
  const dispatch = useDispatch();
  const [rsvpUsers, setRsvpUsers] = useState<RSVPUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRSVPList, setShowRSVPList] = useState(false);
  const [currentUserRsvp, setCurrentUserRsvp] = useState<string | null>(null);
  const [goingCountDelta, setGoingCountDelta] = useState(0); // Optimistic delta from drawer toggles
  const [isToggling, setIsToggling] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const componentRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);

  // Get current user and their profile
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);

        // Use cached profile data first (like BottomTab does)
        const cachedAvatarUrl = localStorage.getItem("my_avatar_url");
        const cachedDisplayName = localStorage.getItem("my_display_name");
        const cachedUsername = localStorage.getItem("my_username");

        if (cachedAvatarUrl || cachedDisplayName || cachedUsername) {
          setCurrentUserProfile({
            id: session.user.id,
            username: cachedUsername,
            display_name: cachedDisplayName,
            avatar_url: cachedAvatarUrl,
          });
        } else {
          // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
          // Why: Centralizes profile fetching, reduces duplicate profiles?select=id requests
          const { getProfileByUserId } = await import(
            "../../api/services/follows"
          );
          const profileData = await getProfileByUserId(session.user.id);

          if (!profileData) {
            console.error(
              "Error loading current user profile: Profile not found"
            );
            // Profile not found - getProfileByUserId() already handles errors internally
            // No need to create profile here, as it's handled elsewhere
          } else {
            setCurrentUserProfile(profileData);
          }
        }
      }
    };
    getCurrentUser();
  }, []);

  // [DEBUG] Warn if falling back to individual query
  // [PHASE 1.1] Silenced to reduce console noise - uncomment for debugging
  // useEffect(() => {
  //   if (initialRsvpData === undefined && currentUser && !hasLoadedRef.current) {
  //     console.warn('[RSVPComponent] ⚠️ No PostgreSQL data, falling back to query:', postId);
  //   }
  // }, [initialRsvpData, postId, currentUser]);

  // [FIX: Request storm] Data-driven: use initialRsvpData when present, NEVER fetch for feed.
  // Only fetch when initialRsvpData is undefined (e.g. legacy paths without rsvp_data).
  useEffect(() => {
    // Feed always passes post.rsvp_data; use it, never fetch (even before currentUser loads)
    if (initialRsvpData !== undefined) {
      hasLoadedRef.current = true;
      applyInitialRsvpData(initialRsvpData);
      return;
    }

    // No data at all: lazy load only when visible (e.g. legacy paths)
    if (!currentUser || !componentRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasLoadedRef.current) {
          hasLoadedRef.current = true;
          loadRSVPs();
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );

    observer.observe(componentRef.current);
    return () => observer.disconnect();
  }, [postId, currentUser, initialRsvpData]);

  /** Set state from feed data; no network calls. Used when initialRsvpData is provided. */
  const applyInitialRsvpData = (data: RSVPData | null) => {
    if (data === null) {
      setRsvpUsers([]);
      setCurrentUserRsvp(null);
    } else {
      const users = data.users ?? [];
      const filteredUsers = users.filter((user) => {
        if (postAuthor && user.id === postAuthor.id) return false;
        return true;
      });
      setRsvpUsers(filteredUsers);
      setCurrentUserRsvp(data.currentUserStatus ?? null);
    }
    setGoingCountDelta(0);
    setLoading(false);
    setIsInitialized(true);
  };

  const loadRSVPs = async () => {
    setLoading(true);
    try {
      if (isDraftPostId(postId)) {
        setRsvpUsers([]);
        setCurrentUserRsvp(null);
        setLoading(false);
        setIsInitialized(true);
        return;
      }
      // loadRSVPs only runs when initialRsvpData is undefined (no feed data)
      // Try to get cached RSVP data first
      const cachedRSVP = getCachedRSVPData(postId);
      if (cachedRSVP && currentUser) {
        // console.log("[RSVPComponent] Using cached RSVP data for post:", postId);

        // Get current user's auth ID to check if cached data is for current user
        const authUserId = await getViewerAuthUserId();
        if (authUserId) {
          // Filter out creator from cached users
          const filteredUsers = cachedRSVP.users.filter((user) => {
            if (postAuthor && user.id === postAuthor.id) {
              return false;
            }
            return true;
          });

          setRsvpUsers(filteredUsers);

          // For current user's RSVP status, we need to check if it's still valid
          if (cachedRSVP.currentUserRsvp !== null && authUserId) {
            // Check if current user is the creator (they're always "going")
            // Compare profile IDs, not auth ID to profile ID
            if (postAuthor && currentUserProfile?.id === postAuthor.id) {
              setCurrentUserRsvp("going");
            } else {
              setCurrentUserRsvp(cachedRSVP.currentUserRsvp);
            }
          }

          setLoading(false);
          setIsInitialized(true);

          // [FIX] Return here to prevent unnecessary query
          // Cache is fresh enough for display, no need to re-fetch
          return;
        }
      }

      // Get RSVP responses for this post (only if no cache available)
      const { data: rsvpData, error } = await supabase
        .from("rsvp_responses")
        .select("id, user_id, status")
        .eq("post_id", postId)
        .eq("status", "going") // Only show "going" users in the main display
        .order("created_at", { ascending: false })
        .limit(10); // Limit to recent RSVPs

      if (error) {
        console.error(
          `[RSVPComponent] Error loading RSVPs for post ${postId}:`,
          error
        );
        // Don't return early, show empty state instead
        setRsvpUsers([]);
        setCurrentUserRsvp(null);
        return;
      }

      // Get user profiles for RSVP users
      // Note: rsvp_responses.user_id is auth user ID, not profile ID
      const authUserIds = (rsvpData || []).map((item: any) => item.user_id);
      let userProfiles: any[] = [];

      if (authUserIds.length > 0) {
        // [PHASE 2.3 - OPTIMIZATION] Use getProfilesByUserIds() for batch loading with deduplication
        // Why: RequestManager deduplicates simultaneous calls, reuses cache, and enables progressive loading
        const { getProfilesByUserIds } = await import(
          "../../api/services/follows"
        );
        const profilesData = await getProfilesByUserIds(authUserIds);
        userProfiles = profilesData.map((p) => ({
          id: p.id,
          user_id: p.user_id,
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
        }));
      }

      // Transform the data
      const users: RSVPUser[] = (rsvpData || []).map((item: any) => {
        const profile = userProfiles.find(
          (p: any) => p.user_id === item.user_id
        );
        return {
          id: profile?.id || item.user_id, // Use profile ID if available, fallback to auth user ID
          username: profile?.username || null,
          display_name: profile?.display_name || null,
          avatar_url: profile?.avatar_url || null,
          status: item.status,
          created_at: new Date().toISOString(), // Use current time as fallback
        };
      });

      // Filter out creator from RSVP users to prevent duplication
      const filteredUsers = users.filter((user) => {
        // Don't include creator in RSVP users list since they're shown separately
        if (postAuthor && user.id === postAuthor.id) {
          return false;
        }
        return true;
      });

      setRsvpUsers(filteredUsers);

      let finalCurrentUserRsvp: string | null = null;

      // Check current user's RSVP status - need to check ALL statuses, not just "going"
      if (currentUser) {
        // Get current user's auth user ID for RSVP query
        const authUserId = await getViewerAuthUserId();
        // Don't return early - continue loading RSVP list even if authUserId is null
        // The RSVP list should still display, just without current user's status

        if (authUserId) {
          // Get current user's RSVP status (any status)
          const { data: currentUserRsvpData, error: currentUserError } =
            await supabase
              .from("rsvp_responses")
              .select("status")
              .eq("post_id", postId)
              .eq("user_id", authUserId) // Use auth user ID
              .maybeSingle(); // Use maybeSingle to handle 0 rows gracefully (prevents 406 errors)

          if (currentUserError && currentUserError.code !== "PGRST116") {
            console.error("Error loading current user RSVP:", currentUserError);
          }

          // If no RSVP found, check if current user is the creator
          // Compare profile IDs, not auth ID to profile ID
          if (
            !currentUserRsvpData &&
            postAuthor &&
            currentUserProfile?.id === postAuthor.id
          ) {
            finalCurrentUserRsvp = "going"; // Creator is automatically "going"
            setCurrentUserRsvp("going");
          } else {
            finalCurrentUserRsvp = currentUserRsvpData?.status || null;
            setCurrentUserRsvp(finalCurrentUserRsvp);
          }
        } else {
          // If authUserId is null, still set currentUserRsvp to null (user not authenticated)
          finalCurrentUserRsvp = null;
          setCurrentUserRsvp(null);
        }
      }

      // Cache the fresh data for future use (both users and current user status)
      setCachedRSVPData(postId, filteredUsers, finalCurrentUserRsvp);
    } catch (error) {
      console.error("Error loading RSVPs:", error);
    } finally {
      setLoading(false);
      setIsInitialized(true);
    }
  };

  const handleCirclesClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation to detail page
    e.preventDefault(); // Prevent any default behavior
    // console.log("🔍 RSVPComponent - Opening RSVP list");
    // console.log("- postAuthor:", postAuthor);
    // console.log("- postId:", postId);
    setShowRSVPList(true);
  };

  const handlePillClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation to detail page
    e.preventDefault(); // Prevent any default behavior

    // Check authentication and initialization first
    if (!currentUser || isToggling || !isInitialized) {
      if (!currentUser) {
        dispatch(setAuthModal(true));
      }
      return;
    }

    // Toggle RSVP status with immediate feedback
    const newStatus = currentUserRsvp === "going" ? "not_going" : "going";
    handleRSVPResponse(newStatus);
  };

  const handleRSVPResponse = async (
    status: "going" | "maybe" | "not_going"
  ) => {
    if (!currentUser || isToggling) return;

    setIsToggling(true);
    const previousStatus = currentUserRsvp;
    const prevGoing = previousStatus === "going";
    const nextGoing = status === "going";
    const delta =
      !prevGoing && nextGoing ? 1 : prevGoing && !nextGoing ? -1 : 0;

    try {
      // Update UI immediately for better UX
      setCurrentUserRsvp(status);
      setGoingCountDelta((p) => p + delta);

      // Get current user's auth user ID for RSVP
      const authUserId = await getViewerAuthUserId();
      if (!authUserId) {
        setCurrentUserRsvp(previousStatus);
        setGoingCountDelta((p) => p - delta);
        return;
      }

      const { error } = await supabase.from("rsvp_responses").upsert(
        {
          post_id: postId,
          user_id: authUserId, // Use auth user ID
          status,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "post_id,user_id",
          ignoreDuplicates: false,
        }
      );

      if (error) {
        console.error("Error updating RSVP:", error);
        setCurrentUserRsvp(previousStatus);
        setGoingCountDelta((p) => p - delta);
        return;
      }

      // Update the cache immediately with the new status
      setCachedRSVPData(postId, rsvpUsers, status);

      // [Step 5] Invalidate post detail cache so modal shows fresh rsvp_data
      const { invalidateOnRSVP } = await import("../../lib/cacheInvalidation");
      invalidateOnRSVP(postId);

      // [PHASE 1] Update XP based on RSVP status change
      // Delta: prev != "going" and next == "going" => +3
      //        prev == "going" and next != "going" => -3
      //        else 0
      try {
        const prevWasGoing = previousStatus === "going";
        const nextIsGoing = status === "going";
        if (!prevWasGoing && nextIsGoing) {
          await incrementMyXp(3);
        } else if (prevWasGoing && !nextIsGoing) {
          await incrementMyXp(-3);
        }
        // else: no change or "maybe" -> "not_going" (no XP change)
      } catch (err) {
        // Fail silently - don't break RSVP action if XP fails
      }

      // [PHASE 3] Record signal for personalization (only for "going" status)
      if (status === "going" && post) {
        try {
          recordSignal(post, "rsvp_going");
        } catch (err) {
          // Fail silently - don't break RSVP action if personalization fails
        }
      }

      // Don't reload immediately - causes race condition
      // The optimistic update is already in place (setCurrentUserRsvp(status) on line 361)
      // The cache is updated, so the state will persist
      // The drawer will refresh when opened, and the next natural refresh will sync

      // Update rsvpUsers list optimistically to reflect the change immediately
      if (status === "going" && currentUserProfile) {
        // Don't add creator to rsvpUsers - they're shown separately
        const isCreator = postAuthor && currentUserProfile.id === postAuthor.id;
        if (!isCreator) {
          // Add current user to the list if not already there
          const userAlreadyInList = rsvpUsers.some(
            (u) => u.id === currentUserProfile.id
          );
          if (!userAlreadyInList) {
            setRsvpUsers([
              ...rsvpUsers,
              {
                id: currentUserProfile.id,
                username: currentUserProfile.username,
                display_name: currentUserProfile.display_name,
                avatar_url: currentUserProfile.avatar_url,
                status: "going",
                created_at: new Date().toISOString(),
              },
            ]);
          }
        }
      } else if (status === "not_going") {
        // Remove current user from the list (only if they're not the creator)
        const isCreator =
          postAuthor && currentUserProfile?.id === postAuthor.id;
        if (!isCreator) {
          setRsvpUsers(
            rsvpUsers.filter((u) => u.id !== currentUserProfile?.id)
          );
        }
      }
    } catch (error) {
      console.error("Error updating RSVP:", error);
      setCurrentUserRsvp(previousStatus);
      setGoingCountDelta((p) => p - delta);
    } finally {
      setIsToggling(false);
    }
  };

  // Calculate going count: use feed's going_count when available, else derive from users
  const creatorAlwaysGoing = postAuthor ? 1 : 0;
  const currentUserGoing =
    currentUserRsvp === "going" &&
    currentUserProfile &&
    currentUserProfile.id !== postAuthor?.id
      ? 1
      : 0;
  const derivedCount = creatorAlwaysGoing + rsvpUsers.length + currentUserGoing;
  const goingCount =
    (initialRsvpData?.going_count ?? derivedCount) + goingCountDelta;
  const spotsLeft = capacity - goingCount;

  // Always show creator as first circle, then current user if RSVP'd, then other RSVP users
  const displayUsers = [
    // Creator always first
    postAuthor
      ? {
          id: postAuthor.id,
          username: postAuthor.username,
          display_name: postAuthor.display_name,
          avatar_url: postAuthor.avatar_url,
          status: "creator" as any,
          created_at: "",
        }
      : null,
    // Add current user if they RSVP'd and have profile data, but NOT if they are the creator (to avoid duplicates)
    // Compare profile IDs, not auth ID to profile ID
    ...(currentUserRsvp === "going" &&
    currentUserProfile &&
    currentUserProfile.id !== postAuthor?.id
      ? [
          {
            id: currentUserProfile.id, // Use profile ID, not currentUser.id
            username: currentUserProfile.username,
            display_name: currentUserProfile.display_name,
            avatar_url: currentUserProfile.avatar_url,
            status: "going" as any,
            created_at: "",
          },
        ]
      : []),
    // Show other RSVP users (excluding current user and creator)
    // Compare profile IDs consistently
    ...rsvpUsers
      .filter((u) => u.id !== currentUserProfile?.id && u.id !== postAuthor?.id)
      .slice(0, 2),
  ].filter(Boolean);

  // If post is anonymous, show nothing (do not render Follow—would leak author id)
  if (postAuthor?.is_anonymous) {
    return (
      <div
        ref={componentRef}
        className={`flex items-center ${
          align === "left" ? "justify-start" : "justify-end"
        } ${className}`}
      />
    );
  }

  // If no capacity set, show Follow button instead
  if (!capacity || capacity <= 0) {
    return (
      <div
        ref={componentRef}
        className={`flex items-center ${
          align === "left" ? "justify-start" : "justify-end"
        } ${className}`}
      >
        <FollowButton targetId={postAuthor?.id || ""} />
      </div>
    );
  }

  return (
    <>
      <div
        ref={componentRef}
        className={`flex items-center ${
          align === "left" ? "justify-start" : "justify-end"
        } ${className}`}
      >
        {/* User avatars (overlapping circles) - Creator on right, others to left */}
        <div
          className="flex items-center cursor-pointer"
          onClick={handleCirclesClick}
        >
          {[0, 1, 2].map((index) => {
            const user = displayUsers[index];
            const isEmpty = !user;

            return (
              <div
                key={index}
                className="relative flex items-center justify-center"
                style={{
                  zIndex: index + 1, // Left (index 0) = z-index 1, middle (index 1) = z-index 2, right (index 2) = z-index 3
                  marginLeft: index > 0 ? "-4px" : "0px", // Reduced overlap
                  width: "20px",
                  height: "20px",
                }}
              >
                {isEmpty ? (
                  // Empty gray circle - consistent dimensions with Avatar
                  <div
                    className="w-5 h-5 rounded-full bg-gray-400 flex-shrink-0"
                    style={{ border: "1px solid var(--border-contrast)" }}
                  />
                ) : (
                  // Avatar without post type indicator to maintain consistent alignment
                  <div className="relative inline-block">
                    <div
                      className="relative rounded-full overflow-hidden"
                      style={{
                        width: "20px",
                        height: "20px",
                        border: "1px solid var(--border-contrast)",
                      }}
                      aria-label="avatar"
                    >
                      {imgUrlPublic(user.avatar_url) ? (
                        <img
                          src={imgUrlPublic(user.avatar_url)!}
                          alt=""
                          className="w-full h-full object-cover rounded-full"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full rounded-full flex items-center justify-center font-semibold bg-gray-600 text-white text-xs">
                          {(user.display_name || "U")[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* RSVP pill - same height as circles, overlapping, on top */}
        <button
          onClick={handlePillClick}
          className={`flex items-center gap-1 px-2 py-1 rounded-full border transition-all duration-200 text-xs transform active:scale-95 ${
            currentUserRsvp === "going"
              ? ""
              : "bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface)]/70"
          } ${isToggling ? "opacity-70 cursor-not-allowed" : ""}`}
          style={{
            marginLeft: "-4px", // Reduced overlap with the last circle
            zIndex: 4, // Highest z-index so pill appears on top
            ...(currentUserRsvp === "going" && {
              background: "var(--rsvp-active-bg)",
              color: "var(--rsvp-active-text)",
              borderColor: "var(--rsvp-active-border)",
            }),
          }}
          disabled={loading || isToggling || !isInitialized}
        >
          <span
            className={`text-xs font-medium ${
              currentUserRsvp === "going" ? "" : "text-[var(--text)]"
            }`}
            style={
              currentUserRsvp === "going"
                ? {
                    color: "var(--rsvp-active-text)",
                  }
                : {}
            }
          >
            Going
          </span>
          <span
            className={`text-xs ${
              currentUserRsvp === "going" ? "" : "text-[var(--text)]"
            }`}
            style={
              currentUserRsvp === "going"
                ? {
                    color: "var(--rsvp-active-text)",
                  }
                : {}
            }
          >
            {goingCount}/{capacity}
          </span>
        </button>
      </div>

      {/* RSVP List Drawer */}
      <RSVPListDrawer
        open={showRSVPList}
        onClose={() => setShowRSVPList(false)}
        postId={postId}
        postAuthor={postAuthor}
        onRSVPChange={(newStatus, deltaGoingCount) => {
          setCurrentUserRsvp(newStatus);
          setGoingCountDelta((prev) => prev + deltaGoingCount);
        }}
      />
    </>
  );
}
