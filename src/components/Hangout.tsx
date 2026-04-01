import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";

import { PiPencilSimple, PiTrash, PiUserPlus } from "react-icons/pi";
import Avatar from "./ui/Avatar";
import FollowButton from "./ui/FollowButton";
import InviteDrawer from "./ui/InviteDrawer";
import SaveButton from "./ui/SaveButton";
import ConfirmDialog from "./ui/ConfirmDialog";
import { getPostForEdit, deletePost } from "../api/services/posts";
import { Paths } from "../router/Paths";
import toast from "react-hot-toast";
import { getDatePriorityLabel } from "../lib/feedSorting";
import { type FeedItem } from "../api/queries/getPublicFeed";
import { getRailCardCoverUrl } from "../lib/railCardCoverUrl";
import RailCardImageBackdrop from "./RailCardImageBackdrop";

function getPriorityColorClass(label: string) {
  switch (label) {
    case "Today":
      return "bg-green-500/20 text-green-600 border-green-500/30";
    case "Tomorrow":
      return "bg-yellow-500/20 text-yellow-600 border-yellow-500/30";
    case "This Weekend":
      return "bg-purple-500/20 text-purple-600 border-purple-500/30";
    default:
      return "bg-gray-500/20 text-gray-600 border-gray-500/30";
  }
}

/** Frosted glass + accent border when rail card has a cover image */
function getRailPriorityPillClass(label: string) {
  const accent = (() => {
    switch (label) {
      case "Today":
        return "border-green-500/55 ring-1 ring-inset ring-green-500/35";
      case "Tomorrow":
        return "border-amber-400/65 ring-1 ring-inset ring-amber-400/45";
      case "This Weekend":
        return "border-purple-500/55 ring-1 ring-inset ring-purple-500/40";
      default:
        return "border-[var(--border)]";
    }
  })();
  return `backdrop-blur-[var(--glass-blur)] bg-[var(--glass-bg)] text-[var(--text)] shadow-[var(--rail-card-pill-shadow)] border ${accent}`;
}

const RAIL_DATE_PILL_CLASS =
  "backdrop-blur-[var(--glass-blur)] bg-[var(--glass-bg)] border border-[var(--border)] text-[var(--text)] shadow-[var(--rail-card-pill-shadow)]";

type Props = {
  id: string; // NEW
  caption: string;
  createdAt: string; // ISO timestamp
  isOwner?: boolean; // NEW: whether this is the current user's own hangout
  onDelete?: () => void; // NEW: callback when hangout is deleted
  status?: "draft" | "published"; // NEW: post status for visual indicators
  selectedDates?: string[] | null; // NEW: event dates for priority sorting
  type?: "hangout" | "experience"; // NEW: post type for avatar indicator

  capacity?: number; // max RSVPs
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
  capacity = 20,
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
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [railImageFailed, setRailImageFailed] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isDraft = status === "draft";
  // Prefer post object when provided (patched by post:changed); fallback to primitive props
  const effectiveIsSaved = post?.is_saved ?? isSaved;
  const effectiveFollowStatus = post?.follow_status ?? followStatus;

  const priorityLabel = getDatePriorityLabel({
    selected_dates: selectedDates,
  } as any);

  const railCoverUrl = useMemo(() => getRailCardCoverUrl(post), [post]);
  const showRailCover = Boolean(railCoverUrl && !railImageFailed);

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
      navigate("/create/activities?type=hangout");
      return;
    }
    try {
      const { post, activities } = await getPostForEdit(id);

      // Store the post data in localStorage for the edit flow
      const editData = {
        postId: post.id,
        type: post.type,
        caption: post.caption,
        visibility: post.visibility,
        is_anonymous: post.is_anonymous,
        rsvp_capacity: post.rsvp_capacity,
        selected_dates: post.selected_dates,
        is_recurring: post.is_recurring,
        recurrence_days: post.recurrence_days,
        tags: post.tags,
        activities: activities.map((activity) => ({
          id: activity.id,
          title: activity.title,
          activityType: activity.activity_type || "",
          customActivity: activity.custom_activity || "",
          locationDesc: activity.location_desc || "",
          location: activity.location_name || "",
          locationNotes: activity.location_notes || "",
          locationUrl: activity.location_url || "",
          additionalInfo: activity.additional_info || [],
          tags: activity.tags || [],
          images: activity.images || [],
          order_idx: activity.order_idx,
        })),
      };

      localStorage.setItem("editPostData", JSON.stringify(editData));

      // Navigate to the activities page (first step of edit flow)
      navigate(Paths.createActivities);
    } catch (error) {
      console.error("Error loading hangout for edit:", error);
      toast.error("Failed to load hangout for editing");
    }
  };

  const handleDelete = async () => {
    if (isDraft || id.startsWith("draft-")) {
      // Skip DB delete; drafts live in localStorage. TODO: Parent should clear cache/refresh to remove card.
      localStorage.removeItem("draftMeta");
      localStorage.removeItem("draftActivities");
      toast.success("Draft discarded");
      setShowDeleteModal(false);
      return;
    }
    setIsDeleting(true);
    try {
      await deletePost(id);
      toast.success("Hangout deleted successfully");
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
          navigate("/create/activities?type=hangout");
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
            navigate("/create/activities?type=hangout");
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
      {/* allow corner badge to hang outside; overflow-visible so save pill is not clipped */}
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

        {/* save button: bottom-left, slightly outside, no content overlap */}
        <div
          className="absolute -bottom-3 -left-3 z-20"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <SaveButton
            postId={id}
            className="grid place-items-center h-8 w-8 rounded-full bg-[var(--surface)]/80 border border-[var(--border)] shadow-lg"
            size={18}
            isSaved={effectiveIsSaved}
            post={post}
          />
        </div>

        <div className="relative z-10 flex flex-col gap-2">
          {/* Date / priority strip — compact pill above avatar row */}
          <div className="w-full min-w-0 mb-2">
            {priorityLabel ? (
              <span
                className={`block w-full text-center px-2.5 py-1 text-[9px] leading-tight rounded-full whitespace-nowrap overflow-hidden text-ellipsis border ${
                  showRailCover
                    ? getRailPriorityPillClass(priorityLabel)
                    : getPriorityColorClass(priorityLabel)
                }`}
              >
                {priorityLabel}
              </span>
            ) : (
              <span
                className={`block w-full text-center px-2.5 py-1 text-[9px] leading-tight rounded-full border whitespace-nowrap overflow-hidden text-ellipsis ${
                  showRailCover
                    ? RAIL_DATE_PILL_CLASS
                    : "text-[var(--text)]/60 border-[var(--border)]/60 bg-[var(--text)]/[0.04]"
                }`}
              >
                {new Date(createdAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* author row */}
          <div className="flex items-center gap-2 min-w-0">
            <Avatar
              url={isAnonymous ? null : avatarUrl}
              name={authorHandle ?? ""}
              size={24}
              postType={type}
              variant={isAnonymous ? "anon" : "default"}
              anonymousAvatar={
                isAnonymous ? authorHandle?.charAt(0) : undefined
              }
            />
            <span className="text-xs text-[var(--text)]/80 truncate min-w-0 flex-1">
              {authorHandle}
            </span>
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

            {/* Action Button */}
            <div className="flex items-center h-full">
              {authorId ? (
                type === "experience" ? (
                  // Show Follow button for experiences (horizontal rail)
                  <FollowButton
                    targetId={authorId}
                    className="text-xs h-5 min-w-[60px] px-2"
                    followStatus={effectiveFollowStatus}
                  />
                ) : (
                  // Show Follow button for hangouts too in horizontal rail
                  <FollowButton
                    targetId={authorId}
                    className="text-xs h-5 min-w-[60px] px-2"
                    followStatus={effectiveFollowStatus}
                  />
                )
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
    </div>
  );
}
