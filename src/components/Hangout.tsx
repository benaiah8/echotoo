import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { Paths } from "../router/Paths";

import { PiPencilSimple, PiTrash, PiUserPlus } from "react-icons/pi";
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
  buildCanonicalEditPostData,
  createEditActivitiesHref,
  persistCanonicalEditPostData,
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
import { discardAllDrafts } from "../lib/drafts";
import RailCardImageBackdrop from "./RailCardImageBackdrop";
import useAuthActionGate from "../hooks/useAuthActionGate";

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [railImageFailed, setRailImageFailed] = useState(false);
  const { ensureAuthed } = useAuthActionGate();
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isDraft = status === "draft";
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
      toast.error("Failed to load hangout for editing");
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
      await deletePost(id);
      toast.success("Hangout deleted successfully");
      emitPostDeleted(id);
      onDelete?.();
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Error deleting hangout:", error);
      toast.error("Failed to delete hangout");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInvite = () => {
    console.log("Opening invite drawer for hangout:", id);
    setShowInviteDrawer(true);
  };

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
            isOwner ? "left-11" : "left-3"
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
          {/* Date / priority strip — compact pill above avatar row */}
          <div className="w-full min-w-0 mb-2">
            <span
              className={
                railScheduleLabelUsesPill(scheduleLabel.kind)
                  ? `block w-full text-center px-2.5 py-1 text-[9px] leading-tight rounded-full whitespace-nowrap overflow-hidden text-ellipsis border ${railLabelClassName}`
                  : `block w-full text-center text-[9px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis ${railLabelClassName}`
              }
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
            {/* Three dots menu for owner's hangouts */}
            <div className="flex items-center h-full">
              {isOwner ? (
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
                        {!isDraft && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setIsMenuOpen(false);
                              handleInvite();
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--glass-active-bg)] flex items-center gap-2"
                          >
                            <PiUserPlus size={16} />
                            Invite
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setIsMenuOpen(false);
                            handleEdit();
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--glass-active-bg)] flex items-center gap-2"
                        >
                          <PiPencilSimple size={16} />
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setIsMenuOpen(false);
                            setShowDeleteModal(true);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                        >
                          <PiTrash size={16} />
                          Delete
                        </button>
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
        title="Delete hangout?"
        message="Are you sure you want to delete this hangout? This action cannot be undone."
        confirmLabel="Delete"
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
    </div>
  );
}
