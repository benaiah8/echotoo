import { FaCommentDots } from "react-icons/fa";
import { MdShare } from "react-icons/md";
import LikeButton from "./LikeButton";
import SaveButton from "./SaveButton";
import FollowButton from "./FollowButton";
import RSVPComponent from "./RSVPComponent";
import { useNavigate } from "react-router-dom";
import { Paths } from "../../router/Paths";
import { useState, useEffect } from "react";
import { getCommentCount } from "../../api/services/comments";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../../reducers/modalReducer";
import { RootState } from "../../app/store";

interface PostActionsProps {
  postId: string;
  authorId?: string;
  className?: string;
  postType?: "experience" | "hangout";
  postAuthor?: {
    id: string;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    is_anonymous?: boolean;
  };
}

export default function PostActions({
  postId,
  authorId,
  className = "",
  postType,
  postAuthor,
}: PostActionsProps) {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [commentCount, setCommentCount] = useState(0);
  const authState = useSelector((state: RootState) => state.auth);
  const isAuthenticated = !!authState?.user;
  const authLoading = authState?.loading ?? true;

  // Load comment count
  useEffect(() => {
    const loadCommentCount = async () => {
      try {
        const count = await getCommentCount(postId);
        setCommentCount(count);
      } catch (error) {
        console.error("Error loading comment count:", error);
      }
    };
    loadCommentCount();
  }, [postId]);

  const handleCommentClick = () => {
    // Wait for auth loading to complete
    if (authLoading) return;

    if (!isAuthenticated) {
      dispatch(setAuthModal(true));
      return;
    }

    // Navigate to post detail page
    const postType = window.location.pathname.includes("/hangout")
      ? "hangout"
      : "experience";
    navigate(
      `${Paths[
        postType === "hangout" ? "hangoutDetail" : "experienceDetail"
      ].replace(":id", postId)}`
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

  const handleShareClick = async () => {
    // Wait for auth loading to complete
    if (authLoading) return;

    if (!isAuthenticated) {
      dispatch(setAuthModal(true));
      return;
    }

    try {
      // Get the current URL for the post
      const postUrl = window.location.href;
      const shareData = {
        title: `Check out this ${
          postType === "hangout" ? "hangout" : "experience"
        }`,
        url: postUrl,
      };

      // Try to use the Web Share API if available
      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare(shareData)
      ) {
        await navigator.share(shareData);
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(postUrl);
        // You could add a toast notification here if you have one
        console.log("Link copied to clipboard");
      }
    } catch (error) {
      console.error("Error sharing:", error);
    }
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      {/* Left side: Save, Like, Share, Comment (4 smaller icons) */}
      <div className="flex items-center gap-4">
        <SaveButton postId={postId} size={16} />
        <LikeButton postId={postId} size={16} />
        <button
          className="flex items-center gap-1"
          aria-label="Share"
          onClick={handleShareClick}
        >
          <MdShare size={16} />
        </button>
        <button
          className="flex items-center gap-1"
          aria-label="Comment"
          onClick={handleCommentClick}
        >
          <FaCommentDots size={16} />
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
              />
            ) : (
              // Show Follow button for experiences
              <FollowButton targetId={authorId} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
