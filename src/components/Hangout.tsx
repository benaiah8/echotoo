import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { MdMoreHoriz, MdEdit, MdDelete, MdPersonAdd } from "react-icons/md";
import Avatar from "./ui/Avatar";
import FollowButton from "./ui/FollowButton";
import InviteDrawer from "./ui/InviteDrawer";
import SaveButton from "./ui/SaveButton";
import { getPostForEdit, deletePost } from "../api/services/posts";
import { Paths } from "../router/Paths";
import toast from "react-hot-toast";
import { getDatePriorityLabel } from "../lib/feedSorting";

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
}: Props) {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showInviteDrawer, setShowInviteDrawer] = useState(false);
  const [isInviteDrawerClosing, setIsInviteDrawerClosing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isDraft = status === "draft";

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

  const handleEdit = async () => {
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
    try {
      await deletePost(id);
      toast.success("Hangout deleted successfully");
      onDelete?.();
      setShowDeleteModal(false);
    } catch (error) {
      console.error("Error deleting hangout:", error);
      toast.error("Failed to delete hangout");
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
        console.log("Hangout navigating to:", id);
        navigate(`/hangout/${id}`);
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
          navigate(`/hangout/${id}`);
        }
      }}
      className="w-[38vw] min-w-[180px] max-w-[240px] shrink-0 cursor-pointer"
    >
      {/* allow corner badge to hang outside */}
      <div
        className={`relative overflow-visible ui-card p-3 flex flex-col gap-2 mb-3 ${
          isDraft ? "opacity-60" : ""
        }`}
      >
        {/* save button: bottom-left, slightly outside, no content overlap */}
        <div
          className="absolute -bottom-3 -left-3 z-10"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <SaveButton
            postId={id}
            className="grid place-items-center h-8 w-8 rounded-full bg-[var(--surface)]/80 border border-[var(--border)] shadow-lg"
            size={18}
          />
        </div>

        {/* author row */}
        <div className="flex items-center gap-2">
          <Avatar
            url={isAnonymous ? null : avatarUrl}
            name={authorHandle ?? ""}
            size={24}
            postType={type}
            variant={isAnonymous ? "anon" : "default"}
            anonymousAvatar={isAnonymous ? authorHandle?.charAt(0) : undefined}
          />
          <span className="text-xs text-[var(--text)]/80 truncate">
            {authorHandle}
          </span>
          {isDraft && (
            <span className="px-1.5 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-600 rounded-full border border-yellow-500/30">
              Draft
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {/* Date priority label */}
            {(() => {
              const priorityLabel = getDatePriorityLabel({
                selected_dates: selectedDates,
              } as any);
              if (priorityLabel) {
                const getPriorityColor = (label: string) => {
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
                };
                return (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] rounded-full border ${getPriorityColor(
                      priorityLabel
                    )}`}
                  >
                    {priorityLabel}
                  </span>
                );
              }
              return (
                <span className="text-xs text-[var(--text)]/50">
                  {new Date(createdAt).toLocaleDateString()}
                </span>
              );
            })()}
          </div>
        </div>

        {/* caption: clamp to 3 lines for equal height */}
        <div
          className="mt-1 text-[13px] leading-5 text-[var(--text)]/95"
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
              <div ref={menuRef} className="relative flex items-center h-full">
                <div
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-full w-8 h-5 shadow-sm flex items-center justify-center gap-0.5 cursor-pointer hover:bg-[var(--surface)]/80 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setIsMenuOpen(!isMenuOpen);
                  }}
                >
                  <div className="w-1 h-1 bg-[var(--text)]/70 rounded-full"></div>
                  <div className="w-1 h-1 bg-[var(--text)]/70 rounded-full"></div>
                  <div className="w-1 h-1 bg-[var(--text)]/70 rounded-full"></div>
                </div>

                {/* Dropdown menu */}
                {isMenuOpen && (
                  <div className="absolute right-0 top-6 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[120px] z-50">
                    {!isDraft && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setIsMenuOpen(false);
                          handleInvite();
                        }}
                        className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface)]/50 flex items-center gap-2"
                      >
                        <MdPersonAdd size={16} />
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
                      className="w-full px-3 py-2 text-left text-sm text-[var(--text)] hover:bg-[var(--surface)]/50 flex items-center gap-2"
                    >
                      <MdEdit size={16} />
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
                      <MdDelete size={16} />
                      Delete
                    </button>
                  </div>
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
                />
              ) : (
                // Show Follow button for hangouts too in horizontal rail
                <FollowButton
                  targetId={authorId}
                  className="text-xs h-5 min-w-[60px] px-2"
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
            <div className="text-sm font-semibold mb-1">Delete hangout?</div>
            <p className="text-xs text-[var(--text)]/70 mb-3">
              Are you sure you want to delete this hangout? This action cannot
              be undone.
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
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

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
