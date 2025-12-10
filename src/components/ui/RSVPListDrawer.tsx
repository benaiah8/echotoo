// src/components/ui/RSVPListDrawer.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import FollowButton from "./FollowButton";
import Avatar from "./Avatar";
import { useNavigate } from "react-router-dom";

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
  onRSVPChange?: () => void; // Callback to notify parent of RSVP changes
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
            console.log(
              "🔍 RSVPListDrawer - Current user profile:",
              profileData
            );
            setCurrentUserProfile(profileData);
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
      const { data: rsvpData, error } = await supabase
        .from("rsvp_responses")
        .select("id, user_id, status")
        .eq("post_id", postId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(
          `[RSVPListDrawer] Error loading RSVPs for post ${postId}:`,
          error
        );
        setRsvpUsers([]);
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

      // Always include the creator as "going" if they exist
      const allUsers = [...users];

      // Always add creator if they exist and aren't already in the list
      if (postAuthor) {
        const creatorExists = users.find((u) => u.id === postAuthor.id);
        console.log("- creatorExists:", creatorExists);

        if (!creatorExists) {
          console.log("- Adding creator to list");
          allUsers.unshift({
            id: postAuthor.id,
            username: postAuthor.username || null,
            display_name: postAuthor.display_name || null,
            avatar_url: postAuthor.avatar_url || null,
            status: "going",
            created_at: "", // Creator doesn't have a created_at for RSVP
          });
        } else {
          console.log("- Creator already exists in list");
        }
      } else {
        console.log("- No postAuthor provided!");
      }

      console.log("- Final allUsers:", allUsers);
      console.log("- allUsers.length:", allUsers.length);
      setRsvpUsers(allUsers);

      // Check current user's RSVP status - need to check ALL statuses, not just what's in users array
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
          currentUser.id === postAuthor.id
        ) {
          setCurrentUserRsvp("going"); // Creator is automatically "going"
        } else {
          setCurrentUserRsvp(currentUserRsvpData?.status || null);
        }
      }
    } catch (error) {
      console.error("Error loading RSVPs:", error);
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
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) return;

      // Use proper upsert with onConflict to handle the unique constraint
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
        return;
      }

      // console.log("- RSVP response successful, reloading RSVPs");
      // Reload RSVPs
      loadRSVPs();

      // Notify parent component of RSVP change
      onRSVPChange?.();
    } catch (error) {
      console.error("Error updating RSVP:", error);
    }
  };

  if (!open) return null;

  // If post is anonymous, don't show RSVP list
  if (postAuthor?.is_anonymous) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-[var(--surface)]/60"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }}
      />

      {/* sheet */}
      <div className="absolute left-0 right-0 bottom-0 rounded-t-2xl bg-[var(--surface)] border-t border-[var(--border)] p-3 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3">
          <div className="text-lg font-semibold">RSVP List</div>
          <button
            className="text-sm text-[var(--text)]/70"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onClose();
            }}
          >
            Close
          </button>
        </div>

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
            <div className="text-sm font-medium mb-3">RSVP</div>
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
                  : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:bg-white/10"
              }`}
            >
              {currentUserRsvp === "going" ? "You've RSVP'd ✓" : "RSVP"}
            </button>
          </div>
        )}

        {!loading && (rsvpUsers.length > 0 || postAuthor) && (
          <div className="space-y-2">
            {/* All RSVP'd users in simple list format */}
            {rsvpUsers.map((user) => {
              const isCurrentUser = currentUser && user.id === currentUser.id;
              const displayUser =
                isCurrentUser && currentUserProfile ? currentUserProfile : user;
              const hasRsvpd = currentUserRsvp === "going";

              // Hide current user if they haven't RSVP'd (unless they're the creator)
              if (
                isCurrentUser &&
                !hasRsvpd &&
                (!postAuthor || currentUser.id !== postAuthor.id)
              ) {
                return null;
              }

              return (
                <div
                  key={user.id}
                  className={`flex items-center gap-3 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] cursor-pointer hover:bg-[var(--surface)]/50 transition-colors ${
                    isCurrentUser && !hasRsvpd ? "opacity-50" : ""
                  }`}
                  onClick={() =>
                    !isCurrentUser &&
                    navigate(`/u/${displayUser.username || displayUser.id}`)
                  }
                >
                  <Avatar
                    url={displayUser.avatar_url || undefined}
                    name={displayUser.display_name || "User"}
                    size={36}
                    variant={
                      displayUser.id === postAuthor?.id &&
                      postAuthor?.is_anonymous
                        ? "anon"
                        : "default"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-tight truncate">
                      {displayUser.display_name || "Unnamed"}
                    </div>
                    <div className="text-xs text-[var(--text)]/60 truncate">
                      @{displayUser.username || "user"}
                    </div>
                  </div>
                  {isCurrentUser ? (
                    <div className="px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                      It's you, silly! 😄
                    </div>
                  ) : (
                    <FollowButton targetId={user.id} className="ml-2" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
