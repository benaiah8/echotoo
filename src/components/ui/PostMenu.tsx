import React, { useState, useRef, useEffect } from "react";
import { MdMoreHoriz, MdEdit, MdDelete, MdPersonAdd } from "react-icons/md";
import toast from "react-hot-toast";
import { deletePost } from "../../api/services/posts";

interface PostMenuProps {
  postId: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onInvite?: () => void; // NEW: invite callback
  className?: string;
  variant?: "default" | "boxed"; // NEW: variant for different styling
  isDraft?: boolean; // NEW: whether this is a draft post
}

export default function PostMenu({
  postId,
  onEdit,
  onDelete,
  onInvite,
  className = "",
  variant = "default",
  isDraft = false,
}: PostMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);
    onEdit?.();
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);
    setShowDeleteModal(true);
  };

  const handleInvite = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);
    onInvite?.();
  };

  const confirmDelete = async () => {
    try {
      await deletePost(postId);
      toast.success("Post deleted successfully");
      onDelete?.();
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Failed to delete post");
    }
  };

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      {/* Three dots button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`rounded-full hover:bg-[var(--surface)]/50 transition-colors ${
          variant === "boxed" ? "hover:bg-transparent p-0.5" : "p-1"
        }`}
        aria-label="Post options"
      >
        <MdMoreHoriz
          size={variant === "boxed" ? 14 : 20}
          className="text-[var(--text)]/70"
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-8 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[120px] z-50">
          {onInvite && !isDraft && (
            <button
              onClick={handleInvite}
              className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-2"
            >
              <MdPersonAdd size={16} />
              Invite
            </button>
          )}
          <button
            onClick={handleEdit}
            className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface-2)] flex items-center gap-2"
          >
            <MdEdit size={16} />
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"
          >
            <MdDelete size={16} />
            Delete
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[1000]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowDeleteModal(false)}
          />
          <div
            className="absolute left-0 right-0 bottom-0 mx-auto max-w-[640px]
                    rounded-t-2xl bg-[var(--surface)] border-t border-[var(--border)]
                    p-4"
          >
            <div className="text-sm font-semibold mb-1">Delete post?</div>
            <p className="text-xs text-[var(--text)]/70 mb-3">
              Are you sure you want to delete this post? This action cannot be
              undone.
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs"
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-3 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
