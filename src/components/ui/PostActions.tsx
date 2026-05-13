import { PiChatCircleDots, PiShareFat } from "react-icons/pi";
import LikeButton from "./LikeButton";
import SaveButton from "./SaveButton";
import FollowButton from "./FollowButton";
import RSVPComponent from "./RSVPComponent";
import PostRatingChip from "./PostRatingChip";
import PostRatingModal from "./PostRatingModal";
import ShareDrawer from "./ShareDrawer";
import { useNavigate, useLocation } from "react-router-dom";
import { Paths } from "../../router/Paths";
import { useState, useEffect, useRef } from "react";
import { getCommentCount } from "../../api/services/comments";
import { type BatchLoadResult } from "../../types/legacy";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { storyCreatorFromPost } from "../../lib/shareStoryCreator";
import useAuthActionGate from "../../hooks/useAuthActionGate";

/** TEMP — paste target post UUID; remove after RSVP feed diagnosis */
const DEBUG_RSVP_POST_ID = "";

interface PostActionsProps {
  postId: string;
  authorId?: string;
  className?: string;
  postType?: "experience" | "hangout";
  caption?: string | null;
  postImageUrl?: string | null;
  postAuthor?: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    is_anonymous?: boolean;
  };
  onInvite?: () => void; // NEW: callback for invite action
  // [OPTIMIZATION: Phase 1 - PostgreSQL] Full FeedItem with PostgreSQL data
  post?: FeedItem;
  // [OPTIMIZATION: Phase 1 - Batch] Batched data for components (fallback for backward compatibility)
  batchedData?: BatchLoadResult | null;
}

export default function PostActions({
  postId,
  authorId,
  className = "",
  postType,
  caption,
  postImageUrl,
  postAuthor,
  onInvite,
  post, // [OPTIMIZATION: Phase 1 - PostgreSQL] Full FeedItem with PostgreSQL data
  batchedData, // [OPTIMIZATION: Phase 1 - Batch] Fallback for backward compatibility
}: PostActionsProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const initialCanonicalComments =
    post && typeof post.comment_count === "number"
      ? post.comment_count
      : 0;
  const [commentCount, setCommentCount] = useState<number>(
    initialCanonicalComments
  );
  const [showShareDrawer, setShowShareDrawer] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const { ensureAuthed } = useAuthActionGate();
  const commentButtonRef = useRef<HTMLButtonElement>(null);
  const hasLoadedCommentCountRef = useRef(false);

  // [DEBUG] Verify PostgreSQL data is being received
  // [PHASE 1.2] Disabled after verification - PostgreSQL data confirmed working
  // useEffect(() => {
  //   console.log("[PostActions] Data check:", {
  //     postId: postId.slice(0, 8) + "...",
  //     hasPost: !!post,
  //     is_liked: post?.is_liked,
  //     is_saved: post?.is_saved,
  //   });
  // }, []);

  useEffect(() => {
    hasLoadedCommentCountRef.current = false;
  }, [postId]);

  // Update comment count when post prop carries a canonical count (incl. 0)
  useEffect(() => {
    if (typeof post?.comment_count === "number") {
      setCommentCount(post.comment_count);
      hasLoadedCommentCountRef.current = true;
    }
  }, [post?.comment_count]);

  // When navigating between posts, avoid showing the previous post's count until we have data
  useEffect(() => {
    if (typeof post?.comment_count === "number") return;
    setCommentCount(0);
  }, [postId, post?.comment_count]);

  // Lazy load comment count only if not provided from PostgreSQL
  // Use IntersectionObserver to only load when component is visible
  useEffect(() => {
    // Skip if already provided from PostgreSQL or already loaded
    if (
      typeof post?.comment_count === "number" ||
      hasLoadedCommentCountRef.current ||
      !commentButtonRef.current
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasLoadedCommentCountRef.current) {
          hasLoadedCommentCountRef.current = true;
          const loadCommentCount = async () => {
            try {
              const count = await getCommentCount(postId);
              setCommentCount(count);
            } catch (error) {
              console.error("Error loading comment count:", error);
            }
          };
          loadCommentCount();
          observer.disconnect();
        }
      },
      { rootMargin: "100px" } // Start loading 100px before visible
    );

    observer.observe(commentButtonRef.current);

    return () => {
      observer.disconnect();
    };
  }, [postId, post?.comment_count]);

  const storyCreator = storyCreatorFromPost(post, postAuthor);

  /** Match PostDetailBody: RSVP only when the post row has a numeric capacity (null/undefined = off). */
  const rsvpCap = post?.rsvp_capacity;
  const hangoutRsvpConfigured =
    postType === "hangout" && typeof rsvpCap === "number";
  const ratingEnabled = post?.rating_enabled === true;
  const displayLikeCount = post?.effective_like_count ?? post?.like_count ?? 0;
  const displaySaveCount = post?.effective_save_count ?? post?.save_count ?? 0;
  const displayRatingAverage =
    post?.effective_rating_average ?? post?.rating_average ?? null;
  const displayRatingCount =
    post?.effective_rating_count ?? post?.rating_count ?? null;

  if (
    DEBUG_RSVP_POST_ID &&
    (postId === DEBUG_RSVP_POST_ID || post?.id === DEBUG_RSVP_POST_ID)
  ) {
    console.log("RSVP DEBUG PostActions props", {
      id: post?.id ?? postId,
      postType: postType ?? null,
      rsvp_capacity: post?.rsvp_capacity,
      typeof_rsvp_capacity: typeof post?.rsvp_capacity,
      authorId: authorId ?? null,
      hangoutRsvpConfigured,
      branch: hangoutRsvpConfigured ? "RSVPComponent" : "FollowButton",
    });
  }

  const handleCommentClick = () => {
    // Navigate to post detail page (as overlay with background preserved)
    const postType = window.location.pathname.includes("/hangout")
      ? "hangout"
      : "experience";
    navigate(
      `${Paths[
        postType === "hangout" ? "hangoutDetail" : "experienceDetail"
      ].replace(":id", postId)}`,
      {
        state: {
          backgroundLocation: location,
          initialPost: post ?? undefined,
          focusCommentComposer: true,
        },
      }
    );
  };

  const handleShareClick = () => {
    if (!ensureAuthed()) return;

    // Open share drawer
    setShowShareDrawer(true);
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      {/* Left side: Save, Like, Share, Comment (4 smaller icons) */}
      <div className="flex items-center gap-4">
        <SaveButton
          postId={postId}
          size={20}
          className="min-h-9"
          isSaved={post?.is_saved ?? batchedData?.saveStatuses?.get(postId)}
          saveCount={displaySaveCount}
          showCount={true}
          post={post} // [PHASE 3] Pass post for personalization
          explainerPostType={postType}
        />
        <LikeButton
          postId={postId}
          size={20}
          className="min-h-9"
          isLiked={post?.is_liked ?? batchedData?.likeStatuses?.get(postId)}
          likeCount={displayLikeCount}
          showCount={true}
          post={post} // [PHASE 3] Pass post for personalization
        />
        <button
          className="flex min-h-9 items-center gap-1"
          aria-label="Share"
          onClick={handleShareClick}
        >
          <PiShareFat size={20} />
          {(post?.share_count ?? 0) > 0 && (
            <span className="text-xs font-medium">
              {post?.share_count ?? 0}
            </span>
          )}
        </button>
        <button
          ref={commentButtonRef}
          className="flex min-h-9 items-center gap-1"
          aria-label="Comment"
          onClick={handleCommentClick}
        >
          <PiChatCircleDots size={20} />
          {commentCount > 0 && (
            <span className="text-xs font-medium">{commentCount}</span>
          )}
        </button>
      </div>

      {/* Right side: Follow/RSVP button */}
      <div className="flex items-center">
        <div className="min-h-[28px] min-w-[92px] flex items-center justify-end">
          {ratingEnabled ? (
            <PostRatingChip
              ratingEnabled={post?.rating_enabled}
              ratingAverage={displayRatingAverage}
              ratingCount={displayRatingCount}
              viewerRating={post?.viewer_rating ?? null}
              onClick={() => {
                if (!ensureAuthed()) return;
                setShowRatingModal(true);
              }}
            />
          ) : authorId ? (
            hangoutRsvpConfigured ? (
              <RSVPComponent
                postId={postId}
                capacity={rsvpCap}
                className=""
                postAuthor={
                  postAuthor || {
                    id: authorId,
                    username: null,
                    display_name: null,
                    avatar_url: null,
                    is_anonymous: false,
                  }
                }
                rsvpData={post?.rsvp_data ?? batchedData?.rsvpData?.get(postId)}
                post={post}
              />
            ) : (
              <FollowButton
                targetId={authorId}
                followStatus={
                  post?.follow_status ??
                  batchedData?.followStatuses?.get(authorId)
                }
              />
            )
          ) : null}
        </div>
      </div>

      {/* Share Drawer */}
      <ShareDrawer
        isOpen={showShareDrawer}
        onClose={() => setShowShareDrawer(false)}
        postId={postId}
        postType={postType || "experience"}
        caption={caption ?? null}
        postImageUrl={postImageUrl}
        creatorName={storyCreator.creatorName ?? undefined}
        creatorHandle={storyCreator.creatorHandle ?? undefined}
        creatorAvatarUrl={storyCreator.creatorAvatarUrl ?? undefined}
        onInvite={onInvite}
        selectedDates={post?.selected_dates}
        isRecurring={post?.is_recurring}
        recurrenceDays={post?.recurrence_days}
      />

      <PostRatingModal
        open={showRatingModal}
        onClose={() => setShowRatingModal(false)}
        postId={postId}
        ratingAverage={displayRatingAverage}
        ratingCount={displayRatingCount}
        viewerRating={post?.viewer_rating ?? null}
      />
    </div>
  );
}
