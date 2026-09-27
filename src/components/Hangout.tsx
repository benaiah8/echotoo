import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { Paths } from "../router/Paths";
import { type RootState } from "../app/store";

import { PiFlag, PiPencilSimple, PiTrash, PiUserPlus, PiUserSwitch } from "react-icons/pi";
import PostRatingChip from "./ui/PostRatingChip";
import PostRatingModal from "./ui/PostRatingModal";
import InviteDrawer from "./ui/InviteDrawer";
import ConfirmDialog from "./ui/ConfirmDialog";
import SocialActionCluster from "./social/SocialActionCluster";
import { SocialShelfSurfaceProvider } from "../lib/social/socialShelfSurfaceContext";
import { socialUiCopy } from "../lib/social/socialUiCopy";
import { getOwlLogoPath } from "../lib/assets";
import type { GroupUpSourceScheduleContext } from "../lib/groupUpActiveOverlayStore";
import { getPostForEdit, deletePost } from "../api/services/posts";
import {
  adminDeletePost,
  adminGetPostForEdit,
  invalidateCachesAfterPostDelete,
} from "../api/services/adminPosts";
import type { PublishedPostMediaRow } from "../lib/publishedMedia";
import {
  buildAdminEditPostData,
  buildCanonicalEditPostData,
  createEditActivitiesHref,
  persistCanonicalEditPostData,
  type EditActivitySourceRow,
  type EditPostSourceRow,
} from "../lib/editPostBootstrap";
import { runOwnerPublishedEditOpen } from "../lib/openOwnerPublishedEdit";
import toast from "react-hot-toast";
import { emitPostDeleted } from "../lib/postEvents";
import { getPostScheduleLabel } from "../lib/postScheduleLabel";
import {
  getPostScheduleLabelClasses,
  railScheduleLabelUsesPill,
} from "../lib/postScheduleLabelStyles";
import { type FeedItem } from "../api/queries/getPublicFeed";
import { getRailCardCoverUrl } from "../lib/railCardCoverUrl";
import {
  discardAllDrafts,
  isDraftPostId,
  readDraftCreatePostType,
} from "../lib/drafts";
import { buildCreateFinalizeUrl } from "../lib/draftEntryGate";
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
  "flex h-[26px] w-full min-w-0 items-center justify-center";

const RAIL_MENU_VIEWPORT_PAD = 12;
const RAIL_MENU_FALLBACK_WIDTH = 160;

/** Right-side rail trigger: prefer menu right-aligned to trigger, clamp in viewport. */
function clampRailMenuLeft(
  menuRect: DOMRect,
  menuWidth: number,
  viewportPad = RAIL_MENU_VIEWPORT_PAD
): number {
  const viewportW = window.innerWidth;
  let left = menuRect.right - menuWidth;
  if (left < viewportPad) left = viewportPad;
  const maxLeft = viewportW - viewportPad - menuWidth;
  if (left > maxLeft) left = Math.max(viewportPad, maxLeft);
  return left;
}

type Props = {
  id: string; // NEW
  caption: string;
  createdAt: string; // ISO timestamp
  isOwner?: boolean; // NEW: whether this is the current user's own hangout
  onDelete?: () => void; // NEW: callback when hangout is deleted
  status?: "draft" | "published"; // NEW: post status for visual indicators
  selectedDates?: string[] | null; // NEW: event dates for priority sorting
  type?: "hangout" | "experience"; // NEW: post type for avatar indicator

  /** Legacy RSVP capacity prop — unused after published RSVP UI retirement. */
  capacity?: number;
  attendees?: Array<{ avatarUrl?: string | null }>;
  authorHandle?: string | null;
  avatarUrl?: string | null; // author avatar
  authorId?: string;
  isAnonymous?: boolean;
  // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded statuses from batch loader
  isSaved?: boolean;
  followStatus?: "none" | "pending" | "following" | "friends" | null;
  // [ENHANCEMENT: Visual Distinction] Visual styling for filtered items
  isFiltered?: boolean; // Whether this item matches active filters
  /** Full FeedItem for initialPost when opening PostDetailModal (rail→modal sync) */
  post?: FeedItem;
};

type DeleteMode = "owner" | "admin";

function localDraftFinalizeHref(): string {
  const storedType = readDraftCreatePostType() ?? "experience";
  return buildCreateFinalizeUrl(storedType, { resumeDraft: true });
}

export default function Hangout({
  id,
  caption,
  createdAt,
  capacity: _capacity,
  attendees: _attendees = [],
  authorHandle: _authorHandle = "Unknown",
  avatarUrl: _avatarUrl = null,
  authorId,
  isAnonymous: _isAnonymous = false,
  isOwner = false, // Default to false for backward compatibility
  onDelete,
  status = "published", // Default to published for backward compatibility
  selectedDates = null, // Default to null for backward compatibility
  type = "hangout", // Default to hangout for backward compatibility
  isSaved: _isSaved, // retained for callers; Save control removed from Event rail
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
  const [menuDropdownLeft, setMenuDropdownLeft] = useState<number | null>(null);
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
  const ratingEnabled = post?.rating_enabled === true;

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

  const railPostType: "hangout" | "experience" = authorRowType;
  const showRailSocialActions =
    railPostType === "hangout" && !isDraftPost;
  const groupUpSourceCaption =
    post?.caption?.trim() || caption?.trim() || null;
  const groupUpSourceSchedule = useMemo((): GroupUpSourceScheduleContext | null => {
    if (railPostType !== "hangout" && railPostType !== "experience") {
      return null;
    }
    return {
      postType: railPostType,
      isRecurring: post?.is_recurring ?? null,
      selectedDates: post?.selected_dates ?? selectedDates,
      recurrenceDays: post?.recurrence_days ?? null,
    };
  }, [
    railPostType,
    post?.is_recurring,
    post?.selected_dates,
    post?.recurrence_days,
    selectedDates,
  ]);

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

  // Refine horizontal position after menu mounts (actual width may exceed fallback).
  useLayoutEffect(() => {
    if (!isMenuOpen || !menuRect) return;
    const el = dropdownRef.current;
    if (!el) return;
    const clamped = clampRailMenuLeft(
      menuRect,
      el.offsetWidth || RAIL_MENU_FALLBACK_WIDTH
    );
    setMenuDropdownLeft((prev) => (prev === clamped ? prev : clamped));
  }, [
    isMenuOpen,
    menuRect,
    effectiveIsOwner,
    showReportAction,
    showAssignAction,
    showAdminEditAction,
    showAdminDeleteAction,
    isDraftPost,
  ]);

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
      navigate(localDraftFinalizeHref());
      return;
    }
    await runOwnerPublishedEditOpen({
      startPathname: window.location.pathname,
      navigate,
      errorMessage: "Failed to load event for editing",
      fetchAndBuild: async () => {
        const { post, activities, mediaOrder, postMedia } =
          await getPostForEdit(id);
        return {
          editData: buildCanonicalEditPostData(post, activities, {
            mediaOrder,
            postMedia,
          }),
          href: createEditActivitiesHref(post.type),
        };
      },
    });
  };

  const handleDelete = async () => {
    if (isDeleting) return;
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
      toast.error("Couldn't delete the post. Try again.");
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
        const { post: editPost, activities, mediaOrder, postMedia } =
          await adminGetPostForEdit(id);
        const editData = buildAdminEditPostData(
          editPost as unknown as EditPostSourceRow,
          activities as unknown as EditActivitySourceRow[],
          {
            returnPath: window.location.pathname,
            mediaOrder,
            postMedia: postMedia as PublishedPostMediaRow[] | null | undefined,
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
          navigate(localDraftFinalizeHref());
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
            navigate(localDraftFinalizeHref());
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
        className={`relative overflow-visible mb-3 rounded-[14px] border border-[var(--border)] pt-2 px-3 pb-2 ${
          showRailCover ? "bg-transparent" : "ui-card"
        } ${isDraft ? "opacity-60" : ""}`}
      >
        {showRailCover && railCoverUrl && (
          <RailCardImageBackdrop
            coverUrl={railCoverUrl}
            onImageError={handleRailImageError}
          />
        )}

        {/* Overflow menu: straddle bottom-right card edge (no Save on Event rail). */}
        {showMenu ? (
          <div
            className="absolute bottom-0 right-3 z-20 flex translate-y-1/2 items-center"
            data-hangout-rail-menu
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <div ref={triggerRef} className="relative flex items-center">
              <button
                type="button"
                aria-label="Post options"
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                className="inline-flex h-5 shrink-0 items-center justify-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]/80 px-2 shadow-lg transition-colors hover:bg-[var(--surface)]/90"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const rect = (
                    e.currentTarget as HTMLElement
                  ).getBoundingClientRect();
                  setMenuRect(rect);
                  setMenuDropdownLeft(
                    clampRailMenuLeft(rect, RAIL_MENU_FALLBACK_WIDTH)
                  );
                  setIsMenuOpen((prev) => !prev);
                }}
              >
                <span className="h-1 w-1 rounded-full bg-[var(--text)]/70" />
                <span className="h-1 w-1 rounded-full bg-[var(--text)]/70" />
                <span className="h-1 w-1 rounded-full bg-[var(--text)]/70" />
              </button>

              {isMenuOpen &&
                menuRect &&
                createPortal(
                  <div
                    ref={dropdownRef}
                    className="fixed z-[100] rounded-lg shadow-xl py-1 min-w-[120px]"
                    style={{
                      top: menuRect.bottom + 4,
                      left:
                        menuDropdownLeft ??
                        clampRailMenuLeft(
                          menuRect,
                          RAIL_MENU_FALLBACK_WIDTH
                        ),
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
          </div>
        ) : null}

        <div className="relative z-10 flex flex-col">
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

          {/* Social-purpose row (EchoToo owl marker). Not a profile link. */}
          <div
            className="mt-2.5 flex min-w-0 items-center gap-1.5"
            data-hangout-rail-social-purpose
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
            }}
          >
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]"
              aria-hidden
            >
              <img
                src={getOwlLogoPath()}
                alt=""
                width={24}
                height={24}
                className="h-full w-full object-contain p-0.5"
                draggable={false}
              />
            </span>
            <span className="min-w-0 truncate text-[11px] italic font-normal leading-none text-[var(--text)]/55">
              {socialUiCopy.railSocialPickLabel}
            </span>
            {isDraft ? (
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-600 rounded-full border border-yellow-500/30">
                Draft
              </span>
            ) : null}
          </div>

          {/* caption: clamp to 3 lines for equal height */}
          <div
            className="mt-2.5 whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--text)]/95"
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

          {showRailSocialActions ? (
            <div
              className="mt-2.5 flex min-w-0 items-center overflow-visible pr-8"
              data-hangout-rail-social
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
              }}
            >
              <SocialShelfSurfaceProvider surface="rail">
                <SocialActionCluster
                  postId={id}
                  postType="hangout"
                  post={post ?? null}
                  sourceCaption={groupUpSourceCaption}
                  sourceSchedule={groupUpSourceSchedule}
                  variant="compact"
                />
              </SocialShelfSurfaceProvider>
            </div>
          ) : null}

          {/* Rating only when present — no empty footer dead space under Duo/Group. */}
          {ratingEnabled ? (
            <div className="mt-1 flex items-center justify-end">
              <PostRatingChip
                ratingEnabled={post?.rating_enabled}
                ratingAverage={
                  post?.effective_rating_average ??
                  post?.rating_average ??
                  null
                }
                ratingCount={
                  post?.effective_rating_count ??
                  post?.rating_count ??
                  null
                }
                viewerRating={post?.viewer_rating ?? null}
                onClick={() => {
                  if (!ensureAuthed()) return;
                  setShowRatingModal(true);
                }}
                className="text-xs h-6 px-2.5"
              />
            </div>
          ) : null}
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
