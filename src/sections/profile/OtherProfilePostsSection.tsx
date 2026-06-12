import {
  useEffect,
  useState,
  useTransition,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useProfile } from "../../contexts/ProfileContext";
import { getUserPostsCreatedOptimized } from "../../api/queries/getUserPostsCreated";
import { getLikedPostsWithDetailsForUserOptimized } from "../../api/services/likes";
import PostSkeleton from "../../components/skeletons/PostSkeleton";
import ProgressiveFeed from "../../components/ProgressiveFeed";
import Post from "../../components/Post";
import { convertLikedToFeedItem } from "../../lib/profilePostsConverters";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { dataCache } from "../../lib/dataCache";
import { cancelContextRequests } from "../../lib/requestManager";
import { getViewerId } from "../../api/services/follows";
import {
  readPersistedProfilePosts,
  writePersistedProfilePosts,
} from "../../lib/profilePostListCache";

/**
 * OtherProfilePostsSection - Posts section for OTHER profiles
 * - Always uses profile.user_id for caching (consistent)
 * - Implements stale-while-revalidate (show cache immediately, fetch fresh in background)
 * - Only caches first 5 posts
 * - Prepped for lazy loading (structure ready, implementation later)
 * - No Saved tab (only Created and Interacted)
 * - Checks access for private accounts
 */
interface OtherProfilePostsSectionProps {
  hasAccess?: boolean | null; // null = checking, true = has access, false = no access
  visible?: boolean; // [OPTIMIZATION] Only load when Other Profile tab is active
  feedRefreshEpoch?: number;
}

// [DEBUG] Toggle for console logs
const DEBUG_OTHER_PROFILE = false;

export default function OtherProfilePostsSection({
  hasAccess = null,
  visible = true,
  feedRefreshEpoch = 0,
}: OtherProfilePostsSectionProps) {
  const { profile } = useProfile();
  const [tab, setTab] = useState<"created" | "interacted">("created");

  // Use profile.user_id consistently (not profile.id)
  const userId = profile?.user_id || "";

  // React 19: useTransition for non-urgent tab switching
  const [isPending, startTransition] = useTransition();

  // [PHASE C.2] Tab initialization tracking (lazy loading)
  // [FIX] Use refs to track initialization to prevent infinite loops from dependency changes
  const createdInitializedRef = useRef(false);
  const interactedInitializedRef = useRef(false);

  // [FIX] Use state only for rendering, refs for logic to prevent infinite loops
  const [tabsInitialized, setTabsInitialized] = useState({
    created: false,
    interacted: false,
  });

  // [DEBUG] Track userId changes
  const prevUserIdLogRef = useRef<string | null>(null);
  useEffect(() => {
    if (DEBUG_OTHER_PROFILE) {
      console.log("[OtherProfilePostsSection] userId change", {
        prev: prevUserIdLogRef.current,
        next: userId,
      });
    }
    prevUserIdLogRef.current = userId;
  }, [userId]);

  // [PHASE C.1] Created tab state removed - ProgressiveFeed manages its own state
  // const [created, setCreated] = useState<...>([]); // Removed
  // const [loading, setLoading] = useState(false); // Removed

  // [PHASE C.2] Interacted tab state removed - ProgressiveFeed manages its own state
  // const [liked, setLiked] = useState<LikedPostWithDetails[]>([]); // Removed
  // const [likedLoading, setLikedLoading] = useState(false); // Removed

  // [OPTIMIZATION: Phase 3.3] Removed batchedData and loadBatchDataForPosts - PostgreSQL functions provide all data

  // Refs to track abort controllers for cancellation
  // [PHASE C.1] Created tab request ref removed - ProgressiveFeed manages its own requests
  // [PHASE C.2] Interacted tab request ref removed - ProgressiveFeed manages its own requests

  // Check if viewer has access (approved follower or public account)
  // [FIX] Memoize viewerHasAccess using primitives - prevents infinite loops
  // profile object changes reference on every render, but is_private is stable
  // [FIX] Use only profile.user_id for profile dependency, not entire profile object
  const profileIsPrivate = profile?.is_private ?? null;
  const profileUserId = profile?.user_id ?? null; // Extract userId for stable dependency
  const viewerHasAccess = useMemo(() => {
    // Check if profile exists (has userId) - if no userId, no access
    if (!profileUserId) return false;
    // If profile exists, check privacy settings
    return !profileIsPrivate || hasAccess === true;
  }, [profileUserId, profileIsPrivate, hasAccess]); // [FIX] Use profileUserId instead of profile to prevent loops

  // [DEBUG] Log profile state for debugging (throttled to prevent excessive logging)
  useEffect(() => {
    if (DEBUG_OTHER_PROFILE && profile) {
      console.log("[OtherProfilePostsSection] Profile loaded:", {
        userId,
        username: profile.username,
        display_name: profile.display_name,
        is_private: profile.is_private,
        hasAccess,
        viewerHasAccess,
      });
    }
  }, [profileUserId, hasAccess, userId, viewerHasAccess, profile]); // [FIX] Use stable dependencies - profileUserId instead of profile?.user_id

  // [FIX] Track previous userId to detect profile switches
  const prevUserIdRef = useRef<string | null>(null);

  // [FIX] Reset refs when userId changes (switching profiles) to prevent stale state
  useEffect(() => {
    if (!userId) {
      prevUserIdRef.current = null;
      return;
    }

    // Check if userId changed (profile switched)
    if (prevUserIdRef.current && prevUserIdRef.current !== userId) {
      // Profile changed - reset all refs and state
      createdInitializedRef.current = false;
      interactedInitializedRef.current = false;
      setTabsInitialized({
        created: false,
        interacted: false,
      });
    }

    // Update previous userId
    prevUserIdRef.current = userId;
  }, [userId]);

  // [PHASE C.2] Initialize Created tab when profile loads (lazy loading)
  // [FIX] Use ref to track initialization - prevents infinite loops
  useEffect(() => {
    if (userId && !createdInitializedRef.current) {
      createdInitializedRef.current = true;
      setTabsInitialized((prev) => ({ ...prev, created: true }));
    }
  }, [userId]); // Only depend on userId - ref prevents re-running

  // [PHASE C.2] Initialize Interacted tab when first visited (lazy loading)
  // [FIX] Use ref to track initialization - prevents infinite loops
  useEffect(() => {
    if (!userId) return;
    if (tab === "interacted" && !interactedInitializedRef.current) {
      interactedInitializedRef.current = true;
      setTabsInitialized((prev) => ({ ...prev, interacted: true }));
    }
  }, [tab, userId]); // Only depend on tab and userId - ref prevents re-running

  // [DEBUG] Track tab changes
  useEffect(() => {
    if (DEBUG_OTHER_PROFILE) {
      console.log("[OtherProfilePostsSection] tab change", { tab, userId });
    }
  }, [tab, userId]);

  // [PHASE C.1] Cache callbacks for Created tab using dataCache (migrating from profilePostsCache)
  /** Single Created-tab key — bare store; shared by warm initialItems (no drift from get/set). */
  const profileCreatedDataCacheKey = useMemo(
    () => `profile_created_${userId}`,
    [userId]
  );

  const getCachedCreated = useCallback(() => {
    if (!viewerHasAccess) return null;
    const cached = dataCache.get<FeedItem[]>(profileCreatedDataCacheKey);
    if (cached?.length) return cached;
    const persisted = readPersistedProfilePosts("created", userId);
    return persisted?.items?.length ? persisted.items : null;
  }, [profileCreatedDataCacheKey, userId, viewerHasAccess]);

  const setCachedCreated = useCallback(
    (items: FeedItem[]) => {
      const persisted = items.slice(0, 20);
      dataCache.set(
        profileCreatedDataCacheKey,
        persisted,
        10 * 60 * 1000
      ); // 10min TTL, cache 20 items
      writePersistedProfilePosts("created", userId, persisted);
    },
    [profileCreatedDataCacheKey, userId]
  );

  /** Memory + persisted first page — only when viewer can see Created. */
  const profileCreatedWarmInitialItems = useMemo((): FeedItem[] | undefined => {
    if (!viewerHasAccess) return undefined;
    if (!userId) return undefined;
    const cached = dataCache.get<FeedItem[]>(profileCreatedDataCacheKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    const persisted = readPersistedProfilePosts("created", userId);
    return persisted?.items?.length ? persisted.items : undefined;
  }, [viewerHasAccess, userId, profileCreatedDataCacheKey]);

  // [PHASE C.2] Cache callbacks for Interacted tab using dataCache (migrating from profilePostsCache)
  const getCachedInteracted = useCallback(() => {
    if (!viewerHasAccess) return null;
    const cacheKey = `profile_interacted_${userId}`;
    const cached = dataCache.get<FeedItem[]>(cacheKey);
    if (cached?.length) return cached;
    const persisted = readPersistedProfilePosts("interacted", userId);
    return persisted?.items?.length ? persisted.items : null;
  }, [userId, viewerHasAccess]);

  const setCachedInteracted = useCallback(
    (items: FeedItem[]) => {
      const cacheKey = `profile_interacted_${userId}`;
      const persisted = items.slice(0, 20);
      dataCache.set(cacheKey, persisted, 30 * 60 * 1000); // 30min TTL, cache 20 items
      writePersistedProfilePosts("interacted", userId, persisted);
    },
    [userId]
  );

  const profileInteractedWarmInitialItems = useMemo((): FeedItem[] | undefined => {
    if (!viewerHasAccess) return undefined;
    if (!userId) return undefined;
    const cacheKey = `profile_interacted_${userId}`;
    const cached = dataCache.get<FeedItem[]>(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    const persisted = readPersistedProfilePosts("interacted", userId);
    return persisted?.items?.length ? persisted.items : undefined;
  }, [viewerHasAccess, userId]);

  // [PHASE C.1] LoadItems function for Created tab
  const loadCreatedItems = useCallback(
    async (offset: number, limit: number): Promise<FeedItem[]> => {
      if (DEBUG_OTHER_PROFILE) {
        console.log("[OtherProfilePostsSection] loadCreatedItems called:", {
          userId,
          offset,
          limit,
          hasProfile: !!profile,
          viewerHasAccess,
          hasAccess,
          profileIsPrivate: profile?.is_private,
        });
      }

      if (!userId) {
        if (DEBUG_OTHER_PROFILE) {
          console.log(
            "[OtherProfilePostsSection] loadCreatedItems: Profile not loaded yet (userId:",
            userId,
            "), returning empty"
          );
        }
        return [];
      }

      if (!viewerHasAccess) {
        if (DEBUG_OTHER_PROFILE) {
          console.log(
            "[OtherProfilePostsSection] loadCreatedItems: User doesn't have access, returning empty"
          );
        }
        return [];
      }

      const { getViewerAuthUserId } = await import(
        "../../api/services/follows"
      );
      const viewerUserId = await getViewerAuthUserId();
      const validViewerUserId =
        viewerUserId && viewerUserId !== "" ? viewerUserId : null;

      if (DEBUG_OTHER_PROFILE) {
        console.log(
          "[OtherProfilePostsSection] loadCreatedItems: Fetching posts for userId:",
          userId
        );
      }

      const result = await getUserPostsCreatedOptimized(
        userId,
        offset,
        limit,
        false, // includeDrafts = false for other profiles
        false, // isOwner = false for other profiles
        validViewerUserId
      );

      if (result.error) {
        if (offset === 0) {
          const cached = getCachedCreated();
          if (cached?.length) return cached;
        }
        return [];
      }

      if (DEBUG_OTHER_PROFILE) {
        console.log(
          "[OtherProfilePostsSection] loadCreatedItems: Received",
          result.data?.length || 0,
          "posts"
        );
      }

      if (result.data) {
        const mapped = result.data.map((item) => ({
          ...item,
          author:
            item.author ||
            (item as { profiles?: unknown }).profiles ||
            undefined,
          follow_status: item.follow_status || undefined,
        })) as FeedItem[];
        if (DEBUG_OTHER_PROFILE) {
          console.log("[OtherProfilePostsSection] loadCreatedItems response", {
            userId,
            offset,
            limit,
            received: mapped.length,
          });
        }
        return mapped;
      }

      return [];
    },
    [userId, viewerHasAccess, getCachedCreated]
  ); // [FIX] Remove profile dependency - use userId instead

  // [PHASE C.2] Interacted tab loadItems
  const loadInteractedItems = useCallback(
    async (offset: number, limit: number): Promise<FeedItem[]> => {
      if (DEBUG_OTHER_PROFILE) {
        console.log("[OtherProfilePostsSection] loadInteractedItems called:", {
          userId,
          offset,
          limit,
          hasProfile: !!userId, // [FIX] Use userId instead of profile
          viewerHasAccess,
          hasAccess,
          profileIsPrivate,
        });
      }

      if (!userId) {
        if (DEBUG_OTHER_PROFILE) {
          console.log(
            "[OtherProfilePostsSection] loadInteractedItems: Profile not loaded yet (userId:",
            userId,
            "), returning empty"
          );
        }
        return [];
      }

      if (!viewerHasAccess) {
        if (DEBUG_OTHER_PROFILE) {
          console.log(
            "[OtherProfilePostsSection] loadInteractedItems: User doesn't have access, returning empty"
          );
        }
        return [];
      }

      try {
        // Get viewer user ID for PostgreSQL function
        const { getViewerAuthUserId } = await import(
          "../../api/services/follows"
        );
        const viewerUserId = await getViewerAuthUserId();
        const validViewerUserId =
          viewerUserId && viewerUserId !== "" ? viewerUserId : null;

        if (DEBUG_OTHER_PROFILE) {
          console.log(
            "[OtherProfilePostsSection] loadInteractedItems: Fetching liked posts for userId:",
            userId
          );
        }

        // Call optimized PostgreSQL function
        const result = await getLikedPostsWithDetailsForUserOptimized(
          userId,
          validViewerUserId,
          limit,
          offset
        );

        // Edge Case 3: Handle errors
        if (result.error) {
          console.error(
            "[OtherProfilePostsSection] loadInteractedItems: Error:",
            result.error
          );
          if (offset === 0) {
            const cached = getCachedInteracted();
            if (cached?.length) return cached;
          }
          return [];
        }

        // Edge Case 4: Handle null/empty data
        if (!result.data || result.data.length === 0) {
          if (DEBUG_OTHER_PROFILE) {
            console.log(
              "[OtherProfilePostsSection] loadInteractedItems: No liked posts found"
            );
          }
          return [];
        }

        // Edge Case 5: Privacy filtering (might be redundant if RPC handles it, but keep for safety)
        let filteredPosts = result.data;
        if (filteredPosts.length > 0) {
          const viewerProfileId = await getViewerId();
          const { filterPostsByPrivacy } = await import(
            "../../lib/postPrivacyFilter"
          );
          filteredPosts = await filterPostsByPrivacy(
            filteredPosts as any,
            viewerProfileId
          );
        }

        // Convert LikedPostWithDetails[] to FeedItem[] (RPC now carries canonical engagement counts).
        const feedItems: FeedItem[] = filteredPosts.map(convertLikedToFeedItem);

        if (DEBUG_OTHER_PROFILE) {
          console.log(
            "[OtherProfilePostsSection] loadInteractedItems: Received",
            feedItems.length,
            "posts after filtering"
          );
        }

        return feedItems;
      } catch (error: any) {
        // Edge Case 6: Handle exceptions
        console.error(
          "[OtherProfilePostsSection] loadInteractedItems: Exception:",
          error
        );
        if (offset === 0) {
          const cached = getCachedInteracted();
          if (cached?.length) return cached;
        }
        return [];
      }
    },
    [userId, viewerHasAccess, getCachedInteracted]
  ); // [FIX] Remove profile and hasAccess dependencies - viewerHasAccess already includes hasAccess

  // Cleanup when profile changes to prevent data overlap
  useEffect(() => {
    if (!userId) return;

    // Cancel all requests when profile changes
    cancelContextRequests(`profile-${userId}`);
    // [PHASE C.1] Created tab request cancellation removed - ProgressiveFeed manages its own
    // [PHASE C.2] Interacted tab request cancellation removed - ProgressiveFeed manages its own

    return () => {
      // Additional cleanup on unmount
      // [PHASE C.1] Created tab cleanup removed - ProgressiveFeed manages its own
      // [PHASE C.2] Interacted tab cleanup removed - ProgressiveFeed manages its own
      cancelContextRequests(`profile-${userId}`);
    };
  }, [userId]);

  // [PHASE C.1] Created tab cache loading and useEffect removed - ProgressiveFeed handles it
  // Created tab now uses ProgressiveFeed with dataCache (via getCachedCreated/setCachedCreated)

  // [PHASE C.2] Interacted tab cache loading and useEffect removed - ProgressiveFeed handles it
  // Interacted tab now uses ProgressiveFeed with dataCache (via getCachedInteracted/setCachedInteracted)

  const authorForProfilePostCard = useCallback(
    (post: FeedItem) => {
      if (post.is_anonymous || !post.author || !profile?.user_id) {
        return post.author ?? null;
      }
      const belongsToPageProfile =
        post.author_id === profile.user_id ||
        (profile.id != null && post.author.id === profile.id);
      if (!belongsToPageProfile) return post.author;
      return {
        ...post.author,
        avatar_url: profile.avatar_url ?? post.author.avatar_url ?? null,
      };
    },
    [profile?.user_id, profile?.id, profile?.avatar_url]
  );

  // [FIX] Memoize renderItem functions to prevent ProgressiveFeed re-renders
  const renderCreatedItem = useCallback(
    (post: FeedItem) => (
      <Post
        key={post.id}
        postId={post.id}
        caption={post.caption}
        createdAt={post.created_at}
        authorId={post.author_id}
        author={authorForProfilePostCard(post)}
        type={post.type}
        isOwner={false} // Other profile, not owner
        isAnonymous={post.is_anonymous || false}
        anonymousName={post.anonymous_name || null}
        anonymousAvatar={post.anonymous_avatar || null}
        selectedDates={post.selected_dates || null}
        tags={post.tags || null}
        post={post} // Pass entire FeedItem for optimal loading
        followStatus={post.follow_status}
        isLiked={post.is_liked}
        isSaved={post.is_saved}
        commentCount={post.comment_count}
        rsvpData={post.rsvp_data}
        slideshowHostVisible={visible && tab === "created"}
      />
    ),
    [visible, tab, authorForProfilePostCard]
  );

  const renderInteractedItem = useCallback(
    (post: FeedItem) => (
      <Post
        key={post.id}
        postId={post.id}
        caption={post.caption}
        createdAt={post.created_at}
        authorId={post.author_id}
        author={authorForProfilePostCard(post)}
        type={post.type}
        isOwner={false} // Other profile, not owner
        isAnonymous={post.is_anonymous || false}
        anonymousName={post.anonymous_name || null}
        anonymousAvatar={post.anonymous_avatar || null}
        selectedDates={post.selected_dates || null}
        tags={post.tags || null}
        post={post} // Pass entire FeedItem for optimal loading
        followStatus={post.follow_status}
        isLiked={post.is_liked}
        isSaved={post.is_saved}
        commentCount={post.comment_count}
        rsvpData={post.rsvp_data}
        slideshowHostVisible={visible && tab === "interacted"}
      />
    ),
    [visible, tab, authorForProfilePostCard]
  );

  // Theme-aware tab styling
  const base =
    "px-2 py-1 rounded-full text-xs border transition-all duration-200 flex items-center justify-center";
  const active = "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]";
  const inactive =
    "bg-transparent text-[var(--text)]/80 border-[var(--border)] hover:border-[var(--text)]/40";

  // If account is private and viewer doesn't have access, show message
  if (profile?.is_private && hasAccess === false) {
    return (
      <section className="w-full max-w-[640px] mx-auto px-1.5">
        <div className="py-8 text-center">
          <div className="text-lg font-semibold text-[var(--text)] mb-2">
            This account is private
          </div>
          <div className="text-sm text-[var(--text)]/70">
            Follow to see their posts
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full max-w-[640px] mx-auto px-1.5">
      {/* Tab Navigation */}
      <div className="flex items-center justify-center gap-2 pt-4">
        <button
          className={`${base} ${tab === "created" ? active : inactive} ${
            isPending ? "opacity-70" : ""
          }`}
          onClick={() => startTransition(() => setTab("created"))}
          disabled={isPending}
        >
          Created
        </button>
        <button
          className={`${base} ${tab === "interacted" ? active : inactive} ${
            isPending ? "opacity-70" : ""
          }`}
          onClick={() => startTransition(() => setTab("interacted"))}
          disabled={isPending}
        >
          Interacted
        </button>
        {/* No Saved tab for other profiles */}
      </div>

      {/* Content */}
      <div className="py-4">
        {/* [PHASE C.1] Created Tab - ProgressiveFeed (always mounted, CSS controls visibility) */}
        {tabsInitialized.created && (
          <div style={{ display: tab === "created" ? "block" : "none" }}>
            <ProgressiveFeed
              key={`created-${userId}-r${feedRefreshEpoch}`}
              isVisible={visible && tab === "created"}
              tabId="other-profile"
              loadItems={loadCreatedItems}
              renderItem={renderCreatedItem} // [FIX] Use memoized function
              getCachedItems={getCachedCreated}
              setCachedItems={setCachedCreated}
              initialItems={profileCreatedWarmInitialItems}
              pageSize={15} // Batch size for egress reduction (connection-aware clamp applies)
              enableScrollStopDetection={true}
              enableLazyLoading={true}
              loading={false}
              loadingComponent={<PostSkeleton />}
              emptyMessage={`${
                profile?.display_name || profile?.username || "This user"
              } hasn't posted yet.`}
            />
          </div>
        )}

        {/* [PHASE C.1] Created Tab - Show loading when profile exists but not initialized yet */}
        {tab === "created" && profile && !tabsInitialized.created && (
          <div className="flex flex-col gap-2">
            {[...Array(3)].map((_, i) => (
              <PostSkeleton key={i} />
            ))}
          </div>
        )}

        {/* [PHASE C.2] Interacted Tab - ProgressiveFeed (always mounted, CSS controls visibility) */}
        {tabsInitialized.interacted && (
          <div style={{ display: tab === "interacted" ? "block" : "none" }}>
            <ProgressiveFeed
              key={`interacted-${userId}-r${feedRefreshEpoch}`}
              isVisible={visible && tab === "interacted"}
              tabId="other-profile"
              loadItems={loadInteractedItems}
              renderItem={renderInteractedItem} // [FIX] Use memoized function
              getCachedItems={getCachedInteracted}
              setCachedItems={setCachedInteracted}
              initialItems={profileInteractedWarmInitialItems}
              pageSize={15} // Batch size for egress reduction (connection-aware clamp applies)
              enableScrollStopDetection={true}
              enableLazyLoading={true}
              loading={false}
              loadingComponent={<PostSkeleton />}
              emptyMessage={`${
                profile?.display_name || profile?.username || "This user"
              } hasn't liked any posts yet.`}
            />
          </div>
        )}

        {/* [PHASE C.2] Interacted Tab - Show loading when tab is active but not initialized yet */}
        {tab === "interacted" && profile && !tabsInitialized.interacted && (
          <div className="flex flex-col gap-2">
            {[...Array(3)].map((_, i) => (
              <PostSkeleton key={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
