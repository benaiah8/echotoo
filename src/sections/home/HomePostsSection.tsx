import React, {
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useState,
} from "react";
import HomeHangoutSection from "./HomeHangoutSection";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import Post from "../../components/Post";
import PostSkeleton from "../../components/skeletons/PostSkeleton";
import ProgressiveFeed from "../../components/ProgressiveFeed";
import { getPublicFeed } from "../../api/queries/getPublicFeed";
import { getViewerId } from "../../api/services/follows";
import { dataCache } from "../../lib/dataCache";
import { type BatchLoadResult } from "../../types/legacy";
import { type OffsetAwareLoadResult } from "../../lib/offsetAwareLoader";
import { supabase } from "../../lib/supabaseClient";
import { HOME_FEED_FIRST_PAGE } from "../../lib/homeFeedConstants";
// createOffsetAwareLoader removed - no longer needed with server-side filtering

/** TEMP — paste target post UUID; remove after RSVP feed diagnosis */
const DEBUG_RSVP_POST_ID = "";

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
  // [REMOVED: Phase 1.2] hangouts and hangoutsLoading props - no longer used, rails manage their own state
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
    occursOn?: string | null;
    occursTz?: string | null;
  };
  // [FIX: Phase 1.2 - Horizontal Rail] Props for injected rails filtering
  railLoadItems?: (offset: number, limit: number) => Promise<FeedItem[]>;
  railGetCachedItems?: (offset: number) => FeedItem[] | null;
  railSetCachedItems?: (items: FeedItem[], offset: number) => void;
  friendsFilter?: boolean;
  /** Rail-only: social/extra filters excluding Today (Today is vertical-only during Phase A). */
  railHasActiveFilters?: boolean;
  railFilteredCount?: number; // [ENHANCEMENT: Empty State + Visual Distinction] Filtered count for injected rails
  /** When false (e.g. Home tab hidden on /u/me), ProgressiveFeed does not run initial load */
  isVisible?: boolean;
  /** [DEBUG] Tab id for visibility logging */
  tabId?: string;
  /** Today spotlight above normal feed — does not remount ProgressiveFeed */
  todayChipActive?: boolean;
  todaySpotlightItems?: FeedItem[];
  todaySpotlightLoading?: boolean;
  todaySpotlightResolved?: boolean;
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
  // [REMOVED: Phase 1.2] hangouts and hangoutsLoading - no longer used
  selectedTags = [],
  onPrefetchNextPage,
  batchedData,
  useProgressiveFeed = false,
  loadItems,
  initialItems,
  getCachedItems,
  setCachedItems,
  feedOptions,
  railLoadItems: railLoadItemsProp,
  railGetCachedItems: railGetCachedItemsProp,
  railSetCachedItems: railSetCachedItemsProp,
  friendsFilter = false,
  railHasActiveFilters,
  railFilteredCount,
  isVisible = true,
  tabId = "home",
  todayChipActive = false,
  todaySpotlightItems = [],
  todaySpotlightLoading = false,
  todaySpotlightResolved = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderedItemsCountRef = useRef(0);
  const prefetchedRef = useRef(false);

  /** Auth user id (matches PostDetailBody owner check: session user id vs post.author_id). */
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) setAuthUserId(session?.user?.id ?? null);
    })();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // [OPTIMIZATION: Phase 2 - Progressive] Client-side filtering removed
  // PostgreSQL now handles type filtering server-side, so no need for offsetAwareLoader wrapper

  // [FIX: Phase 1.2 - Horizontal Rail] Fallback must use an unconditional hook; pick prop vs fallback after.
  const fallbackRailLoadItems = useCallback(
    async (offset: number, limit: number) => {
      if (!loadItems) return [];
      // Use the vertical feed's loadItems which already handles viewMode filtering
      // The offset ensures we get different items than the top rail
      const result = await loadItems(offset, limit * 2);
      // Extract items from result (handles both array and OffsetAwareLoadResult formats)
      const allItems = Array.isArray(result) ? result : result.items;

      // Fallback only: mix hangouts + experiences (never use vertical segment loadItems for rails)
      const hangoutPosts = allItems.filter((p) => p.type === "hangout");
      const experiencePosts = allItems.filter((p) => p.type === "experience");
      const mixedPosts: FeedItem[] = [];
      const maxLength = Math.max(hangoutPosts.length, experiencePosts.length);
      for (let i = 0; i < maxLength && mixedPosts.length < limit; i++) {
        if (hangoutPosts[i]) mixedPosts.push(hangoutPosts[i]);
        if (experiencePosts[i] && mixedPosts.length < limit)
          mixedPosts.push(experiencePosts[i]);
      }
      return mixedPosts;
    },
    [loadItems]
  );

  const railLoadItems = railLoadItemsProp ?? fallbackRailLoadItems;

  // Render function with rail injection
  const renderItemWithRail = useCallback(
    (item: FeedItem, index: number) => {
      renderedItemsCountRef.current = index + 1;
      const shouldInjectRail =
        renderedItemsCountRef.current % INJECT_EVERY === 0;

      if (DEBUG_RSVP_POST_ID && item.id === DEBUG_RSVP_POST_ID) {
        const row = item as Record<string, unknown>;
        console.log("RSVP DEBUG HomePostsSection -> Post", {
          id: item.id,
          rsvp_capacity: row.rsvp_capacity,
          typeof_rsvp_capacity: typeof row.rsvp_capacity,
        });
      }

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
            post={item}
            slideshowHostVisible={isVisible}
            isOwner={authUserId != null && authUserId === item.author_id}
          />
          {shouldInjectRail && (
            <React.Fragment key={`rail-${item.id}`}>
              {/* Add spacing and separator line */}
              <div className="mt-6 mb-4">
                <div className="h-px bg-[var(--border)]/100 mb-4" />
                <div className="text-[var(--text)]/90 text-sm font-medium">
                  Discover More
                </div>
              </div>
              <div key={`rail-content-${item.id}`}>
                <HomeHangoutSection
                  items={[]}
                  loading={false}
                  batchedData={batchedData}
                  // [FIX: Phase 1.2 - Horizontal Rail] Use rail-specific cache functions for filters
                  useProgressiveLoading={true}
                  loadItems={railLoadItems}
                  initialItems={[]}
                  getCachedItems={
                    railGetCachedItemsProp
                      ? () => railGetCachedItemsProp(0)
                      : getCachedItems
                  }
                  setCachedItems={
                    railSetCachedItemsProp
                      ? (items: FeedItem[]) => railSetCachedItemsProp(items, 0)
                      : setCachedItems
                  }
                  filteredCount={railFilteredCount}
                  hasActiveFilters={
                    railHasActiveFilters !== undefined
                      ? railHasActiveFilters
                      : friendsFilter
                  }
                />
              </div>
            </React.Fragment>
          )}
        </React.Fragment>
      );
    },
    [
      viewMode,
      batchedData,
      railLoadItems,
      railGetCachedItemsProp,
      railSetCachedItemsProp,
      getCachedItems,
      setCachedItems,
      railFilteredCount,
      railHasActiveFilters,
      friendsFilter,
      isVisible,
      authUserId,
    ]
  );

  // getCachedItemsFiltered removed - getCachedItems from HomePage already filters by type

  // Key to reset ProgressiveFeed when filters or auth change
  // FIX: Include currentUserId in feedKey so feed reloads when user logs in/out
  // This ensures ProgressiveFeed remounts and resets internal state (offsetRef, initialLoadCompleteRef)
  const feedKey = useMemo(
    () =>
      `feed-${viewMode}-${selectedTags.join(",")}-${feedOptions?.q || ""}-${feedOptions?.occursOn || ""
      }@${feedOptions?.occursTz || ""}-${
        feedOptions?.currentUserId || "guest"
      }`,
    [
      viewMode,
      selectedTags,
      feedOptions?.q,
      feedOptions?.occursOn,
      feedOptions?.occursTz,
      feedOptions?.currentUserId,
    ]
  );

  const verticalEmptyMessage = hasActiveFilters
    ? "No posts match your current filters."
    : "No posts to show right now.";

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

  const renderSpotlightPost = useCallback(
    (item: FeedItem) => (
      <Post
        key={`today-spotlight-${item.id}`}
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
        post={item}
        slideshowHostVisible={isVisible}
        isOwner={authUserId != null && authUserId === item.author_id}
      />
    ),
    [isVisible, authUserId]
  );

  const showTodayEmptyNotice =
    todayChipActive &&
    todaySpotlightResolved &&
    !todaySpotlightLoading &&
    todaySpotlightItems.length === 0;

  // [OPTIMIZATION: Phase 2 - Progressive] Use ProgressiveFeed if enabled
  if (useProgressiveFeed && loadItems) {
    return (
      <div
        ref={containerRef}
        className="flex flex-col w-full px-1.5 gap-4 mt-3"
      >
        {todayChipActive ? (
          <div className="flex flex-col gap-4">
            {showTodayEmptyNotice ? (
              <p className="py-2 text-center text-sm text-[var(--text)]/70">
                Nothing scheduled for today.
              </p>
            ) : null}
            {todaySpotlightItems.map((item) => renderSpotlightPost(item))}
          </div>
        ) : null}

        <ProgressiveFeed
          key={feedKey} // Reset when filters change
          loadItems={loadItems} // PostgreSQL already filters by type
          renderItem={renderItemWithRail}
          initialItems={initialItems}
          getCachedItems={getCachedItems} // Already filters by type in HomePage
          setCachedItems={setCachedItems}
          isVisible={isVisible}
          tabId={tabId}
          enableVirtualScrolling={false} // Disable for now, can enable later
          bufferSize="adaptive"
          enableLazyLoading={true}
          enableScrollStopDetection={true}
          loading={loading}
          loadingComponent={<PostSkeleton />}
          emptyMessage={verticalEmptyMessage}
          pageSize={HOME_FEED_FIRST_PAGE} // Matches Home vertical dataCache.generateFeedKey first-page limit
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
                slideshowHostVisible={isVisible}
                isOwner={authUserId != null && authUserId === p.author_id}
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
      <div className="text-[var(--text)]/70 text-sm px-1.5 py-4">
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
    <div ref={containerRef} className="flex flex-col w-full px-1.5 gap-4 mt-3">
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
            slideshowHostVisible={isVisible}
            isOwner={authUserId != null && authUserId === p.author_id}
          />

          {/* Inject horizontal rail every 8 posts - Legacy mode (not used when useProgressiveFeed=true) */}
          {(idx + 1) % INJECT_EVERY === 0 && (
            <>
              {/* Add spacing and separator line */}
              <div className="mt-6 mb-4">
                <div className="h-px bg-[var(--border)]/100 mb-4" />
                <div className="text-[var(--text)]/90 text-sm font-medium">
                  Discover More
                </div>
              </div>
              <HomeHangoutSection
                items={[]}
                loading={false}
                batchedData={batchedData}
                useProgressiveLoading={true}
                isVisible={isVisible}
                tabId={tabId}
                loadItems={railLoadItems}
                initialItems={[]}
                // [FIX: Phase 1.2 - Horizontal Rail] Use rail-specific cache functions for filters
                getCachedItems={
                  railGetCachedItemsProp
                    ? () => railGetCachedItemsProp(0)
                    : getCachedItems
                }
                setCachedItems={
                  railSetCachedItemsProp
                    ? (items: FeedItem[]) => railSetCachedItemsProp(items, 0)
                    : setCachedItems
                }
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
                slideshowHostVisible={isVisible}
                isOwner={authUserId != null && authUserId === p.author_id}
              />
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  );
}
