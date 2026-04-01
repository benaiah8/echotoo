// src/components/ui/RSVPListDrawer.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { getRSVPListOptimized } from "../../api/services/rsvp";
import {
  getViewerId,
  getBatchFollowStatuses,
} from "../../api/services/follows";
import BottomDrawer from "./BottomDrawer";
import DrawerProfileCard from "./DrawerProfileCard";
// [OPTIMIZATION: Phase 3.5] Use optimized PostgreSQL function instead of 3 separate queries

interface RSVPUser {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  status: "going" | "maybe" | "not_going";
  created_at: string;
}

interface RSVPListDrawerProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  postAuthor?: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    is_anonymous?: boolean;
  };
  onRSVPChange?: (newStatus: string, deltaGoingCount: number) => void; // Optimistic update: no refetch
}

export default function RSVPListDrawer({
  open,
  onClose,
  postId,
  postAuthor,
  onRSVPChange,
}: RSVPListDrawerProps) {
  const navigate = useNavigate();
  const [rsvpUsers, setRsvpUsers] = useState<RSVPUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentUserRsvp, setCurrentUserRsvp] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  /** Viewer profile ID resolved once per load; used for batch follow status and self check */
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  /** Batched follow statuses keyed by profile id; avoids per-row getFollowStatus */
  const [batchedFollowStatuses, setBatchedFollowStatuses] = useState<
    Record<string, "none" | "pending" | "following" | "friends">
  >({});

  // Get current user and their profile (using cached data like BottomTab)
  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      // console.log("🔍 RSVPListDrawer - Current user session:", session);
      if (session?.user) {
        // console.log("🔍 RSVPListDrawer - Setting current user:", session.user);
        setCurrentUser(session.user);

        // Use cached profile data first (like BottomTab does)
        const cachedAvatarUrl = localStorage.getItem("my_avatar_url");
        const cachedDisplayName = localStorage.getItem("my_display_name");
        const cachedUsername = localStorage.getItem("my_username");

        if (cachedAvatarUrl || cachedDisplayName || cachedUsername) {
          // console.log("🔍 RSVPListDrawer - Using cached profile data");
          setCurrentUserProfile({
            id: session.user.id,
            username: cachedUsername,
            display_name: cachedDisplayName,
            avatar_url: cachedAvatarUrl,
          });
        } else {
          // [PHASE 2.3 - OPTIMIZATION] Use getProfileByUserId() for caching and deduplication
          const { getProfileByUserId } = await import(
            "../../api/services/follows"
          );
          const profileData = await getProfileByUserId(session.user.id);

          if (!profileData) {
            // Profile doesn't exist - try to create one
            console.log("Profile not found, attempting to create one");
            try {
              const { data: newProfile, error: createError } = await supabase
                .from("profiles")
                .insert({
                  user_id: session.user.id,
                  username: session.user.email?.split("@")[0] || "user",
                  display_name: session.user.email?.split("@")[0] || "User",
                  avatar_url: null,
                })
                .select()
                .single();

              if (createError) {
                console.error("Error creating profile:", createError);
              } else {
                console.log("Profile created successfully:", newProfile);
                setCurrentUserProfile({
                  id: newProfile.id,
                  username: newProfile.username,
                  display_name: newProfile.display_name,
                  avatar_url: newProfile.avatar_url,
                });
              }
            } catch (createErr) {
              console.error("Error creating profile:", createErr);
            }
          } else {
            console.log(
              "🔍 RSVPListDrawer - Current user profile:",
              profileData
            );
            setCurrentUserProfile({
              id: profileData.id,
              username: profileData.username,
              display_name: profileData.display_name,
              avatar_url: profileData.avatar_url,
            });
          }
        }
      } else {
        // console.log("🔍 RSVPListDrawer - No user session found");
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (currentUser) {
      loadRSVPs();
    }
  }, [open, postId, currentUser]);

  const loadRSVPs = async () => {
    setLoading(true);
    try {
      // [OPTIMIZATION: Phase 3.5] Get viewer user ID for PostgreSQL function
      const { getViewerAuthUserId } = await import(
        "../../api/services/follows"
      );
      const viewerUserId = await getViewerAuthUserId();

      // [OPTIMIZATION: Phase 3.5] Use optimized PostgreSQL function (includes all related data)
      const result = await getRSVPListOptimized(postId, viewerUserId);

      if (result.error) {
        console.error(
          `[RSVPListDrawer] Error loading RSVPs for post ${postId}:`,
          result.error
        );
        setRsvpUsers([]);
        setCurrentUserRsvp(null);
        return;
      }

      if (!result.data) {
        setRsvpUsers([]);
        setCurrentUserRsvp(null);
        return;
      }

      // PostgreSQL function returns users with profile data already included
      const users: RSVPUser[] = result.data.users || [];

      // [FIX] Filter to only "going" status users to match the count display
      const goingUsers = users.filter((u) => u.status === "going");

      // Always include the creator as "going" if they exist
      const allUsers = [...goingUsers];

      // Always add creator if they exist and aren't already in the list
      if (postAuthor) {
        const creatorExists = goingUsers.find((u) => u.id === postAuthor.id);

        if (!creatorExists) {
          allUsers.unshift({
            id: postAuthor.id,
            username: postAuthor.username || null,
            display_name: postAuthor.display_name || null,
            avatar_url: postAuthor.avatar_url || null,
            status: "going",
            created_at: "", // Creator doesn't have a created_at for RSVP
          });
        }
      }

      setRsvpUsers(allUsers);

      // Batch load follow statuses once for all rows (avoid per-row getFollowStatus)
      if (allUsers.length > 0) {
        const vid =
          typeof localStorage !== "undefined"
            ? localStorage.getItem("my_profile_id")
            : null;
        const resolvedViewerId = vid || (await getViewerId());
        if (resolvedViewerId) {
          setViewerProfileId(resolvedViewerId);
          const targetProfileIds = allUsers.map((u) => u.id);
          const statuses = await getBatchFollowStatuses(
            resolvedViewerId,
            targetProfileIds
          );
          setBatchedFollowStatuses(statuses);
        } else {
          setViewerProfileId(null);
          setBatchedFollowStatuses({});
        }
      } else {
        setViewerProfileId(null);
        setBatchedFollowStatuses({});
      }

      // Set current user's RSVP status from PostgreSQL function result
      // Use viewerUserId instead of undefined authUser
      // Handle null case gracefully (user not authenticated)
      if (currentUser && viewerUserId) {
        // If no RSVP found, check if current user is the creator
        if (
          !result.data.currentUserStatus &&
          postAuthor &&
          currentUserProfile?.id === postAuthor.id
        ) {
          setCurrentUserRsvp("going"); // Creator is automatically "going"
        } else {
          setCurrentUserRsvp(result.data.currentUserStatus || null);
        }
      } else {
        // User not authenticated or viewerUserId is null
        setCurrentUserRsvp(null);
      }
    } catch (error) {
      console.error("Error loading RSVPs:", error);
      setRsvpUsers([]);
      setCurrentUserRsvp(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRSVPResponse = async (
    status: "going" | "maybe" | "not_going"
  ) => {
    // console.log("🔍 RSVP Response Debug:");
    // console.log("- currentUser:", currentUser);
    // console.log("- status:", status);
    // console.log("- postId:", postId);

    if (!currentUser) {
      // console.log("- No current user, returning");
      return;
    }

    try {
      // console.log("- Attempting to upsert RSVP response");

      // Get current user's auth user ID for RSVP
      const { getViewerAuthUserId } = await import(
        "../../api/services/follows"
      );
      const authUserId = await getViewerAuthUserId();
      if (!authUserId) return;

      // Use proper upsert with onConflict to handle the unique constraint
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
        return;
      }

      // [Step 5] Invalidate post detail cache so modal shows fresh rsvp_data
      const { invalidateOnRSVP } = await import("../../lib/cacheInvalidation");
      invalidateOnRSVP(postId);

      // Reload drawer's own list
      loadRSVPs();

      // Optimistic update: notify parent (no refetch)
      const prevGoing = currentUserRsvp === "going";
      const nextGoing = status === "going";
      const deltaGoingCount =
        !prevGoing && nextGoing ? 1 : prevGoing && !nextGoing ? -1 : 0;
      onRSVPChange?.(status, deltaGoingCount);
    } catch (error) {
      console.error("Error updating RSVP:", error);
    }
  };

  // If post is anonymous, don't show RSVP list
  if (postAuthor?.is_anonymous) {
    return null;
  }

  return (
    <BottomDrawer
      open={open}
      onClose={onClose}
      title="RSVP List"
      maxHeight="80vh"
    >
      {loading && (
        <div className="text-sm text-[var(--text)]/60 py-6 text-center">
          Loading RSVPs...
        </div>
      )}

      {!loading && rsvpUsers.length === 0 && !postAuthor && (
        <div className="text-sm text-[var(--text)]/60 py-6 text-center">
          No RSVPs yet.
        </div>
      )}

      {/* RSVP Toggle Button for current user */}
      {!loading && currentUser && (
        <div className="mb-4">
          <div className="text-sm font-medium mb-3 text-[var(--text)]">
            RSVP
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleRSVPResponse(
                currentUserRsvp === "going" ? "not_going" : "going"
              );
            }}
            className={`w-full py-2 px-3 rounded-full text-sm font-medium transition ${
              currentUserRsvp === "going"
                ? "bg-white text-black"
                : "bg-[var(--glass-active-bg)] border border-[var(--glass-active-border)] text-[var(--text)] hover:bg-white/10"
            }`}
            style={{
              backdropFilter: "blur(var(--glass-blur))",
              WebkitBackdropFilter: "blur(var(--glass-blur))",
              boxShadow:
                currentUserRsvp === "going"
                  ? "none"
                  : "var(--glass-active-shadow)",
            }}
          >
            {currentUserRsvp === "going" ? "You've RSVP'd ✓" : "RSVP"}
          </button>
        </div>
      )}

      {!loading && (rsvpUsers.length > 0 || postAuthor) && (
        <div className="space-y-2">
          {/* All RSVP'd users in simple list format */}
          {rsvpUsers.map((user) => {
            // [OPTIMIZATION: Phase 3.5] Compare profile IDs (user.id is profile id from PostgreSQL function)
            const isCurrentUser =
              currentUserProfile && user.id === currentUserProfile.id;
            const displayUser =
              isCurrentUser && currentUserProfile ? currentUserProfile : user;
            const hasRsvpd = currentUserRsvp === "going";

            // Hide current user if they haven't RSVP'd (unless they're the creator)
            if (
              isCurrentUser &&
              !hasRsvpd &&
              (!postAuthor || currentUserProfile?.id !== postAuthor.id)
            ) {
              return null;
            }

            return (
              <DrawerProfileCard
                key={user.id}
                id={user.id}
                username={displayUser.username || null}
                display_name={displayUser.display_name || null}
                avatar_url={displayUser.avatar_url || null}
                followStatus={
                  batchedFollowStatuses[user.id] ??
                  (user.id === viewerProfileId ? "self" : "none")
                }
                onClick={() =>
                  !isCurrentUser &&
                  navigate(`/u/${displayUser.username || displayUser.id}`)
                }
                showFollowButton={!isCurrentUser}
                showCustomBadge={
                  isCurrentUser ? (
                    <div className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                      It's you, silly! 😄
                    </div>
                  ) : undefined
                }
                avatarVariant={
                  displayUser.id === postAuthor?.id && postAuthor?.is_anonymous
                    ? "anon"
                    : "default"
                }
                className={isCurrentUser && !hasRsvpd ? "opacity-50" : ""}
              />
            );
          })}
        </div>
      )}
    </BottomDrawer>
  );
}
