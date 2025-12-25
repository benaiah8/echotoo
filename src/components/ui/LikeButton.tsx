import { useState, useEffect, useRef } from "react";
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
  // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded like status from batch loader
  isLiked?: boolean;
}

export default function LikeButton({
  postId,
  className = "",
  size = 22,
  showCount = false,
  likeCount = 0,
  onLikeChange,
  isLiked: initialIsLiked, // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded status
}: LikeButtonProps) {
  const [isLiked, setIsLiked] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [currentCount, setCurrentCount] = useState(likeCount);
  const [isAnimating, setIsAnimating] = useState(false);
  const authState = useSelector((state: RootState) => state.auth);
  const authLoading = authState?.loading ?? true;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasLoadedRef = useRef(false);

  // [OPTIMIZATION: Lazy Loading] Check if post is liked - lazy load when visible (like images)
  useEffect(() => {
    // [OPTIMIZATION: Phase 1 - Batch] Use batched data if provided (immediate, no API call)
    if (initialIsLiked !== undefined) {
      setIsLiked(initialIsLiked);
      setIsLoading(false);
      hasLoadedRef.current = true;
      return;
    }

    // Don't check until auth is done loading
    if (authLoading) return;

    // Lazy load: Only make API call when button is visible (like images)
    // This prevents blocking new posts from loading
    if (!buttonRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasLoadedRef.current) {
          hasLoadedRef.current = true;
          const checkLikedStatus = async () => {
            // Skip checking for draft posts (they have invalid UUIDs)
            if (postId.startsWith("draft-")) {
              setIsLiked(false);
              setIsLoading(false);
              return;
            }

            // [AUTH FIX] Skip API call if user is not authenticated (after auth loading completes)
            // Why: Prevents unnecessary API calls and console errors when logged out
            if (!authLoading && !authState?.user) {
              setIsLiked(false);
              setIsLoading(false);
              return;
            }

            const { data, error } = await isPostLiked(postId);
            if (error) {
              // [AUTH FIX] Only log non-authentication errors to reduce console noise
              if (error?.message !== "Not authenticated") {
                console.error("Error checking liked status:", error);
              }
              setIsLiked(false);
            } else {
              setIsLiked(data);
            }
            setIsLoading(false);
          };
          checkLikedStatus();
          observer.disconnect();
        }
      },
      { rootMargin: "100px" } // Load 100px before visible (similar to images which use 150px)
    );

    observer.observe(buttonRef.current);

    return () => {
      observer.disconnect();
    };
  }, [postId, authLoading, initialIsLiked]); // [OPTIMIZATION: Phase 1 - Batch] Re-run if batched data changes

  // Update count when prop changes
  useEffect(() => {
    setCurrentCount(likeCount);
  }, [likeCount]);

  const handleToggleLike = async () => {
    // Allow clicking even if still loading initial state, but prevent double-clicks
    if (isToggling) return;

    // Don't allow liking draft posts
    if (postId.startsWith("draft-")) {
      toast.error("Cannot like draft posts");
      return;
    }

    // If still loading initial state, use optimistic default
    const wasLiked = isLiked ?? false;

    setIsToggling(true);
    setIsAnimating(true);

    // Immediate visual feedback - update UI instantly
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

  // Show button even while loading - it will be clickable with optimistic updates
  const displayLiked = isLiked ?? false;

  return (
    <button
      ref={buttonRef}
      onClick={handleToggleLike}
      disabled={isToggling}
      className={`flex items-center gap-1 transition-all duration-200 ${
        isToggling ? "opacity-50" : isLoading ? "opacity-70" : ""
      } ${className}`}
      aria-label={displayLiked ? "Unlike post" : "Like post"}
    >
      {displayLiked ? (
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
