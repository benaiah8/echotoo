import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { useProfile } from "../../contexts/ProfileContext";
import { RootState } from "../../app/store";
import { getUserPostsCreated } from "../../api/queries/getUserPostsCreated";
import {
  getSavedPosts,
  SavedPostWithDetails,
} from "../../api/services/savedPosts";
import {
  getLikedPostsWithDetails,
  LikedPostWithDetails,
} from "../../api/services/likes";
import Post from "../../components/Post";
import ProgressivePost from "../../components/ProgressivePost";
import PostSkeleton from "../../components/skeletons/PostSkeleton";
import {
  getCachedProfilePosts,
  setCachedProfilePosts,
  updateProfilePostsCache,
  preloadProfilePostImages,
  clearCachedProfilePosts,
} from "../../lib/profilePostsCache";
import { supabase } from "../../lib/supabaseClient";
import toast from "react-hot-toast";

/**
 * ProfilePostsSection for OWN profile - always cached, includes Saved tab
 */
export default function OwnProfilePostsSection() {
  const { profile } = useProfile();
  const location = useLocation();
  const [tab, setTab] = useState<"created" | "interacted" | "saved">("created");

  // Get current user ID immediately from Redux for ownership comparison
  const authState = useSelector((state: RootState) => state.auth);
  const currentUserId = authState?.user?.id || null;

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

  const [loading, setLoading] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const [likedLoading, setLikedLoading] = useState(false);

  // Cleanup when profile changes to prevent data overlap
  useEffect(() => {
    // Clear state immediately when profile changes
    setCreated([]);
    setSaved([]);
    setLiked([]);
    setLoading(false);
    setSavedLoading(false);
    setLikedLoading(false);

    return () => {
      // Additional cleanup on unmount
      setCreated([]);
      setSaved([]);
      setLiked([]);
      setLoading(false);
      setSavedLoading(false);
      setLikedLoading(false);
    };
  }, [profile?.id]);

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

      // Preload saved posts for own profile (static/cached)
      const loadSavedPostsStatic = async () => {
        try {
          const { data: savedPosts, error } = await getSavedPosts();
          if (error) {
            console.error("Error preloading saved posts:", error);
            setSaved([]);
          } else {
            setSaved(savedPosts || []);
            console.log(
              "[OwnProfilePostsSection] Preloaded saved posts:",
              (savedPosts || []).length
            );
          }
        } catch (error) {
          console.error("Error preloading saved posts:", error);
          setSaved([]);
        }
      };
      loadSavedPostsStatic();

      // Preload interacted (liked) posts in background
      const loadLikedPostsBackground = async () => {
        try {
          const { data: likedPosts, error } = await getLikedPostsWithDetails();
          if (error) {
            console.error("Error preloading liked posts:", error);
          } else {
            setLiked(likedPosts || []);
            console.log(
              "[OwnProfilePostsSection] Preloaded liked posts in background:",
              (likedPosts || []).length
            );
          }
        } catch (error) {
          console.error("Error preloading liked posts:", error);
        }
      };
      // Load in background after a short delay to not block initial render
      setTimeout(loadLikedPostsBackground, 500);
    }
  }, [profile?.id]);

  // Load created posts for own profile - fetch in background to check for new posts
  useEffect(() => {
    if (!profile?.id || tab !== "created") return;

    const loadCreatedPosts = async () => {
      try {
        console.log(
          "[OwnProfilePostsSection] Checking for new created posts:",
          {
            profileId: profile.id,
            profileUserId: profile.user_id,
            tab,
          }
        );

        // Fetch fresh posts in background (don't block UI)
        const { data, error } = await getUserPostsCreated(
          profile.user_id, // Use user_id (auth user ID) instead of profile.id
          0,
          20, // Fetch more posts to catch any new ones
          true, // includeDrafts = true for own profile
          true // isOwner = true for own profile
        );

        console.log("[OwnProfilePostsSection] Fresh posts result:", {
          dataLength: data?.length,
          error,
        });

        if (error) {
          console.error("Error loading created posts:", error);
          setLoading(false);
          return;
        }

        // Data from getUserPostsCreated already includes database drafts (when includeDrafts=true)
        // Only add localStorage drafts if they exist (unsaved local drafts that haven't been saved to DB yet)
        const localStorageDrafts = getDraftsFromStorage();
        const allPosts = [...localStorageDrafts, ...(data || [])];

        // Update cache with fresh data - this will merge new posts with cached ones
        const updatedPosts = updateProfilePostsCache(
          profile.id,
          "created",
          allPosts
        );

        // Only update state if we got new posts (updateProfilePostsCache returns merged list)
        setCreated(updatedPosts as any);
        setLoading(false);
      } catch (error) {
        console.error("Error loading created posts:", error);
        setLoading(false);
      }
    };

    // Always fetch in background to check for new posts, but don't block cached content
    loadCreatedPosts();
  }, [profile?.id, tab]);

  // Saved posts are now preloaded statically - no dynamic loading needed

  // Load liked posts for own profile - use preloaded data if available
  useEffect(() => {
    if (!profile?.id || tab !== "interacted") return;

    // If we already have liked posts from background preload, use them
    if (liked.length > 0) {
      setLikedLoading(false);
      return;
    }

    // Otherwise, load them
    const loadLikedPosts = async () => {
      setLikedLoading(true);
      try {
        const { data: likedPosts, error } = await getLikedPostsWithDetails();
        if (error) {
          console.error("Error loading liked posts:", error);
          setLiked([]);
        } else {
          setLiked(likedPosts || []);
        }
      } catch (error) {
        console.error("Error loading liked posts:", error);
        setLiked([]);
      } finally {
        setLikedLoading(false);
      }
    };

    loadLikedPosts();
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
          className={`${base} ${tab === "created" ? active : inactive}`}
          onClick={() => setTab("created")}
        >
          Created
        </button>
        <button
          className={`${base} ${tab === "interacted" ? active : inactive}`}
          onClick={() => setTab("interacted")}
        >
          Interacted
        </button>
        <button
          className={`${base} ${tab === "saved" ? active : inactive}`}
          onClick={() => setTab("saved")}
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

            {/* UNIFIED POSTS LIST - show both hangouts and experiences as full-width posts with progressive loading */}
            {!loading && created.length > 0 && (
              <div className="flex flex-col -mt-1">
                {created.map((p: any, index: number) => (
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
                ))}
              </div>
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

            {/* UNIFIED LIKED POSTS LIST - show both hangouts and experiences as full-width posts with progressive loading */}
            {!likedLoading && liked.length > 0 && (
              <div className="flex flex-col gap-2">
                {liked.map((l) => (
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
                ))}
              </div>
            )}
          </>
        )}

        {tab === "saved" && (
          <>
            {/* Saved posts are preloaded - no loading state needed */}
            {saved.length === 0 && (
              <div className="text-center text-sm text-[var(--text)]/70 py-10">
                No saved posts yet.
              </div>
            )}

            {/* UNIFIED SAVED POSTS LIST - show both hangouts and experiences as full-width posts with progressive loading */}
            {saved.length > 0 && (
              <div className="flex flex-col gap-2">
                {saved.map((s) => (
                  <ProgressivePost
                    key={s.posts.id}
                    postId={s.posts.id}
                    caption={s.posts.caption}
                    createdAt={s.posts.created_at}
                    authorId={s.posts.author_id}
                    author={{
                      id: s.posts.author_id,
                      username: s.posts.profiles.username,
                      display_name: s.posts.profiles.display_name,
                      avatar_url: s.posts.profiles.avatar_url,
                    }}
                    type={s.posts.type}
                    isOwner={false} // Saved posts are not owned by the current user
                    status="published" // Saved posts are always published
                    isAnonymous={s.posts.is_anonymous || false}
                    anonymousName={(s.posts as any).anonymous_name}
                    anonymousAvatar={(s.posts as any).anonymous_avatar}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
