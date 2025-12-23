import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { type NotificationWithActor } from "../../types/notification";
import { markNotificationAsRead } from "../../api/services/notifications";
import {
  approveFollowRequest,
  declineFollowRequest,
  getFollowStatus,
  getViewerId,
} from "../../api/services/follows";
import { formatDistanceToNow } from "date-fns";
import Avatar from "../ui/Avatar";
import { Paths, profileByUsername } from "../../router/Paths";
import { toast } from "react-hot-toast";
import { supabase } from "../../lib/supabaseClient";
import {
  getCachedFollowRequestStatus,
  setCachedFollowRequestStatus,
} from "../../lib/followRequestStatusCache";
import {
  getCachedFollowStatus,
  setCachedFollowStatus,
  clearCachedFollowStatus,
} from "../../lib/followStatusCache";

interface Props {
  notification: NotificationWithActor;
  onMarkAsRead: (id: string) => void;
  compact?: boolean;
  // [OPTIMIZATION: Phase 1 - Batch] Pre-loaded follow status from batch loader
  initialFollowStatus?: "none" | "pending" | "following" | "friends";
}

// Helper function to determine if follow request is sent or received
const getFollowRequestDirection = async (
  notification: NotificationWithActor
): Promise<"sent" | "received"> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "received"; // Default to received if not authenticated

    // Check additional_data first
    const followerProfileId = notification.additional_data?.follower_profile_id;
    const followingProfileId =
      notification.additional_data?.following_profile_id;

    if (!followerProfileId || !followingProfileId) {
      return "received"; // Default to received if data is missing
    }

    // Get current user's profile ID
    const viewerProfileId = await getViewerId();
    if (!viewerProfileId) return "received";

    // If current user is the follower (requester), it's a sent request
    // If current user is the following (account owner), it's a received request
    if (viewerProfileId === followerProfileId) {
      return "sent";
    } else if (viewerProfileId === followingProfileId) {
      return "received";
    }

    return "received"; // Default to received
  } catch (error) {
    console.error("Error determining follow request direction:", error);
    return "received"; // Default to received on error
  }
};

export default function FollowRequestNotificationItem({
  notification,
  onMarkAsRead,
  compact = false,
  initialFollowStatus,
}: Props) {
  const followerProfileId = notification.additional_data?.follower_profile_id;
  const followingProfileId = notification.additional_data?.following_profile_id;
  const requestStatus =
    notification.additional_data?.follow_request_status || "pending";

  // [OPTIMIZATION: Phase 2 - Cache] Initialize request status from cache synchronously (prevents flickering)
  // Why: Cache check happens before any async operations, instant display of cached status
  const [isProcessing, setIsProcessing] = useState(false);
  const [followRequestStatus, setFollowRequestStatus] = useState<
    "pending" | "approved" | "declined"
  >(() => {
    if (followerProfileId && followingProfileId) {
      const cached = getCachedFollowRequestStatus(
        followerProfileId,
        followingProfileId
      );
      if (cached) return cached;
    }
    return requestStatus as "pending" | "approved" | "declined";
  });
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [requestDirection, setRequestDirection] = useState<
    "sent" | "received" | null
  >(null);

  // [OPTIMIZATION: Phase 1 - Batch] Use batched follow status if provided
  // Why: Skip individual API calls when we have batched data, reduces queries and egress
  useEffect(() => {
    if (initialFollowStatus !== undefined) {
      // Convert follow status to request status format
      let requestStatus: "pending" | "approved" | "declined";
      if (initialFollowStatus === "pending") {
        requestStatus = "pending";
      } else if (
        initialFollowStatus === "following" ||
        initialFollowStatus === "friends"
      ) {
        requestStatus = "approved";
      } else {
        requestStatus = "declined";
      }

      // Update state if different from current
      if (requestStatus !== followRequestStatus) {
        setFollowRequestStatus(requestStatus);
      }

      // Cache the status for future use
      if (followerProfileId && followingProfileId) {
        setCachedFollowRequestStatus(
          followerProfileId,
          followingProfileId,
          requestStatus
        );
      }
    }
  }, [
    initialFollowStatus,
    followerProfileId,
    followingProfileId,
    followRequestStatus,
  ]);

  // [OPTIMIZATION: Phase 2 - Cache] Determine request direction and check status on mount (stale-while-revalidate)
  // Why: Cache both sent and received request statuses, fetch fresh data in background
  // Note: Only runs if initialFollowStatus is not provided (fallback to individual query)
  useEffect(() => {
    // Skip if we already have batched status
    if (initialFollowStatus !== undefined) {
      // Still need to determine direction for UI
      getFollowRequestDirection(notification).then(setRequestDirection);
      return;
    }

    const initializeRequest = async () => {
      // Determine direction
      const direction = await getFollowRequestDirection(notification);
      setRequestDirection(direction);

      if (!followerProfileId || !followingProfileId) return;

      // Cache is already checked synchronously in useState initializer above
      // This ensures no flickering on mount

      // Fetch fresh status from database in background (stale-while-revalidate)
      try {
        const viewerProfileId = await getViewerId();
        if (!viewerProfileId) return;

        // [OPTIMIZATION: Phase 2 - Cache] Cache both sent and received request statuses
        // Why: Both directions need status tracking, cache for instant display
        let freshStatus: "pending" | "approved" | "declined" | null = null;

        if (viewerProfileId === followingProfileId) {
          // Received request: we're the account owner
          const status = await getFollowStatus(
            followerProfileId,
            followingProfileId
          );

          if (status === "pending") {
            freshStatus = "pending";
          } else if (status === "following" || status === "friends") {
            freshStatus = "approved";
          } else {
            freshStatus = "declined";
          }
        } else if (viewerProfileId === followerProfileId) {
          // Sent request: we're the requester
          const status = await getFollowStatus(
            followerProfileId,
            followingProfileId
          );

          if (status === "pending") {
            freshStatus = "pending";
          } else if (status === "following" || status === "friends") {
            freshStatus = "approved";
          } else {
            freshStatus = "declined";
          }
        }

        // Update cache with fresh status (for both sent and received)
        if (freshStatus) {
          setCachedFollowRequestStatus(
            followerProfileId,
            followingProfileId,
            freshStatus
          );

          // Only update UI if status changed (prevents unnecessary re-renders)
          if (freshStatus !== followRequestStatus) {
            setFollowRequestStatus(freshStatus);
          }
        }
      } catch (error) {
        console.error("Error checking follow request status:", error);
        // Keep cached status on error
      }
    };

    initializeRequest();
  }, [
    followerProfileId,
    followingProfileId,
    notification,
    followRequestStatus,
    initialFollowStatus,
  ]);

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

  const handleApproveRequest = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isProcessing || followRequestStatus !== "pending" || !followerProfileId)
      return;

    setIsProcessing(true);
    try {
      const { error } = await approveFollowRequest(followerProfileId);
      if (error) {
        toast.error("Failed to approve follow request");
        return;
      }

      // Update caches immediately
      if (followerProfileId && followingProfileId) {
        setCachedFollowRequestStatus(
          followerProfileId,
          followingProfileId,
          "approved"
        );
        // Update follow status cache
        const viewerProfileId = await getViewerId();
        if (viewerProfileId) {
          setCachedFollowStatus(
            viewerProfileId,
            followerProfileId,
            "following"
          );
        }
      }

      // Fade out buttons first, then update status
      setIsFadingOut(true);
      setTimeout(() => {
        setFollowRequestStatus("approved");
        setIsFadingOut(false);
      }, 300);

      toast.success("Follow request approved!");
      await markNotificationAsRead(notification.id);
      onMarkAsRead(notification.id);
    } catch (error) {
      console.error("Failed to approve follow request:", error);
      toast.error("Failed to approve follow request");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeclineRequest = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isProcessing || followRequestStatus !== "pending" || !followerProfileId)
      return;

    setIsProcessing(true);
    try {
      const { error } = await declineFollowRequest(followerProfileId);
      if (error) {
        toast.error("Failed to decline follow request");
        return;
      }

      // Update caches immediately
      if (followerProfileId && followingProfileId) {
        setCachedFollowRequestStatus(
          followerProfileId,
          followingProfileId,
          "declined"
        );
        // Clear follow status cache (they're no longer following)
        const viewerProfileId = await getViewerId();
        if (viewerProfileId) {
          clearCachedFollowStatus(followerProfileId);
        }
      }

      // Fade out buttons first, then update status
      setIsFadingOut(true);
      setTimeout(() => {
        setFollowRequestStatus("declined");
        setIsFadingOut(false);
      }, 300);

      toast.success("Follow request declined");
      await markNotificationAsRead(notification.id);
      onMarkAsRead(notification.id);
    } catch (error) {
      console.error("Failed to decline follow request:", error);
      toast.error("Failed to decline follow request");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevertStatus = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      isProcessing ||
      followRequestStatus === "pending" ||
      !followerProfileId ||
      !followingProfileId
    )
      return;

    setIsProcessing(true);
    try {
      // To revert, we need to update the follow status back to pending
      // This requires updating the follows table directly
      const viewerProfileId = await getViewerId();
      if (!viewerProfileId || viewerProfileId !== followingProfileId) {
        toast.error("Not authorized to revert this request");
        return;
      }

      const { error } = await supabase
        .from("follows")
        .update({ status: "pending" })
        .eq("follower_id", followerProfileId)
        .eq("following_id", followingProfileId);

      if (error) {
        toast.error("Failed to revert follow request");
        return;
      }

      // Update caches immediately
      setCachedFollowRequestStatus(
        followerProfileId,
        followingProfileId,
        "pending"
      );
      const currentViewerId = await getViewerId();
      if (currentViewerId) {
        setCachedFollowStatus(currentViewerId, followerProfileId, "pending");
      }

      // Fade out status text first, then show buttons again
      setIsFadingOut(true);
      setTimeout(() => {
        setFollowRequestStatus("pending");
        setIsFadingOut(false);
      }, 300);

      toast.success("Follow request reverted to pending");
    } catch (error) {
      console.error("Failed to revert follow request:", error);
      toast.error("Failed to revert follow request");
    } finally {
      setIsProcessing(false);
    }
  };

  const actorName =
    notification.actor?.display_name ||
    notification.actor?.username ||
    "Someone";

  // Determine notification text based on direction
  const notificationText =
    requestDirection === "sent"
      ? `You followed ${actorName} - Waiting for approval`
      : `${actorName} requested to follow you`;

  const linkTo = notification.actor?.username
    ? profileByUsername(notification.actor.username)
    : "#";

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  // Determine bottom border color based on direction
  const bottomBorderColor =
    requestDirection === "sent"
      ? "border-b-blue-500" // Blue for sent requests
      : "border-b-green-500"; // Green for received requests

  if (compact) {
    return (
      <div
        className={`p-3 border-b-2 ${bottomBorderColor} last:border-b-0 ${
          !notification.is_read ? "border-l-4 border-l-green-500" : ""
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
              {requestDirection === "sent" ? (
                // Sent request: Show status badge
                <div
                  className={`px-3 py-1.5 text-xs rounded-full ${
                    followRequestStatus === "approved"
                      ? "bg-green-500/20 text-green-500 border border-green-500/30"
                      : followRequestStatus === "declined"
                      ? "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                      : "bg-blue-500/20 text-blue-500 border border-blue-500/30"
                  }`}
                >
                  {followRequestStatus === "approved"
                    ? "Approved"
                    : followRequestStatus === "declined"
                    ? "Declined"
                    : "Waiting"}
                </div>
              ) : // Received request: Show Approve/Decline buttons or status
              followRequestStatus === "pending" ? (
                <div
                  className={`flex flex-wrap gap-2 transition-opacity duration-300 ${
                    isFadingOut ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <button
                    onClick={handleApproveRequest}
                    disabled={isProcessing}
                    className="px-3 py-1.5 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? "..." : "Approve"}
                  </button>
                  <button
                    onClick={handleDeclineRequest}
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
                    followRequestStatus === "approved"
                      ? "bg-green-500/20 text-green-500 border border-green-500/30 hover:bg-green-500/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30"
                  }`}
                  title="Click to undo"
                >
                  {isProcessing
                    ? "..."
                    : followRequestStatus === "approved"
                    ? "Approved"
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
          : "bg-[var(--surface-2)] border-l-4 border-l-green-500"
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
            <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0 mt-1" />
          )}
        </div>

        <div className="text-xs text-[var(--text)]/50 mt-1.5">{timeAgo}</div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {requestDirection === "sent" ? (
            // Sent request: Show status badge and "View Profile" button
            <>
              <div
                className={`px-3 py-1 text-xs rounded-full ${
                  followRequestStatus === "approved"
                    ? "bg-green-500/20 text-green-500 border border-green-500/30"
                    : followRequestStatus === "declined"
                    ? "bg-gray-500/20 text-gray-400 border border-gray-500/30"
                    : "bg-blue-500/20 text-blue-500 border border-blue-500/30"
                }`}
              >
                {followRequestStatus === "approved"
                  ? "Approved"
                  : followRequestStatus === "declined"
                  ? "Declined"
                  : "Waiting"}
              </div>
              <Link
                to={linkTo}
                onClick={handleClick}
                className="px-3 py-1 text-xs text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-full hover:bg-blue-500/20 transition-colors"
              >
                View Profile
              </Link>
            </>
          ) : (
            // Received request: Show Approve/Decline buttons or status
            <>
              {followRequestStatus === "pending" ? (
                <div
                  className={`flex flex-wrap gap-2 transition-opacity duration-300 ${
                    isFadingOut ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <button
                    onClick={handleApproveRequest}
                    disabled={isProcessing}
                    className="px-3 py-1 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? "..." : "Approve"}
                  </button>
                  <button
                    onClick={handleDeclineRequest}
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
                    followRequestStatus === "approved"
                      ? "bg-green-500/20 text-green-500 border border-green-500/30 hover:bg-green-500/30"
                      : "bg-gray-500/20 text-gray-400 border border-gray-500/30 hover:bg-gray-500/30"
                  }`}
                  title="Click to undo"
                >
                  {isProcessing
                    ? "..."
                    : followRequestStatus === "approved"
                    ? "Approved"
                    : "Declined"}
                </button>
              )}
              <Link
                to={linkTo}
                onClick={handleClick}
                className="px-3 py-1 text-xs text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-full hover:bg-blue-500/20 transition-colors"
              >
                View Profile
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
