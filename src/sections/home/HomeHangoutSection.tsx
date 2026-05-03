import { useCallback, useState, useEffect, useRef } from "react";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { onPostChanged, onPostDeleted } from "../../lib/postEvents";
import { getPostDeleteExitDurationMs } from "../../lib/postDeleteExitAnimation";
import { applyPostPatch } from "../../lib/applyPostPatch";
import Hangout from "../../components/Hangout";
import { type BatchLoadResult } from "../../types/legacy";
import ProgressiveHorizontalRail from "../../components/ProgressiveHorizontalRail";
import EmptyRailCard from "../../components/EmptyRailCard";

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
  /** [DEBUG] Tab id for visibility logging */
  tabId?: string;
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
  tabId = "unknown",
}: Props) {
  // Skeleton while loading (horizontal cards)
  // Don't return early when progressive loading is enabled - let ProgressiveHorizontalRail handle its own loading state
  if (loading && !useProgressiveLoading) {
    return (
      <div className="mt-2 -mx-1.5 px-1.5">
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 scroll-hide">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0"
            >
              <div className="relative overflow-visible ui-card pt-2 px-3 pb-3 flex flex-col gap-2 mb-3">
                {/* bookmark badge: bottom-left (skeleton style) */}
                <div
                  className="absolute -bottom-3 -left-3 z-10 grid place-items-center h-8 w-8 rounded-full bg-[var(--surface)]/80 border border-[var(--border)] shadow-lg"
                  aria-hidden
                >
                  <div className="w-4 h-4 rounded bg-[var(--text)]/20 animate-pulse" />
                </div>

                {/* date strip + author row (matches Hangout layout) */}
                <div className="h-5 w-full rounded-full bg-[var(--text)]/10 animate-pulse mb-2" />
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 shrink-0 rounded-full bg-[var(--text)]/10 animate-pulse" />
                  <div className="h-3 flex-1 min-w-0 rounded bg-[var(--text)]/10 animate-pulse" />
                </div>

                {/* caption (3 lines to match clamp) */}
                <div className="mt-1 space-y-2">
                  <div className="h-4 w-[92%] rounded bg-[var(--text)]/10 animate-pulse" />
                  <div className="h-4 w-[78%] rounded bg-[var(--text)]/10 animate-pulse" />
                  <div className="h-4 w-[60%] rounded bg-[var(--text)]/10 animate-pulse" />
                </div>

                {/* footer row: RSVP component skeleton */}
                <div className="pt-1 flex items-center justify-end">
                  <div className="flex items-center">
                    {/* User avatars (overlapping circles) - Creator on right, others to left */}
                    <div className="flex items-center">
                      {[0, 1, 2].map((index) => (
                        <div
                          key={index}
                          className="relative"
                          style={{
                            zIndex: index + 1, // Creator (index 0) = z-index 1, middle (index 1) = z-index 2, rightmost (index 2) = z-index 3
                            marginLeft: index > 0 ? "-4px" : "0px", // Reduced overlap
                          }}
                        >
                          <div
                            className="w-6 h-6 rounded-full bg-[var(--text)]/10 border border-[var(--border)] animate-pulse"
                            style={{ width: "20px", height: "20px" }}
                          />
                        </div>
                      ))}
                    </div>

                    {/* RSVP pill - same height as circles, overlapping, on top */}
                    <div
                      className="flex items-center gap-1 px-2 py-1 rounded-full bg-[var(--surface)] border border-[var(--border)] animate-pulse"
                      style={{
                        marginLeft: "-4px", // Reduced overlap with the last circle
                        zIndex: 4, // Highest z-index so pill appears on top
                      }}
                    >
                      <div className="h-3 w-8 rounded bg-[var(--text)]/20 animate-pulse" />
                      <div className="h-3 w-6 rounded bg-[var(--text)]/20 animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
          caption={p.caption || "Untitled hangout"}
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
        tabId={tabId}
        emptyComponent={<EmptyRailCard />}
        filteredCount={filteredCount}
        hasActiveFilters={hasActiveFilters}
        visibleItems={3}
        bufferSize="adaptive"
        pageSize={4}
        loadingComponent={
          <div className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0">
            <div className="relative overflow-visible ui-card pt-2 px-3 pb-3 flex flex-col gap-2 mb-3">
              {/* Save button skeleton: bottom-left */}
              <div className="absolute -bottom-3 -left-3 z-10 grid place-items-center h-8 w-8 rounded-full bg-[var(--surface)]/80 border border-[var(--border)] shadow-lg">
                <div className="w-4 h-4 rounded bg-[var(--text)]/20 animate-pulse" />
              </div>
              {/* Date strip + author row (matches Hangout) */}
              <div className="h-5 w-full rounded-full bg-[var(--text)]/10 animate-pulse mb-2" />
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 shrink-0 rounded-full bg-[var(--text)]/10 animate-pulse" />
                <div className="h-3 flex-1 min-w-0 rounded bg-[var(--text)]/10 animate-pulse" />
              </div>
              {/* Caption (3 lines to match clamp) */}
              <div className="mt-1 space-y-2">
                <div className="h-4 w-[92%] rounded bg-[var(--text)]/10 animate-pulse" />
                <div className="h-4 w-[78%] rounded bg-[var(--text)]/10 animate-pulse" />
                <div className="h-4 w-[60%] rounded bg-[var(--text)]/10 animate-pulse" />
              </div>
              {/* Footer row: Action button skeleton (Follow button) */}
              <div className="pt-1 flex items-center justify-between h-7">
                <div className="flex items-center h-full">
                  {/* Empty space for menu (non-owner) */}
                  <div></div>
                </div>
                <div className="flex items-center h-full">
                  {/* Follow button skeleton */}
                  <div className="h-5 w-[60px] rounded-full bg-[var(--text)]/10 border border-[var(--border)] animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        }
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
                caption={p.caption || "Untitled hangout"}
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
