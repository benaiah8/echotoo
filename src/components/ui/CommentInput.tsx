import { useState, useEffect } from "react";
import { createComment } from "../../api/services/comments";
import Avatar from "./Avatar";
import { supabase } from "../../lib/supabaseClient";

interface Props {
  postId: string;
  parentId?: string | null;
  onComment: (content: string, parentId?: string) => void;
  onCancel?: () => void;
  placeholder?: string;
}

export default function CommentInput({
  postId,
  parentId,
  onComment,
  onCancel,
  placeholder = "Write a comment...",
}: Props) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    username: string;
    display_name: string;
    avatar_url?: string;
  } | null>(null);

  // Get current user profile
  useEffect(() => {
    const getUserProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username, display_name, avatar_url")
          .eq("id", user.id)
          .single();

        if (profile) {
          setUserProfile(profile);
        }
      }
    };
    getUserProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createComment({
        post_id: postId,
        parent_id: parentId || null,
        content: content.trim(),
      });

      // Notify parent component
      onComment(content.trim(), parentId || undefined);

      // Clear input
      setContent("");
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

  return (
    <div className="p-4">
      <form onSubmit={handleSubmit} className="flex gap-3">
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

        {/* Input Area */}
        <div className="flex-1">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full p-3 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
            rows={2}
            maxLength={1000}
            disabled={isSubmitting}
          />

          {/* Character count */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-[var(--text)]/60">
              {content.length}/1000
            </span>

            {/* Action buttons */}
            <div className="flex gap-2">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-3 py-1 text-xs border border-[var(--border)] text-[var(--text)] rounded-lg hover:bg-[var(--surface-2)] transition-colors"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={!content.trim() || isSubmitting}
                className="px-3 py-1 text-xs bg-[var(--primary)] text-[var(--primaryText)] rounded-lg hover:bg-[var(--primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
