import React from "react";
import { Link } from "react-router-dom";
import { type NotificationWithActor } from "../../types/notification";
import { markNotificationAsRead } from "../../api/services/notifications";
import { formatDistanceToNow } from "date-fns";
import Avatar from "../ui/Avatar";
import { Paths, profileByUsername } from "../../router/Paths";
import InviteNotificationItem from "./InviteNotificationItem";
import FollowRequestNotificationItem from "./FollowRequestNotificationItem";

interface Props {
  notification: NotificationWithActor;
  onMarkAsRead: (id: string) => void;
  compact?: boolean;
  showGoToPostButton?: boolean;
  onInviteAccepted?: (postId: string) => void; // NEW: callback when invite is accepted
  // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded follow status for follow request notifications
  batchedFollowStatus?: "none" | "pending" | "following" | "friends";
}

const getNotificationText = (notification: NotificationWithActor): string => {
  const actorName =
    notification.actor?.display_name ||
    notification.actor?.username ||
    "Someone";

  switch (notification.type) {
    case "like":
      return `${actorName} liked your post`;
    case "follow":
      return `${actorName} started following you`;
    case "comment":
      const commentPreview = notification.additional_data?.comment_text || "";
      return commentPreview
        ? `${actorName} commented: "${commentPreview}"`
        : `${actorName} commented on your post`;
    case "invite":
      return `${actorName} invited you to an event`;
    case "saved":
      return `${actorName} saved your post`;
    case "rsvp":
      // Check if this is an invite acceptance
      const inviteStatus = notification.additional_data?.status;
      const postCaption =
        notification.additional_data?.post_caption || "an event";
      const postType = notification.additional_data?.post_type || "hangout";

      if (inviteStatus === "accepted") {
        return `${actorName} accepted your invite to ${
          postType === "hangout" ? "a hangout" : "an experience"
        }`;
      } else if (inviteStatus === "declined") {
        return `${actorName} declined your invite to ${
          postType === "hangout" ? "a hangout" : "an experience"
        }`;
      }
      // Fallback to generic RSVP text
      return `${actorName} RSVP'd to your event`;
    case "post":
      return `${actorName} posted a new ${notification.entity_type}`;
    default:
      return "New notification";
  }
};

const getNotificationLink = (notification: NotificationWithActor): string => {
  if (notification.type === "follow") {
    // Link to the follower's profile
    return notification.actor?.username
      ? profileByUsername(notification.actor.username)
      : "#";
  }

  // For invites, link to the post/page
  if (notification.type === "invite") {
    if (notification.additional_data?.post_id) {
      return `${Paths.experience}/${notification.additional_data.post_id}`;
    }
    return notification.entity_id
      ? `${Paths.experience}/${notification.entity_id}`
      : "#";
  }

  // For likes, comments, saved, RSVP - link to the post
  if (notification.additional_data?.post_id) {
    return notification.type === "comment"
      ? `${Paths.experience}/${notification.additional_data.post_id}#comments`
      : `${Paths.experience}/${notification.additional_data.post_id}`;
  }

  // Fallback to the entity ID if available
  if (
    notification.entity_type === "post" ||
    notification.entity_type === "experience" ||
    notification.entity_type === "hangout"
  ) {
    return `${Paths.experience}/${notification.entity_id}`;
  }

  return "#";
};

export default function NotificationItem({
  notification,
  onMarkAsRead,
  compact = false,
  showGoToPostButton = true,
  onInviteAccepted,
  batchedFollowStatus,
}: Props) {
  // Use specialized component for invite notifications
  if (notification.type === "invite") {
    return (
      <InviteNotificationItem
        notification={notification}
        onMarkAsRead={onMarkAsRead}
        compact={compact}
        showGoToPostButton={showGoToPostButton}
        onInviteAccepted={onInviteAccepted}
      />
    );
  }

  // Use specialized component for follow request notifications
  // Check if this is a follow request (has follow_request_status in additional_data)
  if (
    notification.type === "follow" &&
    notification.additional_data?.follow_request_status
  ) {
    return (
      <FollowRequestNotificationItem
        notification={notification}
        onMarkAsRead={onMarkAsRead}
        compact={compact}
        initialFollowStatus={batchedFollowStatus}
      />
    );
  }

  const handleClick = async () => {
    if (!notification.is_read) {
      try {
        await markNotificationAsRead(notification.id);
        onMarkAsRead(notification.id);
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }
  };

  const linkTo = getNotificationLink(notification);
  const notificationText = getNotificationText(notification);
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  const getBorderColor = () => {
    switch (notification.type) {
      case "like":
        return "border-l-red-500";
      case "follow":
        return "border-l-green-500";
      case "comment":
        return "border-l-yellow-500";
      case "invite":
        return "border-l-blue-500";
      case "saved":
        return "border-l-pink-500";
      case "rsvp":
        return "border-l-purple-500";
      default:
        return "border-l-blue-500";
    }
  };

  const getButtonColor = () => {
    switch (notification.type) {
      case "like":
        return "bg-red-500 hover:bg-red-600";
      case "follow":
        return "bg-green-500 hover:bg-green-600";
      case "comment":
        return "bg-yellow-500 hover:bg-yellow-600";
      case "invite":
        return "bg-blue-500 hover:bg-blue-600";
      case "saved":
        return "bg-pink-500 hover:bg-pink-600";
      case "rsvp":
        return "bg-purple-500 hover:bg-purple-600";
      default:
        return "bg-blue-500 hover:bg-blue-600";
    }
  };

  const getSubtleButtonColor = () => {
    switch (notification.type) {
      case "like":
        return "text-red-500 bg-red-500/10 border-red-500/20 hover:bg-red-500/20";
      case "follow":
        return "text-green-500 bg-green-500/10 border-green-500/20 hover:bg-green-500/20";
      case "comment":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20";
      case "invite":
        return "text-blue-500 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20";
      case "saved":
        return "text-pink-500 bg-pink-500/10 border-pink-500/20 hover:bg-pink-500/20";
      case "rsvp":
        return "text-purple-500 bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20";
      default:
        return "text-blue-500 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20";
    }
  };

  if (compact) {
    return (
      <div
        className={`p-2 border-b border-[var(--border)] last:border-b-0 border-l-3 ${getBorderColor()}`}
      >
        <div className="flex items-center gap-2">
          <Avatar
            variant="default"
            url={notification.actor?.avatar_url || undefined}
            name={
              notification.actor?.display_name ||
              notification.actor?.username ||
              undefined
            }
            size={24}
          />
          <div className="flex-1 min-w-0">
            <p
              className={`text-xs ${
                notification.is_read
                  ? "text-[var(--text)]/70"
                  : "text-[var(--text)]"
              }`}
            >
              {notificationText}
            </p>
            <div className="text-xs text-[var(--text)]/50 mt-0.5">
              {timeAgo}
            </div>
          </div>
          {showGoToPostButton && (
            <Link
              to={linkTo}
              onClick={handleClick}
              className={`px-2 py-1 text-xs rounded-full transition-colors border ${getSubtleButtonColor()}`}
            >
              {notification.type === "follow" ? "Go to profile" : "Go to post"}
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <Link
      to={linkTo}
      onClick={handleClick}
      className={`w-full rounded-lg p-2 gap-2 flex transition-colors bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80 border-l-3 ${getBorderColor()}`}
    >
      <div className="flex-shrink-0">
        <Avatar
          variant="default"
          url={notification.actor?.avatar_url || undefined}
          name={
            notification.actor?.display_name ||
            notification.actor?.username ||
            undefined
          }
          size={32}
          onClick={() => {}}
        />
      </div>

      <div className="flex-1 min-w-0 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs leading-relaxed ${
              notification.is_read
                ? "text-[var(--text)]/70"
                : "text-[var(--text)]"
            }`}
          >
            {notificationText}
          </p>
          <div className="text-xs text-[var(--text)]/50 mt-0.5">{timeAgo}</div>
        </div>

        <div className="flex items-center gap-2 ml-2">
          {!notification.is_read && (
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
          )}
          {showGoToPostButton && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.href = linkTo;
              }}
              className={`px-2 py-1 text-xs rounded-full transition-colors border ${getSubtleButtonColor()}`}
            >
              {notification.type === "follow" ? "Go to profile" : "Go to post"}
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}
