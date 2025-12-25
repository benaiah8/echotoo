import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import useScrollDirection from "../hooks/useScrollDirection";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import HomeSearchSection from "../sections/home/HomeSearchSection";
import HomeCategorySection from "../sections/home/HomeCategorySection";
import HomeViewToggleSection from "../sections/home/HomeViewToggleSection";
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
import { FiFilter } from "react-icons/fi";
import { FiPhone } from "react-icons/fi";
import { FaInstagram, FaApple, FaGooglePlay } from "react-icons/fa";
import { dataCache } from "../lib/dataCache";
import { preloadImages } from "../lib/imageOptimization";
import { RootState } from "../app/store";
import { setAuthModal } from "../reducers/modalReducer";
import Modal from "../components/modal/Modal";
import { handleError, getErrorMessage } from "../lib/errorHandling";
import toast from "react-hot-toast";

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
  const scrollDir = useScrollDirection();
  const isHidden = scrollDir === "down";

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

  // main list (respecting viewMode & search)
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Track if we've already passed initial items to prevent unnecessary re-renders
  // Set it synchronously so ProgressiveFeed gets it on mount
  const initialItemsRef = useRef<FeedItem[] | undefined>(undefined);

  // Update ref synchronously when items change (not in useEffect)
  if (items.length > 0 && !initialItemsRef.current) {
    initialItemsRef.current = items;
  }

  // FIX: Clear initialItemsRef when viewMode changes to prevent wrong type items
  useEffect(() => {
    initialItemsRef.current = undefined;
  }, [viewMode]);

  // [PHASE 1-4] Removed batchedData state - PostgreSQL function provides all data in FeedItem

  // horizontal rail - single unified rail
  const [hangouts, setHangouts] = useState<FeedItem[]>([]);
  const [hangoutsLoading, setHangoutsLoading] = useState(false);
  // [PHASE 1-4] Removed hangoutsBatchedData - PostgreSQL provides all data in FeedItem
  // [OPTIMIZATION: Phase 2 - Progressive] Track previous rail items for slow connection fallback

  // "other things you might like" (only when searching)
  const [fallbackItems, setFallbackItems] = useState<FeedItem[]>([]);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  // fallback posts when tag filters return no results
  const [tagFallbackItems, setTagFallbackItems] = useState<FeedItem[]>([]);
  const [tagFallbackLoading, setTagFallbackLoading] = useState(false);
  const [showTagFallback, setShowTagFallback] = useState(false);

  // auth state and modal state for logo functionality
  const dispatch = useDispatch();
  const authState = useSelector((state: RootState) => state.auth);
  const isAuthenticated = !!authState?.user;
  const currentUserId = authState?.user?.id;
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Disable body scroll when modal is open
  useEffect(() => {
    if (showInfoModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = "";
    };
  }, [showInfoModal]);

  // tweak these if your actual header/footer heights differ
  const HEADER_HEIGHT = 120;
  const FOOTER_HEIGHT = 80;

  // compute type filter from viewMode
  const type = useMemo(
    () =>
      viewMode === "hangouts"
        ? "hangout"
        : viewMode === "experiences"
        ? "experience"
        : undefined,
    [viewMode]
  );

  // when filters change, go back to the first page (do NOT clear items here)
  useEffect(() => {
    setPage(0);
    setShowTagFallback(false);
    setTagFallbackItems([]);
  }, [type, search, selectedTags]);

  // load a page for main list
  useEffect(() => {
    // [PHASE 1] Skip legacy loading when ProgressiveFeed is active
    // Why: ProgressiveFeed handles all loading, legacy code causes competing API calls
    const useProgressiveFeed = true; // Matches the prop passed to HomePostsSection
    if (useProgressiveFeed) {
      return; // Skip entire legacy loading logic
    }

    let cancelled = false;
    (async () => {
      try {
        // console.log(
        //   "[HomePage] Starting data fetch - page:",
        //   page,
        //   "type:",
        //   type,
        //   "search:",
        //   search,
        //   "selectedTags:",
        //   selectedTags
        // );
        // Set loading state based on whether it's initial load or pagination
        if (page === 0) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }

        // Get viewer profile ID for privacy filtering
        const viewerProfileId = await getViewerId();

        const feedOptions = {
          // UNIFIED: Now fetching both hangouts and experiences together
          type: undefined, // Remove type filter to get both
          q: search || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          viewerProfileId: viewerProfileId || undefined, // Pass viewer ID for privacy filtering
        };

        let data: FeedItem[] = [];

        // For first page (page === 0), try to use cached data first for faster loading
        if (page === 0) {
          const cacheKey = dataCache.generateFeedKey(feedOptions);
          const cachedData = dataCache.get<FeedItem[]>(cacheKey);

          if (cachedData && cachedData.length > 0) {
            // console.log(
            //   "[HomePage] Using cached data for faster loading:",
            //   cachedData.length,
            //   "posts"
            // );

            // Show cached data immediately
            setItems(cachedData);
            setLoading(false);

            // REMOVED: prefetchRelatedData - batch loader no longer needed
            // PostgreSQL function already provides all data in FeedItem
            // Components handle their own lazy loading when data is not provided

            // Now fetch fresh data in the background
            try {
              const freshData = USE_OPTIMIZED_FEED
                ? await getPublicFeedOptimized(feedOptions)
                : await getPublicFeed(feedOptions);
              if (!cancelled) {
                // Update cache with fresh data (handles new posts intelligently)
                const updatedData = await dataCache.updateFeedCache(
                  freshData,
                  feedOptions
                );
                setItems(updatedData);
                setHasMore(updatedData.length >= PAGE_SIZE);
              }
            } catch (error) {
              console.warn(
                "[HomePage] Failed to fetch fresh data in background:",
                error
              );
              // Keep using cached data if fresh fetch fails
            }
            return;
          }
        }

        // console.log(
        //   "[HomePage] Calling getPublicFeed with options:",
        //   feedOptions
        // );

        data = USE_OPTIMIZED_FEED
          ? await getPublicFeedOptimized(feedOptions)
          : await getPublicFeed(feedOptions);

        // Cache the data for future use
        if (page === 0) {
          const cacheKey = dataCache.generateFeedKey(feedOptions);
          dataCache.set(cacheKey, data, 10 * 60 * 1000); // 10 minutes TTL

          // REMOVED: prefetchRelatedData - batch loader no longer needed
          // PostgreSQL function already provides all data in FeedItem
          // Components handle their own lazy loading when data is not provided
        }

        // console.log(
        //   "[Home] page",
        //   page,
        //   "type",
        //   type ?? "all=>experience",
        //   "search",
        //   search,
        //   "rows",
        //   data.length,
        //   "types",
        //   data.map((r) => r.type),
        //   "data",
        //   data
        // );

        if (cancelled) return;

        if (page === 0) {
          // first page replaces the list
          // console.log("[HomePage] Setting items:", data);
          setItems(data);
          setHasMore(data.length >= PAGE_SIZE);
          setError(null);

          // If we got no data on first page, let's try to debug
          if (data.length === 0) {
            console.warn(
              "[HomePage] No data returned from getPublicFeed on first page"
            );
          }

          // If we have tag filters, always load fallback posts to show other content
          if (selectedTags.length > 0) {
            setShowTagFallback(true);
            setTagFallbackLoading(true);

            try {
              // Load more posts without tag filter to show as "other posts"
              const fallbackData = USE_OPTIMIZED_FEED
                ? await getPublicFeedOptimized({
                    type: undefined, // UNIFIED: Get both types for fallback
                    q: search || undefined,
                    // No tag filter for fallback - show all posts
                    limit: PAGE_SIZE * 2, // Load more to account for filtering out duplicates
                    offset: 0,
                  })
                : await getPublicFeed({
                    type: undefined, // UNIFIED: Get both types for fallback
                    q: search || undefined,
                    // No tag filter for fallback - show all posts
                    limit: PAGE_SIZE * 2, // Load more to account for filtering out duplicates
                    offset: 0,
                  });
              if (!cancelled) {
                // Filter out posts that are already in the main results to avoid duplicates
                const mainPostIds = new Set(data.map((item) => item.id));
                const filteredFallbackData = fallbackData.filter(
                  (item) => !mainPostIds.has(item.id)
                );
                setTagFallbackItems(filteredFallbackData.slice(0, PAGE_SIZE)); // Limit to reasonable amount
              }
            } catch (fallbackError) {
              // [OPTIMIZATION: Phase 7.1.3] Silent error for fallback - already handling gracefully
              // Why: This is a fallback attempt, don't show error if it fails
              console.debug("Error loading fallback posts:", fallbackError);
              if (!cancelled) setTagFallbackItems([]);
            } finally {
              if (!cancelled) setTagFallbackLoading(false);
            }
          } else {
            setShowTagFallback(false);
            setTagFallbackItems([]);
          }
        } else {
          // subsequent pages append
          setItems((prev) => [...prev, ...data]);
          if (data.length < PAGE_SIZE) setHasMore(false);
        }
      } catch (e: any) {
        // [OPTIMIZATION: Phase 7.1.3] Use user-friendly error handling
        // Why: Shows clear error messages to users instead of just console logs
        handleError(e, "HomePage");
        if (!cancelled) {
          const errorMessage = getErrorMessage(e);
          setError(errorMessage);

          // [OPTIMIZATION: Phase 7.1.5] Graceful degradation - try to show cached data on error
          // Why: User still sees content even if network request fails
          if (page === 0) {
            try {
              // [CACHE FIX] Include currentUserId in cache key for user-specific caching
              const cacheKey = dataCache.generateFeedKey({
                type: undefined,
                q: search || undefined,
                tags: selectedTags.length > 0 ? selectedTags : undefined,
                limit: PAGE_SIZE,
                offset: 0,
                viewerProfileId: currentUserId || null, // Use currentUserId as proxy for viewerProfileId
              });
              const cachedData = dataCache.get<FeedItem[]>(cacheKey);
              if (cachedData && cachedData.length > 0) {
                console.log("[HomePage] Showing cached data after error");
                setItems(cachedData);
                setError(null); // Clear error if we have cached data
              } else {
                // No cached data, keep error message
                setItems([]);
              }
            } catch (cacheError) {
              // If cache check fails, just show empty with error
              setItems([]);
            }
          } else {
            // For pagination errors, don't clear existing items - they remain visible
            // Just don't append new items
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [type, search, selectedTags, page]);

  // 🔎 log every render of items (SAFE — not inside JSX)
  useEffect(() => {
    // console.log(
    //   "[HomePage] render items:",
    //   items.length,
    //   items.map((i) => i.type)
    // );
  }, [items]);

  // [OPTIMIZATION: Phase 4 - Prefetch] Prefetch next page when user is 80% through current page
  // Why: Seamless pagination, no loading delay when user reaches bottom
  const handlePrefetchNextPage = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;

    // [OPTIMIZATION: Phase 6 - Connection] Check connection speed before prefetching
    // Why: Skip prefetching on slow connections to save bandwidth
    const { shouldSkipPrefetching } = await import("../lib/connectionAware");
    if (shouldSkipPrefetching()) {
      return; // Skip prefetching on very slow connections
    }

    // Get viewer profile ID for privacy filtering
    (async () => {
      const viewerProfileId = await getViewerId();
      const feedOptions = {
        type: undefined, // UNIFIED: Prefetch both types
        q: search || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        limit: PAGE_SIZE,
        offset: items.length, // Next page offset
        viewerProfileId: viewerProfileId ?? undefined, // Pass viewer ID for privacy filtering
      };

      dataCache.prefetchFeedData(feedOptions);
    })();
  }, [loading, loadingMore, hasMore, search, selectedTags, items.length]);

  // Performance: Prefetch images when items are loaded
  useEffect(() => {
    if (items.length > 0 && !loading) {
      // [OPTIMIZATION: Phase 6 - Connection] Check connection speed before prefetching
      // Why: Skip prefetching on slow connections to save bandwidth
      (async () => {
        const { shouldSkipPrefetching, isSlowConnection } = await import(
          "../lib/connectionAware"
        );
        if (shouldSkipPrefetching()) {
          return; // Skip prefetching on very slow connections
        }

        // [OPTIMIZATION: Phase 6 - Connection] Prioritize critical content on slow connections
        // Why: Load first post images immediately, defer non-critical avatars
        const isSlow = isSlowConnection();

        // On slow connections, only prefetch critical images (first post)
        // On fast connections, prefetch first 3 posts
        const postsToPrefetch = isSlow ? items.slice(0, 1) : items.slice(0, 3);

        // Prefetch images from the selected posts
        onIdle(() => {
          const imageUrls: string[] = [];
          postsToPrefetch.forEach((post) => {
            // Only add author avatar on fast connections (non-critical on slow)
            if (!isSlow && post.author?.avatar_url) {
              imageUrls.push(post.author.avatar_url);
            }
          });

          if (imageUrls.length > 0) {
            preloadImages(imageUrls).catch(() => {
              // Silent fail for image prefetching
            });
          }
          // [OPTIMIZATION: Phase 5 - Rendering] Reduced delay from 1500ms to immediate with requestIdleCallback
          // Why: Faster image prefetching, better perceived performance
        }, 0);
      })();
    }
  }, [items.length, loading, type, search, selectedTags]);

  // horizontal rail: fetch mixed recent and relevant content with filter support
  useEffect(() => {
    let cancelled = false;
    onIdle(() => {
      (async () => {
        try {
          setHangoutsLoading(true);

          // TODO: Implement current location uploads feature
          // For now, we'll fetch recent posts with basic relevance algorithm

          // Get viewer profile ID for privacy filtering
          const viewerProfileId = await getViewerId();

          // Fetch recent posts (both hangouts and experiences)
          const recent = USE_OPTIMIZED_FEED
            ? await getPublicFeedOptimized({
                type: undefined, // Get both types
                q: search || undefined,
                tags: selectedTags.length > 0 ? selectedTags : undefined,
                limit: 20, // Get more to allow for filter prioritization
                offset: 0,
                viewerProfileId: viewerProfileId || undefined, // Pass viewer ID for privacy filtering
              })
            : await getPublicFeed({
                type: undefined, // Get both types
                q: search || undefined,
                tags: selectedTags.length > 0 ? selectedTags : undefined,
                limit: 20, // Get more to allow for filter prioritization
                offset: 0,
                viewerProfileId: viewerProfileId || undefined, // Pass viewer ID for privacy filtering
              });

          if (!cancelled) {
            // Filter-based prioritization algorithm:
            // 1. Combine recent posts with main feed posts for better coverage
            // 2. If filter is selected, prioritize matching posts first
            // 3. Then show remaining posts
            // 4. Mix hangouts and experiences
            // 5. Limit to 8 items for the rail

            // Combine recent posts with main feed posts to ensure we have all available posts
            const allAvailablePosts = [...recent];

            // Add posts from main feed that aren't already in recent
            const recentIds = new Set(recent.map((p) => p.id));
            const additionalPosts = items.filter(
              (post) => !recentIds.has(post.id)
            );
            allAvailablePosts.push(...additionalPosts);

            let prioritizedPosts = allAvailablePosts;

            // Apply filter prioritization
            if (selectedFilters.length > 0) {
              // Multiple filters: show posts that match ANY of the selected filters, ordered by recent date
              let filteredPosts: FeedItem[] = [];

              for (const filter of selectedFilters) {
                if (filter === "anonymous") {
                  const anonymousPosts = allAvailablePosts.filter(
                    (post) => post.is_anonymous
                  );
                  filteredPosts.push(...anonymousPosts);
                } else if (filter === "today") {
                  const today = new Date();
                  const todayStart = new Date(
                    today.getFullYear(),
                    today.getMonth(),
                    today.getDate()
                  );
                  const todayEnd = new Date(
                    todayStart.getTime() + 24 * 60 * 60 * 1000
                  );
                  const todayPosts = allAvailablePosts.filter((post) => {
                    const postDate = new Date(post.created_at);
                    return postDate >= todayStart && postDate < todayEnd;
                  });
                  filteredPosts.push(...todayPosts);
                } else if (filter === "friends") {
                  if (currentUserId) {
                    try {
                      // Get current user's profile ID
                      const { data: profile } = await supabase
                        .from("profiles")
                        .select("id")
                        .eq("user_id", currentUserId)
                        .single();

                      if (profile?.id) {
                        // Get users who follow you
                        const { data: followersData } = await supabase
                          .from("follows")
                          .select("follower_id")
                          .eq("following_id", profile.id);

                        // Get users you follow
                        const { data: followingData } = await supabase
                          .from("follows")
                          .select("following_id")
                          .eq("follower_id", profile.id);

                        const followerIds = new Set(
                          followersData?.map((f) => f.follower_id) || []
                        );
                        const followingIds = new Set(
                          followingData?.map((f) => f.following_id) || []
                        );

                        // Mutual friends = intersection of followers and following
                        const mutualFriendIds = new Set(
                          [...followerIds].filter((id) => followingIds.has(id))
                        );

                        // Get posts from mutual friends
                        const friendsPosts = allAvailablePosts.filter((post) =>
                          mutualFriendIds.has(post.author_id)
                        );
                        filteredPosts.push(...friendsPosts);
                      }
                    } catch (error) {
                      console.error("Error fetching mutual friends:", error);
                    }
                  }
                }
              }

              // Remove duplicates and sort by recent date
              const uniquePosts = Array.from(
                new Map(filteredPosts.map((post) => [post.id, post])).values()
              );
              prioritizedPosts = uniquePosts.sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
              );
            } else {
              // No filters: show all posts
              prioritizedPosts = allAvailablePosts;
            }

            // If user has selected tags AND no filter is active, boost posts with matching tags
            if (selectedTags.length > 0 && selectedFilters.length === 0) {
              const taggedPosts = prioritizedPosts.filter(
                (post) =>
                  post.tags &&
                  post.tags.some((tag) => selectedTags.includes(tag))
              );
              const otherPosts = prioritizedPosts.filter(
                (post) =>
                  !post.tags ||
                  !post.tags.some((tag) => selectedTags.includes(tag))
              );

              // Simple tag boosting when no filters are active
              prioritizedPosts = [...taggedPosts, ...otherPosts];

              // STEP 4: Debug tag boosting result
              console.log("[DEBUG STEP 4] Tag boosting applied:", {
                taggedPostsCount: taggedPosts.length,
                otherPostsCount: otherPosts.length,
                prioritizedPostsCount: prioritizedPosts.length,
              });
            }

            // When filters are active, show ONLY matching posts first
            // Only mix hangouts/experiences if no filter is active
            let finalPosts = prioritizedPosts;

            if (selectedFilters.length === 0) {
              // No filter active: mix hangouts and experiences
              const hangoutPosts = prioritizedPosts.filter(
                (p) => p.type === "hangout"
              );
              const experiencePosts = prioritizedPosts.filter(
                (p) => p.type === "experience"
              );

              const mixedPosts = [];
              const maxLength = Math.max(
                hangoutPosts.length,
                experiencePosts.length
              );

              for (let i = 0; i < maxLength && mixedPosts.length < 8; i++) {
                if (hangoutPosts[i]) mixedPosts.push(hangoutPosts[i]);
                if (experiencePosts[i] && mixedPosts.length < 8)
                  mixedPosts.push(experiencePosts[i]);
              }

              finalPosts = mixedPosts;
            } else {
              // Filter is active: show ONLY the prioritized posts (no mixing)
              // This ensures we only show matching posts when a filter is active
              finalPosts = prioritizedPosts;
            }

            const hangoutsToShow = finalPosts.slice(0, 8);
            setHangouts(hangoutsToShow);
            // [PHASE 1-4] Removed batch loading - PostgreSQL function provides all data in FeedItem
          }
        } finally {
          if (!cancelled) setHangoutsLoading(false);
        }
      })();
      // [OPTIMIZATION: Phase 5 - Rendering] Reduced delay from 500ms to immediate
      // Why: Faster fallback loading, better UX
    }, 0);
    return () => {
      cancelled = true;
    };
  }, [search, selectedTags, selectedFilters, items, currentUserId]);

  // fallback bucket: when searching, fetch a few non-search posts (exclude IDs from main results)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!search) {
        setFallbackItems([]);
        return;
      }
      try {
        setFallbackLoading(true);
        const primary = new Set(items.map((p) => p.id));
        const others = USE_OPTIMIZED_FEED
          ? await getPublicFeedOptimized({
              type: undefined, // UNIFIED: Get both types for fallback
              limit: 12,
              offset: 0,
            })
          : await getPublicFeed({
              type: undefined, // UNIFIED: Get both types for fallback
              limit: 12,
              offset: 0,
            });

        const filtered = others.filter((p) => !primary.has(p.id));
        if (!cancelled) setFallbackItems(filtered);
      } finally {
        if (!cancelled) setFallbackLoading(false);
      }
    })();
    // re-run when search, type, or the first page of results changes
  }, [
    search,
    type,
    items
      .slice(0, PAGE_SIZE)
      .map((p) => p.id)
      .join(","),
  ]);

  // infinite scroll observer — do NOT start until first page is on screen
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // wait until we have at least one item rendered
    if (items.length === 0) return;

    // don't observe while loading more or if there's nothing more to load
    if (!hasMore || loadingMore) return;

    const node = sentinelRef.current;
    if (!node) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          // ask for next page
          setPage((p) => p + 1);
        }
      },
      {
        root: null,
        // [OPTIMIZATION: Phase 5 - Image] Optimized rootMargin for better prefetching
        // Why: 150px is optimal - prefetches early enough without wasting bandwidth
        rootMargin: "150px 0px 150px 0px",
        threshold: 0.1,
      }
    );

    obs.observe(node);
    return () => obs.disconnect();
    // IMPORTANT: depend on items.length (first page on screen), not sentinelRef.current
  }, [items.length, hasMore, loadingMore]);

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

  return (
    <>
      <PrimaryPageContainer hideUI={isHidden}>
        {/* FIXED HEADER */}
        <div className="fixed inset-x-0 top-0 z-30 shadow-[0_1px_0_var(--border)]">
          <div className="w-full max-w-[640px] mx-auto bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)] px-3 pt-3 pb-0">
            {/* Row 1: search (left) + logo (right) */}
            <HomeSearchSection
              onSearch={setSearch}
              onToggleFilters={handleFilterClick} // ← use our handler
              hasActiveFilters={hasActiveFilters}
              collapseFilters={isHidden && !forceRevealHeader} // ← don't collapse while force-revealed
              onLogoClick={handleLogoClick}
              onFilterChange={setSelectedFilters}
            />

            {/* Row 3 (dropdown): appears when filter is open; hides on scroll-down */}
            <div
              className={`overflow-hidden transition-all duration-300 ${
                filtersOpen
                  ? "max-h-[240px] opacity-100 pb-2"
                  : "max-h-0 opacity-0"
              }`}
            >
              {/* Section divider between tags and toggles */}
              <div className="h-px bg-[var(--border)]/100 my-2 mb-3 -mx-[var(--gutter)]" />

              {/* Tags */}
              <HomeCategorySection
                selected={selectedTags}
                onTagsChange={setSelectedTags}
                onClear={handleClearFilters}
              />

              {/* Toggle between Hangouts / Experiences */}
              <div className="pt-1">
                <HomeViewToggleSection
                  viewMode={viewMode}
                  setViewMode={setViewMode}
                />
              </div>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div
          style={{ paddingTop: HEADER_HEIGHT, paddingBottom: FOOTER_HEIGHT }}
        >
          {/* HORIZONTAL RAIL AT TOP - shows mixed recent content */}
          {viewMode === "all" && (
            <div className="w-full max-w-[640px] mx-auto px-0">
              <HomeHangoutSection
                items={hangouts}
                loading={hangoutsLoading}
                batchedData={null} // [PHASE 1-4] Removed - PostgreSQL provides all data in FeedItem
                // [OPTIMIZATION: Phase 2 - Progressive] Progressive loading for horizontal rail
                useProgressiveLoading={true}
                loadItems={useCallback(
                  async (offset: number, limit: number) => {
                    const viewerProfileId = await getViewerId();
                    const feedOptions: FeedOptions = {
                      type: "hangout" as const, // FIX: Filter at PostgreSQL level
                      q: search || undefined,
                      tags: selectedTags.length > 0 ? selectedTags : undefined,
                      limit,
                      offset,
                      viewerProfileId: viewerProfileId || undefined,
                    };
                    // FIX: No need to filter, PostgreSQL already returns hangouts only
                    return USE_OPTIMIZED_FEED
                      ? await getPublicFeedOptimized(feedOptions)
                      : await getPublicFeed(feedOptions);
                  },
                  [search, selectedTags]
                )}
                initialItems={hangouts.length > 0 ? hangouts : undefined}
                getCachedItems={useCallback(() => {
                  // Cache key for horizontal rail
                  // [CACHE FIX] Include currentUserId in cache key for user-specific caching
                  const feedOptions = {
                    type: "hangout", // Already filtered at PostgreSQL level
                    q: search || undefined,
                    tags: selectedTags.length > 0 ? selectedTags : undefined,
                    limit: 20,
                    offset: 0,
                    viewerProfileId: currentUserId || null, // Use currentUserId as proxy for viewerProfileId
                  };
                  const cacheKey = dataCache.generateFeedKey(feedOptions);
                  const cached = dataCache.get<FeedItem[]>(cacheKey);
                  // FIX: No need to filter, cache already contains only hangouts
                  return Array.isArray(cached) ? cached : null;
                }, [search, selectedTags, currentUserId])} // [CACHE FIX] Add currentUserId to dependencies
                setCachedItems={useCallback(
                  (items: FeedItem[]) => {
                    // [CACHE FIX] Include currentUserId in cache key for user-specific caching
                    const feedOptions = {
                      type: "hangout",
                      q: search || undefined,
                      tags: selectedTags.length > 0 ? selectedTags : undefined,
                      limit: 20,
                      offset: 0,
                      viewerProfileId: currentUserId || null, // Use currentUserId as proxy for viewerProfileId
                    };
                    const cacheKey = dataCache.generateFeedKey(feedOptions);
                    dataCache.set(cacheKey, items, 10 * 60 * 1000); // 10 minutes TTL
                  },
                  [search, selectedTags, currentUserId] // [CACHE FIX] Add currentUserId to dependencies
                )}
              />
            </div>
          )}

          {/* POSTS & INJECTIONS */}
          <div className="w-full max-w-[640px] mx-auto px-0 pt-1">
            {/* [OPTIMIZATION: Phase 7.1.4] Error display with retry button */}
            {error && (
              <div className="px-3 py-3 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 flex items-center justify-between gap-3">
                <div className="flex-1">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
                <button
                  onClick={() => {
                    setError(null);
                    setPage(0); // Reset to first page and trigger refetch
                  }}
                  className="px-3 py-1.5 text-xs rounded-lg border border-red-500/50 bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
                >
                  Retry
                </button>
              </div>
            )}

            <HomePostsSection
              viewMode={viewMode}
              items={items} // Legacy mode - will be phased out
              loading={loading}
              loadingMore={loadingMore}
              hasActiveFilters={hasActiveFilters}
              tagFallbackItems={tagFallbackItems}
              tagFallbackLoading={tagFallbackLoading}
              showTagFallback={showTagFallback}
              selectedTags={selectedTags}
              hangouts={hangouts}
              hangoutsLoading={hangoutsLoading}
              onPrefetchNextPage={handlePrefetchNextPage}
              batchedData={null} // [PHASE 1-4] Removed - PostgreSQL provides all data in FeedItem
              // [OPTIMIZATION: Phase 2 - Progressive] Progressive feed props
              useProgressiveFeed={true} // Enable progressive rendering
              loadItems={useCallback(
                async (offset: number, limit: number) => {
                  const viewerProfileId = await getViewerId();
                  const feedOptions: FeedOptions = {
                    // FIX: Pass type filter to PostgreSQL for server-side filtering
                    type:
                      viewMode === "hangouts"
                        ? ("hangout" as const)
                        : viewMode === "experiences"
                        ? ("experience" as const)
                        : undefined, // "all" = undefined (get both types)
                    q: search || undefined,
                    tags: selectedTags.length > 0 ? selectedTags : undefined,
                    limit,
                    offset,
                    viewerProfileId: viewerProfileId || undefined,
                  };
                  if (USE_OPTIMIZED_FEED) {
                    // Use new function that returns count for reliable hasMore detection
                    const { items, count } =
                      await getPublicFeedOptimizedWithCount(feedOptions);
                    return {
                      items,
                      consumedOffset: items.length,
                      count, // Include count for hasMore detection
                    };
                  } else {
                    const items = await getPublicFeed(feedOptions);
                    return {
                      items,
                      consumedOffset: items.length,
                    };
                  }
                },
                [search, selectedTags, viewMode] // FIX: Add viewMode to dependencies
              )}
              initialItems={initialItemsRef.current || []} // Ensure array, not undefined
              getCachedItems={useCallback(() => {
                // Use dataCache directly (sync operation)
                // [CACHE FIX] Include currentUserId in cache key for user-specific caching
                const feedOptions = {
                  // FIX: Include type filter in cache key (matches loadItems)
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
                  viewerProfileId: currentUserId || null, // Use currentUserId as proxy for viewerProfileId
                };
                const cacheKey = dataCache.generateFeedKey(feedOptions);
                const cached = dataCache.get<FeedItem[]>(cacheKey);
                // Ensure we return an array or null (not undefined or other types)
                return Array.isArray(cached) ? cached : null;
              }, [search, selectedTags, viewMode, currentUserId])} // [CACHE FIX] Add currentUserId to dependencies
              setCachedItems={useCallback(
                (items: FeedItem[]) => {
                  // [CACHE FIX] Include currentUserId in cache key for user-specific caching
                  const feedOptions = {
                    // FIX: Include type filter in cache key (matches loadItems)
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
                    viewerProfileId: currentUserId || null, // Use currentUserId as proxy for viewerProfileId
                  };
                  const cacheKey = dataCache.generateFeedKey(feedOptions);
                  dataCache.set(cacheKey, items, 10 * 60 * 1000); // 10 minutes TTL
                },
                [search, selectedTags, viewMode, currentUserId] // [CACHE FIX] Add currentUserId to dependencies
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
                currentUserId: currentUserId || null, // FIX: Include for feedKey to reset on auth change
              }}
            />

            {/* "Other things you might like" appears only during search */}
            {search && (
              <div className="mt-6">
                <div className="text-[var(--text)]/80 text-sm mb-2">
                  Other things you might like
                </div>
                <HomePostsSection
                  viewMode={viewMode}
                  items={fallbackItems}
                  loading={fallbackLoading}
                />
              </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-10" />
            {!hasMore && !loading && (
              <div className="text-[var(--text)]/50 text-xs py-6 text-center">
                You’re all caught up.
              </div>
            )}
          </div>
        </div>
      </PrimaryPageContainer>

      {/* Info Modal for authenticated users - Full Screen */}
      {showInfoModal && (
        <div className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col">
          {/* Header with close button */}
          <div className="flex justify-end p-4">
            <button
              onClick={() => setShowInfoModal(false)}
              className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center text-[var(--text)] hover:bg-[var(--surface)]/80 transition"
            >
              ×
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col justify-center items-center px-6">
            <div className="text-center max-w-md">
              <h2 className="text-2xl font-semibold text-[var(--text)] mb-6">
                Welcome to Echotoo
              </h2>
              <p className="text-base text-[var(--text)]/80 mb-8 leading-relaxed">
                The only place you need when you go out. Discover local hangouts
                and experiences, connect with friends, and make the most of your
                social life.
              </p>

              {/* Contact Section */}
              <div className="mb-8">
                <p className="text-sm text-[var(--text)]/70 mb-4">
                  If you want to reach out to work with us, talk to us, or
                  invest in Echotoo, you can contact us:
                </p>

                <div className="flex flex-col gap-3">
                  {/* Phone */}
                  <a
                    href="tel:0902327218"
                    className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:bg-[var(--surface)]/80 transition"
                  >
                    <FiPhone className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">0902327218</span>
                  </a>

                  {/* Instagram */}
                  <a
                    href="https://www.instagram.com/benaiah.a.t/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] hover:bg-[var(--surface)]/80 transition"
                  >
                    <FaInstagram className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">@benaiah.a.t</span>
                  </a>
                </div>
              </div>

              {/* App Store & Play Store Section */}
              <div className="mb-8">
                <p className="text-sm text-[var(--text)]/70 mb-4">
                  Download our mobile app:
                </p>

                <div className="flex flex-col gap-3">
                  {/* App Store */}
                  <div className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] opacity-60">
                    <FaApple className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">App Store</span>
                    <span className="text-xs text-[var(--text)]/50 ml-auto">
                      Coming Soon
                    </span>
                  </div>

                  {/* Play Store */}
                  <div className="flex items-center justify-center gap-3 p-3 bg-[var(--surface)] rounded-lg border border-[var(--border)] opacity-60">
                    <FaGooglePlay className="text-[var(--brand)] text-lg" />
                    <span className="text-[var(--text)]">Google Play</span>
                    <span className="text-xs text-[var(--text)]/50 ml-auto">
                      Coming Soon
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowInfoModal(false)}
                className="w-full bg-[var(--brand)] text-[var(--brand-ink)] py-3 rounded-lg text-sm font-medium hover:brightness-110 transition"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
