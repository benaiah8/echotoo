import { useState, useEffect } from "react";
import { CommentWithDetails } from "../../types/comment";
import {
  getCommentsForPost,
  updateComment,
  deleteComment,
} from "../../api/services/comments";
import Comment from "./Comment";
import FloatingCommentInput from "./FloatingCommentInput";
import { supabase } from "../../lib/supabaseClient";

interface Props {
  postId: string;
  onCommentCountChange?: (count: number) => void;
}

export default function CommentList({ postId, onCommentCountChange }: Props) {
  const [comments, setComments] = useState<CommentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Get current user ID and profile
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      // Get user profile from cache
      const cachedProfile = localStorage.getItem("my_avatar_url");
      const cachedUsername = localStorage.getItem("my_username");
      const cachedDisplayName = localStorage.getItem("my_display_name");

      if (cachedProfile && cachedUsername && cachedDisplayName) {
        setUserProfile({
          username: cachedUsername,
          display_name: cachedDisplayName,
          avatar_url: cachedProfile,
        });
      }
    };
    getUser();
  }, []);

  // Load comments
  useEffect(() => {
    loadComments();
  }, [postId]);

  const loadComments = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log("Loading comments for post:", postId); // Debug log
      const commentsData = await getCommentsForPost(postId);
      console.log("Comments loaded:", commentsData); // Debug log
      setComments(commentsData);

      // Calculate total comment count (including replies)
      const totalCount = commentsData.reduce((total, comment) => {
        return total + 1 + (comment.replies?.length || 0);
      }, 0);

      onCommentCountChange?.(totalCount);
    } catch (err) {
      console.error("Error loading comments:", err); // Debug log
      setError("Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  const handleNewComment = (
    content: string,
    parentId?: string,
    commentData?: any
  ) => {
    if (commentData && userProfile) {
      // Optimistic update: add new comment to the list immediately
      const newComment = {
        ...commentData,
        author: {
          id: commentData.author_id,
          username: userProfile.username,
          display_name: userProfile.display_name,
          avatar_url: userProfile.avatar_url,
        },
        likes_count: 0,
        is_liked_by_me: false,
        replies: [],
      };

      setComments((prevComments) => [...prevComments, newComment]);
    }
    setReplyingTo(null);
  };

  const handleEditComment = async (commentId: string, content: string) => {
    try {
      await updateComment(commentId, { content });
      // Optimistic update: update the comment in the list
      setComments((prevComments) =>
        prevComments.map((comment) =>
          comment.id === commentId
            ? { ...comment, content, updated_at: new Date().toISOString() }
            : comment
        )
      );
      setEditingComment(null);
    } catch (err) {
      console.error("Error updating comment:", err);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      // Optimistic update: remove comment from list immediately
      setComments((prevComments) =>
        prevComments.filter((comment) => comment.id !== commentId)
      );

      // Then perform the actual deletion
      await deleteComment(commentId);
    } catch (err) {
      console.error("Error deleting comment:", err);
      // Revert optimistic update on error
      loadComments();
    }
  };

  const handleReply = (parentId: string) => {
    setReplyingTo(parentId);
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--text)]/10 animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[var(--text)]/10 rounded animate-pulse w-1/4" />
                <div className="h-3 bg-[var(--text)]/10 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-[var(--text)]/10 rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="mt-6 border-t border-[var(--border)]"
        data-comments-section
      >
        <div className="p-4 pb-24 text-center">
          {" "}
          {/* Add bottom padding for floating input */}
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={loadComments}
            className="mt-2 px-3 py-1 text-xs bg-[var(--primary)] text-[var(--primaryText)] rounded-lg hover:bg-[var(--primary)]/90"
          >
            Try Again
          </button>
        </div>

        {/* Always show comment input even on error */}
        <FloatingCommentInput
          postId={postId}
          onComment={handleNewComment}
          placeholder="Write a comment..."
        />
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-[var(--border)]" data-comments-section>
      {/* Comments */}
      <div className="p-4 pb-24">
        {" "}
        {/* Add bottom padding for floating input */}
        {comments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--text)]/60">No comments yet</p>
            <p className="text-xs text-[var(--text)]/40 mt-1">
              Be the first to comment!
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {comments.map((comment) => (
              <Comment
                key={comment.id}
                comment={comment}
                onReply={handleReply}
                onEdit={handleEditComment}
                onDelete={handleDeleteComment}
                currentUserId={currentUserId || undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating comment input - always visible */}
      <FloatingCommentInput
        postId={postId}
        parentId={replyingTo}
        onComment={handleNewComment}
        onCancel={replyingTo ? () => setReplyingTo(null) : undefined}
        placeholder={replyingTo ? "Write a reply..." : "Write a comment..."}
      />
    </div>
  );
}
