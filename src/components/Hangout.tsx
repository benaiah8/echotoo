import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { Paths } from "../router/Paths";
import { type RootState } from "../app/store";

import { PiFlag, PiPencilSimple, PiTrash, PiUserPlus, PiUserSwitch } from "react-icons/pi";
import Avatar from "./ui/Avatar";
import { PostTypeMetaChip } from "./ui/PostFeedSurfaceMeta";
import FollowButton from "./ui/FollowButton";
import RSVPComponent from "./ui/RSVPComponent";
import PostRatingChip from "./ui/PostRatingChip";
import PostRatingModal from "./ui/PostRatingModal";
import InviteDrawer from "./ui/InviteDrawer";
import SaveButton from "./ui/SaveButton";
import ConfirmDialog from "./ui/ConfirmDialog";
import { getPostForEdit, deletePost } from "../api/services/posts";
import {
  adminDeletePost,
  adminGetPostForEdit,
  invalidateCachesAfterPostDelete,
} from "../api/services/adminPosts";
import {
  buildAdminEditPostData,
  buildCanonicalEditPostData,
  createEditActivitiesHref,
  persistCanonicalEditPostData,
  type EditActivitySourceRow,
  type EditPostSourceRow,
} from "../lib/editPostBootstrap";
import toast from "react-hot-toast";
import { emitPostDeleted } from "../lib/postEvents";
import { getPostScheduleLabel } from "../lib/postScheduleLabel";
import {
  getPostScheduleLabelClasses,
  railScheduleLabelUsesPill,
} from "../lib/postScheduleLabelStyles";
import { type FeedItem } from "../api/queries/getPublicFeed";
import { getRailCardCoverUrl } from "../lib/railCardCoverUrl";
import { discardAllDrafts, isDraftPostId } from "../lib/drafts";
import RailCardImageBackdrop from "./RailCardImageBackdrop";
import useAuthActionGate from "../hooks/useAuthActionGate";
import { useIsReportReviewer } from "../hooks/useIsReportReviewer";
import AdminAssignPostDialog from "./admin/AdminAssignPostDialog";
import ReportModal from "./ui/ReportModal";
import {
  buildPostReportDraftFromFeedItem,
  type ReportDraft,
} from "../types/report";

/** Fixed rail top label row height (pill + plain posted-age share the same footprint). */
const RAIL_LABEL_ROW_CLASS =
  "mb-2 flex h-[26px] w-full min-w-0 items-center justify-center";

type Props = {
  id: string; // NEW
  caption: string;
  createdAt: string; // ISO timestamp
  isOwner?: boolean; // NEW: whether this is the current user's own hangout
  onDelete?: () => void; // NEW: callback when hangout is deleted
  status?: "draft" | "published"; // NEW: post status for visual indicators
  selectedDates?: string[] | null; // NEW: event dates for priority sorting
  type?: "hangout" | "experience"; // NEW: post type for avatar indicator

  /** Legacy max RSVPs when `post` is not passed; rail paths should rely on `post.rsvp_capacity`. */
  capacity?: number;
  attendees?: Array<{ avatarUrl?: string | null }>;
  authorHandle?: string | null;
  avatarUrl?: string | null; // author avatar
  authorId?: string; // author user ID for RSVP component
  isAnonymous?: boolean; // if author is anonymous
  // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded statuses from batch loader
  isSaved?: boolean;
  followStatus?: "none" | "pending" | "following" | "friends" | null;
  // [ENHANCEMENT: Visual Distinction] Visual styling for filtered items
  isFiltered?: boolean; // Whether this item matches active filters
  /** Full FeedItem for initialPost when opening PostDetailModal (rail→modal sync) */
  post?: FeedItem;
};

type DeleteMode = "owner" | "admin";

export default function Hangout({
  id,
  caption,
  createdAt,
  capacity,
  attendees = [],
  authorHandle = "Unknown",
  avatarUrl = null,
  authorId,
  isAnonymous = false,
  isOwner = false, // Default to false for backward compatibility
  onDelete,
  status = "published", // Default to published for backward compatibility
  selectedDates = null, // Default to null for backward compatibility
  type = "hangout", // Default to hangout for backward compatibility
  isSaved, // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded save status
  followStatus, // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded follow status
  isFiltered = false, // [ENHANCEMENT: Visual Distinction] Visual styling for filtered items
  post, // Full FeedItem for initialPost when opening modal
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("owner");
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAdminEditLoading, setIsAdminEditLoading] = useState(false);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [railImageFailed, setRailImageFailed] = useState(false);
  const [reportDraft, setReportDraft] = useState<ReportDraft | null>(null);
  const { ensureAuthed } = useAuthActionGate();
  const { isReportReviewer } = useIsReportReviewer();
  const authUserId = useSelector(
    (state: RootState) => state.auth?.user?.id ?? null
  );
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isDraft = status === "draft";
  const isDraftPost = isDraft || id.startsWith("draft-") || isDraftPostId(id);
  const effectiveAuthorId = post?.author_id ?? authorId;
  const effectiveIsOwner =
    isOwner ||
    (authUserId != null &&
      effectiveAuthorId != null &&
      authUserId === effectiveAuthorId);
  const showAssignAction = isReportReviewer && !isDraftPost;
  const showReportAction = !effectiveIsOwner && !isDraftPost;
  const showAdminDeleteAction =
    isReportReviewer && !effectiveIsOwner && !isDraftPost;
  const showAdminEditAction =
    isReportReviewer && !effectiveIsOwner && !isDraftPost;
  const showMenu =
    effectiveIsOwner ||
    showReportAction ||
    showAssignAction ||
    showAdminDeleteAction ||
    showAdminEditAction;
  const menuItemClass =
    "w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--glass-active-bg)] flex items-center gap-2";
  // Prefer post object when provided (patched by post:changed); fallback to primitive props
  const effectiveIsSaved = post?.is_saved ?? isSaved;
  const effectiveFollowStatus = post?.follow_status ?? followStatus;
  /** Author row only: Hangout vs Experience chip. Does not affect follow, RSVP, or rating. */
  const authorRowPostType: "hangout" | "experience" =
    (post?.type ?? type) === "experience" ? "experience" : "hangout";
  const ratingEnabled = post?.rating_enabled === true;
  // Match PostActions / PostDetailBody: RSVP only when hangout has numeric `rsvp_capacity` on the post row.
  const rsvpCap =
    post != null
      ? typeof post.rsvp_capacity === "number"
        ? post.rsvp_capacity
        : undefined
      : typeof capacity === "number"
        ? capacity
        : undefined;
  const railRsvpConfigured =
    type === "hangout" && typeof rsvpCap === "number";

  const authorRowType: "hangout" | "experience" =
    (post?.type ?? type) === "experience" ? "experience" : "hangout";

  const scheduleLabel = useMemo(
    () =>
      getPostScheduleLabel({
        type: authorRowType,
        createdAt: post?.created_at ?? createdAt,
        selectedDates: post?.selected_dates ?? selectedDates,
        isRecurring: post?.is_recurring,
        recurrenceDays: post?.recurrence_days,
      }),
    [
      authorRowType,
      post?.created_at,
      post?.selected_dates,
      post?.is_recurring,
      post?.recurrence_days,
      createdAt,
      selectedDates,
    ]
  );

  const datePillLabel = scheduleLabel.label;

  const railCoverUrl = useMemo(() => getRailCardCoverUrl(post), [post]);
  const showRailCover = Boolean(railCoverUrl && !railImageFailed);

  const railLabelClassName = useMemo(
    () =>
      getPostScheduleLabelClasses(
        scheduleLabel.kind,
        showRailCover ? "railCover" : "rail"
      ),
    [scheduleLabel.kind, showRailCover]
  );

  useEffect(() => {
    setRailImageFailed(false);
  }, [id, railCoverUrl]);

  const handleRailImageError = useCallback(() => {
    setRailImageFailed(true);
  }, []);

  // Close menu when clicking outside (trigger or portaled dropdown)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inTrigger && !inDropdown) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  // Close on scroll/resize (dropdown position would drift)
  useEffect(() => {
    if (!isMenuOpen) return;
    const close = () => setIsMenuOpen(false);
    window.addEventListener("scroll", close, { capture: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [isMenuOpen]);

  const handleEdit = async () => {
    if (isDraft || id.startsWith("draft-")) {
      navigate(`${Paths.createFinalize}?type=hangout`);
      return;
    }
    try {
      const { post, activities } = await getPostForEdit(id);

      const editData = buildCanonicalEditPostData(post, activities);
      persistCanonicalEditPostData(editData);

      navigate(createEditActivitiesHref(post.type));
    } catch (error) {
      console.error("Error loading hangout for edit:", error);
      toast.error("Failed to load event for editing");
    }
  };

  const handleDelete = async () => {
    if (isDraft || id.startsWith("draft-")) {
      // Skip DB delete; drafts live in localStorage; discardAllDrafts emits local-draft:discarded for profile UI.
      discardAllDrafts();
      toast.success("Draft discarded");
      emitPostDeleted(id);
      onDelete?.();
      setShowDeleteModal(false);
      return;
    }
    setIsDeleting(true);
    try {
      if (deleteMode === "admin") {
        const result = await adminDeletePost(id);
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

      await deletePost(id);
      toast.success("Event deleted successfully");
      emitPostDeleted(id);
      onDelete?.();
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Error deleting hangout:", error);
      toast.error(
        deleteMode === "admin" ? "Failed to delete post" : "Failed to delete event"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeleteConfirm = useCallback((mode: DeleteMode) => {
    setIsMenuOpen(false);
    setDeleteMode(mode);
    setShowDeleteModal(true);
  }, []);

  const handleInvite = () => {
    console.log("Opening invite drawer for hangout:", id);
    setShowInviteDrawer(true);
  };

  const handleRequestPostReport = useCallback(() => {
    if (!ensureAuthed()) return;
    if (!post) {
      toast.error("Unable to report this post right now.");
      return;
    }
    setReportDraft(buildPostReportDraftFromFeedItem(post));
  }, [ensureAuthed, post]);

  const handleAssign = useCallback(() => {
    setIsMenuOpen(false);
    setShowAssignDialog(true);
  }, []);

  const handleAdminEdit = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsMenuOpen(false);
      if (isAdminEditLoading) return;

      setIsAdminEditLoading(true);
      const loadingToast = toast.loading("Loading post for edit…");
      try {
        const { post: editPost, activities } = await adminGetPostForEdit(id);
        const editData = buildAdminEditPostData(
          editPost as unknown as EditPostSourceRow,
          activities as unknown as EditActivitySourceRow[],
          {
            returnPath: window.location.pathname,
            returnState: post
              ? {
                  backgroundLocation: location,
                  initialPost: post,
                }
              : undefined,
          }
        );
        persistCanonicalEditPostData(editData);
        toast.dismiss(loadingToast);
        navigate(createEditActivitiesHref(editPost.type as string));
      } catch (error) {
        console.error("Error loading hangout for admin edit:", error);
        toast.dismiss(loadingToast);
        const msg = error instanceof Error ? error.message : "";
        toast.error(msg.trim() ? msg : "Failed to load post for editing");
      } finally {
        setIsAdminEditLoading(false);
      }
    },
    [id, isAdminEditLoading, location, navigate, post]
  );

  const deleteConfirmTitle =
    deleteMode === "admin" ? "Delete post?" : "Delete event?";
  const deleteConfirmMessage =
    deleteMode === "admin"
      ? "Permanently delete this post for all users? This cannot be undone."
      : "Are you sure you want to delete this event? This action cannot be undone.";
  const deleteConfirmLabel = deleteMode === "admin" ? "Delete post" : "Delete";

  return (
    <div
      onClick={(e) => {
        // Don't navigate if invite drawer is open or closing
        if (
          showInviteDrawer ||
          isInviteDrawerClosing ||
          (window as any).__inviteDrawerActive
        ) {
          console.log("Hangout navigation prevented: invite drawer is active");
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (isDraft || id.startsWith("draft-")) {
          navigate(`${Paths.createFinalize}?type=hangout`);
          return;
        }
        console.log("Hangout navigating to:", id);
        navigate(`/hangout/${id}`, {
          state: {
            backgroundLocation: location,
            initialPost: post ?? undefined,
          },
        });
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (
          showInviteDrawer ||
          isInviteDrawerClosing ||
          (window as any).__inviteDrawerActive
        )
          return;
        if (e.key === "Enter" || e.key === " ") {
          if (isDraft || id.startsWith("draft-")) {
            navigate(`${Paths.createFinalize}?type=hangout`);
          } else {
            navigate(`/hangout/${id}`, {
              state: {
                backgroundLocation: location,
                initialPost: post ?? undefined,
              },
            });
          }
        }
      }}
      className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0 cursor-pointer"
    >
      <div
        className={`relative overflow-visible mb-3 rounded-[14px] border border-[var(--border)] pt-2 px-3 pb-3 ${
          showRailCover ? "bg-transparent" : "ui-card"
        } ${isDraft ? "opacity-60" : ""}`}
      >
        {showRailCover && railCoverUrl && (
          <RailCardImageBackdrop
            coverUrl={railCoverUrl}
            onImageError={handleRailImageError}
          />
        )}

        {/* save: straddles bottom card edge (~half in / half out). Rail shells stay overflow-visible. */}
        <div
          className={`absolute bottom-0 z-20 translate-y-1/2 ${
            effectiveIsOwner ? "left-11" : "left-3"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <SaveButton
            postId={id}
            className="flex items-center justify-center p-[3px] rounded-lg bg-[var(--surface)]/80 border border-[var(--border)] shadow-lg"
            size={18}
            isSaved={effectiveIsSaved}
            post={post}
            explainerPostType={type}
          />
        </div>

        <div className="relative z-10 flex flex-col gap-2">
          {/* Date / priority strip — fixed row height for pill vs plain posted-age */}
          <div className={RAIL_LABEL_ROW_CLASS}>
            <span
              className={[
                "flex h-full w-full min-w-0 items-center justify-center text-center text-[9px] leading-none whitespace-nowrap overflow-hidden text-ellipsis",
                railScheduleLabelUsesPill(scheduleLabel.kind)
                  ? `rounded-full border px-2.5 ${railLabelClassName}`
                  : railLabelClassName,
              ].join(" ")}
            >
              {datePillLabel}
            </span>
          </div>

          {/* author row */}
          <div className="flex items-center gap-2 min-w-0">
            <Avatar
              url={isAnonymous ? null : avatarUrl}
              name={authorHandle ?? ""}
              size={24}
              variant={isAnonymous ? "anon" : "default"}
              anonymousAvatar={
                isAnonymous ? authorHandle?.charAt(0) : undefined
              }
            />
            <span className="text-xs text-[var(--text)]/80 truncate min-w-0 flex-1">
              {authorHandle}
            </span>
            <PostTypeMetaChip type={authorRowPostType} className="shrink-0" />
            {isDraft && (
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-600 rounded-full border border-yellow-500/30">
                Draft
              </span>
            )}
          </div>

          {/* caption: clamp to 3 lines for equal height */}
          <div
            className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--text)]/95"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "60px",
            }}
          >
            {caption}
          </div>

          {/* Action Button - Follow for experiences and hangouts in horizontal rail */}
          <div className="pt-1 flex items-center justify-between h-7">
            {/* Three dots menu — owner, report (non-owner), assign (reviewer) */}
            <div className="flex items-center h-full">
              {showMenu ? (
                <div
                  ref={triggerRef}
                  className="relative flex items-center h-full"
                >
                  <div
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-full w-8 h-5 shadow-sm flex items-center justify-center gap-0.5 cursor-pointer hover:bg-[var(--surface)]/80 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const rect = (
                        e.currentTarget as HTMLElement
                      ).getBoundingClientRect();
                      setMenuRect(rect);
                      setIsMenuOpen((prev) => !prev);
                    }}
                  >
                    <div className="w-1 h-1 bg-[var(--text)]/70 rounded-full"></div>
                    <div className="w-1 h-1 bg-[var(--text)]/70 rounded-full"></div>
                    <div className="w-1 h-1 bg-[var(--text)]/70 rounded-full"></div>
                  </div>

                  {/* Dropdown menu - portaled to escape stacking context, frosted glass */}
                  {isMenuOpen &&
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
                        {effectiveIsOwner ? (
                          <>
                            {!isDraftPost && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setIsMenuOpen(false);
                                  handleInvite();
                                }}
                                className={menuItemClass}
                              >
                                <PiUserPlus size={16} />
                                Invite
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setIsMenuOpen(false);
                                handleEdit();
                              }}
                              className={menuItemClass}
                            >
                              <PiPencilSimple size={16} />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                openDeleteConfirm("owner");
                              }}
                              className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                            >
                              <PiTrash size={16} />
                              Delete
                            </button>
                          </>
                        ) : null}
                        {showReportAction ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setIsMenuOpen(false);
                              handleRequestPostReport();
                            }}
                            className={menuItemClass}
                          >
                            <PiFlag size={16} />
                            Report
                          </button>
                        ) : null}
                        {showAssignAction ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleAssign();
                            }}
                            className={menuItemClass}
                          >
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
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              openDeleteConfirm("admin");
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                          >
                            <PiTrash size={16} />
                            Delete post
                          </button>
                        ) : null}
                      </div>,
                      document.body
                    )}
                </div>
              ) : (
                <div></div>
              )}
            </div>

            {/* Action Button (priority: rating > RSVP > follow) */}
            <div className="flex items-center h-full">
              {ratingEnabled ? (
                <PostRatingChip
                  ratingEnabled={post?.rating_enabled}
                  ratingAverage={
                    post?.effective_rating_average ?? post?.rating_average ?? null
                  }
                  ratingCount={
                    post?.effective_rating_count ?? post?.rating_count ?? null
                  }
                  viewerRating={post?.viewer_rating ?? null}
                  onClick={() => {
                    if (!ensureAuthed()) return;
                    setShowRatingModal(true);
                  }}
                  className="text-xs h-6 px-2.5"
                />
              ) : railRsvpConfigured ? (
                <RSVPComponent
                  postId={id}
                  capacity={rsvpCap as number}
                  className=""
                  postAuthor={
                    authorId
                      ? {
                          id: authorId,
                          username: null,
                          display_name: authorHandle ?? null,
                          avatar_url: avatarUrl ?? null,
                          is_anonymous: isAnonymous,
                        }
                      : undefined
                  }
                  rsvpData={post?.rsvp_data ?? undefined}
                  post={post}
                />
              ) : authorId ? (
                // Follow fallback
                <FollowButton
                  targetId={authorId}
                  className="text-xs h-5 min-w-[60px] px-2"
                  followStatus={effectiveFollowStatus}
                />
              ) : (
                <div className="text-xs text-[var(--text)]/50">
                  Follow unavailable
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={deleteConfirmTitle}
        message={deleteConfirmMessage}
        confirmLabel={deleteConfirmLabel}
        confirmVariant="danger"
        isLoading={isDeleting}
      />

      {/* Invite Drawer */}
      <InviteDrawer
        isOpen={showInviteDrawer}
        onClose={() => setShowInviteDrawer(false)}
        postId={id}
        postType="hangout"
        postCaption={caption || "Untitled"}
        onClosingChange={setIsInviteDrawerClosing}
      />

      <PostRatingModal
        open={showRatingModal}
        onClose={() => setShowRatingModal(false)}
        postId={id}
        ratingAverage={post?.effective_rating_average ?? post?.rating_average ?? null}
        ratingCount={post?.effective_rating_count ?? post?.rating_count ?? null}
        viewerRating={post?.viewer_rating ?? null}
      />

      {showAssignAction ? (
        <AdminAssignPostDialog
          open={showAssignDialog}
          onClose={() => setShowAssignDialog(false)}
          postId={id}
          currentAuthorId={effectiveAuthorId ?? null}
        />
      ) : null}

      <ReportModal
        open={reportDraft !== null}
        draft={reportDraft}
        onClose={() => setReportDraft(null)}
      />
    </div>
  );
}
