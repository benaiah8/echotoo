import { FaCommentDots } from "react-icons/fa";
import { MdShare } from "react-icons/md";
import LikeButton from "./LikeButton";
import SaveButton from "./SaveButton";
import FollowButton from "./FollowButton";
import { useState, useEffect } from "react";
import { getCommentCount } from "../../api/services/comments";
import { supabase } from "../../lib/supabaseClient";

interface StickyPostActionsProps {
  postId: string;
  authorId?: string; // This is auth user ID, we need to convert to profile ID
  className?: string;
}

export default function StickyPostActions({
  postId,
  authorId,
  className = "",
}: StickyPostActionsProps) {
  const [commentCount, setCommentCount] = useState(0);
  const [authorProfileId, setAuthorProfileId] = useState<string | null>(null);

  // Convert auth user ID to profile ID
  useEffect(() => {
    const getAuthorProfileId = async () => {
      if (!authorId) {
        console.log("StickyPostActions: No authorId provided");
        return;
      }

      console.log(
        "StickyPostActions: Converting auth user ID to profile ID:",
        authorId
      );

      try {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", authorId)
          .single();

        if (error) {
          console.error(
            "StickyPostActions: Error getting author profile ID:",
            error
          );
          setAuthorProfileId(null);
          return;
        }

        console.log("StickyPostActions: Found profile ID:", profile?.id);
        setAuthorProfileId(profile?.id || null);
      } catch (error) {
        console.error(
          "StickyPostActions: Exception getting author profile ID:",
          error
        );
        setAuthorProfileId(null);
      }
    };

    getAuthorProfileId();
  }, [authorId]);

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

  const scrollToComments = () => {
    const commentsSection = document.querySelector("[data-comments-section]");
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: "smooth" });
    }
  };
  return (
    <div
      className={`fixed top-0 left-0 right-0 z-40 bg-gradient-to-b from-[var(--bg)] via-[var(--bg)]/95 to-transparent backdrop-blur-sm border-b border-[var(--border)]/50 ${className}`}
      style={{
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="w-full py-3 px-6 pr-3">
        <div className="flex items-center justify-between">
          {/* Left side: Comment, Share, Like, Save */}
          <div className="flex items-center gap-6">
            <button
              className="flex items-center gap-1"
              aria-label="Comment"
              onClick={scrollToComments}
            >
              <FaCommentDots size={20} />
              {commentCount > 0 && (
                <span className="text-xs font-medium">{commentCount}</span>
              )}
            </button>
            <button className="flex items-center gap-1" aria-label="Share">
              <MdShare size={22} />
            </button>
            <LikeButton postId={postId} size={22} />
            <SaveButton postId={postId} size={22} />
          </div>

          {/* Right side: Follow button */}
          {authorProfileId && (
            <div className="h-7 min-w-[92px] flex items-center justify-center">
              <FollowButton targetId={authorProfileId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
