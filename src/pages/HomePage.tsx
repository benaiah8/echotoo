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
import { HomeSearchLayer } from "../components/home/HomeSearchDock";
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
import HomeTour from "../components/homeTour/HomeTour";
import { dataCache } from "../lib/dataCache";
import {
  readHomeFeedHydrationSnapshot,
  writeHomeFeedDisplaySnapshot,
} from "../lib/homeFeedListCache";
import { seedSocialActionsFromFeedItems } from "../lib/seedSocialActionsFromFeed";
import { seedPublishedMediaFromFeedItems } from "../lib/publishedMedia";
import { applyPendingPostPatchesToItems } from "../lib/pendingPostPatches";
import {
  sortDiscoveryHangoutsBySocialSignal,
  takeDiscoveryHangouts,
} from "../lib/horizontalRailFilters";
import { filterRailsItems, filterExpiredHangouts } from "../lib/feedExpiryFilters";
import { HOME_EVENT_TIMEZONE, HOME_FEED_FIRST_PAGE } from "../lib/homeFeedConstants";
import {
  applyHomeFeedCycleState,
  buildUnseenHomeReplacementPage,
  filterUnseenCycleItems,
  getHomeFeedCycle,
  homeFeedCycleViewerKey,
  isHomeFeedCycleExhausted,
  applyRefreshEventNudge,
  recordHomeFeedCycleDelivery,
  resetHomeFeedCycle,
  stampHomeFeedPresentationKeys,
  startNextHomeFeedCycle,
} from "../lib/homeFeedCycle";
import type { FeedItemWithDates } from "../lib/feedSorting";
import { preloadImages } from "../lib/imageOptimization";
import { personalizeFeedBatch } from "../lib/feedPersonalization";
import { RootState } from "../app/store";
import { setAuthModal } from "../reducers/modalReducer";
import type { WelcomeModalCloseSource } from "../components/ui/WelcomeModal";
import Modal from "../components/modal/Modal";
import { handleError, getErrorMessage } from "../lib/errorHandling";
import {
  HOME_TAB_REFRESH_EVENT,
  type HomeTabRefreshDetail,
} from "../lib/homeRefreshEvents";
import { useHomePullToRefresh } from "../hooks/useHomePullToRefresh";
import { useOverlayBackgroundScrollLock } from "../hooks/useOverlayBackgroundScrollLock";
import { dispatchBottomTabPeek } from "../lib/bottomTabPeek";
import { setHomeSearchTabChromeHidden } from "../lib/homeSearchTabChrome";
import { moveFocusOutOfHomeSearchHiddenTrees } from "../lib/moveFocusOutOfHomeSearchHiddenTrees";
import { subscribeAndroidHardwareBack } from "../lib/androidPostDetailModalBack";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";
import { isPostDetailRoutePath } from "../lib/inviteOverlayHistory";
import {
  applyHomeFilterTransition,
  buildHomeVerticalFilterContext,
  buildHomeVerticalFirstPageFeedKeyOptions,
  buildRailDiscoveryCacheKeyOptions,
  buildRailDiscoveryFeedOptions,
  buildVerticalFeedOptionsProp,
  buildVerticalLoadFeedOptions,
  getFeedSearchQ,
  hasActiveHomeFilters,
  hasExplicitHomeContentFilters,
  INITIAL_HOME_DATE_FILTER,
  INITIAL_HOME_TYPE_FILTER,
  isTrueDefaultAllVerticalFeed,
  shouldPersonalizeHomeVerticalFeed,
  shouldShowHomeDiscoveryRails,
  type HomeDateFilter,
  type HomeDateFilterChip,
  type HomeFilterAction,
  type HomeVerticalFilterContext,
} from "../lib/homeVerticalFilters";

/** Synthetic history marker while Home search shell is open (browser / iOS swipe back). */
const HOME_SEARCH_HISTORY_MARKER = "homeSearchShell";

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
  /** Settled zero posts in search overlay — drives Search users ripple. */
  const [searchPostsEmptyActive, setSearchPostsEmptyActive] = useState(false);
  const [selectedTags] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<HomeDateFilter>(
    INITIAL_HOME_DATE_FILTER
  );
  const [friendsFilter, setFriendsFilter] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const homeTopBarRef = useRef<HTMLDivElement>(null);
  /** Browse feed shell — gets aria-hidden/inert while Home search is active. */
  const homeBrowseRef = useRef<HTMLDivElement>(null);
  const scheduleScrollHomeFeedToTopRef = useRef<() => void>(() => {});
  const [forceRevealHeader, setForceRevealHeader] = useState(false);
  /** Input focus (keyboard) only — blur must not exit search shell. */
  const [homeSearchFocused, setHomeSearchFocused] = useState(false);
  /** Search shell stays open until X, back, or full reset; survives blur / keyboard dismiss. */
  const [homeSearchShellOpen, setHomeSearchShellOpen] = useState(false);
  const homeSearchHistoryPushedRef = useRef(false);
  const homeSearchSkipPopstateRef = useRef(false);
  /** Ignore WebView/history focus restoration so exit cannot immediately reopen search. */
  const homeSearchIgnoreFocusRef = useRef(false);
  /** Browse window Y captured once when search activates. */
  const preSearchScrollYRef = useRef(0);
  /** Search-only inner scroll layer (keyboard open — avoids window scroll + fixed header drift). */
  const homeSearchScrollRef = useRef<HTMLDivElement>(null);

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

  /** Post feed `q` only in posts mode; users mode does not send text as post `q`. */
  const feedSearchQ = useMemo(
    () => getFeedSearchQ(searchMode, search),
    [searchMode, search]
  );

  /** Dedicated Home search shell: explicit open or non-empty query. */
  const homePostSearchActive =
    homeSearchShellOpen || search.trim().length > 0;

  const prevHomePostSearchActiveRef = useRef(false);
  useLayoutEffect(() => {
    if (homePostSearchActive && !prevHomePostSearchActiveRef.current) {
      setSearchMode("posts");
      // Safety net: if focus was left in browse/tab when search activated, park it on the field.
      moveFocusOutOfHomeSearchHiddenTrees({
        browseRoot: homeBrowseRef.current,
        searchInputHost: homeTopBarRef.current,
      });
    }
    prevHomePostSearchActiveRef.current = homePostSearchActive;
  }, [homePostSearchActive]);

  const handleHomeSearchModeChange = useCallback((mode: "posts" | "users") => {
    if (mode === "users") setFiltersOpen(false);
    setSearchMode(mode);
    if (homeSearchScrollRef.current) {
      homeSearchScrollRef.current.scrollTop = 0;
    }
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

  const blurHomeSearchInput = useCallback(() => {
    const input = homeTopBarRef.current?.querySelector<HTMLInputElement>(
      "[data-home-search-input]"
    );
    input?.blur();
  }, []);

  const handleHomeSearchFocusChange = useCallback((focused: boolean) => {
    if (focused && homeSearchIgnoreFocusRef.current) {
      blurHomeSearchInput();
      return;
    }
    setHomeSearchFocused(focused);
    if (focused) setHomeSearchShellOpen(true);
  }, [blurHomeSearchInput]);

  const handleHomeSearchInputPointerDown = useCallback(() => {
    homeSearchIgnoreFocusRef.current = false;
  }, []);

  /** Exit Home search shell — clears query, posts mode, closes filters, blurs field. */
  const exitHomePostSearchMode = useCallback(() => {
    homeSearchIgnoreFocusRef.current = true;
    blurHomeSearchInput();
    setHomeSearchShellOpen(false);
    setSearch("");
    setSearchMode("posts");
    setFiltersOpen(false);
    setHomeSearchFocused(false);
  }, [blurHomeSearchInput]);

  const exitHomePostSearchModeRef = useRef(exitHomePostSearchMode);
  exitHomePostSearchModeRef.current = exitHomePostSearchMode;

  const filtersOpenRef = useRef(filtersOpen);
  filtersOpenRef.current = filtersOpen;

  const handleHomeSearchBackAction = useCallback(() => {
    if (filtersOpenRef.current) {
      setFiltersOpen(false);
      return;
    }
    exitHomePostSearchModeRef.current();
  }, []);

  const engageHomeSearchBack =
    isHomeTabActive &&
    homeSearchShellOpen &&
    !isPostDetailRoutePath(location.pathname);

  /** One synthetic history entry while search is open. Listeners removed before any cleanup pop. */
  useEffect(() => {
    if (!engageHomeSearchBack) {
      if (homeSearchHistoryPushedRef.current) {
        const st = window.history.state as Record<string, boolean> | null;
        if (st && st[HOME_SEARCH_HISTORY_MARKER] === true) {
          window.history.back();
        }
        homeSearchHistoryPushedRef.current = false;
      }
      homeSearchSkipPopstateRef.current = false;
      return;
    }

    if (!homeSearchHistoryPushedRef.current) {
      window.history.pushState(
        { [HOME_SEARCH_HISTORY_MARKER]: true } as Record<string, boolean>,
        "",
        window.location.href
      );
      homeSearchHistoryPushedRef.current = true;
    }

    const onPopState = () => {
      if (homeSearchSkipPopstateRef.current) {
        homeSearchSkipPopstateRef.current = false;
        return;
      }
      exitHomePostSearchModeRef.current();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleHomeSearchBackAction();
      }
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    const unsubAndroid = subscribeAndroidHardwareBack(() => {
      handleHomeSearchBackAction();
    });

    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      unsubAndroid();
    };
  }, [engageHomeSearchBack, handleHomeSearchBackAction]);

  const scrollDir = useScrollDirection(HOME_SCROLL_CHROME_OPTS);
  const isHidden = scrollDir === "down";

  const pinHomeTopBar =
    homePostSearchActive ||
    filtersOpen;
  /** Never slide chrome off-screen while the Home search shell is open (focused or typed query), even if scroll/pin state ever diverges. */
  const effectiveHomeTopHidden =
    !homePostSearchActive && isHidden && !pinHomeTopBar;
  /** Bar width/pill shape follows scroll in browse mode only; frozen full-width while search shell is open. */
  const effectiveHomeAtTop = homePostSearchActive ? true : isAtTop;

  useEffect(() => {
    if (effectiveHomeTopHidden && !forceRevealHeader) setFiltersOpen(false);
  }, [effectiveHomeTopHidden, forceRevealHeader]);

  useEffect(() => {
    if (!isHomeTabActive) return;
    dispatchBottomTabPeek("home", effectiveHomeTopHidden);
  }, [effectiveHomeTopHidden, isHomeTabActive]);

  useEffect(() => {
    const hide = isHomeTabActive && homePostSearchActive;
    if (hide) {
      // BottomTab applies aria-hidden on the next paint after this store write —
      // clear tab focus first so the tab chrome hide does not warn.
      moveFocusOutOfHomeSearchHiddenTrees({
        browseRoot: homeBrowseRef.current,
        searchInputHost: homeTopBarRef.current,
      });
    }
    setHomeSearchTabChromeHidden(hide);
    return () => {
      setHomeSearchTabChromeHidden(false);
    };
  }, [isHomeTabActive, homePostSearchActive]);

  // auth state for feed personalization
  const dispatch = useDispatch();
  const authState = useSelector((state: RootState) => state.auth);
  const isAuthenticated = !!authState?.user;
  const currentUserId = authState?.user?.id;
  const [showInfoModal, setShowInfoModal] = useState(false);
  const pendingAuthAfterWelcomeCloseRef = useRef(false);

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

  const browseFilterCtx = useMemo(
    () =>
      buildHomeVerticalFilterContext({
        viewMode,
        dateFilter,
        selectedTags,
        viewerProfileId,
        friendsFilter,
      }),
    [viewMode, dateFilter, selectedTags, viewerProfileId, friendsFilter]
  );

  const searchFilterCtx = useMemo(
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

  // tweak these if your actual header/footer heights differ (floating top bar + quick chips + gradient)
  const HEADER_HEIGHT = 96;
  const FOOTER_HEIGHT = 80;
  /** Inner search scroll shell — header row only (tabs live in the bottom dock). */
  const HOME_SEARCH_SCROLL_TOP = "calc(58px + var(--safe-area-top-layout))";

  // Track and persist scroll position per feed key to restore when navigating back
  const latestScrollRef = useRef(0);

  /** Browse first-page cache key — never includes search `q`. */
  const browseVerticalFirstPageFeedKeyOptions = useMemo(
    () => buildHomeVerticalFirstPageFeedKeyOptions(browseFilterCtx),
    [browseFilterCtx]
  );

  const browseFeedCacheKey = useMemo(
    () => dataCache.generateFeedKey(browseVerticalFirstPageFeedKeyOptions),
    [browseVerticalFirstPageFeedKeyOptions]
  );

  const searchVerticalFirstPageFeedKeyOptions = useMemo(
    () => buildHomeVerticalFirstPageFeedKeyOptions(searchFilterCtx),
    [searchFilterCtx]
  );

  const searchFeedCacheKey = useMemo(
    () => dataCache.generateFeedKey(searchVerticalFirstPageFeedKeyOptions),
    [searchVerticalFirstPageFeedKeyOptions]
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
    if (homeSearchScrollRef.current) {
      homeSearchScrollRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: "auto" });
    latestScrollRef.current = 0;
    saveScrollPosition(browseFeedCacheKey, 0);
  }, [browseFeedCacheKey, saveScrollPosition]);

  const scheduleScrollHomeFeedToTop = useCallback(() => {
    requestAnimationFrame(scrollHomeFeedToTop);
  }, [scrollHomeFeedToTop]);

  useEffect(() => {
    scheduleScrollHomeFeedToTopRef.current = scheduleScrollHomeFeedToTop;
  }, [scheduleScrollHomeFeedToTop]);

  const prevSearchActiveForScrollRef = useRef(false);
  useLayoutEffect(() => {
    if (homePostSearchActive && !prevSearchActiveForScrollRef.current) {
      const y = window.scrollY;
      preSearchScrollYRef.current = y;
      saveScrollPosition(browseFeedCacheKey, y);
    }
    prevSearchActiveForScrollRef.current = homePostSearchActive;
  }, [homePostSearchActive, browseFeedCacheKey, saveScrollPosition]);

  /**
   * Search mode: nested-safe document freeze. Browse Y is captured in the
   * layout effect above (and persisted for feed restore); the canonical lock
   * snapshots/restores window scroll itself — no second HomePage scrollTo.
   */
  useOverlayBackgroundScrollLock(homePostSearchActive && isHomeTabActive);

  const readWarmFeedItems = useCallback((cacheKey: string): FeedItem[] | undefined => {
    const snapshot = readHomeFeedHydrationSnapshot(cacheKey, (key) =>
      dataCache.get<FeedItem[]>(key)
    );
    if (!snapshot?.items?.length) return undefined;
    const patched = applyPendingPostPatchesToItems(snapshot.items);
    seedPublishedMediaFromFeedItems({
      items: patched,
      viewerUserId: currentUserId ?? null,
      source: snapshot.source === "persist" ? "persist" : "warm",
      snapshotTs: snapshot.snapshotTs,
    });
    return patched;
  }, [currentUserId]);

  const browseVerticalWarmInitialItems = useMemo(
    (): FeedItem[] | undefined => readWarmFeedItems(browseFeedCacheKey),
    [browseFeedCacheKey, readWarmFeedItems]
  );

  const searchVerticalWarmInitialItems = useMemo(
    (): FeedItem[] | undefined => readWarmFeedItems(searchFeedCacheKey),
    [searchFeedCacheKey, readWarmFeedItems]
  );

  useLayoutEffect(() => {
    seedSocialActionsFromFeedItems(browseVerticalWarmInitialItems);
    seedSocialActionsFromFeedItems(searchVerticalWarmInitialItems);
  }, [browseVerticalWarmInitialItems, searchVerticalWarmInitialItems]);

  const homeFilterStateRef = useRef({
    dateFilter,
    viewMode,
    friendsFilter,
  });
  homeFilterStateRef.current = { dateFilter, viewMode, friendsFilter };

  const applyHomeFilterAction = useCallback(
    (action: HomeFilterAction) => {
      const next = applyHomeFilterTransition(homeFilterStateRef.current, action);
      setDateFilter(next.dateFilter);
      setViewMode(next.viewMode);
      setFriendsFilter(next.friendsFilter);
      setFiltersOpen(false);
      scheduleScrollHomeFeedToTop();
    },
    [scheduleScrollHomeFeedToTop]
  );

  const clearAllHomeFilters = useCallback(() => {
    homeSearchIgnoreFocusRef.current = true;
    const cleared = applyHomeFilterTransition(
      homeFilterStateRef.current,
      { type: "clearAll" }
    );
    setDateFilter(cleared.dateFilter);
    setViewMode(cleared.viewMode);
    setFriendsFilter(cleared.friendsFilter);
    setHomeSearchShellOpen(false);
    setSearch("");
    setSearchMode("posts");
    setFiltersOpen(false);
    blurHomeSearchInput();
    setHomeSearchFocused(false);
    scheduleScrollHomeFeedToTop();
  }, [scheduleScrollHomeFeedToTop, blurHomeSearchInput]);

  const handleToggleDateFilter = useCallback(
    (target: HomeDateFilterChip) => {
      applyHomeFilterAction({ type: "toggleDate", target });
    },
    [applyHomeFilterAction]
  );

  const handleToggleTypeFilter = useCallback(
    (target: "hangouts" | "experiences") => {
      applyHomeFilterAction(
        target === "hangouts" ? { type: "toggleEvents" } : { type: "togglePlaces" }
      );
    },
    [applyHomeFilterAction]
  );

  const handleToggleFriends = useCallback(() => {
    applyHomeFilterAction({ type: "toggleFriends" });
  }, [applyHomeFilterAction]);

  const handleSearchChange = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      // Before browse/tab get aria-hidden, move focus out of those trees.
      if (!homePostSearchActive && trimmed.length > 0) {
        moveFocusOutOfHomeSearchHiddenTrees({
          browseRoot: homeBrowseRef.current,
          searchInputHost: homeTopBarRef.current,
        });
      }
      if (trimmed.length > 0) setHomeSearchShellOpen(true);
      setSearch(q);
      if (q === "" && homeSearchScrollRef.current) {
        homeSearchScrollRef.current.scrollTop = 0;
      }
    },
    [homePostSearchActive]
  );

  /** Bumps when user taps Home while already on home — remounts rail; default-All posts replace in place */
  const [homeRefreshEpoch, setHomeRefreshEpoch] = useState(0);
  /** In-place Home feed soft refresh (native resume) without remounting ProgressiveFeed */
  const [homeFeedSoftRefreshEpoch, setHomeFeedSoftRefreshEpoch] = useState(1);
  const [homeListReplaceRevision, setHomeListReplaceRevision] = useState(0);
  const [homeListReplaceItems, setHomeListReplaceItems] = useState<
    FeedItem[] | null
  >(null);
  const [homeListReplaceBackendOffset, setHomeListReplaceBackendOffset] =
    useState<number | undefined>(undefined);
  const [homeListReplaceCount, setHomeListReplaceCount] = useState<
    number | undefined
  >(undefined);
  const [homeListReplaceCountIsAuthoritative, setHomeListReplaceCountIsAuthoritative] =
    useState<boolean | undefined>(undefined);
  const [homeCycleTick, setHomeCycleTick] = useState(0);
  const homeReplaceInFlightRef = useRef(false);
  const prevCycleViewerKeyRef = useRef<string | null>(null);
  const isHomeTabActiveRef = useRef(isHomeTabActive);
  isHomeTabActiveRef.current = isHomeTabActive;

  const browseIsTrueDefaultAll = isTrueDefaultAllVerticalFeed(browseFilterCtx);
  const cycleViewerKey = homeFeedCycleViewerKey(viewerProfileId);
  const homeCycleReplacedThisCycle = useMemo(
    () => getHomeFeedCycle(cycleViewerKey).replacedThisCycle,
    [cycleViewerKey, homeCycleTick]
  );

  const browseVerticalWarmInitialItemsStamped = useMemo(():
    | FeedItem[]
    | undefined => {
    if (!browseVerticalWarmInitialItems?.length) {
      return browseVerticalWarmInitialItems;
    }
    if (!browseIsTrueDefaultAll) return browseVerticalWarmInitialItems;
    const cycleId = getHomeFeedCycle(cycleViewerKey).cycleId;
    return stampHomeFeedPresentationKeys(
      browseVerticalWarmInitialItems,
      cycleId
    );
  }, [
    browseVerticalWarmInitialItems,
    browseIsTrueDefaultAll,
    cycleViewerKey,
    homeCycleTick,
  ]);

  useEffect(() => {
    if (
      prevCycleViewerKeyRef.current &&
      prevCycleViewerKeyRef.current !== cycleViewerKey
    ) {
      resetHomeFeedCycle(prevCycleViewerKeyRef.current);
    }
    prevCycleViewerKeyRef.current = cycleViewerKey;
  }, [cycleViewerKey]);

  useEffect(() => {
    if (!browseIsTrueDefaultAll) return;
    const seeded = browseVerticalWarmInitialItems;
    if (!seeded?.length) return;
    const viewerKey = homeFeedCycleViewerKey(viewerProfileId);
    const cycle = getHomeFeedCycle(viewerKey);
    applyHomeFeedCycleState(
      viewerKey,
      recordHomeFeedCycleDelivery(cycle, {
        deliveredItems: seeded,
        requestOffset: cycle.cursorOffset,
        consumedOffset: 0,
      })
    );
  }, [
    browseIsTrueDefaultAll,
    browseVerticalWarmInitialItems,
    viewerProfileId,
  ]);

  const runUnseenHomeReplacement = useCallback(async () => {
    if (homeReplaceInFlightRef.current) return;
    homeReplaceInFlightRef.current = true;
    try {
      const viewerKey = homeFeedCycleViewerKey(viewerProfileIdRef.current);
      const state = getHomeFeedCycle(viewerKey);
      const defaultAllCtx = buildHomeVerticalFilterContext({
        viewMode: "all",
        dateFilter: "none",
        selectedTags: [],
        viewerProfileId: viewerProfileIdRef.current,
        friendsFilter: false,
      });
      const result = await buildUnseenHomeReplacementPage({
        pageSize: HOME_FEED_FIRST_PAGE,
        state,
        peekOffset0: async () => {
          const page = await getPublicFeedOptimizedWithCount({
            ...buildVerticalLoadFeedOptions(defaultAllCtx, {
              offset: 0,
              limit: HOME_FEED_FIRST_PAGE,
            }),
            skipMemoryCache: true,
          });
          return {
            items: page.items,
            consumedOffset: page.consumedOffset ?? page.items.length,
            count: page.count,
            countIsAuthoritative: page.countIsAuthoritative,
          };
        },
        fetchAtOffset: async (offset, limit) => {
          const page = await getPublicFeedOptimizedWithCount(
            buildVerticalLoadFeedOptions(defaultAllCtx, { offset, limit })
          );
          return {
            items: page.items,
            consumedOffset: page.consumedOffset ?? page.items.length,
            count: page.count,
            countIsAuthoritative: page.countIsAuthoritative,
          };
        },
      });
      if (!result.ok) return;
      applyHomeFeedCycleState(viewerKey, result.nextState);
      // Phase 2B.2C: soft Event front-nudge on explicit refresh page only.
      const refreshedItems = applyRefreshEventNudge(result.items, {
        frontWindow: 6,
        desiredUpcomingEvents: 2,
        maxPromotions: 2,
        timeZone: HOME_EVENT_TIMEZONE,
      });
      seedSocialActionsFromFeedItems(refreshedItems);
      seedPublishedMediaFromFeedItems({
        items: refreshedItems,
        viewerUserId: currentUserId ?? null,
        source: "feed",
      });
      setHomeListReplaceItems(refreshedItems);
      setHomeListReplaceBackendOffset(result.nextState.cursorOffset);
      setHomeListReplaceCount(
        result.nextState.authoritativeCount ?? undefined
      );
      setHomeListReplaceCountIsAuthoritative(
        result.nextState.authoritativeCount != null
      );
      setHomeListReplaceRevision((n) => n + 1);
      setHomeCycleTick((n) => n + 1);
    } finally {
      homeReplaceInFlightRef.current = false;
    }
  }, [currentUserId]);

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
      const currentlyDefaultAll = isTrueDefaultAllVerticalFeed(
        browseFilterCtx
      );
      if (detail?.source === "home-tab") {
        clearAllHomeFilters();
      }
      const rotateUnseen =
        detail?.source === "home-tab" || currentlyDefaultAll;
      if (import.meta.env.DEV) {
        console.debug(
          `[${HOME_TAB_REFRESH_EVENT}] ${
            rotateUnseen
              ? "unseen-first replacement"
              : "remount (keeping feed/rail caches until fresh load)"
          }`
        );
      }
      /** Do not purge in-memory caches here — remount uses initialItems/getCachedItems; ProgressiveFeed/setCachedItems + RPC cache overwrite after success */
      setHomeRefreshEpoch((n) => n + 1);
      if (rotateUnseen) {
        void runUnseenHomeReplacement();
      }
    };
    window.addEventListener(HOME_TAB_REFRESH_EVENT, onRefreshRequest);
    return () => {
      window.removeEventListener(HOME_TAB_REFRESH_EVENT, onRefreshRequest);
    };
  }, [
    isHomeTabActive,
    clearAllHomeFilters,
    browseFilterCtx,
    runUnseenHomeReplacement,
  ]);

  useEffect(() => {
    if (!isNativeApp()) return;

    let cancelled = false;
    let removeResume: (() => void) | undefined;

    void (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("resume", () => {
          if (!isHomeTabActiveRef.current) return;
          setHomeFeedSoftRefreshEpoch((n) => n + 1);
        });
        if (!cancelled) {
          removeResume = () => {
            void handle.remove();
          };
        } else {
          void handle.remove();
        }
      } catch {
        /* noop */
      }
    })();

    return () => {
      cancelled = true;
      removeResume?.();
    };
  }, []);

  const {
    pullPx,
    pullProgress,
    isRefreshing: ptrRefreshing,
  } = useHomePullToRefresh({
    enabled:
      isHomeTabActive &&
      !homePostSearchActive &&
      !isPostDetailRoutePath(location.pathname) &&
      !showInfoModal,
    onCommit: () => {
      window.dispatchEvent(
        new CustomEvent(HOME_TAB_REFRESH_EVENT, {
          detail: { source: "pull" as const },
        })
      );
    },
    refreshEpoch: homeRefreshEpoch,
  });

  // Restore scroll on mount / browse-key change — never while search overlay is open.
  useEffect(() => {
    if (homePostSearchActive) return;
    const savedY = getSavedScrollPosition(browseFeedCacheKey);
    if (savedY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedY, behavior: "auto" });
      });
    }
  }, [browseFeedCacheKey, getSavedScrollPosition, homePostSearchActive]);

  // Track scroll and persist on unmount using the browse key only.
  useEffect(() => {
    const onScroll = () => {
      latestScrollRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (!homePostSearchActive) {
        saveScrollPosition(browseFeedCacheKey, latestScrollRef.current);
      }
    };
  }, [browseFeedCacheKey, saveScrollPosition, homePostSearchActive]);

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
      // Home Tour owns the screen while open — don't fight Date/Time spotlight.
      if (document.querySelector("[data-home-tour-overlay]")) return;
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

  /** Home Tour: open filter UI only — never toggle chips / search / viewMode. */
  const onOpenTourFilters = useCallback(() => {
    if (homePostSearchActive && searchMode === "users") return;
    setForceRevealHeader(true);
    setFiltersOpen(true);
  }, [homePostSearchActive, searchMode]);

  const onCloseTourFilters = useCallback(() => {
    setFiltersOpen(false);
  }, []);

  /** One-shot Home top + chrome reveal before tour scroll lock. */
  const onPrepareTourStart = useCallback(() => {
    setForceRevealHeader(true);
    scrollHomeFeedToTop();
  }, [scrollHomeFeedToTop]);

  // Logo opens brand/about info; logged-out X close may open auth (see handleWelcomeClose)
  const handleLogoClick = useCallback(() => {
    pendingAuthAfterWelcomeCloseRef.current = !isAuthenticated;
    setShowInfoModal(true);
  }, [isAuthenticated]);

  const handleWelcomeClose = useCallback(
    (source: WelcomeModalCloseSource) => {
      const pendingAuth = pendingAuthAfterWelcomeCloseRef.current;
      pendingAuthAfterWelcomeCloseRef.current = false;
      setShowInfoModal(false);

      if (source !== "x" || !pendingAuth || authState?.user) {
        return;
      }

      requestAnimationFrame(() => {
        dispatch(setAuthModal(true));
      });
    },
    [authState?.user, dispatch]
  );

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

  const browseHasActiveFilters = useMemo(
    () =>
      hasActiveHomeFilters({
        dateFilter,
        typeFilter: viewMode,
        friendsFilter,
        search: "",
        selectedTags,
      }),
    [dateFilter, viewMode, friendsFilter, selectedTags]
  );

  const explicitContentFilters = useMemo(
    () =>
      hasExplicitHomeContentFilters({
        dateFilter,
        viewMode,
        friendsFilter,
      }),
    [dateFilter, viewMode, friendsFilter]
  );

  const showHomeDiscoveryRails = useMemo(
    () =>
      shouldShowHomeDiscoveryRails({
        dateFilter,
        viewMode,
        friendsFilter,
      }),
    [dateFilter, viewMode, friendsFilter]
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

      const railsFilteredItems = filterRailsItems(
        fetchedItems,
        new Date(),
        HOME_EVENT_TIMEZONE
      );
      // All hangouts from this page, social-signal sort, then cap for the rail window.
      const events = takeDiscoveryHangouts(
        railsFilteredItems,
        railsFilteredItems.length
      );
      return sortDiscoveryHangoutsBySocialSignal(events).slice(0, limit);
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
      if (!Array.isArray(cached)) return null;
      // Harden against pre–Event-only mixed cache; re-apply social sort.
      const eventsOnly = sortDiscoveryHangoutsBySocialSignal(
        takeDiscoveryHangouts(cached, cached.length)
      );
      return eventsOnly.length > 0 ? eventsOnly : null;
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

      const railsFilteredItems = filterRailsItems(
        fetchedItems,
        new Date(),
        HOME_EVENT_TIMEZONE
      );
      const events = takeDiscoveryHangouts(
        railsFilteredItems,
        railsFilteredItems.length
      );
      return sortDiscoveryHangoutsBySocialSignal(events).slice(0, limit);
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
    if (!Array.isArray(cached)) return null;
    const eventsOnly = sortDiscoveryHangoutsBySocialSignal(
      takeDiscoveryHangouts(cached, cached.length)
    );
    return eventsOnly.length > 0 ? eventsOnly : null;
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

  const searchFieldPlaceholder = homePostSearchActive
    ? searchMode === "users"
      ? "Search users"
      : "Search posts"
    : "Where To?";

  const loadVerticalHomePosts = useCallback(
    async (
      ctx: HomeVerticalFilterContext,
      personalizeQ: string | undefined,
      offset: number,
      limit: number
    ) => {
      const feedOptions = buildVerticalLoadFeedOptions(ctx, {
        offset,
        limit,
      });
      if (USE_OPTIMIZED_FEED) {
        const {
          items,
          consumedOffset,
          count,
          countIsAuthoritative,
          __feedDiag,
        } = await getPublicFeedOptimizedWithCount(feedOptions);

        const shouldPersonalize = shouldPersonalizeHomeVerticalFeed({
          feedSearchQ: personalizeQ,
          selectedTags,
          viewMode,
          friendsFilter,
          dateFilter,
        });

        const personalizedItemsRaw = shouldPersonalize
          ? personalizeFeedBatch(items)
          : items;

        const personalizedItems =
          shouldPersonalize &&
          personalizedItemsRaw.length !== items.length
            ? items
            : personalizedItemsRaw;

        let deliveredItems = personalizedItems;
        const rawConsumed = consumedOffset ?? items.length;
        if (isTrueDefaultAllVerticalFeed(ctx)) {
          const viewerKey = homeFeedCycleViewerKey(ctx.viewerProfileId);
          const cycle = getHomeFeedCycle(viewerKey);
          deliveredItems = filterUnseenCycleItems(
            personalizedItems,
            cycle.cycleSeenIds
          );
          const next = recordHomeFeedCycleDelivery(cycle, {
            deliveredItems,
            requestOffset: offset,
            consumedOffset: rawConsumed,
            count,
            countIsAuthoritative,
          });
          applyHomeFeedCycleState(viewerKey, next);
          deliveredItems = stampHomeFeedPresentationKeys(
            deliveredItems,
            next.cycleId
          );
        }

        if (import.meta.env.DEV) {
          console.log("[FeedPipeline] HomePage loadItems", {
            offset,
            limit,
            itemsFromRpc: items.length,
            afterPersonalization: personalizedItems.length,
            deliveredItems: deliveredItems.length,
            consumedOffset: rawConsumed,
            count,
            countIsAuthoritative: countIsAuthoritative ?? true,
            responseSource: __feedDiag?.responseSource ?? "unknown",
            elapsedMs: __feedDiag?.elapsedMs ?? null,
            friendsFilter,
          });
        }

        return {
          items: deliveredItems,
          consumedOffset: rawConsumed,
          count,
          countIsAuthoritative,
          __feedDiag: {
            ...(__feedDiag ?? {}),
            personalizationInputCount: items.length,
            personalizationOutputCount: personalizedItems.length,
          },
        };
      }

      const items = await getPublicFeed(feedOptions);
      const shouldPersonalize = shouldPersonalizeHomeVerticalFeed({
        feedSearchQ: personalizeQ,
        selectedTags,
        viewMode,
        friendsFilter,
        dateFilter,
      });

      const personalizedItemsRaw = shouldPersonalize
        ? personalizeFeedBatch(items)
        : items;

      const personalizedItems =
        shouldPersonalize &&
        personalizedItemsRaw.length !== items.length
          ? items
          : personalizedItemsRaw;

      let deliveredItems = personalizedItems;
      if (isTrueDefaultAllVerticalFeed(ctx)) {
        const viewerKey = homeFeedCycleViewerKey(ctx.viewerProfileId);
        const cycle = getHomeFeedCycle(viewerKey);
        deliveredItems = filterUnseenCycleItems(
          personalizedItems,
          cycle.cycleSeenIds
        );
        const next = recordHomeFeedCycleDelivery(cycle, {
          deliveredItems,
          requestOffset: offset,
          consumedOffset: personalizedItems.length,
          count: personalizedItems.length,
          countIsAuthoritative: false,
        });
        applyHomeFeedCycleState(viewerKey, next);
        deliveredItems = stampHomeFeedPresentationKeys(
          deliveredItems,
          next.cycleId
        );
      }

      return {
        items: deliveredItems,
        consumedOffset: personalizedItems.length,
        count: personalizedItems.length,
      };
    },
    [selectedTags, viewMode, friendsFilter, dateFilter]
  );

  const browsePostsLoadItems = useCallback(
    (offset: number, limit: number) =>
      loadVerticalHomePosts(browseFilterCtx, undefined, offset, limit),
    [loadVerticalHomePosts, browseFilterCtx]
  );

  const wrapTrueDefaultAllCycle = useCallback(
    async (limit: number) => {
      if (!isTrueDefaultAllVerticalFeed(browseFilterCtx)) return null;
      const viewerKey = homeFeedCycleViewerKey(viewerProfileIdRef.current);
      const cycle = getHomeFeedCycle(viewerKey);
      if (!isHomeFeedCycleExhausted(cycle, { exhaustedByPage: true })) {
        // ProgressiveFeed only calls this after inferHasMore=false; still wrap.
      }
      const nextCycle = startNextHomeFeedCycle(cycle);
      applyHomeFeedCycleState(viewerKey, nextCycle);
      setHomeCycleTick((n) => n + 1);

      const defaultAllCtx = buildHomeVerticalFilterContext({
        viewMode: "all",
        dateFilter: "none",
        selectedTags: [],
        viewerProfileId: viewerProfileIdRef.current,
        friendsFilter: false,
      });

      try {
        const page = await getPublicFeedOptimizedWithCount(
          buildVerticalLoadFeedOptions(defaultAllCtx, {
            offset: 0,
            limit,
          })
        );
        const rawConsumed = page.consumedOffset ?? page.items.length;
        let delivered = filterUnseenCycleItems(
          page.items,
          getHomeFeedCycle(viewerKey).cycleSeenIds
        );
        const recorded = recordHomeFeedCycleDelivery(
          getHomeFeedCycle(viewerKey),
          {
            deliveredItems: delivered,
            requestOffset: 0,
            consumedOffset: rawConsumed,
            count: page.count,
            countIsAuthoritative: page.countIsAuthoritative,
          }
        );
        applyHomeFeedCycleState(viewerKey, recorded);
        delivered = stampHomeFeedPresentationKeys(
          delivered,
          recorded.cycleId
        );
        if (delivered.length === 0) {
          return {
            items: [],
            consumedOffset: rawConsumed,
            count: page.count,
            countIsAuthoritative: page.countIsAuthoritative,
          };
        }
        seedSocialActionsFromFeedItems(delivered);
        seedPublishedMediaFromFeedItems({
          items: delivered,
          viewerUserId: currentUserId ?? null,
          source: "feed",
        });
        return {
          items: delivered,
          consumedOffset: rawConsumed,
          count: page.count,
          countIsAuthoritative: page.countIsAuthoritative,
        };
      } catch {
        // Restore prior cycle on failure so we do not clear seen incorrectly.
        applyHomeFeedCycleState(viewerKey, cycle);
        setHomeCycleTick((n) => n + 1);
        return null;
      }
    },
    [browseFilterCtx, currentUserId]
  );

  const searchPostsLoadItems = useCallback(
    (offset: number, limit: number) =>
      loadVerticalHomePosts(searchFilterCtx, feedSearchQ, offset, limit),
    [loadVerticalHomePosts, searchFilterCtx, feedSearchQ]
  );

  const getCachedHomePosts = useCallback((cacheKey: string) => {
    const sanitize = (items: FeedItem[]) =>
      filterExpiredHangouts(
        items as FeedItemWithDates[],
        new Date(),
        HOME_EVENT_TIMEZONE
      ) as FeedItem[];

    const snapshot = readHomeFeedHydrationSnapshot(cacheKey, (key) =>
      dataCache.get<FeedItem[]>(key)
    );
    if (!snapshot?.items?.length) return null;
    const items = sanitize(applyPendingPostPatchesToItems(snapshot.items));
    seedPublishedMediaFromFeedItems({
      items,
      viewerUserId: currentUserId ?? null,
      source: snapshot.source === "persist" ? "persist" : "warm",
      snapshotTs: snapshot.snapshotTs,
    });
    return items;
  }, [currentUserId]);

  const browsePostsGetCachedItems = useCallback(() => {
    const items = getCachedHomePosts(browseFeedCacheKey);
    if (!items?.length || !browseIsTrueDefaultAll) return items;
    return stampHomeFeedPresentationKeys(
      items,
      getHomeFeedCycle(cycleViewerKey).cycleId
    );
  }, [
    getCachedHomePosts,
    browseFeedCacheKey,
    browseIsTrueDefaultAll,
    cycleViewerKey,
    homeCycleTick,
  ]);

  const searchPostsGetCachedItems = useCallback(
    () => getCachedHomePosts(searchFeedCacheKey),
    [getCachedHomePosts, searchFeedCacheKey]
  );

  const setCachedHomePosts = useCallback((cacheKey: string, items: FeedItem[]) => {
    writeHomeFeedDisplaySnapshot(cacheKey, items, (key, value, ttlMs) => {
      dataCache.set(key, value, ttlMs);
    });
  }, []);

  const browsePostsSetCachedItems = useCallback(
    (items: FeedItem[]) => setCachedHomePosts(browseFeedCacheKey, items),
    [setCachedHomePosts, browseFeedCacheKey]
  );

  const searchPostsSetCachedItems = useCallback(
    (items: FeedItem[]) => setCachedHomePosts(searchFeedCacheKey, items),
    [setCachedHomePosts, searchFeedCacheKey]
  );

  const handleSearchPostsEmptyActiveChange = useCallback((active: boolean) => {
    setSearchPostsEmptyActive(active);
  }, []);

  useEffect(() => {
    if (
      !homePostSearchActive ||
      searchMode !== "posts" ||
      search.trim().length === 0
    ) {
      setSearchPostsEmptyActive(false);
    }
  }, [homePostSearchActive, searchMode, search]);

  const hintUsersSearch =
    homePostSearchActive &&
    searchMode === "posts" &&
    search.trim().length > 0 &&
    searchPostsEmptyActive;

  const homeSearchResultsContent = (
    <>
      {searchMode === "users" ? (
        <div className="w-full max-w-[640px] mx-auto px-[var(--gutter)] pt-1 pb-1">
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

      {searchMode === "posts" ? (
        <div className="w-full max-w-[640px] mx-auto px-[var(--gutter)] [&>div]:!mt-0">
          <HomePostsSection
            key={`home-posts-search-${searchFeedCacheKey}-e${homeRefreshEpoch}`}
            suppressBrowseRails
            viewMode={viewMode}
            hasActiveFilters={hasActiveFilters}
            tagFallbackItems={tagFallbackItems}
            tagFallbackLoading={tagFallbackLoading}
            showTagFallback={showTagFallback}
            selectedTags={selectedTags}
            isVisible={isHomeVisible}
            tabId="home"
            useProgressiveFeed={true}
            loadItems={searchPostsLoadItems}
            initialItems={searchVerticalWarmInitialItems}
            getCachedItems={searchPostsGetCachedItems}
            setCachedItems={searchPostsSetCachedItems}
            feedOptions={buildVerticalFeedOptionsProp(searchFilterCtx)}
            backgroundRevalidateOnMount
            softRefreshEpoch={homeFeedSoftRefreshEpoch}
            dateFilter={dateFilter}
            explicitContentFilters={explicitContentFilters}
            onHomeFilterAction={applyHomeFilterAction}
            onBackToFeed={clearAllHomeFilters}
            searchQuery={search}
            onSearchPostsEmptyActiveChange={handleSearchPostsEmptyActiveChange}
            railLoadItems={railLoadItems}
            railGetCachedItems={railGetCachedItems}
            railSetCachedItems={railSetCachedItems}
          />
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {isHomeTabActive &&
      !homePostSearchActive &&
      (pullPx > 2 || ptrRefreshing) ? (
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
          searchFieldPlaceholder={searchFieldPlaceholder}
          onSearchFocusChange={handleHomeSearchFocusChange}
          onSearchInputPointerDown={handleHomeSearchInputPointerDown}
          hasActiveFilters={hasActiveFilters}
          filtersOpen={filtersOpen}
          viewMode={viewMode}
          dateFilter={dateFilter}
          onToggleDateFilter={handleToggleDateFilter}
          onToggleTypeFilter={handleToggleTypeFilter}
          friendsFilter={friendsFilter}
          onToggleFriends={handleToggleFriends}
          onClearAllFilters={clearAllHomeFilters}
        />

        {/* Browse stays mounted; search is an opaque overlay. */}
        <div
          ref={homeBrowseRef}
          aria-hidden={homePostSearchActive || undefined}
          inert={homePostSearchActive ? true : undefined}
          className={homePostSearchActive ? "pointer-events-none" : undefined}
          style={{
            paddingTop: "calc(90px + var(--safe-area-top-layout))",
            paddingBottom: FOOTER_HEIGHT,
          }}
        >
          {showHomeDiscoveryRails ? (
          <div className="w-full max-w-[640px] mx-auto px-0">
            <HomeHangoutSection
              key={`rail-top-${viewerProfileId ?? "guest"}-e${homeRefreshEpoch}`}
              items={[]}
              loading={false}
              batchedData={null}
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

          <div className="w-full max-w-[640px] mx-auto px-0">
            <HomePostsSection
              key={
                browseIsTrueDefaultAll
                  ? `home-posts-${browseFeedCacheKey}`
                  : `home-posts-${browseFeedCacheKey}-e${homeRefreshEpoch}`
              }
              suppressBrowseRails={explicitContentFilters}
              viewMode={viewMode}
              hasActiveFilters={browseHasActiveFilters}
              tagFallbackItems={tagFallbackItems}
              tagFallbackLoading={tagFallbackLoading}
              showTagFallback={showTagFallback}
              selectedTags={selectedTags}
              isVisible={isHomeVisible && !homePostSearchActive}
              tabId="home"
              useProgressiveFeed={true}
              loadItems={browsePostsLoadItems}
              initialItems={browseVerticalWarmInitialItemsStamped}
              getCachedItems={browsePostsGetCachedItems}
              setCachedItems={browsePostsSetCachedItems}
              feedOptions={buildVerticalFeedOptionsProp(browseFilterCtx)}
              backgroundRevalidateOnMount={!browseIsTrueDefaultAll}
              skipOffsetZeroHeadReplace={browseIsTrueDefaultAll}
              continuousCycling={browseIsTrueDefaultAll}
              onCycleWrap={
                browseIsTrueDefaultAll ? wrapTrueDefaultAllCycle : undefined
              }
              listReplaceRevision={
                browseIsTrueDefaultAll ? homeListReplaceRevision : 0
              }
              listReplaceItems={
                browseIsTrueDefaultAll
                  ? homeListReplaceItems ?? undefined
                  : undefined
              }
              listReplaceBackendOffset={
                browseIsTrueDefaultAll
                  ? homeListReplaceBackendOffset
                  : undefined
              }
              listReplaceCount={
                browseIsTrueDefaultAll ? homeListReplaceCount : undefined
              }
              listReplaceCountIsAuthoritative={
                browseIsTrueDefaultAll
                  ? homeListReplaceCountIsAuthoritative
                  : undefined
              }
              softRefreshEpoch={homeFeedSoftRefreshEpoch}
              dateFilter={dateFilter}
              explicitContentFilters={explicitContentFilters}
              onHomeFilterAction={applyHomeFilterAction}
              onBackToFeed={clearAllHomeFilters}
              railLoadItems={railLoadItems}
              railGetCachedItems={railGetCachedItems}
              railSetCachedItems={railSetCachedItems}
            />
          </div>
        </div>

        {homePostSearchActive ? (
          <HomeSearchLayer
            scrollRef={homeSearchScrollRef}
            scrollTop={HOME_SEARCH_SCROLL_TOP}
            searchMode={searchMode}
            onSearchModeChange={handleHomeSearchModeChange}
            onBack={exitHomePostSearchMode}
            hintUsersSearch={hintUsersSearch}
          >
            {homeSearchResultsContent}
          </HomeSearchLayer>
        ) : null}
      </PrimaryPageContainer>

      <WelcomeModal
        isOpen={showInfoModal}
        onClose={handleWelcomeClose}
      />
      <HomeTour
        isHomeVisible={isHomeVisible}
        homePostSearchActive={homePostSearchActive}
        welcomeModalOpen={showInfoModal}
        onOpenTourFilters={onOpenTourFilters}
        onCloseTourFilters={onCloseTourFilters}
        onPrepareTourStart={onPrepareTourStart}
      />
    </>
  );
}
