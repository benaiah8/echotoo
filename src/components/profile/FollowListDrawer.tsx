import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import {
  getViewerId,
  getViewerAuthUserId,
  removeFollower,
} from "../../api/services/follows";
import {
  setCachedFollowStatus,
  clearCachedFollowStatus,
} from "../../lib/followStatusCache";
import { getCachedProfile, setCachedProfile } from "../../lib/profileCache";
import { PiDotsThreeVertical } from "react-icons/pi";
import { toast } from "react-hot-toast";
import DrawerProfileCard from "../ui/DrawerProfileCard";
import BottomDrawer from "../ui/BottomDrawer";
import ConfirmBottomDrawer from "../ui/ConfirmBottomDrawer";

type Props = {
  open: boolean;
  onClose: () => void;
  profileId: string; // whose list we’re showing
  mode: "followers" | "following";
};

type Row = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  /** viewer_follow_status from get_follow_list_with_profiles; passed to FollowButton to avoid per-row getFollowStatus */
  followStatus?: "none" | "pending" | "following" | "friends" | "self";
};

export default function FollowListDrawer({
  open,
  onClose,
  profileId,
  mode,
}: Props) {
  const navigate = useNavigate();

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;
  const [hasMore, setHasMore] = useState(true);
  const [loadedItems, setLoadedItems] = useState<Row[]>([]); // Progressive rendering
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  const [isAccountPrivate, setIsAccountPrivate] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(
    null
  );
  const [removingId, setRemovingId] = useState<string | null>(null);
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  // [OPTIMIZATION: Pass B - StrictMode Guard] Prevent duplicate RPC calls in dev StrictMode
  const inFlightKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setLoadedItems([]); // Reset progressive items
    setPage(0);
    setHasMore(true);
  }, [open, profileId, mode]);

  useEffect(() => {
    if (!open) return;

    // [OPTIMIZATION: Pass B - StrictMode Guard] Prevent duplicate RPC calls
    // Compute unique request key for this fetch
    const requestKey = `${profileId}-${mode}-${page}`;

    // Guard: Skip if same request is already in progress (prevents StrictMode double-calls)
    if (inFlightKeyRef.current === requestKey) {
      return;
    }

    // Mark this request as in-flight
    inFlightKeyRef.current = requestKey;

    (async () => {
      try {
        setLoading(true);

        // [OPTIMIZATION: Phase 4 - Cache] Show cached counts instantly when drawer opens
        // Why: Instant display of counts, better perceived performance
        const { getCachedFollowCounts } = await import(
          "../../lib/followCountsCache"
        );
        const cachedCounts = getCachedFollowCounts(profileId);
        if (cachedCounts) {
          // Counts are already cached, drawer will show them instantly
          // No need to wait for fresh fetch
        }

        // Compute pagination parameters
        const limit = PAGE_SIZE;
        const offset = page * PAGE_SIZE;

        // Get viewer IDs (both profile ID and auth user ID)
        // Profile ID is needed for UI logic (e.g., checking if viewer is owner)
        // Auth user ID is needed for the RPC call
        const [viewerProfileId, viewerAuthUserId] = await Promise.all([
          getViewerId(),
          getViewerAuthUserId(),
        ]);

        setViewerProfileId(viewerProfileId);

        // [PHASE 2.3 - OPTIMIZATION] Check cache first for profile privacy status
        // Why: Avoids unnecessary query if profile is already cached
        const cachedProfile = getCachedProfile(profileId);
        const isPrivateFromCache = cachedProfile?.is_private === true;

        // Only query profile privacy if not cached
        let profileData;
        if (!cachedProfile) {
          const result = await supabase
            .from("profiles")
            .select("id, is_private")
            .eq("id", profileId)
            .maybeSingle();
          profileData = result;
        }

        // Use cache value if available, otherwise use query result
        setIsAccountPrivate(
          isPrivateFromCache || profileData?.data?.is_private === true
        );

        // [OPTIMIZATION: Pass B] Single RPC call replaces multiple queries
        // Replaces: follows.select() + profiles.in() + getBatchFollowStatuses()
        const { data, error } = await supabase.rpc(
          "get_follow_list_with_profiles",
          {
            p_profile_id: profileId,
            p_mode: mode, // "followers" | "following"
            p_viewer_user_id: viewerAuthUserId ?? null,
            p_limit: limit,
            p_offset: offset,
          }
        );

        if (error) {
          console.error("Error fetching follow list:", error);
          setLoading(false);
          // Don't return early - let finally block clear the in-flight flag
          return;
        }

        // Parse RPC response (handles both array and object formats)
        const payload = Array.isArray(data) ? data[0] : data;
        const users = payload?.users ?? [];
        const count = payload?.count ?? users.length;

        // Update pagination state
        setHasMore(users.length >= limit);

        // Map RPC response to existing Row[] type (include viewer_follow_status for FollowButton)
        const mappedProfiles: Row[] = users.map((user: any) => {
          const raw = user.viewer_follow_status;
          const followStatus: Row["followStatus"] =
            raw === "self" ||
            raw === "none" ||
            raw === "pending" ||
            raw === "following" ||
            raw === "friends"
              ? raw
              : "none";
          return {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            followStatus,
          };
        });

        // Cache profiles for future use
        users.forEach((user: any) => {
          setCachedProfile({
            id: user.id,
            user_id: user.user_id || "",
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            bio: null,
            xp: null,
            member_no: null,
            instagram_url: null,
            tiktok_url: null,
            telegram_url: null,
          });
        });

        // Update follow status cache from RPC response
        // RPC returns viewer_follow_status for each user, which we cache for FollowButton
        if (viewerProfileId && users.length > 0) {
          users.forEach((user: any) => {
            // Skip self
            if (user.id === viewerProfileId) return;

            // Map RPC follow status to cache format
            // RPC returns: "none" | "pending" | "following" | "friends" | "self"
            // Cache expects: "none" | "pending" | "following" | "friends"
            const status =
              user.viewer_follow_status === "self"
                ? "none"
                : user.viewer_follow_status;

            setCachedFollowStatus(viewerProfileId, user.id, status);
          });
        }

        // [OPTIMIZATION: Phase 4 - Performance] Progressive rendering: show first 10 items immediately, then rest progressively
        // Why: Faster perceived performance, users see more content immediately
        if (page === 0) {
          setLoadedItems([]); // Reset on first page
        }

        // Get current total count for progressive rendering index calculation (before updating items)
        const currentTotalCount = page === 0 ? 0 : items.length;

        mappedProfiles.forEach((profile, index) => {
          // [OPTIMIZATION: Phase 5 - Rendering] Use requestAnimationFrame for smoother progressive rendering
          // Why: Smoother animations, better performance, prevents layout thrashing
          const globalIndex = currentTotalCount + index;
          if (globalIndex < 10) {
            // First 10 items immediately
            requestAnimationFrame(() => {
              setLoadedItems((prev) => {
                if (prev.find((p) => p.id === profile.id)) return prev;
                return [...prev, profile];
              });
            });
          } else {
            // Stagger remaining items with requestAnimationFrame for smoother rendering
            const frameDelay = Math.floor((globalIndex - 10) / 2); // Every 2 items per frame
            requestAnimationFrame(() => {
              setTimeout(() => {
                requestAnimationFrame(() => {
                  setLoadedItems((prev) => {
                    if (prev.find((p) => p.id === profile.id)) return prev;
                    return [...prev, profile];
                  });
                });
              }, frameDelay * 8); // 8ms per frame delay (reduced from 15ms)
            });
          }
        });

        // Store all items (append for pagination)
        setItems((prev) => {
          if (page === 0) {
            // First page: replace all items
            return mappedProfiles;
          } else {
            // Subsequent pages: append new items (avoid duplicates)
            const map = new Map<string, Row>(prev.map((x) => [x.id, x]));
            for (const p of mappedProfiles) {
              map.set(p.id, p);
            }
            return Array.from(map.values());
          }
        });

        setLoading(false);
      } catch (error) {
        console.error("Error in FollowListDrawer fetch:", error);
        setLoading(false);
      } finally {
        // [OPTIMIZATION: Pass B - StrictMode Guard] Clear in-flight flag when done
        // Only clear if this is still the current request (prevents race conditions)
        if (inFlightKeyRef.current === requestKey) {
          inFlightKeyRef.current = null;
        }
      }
    })();
  }, [open, page, profileId, mode]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openMenuId) {
        const menuRef = menuRefs.current[openMenuId];
        if (menuRef && !menuRef.contains(event.target as Node)) {
          setOpenMenuId(null);
        }
      }
    };

    if (openMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openMenuId]);

  // Check if we should show the three-dot menu for a user
  const shouldShowMenu = (userId: string): boolean => {
    return (
      mode === "followers" && isAccountPrivate && viewerProfileId === profileId // Viewer is the owner
    );
  };

  const handleRemoveFollower = async (followerId: string) => {
    if (removingId) return; // Prevent double-clicks

    setRemovingId(followerId);
    try {
      const { error } = await removeFollower(followerId);
      if (error) {
        toast.error("Failed to remove follower");
        return;
      }

      // Update list immediately
      setItems((prev) => prev.filter((x) => x.id !== followerId));
      setLoadedItems((prev) => prev.filter((x) => x.id !== followerId));

      // Update follow status cache - they're no longer an approved follower
      // Note: If we also follow them (mutual follow), that relationship is unchanged
      // Only the relationship where they follow us is affected
      if (viewerProfileId) {
        // Clear the cache so it refreshes on next check
        clearCachedFollowStatus(followerId);
        // Also update the reverse relationship cache if we follow them
        // This ensures the follow button shows correct state
        clearCachedFollowStatus(viewerProfileId);
      }

      toast.success("Follower removed");
      setShowRemoveConfirm(null);
    } catch (error) {
      console.error("Failed to remove follower:", error);
      toast.error("Failed to remove follower");
    } finally {
      setRemovingId(null);
    }
  };

  // Live refresh when the underlying follow rows for this profile change
  useEffect(() => {
    if (!open) return;

    const filter =
      mode === "followers"
        ? `following_id=eq.${profileId}`
        : `follower_id=eq.${profileId}`;

    const channel = supabase
      .channel(`follow-drawer:${mode}:${profileId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "follows", filter },
        () => {
          // re-fetch from the start
          setItems([]);
          setPage(0);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "follows", filter },
        () => {
          setItems([]);
          setPage(0);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, profileId, mode]);

  return (
    <>
      <BottomDrawer
        open={open}
        onClose={onClose}
        title={mode === "followers" ? "Followers" : "Following"}
        maxHeight="80vh"
      >
        {items.length === 0 && !loading && (
          <div className="text-sm text-[var(--text)]/60 py-6 text-center">
            {mode === "followers"
              ? "No followers yet."
              : "Not following anyone yet."}
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {loadedItems.map((u) => {
            const showMenu = shouldShowMenu(u.id);
            const isMenuOpen = openMenuId === u.id;
            const isRemoving = removingId === u.id;

            return (
              <li key={u.id}>
                <DrawerProfileCard
                  id={u.id}
                  username={u.username}
                  display_name={u.display_name}
                  avatar_url={u.avatar_url}
                  followStatus={u.followStatus}
                  onClick={() => {
                    navigate(`/u/${u.username || u.id}`);
                    onClose(); // Close the drawer when navigating
                  }}
                  showFollowButton={true}
                  onFollowChange={(nowFollowing) => {
                    // If we're showing the "following" list and the viewer unfollows,
                    // remove that row from the list so it reflects reality immediately.
                    if (mode === "following" && !nowFollowing) {
                      setItems((prev) => prev.filter((x) => x.id !== u.id));
                      setLoadedItems((prev) =>
                        prev.filter((x) => x.id !== u.id)
                      );
                    }
                    // If this is the "followers" list, we don't remove on follow/unfollow,
                    // because it's about who follows *me*, not who I follow.
                  }}
                  customActions={
                    showMenu ? (
                      <div
                        ref={(el) => {
                          menuRefs.current[u.id] = el;
                        }}
                        className="relative"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(isMenuOpen ? null : u.id);
                          }}
                          className="p-1 rounded-full hover:bg-[var(--surface)]/50 transition-colors"
                          aria-label="More options"
                        >
                          <PiDotsThreeVertical
                            size={18}
                            className="text-[var(--text)]/70"
                          />
                        </button>

                        {/* Dropdown menu */}
                        {isMenuOpen && (
                          <div className="absolute right-0 top-8 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                setShowRemoveConfirm(u.id);
                              }}
                              disabled={isRemoving}
                              className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    ) : undefined
                  }
                />
              </li>
            );
          })}
        </ul>

        {hasMore && (
          <div className="mt-3">
            <button
              disabled={loading}
              onClick={() => setPage((p) => p + 1)}
              className="w-full ui-btn text-xs rounded-xl"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </BottomDrawer>

      {/* Remove confirmation drawer - Higher z-index to appear above FollowListDrawer */}
      <ConfirmBottomDrawer
        open={!!showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(null)}
        onConfirm={() => {
          if (showRemoveConfirm) handleRemoveFollower(showRemoveConfirm);
        }}
        title="Remove Follower"
        message="Are you sure you want to remove this person? They will lose access to your private account."
        confirmLabel="Remove"
        confirmVariant="danger"
        isLoading={!!removingId}
        higherZIndex={true}
      />
    </>
  );
}
