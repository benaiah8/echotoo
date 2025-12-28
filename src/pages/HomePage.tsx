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

  // [REFACTOR] Removed items/loading state - ProgressiveFeed is now the single source of truth
  // This eliminates race conditions between HomePage's SWR and ProgressiveFeed's loading
  const [error, setError] = useState<string | null>(null);

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

  // Viewer profile id (profile.id) for cache scoping; different from auth user id
  // Keep stable during session; fetched once
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  const viewerProfileIdRef = useRef<string | null>(null);
  useEffect(() => {
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
  }, []);

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

  const saveScrollPosition = useCallback(
    (key: string, value: number) => {
      try {
        localStorage.setItem(
          `home_scroll:${key}`,
          JSON.stringify({ v: 1, y: Math.max(0, value) })
        );
      } catch (e) {
        // ignore storage errors
      }
    },
    []
  );

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
    console.log('[HomePage] 📜 Restoring scroll position:', savedY, 'for key:', feedCacheKey);
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
      console.log('[HomePage] 💾 Saving scroll position:', latestScrollRef.current, 'for key:', feedCacheKey);
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
            // 1. If filter is selected, prioritize matching posts first
            // 2. Then show remaining posts
            // 3. Mix hangouts and experiences
            // 4. Limit to 8 items for the rail

            // Use recent posts for horizontal rail
            const allAvailablePosts = [...recent];

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
  }, [search, selectedTags, selectedFilters, currentUserId]);

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
                    const feedOptions: FeedOptions = {
                      type: "hangout" as const,
                      q: search || undefined,
                      tags: selectedTags.length > 0 ? selectedTags : undefined,
                      limit,
                      offset,
                      viewerProfileId: viewerProfileId || undefined, // Use state
                    };
                    return USE_OPTIMIZED_FEED
                      ? await getPublicFeedOptimized(feedOptions)
                      : await getPublicFeed(feedOptions);
                  },
                  [search, selectedTags, viewerProfileId] // Added viewerProfileId
                )}
                initialItems={hangouts.length > 0 ? hangouts : undefined}
                getCachedItems={useCallback(() => {
                  const feedOptions = {
                    type: "hangout",
                    q: search || undefined,
                    tags: selectedTags.length > 0 ? selectedTags : undefined,
                    limit: 20,
                    offset: 0,
                    viewerProfileId: viewerProfileId ?? null, // Use state
                  };
                  const cacheKey = dataCache.generateFeedKey(feedOptions);
                  const cached = dataCache.get<FeedItem[]>(cacheKey);
                  return Array.isArray(cached) ? cached : null;
                }, [search, selectedTags, viewerProfileId])} // Added viewerProfileId
                setCachedItems={useCallback(
                  (items: FeedItem[]) => {
                    const feedOptions = {
                      type: "hangout",
                      q: search || undefined,
                      tags: selectedTags.length > 0 ? selectedTags : undefined,
                      limit: 20,
                      offset: 0,
                      viewerProfileId: viewerProfileId ?? null, // Use state
                    };
                    const cacheKey = dataCache.generateFeedKey(feedOptions);
                    dataCache.set(cacheKey, items, 10 * 60 * 1000);
                  },
                  [search, selectedTags, viewerProfileId] // Added viewerProfileId
                )}
              />
            </div>
          )}

          {/* POSTS & INJECTIONS */}
          <div className="w-full max-w-[640px] mx-auto px-0 pt-1">
            <HomePostsSection
              viewMode={viewMode}
              hasActiveFilters={hasActiveFilters}
              tagFallbackItems={tagFallbackItems}
              tagFallbackLoading={tagFallbackLoading}
              showTagFallback={showTagFallback}
              selectedTags={selectedTags}
              hangouts={hangouts}
              hangoutsLoading={hangoutsLoading}
              batchedData={null} // [PHASE 1-4] Removed - PostgreSQL provides all data in FeedItem
              // [REFACTOR] ProgressiveFeed now owns all loading - HomePage is thin
              useProgressiveFeed={true}
              loadItems={useCallback(
                async (offset: number, limit: number) => {
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
                    const { items, count } =
                      await getPublicFeedOptimizedWithCount(feedOptions);
                    return {
                      items,
                      consumedOffset: items.length,
                      count,
                    };
                  } else {
                    const items = await getPublicFeed(feedOptions);
                    return {
                      items,
                      consumedOffset: items.length,
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
            />
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
