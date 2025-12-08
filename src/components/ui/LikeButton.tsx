import { useState, useEffect } from "react";
import { MdFavorite, MdFavoriteBorder } from "react-icons/md";
import { likePost, unlikePost, isPostLiked } from "../../api/services/likes";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";

interface LikeButtonProps {
  postId: string;
  className?: string;
  size?: number;
  showCount?: boolean;
  likeCount?: number;
  onLikeChange?: (isLiked: boolean, newCount: number) => void;
}

export default function LikeButton({
  postId,
  className = "",
  size = 22,
  showCount = false,
  likeCount = 0,
  onLikeChange,
}: LikeButtonProps) {
  const [isLiked, setIsLiked] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [currentCount, setCurrentCount] = useState(likeCount);
  const [isAnimating, setIsAnimating] = useState(false);
  const authState = useSelector((state: RootState) => state.auth);
  const authLoading = authState?.loading ?? true;

  // Check if post is liked on mount, but wait for auth to finish loading
  useEffect(() => {
    // Don't check until auth is done loading
    if (authLoading) return;

    const checkLikedStatus = async () => {
      // Skip checking for draft posts (they have invalid UUIDs)
      if (postId.startsWith("draft-")) {
        setIsLiked(false);
        setIsLoading(false);
        return;
      }

      const { data, error } = await isPostLiked(postId);
      if (error) {
        console.error("Error checking liked status:", error);
        setIsLiked(false);
      } else {
        setIsLiked(data);
      }
      setIsLoading(false);
    };

    checkLikedStatus();
  }, [postId, authLoading]);

  // Update count when prop changes
  useEffect(() => {
    setCurrentCount(likeCount);
  }, [likeCount]);

  const handleToggleLike = async () => {
    if (isToggling || isLoading || authLoading) return;

    // Don't allow liking draft posts
    if (postId.startsWith("draft-")) {
      toast.error("Cannot like draft posts");
      return;
    }

    setIsToggling(true);
    setIsAnimating(true);
    const wasLiked = isLiked;

    // Immediate visual feedback
    setIsLiked(!wasLiked);
    const newCount = wasLiked
      ? Math.max(0, currentCount - 1)
      : currentCount + 1;
    setCurrentCount(newCount);
    onLikeChange?.(!wasLiked, newCount);

    try {
      if (wasLiked) {
        console.log("Unliking post:", postId);
        const { error } = await unlikePost(postId);
        if (error) {
          console.error("Error unliking post:", error);
          // Revert on error
          setIsLiked(true);
          setCurrentCount(currentCount);
          onLikeChange?.(true, currentCount);
          toast.error("Failed to unlike post");
        } else {
          toast.success("Post unliked");
        }
      } else {
        console.log("Liking post:", postId);
        const { error } = await likePost(postId);
        if (error) {
          console.error("Error liking post:", error);
          // Revert on error
          setIsLiked(false);
          setCurrentCount(currentCount);
          onLikeChange?.(false, currentCount);
          toast.error("Failed to like post");
        } else {
          toast.success("Post liked");
        }
      }
    } catch (error) {
      console.error("Toggle like error:", error);
      // Revert on error
      setIsLiked(wasLiked);
      setCurrentCount(currentCount);
      onLikeChange?.(wasLiked || false, currentCount);
      toast.error("Something went wrong");
    } finally {
      setIsToggling(false);
      // End animation after a short delay
      setTimeout(() => setIsAnimating(false), 200);
    }
  };

  if (isLoading) {
    return (
      <button
        disabled
        className={`flex items-center gap-1 opacity-50 ${className}`}
        aria-label="Loading..."
      >
        <MdFavoriteBorder size={size} />
        {showCount && <span className="text-sm">{currentCount}</span>}
      </button>
    );
  }

  return (
    <button
      onClick={handleToggleLike}
      disabled={isToggling}
      className={`flex items-center gap-1 transition-all duration-200 ${
        isToggling ? "opacity-50" : ""
      } ${className}`}
      aria-label={isLiked ? "Unlike post" : "Like post"}
    >
      {isLiked ? (
        <MdFavorite
          size={size}
          className={`text-red-500 transition-all duration-200 ${
            isAnimating ? "scale-125" : "scale-100"
          }`}
        />
      ) : (
        <MdFavoriteBorder
          size={size}
          className={`transition-all duration-200 ${
            isAnimating ? "scale-125" : "scale-100"
          }`}
        />
      )}
      {showCount && (
        <span className="text-sm text-[var(--text)]/80">{currentCount}</span>
      )}
    </button>
  );
}
