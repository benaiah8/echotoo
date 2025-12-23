import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  searchProfiles,
  type ProfileSearchRow,
} from "../../api/queries/searchProfiles";
import Avatar from "../ui/Avatar";
import FollowButton from "../ui/FollowButton";
import { Link, useNavigate } from "react-router-dom";
import {
  getViewerId,
  getBatchFollowStatuses,
} from "../../api/services/follows";
import {
  getCachedFollowStatus,
  setCachedFollowStatus,
} from "../../lib/followStatusCache";

// [OPTIMIZATION: Phase 6.2 - React] Memoized search result item component
// Why: Prevents unnecessary re-renders when other items in the list change
type ProfileSearchResultItemProps = {
  profile: ProfileSearchRow;
  onNavigate: (slug: string) => void;
  onFollowChange: (profileId: string, nowFollowing: boolean) => void;
  // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded follow status
  followStatus?: "none" | "pending" | "following" | "friends";
};

const ProfileSearchResultItem = React.memo(
  function ProfileSearchResultItem({
    profile,
    onNavigate,
    onFollowChange,
    followStatus,
  }: ProfileSearchResultItemProps) {
    const startY = useRef<number | null>(null);
    const moved = useRef(false);

    const handleClick = () => {
      if (moved.current) return; // treat as scroll, not a click
      const slug = profile.username || profile.id;
      onNavigate(slug);
    };

    return (
      <div
        className="flex items-center gap-3 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] cursor-pointer select-none"
        onMouseDown={(e) => {
          startY.current = e.clientY;
          moved.current = false;
        }}
        onMouseMove={(e) => {
          if (
            startY.current !== null &&
            Math.abs(e.clientY - startY.current) > 6
          ) {
            moved.current = true;
          }
        }}
        onMouseUp={() => {
          startY.current = null;
        }}
        onTouchStart={(e) => {
          startY.current = e.touches[0].clientY;
          moved.current = false;
        }}
        onTouchMove={(e) => {
          if (
            startY.current !== null &&
            Math.abs(e.touches[0].clientY - startY.current) > 6
          ) {
            moved.current = true;
          }
        }}
        onTouchEnd={() => {
          startY.current = null;
        }}
        onClick={handleClick}
      >
        <Link to={`/u/${profile.username || profile.id}`} className="shrink-0">
          <Avatar
            url={profile.avatar_url || undefined}
            name={profile.display_name || profile.username || "User"}
            size={40}
          />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold truncate">
            {profile.display_name || "Unnamed"}
          </div>
          <div className="text-[11px] text-[var(--text)]/60 truncate">
            @{profile.username || "user"}{" "}
            {profile.member_no ? (
              <span className="ml-1 text-[var(--text)]/40">
                • Nº {profile.member_no}
              </span>
            ) : null}
          </div>
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <FollowButton
            targetId={profile.id}
            className="text-[11px] h-6 min-w-[70px] px-2"
            onChange={(nowFollowing) => {
              onFollowChange(profile.id, nowFollowing);
            }}
            followStatus={followStatus}
          />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if profile data changes
    return (
      prevProps.profile.id === nextProps.profile.id &&
      prevProps.profile.username === nextProps.profile.username &&
      prevProps.profile.display_name === nextProps.profile.display_name &&
      prevProps.profile.avatar_url === nextProps.profile.avatar_url &&
      prevProps.profile.member_no === nextProps.profile.member_no &&
      prevProps.profile.you_follow === nextProps.profile.you_follow
    );
  }
);

export default function ProfileSearchResults({
  query,
  viewerId,
  onClose,
}: {
  query: string;
  viewerId?: string | null;
  onClose?: () => void;
}) {
  const [rows, setRows] = useState<ProfileSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  // [OPTIMIZATION: Phase 1 - Batch] Store batched follow statuses
  const [batchedFollowStatuses, setBatchedFollowStatuses] = useState<
    Record<string, "none" | "pending" | "following" | "friends">
  >({});
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const r = await searchProfiles(query, viewerId || undefined);
      if (mounted) setRows(r);
      setLoading(false);

      // [OPTIMIZATION: Phase 1 - Batch] Batch load follow statuses for all search results
      // Why: Single API call instead of individual queries per FollowButton
      if (r.length > 0 && viewerId) {
        (async () => {
          try {
            const currentViewerId = await getViewerId();
            if (!currentViewerId) return;

            // Get all profile IDs from search results
            const profileIds = r.map((profile) => profile.id);

            // Batch fetch all follow statuses at once
            const followStatuses = await getBatchFollowStatuses(
              currentViewerId,
              profileIds
            );

            // Store in state for components to use
            if (mounted) {
              setBatchedFollowStatuses(followStatuses);
            }

            // Also cache all statuses for future use
            Object.entries(followStatuses).forEach(([profileId, status]) => {
              setCachedFollowStatus(currentViewerId, profileId, status);
            });
          } catch (error) {
            console.warn("Failed to batch load follow statuses:", error);
            // Silent fail - components will fall back to individual queries
          }
        })();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [query, viewerId]);

  // re-run search when follow state changes elsewhere
  useEffect(() => {
    const rerun = () => {
      // simply refetch by setting the same query again
      onClose?.(); // if you’d rather close the panel, keep this
      // or trigger a re-fetch without closing:
      // setRows((r) => [...r]);  // (no-op to force render)
    };
    window.addEventListener("follow:changed", rerun);
    return () => window.removeEventListener("follow:changed", rerun);
  }, []);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize callbacks to prevent unnecessary re-renders
  // Why: These callbacks are passed to memoized child components
  const handleNavigate = useCallback(
    (slug: string) => {
      navigate(`/u/${slug}`);
      onClose?.();
    },
    [navigate, onClose]
  );

  const handleFollowChange = useCallback(
    (profileId: string, nowFollowing: boolean) => {
      // Update the local state when follow status changes
      setRows((rows) =>
        rows.map((x) =>
          x.id === profileId ? { ...x, you_follow: nowFollowing } : x
        )
      );
    },
    []
  );

  if (!query) return null;

  useEffect(() => {
    const handler = (e: any) => {
      const t = e.detail?.targetId as string | undefined;
      const now = !!e.detail?.nowFollowing;
      if (!t) return;
      setRows((rows) =>
        rows.map((r) => (r.id === t ? { ...r, you_follow: now } : r))
      );
    };
    window.addEventListener("follow:changed", handler);
    return () => window.removeEventListener("follow:changed", handler);
  }, []);

  return (
    <div className="mx-3">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <div className="text-xs text-[var(--text)]/70">
            Results for “{query}”
          </div>
          <button
            className="text-xs text-[var(--text)]/60 hover:text-[var(--text)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* body */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading && (
            <div className="text-xs text-[var(--text)]/60 py-2 px-1">
              Searching…
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="text-xs text-[var(--text)]/60 py-2 px-1">
              No users found.
            </div>
          )}

          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <ProfileSearchResultItem
                key={r.id}
                profile={r}
                onNavigate={handleNavigate}
                onFollowChange={handleFollowChange}
                followStatus={batchedFollowStatuses[r.id]}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
