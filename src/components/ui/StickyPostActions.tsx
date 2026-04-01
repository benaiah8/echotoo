import { PiChatCircleDots, PiShareFat } from "react-icons/pi";
import LikeButton from "./LikeButton";
import SaveButton from "./SaveButton";
import FollowButton from "./FollowButton";
import ShareDrawer from "./ShareDrawer";
import { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../../reducers/modalReducer";
import { RootState } from "../../app/store";
import { getCommentCount } from "../../api/services/comments";
import { isDraftPostId } from "../../lib/drafts";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { storyCreatorFromPost } from "../../lib/shareStoryCreator";
import {
  POST_DETAIL_GLASS_PILL_MAX_WIDTH_PX,
  POST_DETAIL_GLASS_PILL_WIDTH_CLASS,
} from "../../lib/postDetailGlassUi";
// [OPTIMIZATION: Phase 3.4] Removed BatchLoadResult - PostgreSQL function provides all data

/** `floatingGlass`: centered frosted pill (modal / preview) — matches HomeTopBar + BottomTab tokens. */
export type StickyPostActionsBarVariant = "default" | "floatingGlass";

interface StickyPostActionsProps {
  postId: string;
  authorId?: string; // This is auth user ID, we need to convert to profile ID
  className?: string;
  /** Full-page detail uses default full-width bar; modal uses floatingGlass for consistency with home shell. */
  barVariant?: StickyPostActionsBarVariant;
  // [OPTIMIZATION: Phase 3.4] Post data with all related fields from PostgreSQL function
  post?: FeedItem;
  onClose?: () => void;
  /** Share drawer props - same shape as PostActions */
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
}

export default function StickyPostActions({
  postId,
  authorId,
  className = "",
  barVariant = "default",
  post,
  onClose,
  postType = "experience",
  caption,
  postImageUrl,
  postAuthor,
  onInvite,
}: StickyPostActionsProps) {
  const dispatch = useDispatch();
  const authState = useSelector((state: RootState) => state.auth);
  const isAuthenticated = !!authState?.user;
  const authLoading = authState?.loading ?? true;

  const [commentCount, setCommentCount] = useState(0);
  const [authorProfileId, setAuthorProfileId] = useState<string | null>(null);
  const [showShareDrawer, setShowShareDrawer] = useState(false);

  // Convert auth user ID to profile ID
  useEffect(() => {
    const getAuthorProfileId = async () => {
      if (!authorId) return;

      try {
        // [PHASE 2.3 - OPTIMIZATION] Use getProfileIdByUserId() for conversion
        // Why: Reuses cache, RequestManager deduplicates, and caches full profile for future use
        const { getProfileIdByUserId } = await import(
          "../../api/services/follows"
        );
        const profileId = await getProfileIdByUserId(authorId);

        if (!profileId) {
          setAuthorProfileId(null);
          return;
        }

        setAuthorProfileId(profileId);
      } catch (error) {
        setAuthorProfileId(null);
      }
    };

    getAuthorProfileId();
  }, [authorId]);

  // Load comment count (use from post if available, otherwise fetch)
  useEffect(() => {
    if (isDraftPostId(postId)) {
      setCommentCount(0);
      return;
    }
    if (post?.comment_count !== undefined) {
      setCommentCount(post.comment_count);
    } else {
      const loadCommentCount = async () => {
        try {
          const count = await getCommentCount(postId);
          setCommentCount(count);
        } catch (error) {
          console.error("Error loading comment count:", error);
        }
      };
      loadCommentCount();
    }
  }, [postId, post?.comment_count]);

  const scrollToComments = () => {
    const commentsSection = document.querySelector("[data-comments-section]");
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleShareClick = () => {
    if (!authLoading && !isAuthenticated) {
      dispatch(setAuthModal(true));
      return;
    }
    setShowShareDrawer(true);
  };

  const storyCreator = storyCreatorFromPost(post, postAuthor);

  const iconSm = barVariant === "floatingGlass" ? 14 : 20;
  const iconMd = barVariant === "floatingGlass" ? 15 : 22;
  const actionGap = barVariant === "floatingGlass" ? "gap-3.5" : "gap-6";
  const sideGap = barVariant === "floatingGlass" ? "gap-0.5" : "gap-3";

  const actionsRow = (
    <div
      className={
        barVariant === "floatingGlass"
          ? "flex min-w-0 w-full items-center gap-2 pl-0.5"
          : "flex min-w-0 items-center justify-between gap-2"
      }
    >
      <div className={`flex min-w-0 shrink-0 items-center ${actionGap}`}>
        <button
          type="button"
          className="flex shrink-0 items-center gap-0.5 text-[var(--text)]"
          aria-label="Comment"
          onClick={scrollToComments}
        >
          <PiChatCircleDots size={iconSm} />
          {commentCount > 0 && (
            <span className="text-[11px] font-medium tabular-nums text-[var(--text)]/90">
              {commentCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className="flex shrink-0 items-center gap-0.5 text-[var(--text)]"
          aria-label="Share"
          onClick={handleShareClick}
        >
          <PiShareFat size={iconMd} />
          {(post?.share_count ?? 0) > 0 && (
            <span className="text-[11px] font-medium tabular-nums text-[var(--text)]/90">
              {post?.share_count ?? 0}
            </span>
          )}
        </button>
        <LikeButton
          postId={postId}
          size={iconMd}
          compactCount={barVariant === "floatingGlass"}
          isLiked={post?.is_liked}
          likeCount={post?.like_count ?? 0}
          showCount={true}
          post={post}
        />
        <SaveButton
          postId={postId}
          size={iconMd}
          compactCount={barVariant === "floatingGlass"}
          isSaved={post?.is_saved}
          saveCount={post?.save_count ?? 0}
          showCount={true}
          post={post}
        />
      </div>

      <div
        className={`flex shrink-0 items-center ${sideGap} ${
          barVariant === "floatingGlass" ? "ml-auto" : ""
        }`}
      >
        {authorProfileId && (
          <div className="flex h-6 min-w-[84px] max-w-[118px] items-center justify-center sm:h-6 sm:min-w-[88px]">
            <FollowButton
              targetId={authorProfileId}
              followStatus={post?.follow_status}
            />
          </div>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={
              barVariant === "floatingGlass"
                ? "flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-md text-base font-light leading-none text-[var(--text)]/85 hover:bg-[color-mix(in_oklab,var(--text)_10%,transparent)] hover:text-[var(--text)]"
                : "text-xl leading-none text-[var(--text)] hover:text-[var(--text)]/80"
            }
          >
            ×
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {barVariant === "floatingGlass" ? (
        <>
          <div
            className="pointer-events-none fixed left-0 right-0 top-0 z-40"
            style={{
              top: "calc(-1px + -1 * env(safe-area-inset-top, 0px))",
              height: "calc(62px + env(safe-area-inset-top, 0px))",
              width: "100%",
              background: "var(--gradient-from-top)",
            }}
            aria-hidden
          />
          <div
            className={`fixed left-0 right-0 top-0 z-40 flex flex-col items-center pointer-events-none ${className}`}
            style={{
              paddingTop: "calc(6px + env(safe-area-inset-top, 0px))",
            }}
          >
            <div
              className={`pointer-events-auto min-w-0 ${POST_DETAIL_GLASS_PILL_WIDTH_CLASS}`}
              style={{ maxWidth: POST_DETAIL_GLASS_PILL_MAX_WIDTH_PX }}
            >
              <div
                className={[
                  "bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]",
                  "border border-[var(--bottom-tab-border)]",
                  "rounded-full shadow-sm",
                ].join(" ")}
              >
                <div className="py-1 pl-3 pr-2 sm:py-1.5 sm:pl-3.5 sm:pr-2.5">
                  {actionsRow}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div
          className={`fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-[var(--bg)] via-[var(--bg)]/95 to-transparent backdrop-blur-sm border-b border-[var(--border)]/50 safe-area-inset-top ${className}`}
        >
          <div className="w-full py-3 px-6 pr-3">{actionsRow}</div>
        </div>
      )}

      <ShareDrawer
        isOpen={showShareDrawer}
        onClose={() => setShowShareDrawer(false)}
        postId={postId}
        postType={postType}
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
    </>
  );
}
