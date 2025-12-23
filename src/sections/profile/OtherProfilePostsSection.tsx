import { useEffect, useState, useRef, useTransition, useCallback } from "react";
import { useProfile } from "../../contexts/ProfileContext";
import { getUserPostsCreated } from "../../api/queries/getUserPostsCreated";
import {
  getLikedPostsWithDetailsForUser,
  LikedPostWithDetails,
} from "../../api/services/likes";
import ProgressivePost from "../../components/ProgressivePost";
import PostSkeleton from "../../components/skeletons/PostSkeleton";
import LazyList from "../../components/ui/LazyList";
import {
  getCachedProfilePosts,
  setCachedProfilePosts,
  preloadProfilePostImages,
  clearCachedProfilePosts,
} from "../../lib/profilePostsCache";
import {
  requestManager,
  cancelContextRequests,
} from "../../lib/requestManager";
import { getViewerId } from "../../api/services/follows";
import { loadBatchData, type BatchLoadResult } from "../../lib/batchDataLoader";
import { supabase } from "../../lib/supabaseClient";
import { useSelector } from "react-redux";
import { selectUserId } from "../../selectors/authSelectors";

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
}

export default function OtherProfilePostsSection({
  hasAccess = null,
}: OtherProfilePostsSectionProps) {
  const { profile } = useProfile();
  const [tab, setTab] = useState<"created" | "interacted">("created");

  // React 19: useTransition for non-urgent tab switching
  const [isPending, startTransition] = useTransition();

  // Use profile.user_id consistently (not profile.id)
  const userId = profile?.user_id || "";

  const [created, setCreated] = useState<
    {
      id: string;
      caption: string | null;
      created_at: string;
      type: "experience" | "hangout";
      status?: "draft" | "published";
      isDraft?: boolean;
    }[]
  >([]);
  const [liked, setLiked] = useState<LikedPostWithDetails[]>([]);

  const [loading, setLoading] = useState(false);
  const [likedLoading, setLikedLoading] = useState(false);

  // [OPTIMIZATION: Phase 1 - Batch] Store batched data for components
  const [batchedData, setBatchedData] = useState<BatchLoadResult | null>(null);

  // Get current user ID for batch loading
  const currentUserId = useSelector(selectUserId);

  // Refs to track abort controllers for cancellation
  const createdRequestRef = useRef<AbortController | null>(null);
  const likedRequestRef = useRef<AbortController | null>(null);

  // Check if viewer has access (approved follower or public account)
  const viewerHasAccess = profile
    ? !profile.is_private || hasAccess === true
    : false;

  // [OPTIMIZATION: Phase 1 - Batch] Helper to load batch data for posts
  const loadBatchDataForPosts = useCallback(
    async (posts: any[]) => {
      if (!currentUserId || posts.length === 0) return;

      try {
        // Get current user profile ID
        const { data: currentUserProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", currentUserId)
          .maybeSingle();

        if (!currentUserProfile) return;

        // Extract data from posts for batch loading
        const postIds = posts
          .map((post) => {
            return post.id || post.posts?.id;
          })
          .filter(Boolean);

        // Extract author IDs
        const authorIds = [
          ...new Set(
            posts
              .map((post) => {
                // Created posts: by userId (profile being viewed)
                if (post.author_id) return post.author_id;
                // Liked posts: get from nested posts object
                if (post.posts?.author_id) return post.posts.author_id;
                // Fallback to userId
                return userId;
              })
              .filter(Boolean)
          ),
        ];

        const hangoutPostIds = posts
          .filter((post) => {
            const postType = post.type || post.posts?.type;
            return postType === "hangout";
          })
          .map((post) => post.id || post.posts?.id)
          .filter(Boolean);

        // Load batch data
        const batchResult = await loadBatchData({
          postIds,
          authorIds,
          hangoutPostIds,
          currentUserId,
          currentProfileId: currentUserProfile.id,
        });

        setBatchedData(batchResult);
      } catch (error) {
        console.warn(
          "[OtherProfilePostsSection] Failed to load batch data:",
          error
        );
      }
    },
    [currentUserId, userId]
  );

  // Cleanup when profile changes to prevent data overlap
  useEffect(() => {
    if (!userId) return;

    // Cancel all requests when profile changes
    cancelContextRequests(`profile-${userId}`);
    createdRequestRef.current?.abort();
    likedRequestRef.current?.abort();

    // Clear state immediately when profile changes
    setCreated([]);
    setLiked([]);
    setLoading(false);
    setLikedLoading(false);

    return () => {
      // Additional cleanup on unmount
      createdRequestRef.current?.abort();
      likedRequestRef.current?.abort();
      cancelContextRequests(`profile-${userId}`);
    };
  }, [userId]);

  // STALE-WHILE-REVALIDATE: Load cached data immediately for instant display
  useEffect(() => {
    if (!userId) return;

    // Load created posts cache using user_id
    const cachedCreated = getCachedProfilePosts(userId, "created");
    if (cachedCreated && cachedCreated.length > 0) {
        console.log(
        "[OtherProfilePostsSection] Using cached created posts (stale-while-revalidate):",
        cachedCreated.length
        );
      setCreated(cachedCreated as any);
      preloadProfilePostImages(cachedCreated as any);
      // [OPTIMIZATION: Phase 1 - Batch] Load batch data for cached posts
      loadBatchDataForPosts(cachedCreated).catch(() => {
        // Silent fail - batch loading is optional
      });
      } else {
        setLoading(true);
      }

    // Load interacted posts cache using user_id
    const cachedInteracted = getCachedProfilePosts(userId, "interacted");
    if (cachedInteracted && cachedInteracted.length > 0) {
      console.log(
        "[OtherProfilePostsSection] Using cached interacted posts (stale-while-revalidate):",
        cachedInteracted.length
      );
      setLiked(cachedInteracted as any);
      // [OPTIMIZATION: Phase 1 - Batch] Load batch data for cached posts
      loadBatchDataForPosts(cachedInteracted).catch(() => {
        // Silent fail - batch loading is optional
      });
    }
  }, [userId, loadBatchDataForPosts]);

  // Load created posts - STALE-WHILE-REVALIDATE pattern
  useEffect(() => {
    if (!userId || tab !== "created" || !viewerHasAccess) {
      createdRequestRef.current?.abort();
      cancelContextRequests(`profile-${userId}-created`);
      return;
    }

    // Cancel other tab requests when switching to created
    likedRequestRef.current?.abort();
    cancelContextRequests(`profile-${userId}-liked`);

    const loadCreatedPosts = async () => {
      try {
        const abortController = new AbortController();
        createdRequestRef.current = abortController;

        console.log(
          "[OtherProfilePostsSection] Fetching fresh created posts (background):",
          {
            userId,
            tab,
          }
        );

        // Fetch fresh posts in background (stale-while-revalidate)
        const result = await requestManager.execute(
          `profile-${userId}-created`,
          async (signal: AbortSignal) => {
            const res = await getUserPostsCreated(
              userId,
          0,
              20, // Fetch more to catch new posts
          false, // includeDrafts = false for other profiles
          false // isOwner = false for other profiles
            );
            if (signal.aborted) throw new Error("Aborted");
            return res;
          },
          "high"
        );

        if (abortController.signal.aborted) return;

        if (result.error) {
          console.error("Error loading created posts:", result.error);
          if (!abortController.signal.aborted) {
          setLoading(false);
          }
          return;
        }

        const postsData = result.data?.data || [];

        if (!abortController.signal.aborted) {
          // Update cache with fresh data (only first 5)
          setCachedProfilePosts(userId, "created", postsData.slice(0, 5));
          preloadProfilePostImages(postsData.slice(0, 5) as any);

          // Update state with fresh data
          setCreated(postsData as any);
          // [OPTIMIZATION: Phase 1 - Batch] Load batch data for created posts
          loadBatchDataForPosts(postsData).catch(() => {
            // Silent fail - batch loading is optional
          });
        setLoading(false);
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
        console.error("Error loading created posts:", error);
        setLoading(false);
        }
      }
    };

    loadCreatedPosts();
  }, [userId, tab, viewerHasAccess]);

  // Load liked posts - STALE-WHILE-REVALIDATE pattern
  useEffect(() => {
    if (!userId || tab !== "interacted" || !viewerHasAccess) {
      likedRequestRef.current?.abort();
      cancelContextRequests(`profile-${userId}-liked`);
      return;
    }

    // Cancel other tab requests when switching to interacted
    createdRequestRef.current?.abort();
    cancelContextRequests(`profile-${userId}-created`);

    // Check cache first (already done in initial load)
    const cachedInteracted = getCachedProfilePosts(userId, "interacted");
    if (cachedInteracted && cachedInteracted.length > 0 && liked.length === 0) {
      setLiked(cachedInteracted as any);
      setLikedLoading(false);
    }

    // Fetch fresh data in background (stale-while-revalidate)
    const loadLikedPosts = async () => {
      setLikedLoading(true);
      try {
        const abortController = new AbortController();
        likedRequestRef.current = abortController;

        console.log(
          "[OtherProfilePostsSection] Fetching fresh liked posts (background):",
          {
            userId,
            tab,
          }
        );

        const result = await requestManager.execute(
          `profile-${userId}-liked`,
          async (signal: AbortSignal) => {
        // For other profiles, get their liked posts using their user_id
            const res = await getLikedPostsWithDetailsForUser(userId);
            if (signal.aborted) throw new Error("Aborted");
            return res;
          },
          "high"
        );

        if (abortController.signal.aborted) return;

        if (result.error) {
          console.error("Error loading liked posts:", result.error);
          if (liked.length === 0) {
          setLiked([]);
          }
        } else {
          let freshLiked = result.data?.data || [];
          
          // [OPTIMIZATION: Phase 1 - Privacy Filter] Use centralized privacy filter utility
          // Why: Eliminates code duplication, ensures consistent filtering, uses caching and batching
          if (freshLiked.length > 0) {
            const viewerProfileId = await getViewerId();
            const { filterPostsByPrivacy } = await import(
              "../../lib/postPrivacyFilter"
            );
            freshLiked = await filterPostsByPrivacy(
              freshLiked,
              viewerProfileId
            );
          }
          
          setLiked(freshLiked);
          // Update cache (only first 5)
          setCachedProfilePosts(userId, "interacted", freshLiked.slice(0, 5));
          // [OPTIMIZATION: Phase 1 - Batch] Load batch data for liked posts
          loadBatchDataForPosts(freshLiked).catch(() => {
            // Silent fail - batch loading is optional
          });
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
        console.error("Error loading liked posts:", error);
          if (liked.length === 0) {
        setLiked([]);
          }
        }
      } finally {
        if (!likedRequestRef.current?.signal.aborted) {
        setLikedLoading(false);
        }
      }
    };

    loadLikedPosts();
  }, [userId, tab, liked.length, viewerHasAccess]);

  // Theme-aware tab styling
  const base =
    "px-2 py-1 rounded-full text-xs border transition-all duration-200 flex items-center justify-center";
  const active = "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]";
  const inactive =
    "bg-transparent text-[var(--text)]/80 border-[var(--border)] hover:border-[var(--text)]/40";

  // If account is private and viewer doesn't have access, show message
  if (profile?.is_private && hasAccess === false) {
    return (
      <section className="w-full max-w-[640px] mx-auto px-3">
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
    <section className="w-full max-w-[640px] mx-auto px-3">
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
        {tab === "created" && (
          <>
            {loading && created.length === 0 && (
              <div className="flex flex-col gap-2">
                {[...Array(3)].map((_, i) => (
                  <PostSkeleton key={i} />
                ))}
              </div>
            )}

            {!loading && created.length === 0 && (
              <div className="text-center text-sm text-[var(--text)]/70 py-10">
                {profile?.display_name || profile?.username || "This user"}{" "}
                hasn't posted yet.
              </div>
            )}

            {/* POSTS LIST - Prepped for lazy loading (implementation later) */}
            {!loading && created.length > 0 && (
              <LazyList
                items={created}
                renderItem={(p: any) => (
                  <ProgressivePost
                    key={p.id}
                    postId={p.id}
                    caption={p.caption}
                    createdAt={p.created_at}
                    authorId={userId}
                    author={{
                      id: userId,
                      username: profile?.username || null,
                      display_name: profile?.display_name || null,
                      avatar_url: profile?.avatar_url || null,
                    }}
                    type={p.type}
                    isOwner={false}
                    onDelete={() => {}} // No delete for other profiles
                    status={p.status || "published"}
                    batchedData={batchedData}
                    isDraft={false} // No drafts for other profiles
                    isAnonymous={p.is_anonymous || false}
                    anonymousName={p.anonymous_name || null}
                    anonymousAvatar={p.anonymous_avatar || null}
                    selectedDates={p.selected_dates || null}
                  />
                )}
                bufferBefore={0}
                bufferAfter={1}
                rootMargin="100px"
                loadingComponent={<PostSkeleton />}
                enabled={true}
                className="flex flex-col gap-2"
              />
            )}
          </>
        )}

        {tab === "interacted" && (
          <>
            {likedLoading && liked.length === 0 && (
              <div className="flex flex-col gap-2">
                {[...Array(3)].map((_, i) => (
                  <PostSkeleton key={i} />
                ))}
              </div>
            )}

            {!likedLoading && liked.length === 0 && (
              <div className="text-center text-sm text-[var(--text)]/70 py-10">
                No liked posts yet.
              </div>
            )}

            {/* LIKED POSTS LIST - Prepped for lazy loading (implementation later) */}
            {liked.length > 0 && (
              <LazyList
                items={liked}
                renderItem={(l: LikedPostWithDetails) => (
                  <ProgressivePost
                    key={l.posts.id}
                    postId={l.posts.id}
                    caption={l.posts.caption}
                    createdAt={l.posts.created_at}
                    authorId={l.posts.author_id}
                    author={{
                      id: l.posts.author_id,
                      username: l.posts.profiles.username,
                      display_name: l.posts.profiles.display_name,
                      avatar_url: l.posts.profiles.avatar_url,
                    }}
                    type={l.posts.type}
                    isOwner={false}
                    status="published"
                    batchedData={batchedData}
                    isAnonymous={l.posts.is_anonymous || false}
                    anonymousName={(l.posts as any).anonymous_name}
                    anonymousAvatar={(l.posts as any).anonymous_avatar}
                  />
                )}
                bufferBefore={0}
                bufferAfter={1}
                rootMargin="100px"
                loadingComponent={<PostSkeleton />}
                enabled={!likedLoading}
                className="flex flex-col gap-2"
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
