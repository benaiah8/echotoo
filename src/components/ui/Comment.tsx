import { useState } from "react";
import { CommentWithDetails } from "../../types/comment";
import Avatar from "./Avatar";
import CommentLikeButton from "./CommentLikeButton";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Paths } from "../../router/Paths";

interface Props {
  comment: CommentWithDetails;
  onReply?: (parentId: string) => void;
  onEdit?: (commentId: string, content: string) => void;
  onDelete?: (commentId: string) => void;
  currentUserId?: string;
  depth?: number;
}

export default function Comment({
  comment,
  onReply,
  onEdit,
  onDelete,
  currentUserId,
  depth = 0,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const navigate = useNavigate();

  const isOwner = currentUserId === comment.author_id;
  const maxDepth = 3; // Limit nesting depth
  const canReply = depth < maxDepth;

  const handleAuthorClick = () => {
    if (comment.author?.username) {
      console.log("Navigating to profile:", comment.author.username); // Debug log
      navigate(`/u/${comment.author.username}`);
    } else {
      console.log("No username found for comment author:", comment.author); // Debug log
    }
  };

  const handleEdit = () => {
    if (isEditing) {
      // Save edit
      if (editContent.trim() && editContent !== comment.content) {
        onEdit?.(comment.id, editContent.trim());
      }
      setIsEditing(false);
    } else {
      // Start editing
      setEditContent(comment.content);
      setIsEditing(true);
    }
  };

  const handleDelete = async () => {
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      onDelete?.(comment.id);
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Error deleting comment:", error);
      setIsDeleting(false);
    }
  };

  const handleLikeChange = (liked: boolean, count: number) => {
    // Update local state if needed
    // The parent component will handle the actual state update
  };

  return (
    <div
      className={`${
        depth > 0 ? "ml-6 border-l border-[var(--border)] pl-4" : ""
      }`}
    >
      <div className="flex gap-3 py-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <button
            onClick={handleAuthorClick}
            className="hover:opacity-80 transition-opacity"
          >
            <Avatar
              url={comment.author?.avatar_url || null}
              name={
                comment.author?.display_name ||
                comment.author?.username ||
                "Unknown User"
              }
              size={32}
            />
          </button>
        </div>

        {/* Comment Content */}
        <div className="flex-1 min-w-0">
          {/* Author and timestamp */}
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={handleAuthorClick}
              className="font-medium text-sm text-[var(--text)] hover:text-[var(--primary)] transition-colors"
            >
              {comment.author?.display_name ||
                comment.author?.username ||
                "Unknown User"}
            </button>
            <span className="text-xs text-[var(--text)]/60">
              {formatDistanceToNow(new Date(comment.created_at), {
                addSuffix: true,
              })}
            </span>
            {comment.updated_at !== comment.created_at && (
              <span className="text-xs text-[var(--text)]/50">(edited)</span>
            )}
          </div>

          {/* Comment text */}
          {isEditing ? (
            <div className="mb-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                rows={2}
                maxLength={1000}
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleEdit}
                  className="px-3 py-1 text-xs bg-[var(--primary)] text-[var(--primaryText)] rounded-lg hover:bg-[var(--primary)]/90"
                >
                  Save
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1 text-xs border border-[var(--border)] text-[var(--text)] rounded-lg hover:bg-[var(--surface-2)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--text)] mb-2 whitespace-pre-wrap">
              {comment.content}
            </div>
          )}

          {/* Comment Images */}
          {comment.images && comment.images.length > 0 && (
            <div className="mb-2 flex gap-2 flex-wrap">
              {comment.images.slice(0, 2).map((imageUrl, index) => (
                <img
                  key={index}
                  src={imageUrl}
                  alt={`Comment image ${index + 1}`}
                  className="max-w-32 max-h-32 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => window.open(imageUrl, "_blank")}
                />
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-4">
            {/* Like button */}
            <CommentLikeButton
              commentId={comment.id}
              initialLiked={comment.is_liked}
              initialCount={comment.like_count}
              onLikeChange={handleLikeChange}
            />

            {/* Reply button */}
            {canReply && (
              <button
                onClick={() => onReply?.(comment.id)}
                className="text-xs text-[var(--text)]/60 hover:text-[var(--text)] transition-colors"
              >
                Reply
              </button>
            )}

            {/* Owner actions */}
            {isOwner && !isEditing && (
              <>
                <button
                  onClick={handleEdit}
                  className="text-xs text-[var(--text)]/60 hover:text-[var(--text)] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-xs text-red-500/60 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2">
          {comment.replies.map((reply) => (
            <Comment
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              currentUserId={currentUserId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Comment"
        message="Are you sure you want to delete this comment? This action cannot be undone."
        isLoading={isDeleting}
      />
    </div>
  );
}
