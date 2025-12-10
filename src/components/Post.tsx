// PERF: Optimized post component with image optimization
import { FaCommentDots } from "react-icons/fa";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Paths } from "../router/Paths";
import { supabase } from "../lib/supabaseClient";
import MediaCarousel from "./MediaCarousel";
import Avatar from "./ui/Avatar";
import PostMenu from "./ui/PostMenu";
import InviteDrawer from "./ui/InviteDrawer";
import PostActions from "./ui/PostActions";
import { getPostForEdit } from "../api/services/posts";
import toast from "react-hot-toast";

import { imgUrlPublic } from "../lib/img";
import { prefetchProfile } from "../lib/prefetch";
import { getBestImageUrl, preloadImages } from "../lib/imageOptimization";

type PostProps = {
  postId: string;
  caption: string | null;
  createdAt: string;
  type?: "experience" | "hangout"; // NEW: post type for navigation
  isOwner?: boolean; // NEW: whether this is the current user's own post
  onDelete?: () => void; // NEW: callback when post is deleted
  status?: "draft" | "published"; // NEW: post status for visual indicators
  isDraft?: boolean; // NEW: whether this is a draft from localStorage
  isAnonymous?: boolean; // NEW: whether the author is anonymous
  anonymousName?: string | null; // NEW: anonymous name for anonymous posts
  anonymousAvatar?: string | null; // NEW: anonymous avatar for anonymous posts
  selectedDates?: string[] | null; // NEW: event dates for hangouts

  authorId: string; // profile id (for FollowButton)
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export default function Post({
  postId,
  caption,
  authorId,
  author,
  createdAt,
  type = "experience", // Default to experience for backward compatibility
  isOwner = false, // Default to false for backward compatibility
  onDelete,
  status = "published", // Default to published for backward compatibility
  isDraft = false, // Default to false for backward compatibility
  isAnonymous = false, // Default to false for backward compatibility
  anonymousName = null, // Default to null for backward compatibility
  anonymousAvatar = null, // Default to null for backward compatibility
  selectedDates = null, // Default to null for backward compatibility
}: PostProps) {
  const navigate = useNavigate();

  const displayName =
    isAnonymous && anonymousName
      ? anonymousName
      : author?.display_name || author?.username || "User";

  // Date display logic: show event date for hangouts, created date for experiences
  const getDisplayDate = () => {
    if (type === "hangout" && selectedDates && selectedDates.length > 0) {
      // For hangouts, show the event date(s) with special formatting
      const eventDate = new Date(selectedDates[0]);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const eventDay = new Date(
        eventDate.getFullYear(),
        eventDate.getMonth(),
        eventDate.getDate()
      );

      // Check if the event has already passed
      if (eventDay.getTime() < today.getTime()) {
        return "Event Passed";
      }

      // Format relative dates for hangouts
      if (eventDay.getTime() === today.getTime()) {
        return "Today";
      } else if (eventDay.getTime() === tomorrow.getTime()) {
        return "Tomorrow";
      } else {
        // Check if it's this weekend
        const eventDayOfWeek = eventDate.getDay(); // 0 = Sunday, 6 = Saturday
        const todayOfWeek = now.getDay();
        const daysUntilWeekend = 6 - todayOfWeek; // Days until Saturday
        const eventDayTime = eventDate.getTime();
        const weekendStart = new Date(
          today.getTime() + daysUntilWeekend * 24 * 60 * 60 * 1000
        );
        const weekendEnd = new Date(
          weekendStart.getTime() + 24 * 60 * 60 * 1000
        );

        if (
          eventDayTime >= weekendStart.getTime() &&
          eventDayTime <= weekendEnd.getTime()
        ) {
          return "This Weekend";
        }

        // Default to formatted date for hangouts
        return eventDate.toLocaleDateString();
      }
    } else {
      // For experiences or hangouts without event dates, show created date (no special formatting)
      const createdDate = new Date(createdAt);
      return createdDate.toLocaleDateString();
    }
  };

  // Check if the date should be highlighted (only for hangouts with special dates)
  const isSpecialDate = (dateText: string) => {
    // Only highlight special dates for hangouts, not for experiences
    if (type !== "hangout") return false;

    return (
      dateText === "Today" ||
      dateText === "Tomorrow" ||
      dateText === "This Weekend" ||
      dateText === "Event Passed"
    );
  };

  const goToProfile = () => {
    if (!authorId) return;
    const slug = author?.username || authorId;
    // avoids relying on a Paths helper that may differ across files
    navigate(`/u/${slug}`);
  };

  // lazy-load FIRST activity's images
  const [images, setImages] = useState<string[] | null>(null); // null: unknown; []: none
  const [imagesLoading, setImagesLoading] = useState(false);
  const [tried, setTried] = useState(false);

  const goToDetails = () => {
    // Don't navigate if invite drawer is closing
    if (isInviteDrawerClosing) {
      console.log("Navigation prevented: invite drawer is closing");
      return;
    }

    console.log("Navigating to post details:", postId);
    const detailPath =
      type === "hangout"
        ? Paths.hangoutDetail.replace(":id", postId)
        : Paths.experienceDetail.replace(":id", postId);
    navigate(detailPath);
  };

  const handleEdit = async () => {
    try {
      const { post, activities } = await getPostForEdit(postId);

      // Store the current location so we can return to it after edit/cancel
      const returnPath = window.location.pathname;

      // Store the post data in localStorage for the edit flow
      const editData = {
        postId: post.id,
        type: post.type,
        caption: post.caption,
        visibility: post.visibility,
        is_anonymous: post.is_anonymous,
        rsvp_capacity: post.rsvp_capacity,
        selected_dates: post.selected_dates,
        is_recurring: post.is_recurring,
        recurrence_days: post.recurrence_days,
        tags: post.tags,
        returnPath: returnPath, // Store where we came from
        activities: activities.map((activity) => ({
          id: activity.id,
          title: activity.title,
          activityType: activity.activity_type || "",
          customActivity: activity.custom_activity || "",
          locationDesc: activity.location_desc || "",
          location: activity.location_name || "",
          locationNotes: activity.location_notes || "",
          locationUrl: activity.location_url || "",
          additionalInfo: activity.additional_info || [],
          tags: activity.tags || [],
          images: activity.images || [],
          order_idx: activity.order_idx,
        })),
      };

      localStorage.setItem("editPostData", JSON.stringify(editData));

      // Navigate to the activities page (first step of edit flow)
      navigate(Paths.createActivities);
    } catch (error) {
      console.error("Error loading post for edit:", error);
      toast.error("Failed to load post for editing");
    }
  };

  // Fetch only when near viewport
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!rootRef.current || tried) return;
    const node = rootRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setTried(true);
          (async () => {
            try {
              const { data } = await supabase
                .from("activities")
                .select("images, order_idx")
                .eq("post_id", postId)
                .order("order_idx", { ascending: true })
                .limit(1)
                .maybeSingle();
              const arr = (data?.images ?? []).filter(Boolean) as string[];

              // Only set loading state if there are actually images to load
              if (arr.length > 0) {
                setImagesLoading(true);

                // Use optimized URLs for better performance
                const safeArr = arr.map((url) => {
                  const publicUrl = imgUrlPublic(url) || url;
                  return getBestImageUrl(publicUrl, 400); // 400px viewport width for feed
                });
                setImages(safeArr);

                // Preload images for better UX
                preloadImages(safeArr).catch(() => {
                  // Silent fail for preloading
                });
              } else {
                // No images, set empty array and no loading state
                setImages([]);
              }
            } finally {
              setImagesLoading(false);
            }
          })();
          obs.disconnect();
        }
      },
      { root: null, rootMargin: "200px 0px", threshold: 0.01 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [postId, tried]);

  const isDraftPost = status === "draft" || isDraft;
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);

  const handleInvite = () => {
    setShowInviteDrawer(true);
  };

  // Get display date and check if it should be highlighted
  const dateText = getDisplayDate();
  const shouldHighlight = isSpecialDate(dateText);

  return (
    <article
      ref={rootRef}
      className={`w-full border-t border-[var(--border)] px-0 py-3 ${
        isDraftPost ? "opacity-60" : ""
      }`}
    >
      <div className="flex gap-3">
        {/* LEFT: avatar column */}
        {/* LEFT: avatar column */}
        <div className="pt-1">
          <div
            role="button"
            onClick={isAnonymous ? undefined : goToProfile}
            onMouseEnter={() =>
              !isAnonymous &&
              author?.username &&
              prefetchProfile(author.username)
            }
            onTouchStart={() =>
              !isAnonymous &&
              author?.username &&
              prefetchProfile(author.username)
            }
          >
            <Avatar
              url={isAnonymous ? undefined : author?.avatar_url || undefined}
              name={displayName}
              size={40}
              postType={type}
              variant={isAnonymous ? "anon" : "default"}
              anonymousAvatar={isAnonymous ? anonymousAvatar : undefined}
            />
          </div>
        </div>

        {/* RIGHT: content column — everything on one vertical rail */}
        <div className="flex-1 min-w-0 relative">
          {/* header: name · date + draft badge + follow */}
          <div className="flex items-center gap-2">
            <button
              className="text-xs font-medium hover:underline"
              onClick={isAnonymous ? undefined : goToProfile}
              onMouseEnter={() =>
                !isAnonymous &&
                author?.username &&
                prefetchProfile(author.username)
              }
              onTouchStart={() =>
                !isAnonymous &&
                author?.username &&
                prefetchProfile(author.username)
              }
            >
              {displayName}
            </button>
            <span
              className={`text-[10px] ${
                shouldHighlight
                  ? "px-2 py-0.5 rounded-md font-medium"
                  : "text-[var(--text)]/60"
              }`}
              style={
                shouldHighlight
                  ? {
                      backgroundColor: "var(--date-highlight-bg)",
                      color: "var(--date-highlight-text)",
                    }
                  : {}
              }
            >
              · {dateText}
            </span>
            {isDraftPost && (
              <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-600 rounded-full border border-yellow-500/30">
                Draft
              </span>
            )}
          </div>

          {/* Three dots menu for owner's posts - positioned absolutely */}
          {isOwner && (
            <div className="absolute top-0 right-0">
              <PostMenu
                postId={postId}
                onEdit={handleEdit}
                onDelete={onDelete}
                onInvite={handleInvite}
                isDraft={isDraftPost}
              />
            </div>
          )}

          {/* caption */}
          {caption && (
            <p
              className="mt-2 text-[13px] leading-snug text-[var(--text)]/90"
              onClick={goToDetails}
              role="button"
            >
              {caption}
            </p>
          )}

          {/* Continue Editing button for drafts */}
          {isDraftPost && isOwner && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // Navigate to continue editing the draft
                window.location.href = `/create/activities?type=${type}`;
              }}
              className="mt-3 px-3 py-1.5 text-xs bg-yellow-500 text-black rounded-full hover:brightness-110 transition"
            >
              Continue Editing
            </button>
          )}

          {/* media row — show placeholder only while loading, nothing if no images */}
          {imagesLoading && (
            <div className="mt-3 rounded-2xl border border-[var(--border)] overflow-hidden">
              <div className="w-full aspect-video bg-[var(--text)]/5 animate-pulse" />
            </div>
          )}
          {!imagesLoading && images && images.length > 0 && (
            <div className="mt-3" role="button" onClick={goToDetails}>
              <MediaCarousel images={images} maxHeight="44vh" />
            </div>
          )}

          {/* actions row */}
          <div className="mt-4 text-[var(--text)]/85">
            <PostActions
              postId={postId}
              authorId={authorId}
              postType={type}
              caption={caption}
              postImageUrl={images && images.length > 0 ? images[0] : null}
              postAuthor={
                author
                  ? {
                      id: authorId,
                      username: author.username,
                      display_name: author.display_name,
                      avatar_url: author.avatar_url,
                      is_anonymous: isAnonymous,
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>

      {/* Invite Drawer */}
      <InviteDrawer
        isOpen={showInviteDrawer}
        onClose={() => setShowInviteDrawer(false)}
        postId={postId}
        postType={type}
        postCaption={caption || "Untitled"}
        onClosingChange={setIsInviteDrawerClosing}
      />
    </article>
  );
}
