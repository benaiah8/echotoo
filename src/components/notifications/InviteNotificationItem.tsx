import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { type NotificationWithActor } from "../../types/notification";
import { markNotificationAsRead } from "../../api/services/notifications";
import {
  acceptInvite,
  declineInvite,
  getInviteById,
  revertInviteToPending,
} from "../../api/services/invites";
import { formatDistanceToNow } from "date-fns";
import Avatar from "../ui/Avatar";
import { Paths } from "../../router/Paths";
import { toast } from "react-hot-toast";
import { supabase } from "../../lib/supabaseClient";
import { getViewerId, getViewerAuthUserId } from "../../api/services/follows";
import {
  getCachedInviteStatus,
  setCachedInviteStatus,
} from "../../lib/inviteStatusCache";

/** Module-level cache for getInviteById results to avoid duplicate fetches per invite row. TTL 3 min. */
const INVITE_BY_ID_TTL_MS = 3 * 60 * 1000;
const inviteByIdCache = new Map<string, { data: any; ts: number }>();

function getCachedInviteById(inviteId: string): any | null {
  const entry = inviteByIdCache.get(inviteId);
  if (!entry || Date.now() - entry.ts > INVITE_BY_ID_TTL_MS) {
    if (entry) inviteByIdCache.delete(inviteId);
    return null;
  }
  return entry.data;
}

function setCachedInviteById(inviteId: string, data: any): void {
  inviteByIdCache.set(inviteId, { data, ts: Date.now() });
}

interface Props {
  notification: NotificationWithActor;
  onMarkAsRead: (id: string) => void;
  compact?: boolean;
  showGoToPostButton?: boolean;
  onInviteAccepted?: (postId: string) => void; // NEW: callback when invite is accepted
}

export default function InviteNotificationItem({
  notification,
  onMarkAsRead,
  compact = false,
  showGoToPostButton = true,
  onInviteAccepted,
}: Props) {
  const location = useLocation();
  const inviteId = notification.additional_data?.invite_id;

  // Initialize inviteStatus from cache synchronously (prevents flickering)
  const [isProcessing, setIsProcessing] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<
    "pending" | "accepted" | "declined"
  >(() => {
    if (inviteId) {
      const cached = getCachedInviteStatus(inviteId);
      if (cached) return cached;
    }
    return "pending";
  });
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [inviteDirection, setInviteDirection] = useState<
    "sent" | "received" | null
  >(null);

  // Determine invite direction and status on mount. At most one getInviteById per inviteId (cached).
  // If notification.additional_data has invite_direction or invite_status, skip getInviteById entirely.
  // Deps: [inviteId] only to avoid re-fetch on parent re-renders (notification ref can change).
  useEffect(() => {
    const additionalData = notification.additional_data;
    const directionFromData = additionalData?.invite_direction;
    const statusFromData =
      additionalData?.invite_status ?? additionalData?.status;

    // Skip getInviteById when direction/status already in additional_data
    if (directionFromData === "sent" || directionFromData === "received") {
      setInviteDirection(directionFromData);
      const validStatus =
        statusFromData === "accepted" ||
        statusFromData === "declined" ||
        statusFromData === "pending"
          ? statusFromData
          : inviteId
          ? getCachedInviteStatus(inviteId)
          : null;
      if (validStatus) {
        setInviteStatus(validStatus);
      }
      return;
    }

    if (!inviteId) return;

    let invite: any = getCachedInviteById(inviteId);
    if (!invite) {
      getInviteById(inviteId)
        .then(({ data, error }) => {
          if (error || !data) return;
          setCachedInviteById(inviteId, data);
          const userId = getViewerAuthUserId();
          return userId.then((uid) => {
            const dir: "sent" | "received" =
              data.inviter_id === uid ? "sent" : "received";
            setInviteDirection(dir);
            const freshStatus =
              data.status === "accepted" || data.status === "declined"
                ? data.status
                : "pending";
            setCachedInviteStatus(inviteId, freshStatus);
            setInviteStatus(freshStatus);
          });
        })
        .catch((err) => console.error("Error fetching invite:", err));
      return;
    }

    // Cached invite: sync path, no fetch
    getViewerAuthUserId().then((userId) => {
      const dir: "sent" | "received" =
        userId && invite.inviter_id === userId ? "sent" : "received";
      setInviteDirection(dir);
      const freshStatus =
        invite.status === "accepted" || invite.status === "declined"
          ? invite.status
          : "pending";
      setCachedInviteStatus(inviteId, freshStatus);
      setInviteStatus(freshStatus);
    });
  }, [inviteId]); // inviteId only - prevents re-run on parent re-renders

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

    if (isProcessing || inviteStatus !== "pending" || !inviteId) return;

    setIsProcessing(true);
    try {
      if (!inviteId) {
        toast.error("Invalid invite");
        return;
      }

      const { error } = await acceptInvite(inviteId);
      if (error) {
        toast.error("Failed to accept invite");
        return;
      }

      // Update cache immediately
      if (inviteId) {
        setCachedInviteStatus(inviteId, "accepted");
      }

      // Fade out buttons first, then update status
      setIsFadingOut(true);
      setTimeout(() => {
        setInviteStatus("accepted");
        setIsFadingOut(false);

        // Trigger refresh of interacted posts
        const postId = notification.additional_data?.post_id;
        if (postId && onInviteAccepted) {
          onInviteAccepted(postId);
        }
      }, 300); // Wait for fade-out animation to complete

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

    if (isProcessing || inviteStatus !== "pending" || !inviteId) return;

    setIsProcessing(true);
    try {
      if (!inviteId) {
        toast.error("Invalid invite");
        return;
      }

      const { error } = await declineInvite(inviteId);
      if (error) {
        toast.error("Failed to decline invite");
        return;
      }

      // Update cache immediately
      if (inviteId) {
        setCachedInviteStatus(inviteId, "declined");
      }

      // Fade out buttons first, then update status
      setIsFadingOut(true);
      setTimeout(() => {
        setInviteStatus("declined");
        setIsFadingOut(false);
      }, 300); // Wait for fade-out animation to complete

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

  const handleRevertStatus = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isProcessing || inviteStatus === "pending" || !inviteId) return;

    setIsProcessing(true);
    try {
      if (!inviteId) {
        toast.error("Invalid invite");
        return;
      }

      const { error } = await revertInviteToPending(inviteId);
      if (error) {
        toast.error("Failed to revert invite");
        return;
      }

      // Update cache immediately
      if (inviteId) {
        setCachedInviteStatus(inviteId, "pending");
      }

      // Fade out status text first, then show buttons again
      setIsFadingOut(true);
      setTimeout(() => {
        setInviteStatus("pending");
        setIsFadingOut(false);
      }, 300); // Wait for fade-out animation to complete

      toast.success("Invite reverted to pending");
    } catch (error) {
      console.error("Failed to revert invite:", error);
      toast.error("Failed to revert invite");
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

  // Determine notification text based on direction
  const notificationText =
    inviteDirection === "sent"
      ? `You invited ${actorName} to ${
          postType === "hangout" ? "a hangout" : "an experience"
        }`
      : `${actorName} invited you to ${
          postType === "hangout" ? "a hangout" : "an experience"
        }`;

  const linkTo = notification.additional_data?.post_id
    ? `${Paths.experience}/${notification.additional_data.post_id}`
    : "#";

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  // Determine bottom border color based on direction
  const bottomBorderColor =
    inviteDirection === "sent"
      ? "border-b-blue-500" // Blue for sent invites
      : "border-b-yellow-500"; // Yellow for received invites

  if (compact) {
    return (
      <div
        className={`p-3 border-b-2 ${bottomBorderColor} last:border-b-0 ${
          !notification.is_read ? "border-l-4 border-l-blue-500" : ""
        }`}
        style={{
          borderBottomWidth: "2px",
        }}
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
              {inviteDirection === "sent" ? (
                // Sent invite: Show "Invited" status and "View Post" button
                <>
                  <div className="px-3 py-1.5 text-xs rounded-full bg-blue-500/20 text-blue-500 border border-blue-500/30">
                    {inviteStatus === "accepted"
                      ? "Accepted"
                      : inviteStatus === "declined"
                      ? "Declined"
                      : "Invited"}
                  </div>
                  {showGoToPostButton && (
                    <Link
                      to={linkTo}
                      state={{ backgroundLocation: location }}
                      onClick={handleClick}
                      className="px-3 py-1.5 text-xs text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-full hover:bg-blue-500/20 transition-colors"
                    >
                      View Post
                    </Link>
                  )}
                </>
              ) : // Received invite: Show Accept/Decline buttons or status
              inviteStatus === "pending" ? (
                <div
                  className={`flex flex-wrap gap-2 transition-opacity duration-300 ${
                    isFadingOut ? "opacity-0" : "opacity-100"
                  }`}
                >
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
              ) : (
                <button
                  onClick={handleRevertStatus}
                  disabled={isProcessing}
                  className={`px-3 py-1.5 text-xs rounded-full transition-opacity duration-300 cursor-pointer hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isFadingOut ? "opacity-0" : "opacity-100"
                  } ${
                    inviteStatus === "accepted"
                      ? "bg-green-500/20 text-green-500 border border-green-500/30 hover:bg-green-500/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30"
                  }`}
                  title="Click to undo"
                >
                  {isProcessing
                    ? "..."
                    : inviteStatus === "accepted"
                    ? "Accepted"
                    : "Declined"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-lg p-3 gap-3 flex transition-colors border-b-2 ${bottomBorderColor} ${
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

        <div className="text-xs text-[var(--text)]/50 mt-1.5">{timeAgo}</div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {inviteDirection === "sent" ? (
            // Sent invite: Show "Invited" status badge and "View Post" button
            <>
              <div className="px-3 py-1 text-xs rounded-full bg-blue-500/20 text-blue-500 border border-blue-500/30">
                {inviteStatus === "accepted"
                  ? "Accepted"
                  : inviteStatus === "declined"
                  ? "Declined"
                  : "Invited"}
              </div>
              {showGoToPostButton && (
                <Link
                  to={linkTo}
                  state={{ backgroundLocation: location }}
                  onClick={handleClick}
                  className="px-3 py-1 text-xs text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-full hover:bg-blue-500/20 transition-colors"
                >
                  View Post
                </Link>
              )}
            </>
          ) : (
            // Received invite: Show Accept/Decline buttons or status
            <>
              {inviteStatus === "pending" ? (
                <div
                  className={`flex flex-wrap gap-2 transition-opacity duration-300 ${
                    isFadingOut ? "opacity-0" : "opacity-100"
                  }`}
                >
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
                </div>
              ) : (
                <button
                  onClick={handleRevertStatus}
                  disabled={isProcessing}
                  className={`px-3 py-1 text-xs rounded-full transition-opacity duration-300 cursor-pointer hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isFadingOut ? "opacity-0" : "opacity-100"
                  } ${
                    inviteStatus === "accepted"
                      ? "bg-green-500/20 text-green-500 border border-green-500/30 hover:bg-green-500/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30"
                  }`}
                  title="Click to undo"
                >
                  {isProcessing
                    ? "..."
                    : inviteStatus === "accepted"
                    ? "Accepted"
                    : "Declined"}
                </button>
              )}
              {showGoToPostButton && (
                <Link
                  to={linkTo}
                  state={{ backgroundLocation: location }}
                  onClick={handleClick}
                  className="px-3 py-1 text-xs text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-full hover:bg-blue-500/20 transition-colors"
                >
                  View Post
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
