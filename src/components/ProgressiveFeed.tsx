/**
 * [OPTIMIZATION: Phase 2 - Progressive Rendering]
 *
 * Progressive Feed Component
 *
 * Renders items one-by-one as they become available, with intelligent caching,
 * virtual scrolling, scroll stop detection, and mobile optimizations.
 *
 * Features:
 * - Shows first item from cache immediately
 * - Streams remaining items one-by-one
 * - Stops loading when user stops scrolling
 * - Virtual scrolling for long lists
 * - Mobile-optimized buffers
 * - Integrates with batching
 */

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useStaleWhileRevalidate } from "../hooks/useStaleWhileRevalidate";
import { useVirtualScrolling } from "../hooks/useVirtualScrolling";
import { useAdaptiveBuffer } from "../hooks/useAdaptiveBuffer";
import { isPWA } from "../lib/pwaDetection";
import { useConnectionAware } from "../hooks/useConnectionAware";
import {
  type OffsetAwareLoadResult,
  normalizeLoadResult,
} from "../lib/offsetAwareLoader";
import { onPostChanged, onPostDeleted } from "../lib/postEvents";
import { applyPostPatch } from "../lib/applyPostPatch";
import { getPostDeleteExitDurationMs } from "../lib/postDeleteExitAnimation";
import { logFetchStart } from "../lib/tabVisibilityDebug";
import { batchFetchActivitiesForPosts } from "../api/services/activitiesBatch";
import FeedLoadErrorState from "./ui/FeedLoadErrorState";

/** TEMP — paste target post UUID; remove after RSVP feed diagnosis */
const DEBUG_RSVP_POST_ID = "";

function debugRsvpFreshFetch<T extends { id: string }>(
  fetchedItems: T[],
  ctx: string
) {
  if (!DEBUG_RSVP_POST_ID) return;
  const h = fetchedItems.find((i) => i.id === DEBUG_RSVP_POST_ID);
  if (!h) return;
  const row = h as Record<string, unknown>;
  console.log("RSVP DEBUG fresh fetch hit", {
    id: h.id,
    rsvp_capacity: row.rsvp_capacity,
    typeof_rsvp_capacity: typeof row.rsvp_capacity,
    ctx,
  });
}

function debugRsvpMerged<T extends { id: string }>(
  merged: T[],
  ctx: string,
  extra?: Record<string, unknown>
) {
  if (!DEBUG_RSVP_POST_ID) return;
  const h = merged.find((i) => i.id === DEBUG_RSVP_POST_ID);
  if (!h) return;
  const row = h as Record<string, unknown>;
  console.log("RSVP DEBUG merged feed state", {
    id: h.id,
    rsvp_capacity: row.rsvp_capacity,
    typeof_rsvp_capacity: typeof row.rsvp_capacity,
    ctx,
    ...extra,
  });
}

/** Draft rows prepend on Created offset 0; backend offset excludes them */
function isDraftLikeFeedRow<T extends { id: string }>(row: T): boolean {
  return Boolean((row as { isDraft?: boolean }).isDraft);
}

/** One page fetched: infer whether more backend rows likely exist */
function inferHasMoreAfterPage(args: {
  /** Backend rows returned/consumed in this single request (not draft-prepended client length) */
  consumedOffsetThisPage: number;
  requestedLimit: number;
  nextOffset: number;
  count: number | null | undefined;
}): boolean {
  const { consumedOffsetThisPage, requestedLimit, nextOffset, count } = args;
  if (consumedOffsetThisPage === 0) return false;
  if (
    count != null &&
    count > requestedLimit &&
    count >= nextOffset
  ) {
    return nextOffset < count;
  }
  return consumedOffsetThisPage >= requestedLimit;
}

export interface ProgressiveFeedProps<T> {
  // Data loading
  // Supports both old format (Promise<T[]>) and new format (Promise<OffsetAwareLoadResult<T>>)
  loadItems: (
    offset: number,
    limit: number
  ) => Promise<T[] | OffsetAwareLoadResult<T>>;
  renderItem: (item: T, index: number) => React.ReactNode;

  // Initial data (for immediate display)
  initialItems?: T[];

  // Caching
  cacheKey?: string;
  getCachedItems?: () => T[] | null;
  setCachedItems?: (items: T[]) => void;

  // Virtual scrolling
  enableVirtualScrolling?: boolean;
  itemHeight?: number; // Required if virtual scrolling enabled
  bufferSize?: number | "adaptive"; // "adaptive" uses connection + mobile detection

  // Lazy loading
  enableLazyLoading?: boolean;
  loadMoreThreshold?: number; // Pixels from bottom to trigger load (default: 200px)

  // [STEP 2] Scroll stop detection removed - caused IO disconnect and "skeleton until scroll" behavior
  /** @deprecated Ignored - scroll stop detection removed */
  enableScrollStopDetection?: boolean;
  /** @deprecated Ignored - scroll stop detection removed */
  scrollStopDelay?: number;

  // Loading states
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;

  // Loading skeleton component
  loadingComponent?: React.ReactNode;

  // Orientation
  orientation?: "vertical" | "horizontal";

  // Container
  containerRef?: React.RefObject<HTMLElement>;

  // Options
  pageSize?: number; // Items to load per page (default: 6)
  maxItems?: number; // Maximum items to load (0 = unlimited)
  isVisible?: boolean; // Default: true (backward compatible) - gates auto-load when hidden
  /** [PROFILE] Bump to refetch first page without remounting — see soft-refresh effect */
  softRefreshEpoch?: number;
  /** Telemetry for targeted flows (Created tab publish refresh) */
  onSoftRefreshStart?: () => void;
  onSoftRefreshDone?: (args: {
    returnedCount: number;
    firstPostId: string | null;
  }) => void;

  /** Bump with items to prepend at head (deduped by id); does not call loadItems */
  externalPrependRevision?: number;
  externalPrependItems?: T[];

  /** Bump to replace in-place by id (silent reconcile) */
  externalReplaceRevision?: number;
  externalReplaceItem?: T | null;

  /**
   * Own Profile Created publish return: merged cache rows + locally built new post (+ drafts).
   * Skips immediate `loadItems(0)`, mount cache hydrate, sentinel load-more, and keeps `hasMore` false until remount/manual refresh bumps the feed key / soft refresh epoch.
   */
  authoritativeHydratedSeed?: T[];

  tabId?: string;
}

/**
 * Progressive Feed Component
 *
 * @example
 * ```tsx
 * <ProgressiveFeed
 *   loadItems={(offset, limit) => getPublicFeed({ offset, limit })}
 *   renderItem={(post, index) => <Post key={post.id} {...post} />}
 *   initialItems={cachedPosts}
 *   getCachedItems={() => getCachedFeed()}
 *   setCachedItems={(posts) => setCachedFeed(posts)}
 *   batchedData={batchedData}
 *   enableVirtualScrolling={true}
 *   itemHeight={400}
 *   bufferSize="adaptive"
 *   enableScrollStopDetection={true}
 * />
 * ```
 */
export default function ProgressiveFeed<T extends { id: string }>({
  loadItems,
  renderItem,
  initialItems,
  cacheKey,
  getCachedItems,
  setCachedItems,
  enableVirtualScrolling = false,
  itemHeight = 400,
  bufferSize = "adaptive",
  enableLazyLoading = true,
  loadMoreThreshold = 200,
  enableScrollStopDetection: _enableScrollStopDetection = undefined, // [STEP 2] Ignored - removed
  scrollStopDelay: _scrollStopDelay = undefined, // [STEP 2] Ignored - removed
  loading: externalLoading = false,
  error: externalError = null,
  emptyMessage = "No items to display",
  loadingComponent,
  orientation = "vertical",
  containerRef: externalContainerRef,
  pageSize = 1, // Default: load one item at a time for true progressive loading
  maxItems = 0,
  isVisible = true, // [STEP 1] Default: true for backward compatibility
  tabId = "unknown",
  softRefreshEpoch,
  onSoftRefreshStart,
  onSoftRefreshDone,
  externalPrependRevision = 0,
  externalPrependItems,
  externalReplaceRevision = 0,
  externalReplaceItem = null,
  authoritativeHydratedSeed,
}: ProgressiveFeedProps<T>) {
  // PWA detection: Use centralized utility
  const isPWAValue = (() => {
    try {
      return isPWA();
    } catch {
      // Fallback if module not available
      return (
        typeof window !== "undefined" &&
        (window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as any).standalone === true ||
          document.referrer.includes("android-app://"))
      );
    }
  })();
  /**
   * Calculate initial load size - fixed at 15 items (egress reduction)
   */
  const calculateInitialLoadSize = useCallback((): number => {
    return 15; // Fixed: load 15 items initially for fewer RPCs
  }, []);

  // Bootstrap: authoritative publish seed wins on first snapshot, then `initialItems`;
  // ref freezes after first assignment (same intent as the old empty-deps `initialItems` memo).
  const authoritativeSeedUsedRef = useRef(
    Boolean(authoritativeHydratedSeed?.length)
  );
  const initialBootstrapSnapshotRef = useRef<T[] | null>(null);
  if (initialBootstrapSnapshotRef.current === null) {
    let rows: T[] = [];
    if (authoritativeHydratedSeed?.length) {
      rows = Array.from(
        new Map(authoritativeHydratedSeed.map((item) => [item.id, item])).values()
      );
    } else if (initialItems?.length) {
      rows = Array.from(
        new Map(initialItems.map((item) => [item.id, item])).values()
      );
    }
    initialBootstrapSnapshotRef.current = rows;
  }
  const initialItemsArray = initialBootstrapSnapshotRef.current!;

  const initialPublishedBootstrapOffset = initialItemsArray.filter(
    (r) => !isDraftLikeFeedRow(r)
  ).length;

  const initialOffset = initialPublishedBootstrapOffset;

  // Internal state
  const [items, setItems] = useState<T[]>(initialItemsArray);
  /** Rows mid–exit animation (fade/slide) before removal from `items`. */
  const [exitingPostIds, setExitingPostIds] = useState(() => new Set<string>());
  const deleteExitTimersRef = useRef<Map<string, number>>(new Map());
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(
    () => !Boolean(authoritativeHydratedSeed?.length)
  );
  const [error, setError] = useState<string | null>(externalError);

  /**
   * When false and items are empty (no error), we are still awaiting the first cache hydrate or
   * initial-load response for this mount. Prevents perpetual "loading" that blocked emptyMessage / black feed.
   */
  const [
    emptySurfaceAwaitingInitialResponse,
    setEmptySurfaceAwaitingInitialResponse,
  ] = useState(() => initialItemsArray.length === 0);

  // Refs
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const offsetRef = useRef(initialPublishedBootstrapOffset); // Backend offset excludes drafts on Created tab
  const initialLoadCompleteRef = useRef(false); // Track if initial load has completed
  const initialLoadRunCountRef = useRef(0);
  const initialLoadGuardRef = useRef(false);

  // [FIX] Track current items via ref for cache updates
  // This avoids calling setCachedItems inside setItems callback (causes infinite loops)
  const itemsRef = useRef<T[]>(initialItemsArray);

  // [STEP 1] New refs for visibility gating and deduplication
  // [FIX C] Track in-flight offsets with pageSize to prevent duplicate requests
  const inFlightOffsetsRef = useRef<Set<string>>(new Set());
  // [FIX B] Use refs for stable dependencies in loadMore
  const hasMoreRef = useRef(!Boolean(authoritativeHydratedSeed?.length));
  const commitHasMore = useCallback((next: boolean) => {
    hasMoreRef.current = next;
    setHasMore(next);
  }, []);
  const isVisibleRef = useRef(true);
  // [FIX A] Store observer in ref for proper cleanup
  const observerRef = useRef<IntersectionObserver | null>(null);

  const softEpochRef = useRef(0);
  softEpochRef.current = softRefreshEpoch ?? 0;
  /** Latest epoch deemed satisfied by initial load / cache hydrate or a completed soft refresh */
  const softBaselineEpochRef = useRef<number>(0);
  const softBaselineCapturedRef = useRef(false);
  const softRefreshInFlightRef = useRef(false);

  const lastExternalPrependRevisionAppliedRef = useRef(0);
  const lastExternalReplaceRevisionAppliedRef = useRef(0);

  const captureSoftBaselineEpoch = () => {
    softBaselineEpochRef.current = softEpochRef.current;
    softBaselineCapturedRef.current = true;
  };

  const isDraftRow = useCallback((row: T) => isDraftLikeFeedRow(row), []);

  const authoritativeHydrationLayoutAppliedRef = useRef(false);

  // [CHAIN] Cap chained loads per completion to avoid infinite loops
  const PREFETCH_PX = 600;
  const MAX_CHAINED_LOADS = 1; // One chain max - prevents rapid multiple RPCs
  const chainCountRef = useRef(0);

  const mountedRef = useRef(true);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rafsRef = useRef<number[]>([]);

  const scheduleTimeout = useCallback(
    (fn: () => void, ms: number): ReturnType<typeof setTimeout> => {
      const id = setTimeout(fn, ms);
      timeoutsRef.current.push(id);
      return id;
    },
    []
  );
  const scheduleRaf = useCallback((fn: () => void): number => {
    const id = requestAnimationFrame(fn);
    rafsRef.current.push(id);
    return id;
  }, []);

  // [CHAIN] Check if sentinel is within prefetch distance of viewport bottom
  const isSentinelNearBottom = useCallback((): boolean => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return false;
    const rect = sentinel.getBoundingClientRect();
    const viewportBottom = window.innerHeight;
    return rect.top < viewportBottom + PREFETCH_PX && rect.bottom > 0;
  }, []);

  const clearScheduled = useCallback(() => {
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];
    rafsRef.current.forEach((id) => cancelAnimationFrame(id));
    rafsRef.current = [];
  }, []);

  // [DEBUG] Stable identifier per instance (used only when DEBUG_PF is true)
  const logIdRef = useRef<string>(
    `PF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const logId = logIdRef.current;

  useLayoutEffect(() => {
    if (!authoritativeSeedUsedRef.current) return;
    if (authoritativeHydrationLayoutAppliedRef.current) return;
    authoritativeHydrationLayoutAppliedRef.current = true;

    offsetRef.current = itemsRef.current.filter((r) => !isDraftLikeFeedRow(r))
      .length;
    loadingRef.current = false;
    setIsLoadingMore(false);
    initialLoadGuardRef.current = false;
    initialLoadCompleteRef.current = true;
    setEmptySurfaceAwaitingInitialResponse(false);
    captureSoftBaselineEpoch();
    commitHasMore(false);

    // Publish-return hydrate: sync refs/state once — seed props may clear on parent re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [DEBUG] Toggle for console noise - [STEP 1] TEMP: Enable for repro
  const DEBUG_PF = false;

  // [FIX] Keep itemsRef in sync with items state
  // This allows us to read current items without using setItems callback
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // [POST EVENTS] Subscribe to post:changed and patch feed items (like/save/comment/follow)
  useEffect(() => {
    const cleanup = onPostChanged((e) => {
      const { postId, patch } = e.detail;
      setItems((prev) => {
        const next = prev.map((item) => {
          if (item.id !== postId) return item;
          return applyPostPatch(item as Record<string, unknown>, patch) as T;
        });
        debugRsvpMerged(next, "after-post-changed-patch");
        if (setCachedItems && next.some((n, i) => n !== prev[i])) {
          scheduleTimeout(() => {
            if (!mountedRef.current) return;
            setCachedItems(next);
          }, 0);
        }
        return next;
      });
    });
    return cleanup;
  }, [setCachedItems, scheduleTimeout]);

  // Remove deleted posts after a short exit animation, then sync cache (no refetch)
  useEffect(() => {
    const commitRemove = (postId: string) => {
      deleteExitTimersRef.current.delete(postId);
      setExitingPostIds((prev) => {
        if (!prev.has(postId)) return prev;
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== postId);
        if (next.length === prev.length) return prev;
        if (setCachedItems) {
          scheduleTimeout(() => {
            if (!mountedRef.current) return;
            setCachedItems(next);
          }, 0);
        }
        return next;
      });
    };

    const cleanup = onPostDeleted((postId) => {
      if (!itemsRef.current.some((i) => i.id === postId)) return;
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

      const t = scheduleTimeout(() => {
        if (!mountedRef.current) return;
        commitRemove(postId);
      }, durationMs);
      deleteExitTimersRef.current.set(postId, t as unknown as number);
    });
    return cleanup;
  }, [setCachedItems, scheduleTimeout]);

  // Local prepend after publish (no loadItems); keeps existing rows, dedupes by id
  useEffect(() => {
    const rev = externalPrependRevision ?? 0;
    const rows = externalPrependItems;
    if (!rows?.length) return;
    if (rev <= 0 || rev <= lastExternalPrependRevisionAppliedRef.current) return;
    lastExternalPrependRevisionAppliedRef.current = rev;

    const headUnique = Array.from(
      new Map(rows.map((item) => [item.id, item])).values()
    );
    const prependIds = new Set(headUnique.map((h) => h.id));

    setItems((prev) => {
      const rest = prev.filter((p) => !prependIds.has(p.id));
      const merged = [...headUnique, ...rest];
      debugRsvpMerged(merged, "external-prepend");
      if (setCachedItems) {
        scheduleTimeout(() => {
          if (!mountedRef.current) return;
          setCachedItems(merged);
        }, 0);
      }
      return merged;
    });
  }, [
    externalPrependRevision,
    externalPrependItems,
    setCachedItems,
    scheduleTimeout,
  ]);

  /** Replace in place by id (silent canonical reconcile) */
  useEffect(() => {
    const rev = externalReplaceRevision ?? 0;
    const row = externalReplaceItem;
    if (
      !row ||
      rev <= 0 ||
      rev <= lastExternalReplaceRevisionAppliedRef.current
    ) {
      return;
    }
    lastExternalReplaceRevisionAppliedRef.current = rev;

    setItems((prev) => {
      const ix = prev.findIndex((p) => p.id === row.id);
      if (ix === -1) return prev;
      const next = [...prev];
      next[ix] = row as T;
      if (setCachedItems) {
        scheduleTimeout(() => {
          if (!mountedRef.current) return;
          setCachedItems(next);
        }, 0);
      }
      return next;
    });
  }, [
    externalReplaceRevision,
    externalReplaceItem,
    setCachedItems,
    scheduleTimeout,
  ]);

  // [STEP 1] Keep refs in sync with state for stable dependencies
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    isVisibleRef.current = isVisible ?? true;
  }, [isVisible]);

  // [PASS 2] Mount effect: set mountedRef, clear scheduled work on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearScheduled();
    };
  }, [clearScheduled]);

  // [PASS 2] When isVisible becomes false, clear scheduled timers/RAF immediately
  useEffect(() => {
    if (!isVisible) {
      clearScheduled();
    }
  }, [isVisible, clearScheduled]);

  /**
   * Persistent tabs: when hidden, clear guard/loading. Use itemsRef (not items in deps) so
   * hidden feeds aren’t touched on every items update from other tabs / background completes.
   */
  useEffect(() => {
    if (isVisible) return;
    initialLoadGuardRef.current = false;
    loadingRef.current = false;
    setIsLoadingMore(false);
    if (itemsRef.current.length === 0) {
      initialLoadCompleteRef.current = false;
      setEmptySurfaceAwaitingInitialResponse(true);
    }
  }, [isVisible]);

  // Component mount tracking (removed excessive logs)
  useEffect(() => {
    if (!DEBUG_PF) return;
    console.log("[PF] mount", {
      logId,
      initialOffset,
      initialItemsLen: initialItemsArray.length,
    });
    return () => {
      console.log("[PF] unmount", { logId });
    };
  }, [logId, initialOffset, initialItemsArray.length, DEBUG_PF]);

  // [PHASE 2.3] Connection-aware configuration
  const {
    pageSize: connectionAwarePageSize,
    bufferSize: connectionAwareBufferSize,
    shouldPause,
  } = useConnectionAware({
    basePageSize: pageSize,
    baseBufferSize: typeof bufferSize === "number" ? bufferSize : 3,
    enablePauseOnSlow: true,
  });

  // Adaptive buffer (existing hook for scroll speed awareness)
  const { bufferSize: adaptiveBufferSize } = useAdaptiveBuffer({
    minBuffer: 1,
    maxBuffer: 3,
    enableConnectionAware: true,
    enableScrollSpeedAware: true,
  });

  // [PHASE 2.3] Determine actual pageSize (connection-aware + clamp)
  const MIN_PAGE_SIZE = 5; // Prevent collapse to 1 post on slow connections
  const actualPageSize = useMemo(() => {
    return Math.max(MIN_PAGE_SIZE, connectionAwarePageSize);
  }, [connectionAwarePageSize]);

  // Determine actual buffer size
  const actualBufferSize = useMemo(() => {
    if (bufferSize === "adaptive") {
      // [PHASE 2.3] Use connection-aware buffer size if available
      // Otherwise fall back to adaptive buffer from useAdaptiveBuffer
      return connectionAwareBufferSize > 0
        ? connectionAwareBufferSize
        : adaptiveBufferSize;
    }
    return bufferSize;
  }, [bufferSize, adaptiveBufferSize, connectionAwareBufferSize]);

  // Load more items (defined before hooks that use it)
  const loadMoreRef = useRef<(() => Promise<void>) | undefined>(undefined);

  const loadMore = useCallback(async () => {
    // [FIX 3] Declare dedupeKey at top for finally block access
    const currentOffset = offsetRef.current;
    const dedupeKey = `${currentOffset}:${actualPageSize}`;
    let didMarkInFlight = false;

    // [STEP 1] Guard: Check visibility first
    if (!isVisibleRef.current) {
      if (DEBUG_PF) {
        console.log("[PF] loadMore blocked: not visible", { logId });
      }
      return;
    }

    if (softRefreshInFlightRef.current) {
      return;
    }

    if (DEBUG_PF) {
      console.log("[PF] loadMore enter", {
        logId,
        offset: offsetRef.current,
        itemsLen: itemsRef.current.length, // [FIX B] Use ref
        hasMore: hasMoreRef.current, // [FIX B] Use ref
        loadingRef: loadingRef.current,
        isLoadingMore,
      });
    }
    // Double-check: Ensure initial load is complete before allowing subsequent loads
    if (!initialLoadCompleteRef.current) {
      if (DEBUG_PF) {
        console.log("[PF] loadMore blocked: initial load not complete", {
          logId,
        });
      }
      return; // Wait for initial load to complete
    }

    // [PHASE 2.3] Pause loading on very slow connections
    if (shouldPause) {
      if (DEBUG_PF) {
        console.log("[PF] loadMore blocked: shouldPause", { logId });
      }
      return; // Don't load more on very slow connections
    }

    // CRITICAL FIX: Prevent loadMore from firing with offset 0 if we already have items
    // This prevents race condition where initial load and loadMore both fire with offset 0
    if (offsetRef.current === 0 && itemsRef.current.length > 0) {
      // [FIX B] Use ref
      console.warn(
        "[ProgressiveFeed] loadMore called with offset 0 but items exist - skipping to prevent duplicate loads"
      );
      if (DEBUG_PF) {
        console.log("[PF] loadMore blocked: offset=0 items>0", {
          logId,
          offset: offsetRef.current,
          itemsLen: itemsRef.current.length, // [FIX B] Use ref
        });
      }
      return;
    }

    // [FIX C] Check in-flight dedupe before proceeding
    if (inFlightOffsetsRef.current.has(dedupeKey)) {
      if (DEBUG_PF) {
        console.log("[PF] loadMore blocked: duplicate in-flight", {
          logId,
          dedupeKey,
        });
      }
      return;
    }

    // Double-check loading state (prevent race conditions)
    if (
      loadingRef.current ||
      isLoadingMore ||
      !hasMoreRef.current // [FIX B] Use ref
    ) {
      if (DEBUG_PF) {
        console.log("[PF BLOCKED FLAGS] loadMore flags", {
          sentinelPresent: !!sentinelRef.current,
          initialLoadComplete: initialLoadCompleteRef.current,
          loadingRef: loadingRef.current,
          isLoadingMoreState: isLoadingMore,
          hasMoreRef: hasMoreRef.current,
          offset: offsetRef.current,
          itemsLen: itemsRef.current.length,
        });
      }
      return;
    }

    // [FIX C] Mark this offset as in-flight (only after all guards pass)
    inFlightOffsetsRef.current.add(dedupeKey);
    didMarkInFlight = true;

    // Fix: Ensure isLoadingMore and loadingRef stay in sync - set both together
    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    // [PWA FIX] Detect PWA context for longer timeout
    const isPWAValue = (() => {
      try {
        return isPWA();
      } catch {
        // Fallback if module not available
        return (
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as any).standalone === true
        );
      }
    })();

    // Safety timeout: Force reset loading state after timeout to prevent stuck state
    // [FIX] Increased timeout for RPC calls which can be slow (30s for PWA, 25s for web)
    // Longer timeout for PWA (30s) to account for slower network connections in PWA context
    const timeout = isPWAValue ? 30000 : 25000;
    let timeoutId: ReturnType<typeof setTimeout> | null = scheduleTimeout(
      () => {
        if (loadingRef.current) {
          console.warn(
            `[ProgressiveFeed] loadMore: TIMEOUT${
              isPWAValue ? " (PWA)" : ""
            } - Request taking longer than ${timeout}ms. This usually indicates a slow network or database query.`
          );
          console.warn(
            `[ProgressiveFeed] Request still in progress after timeout. Waiting for completion...`
          );
          timeoutId = null;
        }
      },
      timeout
    );

    try {
      // [PWA FIX] Add retry logic for PWA network issues
      const loadWithRetry = async (
        attempt = 1
      ): Promise<T[] | OffsetAwareLoadResult<T>> => {
        try {
          logFetchStart(
            "ProgressiveFeed",
            tabId,
            isVisibleRef.current,
            undefined
          );
          // [PHASE 2.3] Use connection-aware pageSize
          return await loadItems(offsetRef.current, actualPageSize);
        } catch (error) {
          // Retry up to 3 times with exponential backoff
          if (attempt < 3) {
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.warn(
              `[ProgressiveFeed] Load attempt ${attempt} failed, retrying in ${delay}ms:`,
              error
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            return loadWithRetry(attempt + 1);
          }
          throw error;
        }
      };

      const loadResult = await loadWithRetry();

      // [PAGINATION FIX] Normalize result - offset/hasMore use backend rows only, never client dedupe
      const {
        items: fetchedItems,
        consumedOffset,
        count,
      } = normalizeLoadResult(loadResult);

      debugRsvpFreshFetch(fetchedItems, "ProgressiveFeed.loadMore");

      const oldOffset = offsetRef.current;
      const requestedLimit = actualPageSize;
      const fetchedLen = fetchedItems.length;

      // Rule 1 — Backend offset: advance by backend rows consumed (raw response length)
      const backendConsumed = consumedOffset;
      const nextOffset = oldOffset + backendConsumed;
      offsetRef.current = nextOffset;

      const nextHasMore = inferHasMoreAfterPage({
        consumedOffsetThisPage: backendConsumed,
        requestedLimit,
        nextOffset,
        count,
      });
      commitHasMore(nextHasMore);

      if (DEBUG_PF) {
        const ids = fetchedItems.map((i) => i.id);
        const first5 = ids.slice(0, 5).join(",");
        const last5 = ids.length > 5 ? ids.slice(-5).join(",") : "";
        const idsStr = ids.length <= 5 ? first5 : `${first5}...${last5}`;
        console.log(
          `[PF] page | requestedLimit=${requestedLimit} oldOffset=${oldOffset} fetchedLen=${fetchedLen} consumedOffset=${consumedOffset} nextOffset=${nextOffset} count=${
            count ?? "n/a"
          } hasMore=${nextHasMore} ids=${idsStr}`
        );
      }

      if (fetchedLen === 0) {
        loadingRef.current = false;
        setIsLoadingMore(false);
        if (DEBUG_PF) {
          console.log("[PF] loadMore exit: end reached", {
            logId,
            nextOffset,
          });
        }
      } else {
        // [STEP 1 FIX] Add entire batch in ONE synchronous setItems update
        // UI dedupe is separate — does NOT affect offset progression
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        // Kick off batch activities fetch BEFORE setItems (feed returns first_image_url only; batch gets full carousel)
        const idsNeedingActivities = fetchedItems
          .filter(
            (item: T & { activity_count?: number }) =>
              (item.activity_count ?? 0) > 0
          )
          .map((item) => item.id);
        if (idsNeedingActivities.length > 0) {
          batchFetchActivitiesForPosts(idsNeedingActivities);
        }

        // [ORDERING] Keep prev in stable order, append only truly-new items (dedupe by id)
        setItems((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const toAppend = fetchedItems.filter(
            (item) => !existingIds.has(item.id)
          );
          const merged = [...prev, ...toAppend];
          if (maxItems > 0 && merged.length >= maxItems) {
            commitHasMore(false);
          }
          // [TASK B] Feed pipeline debug - items appended vs deduped, final UI length
          if (DEBUG_PF) {
            const dedupedCount = fetchedItems.length - toAppend.length;
            console.log("[FeedPipeline] ProgressiveFeed setItems", {
              logId,
              prevLen: prev.length,
              fetchedLen: fetchedItems.length,
              appended: toAppend.length,
              deduped: dedupedCount,
              mergedLen: merged.length,
            });
          }
          debugRsvpMerged(merged, "loadMore-append-merge", {
            prevHadDebugId: prev.some((p) => p.id === DEBUG_RSVP_POST_ID),
            fetchHadDebugId: fetchedItems.some(
              (p) => p.id === DEBUG_RSVP_POST_ID
            ),
            appendedDebugId: toAppend.some((p) => p.id === DEBUG_RSVP_POST_ID),
          });
          return merged;
        });
        loadingRef.current = false;
        setIsLoadingMore(false);

        // [CHAIN] If sentinel still near bottom, chain loadMore (cap 1) without requiring scroll
        const tryChain = () => {
          if (
            chainCountRef.current < MAX_CHAINED_LOADS &&
            hasMoreRef.current &&
            isSentinelNearBottom() &&
            !loadingRef.current &&
            !softRefreshInFlightRef.current &&
            initialLoadCompleteRef.current
          ) {
            chainCountRef.current++;
            loadMoreRef.current?.();
          } else {
            chainCountRef.current = 0;
          }
        };
        scheduleRaf(() => scheduleRaf(tryChain));

        // Update cache asynchronously (non-blocking)
        if (setCachedItems) {
          const itemsToCache = [...fetchedItems];
          scheduleTimeout(() => {
            if (!mountedRef.current || !isVisibleRef.current) return;
            const currentItems = itemsRef.current;
            const existingIds = new Set(currentItems.map((i) => i.id));
            const toAppend = itemsToCache.filter(
              (item) => !existingIds.has(item.id)
            );
            const mergedItems = [...currentItems, ...toAppend];
            if (DEBUG_PF) {
              console.log("[PF] cache update", {
                logId,
                currentLen: currentItems.length,
                addLen: itemsToCache.length,
                mergedLen: mergedItems.length,
              });
            }
            setCachedItems(mergedItems);
          }, 0);
        }
      }

      // Rule 4 — No probe requests: end inferred from count/limit above
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error("[ProgressiveFeed] Failed to load items:", err);
      // Reset loading state on error
      loadingRef.current = false;
      setIsLoadingMore(false);
    } finally {
      // [FIX 3] Remove from in-flight set only if we actually added it
      if (didMarkInFlight) {
        inFlightOffsetsRef.current.delete(dedupeKey);
      }

      // Clear timeout if it exists
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (DEBUG_PF) {
        console.log("[PF loadMore] finally", {
          offsetRef: offsetRef.current,
          inFlightOffsetsRef: Array.from(inFlightOffsetsRef.current),
          loadingRef: loadingRef.current,
          isLoadingMore,
        });
      }
      // [PASS 2 C] Post-load scheduling removed. Rely on IO + user scroll for more loads.
    }
  }, [
    loadItems,
    maxItems,
    setCachedItems,
    isLoadingMore,
    actualPageSize,
    shouldPause,
    scheduleTimeout,
    scheduleRaf,
    isSentinelNearBottom,
    tabId,
    commitHasMore,
  ]);

  // Store loadMore in ref for use in other hooks
  loadMoreRef.current = loadMore;

  // Virtual scrolling
  const virtualScrolling = useVirtualScrolling({
    itemCount: items.length,
    itemHeight,
    container: containerRef.current || window,
    bufferSize: actualBufferSize,
    enabled: enableVirtualScrolling && items.length > 50,
  });

  // [STEP 2] useScrollStopDetection removed - it disconnected IO and caused "skeleton until scroll" behavior

  // [FIX] Disable SWR when using ProgressiveFeed - it conflicts with progressive loading
  // SWR was loading 1 item with offset 0, interfering with the main loading mechanism
  // ProgressiveFeed handles initial load via IntersectionObserver and loadMore
  const { data: swrData, isValidating } = useStaleWhileRevalidate({
    loadFresh: async () => {
      // Disabled - ProgressiveFeed handles loading
      return [];
    },
    getCached: getCachedItems,
    setCached: setCachedItems,
    revalidateOnMount: false,
    enabled: false, // Disable SWR - ProgressiveFeed handles all loading
  });

  // [REMOVED] SWR data update effect - SWR is disabled to prevent conflicts

  // Initial load: fill viewport if no initial items
  // [FIX] Check cache in useEffect, not during render
  // This prevents re-render loops when getCachedItems reference changes
  useEffect(() => {
    // Parent already merged cache + prepend + drafts into `authoritativeHydratedSeed`
    if (authoritativeSeedUsedRef.current) return;

    if (items.length > 0) {
      if (DEBUG_RSVP_POST_ID) {
        const row = items.find((i) => i.id === DEBUG_RSVP_POST_ID);
        if (row) {
          const r = row as Record<string, unknown>;
          console.log("RSVP DEBUG ProgressiveFeed mount effect", {
            branch: "skipped_cache_lookup_items_already_nonempty",
            itemsLen: items.length,
            id: row.id,
            rsvp_capacity: r.rsvp_capacity,
            typeof_rsvp_capacity: typeof r.rsvp_capacity,
          });
        }
      }
      return; // Already have items from initialItems prop
    }

    // Check cache ONCE on mount (not during render)
    // This prevents re-render loops when getCachedItems reference changes
    if (getCachedItems) {
      const cached = getCachedItems();
      if (cached && cached.length > 0) {
        // Deduplicate by ID
        const deduplicated = Array.from(
          new Map(cached.map((item) => [item.id, item])).values()
        );
        if (DEBUG_RSVP_POST_ID) {
          const ch = deduplicated.find((i) => i.id === DEBUG_RSVP_POST_ID);
          if (ch) {
            const row = ch as Record<string, unknown>;
            console.log("RSVP DEBUG cache hydrate hit", {
              id: ch.id,
              rsvp_capacity: row.rsvp_capacity,
              typeof_rsvp_capacity: typeof row.rsvp_capacity,
            });
          }
          console.log("RSVP DEBUG ProgressiveFeed mount cache branch", {
            earlyReturnSkippedRpc: true,
            cacheLen: deduplicated.length,
            debugPostInCache: !!ch,
          });
        }
        setItems(deduplicated);
        offsetRef.current = deduplicated.length;
        debugRsvpMerged(deduplicated, "after-cache-hydrate-setItems");
        if (setCachedItems) {
          setCachedItems(deduplicated);
        }
        initialLoadCompleteRef.current = true;
        setEmptySurfaceAwaitingInitialResponse(false);
        captureSoftBaselineEpoch();
        return; // Cache loaded, don't proceed to API load
      }
    }
    // [FIX] Empty deps - only run on mount
    // This prevents re-running when getCachedItems reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty - only run once on mount

  useEffect(() => {
    if (!isVisible) return;

    if (items.length === 0 && initialLoadCompleteRef.current) {
      initialLoadCompleteRef.current = false;
      setEmptySurfaceAwaitingInitialResponse(true);
    }

    initialLoadRunCountRef.current += 1;

    // Guard: Prevent multiple simultaneous initial loads
    if (initialLoadGuardRef.current) {
      if (DEBUG_PF) {
        console.log("[PF] initialLoad blocked: guard set", { logId });
      }
      return;
    }

    // Only do initial load if we have no items and haven't started loading
    if (
      items.length === 0 &&
      hasMore &&
      !loadingRef.current &&
      !isLoadingMore &&
      !externalLoading &&
      !initialLoadCompleteRef.current // Prevent running if already completed
    ) {
      if (DEBUG_PF) {
        console.log("[PF] initialLoad start", { logId });
      }
      initialLoadGuardRef.current = true; // Set guard
      // PWA FIX: Add small delay for PWA to ensure DOM is ready
      const performInitialLoad = () => {
        const initialLoadSize = calculateInitialLoadSize();

        loadingRef.current = true;
        setIsLoadingMore(true);

        logFetchStart("ProgressiveFeed", tabId, isVisible, undefined);
        loadItems(0, initialLoadSize)
          .then((loadResult) => {
            const {
              items: fetchedItems,
              consumedOffset,
              count,
            } = normalizeLoadResult(loadResult);

            debugRsvpFreshFetch(fetchedItems, "ProgressiveFeed.initialLoad");

            const fetchedLen = fetchedItems.length;
            const requestedLimit = initialLoadSize;
            const oldOffset = 0;
            const nextOffset = consumedOffset;

            // Rule 1 — Backend offset: advance by backend rows consumed
            offsetRef.current = consumedOffset;

            const nextHasMore = inferHasMoreAfterPage({
              consumedOffsetThisPage: consumedOffset,
              requestedLimit,
              nextOffset,
              count,
            });
            commitHasMore(nextHasMore);

            if (DEBUG_PF) {
              const ids = fetchedItems.map((i) => i.id);
              const first5 = ids.slice(0, 5).join(",");
              const last5 = ids.length > 5 ? ids.slice(-5).join(",") : "";
              const idsStr = ids.length <= 5 ? first5 : `${first5}...${last5}`;
              console.log(
                `[PF] page | requestedLimit=${requestedLimit} oldOffset=${oldOffset} fetchedLen=${fetchedLen} consumedOffset=${consumedOffset} nextOffset=${nextOffset} count=${
                  count ?? "n/a"
                } hasMore=${nextHasMore} ids=${idsStr}`
              );
            }

            if (fetchedLen > 0) {
              initialLoadCompleteRef.current = true;

              // Kick off batch activities fetch BEFORE setItems (feed returns first_image_url only; batch gets full carousel)
              const idsNeedingActivities = fetchedItems
                .filter(
                  (item: T & { activity_count?: number }) =>
                    (item.activity_count ?? 0) > 0
                )
                .map((item) => item.id);
              if (idsNeedingActivities.length > 0) {
                batchFetchActivitiesForPosts(idsNeedingActivities);
              }

              const tryChainInitial = () => {
                if (
                  chainCountRef.current < MAX_CHAINED_LOADS &&
                  hasMoreRef.current &&
                  isSentinelNearBottom() &&
                  !loadingRef.current &&
                  !softRefreshInFlightRef.current &&
                  initialLoadCompleteRef.current
                ) {
                  chainCountRef.current++;
                  loadMoreRef.current?.();
                } else {
                  chainCountRef.current = 0;
                }
              };
              scheduleRaf(() => scheduleRaf(tryChainInitial));

              setItems((prev) => {
                const existingIds = new Set(prev.map((p) => p.id));
                const toAppend = fetchedItems.filter(
                  (item) => !existingIds.has(item.id)
                );
                const merged = [...prev, ...toAppend];
                if (DEBUG_PF) {
                  console.log(
                    "[FeedPipeline] ProgressiveFeed initialLoad setItems",
                    {
                      logId,
                      prevLen: prev.length,
                      fetchedLen: fetchedItems.length,
                      appended: toAppend.length,
                      deduped: fetchedItems.length - toAppend.length,
                      mergedLen: merged.length,
                    }
                  );
                }
                debugRsvpMerged(merged, "initialLoad-append-merge", {
                  prevHadDebugId: prev.some((p) => p.id === DEBUG_RSVP_POST_ID),
                  fetchHadDebugId: fetchedItems.some(
                    (p) => p.id === DEBUG_RSVP_POST_ID
                  ),
                  appendedDebugId: toAppend.some(
                    (p) => p.id === DEBUG_RSVP_POST_ID
                  ),
                });
                return merged;
              });
              loadingRef.current = false;
              setIsLoadingMore(false);

              if (setCachedItems) {
                scheduleTimeout(() => {
                  if (!mountedRef.current || !isVisibleRef.current) return;
                  setCachedItems(itemsRef.current);
                }, 0);
              }
              initialLoadGuardRef.current = false;
            } else {
              commitHasMore(false);
              loadingRef.current = false;
              setIsLoadingMore(false);
              initialLoadCompleteRef.current = true;
              if (DEBUG_PF) {
                console.log("[PF] initialLoad no items", { logId });
              }
            }
          })
          .catch((err) => {
            const errorMessage =
              err instanceof Error ? err.message : String(err);

            if (itemsRef.current.length === 0 && getCachedItems) {
              const cached = getCachedItems();
              if (cached && cached.length > 0) {
                const deduplicated = Array.from(
                  new Map(cached.map((item) => [item.id, item])).values()
                );
                setItems(deduplicated);
                offsetRef.current = deduplicated.length;
                itemsRef.current = deduplicated;
                initialLoadCompleteRef.current = true;
                setEmptySurfaceAwaitingInitialResponse(false);
              }
            }

            setError(errorMessage);
            console.error("[ProgressiveFeed] Initial load failed:", err);
            // On error, reset loading state immediately
            loadingRef.current = false;
            setIsLoadingMore(false);
            initialLoadCompleteRef.current = true;
            initialLoadGuardRef.current = false; // [DIAGNOSTIC] Reset guard on error
            if (DEBUG_PF) {
              console.log("[PF] initialLoad error", {
                logId,
                error: errorMessage,
              });
            }
          })
          .finally(() => {
            captureSoftBaselineEpoch();
            // CRITICAL FIX: Don't reset loading state here — it's handled in `.then`/`.catch`
            if (items.length === 0) {
              initialLoadCompleteRef.current = true;
            }
            // First-load promise settled — allow zero-row feeds to exit loading and show emptyMessage.
            setEmptySurfaceAwaitingInitialResponse(false);
          });
      };

      if (isPWAValue) {
        const timer = scheduleTimeout(performInitialLoad, 100);
        return () => {
          clearTimeout(timer);
          if (initialLoadGuardRef.current) initialLoadGuardRef.current = false;
        };
      } else {
        performInitialLoad();
      }
    } else if (items.length > 0 || initialItems) {
      // If we have items (from cache or initialItems), mark initial load as complete
      initialLoadCompleteRef.current = true;
      setEmptySurfaceAwaitingInitialResponse(false);
      captureSoftBaselineEpoch();
    }

    // [FIX] Do NOT reset guard in cleanup - prevents StrictMode mount/unmount/mount from
    // clearing the guard and triggering a second initial-load RPC. Guard is still reset on error
    // so real failures can retry. On real unmount the ref is discarded.
    return () => {};
  }, [isVisible]);

  // Refetch offset 0 in place when `softRefreshEpoch` bumps — keeps existing rows until fresh first page merges
  useEffect(() => {
    if (softRefreshEpoch === undefined) return;

    const target = softEpochRef.current;
    if (
      target <= 0 ||
      !softBaselineCapturedRef.current ||
      target <= softBaselineEpochRef.current
    ) {
      return;
    }
    if (!isVisible) return;
    const ready =
      initialLoadCompleteRef.current || itemsRef.current.length > 0;
    if (!ready || softRefreshInFlightRef.current) return;

    let cancelled = false;
    softRefreshInFlightRef.current = true;

    const runLimit = calculateInitialLoadSize();

    void (async () => {
      try {
        if (cancelled || !mountedRef.current) return;

        onSoftRefreshStart?.();
        logFetchStart(
          "ProgressiveFeed",
          tabId,
          isVisibleRef.current,
          undefined
        );

        const loadResult = await loadItems(0, runLimit);

        if (cancelled || !mountedRef.current) return;

        const normalized = normalizeLoadResult(loadResult);
        const fetchedItems = normalized.items;
        const consumedOffset = normalized.consumedOffset;
        const count = normalized.count;

        debugRsvpFreshFetch(fetchedItems, "ProgressiveFeed.softRefresh");

        const fetchedLen = fetchedItems.length;

        if (fetchedLen === 0) {
          offsetRef.current = 0;
          commitHasMore(false);
          setItems([]);
          if (setCachedItems) {
            scheduleTimeout(() => {
              if (!mountedRef.current) return;
              setCachedItems([]);
            }, 0);
          }
          captureSoftBaselineEpoch();
          onSoftRefreshDone?.({
            returnedCount: 0,
            firstPostId: null,
          });
          return;
        }

        const firstPublished = fetchedItems.find((it) => !isDraftRow(it));

        const nextOffset = consumedOffset;
        const nextHasMore = inferHasMoreAfterPage({
          consumedOffsetThisPage: consumedOffset,
          requestedLimit: runLimit,
          nextOffset,
          count,
        });

        offsetRef.current = nextOffset;
        commitHasMore(nextHasMore);

        const idsNeedingActivities = fetchedItems
          .filter(
            (item: T & { activity_count?: number }) =>
              (item.activity_count ?? 0) > 0
          )
          .map((item) => item.id);
        if (idsNeedingActivities.length > 0) {
          batchFetchActivitiesForPosts(idsNeedingActivities);
        }

        const backendIdsInHead = new Set(
          fetchedItems.filter((it) => !isDraftRow(it)).map((it) => it.id)
        );

        setItems((prev) => {
          const seenFresh = new Set<string>();
          const headUnique: T[] = [];
          for (const it of fetchedItems) {
            if (!seenFresh.has(it.id)) {
              seenFresh.add(it.id);
              headUnique.push(it);
            }
          }

          const tailKeep = prev.filter(
            (i) => !isDraftRow(i) && !backendIdsInHead.has(i.id)
          );
          const merged = [...headUnique, ...tailKeep];

          if (maxItems > 0 && merged.length >= maxItems) {
            commitHasMore(false);
          }

          debugRsvpMerged(merged, "softRefresh-merge");

          if (setCachedItems) {
            scheduleTimeout(() => {
              if (!mountedRef.current) return;
              setCachedItems(merged);
            }, 0);
          }
          return merged;
        });

        captureSoftBaselineEpoch();

        chainCountRef.current = 0;
        const tryChainSoft = () => {
          if (
            chainCountRef.current < MAX_CHAINED_LOADS &&
            hasMoreRef.current &&
            isSentinelNearBottom() &&
            !loadingRef.current &&
            !softRefreshInFlightRef.current &&
            initialLoadCompleteRef.current
          ) {
            chainCountRef.current++;
            loadMoreRef.current?.();
          } else {
            chainCountRef.current = 0;
          }
        };
        scheduleRaf(() => scheduleRaf(tryChainSoft));

        onSoftRefreshDone?.({
          returnedCount: fetchedLen,
          firstPostId: firstPublished?.id ?? null,
        });
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("[ProgressiveFeed] Soft refresh failed:", e);
        if (itemsRef.current.length > 0) {
          setError(errorMessage);
        }
      } finally {
        softRefreshInFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    softRefreshEpoch,
    isVisible,
    items.length,
    loadItems,
    calculateInitialLoadSize,
    setCachedItems,
    tabId,
    onSoftRefreshStart,
    onSoftRefreshDone,
    maxItems,
    scheduleRaf,
    scheduleTimeout,
    isSentinelNearBottom,
    isDraftRow,
    commitHasMore,
  ]);

  // Safety check: Update offsetRef if initialItems prop changes after mount
  // This handles edge cases where initialItems changes without component remounting
  // (Normally components should remount with a new key when filters change)
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      const newLength = initialItems.length;
      // Only update if offsetRef doesn't match and we haven't loaded more items yet
      if (offsetRef.current !== newLength && items.length === newLength) {
        console.warn(
          `[ProgressiveFeed] initialItems prop changed. Updating offsetRef from ${offsetRef.current} to ${newLength}. Consider using a key prop to remount component instead.`
        );
        offsetRef.current = newLength;
      }
    }
  }, [initialItems, items.length]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    // [STEP 1] [FIX A] Guard: Don't set up observer if not visible
    if (!isVisible) {
      // [FIX A] Disconnect existing observer if it exists
      if (observerRef.current) {
        if (DEBUG_PF) {
          console.log("[PF] IO disconnect: not visible", { logId });
        }
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (DEBUG_PF) {
        console.log("[PF] IO skip: not visible", { logId });
      }
      return;
    }

    if (!enableLazyLoading || !sentinelRef.current || !hasMore) {
      if (DEBUG_PF) {
        console.log("[PF] IO skip: base guards", {
          logId,
          enableLazyLoading,
          hasMore,
          hasSentinel: !!sentinelRef.current,
        });
      }
      return;
    }
    // [STEP 2] Scroll-stop early return removed - it disconnected IO and caused "skeleton until scroll"

    // [FIX] Removed early return guard - refs don't trigger effect re-runs
    // The initialLoadCompleteRef check is now only inside the IO callback (canLoad)
    // This ensures IO attaches even if initialLoadCompleteRef is false initially

    // [CHAIN] Bottom-prefetch only: trigger when sentinel within 600px of viewport bottom
    const rootMargin = "0px 0px 600px 0px";
    const threshold = 0;

    const observer = new IntersectionObserver(
      (entries) => {
        if (DEBUG_PF) {
          console.log("[PF IO] callback", {
            isIntersecting: entries[0]?.isIntersecting,
            initialLoadCompleteRef: initialLoadCompleteRef.current,
            loadingRef: loadingRef.current,
            isLoadingMore,
            isVisibleRef: isVisibleRef.current,
            hasMoreRef: hasMoreRef.current,
          });
        }
        // Double-check: Ensure initial load is complete AND not currently loading
        const canLoad =
          entries[0].isIntersecting &&
          initialLoadCompleteRef.current && // Initial load must be complete
          !loadingRef.current && // Primary check - ref is more reliable
          !isLoadingMore && // Secondary check - state
          !softRefreshInFlightRef.current &&
          loadMoreRef.current &&
          isVisibleRef.current; // [STEP 1] Check visibility

        if (canLoad && loadMoreRef.current) {
          if (DEBUG_PF) {
            console.log("[PF] IO trigger: loading more", { logId });
            console.log("[ProgressiveFeed] 📥 Loading more items...");
          }
          chainCountRef.current = 0; // Reset on user-triggered load
          loadMoreRef.current();
        } else {
          if (DEBUG_PF) {
            console.log("[PF BLOCKED FLAGS] IO visible but blocked", {
              isIntersecting: entries[0].isIntersecting,
              sentinelPresent: !!sentinelRef.current,
              initialLoadComplete: initialLoadCompleteRef.current,
              loadingRef: loadingRef.current,
              isLoadingMoreState: isLoadingMore,
              hasMoreRef: hasMoreRef.current,
              offset: offsetRef.current,
              itemsLen: itemsRef.current.length,
            });
          }
        }
      },
      {
        // Use viewport root (null) when no external container provided (profile pages scroll window).
        root: externalContainerRef?.current ?? null,
        rootMargin,
        threshold,
      }
    );

    // [FIX A] Store observer in ref
    observerRef.current = observer;
    observer.observe(sentinelRef.current);

    if (DEBUG_PF) {
      console.log("[PF] IO attach", { logId });
    }

    return () => {
      // [FIX A] Proper cleanup: disconnect and null ref
      if (observerRef.current) {
        if (DEBUG_PF) {
          console.log("[PF] IO disconnect: cleanup", { logId });
        }
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [enableLazyLoading, hasMore, isVisible, externalContainerRef]);

  const feedItemShellClass = useCallback(
    (id: string) =>
      [
        "feed-item overflow-visible transition-[opacity,transform] ease-out will-change-[opacity,transform]",
        "duration-[280ms]",
        exitingPostIds.has(id)
          ? "opacity-0 -translate-y-1 pointer-events-none"
          : "opacity-100 translate-y-0",
      ].join(" "),
    [exitingPostIds]
  );

  // Get items to render (virtual scrolling or all)
  const itemsToRender = useMemo(() => {
    if (enableVirtualScrolling && items.length > 50) {
      return items.slice(
        virtualScrolling.startIndex,
        virtualScrolling.endIndex + 1
      );
    }
    return items;
  }, [
    items,
    enableVirtualScrolling,
    virtualScrolling.startIndex,
    virtualScrolling.endIndex,
  ]);

  // Loading state (emptyMessage path requires !isLoading with zero items — see Phase C0)
  const emptyAwaitingBootstrap =
    items.length === 0 &&
    !error &&
    emptySurfaceAwaitingInitialResponse &&
    !externalLoading &&
    !isValidating;
  const isLoading =
    externalLoading || isValidating || emptyAwaitingBootstrap;

  // Error display
  if (error && items.length === 0) {
    return (
      <FeedLoadErrorState
        onRetry={() => {
          setError(null);
          loadMore();
        }}
      />
    );
  }

  // Empty state
  if (!isLoading && items.length === 0) {
    return (
      <div className="w-full py-8 text-center">
        <p className="text-sm text-[var(--text)]/70">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="w-full"
    >
      {error && items.length > 0 && (
        <FeedLoadErrorState
          compact
          onRetry={() => {
            setError(null);
            loadMore();
          }}
        />
      )}

      {/* Items */}
      {enableVirtualScrolling && items.length > 50 ? (
        // Virtual scrolling mode
        <div
          style={{
            height: virtualScrolling.totalHeight,
            position: "relative",
          }}
        >
          {itemsToRender.map((item, index) => {
            const actualIndex = virtualScrolling.startIndex + index;
            return (
              <div
                key={item.id}
                className={feedItemShellClass(item.id)}
                style={{
                  position: "absolute",
                  top: virtualScrolling.getOffsetTop(actualIndex),
                  width: "100%",
                }}
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      ) : (
        // Normal mode (render all items with progressive animation)
        // Note: renderItem should return elements with keys, we don't wrap in Fragment
        <div className="feed-item-container">
          {itemsToRender.map((item, index) => (
            <div key={item.id} className={feedItemShellClass(item.id)}>
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton for next item */}
      {/* FIX: Only show skeleton if hasMore is true AND we're loading */}
      {hasMore && isLoadingMore && loadingComponent && (
        <div className="w-full">
          {/* Single skeleton for next item (progressive) */}
          {loadingComponent}
        </div>
      )}

      {/* "No more posts" message when feed ends */}
      {!hasMore && items.length > 0 && (
        <div className="w-full py-8 text-center">
          <p className="text-sm text-[var(--text)]/70">
            You're all caught up! No more posts to show.
          </p>
        </div>
      )}

      {/* Sentinel for intersection observer */}
      {enableLazyLoading && hasMore && (
        <div
          ref={(el) => {
            sentinelRef.current = el;
          }}
          style={{ height: "1px", width: "100%" }}
        />
      )}
    </div>
  );
}
