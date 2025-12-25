import React, { useEffect, useRef, useMemo, useCallback } from "react";
import HomeHangoutSection from "./HomeHangoutSection";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import Post from "../../components/Post";
import PostSkeleton from "../../components/skeletons/PostSkeleton";
import ProgressiveFeed from "../../components/ProgressiveFeed";
import { getPublicFeed } from "../../api/queries/getPublicFeed";
import { getViewerId } from "../../api/services/follows";
import { dataCache } from "../../lib/dataCache";
import { type BatchLoadResult } from "../../lib/batchDataLoader";
import { type OffsetAwareLoadResult } from "../../lib/offsetAwareLoader";
// createOffsetAwareLoader removed - no longer needed with server-side filtering

interface Props {
  viewMode: "all" | "hangouts" | "experiences";
  // [OPTIMIZATION: Phase 2 - Progressive] Use ProgressiveFeed instead of items prop
  // Legacy support: if items provided, use them (backward compatibility)
  items?: FeedItem[];
  loading?: boolean;
  loadingMore?: boolean;
  hasActiveFilters?: boolean;
  // for tag fallback when no results match filters
  tagFallbackItems?: FeedItem[];
  tagFallbackLoading?: boolean;
  showTagFallback?: boolean;
  // for the injected rail
  hangouts?: FeedItem[];
  hangoutsLoading?: boolean;
  // to know if we have tag filters active
  selectedTags?: string[];
  // [OPTIMIZATION: Phase 4 - Prefetch] Callback for prefetching next page
  onPrefetchNextPage?: () => Promise<void>;
  // [OPTIMIZATION: Phase 1 - Batch] Batched data for components
  batchedData?: BatchLoadResult | null;
  // [OPTIMIZATION: Phase 2 - Progressive] Progressive feed props
  useProgressiveFeed?: boolean; // Whether to use ProgressiveFeed
  loadItems?: (
    offset: number,
    limit: number
  ) => Promise<FeedItem[] | OffsetAwareLoadResult<FeedItem>>; // Load function for ProgressiveFeed (supports both formats)
  initialItems?: FeedItem[]; // Initial items for ProgressiveFeed
  getCachedItems?: () => FeedItem[] | null; // Cache getter
  setCachedItems?: (items: FeedItem[]) => void; // Cache setter
  // Feed options (for ProgressiveFeed)
  feedOptions?: {
    type?: "experience" | "hangout";
    q?: string;
    tags?: string[];
    currentUserId?: string | null; // Include for feedKey to reset on auth change
  };
}

const INJECT_EVERY = 8;

export default function HomePostsSection({
  viewMode,
  items: legacyItems = [],
  loading,
  loadingMore = false,
  hasActiveFilters = false,
  tagFallbackItems = [],
  tagFallbackLoading = false,
  showTagFallback = false,
  hangouts = [],
  hangoutsLoading,
  selectedTags = [],
  onPrefetchNextPage,
  batchedData,
  useProgressiveFeed = false,
  loadItems,
  initialItems,
  getCachedItems,
  setCachedItems,
  feedOptions,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedItemsCountRef = useRef(0);
  const prefetchedRef = useRef(false);

  // [OPTIMIZATION: Phase 2 - Progressive] Client-side filtering removed
  // PostgreSQL now handles type filtering server-side, so no need for offsetAwareLoader wrapper

  // [OPTIMIZATION: Phase 2 - Progressive] Load function for injected rails (hangouts only)
  const railLoadItems = useCallback(
    async (offset: number, limit: number) => {
      if (!loadItems) return [];
      const result = await loadItems(offset, limit * 2);
      // Extract items from result (handles both array and OffsetAwareLoadResult formats)
      const allItems = Array.isArray(result) ? result : result.items;
      // Filter to hangouts only
      return allItems.filter((item) => item.type === "hangout");
    },
    [loadItems]
  );

  // Render function with rail injection
  const renderItemWithRail = useCallback(
    (item: FeedItem, index: number) => {
      renderedItemsCountRef.current = index + 1;
      const shouldInjectRail =
        viewMode === "all" &&
        renderedItemsCountRef.current % INJECT_EVERY === 0 &&
        (hangoutsLoading || hangouts.length > 0);

      return (
        <React.Fragment key={item.id}>
          <Post
            postId={item.id}
            caption={item.caption || "(no caption)"}
            createdAt={item.created_at}
            authorId={item.author_id}
            author={item.author}
            type={item.type}
            isAnonymous={item.is_anonymous || false}
            anonymousName={item.anonymous_name}
            anonymousAvatar={item.anonymous_avatar}
            selectedDates={item.selected_dates}
            batchedData={batchedData}
          />
          {shouldInjectRail && (
            <React.Fragment key={`rail-${item.id}`}>
              <div
                key={`rail-header-${item.id}`}
                className="text-[var(--text)]/90 text-sm font-medium"
              >
                {hangoutsLoading ? (
                  <span className="inline-block h-4 w-40 rounded bg-[var(--text)]/10 animate-pulse" />
                ) : (
                  "Discover More"
                )}
              </div>
              <div key={`rail-content-${item.id}`}>
                <HomeHangoutSection
                  items={hangouts}
                  loading={!!hangoutsLoading}
                  batchedData={batchedData}
                  // [OPTIMIZATION: Phase 2 - Progressive] Enable progressive loading for injected rails
                  useProgressiveLoading={true}
                  loadItems={railLoadItems}
                  initialItems={hangouts}
                />
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      );
    },
    [viewMode, hangouts, hangoutsLoading, batchedData, railLoadItems]
  );

  // getCachedItemsFiltered removed - getCachedItems from HomePage already filters by type

  // Key to reset ProgressiveFeed when filters or auth change
  // FIX: Include currentUserId in feedKey so feed reloads when user logs in/out
  // This ensures ProgressiveFeed remounts and resets internal state (offsetRef, initialLoadCompleteRef)
  const feedKey = useMemo(
    () =>
      `feed-${viewMode}-${selectedTags.join(",")}-${feedOptions?.q || ""}-${
        feedOptions?.currentUserId || "guest"
      }`,
    [viewMode, selectedTags, feedOptions?.q, feedOptions?.currentUserId]
  );

  // Legacy mode: prefetch logic
  useEffect(() => {
    if (
      (!useProgressiveFeed && !containerRef.current) ||
      !onPrefetchNextPage ||
      legacyItems.length === 0 ||
      prefetchedRef.current
    )
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].intersectionRatio >= 0.8) {
          prefetchedRef.current = true;
          if (typeof window.requestIdleCallback === "function") {
            requestIdleCallback(onPrefetchNextPage, { timeout: 2000 });
          } else {
            setTimeout(onPrefetchNextPage, 0);
          }
        }
      },
      { threshold: 0.8 }
    );

    observer.observe(containerRef.current!);
    return () => observer.disconnect();
  }, [useProgressiveFeed, legacyItems.length, onPrefetchNextPage]);

  // Show appropriate items based on viewMode (legacy mode)
  const hangoutItems = legacyItems.filter(
    (p: FeedItem) => String(p.type).toLowerCase() === "hangout"
  );
  const experienceItems = legacyItems.filter(
    (p: FeedItem) => String(p.type).toLowerCase() === "experience"
  );

  const displayItems =
    viewMode === "hangouts"
      ? hangoutItems
      : viewMode === "experiences"
      ? experienceItems
      : [...hangoutItems, ...experienceItems];

  const fallbackItems = showTagFallback ? tagFallbackItems : [];

  const shouldShowEmptyState =
    !loading &&
    displayItems.length === 0 &&
    (!showTagFallback || fallbackItems.length === 0);

  // [OPTIMIZATION: Phase 2 - Progressive] Use ProgressiveFeed if enabled
  if (useProgressiveFeed && loadItems) {
    return (
      <div ref={containerRef} className="flex flex-col w-full px-3 gap-4 mt-4">
        <ProgressiveFeed
          key={feedKey} // Reset when filters change
          loadItems={loadItems} // PostgreSQL already filters by type
          renderItem={renderItemWithRail}
          initialItems={initialItems}
          getCachedItems={getCachedItems} // Already filters by type in HomePage
          setCachedItems={setCachedItems}
          enableVirtualScrolling={false} // Disable for now, can enable later
          bufferSize="adaptive"
          enableLazyLoading={true}
          enableScrollStopDetection={true}
          loading={loading}
          loadingComponent={<PostSkeleton />}
          emptyMessage={
            hasActiveFilters
              ? "No posts match your current filters."
              : "No posts to show right now."
          }
          pageSize={5} // Increased from 2 to 5 for better performance (fewer API calls, faster loading)
        />

        {/* Show fallback posts when tag filters are active */}
        {showTagFallback && selectedTags.length > 0 && (
          <>
            <div className="text-[var(--text)]/80 text-sm font-medium mt-4 mb-2">
              Other posts:
            </div>
            {tagFallbackLoading &&
              Array.from({ length: 2 }).map((_, i) => (
                <PostSkeleton key={`fallback-sk-${i}`} />
              ))}
            {tagFallbackItems.map((p: FeedItem) => (
              <Post
                key={`fallback-${p.id}`}
                postId={p.id}
                caption={p.caption || "(no caption)"}
                createdAt={p.created_at}
                authorId={p.author_id}
                author={p.author}
                type={p.type}
                isAnonymous={p.is_anonymous || false}
                anonymousName={p.anonymous_name}
                anonymousAvatar={p.anonymous_avatar}
                selectedDates={p.selected_dates}
                post={p}
                batchedData={batchedData}
              />
            ))}
          </>
        )}
      </div>
    );
  }

  // Legacy mode: use items prop (backward compatibility)
  if (shouldShowEmptyState) {
    return (
      <div className="text-[var(--text)]/70 text-sm px-3 py-4">
        {hasActiveFilters ? (
          <>
            <div className="font-medium mb-1">Oops, sorry!</div>
            <div>No posts match your current filters.</div>
          </>
        ) : (
          "No posts to show right now."
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col w-full px-3 gap-4 mt-4">
      {/* Show skeleton only when no posts are available yet */}
      {loading &&
        displayItems.length === 0 &&
        Array.from({ length: 3 }).map((_, i) => (
          <PostSkeleton key={`sk-${i}`} />
        ))}

      {/* Show "no matches" message when we have tag filters but no results, but have fallback */}
      {!loading &&
        selectedTags.length > 0 &&
        displayItems.length === 0 &&
        showTagFallback && (
          <div className="text-[var(--text)]/70 text-sm py-4">
            <div className="font-medium mb-1">Oops, sorry!</div>
            <div>No posts match your current tag filters.</div>
          </div>
        )}

      {/* Show main results if we have them - show appropriate items based on viewMode */}
      {displayItems.map((p: FeedItem, idx: number) => (
        <React.Fragment key={p.id}>
          <Post
            postId={p.id}
            caption={p.caption || "(no caption)"}
            createdAt={p.created_at}
            authorId={p.author_id}
            author={p.author}
            type={p.type}
            isAnonymous={p.is_anonymous || false}
            anonymousName={p.anonymous_name}
            anonymousAvatar={p.anonymous_avatar}
            selectedDates={p.selected_dates}
            post={p}
            batchedData={batchedData}
          />

          {/* Inject horizontal rail every 8 posts */}
          {viewMode === "all" &&
            (idx + 1) % INJECT_EVERY === 0 &&
            (hangoutsLoading || hangouts.length > 0) && (
              <>
                <div className="text-[var(--text)]/90 text-sm font-medium">
                  {hangoutsLoading ? (
                    <span className="inline-block h-4 w-40 rounded bg-[var(--text)]/10 animate-pulse" />
                  ) : (
                    "Discover More"
                  )}
                </div>

                <HomeHangoutSection
                  items={hangouts}
                  loading={!!hangoutsLoading}
                  batchedData={batchedData}
                />
              </>
            )}
        </React.Fragment>
      ))}

      {/* Show loading skeletons for pagination */}
      {loadingMore &&
        Array.from({ length: 2 }).map((_, i) => (
          <PostSkeleton key={`loading-more-${i}`} />
        ))}

      {/* Show fallback posts when tag filters are active */}
      {showTagFallback && selectedTags.length > 0 && (
        <>
          {/* Section header for fallback posts */}
          <div className="text-[var(--text)]/80 text-sm font-medium mt-4 mb-2">
            {displayItems.length === 0
              ? "Here are some other posts you might like:"
              : "Other posts:"}
          </div>

          {/* Loading state for fallback */}
          {tagFallbackLoading &&
            Array.from({ length: 2 }).map((_, i) => (
              <PostSkeleton key={`fallback-sk-${i}`} />
            ))}

          {/* Fallback posts - UNIFIED: now showing both types */}
          {fallbackItems.map((p: FeedItem, idx: number) => (
            <React.Fragment key={`fallback-${p.id}`}>
              <Post
                postId={p.id}
                caption={p.caption || "(no caption)"}
                createdAt={p.created_at}
                authorId={p.author_id}
                author={p.author}
                type={p.type}
                isAnonymous={p.is_anonymous || false}
                anonymousName={p.anonymous_name}
                anonymousAvatar={p.anonymous_avatar}
                selectedDates={p.selected_dates}
                post={p}
                batchedData={batchedData}
              />
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  );
}
