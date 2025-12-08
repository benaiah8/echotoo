import React, { useEffect, useState, useRef } from "react";
import { createComment } from "../../api/services/comments";
import Avatar from "./Avatar";
import { supabase } from "../../lib/supabaseClient";
import { uploadToCloudinary } from "../../api/services/cloudinaryUpload";
import { FaImage, FaTimes } from "react-icons/fa";
import toast from "react-hot-toast";

interface Props {
  postId: string;
  parentId?: string | null;
  onComment: (content: string, parentId?: string, commentData?: any) => void;
  onCancel?: () => void;
  placeholder?: string;
}

export default function FloatingCommentInput({
  postId,
  parentId,
  onComment,
  onCancel,
  placeholder = "This is where we add the comment",
}: Props) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    username: string;
    display_name: string;
    avatar_url?: string;
  } | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Visual tuning - same as CreateTabsSection
  const SAFE =
    typeof window !== "undefined"
      ? parseInt(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--safe-area-inset-bottom"
          ) || "0"
        )
      : 0;
  const BAR_H = 60; // visible control bar height
  const OVERLAP = 0; // no overlap - directly attach to bottom tab

  // Measure BottomTab so the bar hugs it perfectly
  const [btHeight, setBtHeight] = useState(0);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = document.getElementById("bottom-tab");
    const measure = () =>
      setBtHeight(el ? Math.round(el.getBoundingClientRect().height) : 0);
    measure();

    // Re-measure on resize & when BottomTab animates
    window.addEventListener("resize", measure);
    const mo = el ? new MutationObserver(measure) : null;
    if (el && mo)
      mo.observe(el, { attributes: true, childList: true, subtree: true });
    const end = () => measure();
    el?.addEventListener("transitionend", end);

    return () => {
      window.removeEventListener("resize", measure);
      mo?.disconnect();
      el?.removeEventListener("transitionend", end);
    };
  }, []);

  // Track scroll to follow bottom tab behavior - more responsive
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const current = window.scrollY;
          const shouldHide = current > 30; // more responsive threshold
          setHidden(shouldHide);
          ticking = false;
        });
        ticking = true;
      }
    };

    // Initial check
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Get current user profile from cache first
  useEffect(() => {
    const getUserProfile = async () => {
      // Try to get from cache first
      const cachedProfile = localStorage.getItem("my_avatar_url");
      const cachedUsername = localStorage.getItem("my_username");
      const cachedDisplayName = localStorage.getItem("my_display_name");

      if (cachedProfile && cachedUsername && cachedDisplayName) {
        setUserProfile({
          username: cachedUsername,
          display_name: cachedDisplayName,
          avatar_url: cachedProfile,
        });
        return;
      }

      // Fallback to API if cache is empty
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("user_id", user.id)
          .single();

        if (profile) {
          setUserProfile(profile);
        }
      }
    };
    getUserProfile();
  }, []);

  const handleImageUpload = async (file: File) => {
    setIsUploadingImage(true);
    try {
      const imageUrl = await uploadToCloudinary(file);
      setUploadedImage(imageUrl);
    } catch (error) {
      console.error("Error uploading image:", error);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  const removeImage = () => {
    setUploadedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!content.trim() && !uploadedImage) || isSubmitting) return;

    // Check character limit
    if (content.length > 1000) {
      toast.error("Comment is too long! Maximum 1000 characters allowed.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Prepare images array
      const images = uploadedImage ? [uploadedImage] : [];

      const createdComment = await createComment({
        post_id: postId,
        parent_id: parentId || null,
        content: content.trim(),
        images: images,
      });

      // Notify parent component with comment data
      onComment(content.trim(), parentId || undefined, createdComment);

      // Clear input and image
      setContent("");
      setUploadedImage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error creating comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Calculate position - stick to bottom edge when hidden
  const bottom = hidden ? SAFE : btHeight + SAFE;
  const transform = hidden ? "translateY(0)" : "translateY(0)"; // Always visible, just changes position

  return (
    <div
      className="fixed left-0 right-0 z-30 bg-[var(--bg)] border-t border-[var(--border)] transition-all duration-300"
      style={{
        bottom: `${bottom}px`,
        transform,
      }}
    >
      <div className="px-4 py-3">
        {/* Character count - moved to input row */}

        {/* Input Row - Bottom Line */}
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          {/* User Avatar */}
          <div className="flex-shrink-0">
            {userProfile ? (
              <Avatar
                url={userProfile.avatar_url}
                name={userProfile.display_name || userProfile.username}
                size={32}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--text)]/10 animate-pulse" />
            )}
          </div>

          {/* Single Line Input */}
          <div className="flex-1">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              maxLength={1000}
              disabled={isSubmitting}
            />
          </div>

          {/* Image Upload Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingImage}
            className="flex-shrink-0 w-8 h-8 bg-[var(--surface)] text-[var(--text)] rounded-full flex items-center justify-center hover:bg-[var(--surface-2)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-[var(--border)]"
          >
            {isUploadingImage ? (
              <div className="w-4 h-4 border-2 border-[var(--text)]/30 border-t-[var(--text)] rounded-full animate-spin" />
            ) : (
              <FaImage size={14} />
            )}
          </button>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Post Button */}
          <button
            type="submit"
            disabled={(!content.trim() && !uploadedImage) || isSubmitting}
            className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </form>

        {/* Image Preview */}
        {uploadedImage && (
          <div className="mt-3 relative">
            <div className="relative inline-block">
              <img
                src={uploadedImage}
                alt="Comment preview"
                className="max-w-32 max-h-32 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <FaTimes size={10} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function for safe area (same as CreateTabsSection)
function envSafeArea(): number {
  if (typeof window === "undefined") return 0;
  const val = getComputedStyle(document.documentElement).getPropertyValue(
    "--safe-area-inset-bottom"
  );
  return parseInt(val) || 0;
}
