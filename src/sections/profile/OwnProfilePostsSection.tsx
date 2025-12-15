import { useEffect, useState, useMemo, useRef, useTransition } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { useProfile } from "../../contexts/ProfileContext";
import { selectUserId } from "../../selectors/authSelectors";
import { getUserPostsCreated } from "../../api/queries/getUserPostsCreated";
import {
  getSavedPosts,
  getCachedSavedPosts,
  SavedPostWithDetails,
} from "../../api/services/savedPosts";
import {
  getLikedPostsWithDetails,
  LikedPostWithDetails,
} from "../../api/services/likes";
import Post from "../../components/Post";
import ProgressivePost from "../../components/ProgressivePost";
import PostSkeleton from "../../components/skeletons/PostSkeleton";
import LazyList from "../../components/ui/LazyList";
import {
  getCachedProfilePosts,
  setCachedProfilePosts,
  updateProfilePostsCache,
  preloadProfilePostImages,
  clearCachedProfilePosts,
} from "../../lib/profilePostsCache";
import { supabase } from "../../lib/supabaseClient";
import toast from "react-hot-toast";
import {
  requestManager,
  cancelContextRequests,
} from "../../lib/requestManager";

/**
 * OwnProfilePostsSection - Posts section for OWN profile
 * - Always uses profile.user_id for caching (consistent)
 * - Implements stale-while-revalidate (show cache immediately, fetch fresh in background)
 * - Only caches first 5 posts
 * - Prepped for lazy loading (structure ready, implementation later)
 */
export default function OwnProfilePostsSection() {
  const { profile } = useProfile();
  const location = useLocation();
  const [tab, setTab] = useState<"created" | "interacted" | "saved">("created");

  // React 19: useTransition for non-urgent tab switching
  const [isPending, startTransition] = useTransition();

  // Get current user ID from Redux
  const currentUserId = useSelector(selectUserId);

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
  const [saved, setSaved] = useState<SavedPostWithDetails[]>([]);
  const [liked, setLiked] = useState<LikedPostWithDetails[]>([]);

  const [loading, setLoading] = useState(true); // Start as true to show skeletons initially
  const [savedLoading, setSavedLoading] = useState(true); // Start as true to show skeletons initially
  const [likedLoading, setLikedLoading] = useState(true); // Start as true to show skeletons initially

  // Pagination state
  const [createdPage, setCreatedPage] = useState(0);
  const [hasMoreCreated, setHasMoreCreated] = useState(true);

  // Refs to track abort controllers for cancellation
  const createdRequestRef = useRef<AbortController | null>(null);
  const likedRequestRef = useRef<AbortController | null>(null);
  const savedRequestRef = useRef<AbortController | null>(null);

  // Cleanup when profile changes to prevent data overlap
  useEffect(() => {
    if (!userId) return;

    // Cancel all requests when profile changes
    cancelContextRequests(`profile-${userId}`);
    createdRequestRef.current?.abort();
    likedRequestRef.current?.abort();
    savedRequestRef.current?.abort();

    // Clear state immediately when profile changes
    setCreated([]);
    setSaved([]);
    setLiked([]);
    setLoading(false);
    setSavedLoading(false);
    setLikedLoading(false);
    setCreatedPage(0);
    setHasMoreCreated(true);

    return () => {
      // Additional cleanup on unmount
      createdRequestRef.current?.abort();
      likedRequestRef.current?.abort();
      savedRequestRef.current?.abort();
      cancelContextRequests(`profile-${userId}`);
    };
  }, [userId]);

  // Get drafts from localStorage (for unsaved local drafts)
  const getDraftsFromStorage = () => {
    try {
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

        const draftPost = {
          id: "draft-" + Date.now(),
          caption: meta.caption || "Untitled draft",
          created_at: new Date().toISOString(),
          type: "experience",
          status: "draft",
          activities: activities || [],
          meta: meta,
          isDraft: true,
        };

        return [draftPost];
      }
      return [];
    } catch (error) {
      console.error("Failed to load drafts:", error);
      return [];
    }
  };

  // STALE-WHILE-REVALIDATE: Load cached data immediately for instant display
  useEffect(() => {
    if (!userId) return;

    // Load created posts cache using user_id
    const cachedCreated = getCachedProfilePosts(userId, "created");
    if (cachedCreated && cachedCreated.length > 0) {
      console.log(
        "[OwnProfilePostsSection] Using cached created posts (stale-while-revalidate):",
        cachedCreated.length
      );
      setCreated(cachedCreated as any);
      // [OPTIMIZATION: Phase 6 - Connection] Prioritize critical content on slow connections
      // Why: Load first post images immediately, defer later posts
      (async () => {
        const { isSlowConnection } = await import("../../lib/connectionAware");
        const isSlow = isSlowConnection();
        // On slow connections, only preload first post (critical)
        // On fast connections, preload all cached posts
        const postsToPreload = isSlow
          ? cachedCreated.slice(0, 1)
          : cachedCreated;
        preloadProfilePostImages(postsToPreload as any);
      })();
      setLoading(false); // Show cached data immediately
    } else {
      setLoading(true); // Show skeletons while fetching
    }

    // Load saved posts from cache SYNCHRONOUSLY (instant)
    if (currentUserId) {
      const cachedSaved = getCachedSavedPosts(currentUserId);
      if (cachedSaved && cachedSaved.length > 0) {
        console.log(
          "[OwnProfilePostsSection] Using cached saved posts (stale-while-revalidate):",
          cachedSaved.length
        );
        setSaved(cachedSaved);
        setSavedLoading(false);
      }
    }

    // Load interacted posts cache using user_id
    const cachedInteracted = getCachedProfilePosts(userId, "interacted");
    if (cachedInteracted && cachedInteracted.length > 0) {
      console.log(
        "[OwnProfilePostsSection] Using cached interacted posts (stale-while-revalidate):",
        cachedInteracted.length
      );
      setLiked(cachedInteracted as any);
      setLikedLoading(false); // Show cached data immediately
    }
  }, [userId, currentUserId]);

  // Infinite scroll handler
  const handleScroll = () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    // Load more when 200px from bottom
    if (documentHeight - (scrollTop + windowHeight) < 200) {
      if (tab === "created" && hasMoreCreated && !loading) {
        setCreatedPage((prev) => prev + 1);
      }
    }
  };

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [tab, hasMoreCreated, loading]);

  // Load created posts - STALE-WHILE-REVALIDATE pattern
  useEffect(() => {
    if (!userId || tab !== "created") {
      createdRequestRef.current?.abort();
      cancelContextRequests(`profile-${userId}-created`);
      return;
    }

    // Cancel other tab requests when switching to created
    likedRequestRef.current?.abort();
    savedRequestRef.current?.abort();
    cancelContextRequests(`profile-${userId}-liked`);
    cancelContextRequests(`profile-${userId}-saved`);

    const loadCreatedPosts = async () => {
      try {
        const abortController = new AbortController();
        createdRequestRef.current = abortController;

        console.log(
          "[OwnProfilePostsSection] Fetching fresh created posts (background):",
          {
            userId,
            tab,
            page: createdPage,
          }
        );

        // Fetch posts with pagination (10 at a time)
        const POSTS_PER_PAGE = 10;
        const from = createdPage * POSTS_PER_PAGE;

        // Fetch fresh posts in background (stale-while-revalidate)
        const result = await requestManager.execute(
          `profile-${userId}-created-${createdPage}`,
          async (signal: AbortSignal) => {
            const res = await getUserPostsCreated(
              userId,
              from,
              POSTS_PER_PAGE,
              true, // includeDrafts
              true // isOwner
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
            setHasMoreCreated(false);
          }
          return;
        }

        // Data from getUserPostsCreated already includes database drafts (only on first page)
        const localStorageDrafts =
          createdPage === 0 ? getDraftsFromStorage() : [];
        const postsData = result.data?.data || [];
        const newPosts = [...localStorageDrafts, ...postsData];

        if (!abortController.signal.aborted) {
          // Update cache with fresh data (only first 5)
          if (createdPage === 0) {
            setCachedProfilePosts(userId, "created", newPosts.slice(0, 5));
            // [OPTIMIZATION: Phase 6 - Connection] Prioritize critical content on slow connections
            // Why: Load first post images immediately, defer later posts
            (async () => {
              const { isSlowConnection } = await import(
                "../../lib/connectionAware"
              );
              const isSlow = isSlowConnection();
              // On slow connections, only preload first post (critical)
              // On fast connections, preload first 5 posts
              const postsToPreload = isSlow
                ? newPosts.slice(0, 1)
                : newPosts.slice(0, 5);
              preloadProfilePostImages(postsToPreload as any);
            })();
          }

          // Update state
          if (createdPage === 0) {
            setCreated(newPosts as any);
          } else {
            setCreated((prev) => [...prev, ...newPosts] as any);
          }

          setHasMoreCreated(postsData.length === POSTS_PER_PAGE);
          setLoading(false);
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("Error loading created posts:", error);
          setLoading(false);
          setHasMoreCreated(false);
        }
      }
    };

    loadCreatedPosts();
  }, [userId, tab, createdPage]);

  // Load saved posts - STALE-WHILE-REVALIDATE pattern
  useEffect(() => {
    if (!userId || tab !== "saved") {
      savedRequestRef.current?.abort();
      cancelContextRequests(`profile-${userId}-saved`);
      return;
    }

    // Cancel other tab requests when switching to saved
    createdRequestRef.current?.abort();
    likedRequestRef.current?.abort();
    cancelContextRequests(`profile-${userId}-created`);
    cancelContextRequests(`profile-${userId}-liked`);

    // Check cache synchronously first (already done in initial load, but refresh if needed)
    if (currentUserId) {
      const cachedSaved = getCachedSavedPosts(currentUserId);
      if (cachedSaved && cachedSaved.length > 0 && saved.length === 0) {
        setSaved(cachedSaved);
        setSavedLoading(false);
      }
    }

    // Fetch fresh data in background (stale-while-revalidate)
    const loadSavedPosts = async () => {
      if (!currentUserId) {
        setSavedLoading(false);
        return;
      }

      setSavedLoading(true);
      try {
        const abortController = new AbortController();
        savedRequestRef.current = abortController;

        const result = await requestManager.execute(
          `profile-${userId}-saved`,
          async (signal: AbortSignal) => {
            const res = await getSavedPosts();
            if (signal.aborted) throw new Error("Aborted");
            return res;
          },
          "high"
        );

        if (abortController.signal.aborted) return;

        if (result.error) {
          console.error("Error loading saved posts:", result.error);
          if (saved.length === 0) {
            setSaved([]);
          }
        } else {
          const freshSaved = result.data?.data || [];
          setSaved(freshSaved);
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("Error loading saved posts:", error);
          if (saved.length === 0) {
            setSaved([]);
          }
        }
      } finally {
        if (!savedRequestRef.current?.signal.aborted) {
          setSavedLoading(false);
        }
      }
    };

    loadSavedPosts();
  }, [userId, tab, currentUserId, saved.length]);

  // Listen for invite accepted events to refresh interacted posts
  useEffect(() => {
    const handleInviteAccepted = () => {
      // If we're on the interacted tab, refresh the posts
      if (tab === "interacted" && userId) {
        // Clear cache and force reload
        clearCachedProfilePosts(userId, "interacted");
        // Cancel current request
        likedRequestRef.current?.abort();
        cancelContextRequests(`profile-${userId}-liked`);
        // Clear current data and reload
        setLiked([]);
        setLikedLoading(true);

        // Force reload by fetching fresh data
        (async () => {
          try {
            const result = await requestManager.execute(
              `profile-${userId}-liked-refresh`,
              async (signal: AbortSignal) => {
                const res = await getLikedPostsWithDetails();
                if (signal.aborted) throw new Error("Aborted");
                return res;
              },
              "high"
            );

            if (result.error) {
              console.error("Error refreshing liked posts:", result.error);
            } else {
              const freshLiked = result.data?.data || [];
              setLiked(freshLiked);
              // Update cache (only first 5)
              setCachedProfilePosts(
                userId,
                "interacted",
                freshLiked.slice(0, 5)
              );
            }
          } catch (error: any) {
            if (error.name !== "AbortError") {
              console.error("Error refreshing liked posts:", error);
            }
          } finally {
            setLikedLoading(false);
          }
        })();
      }
    };

    window.addEventListener("invite:accepted", handleInviteAccepted);
    return () => {
      window.removeEventListener("invite:accepted", handleInviteAccepted);
    };
  }, [tab, userId]);

  // Load interacted (liked) posts - STALE-WHILE-REVALIDATE pattern
  useEffect(() => {
    if (!userId || tab !== "interacted") {
      likedRequestRef.current?.abort();
      cancelContextRequests(`profile-${userId}-liked`);
      return;
    }

    // Cancel other tab requests when switching to interacted
    createdRequestRef.current?.abort();
    savedRequestRef.current?.abort();
    cancelContextRequests(`profile-${userId}-created`);
    cancelContextRequests(`profile-${userId}-saved`);

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

        const result = await requestManager.execute(
          `profile-${userId}-liked`,
          async (signal: AbortSignal) => {
            const res = await getLikedPostsWithDetails();
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
          const freshLiked = result.data?.data || [];
          setLiked(freshLiked);
          // Update cache (only first 5)
          setCachedProfilePosts(userId, "interacted", freshLiked.slice(0, 5));
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
  }, [userId, tab, liked.length]);

  const handlePostDelete = async (postId: string) => {
    try {
      await supabase.from("posts").delete().eq("id", postId);
      setCreated((prev) => prev.filter((p) => p.id !== postId));
      // Clear cache for created posts
      clearCachedProfilePosts(userId, "created");
      toast.success("Post deleted successfully");
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Failed to delete post");
    }
  };

  // Theme-aware tab styling
  const base =
    "px-2 py-1 rounded-full text-xs border transition-all duration-200 flex items-center justify-center";
  const active = "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]";
  const inactive =
    "bg-transparent text-[var(--text)]/80 border-[var(--border)] hover:border-[var(--text)]/40";

  return (
    <section className="w-full max-w-[640px] mx-auto px-3">
      {/* Tab Navigation - Always visible (static) */}
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

      {/* Content - Only this section shows loading skeletons */}
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
                You haven't posted yet.
              </div>
            )}

            {/* POSTS LIST - Prepped for lazy loading (implementation later) */}
            {!loading && created.length > 0 && (
              <LazyList
                items={created}
                renderItem={(p: any) => (
                  <div key={p.id}>
                    <ProgressivePost
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
                      isOwner={true}
                      onDelete={() => handlePostDelete(p.id)}
                      status={p.status || "published"}
                      isDraft={p.isDraft || false}
                      isAnonymous={p.is_anonymous || false}
                      anonymousName={p.anonymous_name || null}
                      anonymousAvatar={p.anonymous_avatar || null}
                      selectedDates={p.selected_dates || null}
                    />
                  </div>
                )}
                bufferBefore={0}
                bufferAfter={1}
                rootMargin="100px"
                loadingComponent={<PostSkeleton />}
                enabled={true}
                className="flex flex-col -mt-1"
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

        {tab === "saved" && (
          <>
            {savedLoading && saved.length === 0 && (
              <div className="flex flex-col gap-2">
                {[...Array(3)].map((_, i) => (
                  <PostSkeleton key={i} />
                ))}
              </div>
            )}

            {!savedLoading && saved.length === 0 && (
              <div className="text-center text-sm text-[var(--text)]/70 py-10">
                No saved posts yet.
              </div>
            )}

            {/* SAVED POSTS LIST - Prepped for lazy loading (implementation later) */}
            {saved.length > 0 && (
              <LazyList
                items={saved}
                renderItem={(s: SavedPostWithDetails) => (
                  <ProgressivePost
                    key={s.posts.id}
                    postId={s.posts.id}
                    caption={s.posts.caption}
                    createdAt={s.posts.created_at}
                    authorId={s.posts.author_id}
                    author={{
                      id: s.posts.author_id,
                      username: (s.posts as any).profiles?.username || null,
                      display_name:
                        (s.posts as any).profiles?.display_name || null,
                      avatar_url: (s.posts as any).profiles?.avatar_url || null,
                    }}
                    type={s.posts.type}
                    isOwner={false}
                    status="published"
                    isAnonymous={s.posts.is_anonymous || false}
                    anonymousName={(s.posts as any).anonymous_name}
                    anonymousAvatar={(s.posts as any).anonymous_avatar}
                  />
                )}
                bufferBefore={0}
                bufferAfter={1}
                rootMargin="100px"
                loadingComponent={<PostSkeleton />}
                enabled={!savedLoading}
                className="flex flex-col gap-2"
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
