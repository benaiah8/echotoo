import {
  useEffect,
  useState,
  useMemo,
  useTransition,
  useCallback,
  useRef,
} from "react";
import { useProfile } from "../../contexts/ProfileContext";
import { getUserPostsCreatedOptimized } from "../../api/queries/getUserPostsCreated";
import {
  getSavedPostsOptimized,
} from "../../api/services/savedPosts";
import Post from "../../components/Post";
import PostSkeleton from "../../components/skeletons/PostSkeleton";
import ProgressiveFeed from "../../components/ProgressiveFeed";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { dataCache } from "../../lib/dataCache";
import { cancelContextRequests } from "../../lib/requestManager";
import {
  convertSavedToFeedItem,
} from "../../lib/profilePostsConverters";
import { LOCAL_DRAFT_DISCARDED_EVENT, isLocalCreateDraftOwnedBy } from "../../lib/drafts";
import {
  buildLocalPrependedFeedItem,
  consumeOwnCreatedPrependPending,
  peekOwnCreatedPrependPending,
} from "../../lib/ownCreatedPendingPrepend";
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
  filterProfileCreatedWarmItems,
  guardProfileCreatedCacheWrite,
  noteProfileCreatedExclusion,
  readProfileCreatedWarmInitialItems,
} from "../../lib/profileCreatedWarmSeed";
import {
  PROFILE_OVERVIEW_POSTS_FEED_CLASS,
  PROFILE_OVERVIEW_POSTS_TAB_BAND_CLASS,
} from "../../lib/profileOverviewPresentation";
import { SocialShelfSurfaceProvider } from "../../lib/social/socialShelfSurfaceContext";
// [PHASE 4.1.3] Complete refactor: Single ProgressiveFeed pattern for all tabs

/**
 * OwnProfilePostsSection - Posts section for OWN profile
 * - Always uses profile.user_id for caching (consistent)
 * - Implements stale-while-revalidate (show cache immediately, fetch fresh in background)
 * - Only caches first 5 posts
 * - Prepped for lazy loading (structure ready, implementation later)
 */
interface OwnProfilePostsSectionProps {
  visible?: boolean; // [OPTIMIZATION] Only load data when tab is visible
  /** Bumps when user taps profile tab again — remount feeds + drop tab caches */
  feedRefreshEpoch?: number;
  /** Bumps after publish navigation — select Created tab */
  focusCreatedTabEpoch?: number;
}

// [DEBUG] Toggle for console logs
const DEBUG_OWN_PROFILE = false;

export default function OwnProfilePostsSection({
  visible = true, // Default to true for backward compatibility
  feedRefreshEpoch = 0,
  focusCreatedTabEpoch = 0,
}: OwnProfilePostsSectionProps = {}) {
  const { profile } = useProfile();
  const [tab, setTab] = useState<"created" | "saved">("created");
  /** Bumps when local draft keys are cleared so the Created feed drops the draft card without a full refresh. */
  const [localDraftEpoch, setLocalDraftEpoch] = useState(0);

  /** Bumped after consuming publish prepend marker so peek-based hydrate memo clears without remounting the feed */
  const [prependHydrateNonce, setPrependHydrateNonce] = useState(0);
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

  // React 19: useTransition for non-urgent tab switching
  const [isPending, startTransition] = useTransition();

  const prevFocusCreatedTabEpochRef = useRef(focusCreatedTabEpoch);
  useEffect(() => {
    if (
      focusCreatedTabEpoch > 0 &&
      focusCreatedTabEpoch !== prevFocusCreatedTabEpochRef.current
    ) {
      prevFocusCreatedTabEpochRef.current = focusCreatedTabEpoch;
      startTransition(() => setTab("created"));
    }
  }, [focusCreatedTabEpoch, startTransition]);

  // Use profile.user_id consistently (not profile.id)
  // Must be declared before useEffects that use it
  const userId = profile?.user_id || "";

  // [FIX] Extract only the profile properties we actually use - prevents infinite loops
  // profile object changes reference on every render, but these primitives are stable
  const profileUsername = profile?.username || null;
  const profileDisplayName = profile?.display_name || null;
  const profileAvatarUrl = profile?.avatar_url || null;

  // [PHASE B.3] Track which tabs have been initialized (visited for first time)
  // [FIX] Use refs to track initialization to prevent infinite loops from dependency changes
  const createdInitializedRef = useRef(false);
  const savedInitializedRef = useRef(false);

  // [FIX] Use state only for rendering, refs for logic to prevent infinite loops
  const [tabsInitialized, setTabsInitialized] = useState({
    created: false,
    saved: false,
  });

  // [DEBUG] Track userId changes
  const prevUserIdLogRef = useRef<string | null>(null);
  useEffect(() => {
    if (DEBUG_OWN_PROFILE) {
      console.log("[OwnProfilePostsSection] userId change", {
        prev: prevUserIdLogRef.current,
        next: userId,
      });
    }
    prevUserIdLogRef.current = userId;
  }, [userId]);

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
      savedInitializedRef.current = false;
      createdExcludedPostIdsRef.current = new Set();
      setCreatedWarmSeedEpoch(0);
      setTabsInitialized({
        created: false,
        saved: false,
      });
    }

    // Update previous userId
    prevUserIdRef.current = userId;
  }, [userId]);

  // Initialize Created tab immediately on mount (default tab)
  // [FIX] Use ref to track initialization - prevents infinite loops
  useEffect(() => {
    if (userId && !createdInitializedRef.current) {
      createdInitializedRef.current = true;
      setTabsInitialized((prev) => ({ ...prev, created: true }));
    }
  }, [userId]); // Only depend on userId - ref prevents re-running

  // Initialize other tabs when first visited
  // [FIX] Use refs to track initialization - prevents infinite loops
  useEffect(() => {
    if (!userId) return;

    if (tab === "saved" && !savedInitializedRef.current) {
      savedInitializedRef.current = true;
      setTabsInitialized((prev) => ({ ...prev, saved: true }));
    }
  }, [tab, userId]); // Only depend on tab and userId - refs prevent re-running

  // [PHASE 4.1.3 REFACTOR] Single ProgressiveFeed pattern - no manual state needed for any tab
  // All tabs now use ProgressiveFeed for consistent loading, caching, and pagination

  // [OPTIMIZATION: Phase 3.3] Removed loadBatchDataForPosts - PostgreSQL functions provide all data

  // Cleanup when profile changes to prevent data overlap
  useEffect(() => {
    if (!userId) return;

    // Cancel all requests when profile changes
    cancelContextRequests(`profile-${userId}`);

    return () => {
      // Additional cleanup on unmount
      cancelContextRequests(`profile-${userId}`);
    };
  }, [userId]);

  // [PHASE 4.1.1] Get drafts from localStorage (for unsaved local drafts)
  // Used by ProgressiveFeed's initialItems to show drafts immediately
  // [FIX] Only depend on primitives, not entire profile object - prevents infinite loops
  const getDraftsFromStorage = useCallback(() => {
    try {
      if (!userId || !isLocalCreateDraftOwnedBy(userId)) {
        return [];
      }

      const draftMeta = localStorage.getItem("draftMeta");
      const draftActivities = localStorage.getItem("draftActivities");

      const hasMeta =
        draftMeta && draftMeta !== "{}" && draftMeta.trim() !== "";
      const hasActivities =
        draftActivities &&
        draftActivities !== "[]" &&
        draftActivities.trim() !== "";

      if (hasMeta || hasActivities) {
        const meta = hasMeta ? JSON.parse(draftMeta) : {};
        const activities = hasActivities ? JSON.parse(draftActivities) : [];

        const draftPost: FeedItem = {
          id: "draft-" + Date.now(),
          caption: meta.caption || "Untitled draft",
          created_at: new Date().toISOString(),
          type: "experience" as const,
          author_id: userId,
          author: {
            id: userId,
            username: profileUsername,
            display_name: profileDisplayName,
            avatar_url: profileAvatarUrl,
          },
          is_anonymous: false,
          anonymous_name: null,
          anonymous_avatar: null,
          selected_dates: null,
          tags: null,
          follow_status: undefined,
          is_liked: false,
          is_saved: false,
          comment_count: 0,
          has_images: false,
          rsvp_data: null,
          // Draft-specific fields
          status: "draft" as const,
          isDraft: true,
          activities: activities || [],
          meta: meta,
        } as any;

        return [draftPost];
      }
      return [];
    } catch (error) {
      console.error("Failed to load drafts:", error);
      return [];
    }
  }, [userId, profileUsername, profileDisplayName, profileAvatarUrl]); // [FIX] Use primitives, not profile object

  // [PHASE A.2] Conversion functions moved to shared utility: src/lib/profilePostsConverters.ts

  // [PHASE B.1] Separate cache callbacks for each tab (preparation for multi-ProgressiveFeed pattern)

  /** Single Created-tab dataCache key — shared by hydrate, persist, discard, sync warm initialItems */
  const profileCreatedDataCacheKey = useMemo(
    () => `profile_created_${userId}`,
    [userId]
  );

  // Created tab cache
  // [FIX] Only depend on primitives, not entire profile object - prevents infinite loops
  const getCachedCreated = useCallback(() => {
    let cached = dataCache.get<FeedItem[]>(profileCreatedDataCacheKey);
    let source: "warm" | "persist" = "warm";
    let snapshotTs: number | undefined;
    if (!cached?.length) {
      const persisted = readPersistedProfilePosts("created", userId);
      cached = persisted?.items?.length ? persisted.items : null;
      if (cached?.length) {
        source = "persist";
        snapshotTs = persisted?.ts;
      }
    }

    // Only add drafts for Created tab
    if (cached) {
      seedPublishedMediaFromFeedItems({
        items: cached,
        viewerUserId: userId,
        source,
        snapshotTs,
      });
      try {
        if (!userId || !isLocalCreateDraftOwnedBy(userId)) {
          return cached || null;
        }

        const draftMeta = localStorage.getItem("draftMeta");
        const draftActivities = localStorage.getItem("draftActivities");
        const hasMeta =
          draftMeta && draftMeta !== "{}" && draftMeta.trim() !== "";
        const hasActivities =
          draftActivities &&
          draftActivities !== "[]" &&
          draftActivities.trim() !== "";

        if (hasMeta || hasActivities) {
          const meta = hasMeta ? JSON.parse(draftMeta) : {};
          const activities = hasActivities ? JSON.parse(draftActivities) : [];
          const draftPost: FeedItem = {
            id: "draft-" + Date.now(),
            caption: meta.caption || "Untitled draft",
            created_at: new Date().toISOString(),
            type: "experience" as const,
            author_id: userId,
            author: {
              id: userId,
              username: profileUsername,
              display_name: profileDisplayName,
              avatar_url: profileAvatarUrl,
            },
            is_anonymous: false,
            anonymous_name: null,
            anonymous_avatar: null,
            selected_dates: null,
            tags: null,
            follow_status: undefined,
            is_liked: false,
            is_saved: false,
            comment_count: 0,
            has_images: false,
            rsvp_data: null,
            status: "draft" as const,
            isDraft: true,
            activities: activities || [],
            meta: meta,
          } as any;

          return [draftPost, ...cached];
        }
      } catch (error) {
        console.error("Failed to load drafts:", error);
      }
    }

    return cached || null;
  }, [
    profileCreatedDataCacheKey,
    profileUsername,
    profileDisplayName,
    profileAvatarUrl,
    userId,
  ]);

  const setCachedCreated = useCallback(
    (items: FeedItem[]) => {
      // Filter out drafts for Created tab - they're managed by localStorage
      const itemsToCache = items.filter((item: any) => !item.isDraft);
      const persisted = itemsToCache.slice(0, 20);
      dataCache.set(profileCreatedDataCacheKey, persisted, 10 * 60 * 1000); // 10min TTL, cache 20 items
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

  /** Memory + persisted first page — sync read for cold offline open. */
  const profileCreatedWarmInitialItems = useMemo((): FeedItem[] | undefined => {
    // ownershipFeedRemountEpoch / createdWarmSeedEpoch / feedRefreshEpoch force
    // a fresh cache read after invalidation so remount cannot reuse a stale snapshot.
    void ownershipFeedRemountEpoch;
    void createdWarmSeedEpoch;
    void feedRefreshEpoch;
    void localDraftEpoch;
    if (!userId) return undefined;
    const warm = readProfileCreatedWarmInitialItems({
      dataCacheKey: profileCreatedDataCacheKey,
      userId,
      excludePostIds: createdExcludedPostIdsRef.current,
    });
    if (!warm?.length) return undefined;
    seedPublishedMediaFromFeedItems({
      items: warm,
      viewerUserId: userId,
      source: "warm",
    });
    return warm;
  }, [
    userId,
    profileCreatedDataCacheKey,
    ownershipFeedRemountEpoch,
    createdWarmSeedEpoch,
    feedRefreshEpoch,
    localDraftEpoch,
  ]);

  /**
   * First paint merge: prepend marker (peek-only) + `profile_created_${userId}` + drafts parity with load offset 0.
   * Consume runs in an effect afterward so ProgressiveFeed mounts with seeded rows synchronously on the publish return.
   * Not gated on tab visibility — Done/discard can remount Created feed while profile tab is hidden on create routes.
   */
  const publishHydratedCreatedRows = useMemo(() => {
    if (!profile?.user_id || !profile) return null;

    const peek = peekOwnCreatedPrependPending(profile.user_id);
    if (peek.kind !== "pending") return null;

    const localItem = buildLocalPrependedFeedItem(profile, peek.payload);
    // Sync-seed from prepend so Post cache hit is available on first paint.
    seedPublishedMediaFromFeedItems({
      items: [localItem],
      viewerUserId: profile.user_id,
      source: "publish",
    });
    const cachedBare =
      dataCache.get<FeedItem[]>(profileCreatedDataCacheKey) ??
      readPersistedProfilePosts("created", userId)?.items ??
      [];

    const drafts = getDraftsFromStorage();

    const safeCached =
      filterProfileCreatedWarmItems(
        cachedBare,
        createdExcludedPostIdsRef.current
      ) ?? [];
    const tail = safeCached.filter((r) => r.id !== localItem.id);

    const merged = [...drafts, localItem, ...tail];

    const seen = new Set<string>();
    const deduped = merged.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    return deduped;
  }, [
    userId,
    profileCreatedDataCacheKey,
    profile?.user_id,
    profile?.id,
    profile?.username,
    profile?.display_name,
    profile?.avatar_url,
    profile,
    getDraftsFromStorage,
    prependHydrateNonce,
  ]);

  useEffect(() => {
    if (!visible || !profile?.user_id) return;

    const pPeek = peekOwnCreatedPrependPending(profile.user_id);
    if (pPeek.kind === "mismatch_should_clear") {
      consumeOwnCreatedPrependPending(profile.user_id);
      return;
    }

    if (!publishHydratedCreatedRows?.length) return;

    const r = consumeOwnCreatedPrependPending(profile.user_id);
    if (r.kind !== "consumed") return;

    setCachedCreatedGuarded(publishHydratedCreatedRows);

    setPrependHydrateNonce((n) => n + 1);
  }, [
    visible,
    profile?.user_id,
    publishHydratedCreatedRows,
    setCachedCreatedGuarded,
  ]);

  // Saved tab cache
  const getCachedSaved = useCallback(() => {
    const cacheKey = `profile_saved_${userId}`;
    const cached = dataCache.get<FeedItem[]>(cacheKey);
    if (cached?.length) return cached;
    const persisted = readPersistedProfilePosts("saved", userId);
    return persisted?.items?.length ? persisted.items : null;
  }, [userId]);

  const setCachedSaved = useCallback(
    (items: FeedItem[]) => {
      const cacheKey = `profile_saved_${userId}`;
      const persisted = items.slice(0, 20);
      dataCache.set(cacheKey, persisted, 30 * 60 * 1000); // 30min TTL, cache 20 items
      writePersistedProfilePosts("saved", userId, persisted);
    },
    [userId]
  );

  const profileSavedWarmInitialItems = useMemo((): FeedItem[] | undefined => {
    if (!userId) return undefined;
    const cacheKey = `profile_saved_${userId}`;
    const cached = dataCache.get<FeedItem[]>(cacheKey);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    const persisted = readPersistedProfilePosts("saved", userId);
    return persisted?.items?.length ? persisted.items : undefined;
  }, [userId]);

  // [PHASE 4.1.3] All tabs now use ProgressiveFeed - no manual loading needed
  // ProgressiveFeed handles caching, loading, pagination automatically

  // Local draft discarded (Hangout/PostMenu/BottomTab/publish) — refresh Created tab draft strip
  useEffect(() => {
    const onLocalDraftDiscarded = () => {
      if (userId) {
        const prependPeek = peekOwnCreatedPrependPending(userId);
        if (prependPeek.kind === "pending") {
          // Publish Done clears drafts after marker write — do not wipe/remount Created seed path.
          return;
        }
        dataCache.delete(profileCreatedDataCacheKey);
      }
      setLocalDraftEpoch((n) => n + 1);
    };
    window.addEventListener(LOCAL_DRAFT_DISCARDED_EVENT, onLocalDraftDiscarded);
    return () =>
      window.removeEventListener(
        LOCAL_DRAFT_DISCARDED_EVENT,
        onLocalDraftDiscarded
      );
  }, [userId, profileCreatedDataCacheKey]);

  // [PHASE B.2] Separate loadItems functions for each tab (preparation for multi-ProgressiveFeed pattern)

  // Created tab loadItems
  // [FIX] Only depend on userId, not entire profile object - prevents infinite loops
  const loadCreatedItems = useCallback(
    async (
      offset: number,
      limit: number
    ): Promise<FeedItem[] | { items: FeedItem[]; consumedOffset: number }> => {
      if (DEBUG_OWN_PROFILE) {
        console.log("[OwnProfilePostsSection] loadCreatedItems called", {
          userId,
          offset,
          limit,
        });
      }
      const currentUserId = userId; // Use userId from closure, not profile?.user_id
      if (!currentUserId) {
        return [];
      }

      const { getViewerAuthUserId } = await import(
        "../../api/services/follows"
      );
      const viewerUserId = await getViewerAuthUserId();
      const validViewerUserId =
        viewerUserId && viewerUserId !== "" ? viewerUserId : null;

      const result = await getUserPostsCreatedOptimized(
        currentUserId,
        offset,
        limit,
        true, // includeDrafts (for own profile)
        true, // isOwner (for own profile)
        validViewerUserId
      );

      if (result.error) {
        if (offset === 0) {
          const drafts = getDraftsFromStorage();
          let bare =
            dataCache.get<FeedItem[]>(profileCreatedDataCacheKey) ??
            readPersistedProfilePosts("created", currentUserId)?.items ??
            [];
          bare = bare.filter((item) => !(item as { isDraft?: boolean }).isDraft);
          const merged = [...drafts, ...bare];
          if (merged.length > 0) {
            return { items: merged, consumedOffset: bare.length };
          }
        }
        return offset === 0 ? [] : [];
      }

      const backendRows = (result.data || []).length;

      // Prepend localStorage drafts to first page only
      if (offset === 0) {
        const drafts = getDraftsFromStorage();
        const merged = [...drafts, ...(result.data || [])];
        if (DEBUG_OWN_PROFILE) {
          console.log("[OwnProfilePostsSection] loadCreatedItems response", {
            userId,
            offset,
            limit,
            received: merged.length,
            hasDrafts: drafts.length > 0,
          });
        }
        // consumedOffset = backend rows only (drafts don't consume backend offset)
        return { items: merged, consumedOffset: backendRows };
      }

      const merged = result.data || [];
      if (DEBUG_OWN_PROFILE) {
        console.log("[OwnProfilePostsSection] loadCreatedItems response", {
          userId,
          offset,
          limit,
          received: merged.length,
          hasDrafts: false,
        });
      }
      return { items: merged, consumedOffset: backendRows };
    },
    [userId, getDraftsFromStorage, profileCreatedDataCacheKey]
  ); // [FIX] Only depend on userId and getDraftsFromStorage

  // Saved tab loadItems
  // [FIX] Only depend on userId, not entire profile object - prevents infinite loops
  const loadSavedItems = useCallback(
    async (offset: number, limit: number): Promise<FeedItem[]> => {
      if (DEBUG_OWN_PROFILE) {
        console.log("[OwnProfilePostsSection] loadSavedItems called", {
          userId,
          offset,
          limit,
        });
      }
      const currentUserId = userId; // Use userId from closure, not profile?.user_id
      if (!currentUserId) return [];

      const { getViewerAuthUserId } = await import(
        "../../api/services/follows"
      );
      const viewerUserId = await getViewerAuthUserId();
      const validViewerUserId =
        viewerUserId && viewerUserId !== "" ? viewerUserId : null;

      if (DEBUG_OWN_PROFILE) {
        console.log("[OwnProfilePostsSection] loadSavedItems called:", {
          currentUserId,
          offset,
          limit,
          viewerUserId: validViewerUserId,
        });
      }

      const result = await getSavedPostsOptimized(
        currentUserId,
        validViewerUserId,
        limit,
        offset
      );

      if (result.error) {
        if (offset === 0) {
          const cached = getCachedSaved();
          if (cached?.length) return cached;
        }
        return [];
      }

      // [DEBUG] Log response size to identify large fetches (4MB issue)
      if (DEBUG_OWN_PROFILE && result.data) {
        const dataSize = JSON.stringify(result.data).length;
        console.log("[OwnProfilePostsSection] loadSavedItems response:", {
          postCount: result.data.length,
          estimatedSizeKB: Math.round(dataSize / 1024),
          estimatedSizeMB: (dataSize / (1024 * 1024)).toFixed(2),
          firstPost: result.data[0]
            ? {
                id: result.data[0].posts?.id,
                hasActivities: !!result.data[0].posts?.activities,
                activityCount: result.data[0].posts?.activities?.length || 0,
                firstActivityImages:
                  (
                    result.data[0].posts?.activities?.[0] as {
                      images?: string[];
                    }
                  )?.images?.length ?? 0,
              }
            : null,
        });
      }

      // Convert to FeedItem format (RPC now carries canonical engagement counts).
      if (result.data) {
        const mapped = result.data.map(convertSavedToFeedItem);
        if (DEBUG_OWN_PROFILE) {
          console.log("[OwnProfilePostsSection] loadSavedItems mapped", {
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
    [userId, getCachedSaved]
  ); // [FIX] Only depend on userId

  // [DEBUG] Track tab changes
  useEffect(() => {
    if (DEBUG_OWN_PROFILE) {
      console.log("[OwnProfilePostsSection] tab change", { tab, userId });
    }
  }, [tab, userId]);

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
  // These functions are passed as props to ProgressiveFeed, so they must be stable
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
        isOwner={true} // Created tab is always owner
        status={(post as any).status || "published"}
        isDraft={(post as any).isDraft || false}
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
        publishedListOrigin="profile"
      />
    ),
    [visible, tab, authorForProfilePostCard]
  );

  const renderSavedItem = useCallback(
    (post: FeedItem) => (
      <Post
        key={post.id}
        postId={post.id}
        caption={post.caption}
        createdAt={post.created_at}
        authorId={post.author_id}
        author={authorForProfilePostCard(post)}
        type={post.type}
        isOwner={false} // Not owner for saved tab
        status="published"
        isDraft={false}
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
        slideshowHostVisible={visible && tab === "saved"}
        publishedListOrigin="profile"
      />
    ),
    [visible, tab, authorForProfilePostCard]
  );

  // Theme-aware tab styling
  const base =
    "px-2 py-0.5 rounded-full text-xs border transition-all duration-200 flex items-center justify-center";
  const active = "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]";
  const inactive =
    "bg-transparent text-[var(--text)]/80 border-[var(--border)] hover:border-[var(--text)]/40";

  return (
    <SocialShelfSurfaceProvider surface="profile-own">
    <section className="w-full max-w-[640px] mx-auto px-1.5">
      {/* Tab Navigation - Always visible (static) */}
      <div className={PROFILE_OVERVIEW_POSTS_TAB_BAND_CLASS}>
        <div className="flex items-center justify-center gap-2 py-1.5">
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
            className={`${base} ${tab === "saved" ? active : inactive} ${
              isPending ? "opacity-70" : ""
            }`}
            onClick={() => startTransition(() => setTab("saved"))}
            disabled={isPending}
          >
            Saved
          </button>
        </div>
        <div className="h-px w-full bg-[var(--border)]" aria-hidden />
      </div>

      {/* Content - ProgressiveFeeds (always mounted, CSS controls visibility) */}
      <div className={PROFILE_OVERVIEW_POSTS_FEED_CLASS}>
        {/* [PHASE B.4] Multi-ProgressiveFeed pattern - Instagram-like tab behavior */}
        {/* [PHASE B.5] Lazy initialization - only mount tabs when first visited */}

        {/* Created Tab - Progressive 1-by-1 loading */}
        {tabsInitialized.created && (
          <div style={{ display: tab === "created" ? "block" : "none" }}>
            <ProgressiveFeed
              key={`created-${userId}-r${feedRefreshEpoch}-ld${localDraftEpoch}-own${ownershipFeedRemountEpoch}`}
              isVisible={visible && tab === "created"}
              tabId="profile"
              loadItems={loadCreatedItems}
              renderItem={renderCreatedItem} // [FIX] Use memoized function
              getCachedItems={getCachedCreated}
              setCachedItems={setCachedCreatedGuarded}
              initialItems={profileCreatedWarmInitialItems}
              authoritativeHydratedSeed={
                publishHydratedCreatedRows ?? undefined
              }
              pageSize={15} // Batch size for egress reduction (connection-aware clamp applies)
              enableScrollStopDetection={true}
              enableLazyLoading={true}
              loading={false}
              loadingComponent={<PostSkeleton />}
              emptyMessage="You haven't posted yet."
              backgroundRevalidateOnMount
              externalRemoveRevision={createdOwnershipRemoveRevision}
              externalRemovePostId={createdOwnershipRemovePostId}
              softRefreshEpoch={createdOwnershipSoftRefreshEpoch}
            />
          </div>
        )}

        {/* Saved Tab - Batch loading (simpler) */}
        {tabsInitialized.saved && (
          <div style={{ display: tab === "saved" ? "block" : "none" }}>
            <ProgressiveFeed
              key={`saved-${userId}-r${feedRefreshEpoch}`}
              isVisible={visible && tab === "saved"}
              tabId="profile"
              loadItems={loadSavedItems}
              renderItem={renderSavedItem} // [FIX] Use memoized function
              getCachedItems={getCachedSaved}
              setCachedItems={setCachedSaved}
              initialItems={profileSavedWarmInitialItems}
              pageSize={15} // Batch size for egress reduction (connection-aware clamp applies)
              enableScrollStopDetection={true}
              enableLazyLoading={true}
              loading={false}
              loadingComponent={<PostSkeleton />}
              emptyMessage="No saved posts yet."
            />
          </div>
        )}
      </div>
    </section>
    </SocialShelfSurfaceProvider>
  );
}
