import { useEffect, useState } from "react";
import { PiHeartFill } from "react-icons/pi";
import { likeComment, unlikeComment } from "../../api/services/comments";

interface Props {
  commentId: string;
  initialLiked: boolean;
  initialCount: number;
  onLikeChange?: (liked: boolean, count: number) => void;
  size?: number;
}

export default function CommentLikeButton({
  commentId,
  initialLiked,
  initialCount,
  onLikeChange,
  size = 16,
}: Props) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [currentCount, setCurrentCount] = useState(initialCount);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsLiked(initialLiked);
    setCurrentCount(initialCount);
  }, [initialLiked, initialCount]);

  const handleToggleLike = async () => {
    const prevLiked = isLiked;
    const prevCount = currentCount;
    const newLiked = !prevLiked;
    const newCount = newLiked ? prevCount + 1 : prevCount - 1;

    setIsLiked(newLiked);
    setCurrentCount(newCount);
    setIsAnimating(true);
    onLikeChange?.(newLiked, newCount);

    try {
      if (newLiked) {
        await likeComment(commentId);
      } else {
        await unlikeComment(commentId);
      }
    } catch (error) {
      setIsLiked(prevLiked);
      setCurrentCount(prevCount);
      onLikeChange?.(prevLiked, prevCount);
      console.error("Error toggling comment like:", error);
    } finally {
      // Reset animation after a short delay
      setTimeout(() => setIsAnimating(false), 200);
    }
  };

  return (
    <button
      onClick={handleToggleLike}
      className={`flex items-center gap-1 text-sm transition-all duration-200 ${
        isAnimating ? "scale-125" : "scale-100"
      } ${
        isLiked
          ? "text-red-500 hover:text-red-600"
          : "text-[var(--text)]/60 hover:text-red-500"
      }`}
    >
      <PiHeartFill
        size={size}
        className={`transition-colors duration-200 ${
          isLiked ? "fill-current" : ""
        }`}
      />
      {currentCount > 0 && (
        <span className="text-xs font-medium">{currentCount}</span>
      )}
    </button>
  );
}
