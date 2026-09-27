import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useProfile } from "../../contexts/ProfileContext";
import { getUserPostsCreatedOptimized } from "../../api/queries/getUserPostsCreated";
import PostSkeleton from "../../components/skeletons/PostSkeleton";
import ProgressiveFeed from "../../components/ProgressiveFeed";
import Post from "../../components/Post";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { dataCache } from "../../lib/dataCache";
import { cancelContextRequests } from "../../lib/requestManager";
import {
  readPersistedProfilePosts,
  writePersistedProfilePosts,
} from "../../lib/profilePostListCache";
import { seedPublishedMediaFromFeedItems } from "../../lib/publishedMedia";
import {
  onPostDeleted,
  onPostOwnershipChanged,
} from "../../lib/postEvents";
import {
  guardProfileCreatedCacheWrite,
  noteProfileCreatedExclusion,
  readProfileCreatedWarmInitialItems,
} from "../../lib/profileCreatedWarmSeed";
import { useSelector } from "react-redux";
import type { RootState } from "../../app/store";
import { PROFILE_OVERVIEW_OTHER_POSTS_FEED_CLASS } from "../../lib/profileOverviewPresentation";
import { SocialShelfSurfaceProvider } from "../../lib/social/socialShelfSurfaceContext";

/**
 * OtherProfilePostsSection - Posts section for OTHER profiles
 * - Always uses profile.user_id for caching (consistent)
 * - Implements stale-while-revalidate (show cache immediately, fetch fresh in background)
 * - Only caches first 5 posts
 * - Prepped for lazy loading (structure ready, implementation later)
 * - No Saved tab (Created feed only)
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
  const viewerUserId = useSelector(
    (state: RootState) => state.auth?.user?.id ?? null,
  );
  const [createdOwnershipRemoveRevision, setCreatedOwnershipRemoveRevision] =
    useState(0);
  const [createdOwnershipRemovePostId, setCreatedOwnershipRemovePostId] =
    useState<string | null>(null);
  const [createdOwnershipSoftRefreshEpoch, setCreatedOwnershipSoftRefreshEpoch] =
    useState(0);
  /** Forces Created ProgressiveFeed remount after admin ownership transfer (Capacitor / hidden tabs). */
  const [ownershipFeedRemountEpoch, setOwnershipFeedRemountEpoch] =
    useState(0);
  /** Posts removed from this Created list (ownership / delete) — block warm-seed restore. */
  const createdExcludedPostIdsRef = useRef<Set<string>>(new Set());
  const [createdWarmSeedEpoch, setCreatedWarmSeedEpoch] = useState(0);

  // Use profile.user_id consistently (not profile.id)
  const userId = profile?.user_id || "";

  const createdInitializedRef = useRef(false);
  const [createdInitialized, setCreatedInitialized] = useState(false);

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
      setCreatedInitialized(false);
      createdExcludedPostIdsRef.current = new Set();
      setCreatedWarmSeedEpoch(0);
    }

    // Update previous userId
    prevUserIdRef.current = userId;
  }, [userId]);

  // [PHASE C.2] Initialize Created tab when profile loads (lazy loading)
  // [FIX] Use ref to track initialization - prevents infinite loops
  useEffect(() => {
    if (userId && !createdInitializedRef.current) {
      createdInitializedRef.current = true;
      setCreatedInitialized(true);
    }
  }, [userId]);

  /** Single Created-tab key — bare store; shared by warm initialItems (no drift from get/set). */
  const profileCreatedDataCacheKey = useMemo(
    () => `profile_created_${userId}`,
    [userId]
  );

  const getCachedCreated = useCallback(() => {
    if (!viewerHasAccess) return null;
    const cached = dataCache.get<FeedItem[]>(profileCreatedDataCacheKey);
    if (cached?.length) {
      seedPublishedMediaFromFeedItems({
        items: cached,
        viewerUserId,
        source: "warm",
      });
      return cached;
    }
    const persisted = readPersistedProfilePosts("created", userId);
    if (!persisted?.items?.length) return null;
    seedPublishedMediaFromFeedItems({
      items: persisted.items,
      viewerUserId,
      source: "persist",
      snapshotTs: persisted.ts,
    });
    return persisted.items;
  }, [profileCreatedDataCacheKey, userId, viewerHasAccess, viewerUserId]);

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

  /** Local: strip ownership/delete exclusions so remount bootstrap cannot re-poison cache. */
  const setCachedCreatedGuarded = useCallback(
    (items: FeedItem[]) => {
      setCachedCreated(
        guardProfileCreatedCacheWrite(items, createdExcludedPostIdsRef.current)
      );
    },
    [setCachedCreated]
  );

  const removePostFromCreatedCache = useCallback(
    (postId: string) => {
      if (!userId || !postId) return;
      const cached = dataCache.get<FeedItem[]>(profileCreatedDataCacheKey);
      const persisted = readPersistedProfilePosts("created", userId);
      const source =
        cached?.length ? cached : persisted?.items?.length ? persisted.items : [];
      const filtered = source.filter((item) => item.id !== postId);
      if (filtered.length !== source.length) {
        setCachedCreated(filtered);
      }
    },
    [userId, profileCreatedDataCacheKey, setCachedCreated]
  );

  useEffect(() => {
    if (!userId) return;
    return onPostOwnershipChanged(
      ({ postId, oldAuthorId, newAuthorId }) => {
        if (oldAuthorId === userId) {
          noteProfileCreatedExclusion(createdExcludedPostIdsRef.current, postId);
          setCreatedWarmSeedEpoch((n) => n + 1);
          setCreatedOwnershipRemovePostId(postId);
          setCreatedOwnershipRemoveRevision((n) => n + 1);
          removePostFromCreatedCache(postId);
        }
        if (newAuthorId === userId && oldAuthorId !== newAuthorId) {
          setCreatedOwnershipSoftRefreshEpoch((n) => n + 1);
        }
        if (userId === oldAuthorId || userId === newAuthorId) {
          setOwnershipFeedRemountEpoch((n) => n + 1);
        }
      }
    );
  }, [userId, removePostFromCreatedCache]);

  // Keep Created warm seed / cache aligned with delete invalidation (no redesign).
  useEffect(() => {
    if (!userId) return;
    return onPostDeleted((postId) => {
      noteProfileCreatedExclusion(createdExcludedPostIdsRef.current, postId);
      setCreatedWarmSeedEpoch((n) => n + 1);
      removePostFromCreatedCache(postId);
    });
  }, [userId, removePostFromCreatedCache]);

  /** Memory + persisted first page — only when viewer can see Created. */
  const profileCreatedWarmInitialItems = useMemo((): FeedItem[] | undefined => {
    // ownershipFeedRemountEpoch / createdWarmSeedEpoch / feedRefreshEpoch force
    // a fresh cache read after invalidation so remount cannot reuse a stale snapshot.
    void ownershipFeedRemountEpoch;
    void createdWarmSeedEpoch;
    void feedRefreshEpoch;
    if (!viewerHasAccess) return undefined;
    if (!userId) return undefined;
    const warm = readProfileCreatedWarmInitialItems({
      dataCacheKey: profileCreatedDataCacheKey,
      userId,
      excludePostIds: createdExcludedPostIdsRef.current,
    });
    if (!warm?.length) return undefined;
    seedPublishedMediaFromFeedItems({
      items: warm,
      viewerUserId,
      source: "warm",
    });
    return warm;
  }, [
    viewerHasAccess,
    userId,
    profileCreatedDataCacheKey,
    viewerUserId,
    ownershipFeedRemountEpoch,
    createdWarmSeedEpoch,
    feedRefreshEpoch,
  ]);

  // LoadItems function for Created feed
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
  );

  // Cleanup when profile changes to prevent data overlap
  useEffect(() => {
    if (!userId) return;

    // Cancel all requests when profile changes
    cancelContextRequests(`profile-${userId}`);

    return () => {
      cancelContextRequests(`profile-${userId}`);
    };
  }, [userId]);

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
        display_name: profile.display_name ?? post.author.display_name ?? null,
        username: profile.username ?? post.author.username ?? null,
        avatar_url: profile.avatar_url ?? post.author.avatar_url ?? null,
      };
    },
    [
      profile?.user_id,
      profile?.id,
      profile?.display_name,
      profile?.username,
      profile?.avatar_url,
    ]
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
        slideshowHostVisible={visible}
        publishedListOrigin="profile"
      />
    ),
    [visible, authorForProfilePostCard]
  );

  // If account is private and viewer doesn't have access, show message
  if (profile?.is_private && hasAccess === false) {
    return (
      <SocialShelfSurfaceProvider surface="profile-other">
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
      </SocialShelfSurfaceProvider>
    );
  }

  return (
    <SocialShelfSurfaceProvider surface="profile-other">
    <section className="w-full max-w-[640px] mx-auto px-1.5">
      <div className={PROFILE_OVERVIEW_OTHER_POSTS_FEED_CLASS}>
        {createdInitialized && (
          <ProgressiveFeed
            key={`created-${userId}-r${feedRefreshEpoch}-own${ownershipFeedRemountEpoch}`}
            isVisible={visible}
            tabId="other-profile"
            loadItems={loadCreatedItems}
            renderItem={renderCreatedItem}
            getCachedItems={getCachedCreated}
            setCachedItems={setCachedCreatedGuarded}
            initialItems={profileCreatedWarmInitialItems}
            pageSize={15}
            enableScrollStopDetection={true}
            enableLazyLoading={true}
            loading={false}
            loadingComponent={<PostSkeleton />}
            emptyMessage={`${
              profile?.display_name || profile?.username || "This user"
            } hasn't posted yet.`}
            backgroundRevalidateOnMount
            externalRemoveRevision={createdOwnershipRemoveRevision}
            externalRemovePostId={createdOwnershipRemovePostId}
            softRefreshEpoch={createdOwnershipSoftRefreshEpoch}
          />
        )}

        {profile && !createdInitialized && (
          <div className="flex flex-col gap-2">
            {[...Array(3)].map((_, i) => (
              <PostSkeleton key={i} />
            ))}
          </div>
        )}
      </div>
    </section>
    </SocialShelfSurfaceProvider>
  );
}
