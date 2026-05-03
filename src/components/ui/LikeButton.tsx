import { useState, useEffect, useRef } from "react";
import { PiHeart, PiHeartFill } from "react-icons/pi";
import { likePost, unlikePost, isPostLiked } from "../../api/services/likes";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { recordSignal } from "../../lib/feedPersonalization";
import { isDraftPostId } from "../../lib/drafts";
import { emitPostChanged } from "../../lib/postEvents";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { incrementMyXp } from "../../api/services/xp";
import useAuthActionGate from "../../hooks/useAuthActionGate";

interface LikeButtonProps {
  postId: string;
  className?: string;
  size?: number;
  /** Smaller count text (e.g. compact top bars) */
  compactCount?: boolean;
  showCount?: boolean;
  likeCount?: number;
  onLikeChange?: (isLiked: boolean, newCount: number) => void;
  // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded like status from batch loader
  isLiked?: boolean;
  // [PHASE 3] Optional post data for personalization
  post?: FeedItem;
}

export default function LikeButton({
  postId,
  className = "",
  size = 22,
  compactCount = false,
  showCount = false,
  likeCount = 0,
  onLikeChange,
  isLiked: initialIsLiked, // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded status
  post, // [PHASE 3] Optional post data for personalization
}: LikeButtonProps) {
  const [isLiked, setIsLiked] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [currentCount, setCurrentCount] = useState(likeCount);
  const [isAnimating, setIsAnimating] = useState(false);
  const authState = useSelector((state: RootState) => state.auth);
  const { authLoading, ensureAuthed } = useAuthActionGate();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasLoadedRef = useRef(false);
  const pendingRef = useRef(false); // Ref-based guard: blocks duplicate clicks before state updates

  // [DEBUG] Warn if falling back to individual query
  // [PHASE 1.1] Silenced to reduce console noise - uncomment for debugging
  // useEffect(() => {
  //   if (initialIsLiked === undefined && !authLoading && !hasLoadedRef.current) {
  //     console.warn('[LikeButton] ⚠️ No PostgreSQL data, falling back to query:', postId);
  //   }
  // }, [initialIsLiked, postId, authLoading]);

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
            if (isDraftPostId(postId)) {
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

  // Reconcile internal state with props when upstream (post:changed / refetch) updates post.
  // While toggling, keep optimistic count + heart state; when the toggle finishes, sync again
  // so canonical props always win (fixes missed sync when updates arrived during pendingRef).
  useEffect(() => {
    if (isToggling) return;
    const isLikedProp = initialIsLiked ?? false;
    const countProp = likeCount ?? 0;
    setIsLiked((prev) => (prev !== isLikedProp ? isLikedProp : prev));
    setCurrentCount(countProp);
  }, [initialIsLiked, likeCount, isToggling]);

  const handleToggleLike = async () => {
    if (!ensureAuthed()) return;

    // Ref-based guard: blocks duplicate clicks synchronously (before React re-renders)
    if (pendingRef.current) return;
    if (isToggling) return;
    pendingRef.current = true;

    // Don't allow liking draft posts
    if (isDraftPostId(postId)) {
      pendingRef.current = false;
      toast.error("Cannot like draft posts");
      return;
    }

    // If still loading initial state, use optimistic default
    const wasLiked = isLiked ?? false;

    setIsToggling(true);
    setIsAnimating(true);

    // Immediate visual feedback - update UI instantly
    const newIsLiked = !wasLiked;
    const delta = newIsLiked ? 1 : -1;
    setIsLiked(newIsLiked);
    const newCount = wasLiked
      ? Math.max(0, currentCount - 1)
      : currentCount + 1;
    setCurrentCount(newCount);
    onLikeChange?.(newIsLiked, newCount);

    // Optimistic patch: update feed/modal immediately so FEED→MODAL nav shows correct count
    emitPostChanged(postId, { viewerLiked: newIsLiked, likesDelta: delta });

    try {
      if (wasLiked) {
        const { error } = await unlikePost(postId);
        if (error) {
          console.error("Error unliking post:", error);
          // Revert on error (undo optimistic patch)
          setIsLiked(true);
          setCurrentCount(currentCount);
          onLikeChange?.(true, currentCount);
          emitPostChanged(postId, { viewerLiked: true, likesDelta: 1 });
          toast.error("Failed to unlike post");
        } else {
          // [PHASE 1] Update XP (unlike = -1)
          try {
            await incrementMyXp(-1);
          } catch (err) {
            // Fail silently - don't break unlike action if XP fails
          }
          // [PHASE 3] Unlike doesn't record a signal - preferences only grow from positive actions
          // (We could implement decay later if needed)
        }
      } else {
        const { error } = await likePost(postId);
        if (error) {
          console.error("Error liking post:", error);
          // Revert on error (undo optimistic patch)
          setIsLiked(false);
          setCurrentCount(currentCount);
          onLikeChange?.(false, currentCount);
          emitPostChanged(postId, { viewerLiked: false, likesDelta: -1 });
          toast.error("Failed to like post");
        } else {
          // [PHASE 1] Update XP (like = +1)
          try {
            await incrementMyXp(1);
          } catch (err) {
            // Fail silently - don't break like action if XP fails
          }
          // [PHASE 3] Record signal for personalization
          if (post) {
            try {
              recordSignal(post, "like");
            } catch (err) {
              // Fail silently - don't break like action if personalization fails
            }
          }
        }
      }
    } catch (error) {
      console.error("Toggle like error:", error);
      // Revert on error (undo optimistic patch)
      setIsLiked(wasLiked);
      setCurrentCount(currentCount);
      onLikeChange?.(wasLiked || false, currentCount);
      emitPostChanged(postId, { viewerLiked: wasLiked, likesDelta: -delta });
      toast.error("Something went wrong");
    } finally {
      pendingRef.current = false;
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
        <PiHeartFill
          size={size}
          className={`text-red-500 transition-all duration-200 ${
            isAnimating ? "scale-125" : "scale-100"
          }`}
        />
      ) : (
        <PiHeart
          size={size}
          className={`transition-all duration-200 ${
            isAnimating ? "scale-125" : "scale-100"
          }`}
        />
      )}
      {showCount && (
        <span
          className={
            compactCount
              ? "text-[10px] font-medium tabular-nums text-[var(--text)]/90"
              : "text-sm text-[var(--text)]/80"
          }
        >
          {currentCount}
        </span>
      )}
    </button>
  );
}
