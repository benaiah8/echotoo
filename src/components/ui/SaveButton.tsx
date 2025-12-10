import { useState, useEffect } from "react";
import { MdBookmark, MdBookmarkBorder } from "react-icons/md";
import {
  savePost,
  unsavePost,
  isPostSaved,
} from "../../api/services/savedPosts";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { RootState } from "../../app/store";

interface SaveButtonProps {
  postId: string;
  className?: string;
  size?: number;
}

export default function SaveButton({
  postId,
  className = "",
  size = 22,
}: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const authState = useSelector((state: RootState) => state.auth);
  const authLoading = authState?.loading ?? true;

  // Check if post is saved on mount, but wait for auth to finish loading
  useEffect(() => {
    // Don't check until auth is done loading
    if (authLoading) return;
    const checkSavedStatus = async () => {
      // Skip checking for draft posts (they have invalid UUIDs)
      if (postId.startsWith("draft-")) {
        setIsSaved(false);
        setIsLoading(false);
        return;
      }

      const { data, error } = await isPostSaved(postId);
      if (error) {
        console.error("Error checking saved status:", error);
        setIsSaved(false);
      } else {
        setIsSaved(data);
      }
      setIsLoading(false);
    };

    checkSavedStatus();
  }, [postId, authLoading]);

  const handleToggleSave = async () => {
    // Allow clicking even if still loading initial state, but prevent double-clicks
    if (isToggling) return;

    // Don't allow saving draft posts
    if (postId.startsWith("draft-")) {
      toast.error("Cannot save draft posts");
      return;
    }

    // If still loading initial state, use optimistic default
    const wasSaved = isSaved ?? false;

    setIsToggling(true);
    setIsAnimating(true);

    // Immediate visual feedback - update UI instantly
    setIsSaved(!wasSaved);

    try {
      if (wasSaved) {
        console.log("Unsaving post:", postId);
        const { error } = await unsavePost(postId);
        if (error) {
          console.error("Error unsaving post:", error);
          // Revert on error
          setIsSaved(true);
          toast.error("Failed to unsave post");
        } else {
          toast.success("Post unsaved");
        }
      } else {
        console.log("Saving post:", postId);
        const { error } = await savePost(postId);
        if (error) {
          console.error("Error saving post:", error);
          // Revert on error
          setIsSaved(false);
          toast.error("Failed to save post");
        } else {
          toast.success("Post saved");
        }
      }
    } catch (error) {
      console.error("Toggle save error:", error);
      // Revert on error
      setIsSaved(wasSaved);
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
      onClick={handleToggleSave}
      disabled={isToggling}
      className={`flex items-center gap-1 transition-all duration-200 ${
        isToggling ? "opacity-50" : isLoading ? "opacity-70" : ""
      } ${className}`}
      aria-label={displaySaved ? "Unsave post" : "Save post"}
    >
      {displaySaved ? (
        <MdBookmark
          size={size}
          className={`text-primary transition-all duration-200 ${
            isAnimating ? "scale-125" : "scale-100"
          }`}
        />
      ) : (
        <MdBookmarkBorder
          size={size}
          className={`transition-all duration-200 ${
            isAnimating ? "scale-125" : "scale-100"
          }`}
        />
      )}
    </button>
  );
}
