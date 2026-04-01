import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";
import useScrollDirection from "../hooks/useScrollDirection";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import HomeTopBar from "../components/HomeTopBar";
import HomeHangoutSection from "../sections/home/HomeHangoutSection";
import HomePostsSection from "../sections/home/HomePostsSection";
import {
  getPublicFeed,
  getPublicFeedOptimized,
  getPublicFeedOptimizedWithCount,
  type FeedItem,
  type FeedOptions,
} from "../api/queries/getPublicFeed";
import { supabase } from "../lib/supabaseClient";
import { getViewerId } from "../api/services/follows";
import { Paths } from "../router/Paths";
import { useTabActive } from "../router/PersistentTabContainer.new";
import WelcomeModal from "../components/ui/WelcomeModal";
import { dataCache } from "../lib/dataCache";
import { getMutualFriends } from "../lib/mutualFriendsCache";
import {
  applyFilters,
  applyFiltersWithFallback,
  mixHangoutsAndExperiences,
  type FilterType,
  type FilteredItemsResult,
} from "../lib/horizontalRailFilters";
import { filterRailsItems } from "../lib/feedExpiryFilters";
import { preloadImages } from "../lib/imageOptimization";
import { personalizeFeedBatch } from "../lib/feedPersonalization";
import { RootState } from "../app/store";
import { setAuthModal } from "../reducers/modalReducer";
import Modal from "../components/modal/Modal";
import { handleError, getErrorMessage } from "../lib/errorHandling";
import toast from "react-hot-toast";
import EmptyRailCard from "../components/EmptyRailCard";
import { HOME_TAB_REFRESH_EVENT } from "../lib/homeRefreshEvents";
import { useHomePullToRefresh } from "../hooks/useHomePullToRefresh";

const PAGE_SIZE = 6;

// Feature flag: Enable optimized PostgreSQL function
// Set to false to use the original getPublicFeed function
const USE_OPTIMIZED_FEED = true;

// Defer work until the browser is idle (fallback to timeout)
const onIdle = (cb: () => void, timeout = 600) => {
  const anyWin = window as any;
  if (anyWin.requestIdleCallback) {
    anyWin.requestIdleCallback(cb, { timeout });
  } else {
    setTimeout(cb, timeout);
  }
};

export default function HomePage() {
  const location = useLocation();
  // [FIX] Use parent tab active status from PersistentTabContainer - single source of truth
  // Stops background fetches when Home tab is display:none (e.g. on Notifications)
  const isHomeTabActive = useTabActive("home");
  const isHomeVisible = isHomeTabActive;

  const scrollDir = useScrollDirection();
  const isHidden = scrollDir === "down";

  // At top: main bar is full-width flush; scrolled: pill shape. Hysteresis prevents flicker at boundary.
  const [isAtTop, setIsAtTop] = useState(true);
  const atTopRef = useRef(true);
  useEffect(() => {
    const check = () => {
      const y = window.scrollY;
      const cur = atTopRef.current;
      if (cur && y > 12) {
        atTopRef.current = false;
        setIsAtTop(false);
      } else if (!cur && y < 8) {
        atTopRef.current = true;
        setIsAtTop(true);
      }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  const [viewMode, setViewMode] = useState<"all" | "hangouts" | "experiences">(
    "all"
  );

  // filters
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [forceRevealHeader, setForceRevealHeader] = useState(false);
  useEffect(() => {
    if (isHidden && !forceRevealHeader) setFiltersOpen(false);
  }, [isHidden, forceRevealHeader]);

  // [REFACTOR] Removed items/loading state - ProgressiveFeed is now the single source of truth
  // This eliminates race conditions between HomePage's SWR and ProgressiveFeed's loading
  const [error, setError] = useState<string | null>(null);

  // [PHASE 1-4] Removed batchedData state - PostgreSQL function provides all data in FeedItem
  // [OPTIMIZATION: Phase 1.2 - Horizontal Rail] Removed hangouts/hangoutsLoading state
  // ProgressiveHorizontalRail now manages its own state

  // "other things you might like" (only when searching)
  const [fallbackItems, setFallbackItems] = useState<FeedItem[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  // fallback posts when tag filters return no results
  const [tagFallbackItems, setTagFallbackItems] = useState<FeedItem[]>([]);
  const [tagFallbackLoading, setTagFallbackLoading] = useState(false);
  const [showTagFallback, setShowTagFallback] = useState(false);

  // [ENHANCEMENT: Empty State + Visual Distinction] Track filteredCount for horizontal rails
  // Used to show empty card and visual distinction for filtered items
  const railFilteredCountRef = useRef<number | undefined>(undefined);

  // auth state and modal state for logo functionality
  const dispatch = useDispatch();
  const authState = useSelector((state: RootState) => state.auth);
  const isAuthenticated = !!authState?.user;
  const currentUserId = authState?.user?.id;
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Viewer profile id (profile.id) for cache scoping; different from auth user id
  // Keep stable during session; fetched once
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(() => {
    try {
      const id = localStorage.getItem("my_profile_id");
      return id ? id : null;
    } catch {
      return null;
    }
  });
  const viewerProfileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isHomeVisible) return;
    let cancelled = false;
    (async () => {
      try {
        const pid = await getViewerId();
        if (!cancelled) {
          viewerProfileIdRef.current = pid || null;
          setViewerProfileId(pid || null);
        }
      } catch {
        if (!cancelled) {
          viewerProfileIdRef.current = null;
          setViewerProfileId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isHomeVisible]);

  // tweak these if your actual header/footer heights differ (floating top bar + three-dot + gradient)
  // Three-dot pill floats over content (fixed position), so content stays at fixed padding
  const HEADER_HEIGHT = 88;
  const FOOTER_HEIGHT = 80;

  // Track and persist scroll position per feed key to restore when navigating back
  const latestScrollRef = useRef(0);

  // [FIX] Cache key must include viewerProfileId in dependencies to recompute when it changes
  // This ensures cache hits after profile ID resolves
  const feedCacheKey = useMemo(() => {
    return dataCache.generateFeedKey({
      type:
        viewMode === "hangouts"
          ? "hangout"
          : viewMode === "experiences"
          ? "experience"
          : undefined,
      q: search || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      limit: PAGE_SIZE,
      offset: 0,
      viewerProfileId: viewerProfileId ?? null, // Use state, not ref
    });
  }, [viewMode, search, selectedTags, viewerProfileId]); // Added viewerProfileId to deps

  /** Bumps when user taps Home while already on home — remounts feed + rail only on this page */
  const [homeRefreshEpoch, setHomeRefreshEpoch] = useState(0);

  /** Drop first-page caches for vertical feed + top rail (not global clearFeedCache — avoids nuking profile). */
  const purgeHomePrimaryCaches = useCallback(() => {
    try {
      dataCache.delete(feedCacheKey);
      const railKey = dataCache.generateFeedKey({
        type: undefined,
        q: search || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        filters: selectedFilters.length > 0 ? selectedFilters : undefined,
        limit: 20,
        offset: 0,
        viewerProfileId: viewerProfileId ?? null,
      });
      dataCache.delete(railKey);
    } catch (e) {
      console.warn("[HomePage] purgeHomePrimaryCaches failed", e);
    }
  }, [feedCacheKey, search, selectedTags, selectedFilters, viewerProfileId]);

  useEffect(() => {
    const onRefreshRequest = () => {
      if (!isHomeTabActive) {
        if (import.meta.env.DEV) {
          console.debug(
            `[${HOME_TAB_REFRESH_EVENT}] ignored (home tab not visible)`
          );
        }
        return;
      }
      if (import.meta.env.DEV) {
        console.debug(`[${HOME_TAB_REFRESH_EVENT}] remount + cache purge`);
      }
      purgeHomePrimaryCaches();
      setHomeRefreshEpoch((n) => n + 1);
    };
    window.addEventListener(HOME_TAB_REFRESH_EVENT, onRefreshRequest);
    return () => {
      window.removeEventListener(HOME_TAB_REFRESH_EVENT, onRefreshRequest);
    };
  }, [isHomeTabActive, purgeHomePrimaryCaches]);

  const {
    pullPx,
    pullProgress,
    isRefreshing: ptrRefreshing,
  } = useHomePullToRefresh({
    enabled: isHomeTabActive,
    onCommit: () => {
      window.dispatchEvent(new CustomEvent(HOME_TAB_REFRESH_EVENT));
    },
    refreshEpoch: homeRefreshEpoch,
  });

  const saveScrollPosition = useCallback((key: string, value: number) => {
    try {
      localStorage.setItem(
        `home_scroll:${key}`,
        JSON.stringify({ v: 1, y: Math.max(0, value) })
      );
    } catch (e) {
      // ignore storage errors
    }
  }, []);

  const getSavedScrollPosition = useCallback((key: string): number => {
    try {
      const raw = localStorage.getItem(`home_scroll:${key}`);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.y === "number") {
        return parsed.y;
      }
    } catch (e) {
      // ignore parse/storage errors
    }
    return 0;
  }, []);

  // Restore scroll on mount if we have a saved position for this feed key
  useEffect(() => {
    const savedY = getSavedScrollPosition(feedCacheKey);
    // console.log('[HomePage] 📜 Restoring scroll position:', savedY, 'for key:', feedCacheKey);
    if (savedY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, behavior: "auto" });
      });
    }
  }, [feedCacheKey, getSavedScrollPosition]);

  // Track scroll and persist on unmount
  useEffect(() => {
    const onScroll = () => {
      latestScrollRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      // console.log('[HomePage] 💾 Saving scroll position:', latestScrollRef.current, 'for key:', feedCacheKey);
      window.removeEventListener("scroll", onScroll);
      saveScrollPosition(feedCacheKey, latestScrollRef.current);
    };
  }, [feedCacheKey, saveScrollPosition]);

  // [REFACTOR] Removed hydrate/SWR/trim functions - ProgressiveFeed handles all loading
  // This eliminates race conditions and duplicate API calls

  // when filters change, clear fallback
  useEffect(() => {
    setShowTagFallback(false);
    setTagFallbackItems([]);
  }, [viewMode, search, selectedTags]);

  // [REFACTOR] Removed entire legacy loading effect - ProgressiveFeed handles all loading
  // This eliminates ~300 lines of competing logic that caused race conditions
  // [OPTIMIZATION: Phase 1.2 - Horizontal Rail] Removed old horizontal rail useEffect
  // ProgressiveHorizontalRail now handles all loading with client-side filtering

  // [REFACTOR] Removed fallback and infinite scroll logic - ProgressiveFeed handles this

  useEffect(() => {
    if (!filtersOpen) setForceRevealHeader(false);
  }, [filtersOpen]);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize callbacks to prevent unnecessary re-renders
  // Why: These callbacks are passed as props, memoization prevents child re-renders
  const handleFilterClick = useCallback(() => {
    if (isHidden) {
      setForceRevealHeader(true);
      setFiltersOpen(true);
      // nudge the page up a bit so the fixed header is visible
      window.scrollTo({
        top: Math.max(window.scrollY - (HEADER_HEIGHT + 8), 0),
        behavior: "smooth",
      });
    } else {
      setFiltersOpen((v) => !v);
    }
  }, [isHidden]);

  const handleClearFilters = useCallback(() => {
    setSelectedTags([]);
    setSearch("");
  }, []);

  // Handle logo click - show login modal if not authenticated, info popup if authenticated
  const handleLogoClick = useCallback(() => {
    if (isAuthenticated) {
      setShowInfoModal(true);
    } else {
      dispatch(setAuthModal(true));
    }
  }, [isAuthenticated, dispatch]);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize computed values
  // Why: Prevents recalculation on every render
  const hasActiveFilters = useMemo(
    () => viewMode !== "all" || search.trim() !== "" || selectedTags.length > 0,
    [viewMode, search, selectedTags]
  );

  // [FIX: Phase 1.2 - Horizontal Rail] Create railLoadItems for injected rails
  // Uses same filtering logic as top rail, but with offset to avoid duplicates
  const railLoadItems = useCallback(
    async (offset: number, limit: number) => {
      // 1. Fetch mixed content (both hangouts and experiences)
      const feedOptions: FeedOptions = {
        type: undefined, // Get both types
        q: search || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        limit: limit * 2, // Fetch more to allow for filtering
        offset,
        viewerProfileId: viewerProfileId || undefined,
      };

      const fetchedItems = USE_OPTIMIZED_FEED
        ? await getPublicFeedOptimized(feedOptions)
        : await getPublicFeed(feedOptions);

      // 2. Apply filters client-side if any are active
      if (selectedFilters.length > 0) {
        // Get mutual friends if needed
        let mutualFriends: Set<string> | null = null;
        if (selectedFilters.includes("friends") && viewerProfileId) {
          mutualFriends = await getMutualFriends(viewerProfileId);
        }

        // Apply filters with fallback (shows unfiltered items if filtered results are sparse)
        const result = applyFiltersWithFallback(
          fetchedItems,
          selectedFilters as FilterType[],
          mutualFriends,
          3, // Minimum 3 filtered items before showing fallback
          true // Always show fallback (even with 1 filtered item)
        );

        // Store filteredCount in ref for passing to components
        railFilteredCountRef.current = result.filteredCount;

        return result.items;
      }

      // 3. If no filters, mix hangouts and experiences
      // Reset filteredCount when no filters
      railFilteredCountRef.current = undefined;
      return mixHangoutsAndExperiences(fetchedItems, limit);
    },
    [search, selectedTags, selectedFilters, viewerProfileId]
  );

  const railGetCachedItems = useCallback(
    (offset: number = 0) => {
      const feedOptions = {
        type: undefined,
        q: search || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        filters: selectedFilters.length > 0 ? selectedFilters : undefined,
        limit: 20,
        offset,
        viewerProfileId: viewerProfileId ?? null,
      };
      const cacheKey = dataCache.generateFeedKey(feedOptions);
      const cached = dataCache.get<FeedItem[]>(cacheKey);
      return Array.isArray(cached) ? cached : null;
    },
    [search, selectedTags, selectedFilters, viewerProfileId]
  );

  const railSetCachedItems = useCallback(
    (items: FeedItem[], offset: number = 0) => {
      const feedOptions = {
        type: undefined,
        q: search || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        filters: selectedFilters.length > 0 ? selectedFilters : undefined,
        limit: 20,
        offset,
        viewerProfileId: viewerProfileId ?? null,
      };
      const cacheKey = dataCache.generateFeedKey(feedOptions);
      dataCache.set(cacheKey, items, 10 * 60 * 1000);
    },
    [search, selectedTags, selectedFilters, viewerProfileId]
  );

  return (
    <>
      {isHomeTabActive && (pullPx > 2 || ptrRefreshing) ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pullProgress * 100)}
          aria-label={ptrRefreshing ? "Refreshing feed" : "Pull to refresh"}
          className="pointer-events-none fixed left-0 right-0 z-[35] flex justify-center"
          style={{
            top: "calc(80px + env(safe-area-inset-top, 0px))",
            opacity: ptrRefreshing
              ? 1
              : Math.min(1, 0.12 + pullProgress * 0.88),
            transition: ptrRefreshing ? undefined : "opacity 80ms ease-out",
          }}
        >
          <span
            className={`inline-block h-7 w-7 rounded-full border-2 border-[#F7D047]/30 border-t-[#F7D047] ${
              ptrRefreshing ? "animate-spin" : ""
            }`}
            aria-hidden
          />
        </div>
      ) : null}
      <PrimaryPageContainer hideUI={isHidden} capacitorNotchScrim>
        {/* Top bar: floating pill + gradient + three-dot menu */}
        <HomeTopBar
          isHidden={isHidden}
          atTop={isAtTop}
          onToggleFilters={handleFilterClick}
          onLogoClick={handleLogoClick}
          onSearch={setSearch}
          search={search}
          hasActiveFilters={hasActiveFilters}
          filtersOpen={filtersOpen}
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
          onClearFilters={handleClearFilters}
          viewMode={viewMode}
          setViewMode={setViewMode}
          selectedFilters={selectedFilters}
          onFilterChange={setSelectedFilters}
        />

        {/* MAIN CONTENT */}
        <div
          style={{
            paddingTop: "calc(72px + env(safe-area-inset-top, 0px))",
            paddingBottom: FOOTER_HEIGHT,
          }}
        >
          {/* HORIZONTAL RAIL AT TOP - shows mixed recent content */}
          {viewMode === "all" && (
            <div className="w-full max-w-[640px] mx-auto px-0">
              <HomeHangoutSection
                key={`rail-top-${selectedFilters.join(",")}-${selectedTags.join(
                  ","
                )}-${search || ""}-e${homeRefreshEpoch}`}
                items={[]}
                loading={false}
                batchedData={null} // [PHASE 1-4] Removed - PostgreSQL provides all data in FeedItem
                // [OPTIMIZATION: Phase 1.2 - Horizontal Rail] Progressive loading with client-side filtering
                useProgressiveLoading={true}
                isVisible={isHomeVisible}
                tabId="home"
                filteredCount={railFilteredCountRef.current}
                hasActiveFilters={selectedFilters.length > 0}
                loadItems={useCallback(
                  async (offset: number, limit: number) => {
                    // 1. Fetch mixed content (both hangouts and experiences)
                    const feedOptions: FeedOptions = {
                      type: undefined, // Get both types
                      q: search || undefined,
                      tags: selectedTags.length > 0 ? selectedTags : undefined,
                      limit: limit * 2, // Fetch more to allow for filtering
                      offset,
                      viewerProfileId: viewerProfileId || undefined,
                    };

                    const fetchedItems = USE_OPTIMIZED_FEED
                      ? await getPublicFeedOptimized(feedOptions)
                      : await getPublicFeed(feedOptions);

                    // [PHASE 1] Filter rails: exclude unscheduled and expired hangouts (even via fallback)
                    // Why: Rails should only show scheduled, non-expired events
                    // This prevents fallback from reintroducing unscheduled/expired hangouts
                    const railsFilteredItems = filterRailsItems(fetchedItems);

                    // 2. Apply filters client-side if any are active
                    if (selectedFilters.length > 0) {
                      // Get mutual friends if needed
                      let mutualFriends: Set<string> | null = null;
                      if (
                        selectedFilters.includes("friends") &&
                        viewerProfileId
                      ) {
                        mutualFriends = await getMutualFriends(viewerProfileId);
                      }

                      // Apply filters with fallback (shows unfiltered items if filtered results are sparse)
                      // Note: railsFilteredItems already excludes unscheduled/expired hangouts
                      const result = applyFiltersWithFallback(
                        railsFilteredItems,
                        selectedFilters as FilterType[],
                        mutualFriends,
                        3, // Minimum 3 filtered items before showing fallback
                        true // Always show fallback (even with 1 filtered item)
                      );

                      // Store filteredCount in ref for passing to components
                      railFilteredCountRef.current = result.filteredCount;

                      return result.items;
                    }

                    // 3. If no filters, mix hangouts and experiences
                    // Note: railsFilteredItems already excludes unscheduled/expired hangouts
                    return mixHangoutsAndExperiences(railsFilteredItems, limit);
                  },
                  [search, selectedTags, selectedFilters, viewerProfileId]
                )}
                getCachedItems={useCallback(() => {
                  const feedOptions = {
                    type: undefined, // Mixed content
                    q: search || undefined,
                    tags: selectedTags.length > 0 ? selectedTags : undefined,
                    filters:
                      selectedFilters.length > 0 ? selectedFilters : undefined,
                    limit: 20,
                    offset: 0,
                    viewerProfileId: viewerProfileId ?? null,
                  };
                  const cacheKey = dataCache.generateFeedKey(feedOptions);
                  const cached = dataCache.get<FeedItem[]>(cacheKey);
                  return Array.isArray(cached) ? cached : null;
                }, [search, selectedTags, selectedFilters, viewerProfileId])}
                setCachedItems={useCallback(
                  (items: FeedItem[]) => {
                    const feedOptions = {
                      type: undefined, // Mixed content
                      q: search || undefined,
                      tags: selectedTags.length > 0 ? selectedTags : undefined,
                      filters:
                        selectedFilters.length > 0
                          ? selectedFilters
                          : undefined,
                      limit: 20,
                      offset: 0,
                      viewerProfileId: viewerProfileId ?? null,
                    };
                    const cacheKey = dataCache.generateFeedKey(feedOptions);
                    dataCache.set(cacheKey, items, 10 * 60 * 1000);
                  },
                  [search, selectedTags, selectedFilters, viewerProfileId]
                )}
              />
            </div>
          )}

          {/* POSTS & INJECTIONS */}
          <div className="w-full max-w-[640px] mx-auto px-0">
            <HomePostsSection
              key={`home-posts-${feedCacheKey}-e${homeRefreshEpoch}`}
              viewMode={viewMode}
              hasActiveFilters={hasActiveFilters}
              tagFallbackItems={tagFallbackItems}
              tagFallbackLoading={tagFallbackLoading}
              showTagFallback={showTagFallback}
              selectedTags={selectedTags}
              isVisible={isHomeVisible}
              tabId="home"
              // [REFACTOR] ProgressiveFeed now owns all loading - HomePage is thin
              useProgressiveFeed={true}
              loadItems={useCallback(
                async (offset: number, limit: number) => {
                  // [DIAG: Phase 2.2] Check what limits are being requested
                  // SILENCED: Too verbose
                  // console.log('[DIAG-HomePage] Feed load request:', {
                  //   offset,
                  //   limit,
                  //   viewMode,
                  //   hasSearch: !!search,
                  //   tagsCount: selectedTags.length,
                  //   hasViewer: !!viewerProfileId,
                  // });

                  // [FIX] Use resolved viewerProfileId state, not getViewerId() per load
                  const feedOptions: FeedOptions = {
                    type:
                      viewMode === "hangouts"
                        ? ("hangout" as const)
                        : viewMode === "experiences"
                        ? ("experience" as const)
                        : undefined,
                    q: search || undefined,
                    tags: selectedTags.length > 0 ? selectedTags : undefined,
                    limit,
                    offset,
                    viewerProfileId: viewerProfileId || undefined, // Use state
                  };
                  if (USE_OPTIMIZED_FEED) {
                    const { items, consumedOffset, count } =
                      await getPublicFeedOptimizedWithCount(feedOptions);

                    // [PHASE 4] Apply personalization to vertical feed (only when no filters active)
                    const shouldPersonalize =
                      !search &&
                      selectedTags.length === 0 &&
                      viewMode === "all";

                    const personalizedItemsRaw = shouldPersonalize
                      ? personalizeFeedBatch(items)
                      : items;

                    const personalizedItems =
                      shouldPersonalize &&
                      personalizedItemsRaw.length !== items.length
                        ? items
                        : personalizedItemsRaw;

                    // [TASK B] Feed pipeline debug
                    const DEBUG_FEED_PIPELINE = true;
                    if (DEBUG_FEED_PIPELINE) {
                      console.log("[FeedPipeline] HomePage loadItems", {
                        offset,
                        limit,
                        itemsFromRpc: items.length,
                        afterPersonalization: personalizedItems.length,
                        consumedOffset: consumedOffset ?? items.length,
                        count,
                      });
                    }

                    // consumedOffset = raw RPC length for correct pagination
                    return {
                      items: personalizedItems,
                      consumedOffset:
                        consumedOffset ?? personalizedItems.length,
                      count,
                    };
                  } else {
                    const items = await getPublicFeed(feedOptions);

                    // [PHASE 4] Apply personalization to vertical feed (only when no filters active)
                    const shouldPersonalize =
                      !search &&
                      selectedTags.length === 0 &&
                      viewMode === "all";

                    const personalizedItemsRaw = shouldPersonalize
                      ? personalizeFeedBatch(items)
                      : items;

                    const personalizedItems =
                      shouldPersonalize &&
                      personalizedItemsRaw.length !== items.length
                        ? items
                        : personalizedItemsRaw;

                    return {
                      items: personalizedItems,
                      consumedOffset: personalizedItems.length,
                      count: personalizedItems.length,
                    };
                  }
                },
                [search, selectedTags, viewMode, viewerProfileId] // Added viewerProfileId
              )}
              getCachedItems={useCallback(() => {
                const feedOptions = {
                  type:
                    viewMode === "hangouts"
                      ? "hangout"
                      : viewMode === "experiences"
                      ? "experience"
                      : undefined,
                  q: search || undefined,
                  tags: selectedTags.length > 0 ? selectedTags : undefined,
                  limit: PAGE_SIZE,
                  offset: 0,
                  viewerProfileId: viewerProfileId ?? null, // Use state
                };
                const cacheKey = dataCache.generateFeedKey(feedOptions);
                const cached = dataCache.get<FeedItem[]>(cacheKey);
                return Array.isArray(cached) ? cached : null;
              }, [search, selectedTags, viewMode, viewerProfileId])} // Added viewerProfileId
              setCachedItems={useCallback(
                (items: FeedItem[]) => {
                  const feedOptions = {
                    type:
                      viewMode === "hangouts"
                        ? "hangout"
                        : viewMode === "experiences"
                        ? "experience"
                        : undefined,
                    q: search || undefined,
                    tags: selectedTags.length > 0 ? selectedTags : undefined,
                    limit: PAGE_SIZE,
                    offset: 0,
                    viewerProfileId: viewerProfileId ?? null, // Use state
                  };
                  const cacheKey = dataCache.generateFeedKey(feedOptions);
                  dataCache.set(cacheKey, items, 10 * 60 * 1000);
                },
                [search, selectedTags, viewMode, viewerProfileId] // Added viewerProfileId
              )}
              feedOptions={{
                type:
                  viewMode === "hangouts"
                    ? "hangout"
                    : viewMode === "experiences"
                    ? "experience"
                    : undefined,
                q: search || undefined,
                tags: selectedTags.length > 0 ? selectedTags : undefined,
                currentUserId: viewerProfileId ?? null, // Use state for feedKey
              }}
              // [FIX: Phase 1.2 - Horizontal Rail] Pass railLoadItems and cache functions for injected rails
              railLoadItems={viewMode === "all" ? railLoadItems : undefined}
              railGetCachedItems={
                viewMode === "all" ? railGetCachedItems : undefined
              }
              railSetCachedItems={
                viewMode === "all" ? railSetCachedItems : undefined
              }
              selectedFilters={selectedFilters}
            />
          </div>
        </div>
      </PrimaryPageContainer>

      <WelcomeModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />
    </>
  );
}
