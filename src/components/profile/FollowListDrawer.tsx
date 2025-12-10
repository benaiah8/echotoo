import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import FollowButton from "../ui/FollowButton";
import { useNavigate } from "react-router-dom";
import CachedAvatar from "../ui/CachedAvatar";
import { getViewerId, getBatchFollowStatuses } from "../../api/services/follows";
import { setCachedFollowStatus } from "../../lib/followCache";
import { getCachedProfile, setCachedProfile } from "../../lib/profileCache";

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
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // followers: rows where following_id = profileId (who follows me)
      // following: rows where follower_id  = profileId (who I follow)
      const isFollowers = mode === "followers";

      // Parallel: Load follows and viewer ID simultaneously
      const [followResult, viewerProfileId] = await Promise.all([
        supabase
          .from("follows")
          .select(isFollowers ? "follower_id" : "following_id")
          .eq(isFollowers ? "following_id" : "follower_id", profileId)
          .order("created_at", { ascending: false })
          .range(from, to),
        getViewerId(), // Get viewer ID in parallel
      ]);

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

      // Pre-populate follow cache for instant button updates
      if (viewerProfileId && allProfiles.length > 0) {
        // Filter out self from the list
        const otherProfiles = allProfiles.filter(
          (p) => p.id !== viewerProfileId
        );

        if (otherProfiles.length > 0) {
          // Batch check follow statuses for all users in the list
          // This is much more efficient than checking one by one
          const targetIds = otherProfiles.map((p) => p.id);
          getBatchFollowStatuses(viewerProfileId, targetIds)
            .then((statuses) => {
              // Cache all the statuses
              Object.entries(statuses).forEach(([targetId, status]) => {
                setCachedFollowStatus(viewerProfileId, targetId, status);
              });
            })
            .catch((error) => {
              console.error("Error batch checking follow statuses:", error);
            });
        }
      }

      // Progressive rendering: show first 5 items immediately, then rest progressively
      setLoadedItems([]); // Reset
      allProfiles.forEach((profile, index) => {
        // Show first 5 items immediately, then stagger the rest
        const delay = index < 5 ? 0 : (index - 5) * 30; // 30ms delay for items after first 5
        setTimeout(() => {
          setLoadedItems((prev) => {
            // Avoid duplicates
            if (prev.find((p) => p.id === profile.id)) return prev;
            return [...prev, profile];
          });
        }, delay);
      });

      setLoading(false);
    })();
  }, [open, page, profileId, mode]);

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
          {loadedItems.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] cursor-pointer"
              onClick={() => {
                navigate(`/u/${u.username || u.id}`);
                onClose(); // Close the drawer when navigating
              }}
            >
              {/* avatar */}
              <CachedAvatar
                profileId={u.id}
                avatarUrl={u.avatar_url}
                className="w-9 h-9 rounded-full object-cover"
                alt={`${u.display_name || "User"} profile picture`}
              />

              {/* names */}
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-tight truncate">
                  {u.display_name || "Unnamed"}
                </div>
                <div className="text-xs text-[var(--text)]/60 truncate">
                  @{u.username || "user"}
                </div>
              </div>

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
            </li>
          ))}
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
    </div>
  );
}
