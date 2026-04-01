import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import { sendInvites } from "../../api/services/invites";
import {
  getViewerAuthUserId,
  getProfileIdByUserId,
  getViewerId,
  getBatchFollowStatuses,
} from "../../api/services/follows";
import Avatar from "./Avatar";
import BottomDrawer from "./BottomDrawer";
import DrawerProfileCard from "./DrawerProfileCard";
import toast from "react-hot-toast";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  postType: "experience" | "hangout";
  postCaption: string;
  onClosingChange?: (isClosing: boolean) => void; // NEW: callback to notify parent of closing state
};

type User = {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_following?: boolean;
};

export default function InviteDrawer({
  isOpen,
  onClose,
  postId,
  postType,
  postCaption,
  onClosingChange,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedUsersData, setSelectedUsersData] = useState<User[]>([]);
  const [showFollowersOnly, setShowFollowersOnly] = useState(false);
  const [followers, setFollowers] = useState<User[]>([]);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closingRef = useRef(false);
  /** Viewer profile ID resolved once per drawer load; used for batch follow status and self check */
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  /** Batched follow statuses keyed by profile id; avoids per-row getFollowStatus */
  const [batchedFollowStatuses, setBatchedFollowStatuses] = useState<
    Record<string, "none" | "pending" | "following" | "friends">
  >({});

  // Load followers when component mounts
  const loadFollowers = async () => {
    try {
      const userId = await getViewerAuthUserId();
      if (!userId) return;

      // [PHASE 2.3 - OPTIMIZATION] Use getProfileIdByUserId() for caching and deduplication
      // Why: Centralizes profile fetching, reduces duplicate profiles?select=id requests
      const profileId = await getProfileIdByUserId(userId);

      if (!profileId) {
        console.error("Failed to get current user profile: Profile not found");
        return;
      }

      // Get all users who follow the current user
      // follows table: follower_id follows following_id
      // So we want: follower_id where following_id = current user's profile id
      const { data: followsData, error: followsError } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("following_id", profileId);

      if (followsError) {
        console.error("Failed to load followers:", followsError);
        return;
      }

      if (!followsData || followsData.length === 0) {
        setFollowers([]);
        return;
      }

      // Get profile details for all followers
      const followerProfileIds = followsData.map((f) => f.follower_id);
      const { data: followersData, error: followersError } = await supabase
        .from("profiles")
        .select("id, user_id, username, display_name, avatar_url")
        .in("id", followerProfileIds);

      if (followersError) {
        console.error("Failed to load follower profiles:", followersError);
        return;
      }

      setFollowers(followersData || []);
    } catch (error) {
      console.error("Failed to load followers:", error);
    }
  };

  // Load users based on search query
  const loadUsers = async () => {
    if (!searchQuery.trim()) {
      if (showFollowersOnly) {
        setUsers(followers);
      } else {
        setUsers([]);
      }
      return;
    }

    setLoading(true);
    try {
      // Get current user
      const userId = await getViewerAuthUserId();
      if (!userId) return;

      // Search both username and display_name
      let query = supabase
        .from("profiles")
        .select("id, user_id, username, display_name, avatar_url")
        .neq("user_id", userId) // Exclude current user - use userId from getViewerAuthUserId()
        .or(
          `username.ilike.%${searchQuery}%,display_name.ilike.%${searchQuery}%`
        );

      if (showFollowersOnly) {
        // Filter to only show followers
        const followerUserIds = followers.map((f) => f.user_id);
        if (followerUserIds.length > 0) {
          query = query.in("user_id", followerUserIds);
        } else {
          query = query.limit(0); // No followers to show
        }
      }

      const { data, error } = await query.limit(20);

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(loadUsers, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, showFollowersOnly, followers]);

  // Load followers when component mounts
  useEffect(() => {
    if (isOpen) {
      loadFollowers();
    }
  }, [isOpen]);

  // Batch load follow statuses once when we have rows to show (one viewer resolve + one batch call per list load)
  useEffect(() => {
    const list = users.length > 0 ? users : [];
    if (list.length === 0) {
      setBatchedFollowStatuses({});
      return;
    }
    let cancelled = false;
    (async () => {
      const vid =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("my_profile_id")
          : null;
      const resolvedViewerId = vid || (await getViewerId());
      if (cancelled || !resolvedViewerId) {
        if (!resolvedViewerId) setViewerProfileId(null);
        setBatchedFollowStatuses({});
        return;
      }
      setViewerProfileId(resolvedViewerId);
      const targetProfileIds = list.map((u) => u.id);
      const statuses = await getBatchFollowStatuses(
        resolvedViewerId,
        targetProfileIds
      );
      if (!cancelled) setBatchedFollowStatuses(statuses);
    })();
    return () => {
      cancelled = true;
    };
  }, [users]);

  // Notify parent of closing state changes and set global flag
  useEffect(() => {
    closingRef.current = isClosing;
    onClosingChange?.(isClosing);

    // Set global flag to prevent navigation
    if (isOpen || isClosing) {
      (window as any).__inviteDrawerActive = true;
    } else {
      (window as any).__inviteDrawerActive = false;
    }

    // [FIX] Cleanup on unmount to ensure flag is never stuck
    return () => {
      if ((window as any).__inviteDrawerActive) {
        (window as any).__inviteDrawerActive = false;
      }
    };
  }, [isClosing, onClosingChange, isOpen]);

  const handleUserSelect = (userId: string) => {
    setSelectedUsers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
        // Remove from selectedUsersData
        setSelectedUsersData((prevData) =>
          prevData.filter((u) => u.user_id !== userId)
        );
      } else {
        newSet.add(userId);
        // Add to selectedUsersData (avoid duplicates)
        const allUsers = [...users, ...followers];
        const user = allUsers.find((u) => u.user_id === userId);
        if (user) {
          setSelectedUsersData((prevData) => {
            // Check if user already exists to avoid duplicates
            if (prevData.some((u) => u.user_id === userId)) {
              return prevData;
            }
            return [...prevData, user];
          });
        }
      }
      return newSet;
    });
  };

  const handleSelectAllFollowers = () => {
    if (showFollowersOnly && followers.length > 0) {
      const allFollowerIds = new Set(followers.map((f) => f.user_id));
      const currentlySelected = new Set(selectedUsers);

      // If all followers are selected, deselect all
      if (followers.every((f) => currentlySelected.has(f.user_id))) {
        setSelectedUsers(new Set());
        setSelectedUsersData([]);
      } else {
        // Select all followers
        setSelectedUsers(allFollowerIds);
        setSelectedUsersData(followers);
      }
    }
  };

  const handleSendInvites = async () => {
    if (selectedUsers.size === 0) return;

    setSendingInvites(true);
    try {
      const { data, error, alreadyInvited } = await sendInvites(
        postId,
        Array.from(selectedUsers)
      );

      if (error) {
        throw error;
      }

      // Show success message with details about already invited users
      const newInvitesCount = data?.length || 0;
      const alreadyInvitedCount = alreadyInvited?.length || 0;

      if (newInvitesCount > 0 && alreadyInvitedCount > 0) {
        toast.success(
          `Invites sent to ${newInvitesCount} users. ${alreadyInvitedCount} users were already invited.`
        );
      } else if (newInvitesCount > 0) {
        toast.success(`Invites sent to ${newInvitesCount} users!`);
      } else if (alreadyInvitedCount > 0) {
        toast.success(`All selected users were already invited to this post.`);
      } else {
        toast.success("Invites sent!");
      }

      // Close drawer and reset state
      setIsClosing(true);
      closingRef.current = true;
      onClose();
      setSelectedUsers(new Set());
      setSelectedUsersData([]);
      setSearchQuery("");
      // Keep isClosing true for a longer period to prevent navigation
      setTimeout(() => {
        setIsClosing(false);
        closingRef.current = false;
      }, 1000);
    } catch (error) {
      console.error("Failed to send invites:", error);
      toast.error("Failed to send invites");
    } finally {
      setSendingInvites(false);
    }
  };

  // Handle close with closing state
  const handleClose = () => {
    setIsClosing(true);
    closingRef.current = true;
    onClose();
    setTimeout(() => {
      setIsClosing(false);
      closingRef.current = false;
    }, 500);
  };

  return (
    <BottomDrawer
      open={isOpen}
      onClose={handleClose}
      title="Invite People"
      maxHeight="80vh"
    >
      {/* Subtitle */}
      <p className="text-xs text-[var(--text)]/60 truncate mb-4 -mt-2">
        {postType === "hangout" ? "Hangout" : "Experience"}:{" "}
        {postCaption || "Untitled"}
      </p>

      {/* Search and Filters */}
      <div
        className="mb-4 pb-4 border-b border-[var(--border)]"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onFocus={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            className="w-full px-4 py-2 pl-10 bg-[var(--surface)] border border-[var(--border)] rounded-full text-sm text-[var(--text)] placeholder-[var(--text)]/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text)]/50">
            🔍
          </div>
        </div>

        {/* Followers Toggle and Select All */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text)]/60">Followers</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowFollowersOnly(!showFollowersOnly);
              }}
              className={`relative w-8 h-4 rounded-full transition-colors ${
                showFollowersOnly
                  ? "bg-yellow-400"
                  : "bg-[var(--surface)] border border-[var(--border)]"
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                  showFollowersOnly ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {showFollowersOnly && followers.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleSelectAllFollowers();
              }}
              className="px-3 py-1 text-xs bg-[var(--surface)] text-[var(--text)] rounded-full border border-[var(--border)] hover:bg-[var(--surface)]/80 transition"
            >
              {followers.every((f) => selectedUsers.has(f.user_id))
                ? "Deselect All"
                : "Select All"}
            </button>
          )}
        </div>
      </div>

      {/* User List */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: "40vh" }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        {loading ? (
          <div className="p-4 text-center text-xs text-[var(--text)]/60">
            Searching...
          </div>
        ) : users.length === 0 ? (
          <div className="p-4 text-center text-xs text-[var(--text)]/60">
            {searchQuery
              ? "No users found matching your search"
              : "Search by name or username to find users to invite"}
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {users.map((user) => (
              <DrawerProfileCard
                key={user.id}
                id={user.id}
                username={user.username || null}
                display_name={user.display_name || null}
                avatar_url={user.avatar_url || null}
                followStatus={
                  batchedFollowStatuses[user.id] ??
                  (user.id === viewerProfileId ? "self" : "none")
                }
                onClick={(e) => {
                  e?.stopPropagation?.();
                  handleUserSelect(user.user_id);
                }}
                showFollowButton={true}
                showCustomBadge={
                  selectedUsers.has(user.user_id) ? (
                    <div className="w-5 h-5 rounded-full border-2 bg-primary border-primary flex items-center justify-center text-black text-[10px]">
                      ✓
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        {/* Selected People Display */}
        {selectedUsers.size > 0 && (
          <div className="mb-3">
            <div className="text-sm text-[var(--text)]/60 mb-2">
              {selectedUsers.size} user{selectedUsers.size === 1 ? "" : "s"}{" "}
              selected
            </div>
            <div className="flex items-center gap-1 overflow-x-auto">
              {selectedUsersData.slice(0, 5).map((user) => (
                <div key={user.user_id} className="flex-shrink-0 relative">
                  <Avatar
                    url={user.avatar_url || undefined}
                    name={user.display_name || user.username || ""}
                    size={24}
                  />
                </div>
              ))}
              {selectedUsers.size > 5 && (
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-xs text-[var(--text)]/60">
                  +{selectedUsers.size - 5}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleClose();
            }}
            className="flex-1 px-3 py-2 bg-[var(--surface)] text-sm text-[var(--text)] rounded-full border border-[var(--border)] hover:bg-[var(--surface)]/80 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSendInvites}
            disabled={selectedUsers.size === 0 || sendingInvites}
            className="flex-1 px-3 py-2 bg-yellow-400 text-sm text-black rounded-full font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-500 transition"
          >
            {sendingInvites
              ? "Sending..."
              : `Send Invite${selectedUsers.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </BottomDrawer>
  );
}
