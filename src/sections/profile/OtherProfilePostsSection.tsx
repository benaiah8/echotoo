import { useEffect, useState } from "react";
import { useProfile } from "../../contexts/ProfileContext";
import { getUserPostsCreated } from "../../api/queries/getUserPostsCreated";
import {
  getLikedPostsWithDetails,
  getLikedPostsWithDetailsForUser,
  LikedPostWithDetails,
} from "../../api/services/likes";
import Post from "../../components/Post";
import ProgressivePost from "../../components/ProgressivePost";
import PostSkeleton from "../../components/skeletons/PostSkeleton";
import {
  getCachedProfilePosts,
  updateProfilePostsCache,
  preloadProfilePostImages,
} from "../../lib/profilePostsCache";

/**
 * ProfilePostsSection for OTHER profiles - no Saved tab, separate caching
 */
export default function OtherProfilePostsSection() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<"created" | "interacted">("created");

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

  // Cleanup when profile changes to prevent data overlap
  useEffect(() => {
    // Clear state immediately when profile changes
    setCreated([]);
    setLiked([]);
    setLoading(false);
    setLikedLoading(false);

    return () => {
      // Additional cleanup on unmount
      setCreated([]);
      setLiked([]);
      setLoading(false);
      setLikedLoading(false);
    };
  }, [profile?.id]);

  // Load cached data immediately for other profile
  useEffect(() => {
    if (profile?.id) {
      const cachedData = getCachedProfilePosts(profile.id, "created");
      if (cachedData && cachedData.length > 0) {
        console.log(
          "[OtherProfilePostsSection] Using cached created posts:",
          cachedData.length
        );
        setCreated(cachedData as any);
        preloadProfilePostImages(cachedData as any);
      } else {
        setLoading(true);
      }
    }
  }, [profile?.id]);

  // Load created posts for other profile - fetch in background to check for new posts
  useEffect(() => {
    if (!profile?.id || tab !== "created") return;

    const loadCreatedPosts = async () => {
      try {
        console.log(
          "[OtherProfilePostsSection] Checking for new created posts:",
          {
            profileId: profile.id,
            profileUserId: profile.user_id,
            tab,
          }
        );

        // Fetch fresh posts in background (don't block UI if we have cache)
        const { data, error } = await getUserPostsCreated(
          profile.user_id, // Use user_id (auth user ID) instead of profile.id
          0,
          20, // Fetch more posts to catch any new ones
          false, // includeDrafts = false for other profiles
          false // isOwner = false for other profiles
        );

        console.log("[OtherProfilePostsSection] Fresh posts result:", {
          dataLength: data?.length,
          error,
        });

        if (error) {
          console.error("Error loading created posts:", error);
          setLoading(false);
          return;
        }

        // Update cache with fresh data - this will merge new posts with cached ones
        const updatedPosts = updateProfilePostsCache(
          profile.id,
          "created",
          data || []
        );

        // Only update state if we got new posts (updateProfilePostsCache returns merged list)
        setCreated(updatedPosts as any);
        setLoading(false);
      } catch (error) {
        console.error("Error loading created posts:", error);
        setLoading(false);
      }
    };

    loadCreatedPosts();
  }, [profile?.id, tab]);

  // Load liked posts for other profile
  useEffect(() => {
    if (!profile?.id || tab !== "interacted") return;

    const loadLikedPosts = async () => {
      setLikedLoading(true);
      try {
        // For other profiles, get their liked posts using their user_id
        const { data: likedPosts, error } =
          await getLikedPostsWithDetailsForUser(profile.user_id);
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
        {/* No Saved tab for other profiles */}
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
                {profile?.display_name || profile?.username || "This user"}{" "}
                hasn't posted yet.
              </div>
            )}

            {/* UNIFIED POSTS LIST - show both hangouts and experiences as full-width posts with progressive loading */}
            {!loading && created.length > 0 && (
              <div className="flex flex-col gap-2">
                {created.map((p: any) => (
                  <ProgressivePost
                    key={p.id}
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
                    isOwner={false} // Always false for other profiles
                    onDelete={() => {}} // No delete for other profiles
                    status={p.status || "published"}
                    isDraft={false} // No drafts for other profiles
                    isAnonymous={p.is_anonymous || false}
                    anonymousName={p.anonymous_name || null}
                    anonymousAvatar={p.anonymous_avatar || null}
                    selectedDates={p.selected_dates || null}
                  />
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
      </div>
    </section>
  );
}
