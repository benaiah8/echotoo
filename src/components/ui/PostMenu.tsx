import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { PiDotsThree, PiFlag, PiPencilSimple, PiTrash } from "react-icons/pi";
import toast from "react-hot-toast";
import { deletePost } from "../../api/services/posts";
import { discardAllDrafts, isDraftPostId } from "../../lib/drafts";
import { emitPostDeleted } from "../../lib/postEvents";
import ConfirmDialog from "./ConfirmDialog";

interface PostMenuProps {
  postId: string;
  onEdit?: () => void;
  /** After successful server delete only — navigate, close modal, or list cleanup. Do not call deletePost here. */
  onDelete?: () => void;
  className?: string;
  variant?: "default" | "boxed";
  isDraft?: boolean;
  /** When false, shows Report instead of Edit/Delete (Play Store compliance) */
  isOwner?: boolean;
  /** Non-owner: parent opens in-app report flow */
  onRequestReport?: () => void;
}

export default function PostMenu({
  postId,
  onEdit,
  onDelete,
  className = "",
  variant = "default",
  isDraft = false,
  isOwner = true,
  onRequestReport,
}: PostMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside (trigger or portaled dropdown)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) {
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

  // Close on scroll/resize (dropdown position would drift)
  useEffect(() => {
    if (!isOpen) return;
    const close = () => setIsOpen(false);
    window.addEventListener("scroll", close, { capture: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
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

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (isDraft || isDraftPostId(postId)) {
        discardAllDrafts();
        toast.success("Draft discarded");
        emitPostDeleted(postId);
        onDelete?.();
        setShowDeleteModal(false);
        return;
      }
      await deletePost(postId);
      toast.success("Post deleted successfully");
      emitPostDeleted(postId);
      onDelete?.();
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Error deleting post:", error);
      toast.error("Failed to delete post");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Three dots button */}
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setMenuRect(rect);
          setIsOpen(!isOpen);
        }}
        className={`rounded-full hover:bg-[var(--surface)]/50 transition-colors ${
          variant === "boxed" ? "hover:bg-transparent p-0.5" : "p-1"
        }`}
        aria-label="Post options"
      >
        <PiDotsThree
          size={variant === "boxed" ? 14 : 20}
          className="text-[var(--text)]/70"
        />
      </button>

      {/* Dropdown menu - portaled to escape stacking context, frosted glass */}
      {isOpen &&
        menuRect &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[100] rounded-lg shadow-xl py-1 min-w-[120px]"
            style={{
              top: menuRect.bottom + 4,
              right: window.innerWidth - menuRect.right,
              backgroundColor: "var(--glass-bg)",
              backdropFilter: "blur(var(--glass-blur))",
              WebkitBackdropFilter: "blur(var(--glass-blur))",
              border: "1px solid var(--border)",
            }}
          >
            {isOwner ? (
              <>
                <button
                  onClick={handleEdit}
                  className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--glass-active-bg)] flex items-center gap-2"
                >
                  <PiPencilSimple size={16} />
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                >
                  <PiTrash size={16} />
                  Delete
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onRequestReport?.();
                }}
                className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--glass-active-bg)] flex items-center gap-2"
              >
                <PiFlag size={16} />
                Report
              </button>
            )}
          </div>,
          document.body
        )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Delete post?"
        message="Are you sure you want to delete this post? This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
