import React, { useState } from "react";
import { Link } from "react-router-dom";
import { type NotificationWithActor } from "../../types/notification";
import { markNotificationAsRead } from "../../api/services/notifications";
import { acceptInvite, declineInvite } from "../../api/services/invites";
import { formatDistanceToNow } from "date-fns";
import Avatar from "../ui/Avatar";
import { Paths } from "../../router/Paths";
import { toast } from "react-hot-toast";

interface Props {
  notification: NotificationWithActor;
  onMarkAsRead: (id: string) => void;
  compact?: boolean;
  showGoToPostButton?: boolean;
}

export default function InviteNotificationItem({
  notification,
  onMarkAsRead,
  compact = false,
  showGoToPostButton = true,
}: Props) {
  const [isProcessing, setIsProcessing] = useState(false);

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

  const handleAcceptInvite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isProcessing) return;

    setIsProcessing(true);
    try {
      const inviteId = notification.additional_data?.invite_id;
      if (!inviteId) {
        toast.error("Invalid invite");
        return;
      }

      const { error } = await acceptInvite(inviteId);
      if (error) {
        toast.error("Failed to accept invite");
        return;
      }

      toast.success("Invite accepted!");
      await markNotificationAsRead(notification.id);
      onMarkAsRead(notification.id);
    } catch (error) {
      console.error("Failed to accept invite:", error);
      toast.error("Failed to accept invite");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeclineInvite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isProcessing) return;

    setIsProcessing(true);
    try {
      const inviteId = notification.additional_data?.invite_id;
      if (!inviteId) {
        toast.error("Invalid invite");
        return;
      }

      const { error } = await declineInvite(inviteId);
      if (error) {
        toast.error("Failed to decline invite");
        return;
      }

      toast.success("Invite declined");
      await markNotificationAsRead(notification.id);
      onMarkAsRead(notification.id);
    } catch (error) {
      console.error("Failed to decline invite:", error);
      toast.error("Failed to decline invite");
    } finally {
      setIsProcessing(false);
    }
  };

  const actorName =
    notification.actor?.display_name ||
    notification.actor?.username ||
    "Someone";

  const postCaption = notification.additional_data?.post_caption || "an event";
  const postType = notification.additional_data?.post_type || "hangout";

  const notificationText = `${actorName} invited you to ${
    postType === "hangout" ? "a hangout" : "an experience"
  }`;

  const linkTo = notification.additional_data?.post_id
    ? `${Paths.experience}/${notification.additional_data.post_id}`
    : "#";

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  if (compact) {
    return (
      <div
        className={`p-3 border-b border-[var(--border)] last:border-b-0 ${
          !notification.is_read ? "border-l-4 border-l-blue-500" : ""
        }`}
      >
        <div className="flex gap-3">
          <Avatar
            variant="default"
            url={notification.actor?.avatar_url || undefined}
            name={
              notification.actor?.display_name ||
              notification.actor?.username ||
              undefined
            }
            size={32}
          />
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm ${
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
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={handleAcceptInvite}
                disabled={isProcessing}
                className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {isProcessing ? "..." : "Accept"}
              </button>
              <button
                onClick={handleDeclineInvite}
                disabled={isProcessing}
                className="px-3 py-1.5 text-xs bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isProcessing ? "..." : "Decline"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-lg p-3 gap-3 flex transition-colors ${
        notification.is_read
          ? "bg-[var(--surface-2)] hover:bg-[var(--surface-2)]/80"
          : "bg-[var(--surface-2)] border-l-4 border-l-blue-500"
      }`}
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
          size={48}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={`text-sm leading-relaxed flex-1 ${
              notification.is_read
                ? "text-[var(--text)]/70"
                : "text-[var(--text)]"
            }`}
          >
            {notificationText}
          </p>
          {!notification.is_read && (
            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
          )}
        </div>

        <div className="text-xs text-[var(--text)]/50 mt-1.5">
          {timeAgo}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={handleAcceptInvite}
            disabled={isProcessing}
            className="px-3 py-1 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {isProcessing ? "..." : "Accept"}
          </button>
          <button
            onClick={handleDeclineInvite}
            disabled={isProcessing}
            className="px-3 py-1 text-xs bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {isProcessing ? "..." : "Decline"}
          </button>
          {showGoToPostButton && (
            <Link
              to={linkTo}
              onClick={handleClick}
              className="px-3 py-1 text-xs text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-full hover:bg-blue-500/20 transition-colors"
            >
              View Post
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
