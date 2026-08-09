import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  PiDotsThree,
  PiFlag,
  PiPencilSimple,
  PiTrash,
  PiUserSwitch,
} from "react-icons/pi";
import toast from "react-hot-toast";
import { deletePost } from "../../api/services/posts";
import {
  adminDeletePost,
  adminGetPostForEdit,
  invalidateCachesAfterPostDelete,
} from "../../api/services/adminPosts";
import { discardAllDrafts, isDraftPostId } from "../../lib/drafts";
import { emitPostDeleted } from "../../lib/postEvents";
import {
  buildAdminEditPostData,
  createEditActivitiesHref,
  persistCanonicalEditPostData,
  type EditActivitySourceRow,
  type EditPostReturnState,
  type EditPostSourceRow,
} from "../../lib/editPostBootstrap";
import { useIsReportReviewer } from "../../hooks/useIsReportReviewer";
import AdminAssignPostDialog from "../admin/AdminAssignPostDialog";
import ConfirmDialog from "./ConfirmDialog";

interface PostMenuProps {
  postId: string;
  /** Auth user id of current post owner (`posts.author_id`). */
  currentAuthorId?: string | null;
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
  /** Return path after admin edit republish (defaults to current pathname). */
  editReturnPath?: string;
  /** Overlay detail restore state for admin edit republish. */
  editReturnState?: EditPostReturnState;
}

type DeleteMode = "owner" | "admin";

export default function PostMenu({
  postId,
  currentAuthorId,
  onEdit,
  onDelete,
  className = "",
  variant = "default",
  isDraft = false,
  isOwner = true,
  onRequestReport,
  editReturnPath,
  editReturnState,
}: PostMenuProps) {
  const navigate = useNavigate();
  const { isReportReviewer } = useIsReportReviewer();
  const [isOpen, setIsOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("owner");
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAdminEditLoading, setIsAdminEditLoading] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const showAssignAction =
    isReportReviewer && !isDraft && !isDraftPostId(postId);

  const showAdminDeleteAction =
    isReportReviewer && !isOwner && !isDraft && !isDraftPostId(postId);

  const showAdminEditAction = showAdminDeleteAction;

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

  const openDeleteConfirm = (e: React.MouseEvent, mode: DeleteMode) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);
    setDeleteMode(mode);
    setShowDeleteModal(true);
  };

  const handleAssign = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);
    setShowAssignDialog(true);
  };

  const handleAdminEdit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(false);
    if (isAdminEditLoading) return;

    setIsAdminEditLoading(true);
    const loadingToast = toast.loading("Loading post for edit…");
    try {
      const { post, activities } = await adminGetPostForEdit(postId);
      const editData = buildAdminEditPostData(
        post as unknown as EditPostSourceRow,
        activities as unknown as EditActivitySourceRow[],
        {
          returnPath: editReturnPath ?? window.location.pathname,
          ...(editReturnState ? { returnState: editReturnState } : {}),
        }
      );
      persistCanonicalEditPostData(editData);
      toast.dismiss(loadingToast);
      navigate(createEditActivitiesHref(post.type as string));
    } catch (error) {
      console.error("Error loading post for admin edit:", error);
      toast.dismiss(loadingToast);
      const msg = error instanceof Error ? error.message : "";
      toast.error(msg.trim() ? msg : "Failed to load post for editing");
    } finally {
      setIsAdminEditLoading(false);
    }
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

      if (deleteMode === "admin") {
        const result = await adminDeletePost(postId);
        if (!result.deleted) {
          toast("Post was not deleted.");
          setShowDeleteModal(false);
          return;
        }
        await invalidateCachesAfterPostDelete(result.postId, result.authorId);
        toast.success("Post deleted");
        emitPostDeleted(result.postId);
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

  const menuItemClass =
    "w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--glass-active-bg)] flex items-center gap-2";

  const deleteConfirmMessage =
    deleteMode === "admin"
      ? "Permanently delete this post for all users? This cannot be undone."
      : "Are you sure you want to delete this post? This action cannot be undone.";

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
                <button onClick={handleEdit} className={menuItemClass}>
                  <PiPencilSimple size={16} />
                  Edit
                </button>
                <button
                  onClick={(e) => openDeleteConfirm(e, "owner")}
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
                className={menuItemClass}
              >
                <PiFlag size={16} />
                Report
              </button>
            )}
            {showAssignAction ? (
              <button onClick={handleAssign} className={menuItemClass}>
                <PiUserSwitch size={16} />
                Assign post
              </button>
            ) : null}
            {showAdminEditAction ? (
              <button
                type="button"
                onClick={handleAdminEdit}
                disabled={isAdminEditLoading}
                className={menuItemClass}
              >
                <PiPencilSimple size={16} />
                Edit post
              </button>
            ) : null}
            {showAdminDeleteAction ? (
              <button
                onClick={(e) => openDeleteConfirm(e, "admin")}
                className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"
              >
                <PiTrash size={16} />
                Delete post
              </button>
            ) : null}
          </div>,
          document.body
        )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Delete post?"
        message={deleteConfirmMessage}
        confirmLabel="Delete"
        confirmVariant="danger"
        isLoading={isDeleting}
      />

      {showAssignAction ? (
        <AdminAssignPostDialog
          open={showAssignDialog}
          onClose={() => setShowAssignDialog(false)}
          postId={postId}
          currentAuthorId={currentAuthorId}
        />
      ) : null}
    </div>
  );
}
