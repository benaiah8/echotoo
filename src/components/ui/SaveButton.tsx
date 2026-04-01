import { useState, useEffect, useRef } from "react";
import { PiBookmarkSimple, PiBookmarkSimpleFill } from "react-icons/pi";
import {
  savePost,
  unsavePost,
  isPostSaved,
} from "../../api/services/savedPosts";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";
import { recordSignal } from "../../lib/feedPersonalization";
import { isDraftPostId } from "../../lib/drafts";
import { emitPostChanged } from "../../lib/postEvents";
import { type FeedItem } from "../../api/queries/getPublicFeed";
import { incrementMyXp } from "../../api/services/xp";

interface SaveButtonProps {
  postId: string;
  className?: string;
  size?: number;
  compactCount?: boolean;
  showCount?: boolean;
  saveCount?: number;
  // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded save status from batch loader
  isSaved?: boolean;
  // [PHASE 3] Optional post data for personalization
  post?: FeedItem;
}

export default function SaveButton({
  postId,
  className = "",
  size = 22,
  compactCount = false,
  showCount = false,
  saveCount = 0,
  isSaved: initialIsSaved, // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded status
  post, // [PHASE 3] Optional post data for personalization
}: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentCount, setCurrentCount] = useState(saveCount);
  const authState = useSelector((state: RootState) => state.auth);
  const authLoading = authState?.loading ?? true;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hasLoadedRef = useRef(false);

  // [DEBUG] Warn if falling back to individual query
  // [PHASE 1.1] Silenced to reduce console noise - uncomment for debugging
  // useEffect(() => {
  //   if (initialIsSaved === undefined && !authLoading && !hasLoadedRef.current) {
  //     console.warn('[SaveButton] ⚠️ No PostgreSQL data, falling back to query:', postId);
  //   }
  // }, [initialIsSaved, postId, authLoading]);

  // [OPTIMIZATION: Lazy Loading] Check if post is saved - lazy load when visible (like images)
  useEffect(() => {
    // [OPTIMIZATION: Phase 1 - Batch] Use batched data if provided (immediate, no API call)
    if (initialIsSaved !== undefined) {
      setIsSaved(initialIsSaved);
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
          const checkSavedStatus = async () => {
            // Skip checking for draft posts (they have invalid UUIDs)
            if (isDraftPostId(postId)) {
              setIsSaved(false);
              setIsLoading(false);
              return;
            }

            // [AUTH FIX] Skip API call if user is not authenticated (after auth loading completes)
            // Why: Prevents unnecessary API calls and console errors when logged out
            if (!authLoading && !authState?.user) {
              setIsSaved(false);
              setIsLoading(false);
              return;
            }

            const { data, error } = await isPostSaved(postId);
            if (error) {
              // [AUTH FIX] Only log non-authentication errors to reduce console noise
              if (error?.message !== "Not authenticated") {
                console.error("Error checking saved status:", error);
              }
              setIsSaved(false);
            } else {
              setIsSaved(data);
            }
            setIsLoading(false);
          };
          checkSavedStatus();
          observer.disconnect();
        }
      },
      { rootMargin: "100px" } // Load 100px before visible (similar to images which use 150px)
    );

    observer.observe(buttonRef.current);

    return () => {
      observer.disconnect();
    };
  }, [postId, authLoading, initialIsSaved]); // [OPTIMIZATION: Phase 1 - Batch] Re-run if batched data changes

  // Update count when prop changes
  useEffect(() => {
    setCurrentCount(saveCount);
  }, [saveCount]);

  const handleToggleSave = async () => {
    // Allow clicking even if still loading initial state, but prevent double-clicks
    if (isToggling) return;

    // Don't allow saving draft posts
    if (isDraftPostId(postId)) {
      toast.error("Cannot save draft posts");
      return;
    }

    // If still loading initial state, use optimistic default
    const wasSaved = isSaved ?? false;

    setIsToggling(true);
    setIsAnimating(true);

    // Immediate visual feedback - update UI instantly
    const newIsSaved = !wasSaved;
    const delta = newIsSaved ? 1 : -1;
    setIsSaved(newIsSaved);
    const newCount = wasSaved
      ? Math.max(0, currentCount - 1)
      : currentCount + 1;
    setCurrentCount(newCount);

    // Optimistic patch: update feed/modal immediately so FEED→MODAL nav shows correct state
    emitPostChanged(postId, { viewerSaved: newIsSaved, savesDelta: delta });

    try {
      if (wasSaved) {
        const { error } = await unsavePost(postId);
        if (error) {
          console.error("Error unsaving post:", error);
          // Revert on error (undo optimistic patch)
          setIsSaved(true);
          setCurrentCount(currentCount);
          emitPostChanged(postId, { viewerSaved: true, savesDelta: 1 });
          toast.error("Failed to unsave post");
        } else {
          toast.success("Post unsaved");
          // [PHASE 1] Update XP (unsave = -2)
          try {
            await incrementMyXp(-2);
          } catch (err) {
            // Fail silently - don't break unsave action if XP fails
          }
          // [PHASE 3] Unsave doesn't record a signal - preferences only grow from positive actions
        }
      } else {
        const { error } = await savePost(postId);
        if (error) {
          console.error("Error saving post:", error);
          // Revert on error (undo optimistic patch)
          setIsSaved(false);
          setCurrentCount(currentCount);
          emitPostChanged(postId, { viewerSaved: false, savesDelta: -1 });
          toast.error("Failed to save post");
        } else {
          toast.success("Post saved");
          // [PHASE 1] Update XP (save = +2)
          try {
            await incrementMyXp(2);
          } catch (err) {
            // Fail silently - don't break save action if XP fails
          }
          // [PHASE 3] Record signal for personalization
          if (post) {
            try {
              recordSignal(post, "save");
            } catch (err) {
              // Fail silently - don't break save action if personalization fails
            }
          }
        }
      }
    } catch (error) {
      console.error("Toggle save error:", error);
      // Revert on error (undo optimistic patch)
      setIsSaved(wasSaved);
      setCurrentCount(currentCount);
      emitPostChanged(postId, { viewerSaved: wasSaved, savesDelta: -delta });
      toast.error("Something went wrong");
    } finally {
      setIsToggling(false);
      // End animation after a short delay
      setTimeout(() => setIsAnimating(false), 200);
    }
  };

  // Show button even while loading - it will be clickable with optimistic updates
  const displaySaved = isSaved ?? false;

  return (
    <button
      ref={buttonRef}
      onClick={handleToggleSave}
      disabled={isToggling}
      className={`flex items-center gap-1 transition-all duration-200 ${
        isToggling ? "opacity-50" : isLoading ? "opacity-70" : ""
      } ${className}`}
      aria-label={displaySaved ? "Unsave post" : "Save post"}
    >
      {displaySaved ? (
        <PiBookmarkSimpleFill
          size={size}
          className={`text-primary transition-all duration-200 ${
            isAnimating ? "scale-125" : "scale-100"
          }`}
        />
      ) : (
        <PiBookmarkSimple
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
