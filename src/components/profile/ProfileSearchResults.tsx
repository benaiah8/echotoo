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
  setCachedFollowStatus,
} from "../../lib/followStatusCache";

type ResultRowVariant = "card" | "plain";

// [OPTIMIZATION: Phase 6.2 - React] Memoized search result item component
// Why: Prevents unnecessary re-renders when other items in the list change
type ProfileSearchResultItemProps = {
  profile: ProfileSearchRow;
  onNavigate: (slug: string) => void;
  onFollowChange: (profileId: string, nowFollowing: boolean) => void;
  followStatus?: "none" | "pending" | "following" | "friends";
  rowVariant?: ResultRowVariant;
};

const ProfileSearchResultItem = React.memo(
  function ProfileSearchResultItem({
    profile,
    onNavigate,
    onFollowChange,
    followStatus,
    rowVariant = "card",
  }: ProfileSearchResultItemProps) {
    const startY = useRef<number | null>(null);
    const moved = useRef(false);

    const handleClick = () => {
      if (moved.current) return;
      const slug = profile.username || profile.id;
      onNavigate(slug);
    };

    const rowClass =
      rowVariant === "plain"
        ? [
            "flex items-center gap-3 py-2.5 px-1 cursor-pointer select-none",
            "border-b border-[var(--border)]/55 last:border-b-0",
          ].join(" ")
        : [
            "flex items-center gap-3 p-2 rounded-xl cursor-pointer select-none",
            "border border-[var(--bottom-tab-border)]",
            "bg-[color-mix(in_oklab,var(--glass-bg)_80%,var(--bg))] backdrop-blur-[var(--glass-blur)]",
            "shadow-[0_1px_6px_rgba(0,0,0,0.10),0_0_0_1px_color-mix(in_oklab,var(--text)_6%,transparent)]",
            "app-dark:shadow-[0_2px_10px_rgba(0,0,0,0.34),0_0_0_1px_color-mix(in_oklab,var(--text)_10%,transparent)]",
          ].join(" ");

    return (
      <div
        className={rowClass}
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
    return (
      prevProps.profile.id === nextProps.profile.id &&
      prevProps.profile.username === nextProps.profile.username &&
      prevProps.profile.display_name === nextProps.profile.display_name &&
      prevProps.profile.avatar_url === nextProps.profile.avatar_url &&
      prevProps.profile.member_no === nextProps.profile.member_no &&
      prevProps.profile.you_follow === nextProps.profile.you_follow &&
      prevProps.rowVariant === nextProps.rowVariant
    );
  }
);

export type ProfileSearchResultsLayout = "panel" | "inline";

export default function ProfileSearchResults({
  query,
  viewerId,
  onClose,
  panelVariant = "default",
  layout = "panel",
  pageSize: pageSizeProp,
  enableLoadMore = false,
}: {
  query: string;
  viewerId?: string | null;
  onClose?: () => void;
  /** `"glass"`: frosted shell for embedded contexts. Default matches profile overlay. */
  panelVariant?: "default" | "glass";
  /** `inline`: borderless list for Home search users mode. `panel`: default profile overlay. */
  layout?: ProfileSearchResultsLayout;
  /** Page size when using inline pagination (default 10 if `enableLoadMore`). */
  pageSize?: number;
  /** When true with `layout="inline"`, show Load more for additional pages. */
  enableLoadMore?: boolean;
}) {
  const [rows, setRows] = useState<ProfileSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [batchedFollowStatuses, setBatchedFollowStatuses] = useState<
    Record<string, "none" | "pending" | "following" | "friends">
  >({});
  const navigate = useNavigate();

  const isInline = layout === "inline";
  const pageSize = isInline
    ? Math.min(Math.max(pageSizeProp ?? 10, 1), 50)
    : 25;

  const batchFollowForRows = useCallback(
    async (r: ProfileSearchRow[], mounted: () => boolean) => {
      if (r.length === 0 || !viewerId) return;
      try {
        const currentViewerId = await getViewerId();
        if (!currentViewerId || !mounted()) return;
        const profileIds = r.map((profile) => profile.id);
        const followStatuses = await getBatchFollowStatuses(
          currentViewerId,
          profileIds
        );
        if (mounted()) {
          setBatchedFollowStatuses((prev) => ({ ...prev, ...followStatuses }));
        }
        Object.entries(followStatuses).forEach(([profileId, status]) => {
          setCachedFollowStatus(currentViewerId, profileId, status);
        });
      } catch (error) {
        console.warn("Failed to batch load follow statuses:", error);
      }
    },
    [viewerId]
  );

  useEffect(() => {
    let mounted = true;
    const isMounted = () => mounted;

    (async () => {
      const q = query.trim();
      if (!q) {
        setRows([]);
        setHasMore(false);
        setLoading(false);
        setBatchedFollowStatuses({});
        return;
      }

      setLoading(true);
      setHasMore(false);
      setBatchedFollowStatuses({});

      const limit = isInline ? pageSize : 25;
      const offset = 0;
      const r = await searchProfiles(q, viewerId || undefined, {
        limit,
        offset,
      });
      if (!isMounted()) return;
      setRows(r);
      setLoading(false);
      setHasMore(isInline && enableLoadMore && r.length === limit);

      void batchFollowForRows(r, isMounted);
    })();

    return () => {
      mounted = false;
    };
  }, [
    query,
    viewerId,
    isInline,
    pageSize,
    enableLoadMore,
    batchFollowForRows,
  ]);

  useEffect(() => {
    const rerun = () => {
      onClose?.();
    };
    window.addEventListener("follow:changed", rerun);
    return () => window.removeEventListener("follow:changed", rerun);
  }, [onClose]);

  const handleNavigate = useCallback(
    (slug: string) => {
      navigate(`/u/${slug}`);
      onClose?.();
    },
    [navigate, onClose]
  );

  const handleFollowChange = useCallback(
    (profileId: string, nowFollowing: boolean) => {
      setRows((rows) =>
        rows.map((x) =>
          x.id === profileId ? { ...x, you_follow: nowFollowing } : x
        )
      );
    },
    []
  );

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

  const handleLoadMore = useCallback(async () => {
    const q = query.trim();
    if (!q || !hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const offset = rows.length;
      const next = await searchProfiles(q, viewerId || undefined, {
        limit: pageSize,
        offset,
      });
      setRows((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of next) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
          }
        }
        return merged;
      });
      setHasMore(isInline && enableLoadMore && next.length === pageSize);
      void batchFollowForRows(next, () => true);
    } finally {
      setLoadingMore(false);
    }
  }, [
    query,
    viewerId,
    pageSize,
    rows.length,
    hasMore,
    loadingMore,
    loading,
    isInline,
    enableLoadMore,
    batchFollowForRows,
  ]);

  if (!query.trim()) return null;

  const panelShellClass =
    panelVariant === "glass"
      ? [
          "rounded-2xl border border-[var(--bottom-tab-border)] overflow-hidden",
          "bg-[color-mix(in_oklab,var(--glass-bg)_84%,var(--bg))] backdrop-blur-[var(--glass-blur)]",
          "shadow-[0_6px_18px_rgba(0,0,0,0.16)] app-dark:shadow-[0_10px_22px_rgba(0,0,0,0.36)]",
        ].join(" ")
      : "rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden";

  const headerBorderClass =
    panelVariant === "glass"
      ? "border-b border-[var(--bottom-tab-border)]"
      : "border-b border-[var(--border)]";

  if (isInline) {
    return (
      <div className="w-full">
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

        <div className="flex flex-col">
          {rows.map((r) => (
            <ProfileSearchResultItem
              key={r.id}
              profile={r}
              onNavigate={handleNavigate}
              onFollowChange={handleFollowChange}
              followStatus={batchedFollowStatuses[r.id]}
              rowVariant="plain"
            />
          ))}
        </div>

        {enableLoadMore && hasMore && !loading ? (
          <div className="flex justify-center pt-3 pb-1">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void handleLoadMore()}
              className={[
                "rounded-full px-4 py-1.5 text-[11px] font-medium",
                "border border-[var(--border)] text-[var(--text)]/85",
                "hover:bg-[color-mix(in_oklab,var(--text)_8%,transparent)]",
                "disabled:opacity-50 disabled:pointer-events-none",
              ].join(" ")}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-3">
      <div className={panelShellClass}>
        <div
          className={[
            "flex items-center justify-between px-3 py-2",
            headerBorderClass,
          ].join(" ")}
        >
          <div className="text-xs text-[var(--text)]/70">
            Results for “{query}”
          </div>
          <button
            type="button"
            className="text-xs text-[var(--text)]/60 hover:text-[var(--text)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

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
                rowVariant="card"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
