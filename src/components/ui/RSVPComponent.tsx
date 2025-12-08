// src/components/ui/RSVPComponent.tsx
import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import Avatar from "./Avatar";
import RSVPListDrawer from "./RSVPListDrawer";
import FollowButton from "./FollowButton";
import { useDispatch } from "react-redux";
import { setAuthModal } from "../../reducers/modalReducer";
import { imgUrlPublic } from "../../lib/img";
import { getCachedRSVPData, setCachedRSVPData } from "../../lib/rsvpCache";

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
}

export default function RSVPComponent({
  postId,
  capacity,
  className = "",
  align = "right", // Default to right for backward compatibility
  postAuthor,
}: RSVPComponentProps) {
  const dispatch = useDispatch();
  const [rsvpUsers, setRsvpUsers] = useState<RSVPUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRSVPList, setShowRSVPList] = useState(false);
  const [currentUserRsvp, setCurrentUserRsvp] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

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
          // Fetch from database if not cached
          const { data: profileData, error: profileError } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("user_id", session.user.id)
            .single();

          if (profileError) {
            console.error("Error loading current user profile:", profileError);

            // If profile doesn't exist, try to create one
            if (profileError.code === "PGRST116") {
              console.log("Profile not found, attempting to create one");
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
                setCurrentUserProfile(newProfile);
              }
            }
          } else {
            setCurrentUserProfile(profileData);
          }
        }
      }
    };
    getCurrentUser();
  }, []);

  // Load RSVP data
  useEffect(() => {
    if (currentUser) {
      loadRSVPs();
    }
  }, [postId, currentUser]);

  const loadRSVPs = async () => {
    setLoading(true);
    try {
      // Try to get cached RSVP data first
      const cachedRSVP = getCachedRSVPData(postId);
      if (cachedRSVP && currentUser) {
        // console.log("[RSVPComponent] Using cached RSVP data for post:", postId);

        // Get current user's auth ID to check if cached data is for current user
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (authUser) {
          // Filter out creator from cached users
          const filteredUsers = cachedRSVP.users.filter((user) => {
            if (postAuthor && user.id === postAuthor.id) {
              return false;
            }
            return true;
          });

          setRsvpUsers(filteredUsers);

          // For current user's RSVP status, we need to check if it's still valid
          if (cachedRSVP.currentUserRsvp !== null && authUser.id) {
            // Check if current user is the creator (they're always "going")
            if (postAuthor && authUser.id === postAuthor.id) {
              setCurrentUserRsvp("going");
            } else {
              setCurrentUserRsvp(cachedRSVP.currentUserRsvp);
            }
          }

          setLoading(false);
          setIsInitialized(true);

          // Still fetch fresh data in background to ensure accuracy
          // but don't block the UI
        }
      }

      // Get RSVP responses for this post
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
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, user_id, username, display_name, avatar_url")
          .in("user_id", authUserIds); // Query by user_id (auth user ID)

        if (profilesError) {
          console.error("Error loading profiles:", profilesError);
        } else {
          userProfiles = profilesData || [];
        }
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
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) return;

        // Get current user's RSVP status (any status)
        const { data: currentUserRsvpData, error: currentUserError } =
          await supabase
            .from("rsvp_responses")
            .select("status")
            .eq("post_id", postId)
            .eq("user_id", authUser.id) // Use auth user ID
            .single();

        if (currentUserError && currentUserError.code !== "PGRST116") {
          console.error("Error loading current user RSVP:", currentUserError);
        }

        // If no RSVP found, check if current user is the creator
        if (
          !currentUserRsvpData &&
          postAuthor &&
          authUser.id === postAuthor.id
        ) {
          finalCurrentUserRsvp = "going"; // Creator is automatically "going"
          setCurrentUserRsvp("going");
        } else {
          finalCurrentUserRsvp = currentUserRsvpData?.status || null;
          setCurrentUserRsvp(finalCurrentUserRsvp);
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

    try {
      // Update UI immediately for better UX
      setCurrentUserRsvp(status);

      // Get current user's auth user ID for RSVP
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        setCurrentUserRsvp(previousStatus); // Revert on error
        return;
      }

      const { error } = await supabase.from("rsvp_responses").upsert(
        {
          post_id: postId,
          user_id: authUser.id, // Use auth user ID
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
        setCurrentUserRsvp(previousStatus); // Revert on error
        return;
      }

      // Update the cache immediately with the new status
      setCachedRSVPData(postId, rsvpUsers, status);

      // Reload RSVPs to sync with server state
      loadRSVPs();
    } catch (error) {
      console.error("Error updating RSVP:", error);
      setCurrentUserRsvp(previousStatus); // Revert on error
    } finally {
      setIsToggling(false);
    }
  };

  // Calculate going count - creator is always included, plus RSVP users
  const creatorAlwaysGoing = postAuthor ? 1 : 0;
  const currentUserGoing =
    currentUserRsvp === "going" &&
    currentUserProfile &&
    currentUser.id !== postAuthor?.id
      ? 1
      : 0;
  const goingCount = creatorAlwaysGoing + rsvpUsers.length + currentUserGoing;
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
    ...(currentUserRsvp === "going" &&
    currentUserProfile &&
    currentUser.id !== postAuthor?.id
      ? [
          {
            id: currentUser.id,
            username: currentUserProfile.username,
            display_name: currentUserProfile.display_name,
            avatar_url: currentUserProfile.avatar_url,
            status: "going" as any,
            created_at: "",
          },
        ]
      : []),
    // Show other RSVP users (excluding current user and creator)
    ...rsvpUsers
      .filter((u) => u.id !== currentUser.id && u.id !== postAuthor?.id)
      .slice(0, 2),
  ].filter(Boolean);

  // If post is anonymous, show Follow button instead of RSVP
  if (postAuthor?.is_anonymous) {
    return (
      <div
        className={`flex items-center ${
          align === "left" ? "justify-start" : "justify-end"
        } ${className}`}
      >
        <FollowButton targetId={postAuthor.id} />
      </div>
    );
  }

  // If no capacity set, show Follow button instead
  if (!capacity || capacity <= 0) {
    return (
      <div
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
                      {user.avatar_url ? (
                        <img
                          src={imgUrlPublic(user.avatar_url) || user.avatar_url}
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
        onRSVPChange={() => {
          // Reload RSVPs when RSVP changes in drawer
          loadRSVPs();
        }}
      />
    </>
  );
}
