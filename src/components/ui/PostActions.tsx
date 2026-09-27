import { PiChatCircleDots, PiShareFat } from "react-icons/pi";
import SaveButton from "./SaveButton";
import PostRatingChip from "./PostRatingChip";
import PostRatingModal from "./PostRatingModal";
import SocialActionCluster from "../social/SocialActionCluster";
import ShareToMessagesDrawer from "../messages/ShareToMessagesDrawer";
import { useNavigate, useLocation } from "react-router-dom";
import { Paths } from "../../router/Paths";
import { useState, useEffect, useRef } from "react";
import { getCommentCount } from "../../api/services/comments";
import { type BatchLoadResult } from "../../types/legacy";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { storyCreatorFromPost } from "../../lib/shareStoryCreator";
import useAuthActionGate from "../../hooks/useAuthActionGate";
import {
  canOfferGroupUp,
  canOfferOpenPlan,
  canOfferPairUp,
} from "../../lib/pairUpEligibility";

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
  onInvite?: () => void;
  post?: FeedItem;
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
  onInvite: _onInvite,
  post,
  batchedData,
}: PostActionsProps) {
  void _onInvite;
  const navigate = useNavigate();
  const location = useLocation();
  const initialCanonicalComments =
    post && typeof post.comment_count === "number" ? post.comment_count : 0;
  const [commentCount, setCommentCount] = useState<number>(
    initialCanonicalComments
  );
  const [showShareDrawer, setShowShareDrawer] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const { ensureAuthed } = useAuthActionGate();
  const commentButtonRef = useRef<HTMLButtonElement>(null);
  const hasLoadedCommentCountRef = useRef(false);

  useEffect(() => {
    hasLoadedCommentCountRef.current = false;
  }, [postId]);

  useEffect(() => {
    if (typeof post?.comment_count === "number") {
      setCommentCount(post.comment_count);
      hasLoadedCommentCountRef.current = true;
    }
  }, [post?.comment_count]);

  useEffect(() => {
    if (typeof post?.comment_count === "number") return;
    setCommentCount(0);
  }, [postId, post?.comment_count]);

  useEffect(() => {
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
          void (async () => {
            try {
              const count = await getCommentCount(postId);
              setCommentCount(count);
            } catch (error) {
              console.error("Error loading comment count:", error);
            }
          })();
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );

    observer.observe(commentButtonRef.current);

    return () => {
      observer.disconnect();
    };
  }, [postId, post?.comment_count]);

  const storyCreator = storyCreatorFromPost(post, postAuthor);

  const ratingEnabled = post?.rating_enabled === true;
  const displaySaveCount = post?.effective_save_count ?? post?.save_count ?? 0;
  const displayRatingAverage =
    post?.effective_rating_average ?? post?.rating_average ?? null;
  const displayRatingCount =
    post?.effective_rating_count ?? post?.rating_count ?? null;
  const pairUpEligible = canOfferPairUp({
    postId,
    postType,
    isRecurring: post?.is_recurring ?? null,
    selectedDates: post?.selected_dates ?? null,
    recurrenceDays: post?.recurrence_days ?? null,
    status: post?.status ?? null,
    visibility: post?.visibility ?? null,
    authorIsPrivate: post?.author?.is_private ?? null,
  });
  const openPlanEligible = canOfferOpenPlan({
    postId,
    postType,
    status: post?.status ?? null,
    visibility: post?.visibility ?? null,
    authorIsPrivate: post?.author?.is_private ?? null,
  });
  const groupUpEligible = canOfferGroupUp({
    postId,
    postType,
    isRecurring: post?.is_recurring ?? null,
    selectedDates: post?.selected_dates ?? null,
    recurrenceDays: post?.recurrence_days ?? null,
    status: post?.status ?? null,
    visibility: post?.visibility ?? null,
    authorIsPrivate: post?.author?.is_private ?? null,
  });
  const groupUpSourceCaption =
    post?.caption?.trim() || caption?.trim() || null;
  const groupUpSourceSchedule =
    postType === "hangout" || postType === "experience"
      ? {
          postType,
          isRecurring: post?.is_recurring ?? null,
          selectedDates: post?.selected_dates ?? null,
          recurrenceDays: post?.recurrence_days ?? null,
        }
      : null;

  const handleCommentClick = () => {
    const detailType = window.location.pathname.includes("/hangout")
      ? "hangout"
      : "experience";
    navigate(
      `${Paths[
        detailType === "hangout" ? "hangoutDetail" : "experienceDetail"
      ].replace(":id", postId)}`,
      {
        state: {
          backgroundLocation: location,
          initialPost: post ?? undefined,
          scrollToComments: true,
        },
      }
    );
  };

  const handleShareClick = () => {
    if (!ensureAuthed()) return;
    setShowShareDrawer(true);
  };

  const showSocial = pairUpEligible || openPlanEligible || groupUpEligible;

  return (
    <div
      className={`flex min-w-0 flex-col gap-2 max-[320px]:gap-1.5 ${className}`}
      data-post-actions-layout
    >
      <div className="flex min-w-0 items-center justify-between gap-2 max-[360px]:gap-1.5">
        {/* Compact engagement cluster — fixed gap, not full-row distribute */}
        <div className="flex min-h-9 min-w-0 shrink items-center gap-2 max-[360px]:gap-1.5 sm:gap-2.5">
          <SaveButton
            postId={postId}
            size={20}
            className="min-h-9 shrink-0 self-center"
            countGap="tight"
            isSaved={post?.is_saved ?? batchedData?.saveStatuses?.get(postId)}
            saveCount={displaySaveCount}
            showCount={true}
            post={post}
            explainerPostType={postType}
          />
          <button
            type="button"
            className="flex min-h-9 shrink-0 items-center gap-1 self-center"
            aria-label="Share"
            onClick={handleShareClick}
          >
            <PiShareFat size={20} />
            {(post?.share_count ?? 0) > 0 && (
              <span className="text-xs font-medium leading-none">
                {post?.share_count ?? 0}
              </span>
            )}
          </button>
          {ratingEnabled ? (
            <div className="flex min-h-9 shrink-0 items-center self-center">
              <PostRatingChip
                variant="compact"
                ratingEnabled={post?.rating_enabled}
                ratingAverage={displayRatingAverage}
                ratingCount={displayRatingCount}
                viewerRating={post?.viewer_rating ?? null}
                onClick={() => {
                  if (!ensureAuthed()) return;
                  setShowRatingModal(true);
                }}
              />
            </div>
          ) : null}
          <button
            ref={commentButtonRef}
            type="button"
            className="flex min-h-9 shrink-0 items-center gap-1 self-center"
            aria-label="Comment"
            onClick={handleCommentClick}
          >
            <PiChatCircleDots size={20} />
            {commentCount > 0 && (
              <span className="text-xs font-medium leading-none">
                {commentCount}
              </span>
            )}
          </button>
        </div>

        {showSocial ? (
          <div className="hidden min-[360px]:flex min-h-9 min-w-0 shrink-0 items-center justify-end overflow-visible">
            <SocialActionCluster
              postId={postId}
              postType={postType}
              post={post}
              sourceCaption={groupUpSourceCaption}
              sourceSchedule={groupUpSourceSchedule}
              variant="feed"
            />
          </div>
        ) : null}
      </div>

      {showSocial ? (
        <div className="flex min-h-9 min-w-0 items-center justify-end overflow-visible min-[360px]:hidden">
          <SocialActionCluster
            postId={postId}
            postType={postType}
            post={post}
            sourceCaption={groupUpSourceCaption}
            sourceSchedule={groupUpSourceSchedule}
            variant="feed"
          />
        </div>
      ) : null}

      <ShareToMessagesDrawer
        open={showShareDrawer}
        onClose={() => setShowShareDrawer(false)}
        postId={postId}
        postType={postType || "experience"}
        caption={caption ?? null}
        postImageUrl={postImageUrl}
        creatorName={storyCreator.creatorName ?? undefined}
        creatorHandle={storyCreator.creatorHandle ?? undefined}
        creatorAvatarUrl={storyCreator.creatorAvatarUrl ?? undefined}
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
