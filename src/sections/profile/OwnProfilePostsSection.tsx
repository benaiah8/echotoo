import { useEffect, useState, useMemo, useRef, useTransition } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { useProfile } from "../../contexts/ProfileContext";
import { selectUserId } from "../../selectors/authSelectors";
import { RootState } from "../../app/store";
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
 * ProfilePostsSection for OWN profile - always cached, includes Saved tab
 */
export default function OwnProfilePostsSection() {
  const { profile } = useProfile();
  const location = useLocation();
  const [tab, setTab] = useState<
    "created" | "interacted" | "bookmarked" | "saved"
  >("created");

  // React 19: useTransition for non-urgent tab switching
  const [isPending, startTransition] = useTransition();

  // Get current user ID immediately from Redux for ownership comparison
  // Using memoized selector to prevent unnecessary re-renders
  const currentUserId = useSelector(selectUserId);

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
  const [bookmarked, setBookmarked] = useState<LikedPostWithDetails[]>([]); // Duplicate of liked for now

  const [loading, setLoading] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const [likedLoading, setLikedLoading] = useState(false);
  const [bookmarkedLoading, setBookmarkedLoading] = useState(false);

  // Pagination state
  const [createdPage, setCreatedPage] = useState(0);
  const [hasMoreCreated, setHasMoreCreated] = useState(true);

  // Refs to track abort controllers for cancellation
  const createdRequestRef = useRef<AbortController | null>(null);
  const likedRequestRef = useRef<AbortController | null>(null);
  const savedRequestRef = useRef<AbortController | null>(null);

  // Cleanup when profile changes to prevent data overlap
  useEffect(() => {
    // Cancel all requests when profile changes
    cancelContextRequests(`profile-${profile?.id}`);
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
      cancelContextRequests(`profile-${profile?.id}`);
    };
  }, [profile?.id]);

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

  const getDraftsFromStorage = () => {
    try {
      // Get draft data from localStorage (for unsaved local drafts)
      const draftMeta = localStorage.getItem("draftMeta");
      const draftActivities = localStorage.getItem("draftActivities");

      // Check if we have any draft data
      const hasMeta =
        draftMeta && draftMeta !== "{}" && draftMeta.trim() !== "";
      const hasActivities =
        draftActivities &&
        draftActivities !== "[]" &&
        draftActivities.trim() !== "";

      if (hasMeta || hasActivities) {
        const meta = hasMeta ? JSON.parse(draftMeta) : {};
        const activities = hasActivities ? JSON.parse(draftActivities) : [];

        // Create a mock draft post object
        const draftPost = {
          id: "draft-" + Date.now(), // Temporary ID for draft
          caption: meta.caption || "Untitled draft",
          created_at: new Date().toISOString(),
          type: "experience", // Default type
          status: "draft",
          activities: activities || [],
          meta: meta,
          isDraft: true, // Flag to identify as draft
        };

        return [draftPost];
      }
      return [];
    } catch (error) {
      console.error("Failed to load drafts:", error);
      return [];
    }
  };

  // Load cached data immediately for own profile
  useEffect(() => {
    if (profile?.id) {
      // Load created posts cache
      const cachedData = getCachedProfilePosts(profile.id, "created");
      if (cachedData && cachedData.length > 0) {
        console.log(
          "[OwnProfilePostsSection] Using cached created posts:",
          cachedData.length
        );
        setCreated(cachedData as any);
        preloadProfilePostImages(cachedData as any);
      } else {
        setLoading(true);
      }

      // Load saved posts from cache SYNCHRONOUSLY (instant, no async delay)
      const currentUserId = localStorage.getItem("my_user_id");
      if (currentUserId) {
        const cachedSaved = getCachedSavedPosts(currentUserId);
        if (cachedSaved && cachedSaved.length > 0) {
          console.log(
            "[OwnProfilePostsSection] Loaded saved posts from cache INSTANTLY:",
            cachedSaved.length
          );
          setSaved(cachedSaved);
          setSavedLoading(false);
        } else {
          // No cache, but don't show loading if we're not on saved tab
          if (tab !== "saved") {
            setSavedLoading(false);
          }
        }
      }

      // Also fetch fresh data in background (but don't block UI)
      const loadSavedPostsBackground = async () => {
        try {
          const { data: savedPosts } = await getSavedPosts();
          if (savedPosts) {
            setSaved(savedPosts);
            setSavedLoading(false);
          }
        } catch (error) {
          console.error("Error loading saved posts:", error);
          setSavedLoading(false);
        }
      };
      // Load in background without blocking
      loadSavedPostsBackground();

      // Preload interacted (liked) posts in background - LOW priority (only if not on interacted tab)
      if (tab !== "interacted") {
        const loadLikedPostsBackground = async () => {
          try {
            const abortController = new AbortController();
            likedRequestRef.current = abortController;

            // Delay to not block initial render
            await new Promise((resolve) => setTimeout(resolve, 500));

            if (abortController.signal.aborted) return;

            const result = await requestManager.execute(
              `profile-${profile.id}-liked-preload`,
              async (signal: AbortSignal) => {
                const res = await getLikedPostsWithDetails();
                if (signal.aborted) throw new Error("Aborted");
                return res;
              },
              "low" // Low priority for background preload
            );

            if (result.error) {
              console.error("Error preloading liked posts:", result.error);
            } else if (!abortController.signal.aborted && result.data) {
              const likedPosts = result.data.data || [];
              setLiked(likedPosts);
              console.log(
                "[OwnProfilePostsSection] Preloaded liked posts in background:",
                likedPosts.length
              );
            }
          } catch (error: any) {
            if (error.name !== "AbortError") {
              console.error("Error preloading liked posts:", error);
            }
          }
        };

        loadLikedPostsBackground();
      }

      // Preload saved posts in background - LOW priority (only if not on saved tab)
      if (tab !== "saved") {
        const loadSavedPostsBackground = async () => {
          try {
            // Check cache first (instant)
            const currentUserId = localStorage.getItem("my_user_id");
            if (currentUserId) {
              const cachedSaved = getCachedSavedPosts(currentUserId);
              if (cachedSaved && cachedSaved.length > 0) {
                setSaved(cachedSaved);
                console.log(
                  "[OwnProfilePostsSection] Preloaded saved posts from cache:",
                  cachedSaved.length
                );
                return;
              }
            }

            // Delay to not block initial render
            await new Promise((resolve) => setTimeout(resolve, 800));

            const abortController = new AbortController();
            savedRequestRef.current = abortController;

            if (abortController.signal.aborted) return;

            const result = await requestManager.execute(
              `profile-${profile.id}-saved-preload`,
              async (signal: AbortSignal) => {
                const res = await getSavedPosts();
                if (signal.aborted) throw new Error("Aborted");
                return res;
              },
              "low" // Low priority for background preload
            );

            if (result.error) {
              console.error("Error preloading saved posts:", result.error);
            } else if (!abortController.signal.aborted && result.data) {
              const savedPosts = result.data.data || [];
              setSaved(savedPosts);
              console.log(
                "[OwnProfilePostsSection] Preloaded saved posts in background:",
                savedPosts.length
              );
            }
          } catch (error: any) {
            if (error.name !== "AbortError") {
              console.error("Error preloading saved posts:", error);
            }
          }
        };

        loadSavedPostsBackground();
      }
    }
  }, [profile?.id]);

  // Load created posts for own profile - HIGH priority when tab is active
  useEffect(() => {
    if (!profile?.id || tab !== "created") {
      // Cancel created posts request if switching away
      createdRequestRef.current?.abort();
      cancelContextRequests(`profile-${profile?.id}-created`);
      return;
    }

    // Cancel other tab requests when switching to created
    if (tab === "created") {
      likedRequestRef.current?.abort();
      savedRequestRef.current?.abort();
      cancelContextRequests(`profile-${profile.id}-liked`);
      cancelContextRequests(`profile-${profile.id}-saved`);
    }

    const loadCreatedPosts = async () => {
      try {
        const abortController = new AbortController();
        createdRequestRef.current = abortController;

        console.log(
          "[OwnProfilePostsSection] Loading created posts (HIGH priority):",
          {
            profileId: profile.id,
            profileUserId: profile.user_id,
            tab,
            page: createdPage,
          }
        );

        // Fetch posts with pagination (10 at a time)
        const POSTS_PER_PAGE = 10;
        const from = createdPage * POSTS_PER_PAGE;

        // Fetch fresh posts with HIGH priority
        const result = await requestManager.execute(
          `profile-${profile.id}-created-${createdPage}`,
          async (signal: AbortSignal) => {
            const res = await getUserPostsCreated(
              profile.user_id,
              from,
              POSTS_PER_PAGE,
              true, // includeDrafts
              true // isOwner
            );
            if (signal.aborted) throw new Error("Aborted");
            return res;
          },
          "high" // HIGH priority for active tab
        );

        if (abortController.signal.aborted) return;

        console.log("[OwnProfilePostsSection] Fresh posts result:", {
          dataLength: result.data?.data?.length,
          error: result.error,
          page: createdPage,
        });

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

        // Only update state if not aborted
        if (!abortController.signal.aborted) {
          if (createdPage === 0) {
            // First page: replace all
            setCreated(newPosts as any);
            // Update cache
            updateProfilePostsCache(profile.id, "created", newPosts);
            // No progressive loading needed - LazyList handles it
          } else {
            // Subsequent pages: append
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
  }, [profile?.id, tab, createdPage]);

  // Load saved posts - HIGH priority when tab is active, instant from cache
  useEffect(() => {
    if (!profile?.id || tab !== "saved") {
      // Cancel saved posts request if switching away
      savedRequestRef.current?.abort();
      cancelContextRequests(`profile-${profile?.id}-saved`);
      return;
    }

    // Cancel other tab requests when switching to saved
    if (tab === "saved") {
      createdRequestRef.current?.abort();
      likedRequestRef.current?.abort();
      cancelContextRequests(`profile-${profile.id}-created`);
      cancelContextRequests(`profile-${profile.id}-liked`);
      cancelContextRequests(`profile-${profile.id}-bookmarked`);
    }

    // Check cache synchronously first (instant)
    const currentUserId = localStorage.getItem("my_user_id");
    if (currentUserId) {
      const cachedSaved = getCachedSavedPosts(currentUserId);
      if (cachedSaved && cachedSaved.length > 0) {
        console.log(
          "[OwnProfilePostsSection] Using cached saved posts INSTANTLY:",
          cachedSaved.length
        );
        setSaved(cachedSaved);
        setSavedLoading(false);
        // Still fetch fresh data in background
        requestManager
          .execute(
            `profile-${profile.id}-saved-refresh`,
            async (signal: AbortSignal) => {
              const res = await getSavedPosts();
              if (signal.aborted) throw new Error("Aborted");
              return res;
            },
            "medium"
          )
          .then((result) => {
            if (result.data?.data) {
              setSaved(result.data.data);
            }
          })
          .catch(() => {});
        return;
      }
    }

    // Otherwise, load them with HIGH priority
    const loadSavedPosts = async () => {
      setSavedLoading(true);
      try {
        const abortController = new AbortController();
        savedRequestRef.current = abortController;

        const result = await requestManager.execute(
          `profile-${profile.id}-saved`,
          async (signal: AbortSignal) => {
            const res = await getSavedPosts();
            if (signal.aborted) throw new Error("Aborted");
            return res;
          },
          "high" // HIGH priority for active tab
        );

        if (abortController.signal.aborted) return;

        if (result.error) {
          console.error("Error loading saved posts:", result.error);
          setSaved([]);
        } else {
          setSaved(result.data?.data || []);
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("Error loading saved posts:", error);
          setSaved([]);
        }
      } finally {
        if (!savedRequestRef.current?.signal.aborted) {
          setSavedLoading(false);
        }
      }
    };

    loadSavedPosts();
  }, [profile?.id, tab]);

  // Load liked posts for own profile - HIGH priority when tab is active
  useEffect(() => {
    if (!profile?.id || tab !== "interacted") {
      // Cancel liked posts request if switching away
      likedRequestRef.current?.abort();
      cancelContextRequests(`profile-${profile?.id}-liked`);
      return;
    }

    // Cancel other tab requests when switching to interacted
    if (tab === "interacted") {
      createdRequestRef.current?.abort();
      savedRequestRef.current?.abort();
      cancelContextRequests(`profile-${profile.id}-created`);
      cancelContextRequests(`profile-${profile.id}-saved`);
    }

    // If we already have liked posts from background preload, use them instantly
    if (liked.length > 0) {
      setLikedLoading(false);
      // Still fetch fresh data in background with lower priority
      requestManager
        .execute(
          `profile-${profile.id}-liked-refresh`,
          async (signal: AbortSignal) => {
            const res = await getLikedPostsWithDetails();
            if (signal.aborted) throw new Error("Aborted");
            return res;
          },
          "medium" // Medium priority for background refresh
        )
        .then((result) => {
          if (result.data?.data) {
            setLiked(result.data.data);
          }
        })
        .catch(() => {
          // Ignore aborted errors
        });
      return;
    }

    // Otherwise, load them with HIGH priority
    const loadLikedPosts = async () => {
      setLikedLoading(true);
      try {
        const abortController = new AbortController();
        likedRequestRef.current = abortController;

        const result = await requestManager.execute(
          `profile-${profile.id}-liked`,
          async (signal: AbortSignal) => {
            const res = await getLikedPostsWithDetails();
            if (signal.aborted) throw new Error("Aborted");
            return res;
          },
          "high" // HIGH priority for active tab
        );

        if (abortController.signal.aborted) return;

        if (result.error) {
          console.error("Error loading liked posts:", result.error);
          setLiked([]);
        } else {
          setLiked(result.data?.data || []);
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          console.error("Error loading liked posts:", error);
          setLiked([]);
        }
      } finally {
        if (!likedRequestRef.current?.signal.aborted) {
          setLikedLoading(false);
        }
      }
    };

    loadLikedPosts();
  }, [profile?.id, tab]);

  // Load bookmarked posts - duplicate of interacted (not connected to anything yet)
  useEffect(() => {
    if (!profile?.id || tab !== "bookmarked") {
      // Cancel bookmarked posts request if switching away
      cancelContextRequests(`profile-${profile?.id}-bookmarked`);
      return;
    }

    // Cancel other tab requests when switching to bookmarked
    if (tab === "bookmarked") {
      createdRequestRef.current?.abort();
      likedRequestRef.current?.abort();
      savedRequestRef.current?.abort();
      cancelContextRequests(`profile-${profile.id}-created`);
      cancelContextRequests(`profile-${profile.id}-liked`);
      cancelContextRequests(`profile-${profile.id}-saved`);
    }

    const loadBookmarkedPosts = async () => {
      try {
        setBookmarkedLoading(true);
        // For now, just duplicate the liked posts logic
        // TODO: Connect to actual bookmarks API
        const result = await getLikedPostsWithDetails();
        if (result.error) {
          console.error("Error loading bookmarked posts:", result.error);
          setBookmarkedLoading(false);
          return;
        }
        setBookmarked(result.data || []);
        setBookmarkedLoading(false);
      } catch (error) {
        console.error("Error loading bookmarked posts:", error);
        setBookmarkedLoading(false);
      }
    };

    loadBookmarkedPosts();
  }, [profile?.id, tab]);

  const handlePostDelete = async (postId: string) => {
    try {
      await supabase.from("posts").delete().eq("id", postId);
      setCreated((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Post deleted successfully");
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Failed to delete post");
    }
  };

  // Theme-aware tab styling - FIXED: Same height for all tabs, active tab is smaller
  const base =
    "px-2 py-1 rounded-full text-xs border transition-all duration-200 flex items-center justify-center";
  const active = "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]";
  const inactive =
    "bg-transparent text-[var(--text)]/80 border-[var(--border)] hover:border-[var(--text)]/40";

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

      {/* Content */}
      <div className="py-4">
        {tab === "created" && (
          <>
            {loading && (
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

            {/* UNIFIED POSTS LIST - viewport lazy loading */}
            {!loading && created.length > 0 && (
              <LazyList
                items={created}
                renderItem={(p: any) => (
                  <div key={p.id}>
                    <ProgressivePost
                      postId={p.id}
                      caption={p.caption}
                      createdAt={p.created_at}
                      authorId={profile?.user_id || ""}
                      author={{
                        id: profile?.user_id || "",
                        username: profile?.username || null,
                        display_name: profile?.display_name || null,
                        avatar_url: profile?.avatar_url || null,
                      }}
                      type={p.type}
                      isOwner={true} // Always true for own profile
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
            {likedLoading && (
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

            {/* UNIFIED LIKED POSTS LIST - viewport lazy loading */}
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
                    isOwner={false} // Liked posts are not owned by the current user
                    status="published" // Liked posts are always published
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

        {tab === "bookmarked" && (
          <>
            {bookmarkedLoading && (
              <div className="flex flex-col gap-2">
                {[...Array(3)].map((_, i) => (
                  <PostSkeleton key={i} />
                ))}
              </div>
            )}

            {!bookmarkedLoading && bookmarked.length === 0 && (
              <div className="text-center text-sm text-[var(--text)]/70 py-10">
                No bookmarked posts yet.
              </div>
            )}

            {/* UNIFIED BOOKMARKED POSTS LIST - viewport lazy loading */}
            {bookmarked.length > 0 && (
              <LazyList
                items={bookmarked}
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
                    isOwner={false} // Bookmarked posts are not owned by the current user
                    status="published" // Bookmarked posts are always published
                    isAnonymous={l.posts.is_anonymous || false}
                    anonymousName={(l.posts as any).anonymous_name}
                    anonymousAvatar={(l.posts as any).anonymous_avatar}
                  />
                )}
                bufferBefore={0}
                bufferAfter={1}
                rootMargin="100px"
                loadingComponent={<PostSkeleton />}
                enabled={!bookmarkedLoading}
                className="flex flex-col gap-2"
              />
            )}
          </>
        )}

        {tab === "saved" && (
          <>
            {savedLoading && (
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

            {/* UNIFIED SAVED POSTS LIST - viewport lazy loading */}
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
                    isOwner={false} // Saved posts are not owned by the current user
                    status="published" // Saved posts are always published
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
