import { useCallback, useState, useEffect, useRef } from "react";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { onPostChanged, onPostDeleted } from "../../lib/postEvents";
import { onBlockStatusChanged } from "../../lib/blockStatusCache";
import { getPostDeleteExitDurationMs } from "../../lib/postDeleteExitAnimation";
import { applyPostPatch } from "../../lib/applyPostPatch";
import Hangout from "../../components/Hangout";
import HangoutRailCardSkeleton from "../../components/skeletons/HangoutRailCardSkeleton";
import { type BatchLoadResult } from "../../types/legacy";
import ProgressiveHorizontalRail from "../../components/ProgressiveHorizontalRail";

/** Some feeds include extra fields; make them optional here */
type FeedItemExtended = FeedItem & {
  activities_count?: { count: number }[];
  author?: { display_name?: string | null; username?: string | null } | null;
  isOwner?: boolean;
  status?: "draft" | "published";
};

type Props = {
  items: any[]; // keep your existing item typing
  loading?: boolean; // <-- add this
  onDelete?: (postId: string) => void; // NEW: callback when hangout is deleted
  // [OPTIMIZATION: Phase 1 - Batch] Batched data for components
  batchedData?: BatchLoadResult | null;
  // [OPTIMIZATION: Phase 2 - Progressive] Progressive loading props
  useProgressiveLoading?: boolean; // Whether to use progressive loading
  loadItems?: (offset: number, limit: number) => Promise<FeedItem[]>; // Load function
  initialItems?: FeedItem[]; // Initial items
  getCachedItems?: () => FeedItem[] | null; // Cache getter
  setCachedItems?: (items: FeedItem[]) => void; // Cache setter
  previousRailItems?: FeedItem[]; // Previous rail items for slow connection fallback
  // [ENHANCEMENT: Empty State + Visual Distinction] Filter metadata
  filteredCount?: number; // Number of filtered items (for empty state and visual distinction)
  hasActiveFilters?: boolean; // Whether filters are active
  /** When false (e.g. Home tab hidden on /u/me), rail initial-load effect does not run */
  isVisible?: boolean;
  /** Home empty-error recovery cycle. Top rail only. */
  homeRecoveryEpoch?: number;
  /** [DEBUG] Tab id for visibility logging */
  tabId?: string;
  /** Hide filtered empty rail card while an inline notice covers that case (e.g. no Today matches). */
  suppressFilteredEmptyCard?: boolean;
};

export default function HomeHangoutSection({
  items = [],
  loading,
  onDelete,
  batchedData,
  useProgressiveLoading = false,
  loadItems,
  initialItems,
  getCachedItems,
  setCachedItems,
  previousRailItems = [],
  filteredCount,
  hasActiveFilters = false,
  isVisible = true,
  homeRecoveryEpoch = 0,
  tabId = "unknown",
  suppressFilteredEmptyCard = false,
}: Props) {
  // Skeleton while loading (horizontal cards)
  // Don't return early when progressive loading is enabled - let ProgressiveHorizontalRail handle its own loading state
  if (loading && !useProgressiveLoading) {
    return (
      <div className="mt-2 -mx-1.5 px-1.5">
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scroll-hide">
          {Array.from({ length: 6 }).map((_, i) => (
            <HangoutRailCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // [OPTIMIZATION: Phase 2 - Progressive] Render function for progressive mode
  const renderHangout = useCallback(
    (p: FeedItemExtended, index: number) => {
      const authorHandle = p.is_anonymous
        ? p.anonymous_name || "Anonymous"
        : p.author?.display_name || p.author?.username || "Unknown";
      const avatarUrl = p.author?.avatar_url ?? null;

      // [ENHANCEMENT: Visual Distinction] Determine if this item is filtered
      const isFiltered =
        hasActiveFilters &&
        filteredCount !== undefined &&
        index < filteredCount;

      return (
        <Hangout
          key={p.id}
          id={p.id}
          caption={p.caption || "Untitled event"}
          createdAt={p.created_at}
          authorHandle={authorHandle}
          avatarUrl={avatarUrl}
          authorId={p.author_id}
          isAnonymous={p.is_anonymous || false}
          isOwner={p.isOwner || false}
          onDelete={() => onDelete?.(p.id)}
          status={p.status || "published"}
          selectedDates={p.selected_dates}
          type={p.type}
          // [FIX] Use PostgreSQL data from FeedItem instead of old batchedData
          isSaved={p.is_saved}
          followStatus={p.follow_status}
          // [ENHANCEMENT: Visual Distinction] Pass isFiltered prop
          isFiltered={isFiltered}
          post={p}
        />
      );
    },
    [onDelete, filteredCount, hasActiveFilters]
  );

  // [OPTIMIZATION: Phase 2 - Progressive] Use ProgressiveHorizontalRail if enabled
  if (useProgressiveLoading && loadItems) {
    return (
      <ProgressiveHorizontalRail
        loadItems={loadItems}
        renderItem={renderHangout}
        initialItems={initialItems || items}
        getCachedItems={getCachedItems}
        setCachedItems={setCachedItems}
        loading={loading}
        isVisible={isVisible}
        homeRecoveryEpoch={homeRecoveryEpoch}
        tabId={tabId}
        suppressFilteredEmptyCard={suppressFilteredEmptyCard}
        filteredCount={filteredCount}
        hasActiveFilters={hasActiveFilters}
        visibleItems={3}
        bufferSize="adaptive"
        pageSize={4}
        loadingComponent={<HangoutRailCardSkeleton />}
      />
    );
  }

  // Legacy mode: render all items at once (state so we can patch on post:changed)
  const data = (items as FeedItemExtended[]) || [];
  const [railItems, setRailItems] = useState<FeedItemExtended[]>(data);
  const [exitingPostIds, setExitingPostIds] = useState(() => new Set<string>());
  const deleteExitTimersRef = useRef<Map<string, number>>(new Map());
  const railItemsRef = useRef<FeedItemExtended[]>(data);
  useEffect(() => {
    setRailItems(data);
  }, [items]);
  useEffect(() => {
    railItemsRef.current = railItems;
  }, [railItems]);
  useEffect(() => {
    const cleanup = onPostChanged((e) => {
      const { postId, patch } = e.detail;
      setRailItems((prev) =>
        prev.map((item) =>
          item.id !== postId
            ? item
            : (applyPostPatch(
                item as Record<string, unknown>,
                patch
              ) as FeedItemExtended)
        )
      );
    });
    return cleanup;
  }, []);

  useEffect(() => {
    const commitRemove = (postId: string) => {
      deleteExitTimersRef.current.delete(postId);
      setExitingPostIds((prev) => {
        if (!prev.has(postId)) return prev;
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
      setRailItems((prev) => prev.filter((item) => item.id !== postId));
    };

    const cleanup = onPostDeleted((postId) => {
      if (!railItemsRef.current.some((i) => i.id === postId)) return;
      if (deleteExitTimersRef.current.has(postId)) return;

      const durationMs = getPostDeleteExitDurationMs();
      if (durationMs === 0) {
        commitRemove(postId);
        return;
      }

      setExitingPostIds((prev) => {
        if (prev.has(postId)) return prev;
        const next = new Set(prev);
        next.add(postId);
        return next;
      });

      const t = window.setTimeout(() => {
        commitRemove(postId);
      }, durationMs);
      deleteExitTimersRef.current.set(postId, t);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    return onBlockStatusChanged(({ blockedUserId, blocked }) => {
      if (!blocked) return;
      if (!railItemsRef.current.some((i) => i.author_id === blockedUserId)) {
        return;
      }
      setRailItems((prev) =>
        prev.filter((item) => item.author_id !== blockedUserId)
      );
    });
  }, []);

  const railItemShellClass = useCallback(
    (id: string) =>
      [
        "shrink-0 overflow-visible transition-[opacity,transform] ease-out will-change-[opacity,transform]",
        "duration-[280ms]",
        exitingPostIds.has(id)
          ? "opacity-0 -translate-y-1 pointer-events-none"
          : "opacity-100 translate-y-0",
      ].join(" "),
    [exitingPostIds]
  );

  return (
    <div className="overflow-x-auto scroll-hide pt-2 pb-4">
      <div className="flex gap-3 w-max rail-pad">
        {railItems.map((p) => {
          const locationsCount = p.activities_count?.[0]?.count ?? 0;
          // if you later want to show author:
          // const authorHandle = p.author?.display_name || p.author?.username || "Unknown";
          const authorHandle = p.is_anonymous
            ? p.anonymous_name || "Anonymous"
            : p.author?.display_name || p.author?.username || "Unknown";
          const avatarUrl = p.author?.avatar_url ?? null;

          return (
            <div key={p.id} className={railItemShellClass(p.id)}>
              <Hangout
                id={p.id}
                caption={p.caption || "Untitled event"}
                createdAt={p.created_at}
                authorHandle={authorHandle}
                avatarUrl={avatarUrl}
                authorId={p.author_id}
                isAnonymous={p.is_anonymous || false}
                isOwner={p.isOwner || false}
                onDelete={() => onDelete?.(p.id)}
                status={p.status || "published"}
                selectedDates={p.selected_dates}
                type={p.type}
                // [FIX] Use PostgreSQL data from FeedItem instead of old batchedData
                isSaved={p.is_saved}
                followStatus={p.follow_status}
                post={p}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
