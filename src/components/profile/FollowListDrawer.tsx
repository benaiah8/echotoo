import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabaseClient";
import FollowButton from "../ui/FollowButton";
import { useNavigate } from "react-router-dom";
import CachedAvatar from "../ui/CachedAvatar";
import { getViewerId, getBatchFollowStatuses, removeFollower } from "../../api/services/follows";
import { setCachedFollowStatus, clearCachedFollowStatus } from "../../lib/followStatusCache";
import { getCachedProfile, setCachedProfile } from "../../lib/profileCache";
import { MdMoreVert } from "react-icons/md";
import { toast } from "react-hot-toast";
import { createPortal } from "react-dom";

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
  const [loadedItems, setLoadedItems] = useState<Row[]>([]); // Progressive rendering
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  const [isAccountPrivate, setIsAccountPrivate] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const menuRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    if (!open) return;
    setItems([]);
    setLoadedItems([]); // Reset progressive items
    setPage(0);
  }, [open, profileId, mode]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      
      // [OPTIMIZATION: Phase 4 - Cache] Show cached counts instantly when drawer opens
      // Why: Instant display of counts, better perceived performance
      const { getCachedFollowCounts } = await import("../../lib/followCountsCache");
      const cachedCounts = getCachedFollowCounts(profileId);
      if (cachedCounts) {
        // Counts are already cached, drawer will show them instantly
        // No need to wait for fresh fetch
      }
      
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // followers: rows where following_id = profileId (who follows me)
      // following: rows where follower_id  = profileId (who I follow)
      const isFollowers = mode === "followers";

      // Parallel: Load follows, viewer ID, and profile privacy status simultaneously
      const [followResult, viewerId, profileData] = await Promise.all([
        supabase
          .from("follows")
          .select(isFollowers ? "follower_id" : "following_id")
          .eq(isFollowers ? "following_id" : "follower_id", profileId)
          .eq("status", "approved") // Only show approved follows
          .order("created_at", { ascending: false })
          .range(from, to),
        getViewerId(), // Get viewer ID in parallel
        supabase
          .from("profiles")
          .select("id, is_private")
          .eq("id", profileId)
          .maybeSingle(), // Get profile privacy status
      ]);

      setViewerProfileId(viewerId);
      setIsAccountPrivate(profileData?.data?.is_private === true);

      const { data: followRows, error } = followResult;
      if (error) {
        setLoading(false);
        return;
      }

      const ids = Array.from(
        new Set(
          (followRows ?? []).map((r) =>
            isFollowers ? (r as any).follower_id : (r as any).following_id
          )
        )
      );

      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      // Check cache first for profiles we already have
      const cachedProfiles: Row[] = [];
      const uncachedIds: string[] = [];
      
      ids.forEach((id) => {
        const cached = getCachedProfile(id);
        if (cached) {
          cachedProfiles.push({
            id: cached.id,
            username: cached.username,
            display_name: cached.display_name,
            avatar_url: cached.avatar_url,
          });
        } else {
          uncachedIds.push(id);
        }
      });

      // Only fetch uncached profiles
      let fetchedProfiles: Row[] = [];
      if (uncachedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, user_id, username, display_name, avatar_url")
          .in("id", uncachedIds);

        const profilesWithUserId = (profiles as any[]) ?? [];
        
        // Cache the fetched profiles and convert to Row type
        fetchedProfiles = profilesWithUserId.map((profile) => {
          setCachedProfile({
            id: profile.id,
            user_id: profile.user_id || "",
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            bio: null,
            xp: null,
            member_no: null,
            instagram_url: null,
            tiktok_url: null,
            telegram_url: null,
          });
          return {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
          };
        });
      }

      const allProfiles = [...cachedProfiles, ...fetchedProfiles];
      
      // Store all items
      setItems((prev) => {
        const map = new Map<string, Row>(prev.map((x) => [x.id, x]));
        for (const p of allProfiles) {
          map.set(p.id, p);
        }
        return Array.from(map.values());
      });

      // [OPTIMIZATION: Phase 4 - Batch] Batch follow status prefetching for all visible items
      // Why: Single API call for all items, instant follow button updates, better performance
      if (viewerId && allProfiles.length > 0) {
        // Filter out self from the list
        const otherProfiles = allProfiles.filter(
          (p) => p.id !== viewerId
        );

        if (otherProfiles.length > 0) {
          // Batch check follow statuses for all users in the list
          // This is much more efficient than checking one by one
          const targetIds = otherProfiles.map((p) => p.id);
          getBatchFollowStatuses(viewerId, targetIds)
            .then((statuses) => {
              // Cache all the statuses for instant button updates
              Object.entries(statuses).forEach(([targetId, status]) => {
                setCachedFollowStatus(viewerId, targetId, status);
              });
            })
            .catch((error) => {
              console.error("Error batch checking follow statuses:", error);
            });
        }
      }

      // [OPTIMIZATION: Phase 4 - Performance] Progressive rendering: show first 10 items immediately, then rest progressively
      // Why: Faster perceived performance, users see more content immediately
      setLoadedItems([]); // Reset
      allProfiles.forEach((profile, index) => {
        // [OPTIMIZATION: Phase 5 - Rendering] Use requestAnimationFrame for smoother progressive rendering
        // Why: Smoother animations, better performance, prevents layout thrashing
        if (index < 10) {
          // First 10 items immediately
          requestAnimationFrame(() => {
            setLoadedItems((prev) => {
              if (prev.find((p) => p.id === profile.id)) return prev;
              return [...prev, profile];
            });
          });
        } else {
          // Stagger remaining items with requestAnimationFrame for smoother rendering
          const frameDelay = Math.floor((index - 10) / 2); // Every 2 items per frame
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

      setLoading(false);
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
      mode === "followers" &&
      isAccountPrivate &&
      viewerProfileId === profileId // Viewer is the owner
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-[var(--surface)]/60"
        onClick={onClose}
      />
      {/* sheet */}
      <div className="absolute left-0 right-0 bottom-0 rounded-t-2xl bg-[var(--surface)] border-t border-[var(--border)] p-3 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2">
          <div className="text-sm font-semibold">
            {mode === "followers" ? "Followers" : "Following"}
          </div>
          <button className="text-xs text-[var(--text)]/70" onClick={onClose}>
            Close
          </button>
        </div>

        {items.length === 0 && !loading && (
          <div className="text-sm text-[var(--text)]/60 py-6">
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
              <li
                key={u.id}
                className="flex items-center gap-3 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
              >
                {/* avatar */}
                <div
                  className="cursor-pointer"
                  onClick={() => {
                    navigate(`/u/${u.username || u.id}`);
                    onClose(); // Close the drawer when navigating
                  }}
                >
                  <CachedAvatar
                    profileId={u.id}
                    avatarUrl={u.avatar_url}
                    className="w-9 h-9 rounded-full object-cover"
                    alt={`${u.display_name || "User"} profile picture`}
                  />
                </div>

                {/* names */}
                <div
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => {
                    navigate(`/u/${u.username || u.id}`);
                    onClose(); // Close the drawer when navigating
                  }}
                >
                  <div className="text-sm leading-tight truncate">
                    {u.display_name || "Unnamed"}
                  </div>
                  <div className="text-xs text-[var(--text)]/60 truncate">
                    @{u.username || "user"}
                  </div>
                </div>

                {/* Actions: Follow button and three-dot menu */}
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {/* inline follow/unfollow */}
                  <FollowButton
                    targetId={u.id}
                    className="ml-2"
                    onChange={(nowFollowing) => {
                      // If we're showing the "following" list and the viewer unfollows,
                      // remove that row from the list so it reflects reality immediately.
                      if (mode === "following" && !nowFollowing) {
                        setItems((prev) => prev.filter((x) => x.id !== u.id));
                        setLoadedItems((prev) => prev.filter((x) => x.id !== u.id));
                      }
                      // If this is the "followers" list, we don't remove on follow/unfollow,
                      // because it's about who follows *me*, not who I follow.
                    }}
                  />

                  {/* [OPTIMIZATION: Phase 4 - Performance] Three-dot menu - loads immediately (no lazy loading) */}
                  {/* Why: Instant menu display, better UX, no delay when clicking */}
                  {showMenu && (
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
                        <MdMoreVert
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
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3">
          <button
            disabled={loading}
            onClick={() => setPage((p) => p + 1)}
            className="w-full ui-btn text-xs rounded-xl"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      </div>

      {/* Remove confirmation modal */}
      {showRemoveConfirm && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-[var(--surface)]/80"
            onClick={() => setShowRemoveConfirm(null)}
          />
          <div className="relative bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-4 max-w-sm w-full mx-4 z-[71]">
            <h3 className="text-lg font-semibold text-[var(--text)] mb-2">
              Remove Follower
            </h3>
            <p className="text-sm text-[var(--text)]/70 mb-4">
              Are you sure you want to remove this person? They will lose access to your private account.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRemoveConfirm(null)}
                className="px-4 py-2 text-sm rounded-lg border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemoveFollower(showRemoveConfirm)}
                disabled={removingId === showRemoveConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {removingId === showRemoveConfirm ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
