import { PiChatCircleDots, PiShareFat } from "react-icons/pi";
import LikeButton from "./LikeButton";
import SaveButton from "./SaveButton";
import FollowButton from "./FollowButton";
import RSVPComponent from "./RSVPComponent";
import ShareDrawer from "./ShareDrawer";
import { useNavigate, useLocation } from "react-router-dom";
import { Paths } from "../../router/Paths";
import { useState, useEffect, useRef } from "react";
import { getCommentCount } from "../../api/services/comments";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../../reducers/modalReducer";
import { RootState } from "../../app/store";
import { type BatchLoadResult } from "../../types/legacy";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { storyCreatorFromPost } from "../../lib/shareStoryCreator";

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
  const dispatch = useDispatch();
  // [OPTIMIZATION: Phase 1 - PostgreSQL] Use provided comment_count, fallback to 0
  const [commentCount, setCommentCount] = useState<number>(
    post?.comment_count ?? 0
  );
  const [showShareDrawer, setShowShareDrawer] = useState(false);
  const authState = useSelector((state: RootState) => state.auth);
  const isAuthenticated = !!authState?.user;
  const authLoading = authState?.loading ?? true;
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

  // Update comment count when post prop changes (if provided from PostgreSQL)
  useEffect(() => {
    if (post?.comment_count !== undefined) {
      setCommentCount(post.comment_count);
      hasLoadedCommentCountRef.current = true;
    }
  }, [post?.comment_count]);

  // Lazy load comment count only if not provided from PostgreSQL
  // Use IntersectionObserver to only load when component is visible
  useEffect(() => {
    // Skip if already provided from PostgreSQL or already loaded
    if (
      post?.comment_count !== undefined ||
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

  const handleCommentClick = () => {
    // Check auth immediately, but don't block if still loading
    if (!authLoading && !isAuthenticated) {
      dispatch(setAuthModal(true));
      return;
    }

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
        },
      }
    );

    // Scroll to comments section after navigation
    setTimeout(() => {
      const commentsSection = document.querySelector("[data-comments-section]");
      if (commentsSection) {
        commentsSection.scrollIntoView({ behavior: "smooth" });
      } else {
        // Fallback: scroll to bottom of page
        window.scrollTo({
          top: document.body.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 500); // Increased timeout for better reliability
  };

  const handleShareClick = () => {
    // Check auth immediately, but don't block if still loading
    if (!authLoading && !isAuthenticated) {
      dispatch(setAuthModal(true));
      return;
    }

    // Open share drawer
    setShowShareDrawer(true);
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      {/* Left side: Save, Like, Share, Comment (4 smaller icons) */}
      <div className="flex items-center gap-4">
        <SaveButton
          postId={postId}
          size={16}
          isSaved={post?.is_saved ?? batchedData?.saveStatuses?.get(postId)}
          saveCount={post?.save_count ?? 0}
          showCount={true}
          post={post} // [PHASE 3] Pass post for personalization
        />
        <LikeButton
          postId={postId}
          size={16}
          isLiked={post?.is_liked ?? batchedData?.likeStatuses?.get(postId)}
          likeCount={post?.like_count ?? 0}
          showCount={true}
          post={post} // [PHASE 3] Pass post for personalization
        />
        <button
          className="flex items-center gap-1"
          aria-label="Share"
          onClick={handleShareClick}
        >
          <PiShareFat size={16} />
          {(post?.share_count ?? 0) > 0 && (
            <span className="text-xs font-medium">
              {post?.share_count ?? 0}
            </span>
          )}
        </button>
        <button
          ref={commentButtonRef}
          className="flex items-center gap-1"
          aria-label="Comment"
          onClick={handleCommentClick}
        >
          <PiChatCircleDots size={16} />
          {commentCount > 0 && (
            <span className="text-xs font-medium">{commentCount}</span>
          )}
        </button>
      </div>

      {/* Right side: Follow/RSVP button */}
      <div className="flex items-center">
        {authorId && (
          <div className="h-7 min-w-[92px] flex items-center justify-end">
            {postType === "hangout" ? (
              // Show RSVP button for hangouts
              <RSVPComponent
                postId={postId}
                capacity={20} // Default capacity, could be improved by passing from parent
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
                post={post} // [PHASE 3] Pass post for personalization
              />
            ) : (
              // Show Follow button for experiences
              <FollowButton
                targetId={authorId}
                followStatus={
                  post?.follow_status ??
                  batchedData?.followStatuses?.get(authorId)
                }
              />
            )}
          </div>
        )}
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
    </div>
  );
}
