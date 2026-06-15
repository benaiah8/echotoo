import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";
import useScrollDirection, {
  type UseScrollDirectionOptions,
} from "../hooks/useScrollDirection";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import HomeTopBar from "../components/HomeTopBar";
import ProfileSearchResults from "../components/profile/ProfileSearchResults";
import HomeHangoutSection from "../sections/home/HomeHangoutSection";
import HomePostsSection from "../sections/home/HomePostsSection";
import {
  getPublicFeed,
  getPublicFeedOptimized,
  getPublicFeedOptimizedWithCount,
  type FeedItem,
} from "../api/queries/getPublicFeed";
import { supabase } from "../lib/supabaseClient";
import { getViewerId } from "../api/services/follows";
import { Paths } from "../router/Paths";
import { useTabActive } from "../router/PersistentTabContainer.new";
import WelcomeModal from "../components/ui/WelcomeModal";
import { dataCache } from "../lib/dataCache";
import {
  readPersistedHomeFeed,
  writePersistedHomeFeed,
} from "../lib/homeFeedListCache";
import { mixHangoutsAndExperiences } from "../lib/horizontalRailFilters";
import { filterRailsItems } from "../lib/feedExpiryFilters";
import { preloadImages } from "../lib/imageOptimization";
import { personalizeFeedBatch } from "../lib/feedPersonalization";
import { RootState } from "../app/store";
import { setAuthModal } from "../reducers/modalReducer";
import Modal from "../components/modal/Modal";
import { handleError, getErrorMessage } from "../lib/errorHandling";
import {
  HOME_TAB_REFRESH_EVENT,
  type HomeTabRefreshDetail,
} from "../lib/homeRefreshEvents";
import { useHomePullToRefresh } from "../hooks/useHomePullToRefresh";
import { dispatchBottomTabPeek } from "../lib/bottomTabPeek";
import {
  logTodaySpotlight,
  resolveDateSpotlightWithFallback,
} from "../lib/homeTodaySpotlight";
import {
  buildDateSpotlightBaseOptions,
  buildHomeVerticalFilterContext,
  buildHomeVerticalFirstPageFeedKeyOptions,
  buildRailDiscoveryCacheKeyOptions,
  buildRailDiscoveryFeedOptions,
  buildVerticalFeedOptionsProp,
  buildVerticalLoadFeedOptions,
  getFeedSearchQ,
  getVerticalSegmentType,
  hasActiveHomeFilters,
  INITIAL_HOME_DATE_FILTER,
  INITIAL_HOME_TYPE_FILTER,
  isDateSpotlightFilter,
  shouldPersonalizeHomeVerticalFeed,
  toggleHomeDateFilter,
  type HomeDateFilter,
  type HomeDateFilterChip,
} from "../lib/homeVerticalFilters";

/** After Friends-empty preflight: hide inline banner (client-side slice only; not DB-wide). */
const NO_FRIENDS_BANNER_DISMISS_MS = 2600;

/** Cumulative scroll intent for Home chrome (stricter than default `useScrollDirection`). */
const HOME_SCROLL_CHROME_OPTS: UseScrollDirectionOptions = {
  hideAfterDownPx: 80,
  showAfterUpPx: 18,
  minScrollYToHide: 100,
  noisePx: 2,
  maxDeltaPerEvent: 22,
};

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
  const [searchMode, setSearchMode] = useState<"posts" | "users">("posts");
  const [debouncedUserSearchQuery, setDebouncedUserSearchQuery] =
    useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<HomeDateFilter>(
    INITIAL_HOME_DATE_FILTER
  );
  const [friendsFilter, setFriendsFilter] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const homeTopBarRef = useRef<HTMLDivElement>(null);
  const scheduleScrollHomeFeedToTopRef = useRef<() => void>(() => {});
  const [forceRevealHeader, setForceRevealHeader] = useState(false);
  /** While search is focused (keyboard), keep top chrome pinned — scroll/IME must not slide it away. */
  const [homeSearchFocused, setHomeSearchFocused] = useState(false);

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

  /** Inline banner when Friends preflight finds zero matches (client-side slice; not DB-wide). */
  const [noFriendsInlineBannerVisible, setNoFriendsInlineBannerVisible] =
    useState(false);
  const noFriendsBannerTimerRef = useRef<number | null>(null);
  const friendsPreflightInFlightRef = useRef(false);
  const [friendsPreflightPending, setFriendsPreflightPending] = useState(false);
  const hadFriendsInFiltersRef = useRef(false);

  /** Post feed `q` only in posts mode; users mode does not send text as post `q`. */
  const feedSearchQ = useMemo(
    () => getFeedSearchQ(searchMode, search),
    [searchMode, search]
  );

  /** Dedicated Home search shell: focused search field or non-empty query. */
  const homePostSearchActive =
    homeSearchFocused || search.trim().length > 0;

  const prevHomePostSearchActiveRef = useRef(false);
  useLayoutEffect(() => {
    if (homePostSearchActive && !prevHomePostSearchActiveRef.current) {
      setSearchMode("posts");
    }
    prevHomePostSearchActiveRef.current = homePostSearchActive;
  }, [homePostSearchActive]);

  const handleHomeSearchModeChange = useCallback((mode: "posts" | "users") => {
    if (mode === "users") setFiltersOpen(false);
    setSearchMode(mode);
    scheduleScrollHomeFeedToTopRef.current();
  }, []);

  useEffect(() => {
    if (!homePostSearchActive || searchMode !== "users") {
      setDebouncedUserSearchQuery("");
      return;
    }
    const id = window.setTimeout(() => {
      setDebouncedUserSearchQuery(search);
    }, 300);
    return () => window.clearTimeout(id);
  }, [search, searchMode, homePostSearchActive]);

  const showHomePostsFeed =
    !homePostSearchActive || searchMode === "posts";
  const suppressBrowseRails =
    homePostSearchActive && searchMode === "posts";

  const dateSpotlightActive = isDateSpotlightFilter(dateFilter);

  const [dateSpotlightItems, setDateSpotlightItems] = useState<FeedItem[]>([]);
  const [dateSpotlightFallbackFilter, setDateSpotlightFallbackFilter] =
    useState<HomeDateFilterChip | null>(null);
  const [dateSpotlightFallbackItems, setDateSpotlightFallbackItems] = useState<
    FeedItem[]
  >([]);
  const [dateSpotlightLoading, setDateSpotlightLoading] = useState(false);
  const [dateSpotlightResolved, setDateSpotlightResolved] = useState(false);

  const verticalSegmentType = useMemo(
    () => getVerticalSegmentType(viewMode),
    [viewMode]
  );

  const blurHomeSearchInput = useCallback(() => {
    const input = homeTopBarRef.current?.querySelector<HTMLInputElement>(
      "[data-home-search-input]"
    );
    input?.blur();
  }, []);

  /** Exit Home search shell — clears query, posts mode, closes filters, blurs field. */
  const exitHomePostSearchMode = useCallback(() => {
    blurHomeSearchInput();
    setSearch("");
    setSearchMode("posts");
    setFiltersOpen(false);
    setHomeSearchFocused(false);
    scheduleScrollHomeFeedToTopRef.current();
  }, [blurHomeSearchInput]);

  const scrollDir = useScrollDirection(HOME_SCROLL_CHROME_OPTS);
  const isHidden = scrollDir === "down";

  const pinHomeTopBar =
    homePostSearchActive ||
    filtersOpen ||
    noFriendsInlineBannerVisible;
  const effectiveHomeTopHidden = isHidden && !pinHomeTopBar;
  /** Bar width/pill shape follows scroll only. Do not OR `homeSearchFocused` — that forced full-width on focus and broke pill + safe-area on native keyboards. Visibility while typing uses `pinHomeTopBar` above. */
  const effectiveHomeAtTop = isAtTop;

  useEffect(() => {
    if (effectiveHomeTopHidden && !forceRevealHeader) setFiltersOpen(false);
  }, [effectiveHomeTopHidden, forceRevealHeader]);

  useEffect(() => {
    if (!isHomeTabActive) return;
    dispatchBottomTabPeek("home", effectiveHomeTopHidden);
  }, [effectiveHomeTopHidden, isHomeTabActive]);

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

  const verticalFilterCtx = useMemo(
    () =>
      buildHomeVerticalFilterContext({
        viewMode,
        dateFilter,
        feedSearchQ,
        selectedTags,
        viewerProfileId,
        friendsFilter,
      }),
    [viewMode, dateFilter, feedSearchQ, selectedTags, viewerProfileId, friendsFilter]
  );

  /** Vertical-shaped probe: current type/search/tags + server-side friends-only. */
  const runFriendsPreflight = useCallback(async (): Promise<boolean> => {
    if (!viewerProfileId) return false;

    const probeCtx = buildHomeVerticalFilterContext({
      viewMode,
      dateFilter: "none",
      feedSearchQ,
      selectedTags,
      viewerProfileId,
      friendsFilter: true,
    });
    const feedOptions = buildVerticalLoadFeedOptions(probeCtx, {
      offset: 0,
      limit: 1,
    });

    if (USE_OPTIMIZED_FEED) {
      const { items } = await getPublicFeedOptimizedWithCount(feedOptions);
      return items.length > 0;
    }

    const items = await getPublicFeed(feedOptions);
    return items.length > 0;
  }, [viewMode, feedSearchQ, selectedTags, viewerProfileId]);

  const handleFriendsChipClick = useCallback(async () => {
    if (friendsPreflightInFlightRef.current) return;
    friendsPreflightInFlightRef.current = true;
    setFriendsPreflightPending(true);
    try {
      const hasMatches = await runFriendsPreflight();
      if (hasMatches) {
        setFriendsFilter(true);
        scheduleScrollHomeFeedToTopRef.current();
      } else {
        setNoFriendsInlineBannerVisible(true);
        if (noFriendsBannerTimerRef.current !== null) {
          clearTimeout(noFriendsBannerTimerRef.current);
          noFriendsBannerTimerRef.current = null;
        }
        noFriendsBannerTimerRef.current = window.setTimeout(() => {
          noFriendsBannerTimerRef.current = null;
          setNoFriendsInlineBannerVisible(false);
        }, NO_FRIENDS_BANNER_DISMISS_MS);
      }
    } finally {
      friendsPreflightInFlightRef.current = false;
      setFriendsPreflightPending(false);
    }
  }, [runFriendsPreflight]);

  useEffect(() => {
    if (hadFriendsInFiltersRef.current && !friendsFilter) {
      setNoFriendsInlineBannerVisible(false);
      if (noFriendsBannerTimerRef.current !== null) {
        clearTimeout(noFriendsBannerTimerRef.current);
        noFriendsBannerTimerRef.current = null;
      }
    }
    hadFriendsInFiltersRef.current = friendsFilter;
  }, [friendsFilter]);

  useEffect(() => {
    return () => {
      if (noFriendsBannerTimerRef.current !== null) {
        clearTimeout(noFriendsBannerTimerRef.current);
      }
    };
  }, []);

  // tweak these if your actual header/footer heights differ (floating top bar + quick chips + gradient)
  const HEADER_HEIGHT = 96;
  const FOOTER_HEIGHT = 80;

  // Track and persist scroll position per feed key to restore when navigating back
  const latestScrollRef = useRef(0);

  /** Single options object for Home vertical first-page cache key — shared by scroll purge, sync initialItems, get/set callbacks. */
  const homeVerticalFirstPageFeedKeyOptions = useMemo(
    () => buildHomeVerticalFirstPageFeedKeyOptions(verticalFilterCtx),
    [verticalFilterCtx]
  );

  // [FIX] Cache key must include viewerProfileId in dependencies to recompute when it changes
  // This ensures cache hits after profile ID resolves
  const feedCacheKey = useMemo(
    () => dataCache.generateFeedKey(homeVerticalFirstPageFeedKeyOptions),
    [homeVerticalFirstPageFeedKeyOptions]
  );

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

  const scrollHomeFeedToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    latestScrollRef.current = 0;
    saveScrollPosition(feedCacheKey, 0);
  }, [feedCacheKey, saveScrollPosition]);

  const scheduleScrollHomeFeedToTop = useCallback(() => {
    requestAnimationFrame(scrollHomeFeedToTop);
  }, [scrollHomeFeedToTop]);

  useEffect(() => {
    scheduleScrollHomeFeedToTopRef.current = scheduleScrollHomeFeedToTop;
  }, [scheduleScrollHomeFeedToTop]);

  /** Memory + persisted first-page snapshot — sync read for cold offline open before dataCache.ready. */
  const homeVerticalWarmInitialItems = useMemo((): FeedItem[] | undefined => {
    const cached = dataCache.get<FeedItem[]>(feedCacheKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    const persisted = readPersistedHomeFeed(feedCacheKey);
    if (persisted?.items?.length) return persisted.items;
    return undefined;
  }, [feedCacheKey]);

  /** Date spotlight fetch — independent of ProgressiveFeed; all date filters use spotlight. */
  useEffect(() => {
    if (!dateSpotlightActive) {
      setDateSpotlightItems([]);
      setDateSpotlightFallbackFilter(null);
      setDateSpotlightFallbackItems([]);
      setDateSpotlightLoading(false);
      setDateSpotlightResolved(false);
      logTodaySpotlight({
        dateSpotlightActive: false,
        dateFilter,
        spotlightCount: 0,
        spotlightLoading: false,
        spotlightResolved: false,
      });
      return;
    }

    let cancelled = false;
    setDateSpotlightLoading(true);
    setDateSpotlightResolved(false);
    setDateSpotlightFallbackFilter(null);
    setDateSpotlightFallbackItems([]);

    void (async () => {
      try {
        const result = await resolveDateSpotlightWithFallback(
          dateFilter,
          buildDateSpotlightBaseOptions(verticalFilterCtx),
          USE_OPTIMIZED_FEED
        );
        if (cancelled) return;
        setDateSpotlightItems(result.primaryItems);
        setDateSpotlightFallbackFilter(result.fallback?.filter ?? null);
        setDateSpotlightFallbackItems(result.fallback?.items ?? []);
        logTodaySpotlight({
          dateSpotlightActive: true,
          dateFilter,
          verticalSegment: viewMode,
          verticalType: verticalSegmentType ?? "all",
          primaryCount: result.primaryItems.length,
          fallbackFilter: result.fallback?.filter ?? null,
          fallbackCount: result.fallback?.items.length ?? 0,
          spotlightLoading: false,
          spotlightResolved: true,
        });
      } catch (err) {
        if (cancelled) return;
        console.error("[HomePage] Date spotlight fetch failed:", err);
        setDateSpotlightItems([]);
        setDateSpotlightFallbackFilter(null);
        setDateSpotlightFallbackItems([]);
        logTodaySpotlight({
          dateSpotlightActive: true,
          dateFilter,
          verticalSegment: viewMode,
          primaryCount: 0,
          fallbackCount: 0,
          error: true,
          spotlightResolved: true,
        });
      } finally {
        if (!cancelled) {
          setDateSpotlightLoading(false);
          setDateSpotlightResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    dateSpotlightActive,
    dateFilter,
    viewMode,
    verticalSegmentType,
    feedSearchQ,
    selectedTags,
    viewerProfileId,
    friendsFilter,
    verticalFilterCtx,
  ]);

  const clearAllHomeFilters = useCallback(() => {
    setDateFilter(INITIAL_HOME_DATE_FILTER);
    setViewMode(INITIAL_HOME_TYPE_FILTER);
    setFriendsFilter(false);
    setSelectedTags([]);
    setSearch("");
    setSearchMode("posts");
    setFiltersOpen(false);
    blurHomeSearchInput();
    setHomeSearchFocused(false);
    scheduleScrollHomeFeedToTop();
  }, [scheduleScrollHomeFeedToTop, blurHomeSearchInput]);

  const handleToggleDateFilter = useCallback(
    (target: HomeDateFilterChip) => {
      setDateFilter((current) => toggleHomeDateFilter(current, target));
      scheduleScrollHomeFeedToTop();
    },
    [scheduleScrollHomeFeedToTop]
  );

  const handleFriendsFilterDeactivate = useCallback(() => {
    setFriendsFilter(false);
    scheduleScrollHomeFeedToTop();
  }, [scheduleScrollHomeFeedToTop]);

  const handleViewModeChange = useCallback(
    (mode: "all" | "hangouts" | "experiences") => {
      setViewMode(mode);
      scheduleScrollHomeFeedToTop();
    },
    [scheduleScrollHomeFeedToTop]
  );

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      setSelectedTags(tags);
      scheduleScrollHomeFeedToTop();
    },
    [scheduleScrollHomeFeedToTop]
  );

  const handleSearchChange = useCallback(
    (q: string) => {
      setSearch(q);
      if (q === "") {
        scheduleScrollHomeFeedToTop();
      }
    },
    [scheduleScrollHomeFeedToTop]
  );

  /** Bumps when user taps Home while already on home — remounts feed + rail only on this page */
  const [homeRefreshEpoch, setHomeRefreshEpoch] = useState(0);

  useEffect(() => {
    const onRefreshRequest = (e: Event) => {
      if (!isHomeTabActive) {
        if (import.meta.env.DEV) {
          console.debug(
            `[${HOME_TAB_REFRESH_EVENT}] ignored (home tab not visible)`
          );
        }
        return;
      }
      const detail = (e as CustomEvent<HomeTabRefreshDetail>).detail;
      if (detail?.source === "home-tab") {
        clearAllHomeFilters();
      }
      if (import.meta.env.DEV) {
        console.debug(
          `[${HOME_TAB_REFRESH_EVENT}] remount (keeping feed/rail caches until fresh load)`
        );
      }
      /** Do not purge in-memory caches here — remount uses initialItems/getCachedItems; ProgressiveFeed/setCachedItems + RPC cache overwrite after success */
      setHomeRefreshEpoch((n) => n + 1);
    };
    window.addEventListener(HOME_TAB_REFRESH_EVENT, onRefreshRequest);
    return () => {
      window.removeEventListener(HOME_TAB_REFRESH_EVENT, onRefreshRequest);
    };
  }, [isHomeTabActive, clearAllHomeFilters]);

  const {
    pullPx,
    pullProgress,
    isRefreshing: ptrRefreshing,
  } = useHomePullToRefresh({
    enabled: isHomeTabActive,
    onCommit: () => {
      window.dispatchEvent(
        new CustomEvent(HOME_TAB_REFRESH_EVENT, {
          detail: { source: "pull" as const },
        })
      );
    },
    refreshEpoch: homeRefreshEpoch,
  });

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

  useEffect(() => {
    if (!filtersOpen) return;

    const handleOutsidePress = (event: PointerEvent) => {
      const root = homeTopBarRef.current;
      if (!root) return;
      const target = event.target as Node | null;
      if (target && root.contains(target)) return;
      setFiltersOpen(false);
    };

    document.addEventListener("pointerdown", handleOutsidePress);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePress);
    };
  }, [filtersOpen]);

  // [OPTIMIZATION: Phase 6.2 - React] Memoize callbacks to prevent unnecessary re-renders
  // Why: These callbacks are passed as props, memoization prevents child re-renders
  const handleFilterClick = useCallback(() => {
    if (homePostSearchActive && searchMode === "users") return;
    if (effectiveHomeTopHidden) {
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
  }, [effectiveHomeTopHidden, homePostSearchActive, searchMode]);

  /** Popular-tags Clear All: tags + search only (legacy drawer behavior). */
  const handleClearFilters = useCallback(() => {
    setSelectedTags([]);
    setSearch("");
    blurHomeSearchInput();
    setHomeSearchFocused(false);
    scheduleScrollHomeFeedToTop();
  }, [scheduleScrollHomeFeedToTop, blurHomeSearchInput]);

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
    () =>
      hasActiveHomeFilters({
        dateFilter,
        typeFilter: viewMode,
        friendsFilter,
        search,
        selectedTags,
      }),
    [dateFilter, viewMode, friendsFilter, search, selectedTags]
  );

  // [FIX: Phase 1.2 - Horizontal Rail] Fixed discovery fetch for injected rails
  const railLoadItems = useCallback(
    async (offset: number, limit: number) => {
      const feedOptions = buildRailDiscoveryFeedOptions({
        viewerProfileId,
        offset,
        limit: limit * 2,
      });

      const fetchedItems = USE_OPTIMIZED_FEED
        ? await getPublicFeedOptimized(feedOptions)
        : await getPublicFeed(feedOptions);

      const railsFilteredItems = filterRailsItems(fetchedItems);
      return mixHangoutsAndExperiences(railsFilteredItems, limit);
    },
    [viewerProfileId]
  );

  const railGetCachedItems = useCallback(
    (offset: number = 0) => {
      const cacheKey = dataCache.generateFeedKey(
        buildRailDiscoveryCacheKeyOptions({
          viewerProfileId,
          offset,
          limit: 20,
        })
      );
      const cached = dataCache.get<FeedItem[]>(cacheKey);
      return Array.isArray(cached) ? cached : null;
    },
    [viewerProfileId]
  );

  const railSetCachedItems = useCallback(
    (items: FeedItem[], offset: number = 0) => {
      const cacheKey = dataCache.generateFeedKey(
        buildRailDiscoveryCacheKeyOptions({
          viewerProfileId,
          offset,
          limit: 20,
        })
      );
      dataCache.set(cacheKey, items, 10 * 60 * 1000);
    },
    [viewerProfileId]
  );

  // Top horizontal rail — fixed discovery; must be unconditional hooks; see HomeHangoutSection JSX.
  const topRailLoadItems = useCallback(
    async (offset: number, limit: number) => {
      const feedOptions = buildRailDiscoveryFeedOptions({
        viewerProfileId,
        offset,
        limit: limit * 2,
      });

      const fetchedItems = USE_OPTIMIZED_FEED
        ? await getPublicFeedOptimized(feedOptions)
        : await getPublicFeed(feedOptions);

      const railsFilteredItems = filterRailsItems(fetchedItems);
      return mixHangoutsAndExperiences(railsFilteredItems, limit);
    },
    [viewerProfileId]
  );

  const topRailGetCachedItems = useCallback(() => {
    const cacheKey = dataCache.generateFeedKey(
      buildRailDiscoveryCacheKeyOptions({
        viewerProfileId,
        offset: 0,
        limit: 20,
      })
    );
    const cached = dataCache.get<FeedItem[]>(cacheKey);
    return Array.isArray(cached) ? cached : null;
  }, [viewerProfileId]);

  const topRailSetCachedItems = useCallback(
    (items: FeedItem[]) => {
      const cacheKey = dataCache.generateFeedKey(
        buildRailDiscoveryCacheKeyOptions({
          viewerProfileId,
          offset: 0,
          limit: 20,
        })
      );
      dataCache.set(cacheKey, items, 10 * 60 * 1000);
    },
    [viewerProfileId]
  );

  const searchFieldPlaceholder =
    homePostSearchActive && searchMode === "users"
      ? "Search users"
      : "Where To?";

  const homePostsLoadItems = useCallback(
    async (offset: number, limit: number) => {
      const feedOptions = buildVerticalLoadFeedOptions(verticalFilterCtx, {
        offset,
        limit,
      });
      if (USE_OPTIMIZED_FEED) {
        const { items, consumedOffset, count } =
          await getPublicFeedOptimizedWithCount(feedOptions);

        const shouldPersonalize = shouldPersonalizeHomeVerticalFeed({
          feedSearchQ,
          selectedTags,
          viewMode,
          friendsFilter,
        });

        const personalizedItemsRaw = shouldPersonalize
          ? personalizeFeedBatch(items)
          : items;

        const personalizedItems =
          shouldPersonalize &&
          personalizedItemsRaw.length !== items.length
            ? items
            : personalizedItemsRaw;

        if (import.meta.env.DEV) {
          console.log("[FeedPipeline] HomePage loadItems", {
            offset,
            limit,
            itemsFromRpc: items.length,
            afterPersonalization: personalizedItems.length,
            consumedOffset: consumedOffset ?? items.length,
            count,
            friendsFilter,
          });
        }

        return {
          items: personalizedItems,
          consumedOffset: consumedOffset ?? personalizedItems.length,
          count,
        };
      }

      const items = await getPublicFeed(feedOptions);
      const shouldPersonalize = shouldPersonalizeHomeVerticalFeed({
        feedSearchQ,
        selectedTags,
        viewMode,
        friendsFilter,
      });

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
    },
    [verticalFilterCtx, feedSearchQ, selectedTags, viewMode, friendsFilter]
  );

  const homePostsGetCachedItems = useCallback(() => {
    const cached = dataCache.get<FeedItem[]>(feedCacheKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    const persisted = readPersistedHomeFeed(feedCacheKey);
    return persisted?.items?.length ? persisted.items : null;
  }, [feedCacheKey]);

  const homePostsSetCachedItems = useCallback(
    (items: FeedItem[]) => {
      if (!Array.isArray(items) || items.length === 0) return;
      dataCache.set(feedCacheKey, items, 10 * 60 * 1000);
      writePersistedHomeFeed(feedCacheKey, items);
    },
    [feedCacheKey]
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
            top: "calc(88px + var(--safe-area-top-layout))",
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
      <PrimaryPageContainer hideUI={effectiveHomeTopHidden} capacitorNotchScrim>
        {/* Top bar: floating pill + gradient + quick chips */}
        <HomeTopBar
          containerRef={homeTopBarRef}
          isHidden={effectiveHomeTopHidden}
          atTop={effectiveHomeAtTop}
          onToggleFilters={handleFilterClick}
          onLogoClick={handleLogoClick}
          onSearch={handleSearchChange}
          search={search}
          searchMode={searchMode}
          onSearchModeChange={handleHomeSearchModeChange}
          showSearchKindToggle={false}
          homePostSearchActive={homePostSearchActive}
          onExitPostSearch={exitHomePostSearchMode}
          searchFieldPlaceholder={searchFieldPlaceholder}
          onSearchFocusChange={setHomeSearchFocused}
          hasActiveFilters={hasActiveFilters}
          filtersOpen={filtersOpen}
          selectedTags={selectedTags}
          onTagsChange={handleTagsChange}
          onClearFilters={handleClearFilters}
          viewMode={viewMode}
          setViewMode={handleViewModeChange}
          dateFilter={dateFilter}
          onToggleDateFilter={handleToggleDateFilter}
          friendsFilter={friendsFilter}
          onFriendsFilterDeactivate={handleFriendsFilterDeactivate}
          onFriendsChipClick={handleFriendsChipClick}
          friendsPreflightPending={friendsPreflightPending}
          noFriendsInlineBannerVisible={noFriendsInlineBannerVisible}
          onClearAllFilters={clearAllHomeFilters}
        />

        {/* MAIN CONTENT */}
        <div
          style={{
            paddingTop: "calc(90px + var(--safe-area-top-layout))",
            paddingBottom: FOOTER_HEIGHT,
          }}
        >
          {/* HORIZONTAL RAIL AT TOP — browse-only; hidden during post search mode (Phase 1.5) */}
          {!homePostSearchActive ? (
            <div className="w-full max-w-[640px] mx-auto px-0">
              <HomeHangoutSection
                key={`rail-top-${viewerProfileId ?? "guest"}-e${homeRefreshEpoch}`}
                items={[]}
                loading={false}
                batchedData={null} // [PHASE 1-4] Removed - PostgreSQL provides all data in FeedItem
                useProgressiveLoading={true}
                isVisible={isHomeVisible}
                tabId="home"
                hasActiveFilters={false}
                loadItems={topRailLoadItems}
                getCachedItems={topRailGetCachedItems}
                setCachedItems={topRailSetCachedItems}
              />
            </div>
          ) : null}

          {homePostSearchActive && searchMode === "users" ? (
            <div className="w-full max-w-[640px] mx-auto px-1.5 pt-1 pb-1">
              {debouncedUserSearchQuery.trim().length < 2 ? (
                <p className="text-[11px] text-[var(--text)]/75 px-2 py-2 leading-snug">
                  Type at least 2 characters to search users.
                </p>
              ) : (
                <ProfileSearchResults
                  query={debouncedUserSearchQuery}
                  viewerId={viewerProfileId}
                  layout="inline"
                  pageSize={10}
                  enableLoadMore
                />
              )}
            </div>
          ) : null}

          {/* POSTS & INJECTIONS */}
          {showHomePostsFeed ? (
          <div className="w-full max-w-[640px] mx-auto px-0">
            <HomePostsSection
              key={`home-posts-${feedCacheKey}-e${homeRefreshEpoch}`}
              suppressBrowseRails={suppressBrowseRails}
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
              loadItems={homePostsLoadItems}
              initialItems={homeVerticalWarmInitialItems}
              getCachedItems={homePostsGetCachedItems}
              setCachedItems={homePostsSetCachedItems}
              feedOptions={buildVerticalFeedOptionsProp(verticalFilterCtx)}
              dateSpotlightActive={dateSpotlightActive}
              dateFilter={dateFilter}
              dateSpotlightItems={dateSpotlightItems}
              dateSpotlightFallbackFilter={dateSpotlightFallbackFilter}
              dateSpotlightFallbackItems={dateSpotlightFallbackItems}
              dateSpotlightLoading={dateSpotlightLoading}
              dateSpotlightResolved={dateSpotlightResolved}
              railLoadItems={railLoadItems}
              railGetCachedItems={railGetCachedItems}
              railSetCachedItems={railSetCachedItems}
            />
          </div>
          ) : null}
        </div>
      </PrimaryPageContainer>

      <WelcomeModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />
    </>
  );
}
