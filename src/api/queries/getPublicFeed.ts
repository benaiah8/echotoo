import { supabase } from "../../lib/supabaseClient";
import { sortFeedItems, type FeedItemWithDates } from "../../lib/feedSorting";
import {
  dataCache,
  cacheFeedResult,
  getCachedFeedResult,
} from "../../lib/dataCache";
import { retry } from "../../lib/retry";
import { filterExpiredHangouts } from "../../lib/feedExpiryFilters";

const IS_DEV_BUILD = Boolean(import.meta.env.DEV);

/** Non-empty feed pages only — empty `[]` must not short-circuit network fetches (Phase 1.1). */
function isNonemptyFeedCache<T>(
  cached: T[] | null | undefined
): cached is T[] {
  return Array.isArray(cached) && cached.length > 0;
}

/** TEMP — paste target post UUID; remove after RSVP feed diagnosis */
const DEBUG_RSVP_POST_ID = "";

const isCloudinaryUrl = (u: string) =>
  typeof u === "string" && u.includes("res.cloudinary.com");

/**
 * Prefer non-Cloudinary (Supabase) over Cloudinary when both exist.
 * - If activity has BOTH Supabase and Cloudinary URLs: drop Cloudinary, keep Supabase.
 * - If activity has ONLY Cloudinary: leave as-is (log for migration tracking).
 */
function normalizeActivityImages(
  images: string[] | null | undefined
): string[] | null {
  if (!images || images.length === 0) return images ?? null;
  const arr = images.filter((u): u is string => !!u && typeof u === "string");
  if (arr.length === 0) return null;
  const hasNonCloudinary = arr.some((u) => !isCloudinaryUrl(u));
  const hasCloudinary = arr.some(isCloudinaryUrl);
  if (hasNonCloudinary && hasCloudinary) {
    return arr.filter((u) => !isCloudinaryUrl(u));
  }
  if (hasCloudinary && !hasNonCloudinary && IS_DEV_BUILD) {
    console.log(
      "[FeedMap][CLOUDINARY_ONLY] activity has only Cloudinary URLs, leaving as-is for migration tracking",
      {
        imagesCount: arr.length,
        first: arr[0]?.substring(0, 100),
      }
    );
  }
  return arr;
}

// Top-level in-flight dedupe: same dedupeKey (feed opts) produces one RPC even if called twice back-to-back (e.g. StrictMode)
const feedRpcInFlight = new Map<
  string,
  Promise<{ items: FeedItem[]; consumedOffset?: number; count: number }>
>();

export type FeedItem = {
  id: string;
  type: "experience" | "hangout";
  caption: string | null;
  is_anonymous: boolean | null;
  anonymous_name: string | null; // NEW: anonymous name
  anonymous_avatar: string | null; // NEW: anonymous avatar
  created_at: string;
  selected_dates?: string[] | null;
  tags?: string[] | null;

  author_id: string;
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_private?: boolean | null;
  } | null;

  // [OPTIMIZATION: Phase 1 - PostgreSQL] Fields from PostgreSQL function
  // Optional for backward compatibility with old queries
  follow_status?: "none" | "pending" | "following" | "friends";
  is_liked?: boolean;
  is_saved?: boolean;
  comment_count?: number;
  like_count?: number;
  save_count?: number;
  effective_like_count?: number;
  effective_save_count?: number;
  share_count?: number;
  has_images?: boolean; // [OPTIMIZATION: Phase 3.1] Indicates if post has images (for immediate skeleton display)
  rsvp_data?: {
    users?: Array<{
      id: string;
      username: string | null;
      display_name: string | null;
      avatar_url: string | null;
      status: "going" | "maybe" | "not_going";
      created_at: string;
    }>;
    currentUserStatus: string | null;
    going_count?: number; // [SHRINK] Minimal feed: count only, no user list
  } | null;
  // [OPTIMIZATION: Phase 3.4] Additional fields for detail pages
  status?: "draft" | "published";
  visibility?: "public" | "friends" | "private";
  rsvp_capacity?: number | null;
  is_recurring?: boolean | null;
  recurrence_days?: string[] | null;
  /** Author opt-in for star ratings (optional until RPCs return it everywhere). */
  rating_enabled?: boolean;
  /** Aggregate average from post row (feed/detail RPC). */
  rating_average?: number | null;
  rating_count?: number | null;
  effective_rating_average?: number | null;
  effective_rating_count?: number | null;
  /** Current viewer's stars; null if logged out or unrated. */
  viewer_rating?: number | null;
  activities?: Array<{
    id?: string;
    title: string | null;
    images: string[] | null;
    order_idx: number | null;
    location_name?: string | null;
    location_desc?: string | null;
    location_url?: string | null;
    location_notes?: string | null;
    additional_info?: { title: string; value: string }[] | null;
    tags?: string[] | null;
  }>;
  // [SHRINK] Feed returns activity summary only; full activities fetched on detail
  activity_count?: number;
  first_image_url?: string | null;
  image_count?: number;
};

export type FeedOptions = {
  type?: "experience" | "hangout";
  q?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  viewerProfileId?: string; // Optional: viewer's profile ID for privacy filtering
  /** YYYY-MM-DD viewer-local occurrence date for Today filter (RPC `p_occurs_on`). */
  occursOn?: string | null;
  /** IANA timezone (RPC `p_occurs_tz`). With `occursOn`, enables server-side Today filtering. */
  occursTz?: string | null;
  /** Inclusive viewer-local range start for week filters (RPC `p_occurs_from`). */
  occursFrom?: string | null;
  /** Inclusive viewer-local range end for week filters (RPC `p_occurs_to`). */
  occursTo?: string | null;
  /** When true, RPC returns only posts from mutual approved follows (`p_friends_only`). */
  friendsOnly?: boolean;
};

/** Map FeedOptions to dataCache.generateFeedKey input (`friendsOnly` → `filters` segment). */
export function feedOptionsForCacheKey(
  opts: FeedOptions
): Parameters<typeof dataCache.generateFeedKey>[0] {
  const {
    friendsOnly,
    type,
    q,
    tags,
    limit,
    offset,
    viewerProfileId,
    occursOn,
    occursTz,
    occursFrom,
    occursTo,
  } = opts;
  return {
    type,
    q,
    tags,
    limit,
    offset,
    viewerProfileId,
    occursOn,
    occursTz,
    occursFrom,
    occursTo,
    filters: friendsOnly ? ["friends"] : undefined,
  };
}

export async function getPublicFeed(
  opts: FeedOptions = {}
): Promise<FeedItem[]> {
  // console.log("[getPublicFeed] Starting query with opts:", opts);

  const { type, q, tags, limit = 12, offset = 0, viewerProfileId } = opts;
  if (offset === 0) {
    // [CACHE FIX] Pass viewerProfileId to generateFeedKey for user-specific caching
    const cacheKey = dataCache.generateFeedKey(
      feedOptionsForCacheKey({ ...opts, viewerProfileId })
    );
    const cachedData = getCachedFeedResult<FeedItem>(cacheKey);
    if (isNonemptyFeedCache(cachedData)) {
      // console.log("[getPublicFeed] Returning cached data for key:", cacheKey);
      return cachedData;
    }
  }

  let query = supabase
    .from("posts")
    .select(
      `
      id,
       type,
       caption,
       is_anonymous,
       anonymous_name,
       anonymous_avatar,
       created_at,
       selected_dates,
       is_recurring,
       recurrence_days,
       tags,
       author_id,
       rsvp_capacity,
         author:profiles!author_id(
        id, username, display_name, avatar_url, is_private, deleted_at
  )
`
    )

    // newest first (we'll sort smartly after fetching)
    .order("created_at", { ascending: false })
    // pagination
    .range(offset, offset + limit - 1);

  if (type) {
    // console.log("[getPublicFeed] Adding type filter:", type);
    query = query.eq("type", type);
  }
  if (q && q.trim()) {
    // console.log("[getPublicFeed] Adding search filter:", q);
    // Caption-only: PostgREST cannot express tokenized caption+tags search here. Home uses RPC
    // (get_feed_with_related_data) when USE_OPTIMIZED_FEED is true; keep this path simple.
    query = query.ilike("caption", `%${q.trim()}%`);
  }

  // Filter by tags if provided
  if (tags && tags.length > 0) {
    // console.log("[getPublicFeed] Adding tags filter:", tags);
    // Filter posts that have at least one of the selected tags
    query = query.overlaps("tags", tags);
  }

  // console.log("[getPublicFeed] About to execute query...");

  // [OPTIMIZATION: Phase 7.2] Add retry logic to database query
  // Why: Handles transient network failures gracefully, improves reliability
  // [FIX] Build query inside retry function - Supabase query builders should be fresh for each retry attempt
  let data: any[] | null = null;
  let error: any = null;

  try {
    const result = await retry(
      async () => {
        // Build query fresh for each retry attempt
        let retryQuery = supabase
          .from("posts")
          .select(
            `
            id,
             type,
             caption,
             is_anonymous,
             anonymous_name,
             anonymous_avatar,
             created_at,
             selected_dates,
             is_recurring,
             recurrence_days,
             tags,
             author_id,
             rsvp_capacity,
               author:profiles!author_id(
                id, username, display_name, avatar_url, is_private, deleted_at
          )
        `
          )
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (type) {
          retryQuery = retryQuery.eq("type", type);
        }
        if (q && q.trim()) {
          retryQuery = retryQuery.ilike("caption", `%${q.trim()}%`);
        }
        if (tags && tags.length > 0) {
          retryQuery = retryQuery.overlaps("tags", tags);
        }

        const { data: retryData, error: retryError } = await retryQuery;
        if (retryError) {
          throw retryError; // Retry will catch and retry this
        }
        return retryData;
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        onRetry: (attempt, err) => {
          if (IS_DEV_BUILD) {
            console.log(
              `[getPublicFeed] Retry attempt ${attempt} after error:`,
              err
            );
          }
        },
      }
    );
    data = result;
  } catch (retryError: any) {
    error = retryError;
    console.error("[getPublicFeed] Query failed after retries:", retryError);

    // [OPTIMIZATION: Phase 7.5] Graceful degradation: return cached data on error
    // Why: User still sees content even if network request fails
    if (offset === 0) {
      // [CACHE FIX] Pass viewerProfileId to generateFeedKey for user-specific caching
      const cacheKey = dataCache.generateFeedKey(
        feedOptionsForCacheKey({ ...opts, viewerProfileId })
      );
      const cachedData = getCachedFeedResult<FeedItem>(cacheKey);
      if (isNonemptyFeedCache(cachedData)) {
        if (IS_DEV_BUILD) {
          console.log(
            "[getPublicFeed] Returning cached data after query failure"
          );
        }
        return cachedData;
      }
    }

    // If no cached data available, throw the error
    throw error;
  }

  // console.log("[getPublicFeed] Query result:", {
  //   data,
  //   error,
  //   dataLength: data?.length,
  // });

  let rawData = (data ?? []) as unknown as FeedItemWithDates[];
  // Exclude posts from soft-deleted authors (direct query path; RPC path filters server-side)
  rawData = rawData.filter(
    (p) => !(p.author as { deleted_at?: string | null } | null)?.deleted_at
  ) as FeedItemWithDates[];
  // console.log("[getPublicFeed] Raw data:", rawData, "length:", rawData.length);

  // [OPTIMIZATION: Phase 1 - Privacy Filter] Use centralized privacy filter utility
  // Why: Eliminates code duplication, ensures consistent filtering, uses caching and batching
  if (rawData.length > 0) {
    const { filterPostsByPrivacy } = await import(
      "../../lib/postPrivacyFilter"
    );
    rawData = await filterPostsByPrivacy(rawData, opts.viewerProfileId);
  }

  // Apply smart sorting for better user experience
  const sortedData = sortFeedItems(rawData);
  // console.log(
  //   "[getPublicFeed] Sorted data:",
  //   sortedData,
  //   "length:",
  //   sortedData.length
  // );

  // Temporary: if sorting removes items, return raw data instead
  if (rawData.length > 0 && sortedData.length === 0) {
    console.warn(
      "[getPublicFeed] Sorting removed all items, returning raw data"
    );
    return rawData as FeedItem[];
  }

  // [PHASE 1] Filter expired hangouts immediately after sorting
  // Why: Remove hangouts with all past dates before returning to feed
  // This ensures expired events never appear in Home feed
  const filteredData = filterExpiredHangouts(sortedData);

  // Debug: Log the final return data
  // console.log(
  //   "[getPublicFeed] Final return data:",
  //   filteredData,
  //   "length:",
  //   filteredData.length
  // );

  const finalData = filteredData as FeedItem[];

  // Cache the result for first page queries only (non-empty — avoid false empty after chip toggles)
  if (offset === 0 && finalData.length > 0) {
    // [CACHE FIX] Pass viewerProfileId to generateFeedKey for user-specific caching
    const cacheKey = dataCache.generateFeedKey(
      feedOptionsForCacheKey({ ...opts, viewerProfileId })
    );
    cacheFeedResult(cacheKey, finalData, 2 * 60 * 1000); // Cache for 2 minutes

    // DISABLED: Prefetching conflicts with ProgressiveFeed's loading mechanism
    // ProgressiveFeed handles loading efficiently with small batches (2-3 items)
    // Prefetching causes race conditions and multiple calls with offset 0
    // dataCache.prefetchFeedData(opts);
  }

  return finalData;
}

/**
 * Optimized feed function using PostgreSQL function
 * Reduces egress by 60-70% and improves load times by 60-75%
 *
 * This function calls the PostgreSQL function `get_feed_with_related_data`
 * which aggregates all related data (follows, likes, saves, RSVPs) in a single query.
 */
/**
 * Internal function that returns both items and count from PostgreSQL function.
 * Used by ProgressiveFeed for reliable hasMore detection.
 */
export async function getPublicFeedOptimizedWithCount(
  opts: FeedOptions = {}
): Promise<{ items: FeedItem[]; consumedOffset?: number; count: number }> {
  const {
    type,
    q,
    tags,
    limit = 12,
    offset = 0,
    viewerProfileId,
    occursOn = null,
    occursTz = null,
    occursFrom = null,
    occursTo = null,
    friendsOnly,
  } = opts;

  // [PHASE 2.3 - FIX] Wait for cache preload to complete before checking cache
  // Why: Ensures cache is loaded from StorageManager before cache lookup
  // This prevents cache misses on second load when cache exists but isn't preloaded yet
  await dataCache.ready;

  // [OPTIMIZATION: Phase 4] Normalize limit BEFORE cache lookup for offset=0
  // Why: Allows cache sharing between different limit requests (limit:5 and limit:10 both use limit:20 cache)
  // Strategy: Check normalized cache first, then exact cache, then larger limits
  // This must happen before cache lookup to ensure cache keys use normalized limit when appropriate
  const normalizedLimitForCache = offset === 0 ? Math.max(limit, 20) : limit;

  // [PHASE 2.3 - Layer 1] Smart Cache Lookup: Check cache first, including normalized and larger limits
  // Why: Allows cache sharing between main feed (limit: 5) and rails (limit: 20)
  // This eliminates duplicate RPC calls when data is already cached with larger limit
  if (offset === 0) {
    // Step 1: Check normalized cache first (for offset=0 with limit < 20)
    // This allows limit:5 and limit:10 to share limit:20 cache
    // Only check if normalization would change the limit
    if (normalizedLimitForCache > limit) {
      const normalizedCacheKey = dataCache.generateFeedKey(
        feedOptionsForCacheKey({
          ...opts,
          limit: normalizedLimitForCache,
        })
      );
      const normalizedCachedData =
        getCachedFeedResult<FeedItem>(normalizedCacheKey);
      if (normalizedCachedData && normalizedCachedData.length >= limit) {
        // Found normalized cache - slice to requested size
        const slicedData = normalizedCachedData.slice(0, limit);
        // Cache the sliced result for future exact matches
        const exactCacheKey = dataCache.generateFeedKey(feedOptionsForCacheKey(opts));
        cacheFeedResult(exactCacheKey, slicedData, 2 * 60 * 1000);
        return {
          items: slicedData,
          consumedOffset: slicedData.length,
          count: normalizedCachedData.length,
        };
      }
    }

    // Step 2: Check exact cache key (fast path for exact matches)
    const cacheKey = dataCache.generateFeedKey(feedOptionsForCacheKey(opts));
    const cachedData = getCachedFeedResult<FeedItem>(cacheKey);
    if (isNonemptyFeedCache(cachedData)) {
      // SILENCED: Too verbose - only log misses
      // console.log('[DIAG-FeedCache] ✅ EXACT CACHE HIT (offset=0):', {
      //   cacheKey,
      //   requestedLimit: limit,
      //   cachedItems: cachedData.length,
      //   type: type || 'all',
      //   tags: tags?.join(',') || 'none',
      // });
      return {
        items: cachedData,
        consumedOffset: cachedData.length,
        count: cachedData.length,
      };
    }

    // Step 3: If exact miss, check larger limits (smart lookup)
    // This allows rails (limit: 20) to share cache with main feed (limit: 5)
    // Try common larger limits: 20, 40, 60 (multiples of typical rail sizes)
    const largerLimits = [20, 40, 60, 80, 100];
    for (const largerLimit of largerLimits) {
      if (largerLimit > limit) {
        const largerCacheKey = dataCache.generateFeedKey(
          feedOptionsForCacheKey({
            ...opts,
            limit: largerLimit,
          })
        );
        const largerCachedData = getCachedFeedResult<FeedItem>(largerCacheKey);
        if (largerCachedData && largerCachedData.length >= limit) {
          // Found cache with larger limit - slice to requested size
          const slicedData = largerCachedData.slice(0, limit);
          // Cache the sliced result for future exact matches
          cacheFeedResult(cacheKey, slicedData, 2 * 60 * 1000);
          // SILENCED: Too verbose - only log misses
          // console.log('[DIAG-FeedCache] ✅ LARGER LIMIT CACHE HIT (offset=0):', {
          //   requestedLimit: limit,
          //   foundLimit: largerLimit,
          //   foundItems: largerCachedData.length,
          //   slicedTo: slicedData.length,
          //   cacheKey,
          //   largerCacheKey,
          //   type: type || 'all',
          //   tags: tags?.join(',') || 'none',
          // });
          return {
            items: slicedData,
            consumedOffset: slicedData.length,
            count: largerCachedData.length,
          };
        }
      }
    }
  } else if (offset > 0 && offset < 100) {
    // [OPTIMIZATION: Phase 2] Cache lookup for paginated results (offset > 0)
    // Why: Reduces duplicate pagination requests when user scrolls or multiple rails load
    // Safety: Only cache offset < 100 to prevent memory bloat, 30s TTL for freshness
    const cacheKey = dataCache.generateFeedKey(feedOptionsForCacheKey(opts));
    const cachedData = getCachedFeedResult<FeedItem>(cacheKey);
    if (isNonemptyFeedCache(cachedData)) {
      // SILENCED: Too verbose - only log misses
      // console.log('[DIAG-FeedCache] ✅ PAGINATED CACHE HIT:', {
      //   cacheKey,
      //   offset,
      //   limit,
      //   cachedItems: cachedData.length,
      //   type: type || 'all',
      //   tags: tags?.join(',') || 'none',
      // });
      return {
        items: cachedData,
        consumedOffset: cachedData.length,
        count: cachedData.length,
      };
    }
  } else {
    // SILENCED: Too verbose
    // console.log('[DIAG-FeedCache] ⏭️ SKIPPING CACHE (offset>=100):', {
    //   offset,
    //   limit,
    //   type: type || 'all',
    //   tags: tags?.join(',') || 'none',
    //   reason: 'Offset too large - not caching to prevent memory bloat',
    // });
  }

  // [PHASE 2.3 - Layer 2] RequestManager Deduplication: Wrap RPC call with RequestManager
  // Why: Multiple components calling simultaneously will share the same RPC request
  // This eliminates duplicate get_feed_with_related_data calls (e.g., from multiple rails)
  const { requestManager } = await import("../../lib/requestManager");

  // [OPTIMIZATION: Phase 4] Use normalized limit (already calculated above) for RPC deduplication
  // Why: limit:5 and limit:10 requests for offset=0 should share the same RPC call
  // Strategy: For offset=0, normalize to max(limit, 20), then slice result to requested size
  // This allows different limit requests to deduplicate at the RequestManager level
  // Note: normalizedLimitForCache is already calculated above for cache lookup
  const normalizedLimitForDedup = normalizedLimitForCache;
  const shouldSliceResult = offset === 0 && normalizedLimitForDedup > limit;

  // Generate unique dedupe key based on feed options (using normalized limit for offset=0)
  // This ensures different feeds (different type/tags/search) don't share requests
  // But same feed called multiple times simultaneously will share the request
  // For offset=0, different limits will use the same dedupeKey (normalized limit)
  const dedupeKey = `feed_optimized:${type || "all"}:${q || ""}:${
    tags?.join(",") || ""
  }:${normalizedLimitForDedup}:${offset}:${viewerProfileId || "guest"}:${occursOn || ""}:${
    occursTz || ""
  }:${occursFrom || ""}:${occursTo || ""}:${friendsOnly ? "friends" : ""}`;

  // [Top-level in-flight dedupe] Same requestKey → one RPC even if called twice back-to-back (e.g. StrictMode)
  const existingPromise = feedRpcInFlight.get(dedupeKey);
  if (existingPromise) {
    return await existingPromise;
  }

  const promise = (async (): Promise<{
    items: FeedItem[];
    consumedOffset?: number;
    count: number;
  }> => {
    const result = await requestManager.execute(
      dedupeKey,
      async (signal) => {
        // Check if aborted before proceeding
        if (signal.aborted) {
          throw new Error("Aborted");
        }

        // Check cache again inside RequestManager (another call might have populated it)
        // This handles race conditions where multiple calls happen before first one completes
        // [OPTIMIZATION: Phase 4] Also check normalized cache here (might have been populated by another request)
        if (offset === 0) {
          // Step 1: Check normalized cache first (if normalization applies)
          if (normalizedLimitForCache > limit) {
            const normalizedCacheKey = dataCache.generateFeedKey(
              feedOptionsForCacheKey({
                ...opts,
                limit: normalizedLimitForCache,
              })
            );
            const normalizedCachedData =
              getCachedFeedResult<FeedItem>(normalizedCacheKey);
            if (normalizedCachedData && normalizedCachedData.length >= limit) {
              const slicedData = normalizedCachedData.slice(0, limit);
              const exactCacheKey = dataCache.generateFeedKey(feedOptionsForCacheKey(opts));
              cacheFeedResult(exactCacheKey, slicedData, 2 * 60 * 1000);
              return {
                items: slicedData,
                consumedOffset: slicedData.length,
                count: normalizedCachedData.length,
              };
            }
          }

          // Step 2: Check exact cache key
          const cacheKey = dataCache.generateFeedKey(feedOptionsForCacheKey(opts));
          const cachedData = getCachedFeedResult<FeedItem>(cacheKey);
          if (isNonemptyFeedCache(cachedData)) {
            // SILENCED: Too verbose
            // console.log('[DIAG-RequestManager] ✅ CACHE HIT inside RequestManager (race condition handled):', {
            //   dedupeKey,
            //   cacheKey,
            //   cachedItems: cachedData.length,
            //   type: type || 'all',
            // });
            return {
              items: cachedData,
              consumedOffset: cachedData.length,
              count: cachedData.length,
            };
          }

          // Step 3: Also check larger limits again (might have been populated)
          const largerLimits = [20, 40, 60, 80, 100];
          for (const largerLimit of largerLimits) {
            if (largerLimit > limit) {
              const largerCacheKey = dataCache.generateFeedKey(
                feedOptionsForCacheKey({
                  ...opts,
                  limit: largerLimit,
                })
              );
              const largerCachedData =
                getCachedFeedResult<FeedItem>(largerCacheKey);
              if (largerCachedData && largerCachedData.length >= limit) {
                const slicedData = largerCachedData.slice(0, limit);
                cacheFeedResult(cacheKey, slicedData, 2 * 60 * 1000);
                // SILENCED: Too verbose
                // console.log('[DIAG-RequestManager] ✅ LARGER LIMIT CACHE HIT inside RequestManager (race condition handled):', {
                //   dedupeKey,
                //   requestedLimit: limit,
                //   foundLimit: largerLimit,
                //   foundItems: largerCachedData.length,
                //   type: type || 'all',
                // });
                return {
                  items: slicedData,
                  consumedOffset: slicedData.length,
                  count: largerCachedData.length,
                };
              }
            }
          }
        }

        try {
          // Get current user's auth ID for viewer context
          // FIX: Add retry logic for PWA - session might not be ready immediately
          let viewerUserId: string | null = null;
          const maxRetries = 3;
          const retryDelay = 500; // Start with 500ms

          for (let attempt = 0; attempt < maxRetries; attempt++) {
            // Check if aborted during retry loop
            if (signal.aborted) {
              throw new Error("Aborted");
            }

            try {
              // Try to get current session first (most common case, no extra query)
              const {
                data: { session },
              } = await supabase.auth.getSession();

              // Check if aborted after async operation
              if (signal.aborted) {
                throw new Error("Aborted");
              }

              viewerUserId = session?.user?.id || null;

              // If we got a session, break out of retry loop
              if (viewerUserId) break;

              // If no session and we have viewerProfileId, try fallback
              if (!viewerUserId && viewerProfileId) {
                // Fallback: Get user_id from profile_id (rare case; exclude soft-deleted)
                const { data: profile } = await supabase
                  .from("profiles")
                  .select("user_id")
                  .eq("id", viewerProfileId)
                  .is("deleted_at", null)
                  .maybeSingle();

                // Check if aborted after database query
                if (signal.aborted) {
                  throw new Error("Aborted");
                }

                viewerUserId = profile?.user_id || null;
                if (viewerUserId) break;
              }

              // If still no session and not last attempt, wait and retry
              if (!viewerUserId && attempt < maxRetries - 1) {
                await new Promise((resolve) =>
                  setTimeout(resolve, retryDelay * (attempt + 1))
                );
              }
            } catch (sessionError) {
              // If error and not last attempt, wait and retry
              if (attempt < maxRetries - 1) {
                await new Promise((resolve) =>
                  setTimeout(resolve, retryDelay * (attempt + 1))
                );
              } else {
                console.warn(
                  "[getPublicFeedOptimized] Failed to get session after retries:",
                  sessionError
                );
              }
            }
          }

          // Check if aborted before RPC call
          if (signal.aborted) {
            throw new Error("Aborted");
          }

          // Call PostgreSQL function
          // Note: p_type expects post_type enum ('experience' | 'hangout' | 'rendezvous' | 'playbook')
          // Supabase should handle the type casting automatically
          // [OPTIMIZATION: Phase 4] Use normalized limit for RPC call if offset=0 and limit < 20
          // This allows deduplication: limit:5 and limit:10 requests will fetch limit:20 and slice results
          const rpcParams = {
            p_type: type || null,
            p_tags: tags && tags.length > 0 ? tags : null,
            p_search: q && q.trim() ? q.trim() : null,
            p_limit: normalizedLimitForDedup, // Use normalized limit for deduplication
            p_offset: offset,
            p_viewer_user_id: viewerUserId || null,
            p_occurs_on: occursOn ?? null,
            p_occurs_tz: occursTz ?? null,
            p_friends_only: friendsOnly ?? false,
            p_occurs_from: occursFrom ?? null,
            p_occurs_to: occursTo ?? null,
          };

          const { data, error } = await supabase.rpc(
            "get_feed_with_related_data",
            rpcParams
          );

          // Check if aborted after RPC call
          if (signal.aborted) {
            throw new Error("Aborted");
          }

          if (error) {
            console.error("[getPublicFeedOptimized] RPC error:", error);
            if (IS_DEV_BUILD) {
              console.error(
                "[getPublicFeedOptimized] RPC params were:",
                rpcParams
              );
            }
            throw error;
          }

          if (IS_DEV_BUILD) {
            // [FeedPayload] Dev-only — avoids costly JSON.stringify of full RPC payload in production
            const totalBytes = JSON.stringify(data).length;
            const postsLength =
              (data as { posts?: unknown[] })?.posts?.length ?? 0;
            const avgKbPerPost =
              postsLength > 0
                ? (totalBytes / 1024 / postsLength).toFixed(2)
                : "0";
            console.log("[FeedPayload]", {
              totalBytes,
              postsLength,
              avgKbPerPost: `${avgKbPerPost} KB`,
            });

            const rawResponseSize = totalBytes;
            const responseSizeKB = Math.round(rawResponseSize / 1024);
            const responseSizeMB = parseFloat(
              (rawResponseSize / (1024 * 1024)).toFixed(2)
            );

            if (responseSizeMB > 1.0) {
              const posts = (data as any)?.posts || [];
              const firstPost = posts[0] || null;
              const firstActivity = firstPost?.activities?.[0] || null;
              const firstImageUrl = firstActivity?.images?.[0] || null;

              const postSizes = posts.map((p: any) => {
                try {
                  const postJson = JSON.stringify(p);
                  return {
                    postId: p?.id || "unknown",
                    sizeKB: Math.round(postJson.length / 1024),
                    hasActivities: !!p?.activities,
                    activitiesLength: p?.activities?.length || 0,
                    firstActivityImagesCount:
                      p?.activities?.[0]?.images?.length || 0,
                    firstImageUrlLength:
                      p?.activities?.[0]?.images?.[0]?.length || 0,
                    isBase64:
                      p?.activities?.[0]?.images?.[0]?.startsWith(
                        "data:image/"
                      ) || false,
                  };
                } catch {
                  return {
                    postId: p?.id || "unknown",
                    sizeKB: 0,
                    error: "Failed to stringify post",
                  };
                }
              });

              console.warn("⚠️⚠️⚠️ [LARGE RESPONSE DETECTED] ⚠️⚠️⚠️", {
                responseSizeKB,
                responseSizeMB: responseSizeMB.toFixed(2),
                params: {
                  ...rpcParams,
                  p_viewer_user_id: rpcParams.p_viewer_user_id
                    ? "[REDACTED]"
                    : null,
                },
                postsCount: posts.length,
                expectedLimit: rpcParams.p_limit,
                averageSizePerPostKB:
                  posts.length > 0
                    ? Math.round(responseSizeKB / posts.length)
                    : 0,
                postSizes: postSizes,
                firstPostId: firstPost?.id || "N/A",
                firstPostHasActivities: !!firstPost?.activities,
                firstPostActivitiesLength: firstPost?.activities?.length || 0,
                firstActivity: firstActivity || null,
                firstActivityImagesCount: firstActivity?.images?.length || 0,
                firstImageUrlLength: firstImageUrl?.length || 0,
                firstImageUrlPreview: firstImageUrl
                  ? firstImageUrl.substring(0, 200) + "..."
                  : "N/A",
                isBase64Image: firstImageUrl?.startsWith("data:image/") || false,
              });
            }
          }

          // SILENCED: Too verbose
          // console.log('[DIAG-PostgreSQL] Raw RPC response check:', {
          //   params: { ...rpcParams, p_viewer_user_id: rpcParams.p_viewer_user_id ? '[REDACTED]' : null },
          //   responseSizeKB,
          //   responseSizeMB: responseSizeMB.toFixed(2),
          //   hasData: !!data,
          //   dataType: typeof data,
          //   postsCount: (data as any)?.posts?.length || 0,
          //   count: (data as any)?.count || 0,
          //   firstPostId: (data as any)?.posts?.[0]?.id,
          //   firstPostActivities: (data as any)?.posts?.[0]?.activities,
          //   firstPostActivitiesType: typeof (data as any)?.posts?.[0]?.activities,
          //   firstPostActivitiesIsArray: Array.isArray((data as any)?.posts?.[0]?.activities),
          //   firstPostActivitiesLength: (data as any)?.posts?.[0]?.activities?.length || 0,
          // });

          // Parse response
          const result = data as {
            posts: Array<{
              id: string;
              type: "experience" | "hangout";
              caption: string | null;
              is_anonymous: boolean | null;
              anonymous_name: string | null;
              anonymous_avatar: string | null;
              created_at: string;
              selected_dates?: string[] | null;
              tags?: string[] | null;
              author_id: string;
              author: {
                id: string;
                username: string | null;
                display_name: string | null;
                avatar_url: string | null;
                is_private?: boolean | null;
              } | null;
              // Extra fields (not in FeedItem, but available for batch data)
              follow_status?: string;
              is_liked?: boolean;
              is_saved?: boolean;
              comment_count?: number;
              like_count?: number;
              save_count?: number;
              effective_like_count?: number;
              effective_save_count?: number;
              share_count?: number;
              has_images?: boolean; // [OPTIMIZATION: Phase 3.1] Image presence flag
              is_recurring?: boolean | null;
              recurrence_days?: string[] | null;
              activities?: Array<{
                id?: string;
                images: string[] | null;
                order_idx: number | null;
              }>; // [OPTIMIZATION: Phase 2.2] First activity with images only (minimal fields for feed)
              rsvp_data?: any;
              rsvp_capacity?: number | null;
              rating_enabled?: boolean;
              rating_average?: number | null;
              rating_count?: number | null;
              effective_rating_average?: number | null;
              effective_rating_count?: number | null;
              viewer_rating?: number | null;
            }>;
            count: number;
          };

          if (!result || !result.posts) {
            console.warn(
              "[getPublicFeedOptimizedWithCount] Invalid response structure"
            );
            return { items: [], consumedOffset: 0, count: 0 };
          }

          if (DEBUG_RSVP_POST_ID) {
            const raw = result.posts.find((p) => p.id === DEBUG_RSVP_POST_ID);
            if (raw) {
              const rc = (raw as { rsvp_capacity?: unknown }).rsvp_capacity;
              console.log("RSVP DEBUG raw rpc post", {
                id: raw.id,
                rsvp_capacity: rc,
                typeof_rsvp_capacity: typeof rc,
                optimizedFeedPath: true,
              });
            }
          }

          // Map to FeedItem format (SHRINK: minimal fields; first_image_url only, no full activities)
          const feedItems: FeedItem[] = result.posts.map((post) => {
            // Build minimal activities from first_image_url for immediate carousel display
            const firstUrl = (post as any).first_image_url;
            const activities =
              firstUrl && typeof firstUrl === "string"
                ? ([
                    {
                      id: undefined,
                      title: null,
                      images: normalizeActivityImages([firstUrl]),
                      order_idx: 0,
                      location_name: null,
                      location_desc: null,
                      location_url: null,
                      location_notes: null,
                      additional_info: null,
                      tags: null,
                    },
                  ] as FeedItem["activities"])
                : undefined;

            // rsvp_data: new format { currentUserStatus, going_count }; adapt for RSVPComponent
            const rawRsvp = (post as any).rsvp_data;
            const rsvp_data: FeedItem["rsvp_data"] =
              rawRsvp != null
                ? {
                    users: (rawRsvp.users ?? []) as Array<{
                      id: string;
                      username: string | null;
                      display_name: string | null;
                      avatar_url: string | null;
                      status: "going" | "maybe" | "not_going";
                      created_at: string;
                    }>,
                    currentUserStatus: rawRsvp.currentUserStatus ?? null,
                    going_count: rawRsvp.going_count as number | undefined,
                  }
                : null;

            const rawCap = (post as { rsvp_capacity?: number | null }).rsvp_capacity;
            const mapped: FeedItem = {
              id: post.id,
              type: post.type,
              caption: post.caption,
              is_anonymous: post.is_anonymous,
              anonymous_name: post.anonymous_name,
              anonymous_avatar: post.anonymous_avatar,
              created_at: post.created_at,
              selected_dates: post.selected_dates,
              tags: post.tags,
              author_id: post.author_id,
              author: post.author,
              follow_status: post.follow_status as
                | "none"
                | "pending"
                | "following"
                | "friends"
                | undefined,
              is_liked: post.is_liked,
              is_saved: post.is_saved,
              like_count: post.like_count ?? 0,
              save_count: post.save_count ?? 0,
              effective_like_count: post.effective_like_count ?? (post.like_count ?? 0),
              effective_save_count: post.effective_save_count ?? (post.save_count ?? 0),
              comment_count: post.comment_count ?? 0,
              has_images: (post as any).has_images ?? !!firstUrl,
              activities,
              rsvp_data,
              rsvp_capacity: rawCap ?? null,
              activity_count: (post as any).activity_count,
              first_image_url: firstUrl,
              image_count: (post as any).image_count,
              rating_enabled: post.rating_enabled,
              rating_average: post.rating_average ?? null,
              rating_count: post.rating_count ?? null,
              effective_rating_average:
                post.effective_rating_average ?? (post.rating_average ?? null),
              effective_rating_count:
                post.effective_rating_count ?? (post.rating_count ?? null),
              viewer_rating: post.viewer_rating ?? null,
              is_recurring: post.is_recurring ?? null,
              recurrence_days: post.recurrence_days ?? null,
            };

            if (DEBUG_RSVP_POST_ID && post.id === DEBUG_RSVP_POST_ID) {
              console.log("RSVP DEBUG mapped feed item", {
                id: post.id,
                rsvp_capacity: mapped.rsvp_capacity,
                typeof_rsvp_capacity: typeof mapped.rsvp_capacity,
                normalization: "post.rsvp_capacity ?? null",
                rawBeforeNormalize: rawCap,
              });
            }

            return mapped;
          });

          // [DIAG: Phase 2.2] Check PostgreSQL response structure for activities
          // SILENCED: Too verbose
          // if (feedItems.length > 0) {
          //   const firstPost = result.posts[0];
          //   const firstMappedPost = feedItems[0];
          //   const responseSize = JSON.stringify(result).length;
          //   console.log('[DIAG-PostgreSQL] Response structure check:', {
          //     totalPosts: result.posts.length,
          //     count: result.count,
          //     responseSizeKB: Math.round(responseSize / 1024),
          //     firstPostId: firstPost?.id,
          //     firstPostActivitiesRaw: firstPost?.activities,
          //     firstPostActivitiesType: typeof firstPost?.activities,
          //     firstPostActivitiesIsArray: Array.isArray(firstPost?.activities),
          //     firstPostActivitiesLength: firstPost?.activities?.length || 0,
          //     firstMappedPostActivities: firstMappedPost?.activities,
          //     firstMappedPostActivitiesLength: firstMappedPost?.activities?.length || 0,
          //     firstActivity: firstMappedPost?.activities?.[0],
          //     hasImages: firstPost?.has_images,
          //   });
          // }

          // Apply smart sorting (same as original function)
          const sortedData = sortFeedItems(feedItems as FeedItemWithDates[]);

          // Temporary: if sorting removes items, return raw data instead
          if (feedItems.length > 0 && sortedData.length === 0) {
            console.warn(
              "[getPublicFeedOptimizedWithCount] Sorting removed all items, returning raw data"
            );
            return {
              items: feedItems,
              consumedOffset: result.posts.length,
              count: result.count,
            };
          }

          // [Option A] RPC eligible_base now excludes PAST scheduled non-recurring hangouts
          // No client-side filterExpiredHangouts needed for optimized path
          let finalData = sortedData as FeedItem[];

          // [OPTIMIZATION: Phase 4] Slice result if we fetched with normalized limit
          // Why: If we fetched limit:20 but requested limit:5, slice to requested size
          // This allows deduplication: limit:5 and limit:10 requests share limit:20 fetch
          let fullDataForCache: FeedItem[] | null = null;
          if (shouldSliceResult && finalData.length > limit) {
            // Store full data for caching (for larger requests)
            fullDataForCache = [...finalData];
            // Slice to requested size (for this request)
            finalData = finalData.slice(0, limit);
            // SILENCED: Too verbose - only log if needed for debugging
            // console.log('[DIAG-LimitNormalization] ✅ Sliced result:', {
            //   fetchedLimit: normalizedLimitForDedup,
            //   requestedLimit: limit,
            //   fetchedItems: fullDataForCache.length,
            //   slicedItems: finalData.length,
            //   type: type || 'all',
            // });
          }

          // [OPTIMIZATION: Phase 3.2] Cache avatars from feed data for instant reuse (fire-and-forget)
          // Why: Profile pictures load instantly everywhere (home page, profile page, etc.)
          // Do NOT block returning feed items - run avatar preload after return
          if (finalData.length > 0) {
            const dataToPreload = [...finalData];
            queueMicrotask(() => {
              try {
                import("../../lib/avatarCache")
                  .then(({ setCachedAvatar, preloadAvatar }) => {
                    dataToPreload.forEach((item) => {
                      if (
                        item.author &&
                        item.author.id &&
                        item.author.avatar_url &&
                        !item.is_anonymous
                      ) {
                        setCachedAvatar(item.author.id, item.author.avatar_url);
                        preloadAvatar(item.author.avatar_url);
                      }
                      if (item.rsvp_data?.users) {
                        item.rsvp_data.users.forEach((user) => {
                          if (user.id && user.avatar_url) {
                            setCachedAvatar(user.id, user.avatar_url);
                            preloadAvatar(user.avatar_url);
                          }
                        });
                      }
                    });
                  })
                  .catch(() => {});
              } catch {
                // Ignore - must not crash feed
              }
            });
          }

          // Cache the result for first page queries (offset === 0, non-empty only)
          if (offset === 0 && finalData.length > 0) {
            const cacheKey = dataCache.generateFeedKey(feedOptionsForCacheKey(opts));
            // Cache the exact result (sliced if applicable)
            cacheFeedResult(cacheKey, finalData, 2 * 60 * 1000); // Cache for 2 minutes

            // [OPTIMIZATION: Phase 4] Cache full result if we fetched with normalized limit
            // Why: Allows limit:20 request to hit cache when limit:5 request already fetched
            // This enables reverse deduplication: larger requests benefit from smaller requests
            if (
              fullDataForCache &&
              fullDataForCache.length > finalData.length
            ) {
              const fullCacheKey = dataCache.generateFeedKey(
                feedOptionsForCacheKey({
                  ...opts,
                  limit: normalizedLimitForDedup,
                })
              );
              cacheFeedResult(fullCacheKey, fullDataForCache, 2 * 60 * 1000); // Cache for 2 minutes
              // SILENCED: Too verbose
              // console.log('[DIAG-Cache] ✅ Full cache saved (offset=0, normalized limit):', {
              //   fullCacheKey,
              //   itemsCount: fullDataForCache.length,
              //   normalizedLimit: normalizedLimitForDedup,
              //   type: type || 'all',
              // });
            }

            // [DIAG: Phase 2.3] Minimal cache save log for verification
            // SILENCED: Too verbose
            // console.log('[DIAG-Cache] ✅ Cache saved (offset=0):', {
            //   cacheKey,
            //   itemsCount: finalData.length,
            //   limit,
            //   type: type || 'all',
            //   wasNormalized: shouldSliceResult,
            // });

            // DISABLED: Prefetching conflicts with ProgressiveFeed's loading mechanism
            // ProgressiveFeed handles loading efficiently with small batches (2-3 items)
            // Prefetching causes race conditions and multiple calls with offset 0
            // dataCache.prefetchFeedData(opts);
          } else if (offset > 0 && offset < 100 && finalData.length > 0) {
            // [OPTIMIZATION: Phase 2] Cache paginated results with shorter TTL
            // Why: Reduces duplicate pagination requests when user scrolls or multiple rails load
            // Safety: Only cache offset < 100 to prevent memory bloat, 30s TTL for freshness
            const cacheKey = dataCache.generateFeedKey(feedOptionsForCacheKey(opts));
            cacheFeedResult(cacheKey, finalData, 30 * 1000); // Cache for 30 seconds (shorter than offset 0)

            // SILENCED: Too verbose
            // console.log('[DIAG-Cache] ✅ Paginated cache saved:', {
            //   cacheKey,
            //   itemsCount: finalData.length,
            //   offset,
            //   limit,
            //   type: type || 'all',
            //   tags: tags?.join(',') || 'none',
            // });
          }

          // consumedOffset = raw RPC posts length for correct pagination
          return {
            items: finalData,
            consumedOffset: finalData.length,
            count: result.count,
          };
        } catch (error) {
          // Check if aborted - return empty result instead of throwing
          if (
            signal.aborted ||
            (error instanceof Error && error.message === "Aborted")
          ) {
            return { items: [], consumedOffset: 0, count: 0 };
          }

          console.error("[getPublicFeedOptimizedWithCount] Error:", error);

          // Graceful degradation: return cached data on error
          // Check cache for both offset 0 and paginated results
          if (offset === 0 || (offset > 0 && offset < 100)) {
            const cacheKey = dataCache.generateFeedKey(feedOptionsForCacheKey(opts));
            const cachedData = getCachedFeedResult<FeedItem>(cacheKey);
            if (isNonemptyFeedCache(cachedData)) {
              if (IS_DEV_BUILD) {
                console.log(
                  "[getPublicFeedOptimizedWithCount] Returning cached data after error",
                  { offset, cacheKey, cachedItems: cachedData.length }
                );
              }
              // Return cached data with unknown count (will use length check fallback)
              return {
                items: cachedData,
                consumedOffset: cachedData.length,
                count: cachedData.length,
              };
            }
          }

          throw error;
        }
      },
      "medium" // Medium priority - feed loading is important but not critical
    );

    // Check if request was aborted
    if (result.error && result.error.message === "Aborted") {
      return { items: [], consumedOffset: 0, count: 0 };
    }
    if (result.error) {
      throw result.error;
    }
    return result.data ?? { items: [], consumedOffset: 0, count: 0 };
  })();

  feedRpcInFlight.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    feedRpcInFlight.delete(dedupeKey);
  }
}

/**
 * Public function that returns FeedItem[] for backward compatibility.
 * Uses getPublicFeedOptimizedWithCount internally but only returns items.
 */
export async function getPublicFeedOptimized(
  opts: FeedOptions = {}
): Promise<FeedItem[]> {
  const { items } = await getPublicFeedOptimizedWithCount(opts);
  return items;
}

/**
 * Get all unique tags from published posts
 * [OPTIMIZATION: Phase 2] Uses RequestManager for deduplication + short cache for sequential requests
 */
export async function getAvailableTags(): Promise<string[]> {
  // [OPTIMIZATION] Check cache first (fast, synchronous path)
  // This prevents duplicate sequential requests (e.g., multiple components loading tags)
  const { getCachedTags, setCachedTags } = await import("../../lib/tagsCache");
  const cachedTags = getCachedTags();
  if (cachedTags !== null) {
    return cachedTags;
  }

  // [OPTIMIZATION] Use RequestManager for deduplication
  // Multiple components calling this simultaneously will share the same request
  const { requestManager } = await import("../../lib/requestManager");
  const dedupeKey = "available_tags";

  const result = await requestManager.execute(
    dedupeKey,
    async (signal) => {
      // [RACE CONDITION FIX] Check cache again inside RequestManager
      // Another call might have populated it
      const cachedTagsAgain = getCachedTags();
      if (cachedTagsAgain !== null) {
        return cachedTagsAgain;
      }

      // [ABORT CHECK] Check if aborted before making request
      if (signal.aborted) {
        throw new Error("Request aborted");
      }

      const { data, error } = await supabase
        .from("posts")
        .select("tags")
        .or("is_anonymous.is.null,is_anonymous.eq.false")
        .not("tags", "is", null);

      // [ABORT CHECK] Check if aborted after async operation
      if (signal.aborted) {
        throw new Error("Request aborted");
      }

      if (error) throw error;

      // Flatten all tags and get unique ones
      const allTags = (data ?? [])
        .flatMap((post) => post.tags || [])
        .filter(
          (tag): tag is string => typeof tag === "string" && tag.trim() !== ""
        )
        .filter((tag, index, arr) => arr.indexOf(tag) === index) // Remove duplicates
        .sort(); // Sort alphabetically

      // [CACHE UPDATE] Cache the result for 30 seconds
      // This prevents duplicate sequential requests
      setCachedTags(allTags);

      return allTags;
    },
    "medium" // Medium priority
  );

  if (result.error && result.error.message === "Request aborted") {
    return []; // Return empty array on abort
  }
  if (result.error) {
    throw result.error;
  }
  return result.data ?? [];
}
