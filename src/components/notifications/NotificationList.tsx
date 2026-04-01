import React, { useState, useEffect, useRef } from "react";
import {
  type NotificationWithActor,
  type NotificationType,
} from "../../types/notification";
import {
  getNotifications,
  markAllNotificationsAsRead,
} from "../../api/services/notifications";
import NotificationItem from "./NotificationItem";
import NotificationFilter from "./NotificationFilter";
import NotificationPermissionBanner from "./NotificationPermissionBanner";
import { toast } from "react-hot-toast";
import {
  getBatchFollowStatuses,
  getViewerId,
  getViewerAuthUserId,
} from "../../api/services/follows";
import { getBatchInvitesByIds } from "../../api/services/invites";
import { setCachedInviteData } from "../../lib/inviteDataCache";
import { setCachedInviteStatus } from "../../lib/inviteStatusCache";
import { logFetchStart } from "../../lib/tabVisibilityDebug";
import { NOTIFICATIONS_TAB_REFRESH_EVENT } from "../../lib/homeRefreshEvents";

interface Props {
  className?: string;
  /** When false, skips initial fetch (e.g. tab hidden). When true, fetches immediately. */
  isVisible?: boolean;
}

/**
 * NotificationList Component
 *
 * [FIX: Phase 1 - Navigation Bug] Switched to LOCAL STATE for filter (like Profile page)
 * Previously used URL search params which caused race condition with navigate()
 * Now uses simple React state - no URL manipulation, no event listeners needed
 */
export default function NotificationList({
  className = "",
  isVisible = true,
}: Props) {
  const [notifications, setNotifications] = useState<NotificationWithActor[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // [FIX] Local state only - no URL params (matches Profile page pattern)
  const [selectedFilter, setSelectedFilter] = useState<
    NotificationType | "all"
  >("all");

  // [OPTIMIZATION: Phase 1 - Batch] Store batched follow statuses for follow request notifications
  // Why: Batch load all follow statuses at once instead of individual queries per notification
  const [batchedFollowStatuses, setBatchedFollowStatuses] = useState<
    Record<string, "none" | "pending" | "following" | "friends">
  >({});

  // [OPTIMIZATION: StrictMode Guard] Prevent duplicate loadNotifications on React 18 StrictMode double-mount
  const initialLoadInFlightRef = useRef(false);

  // [OPTIMIZATION: Stale Window] Skip refetch when switching tabs quickly (Notifications → Home → Notifications)
  const NOTIF_STALE_MS = 15000;
  const lastLoadedAtRef = useRef<number>(0);

  const loadNotifications = async (offset = 0, append = false) => {
    try {
      if (offset === 0) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      logFetchStart("NotificationList", "notifications", isVisible, undefined);
      const data = await getNotifications(20, offset);

      // [OPTIMIZATION] Batch hydrate invite direction/status to eliminate N+1 getInviteById
      const inviteIdsToHydrate = data
        .filter(
          (n) =>
            n.type === "invite" &&
            n.additional_data?.invite_id &&
            !n.additional_data?.invite_direction
        )
        .map((n) => n.additional_data!.invite_id as string);
      if (inviteIdsToHydrate.length > 0) {
        try {
          const viewerUserId = await getViewerAuthUserId();
          const batchInvites = await getBatchInvitesByIds(inviteIdsToHydrate);
          const inviteMetaMap: Record<
            string,
            {
              direction: "sent" | "received";
              status: "pending" | "accepted" | "declined";
            }
          > = {};
          for (const inv of batchInvites) {
            const direction: "sent" | "received" =
              viewerUserId && inv.inviter_id === viewerUserId
                ? "sent"
                : "received";
            const status: "pending" | "accepted" | "declined" =
              inv.status === "accepted" || inv.status === "declined"
                ? inv.status
                : "pending";
            inviteMetaMap[inv.id] = { direction, status };
            setCachedInviteData(inv.id, inv);
            setCachedInviteStatus(inv.id, status);
          }
          // Enrich notifications with batch data
          for (let i = 0; i < data.length; i++) {
            const n = data[i];
            if (n.type !== "invite") continue;
            const inviteId = n.additional_data?.invite_id;
            if (!inviteId || !inviteMetaMap[inviteId]) continue;
            data[i] = {
              ...n,
              additional_data: {
                ...n.additional_data,
                invite_direction: inviteMetaMap[inviteId].direction,
                invite_status: inviteMetaMap[inviteId].status,
              },
            };
          }
        } catch (err) {
          console.warn(
            "[NotificationList] Batch invite hydration failed:",
            err
          );
        }
      }

      // [OPTIMIZATION] Batch load follow statuses BEFORE setting notifications
      // so rows get initialFollowStatus on first render, avoiding per-row getFollowStatus
      const followRequestNotifications = data.filter(
        (n) =>
          n.type === "follow" &&
          n.additional_data?.follow_request_status &&
          n.additional_data?.follower_profile_id &&
          n.additional_data?.following_profile_id
      );

      let statusMap: Record<
        string,
        "none" | "pending" | "following" | "friends"
      > = {};

      if (followRequestNotifications.length > 0) {
        try {
          const viewerProfileId = await getViewerId();
          if (viewerProfileId) {
            const profileIdsToCheck = new Set<string>();
            followRequestNotifications.forEach((notification) => {
              const followerProfileId =
                notification.additional_data?.follower_profile_id;
              const followingProfileId =
                notification.additional_data?.following_profile_id;

              if (followerProfileId && followingProfileId) {
                if (viewerProfileId === followingProfileId) {
                  profileIdsToCheck.add(followerProfileId);
                } else if (viewerProfileId === followerProfileId) {
                  profileIdsToCheck.add(followingProfileId);
                }
              }
            });

            if (profileIdsToCheck.size > 0) {
              const followStatuses = await getBatchFollowStatuses(
                viewerProfileId,
                Array.from(profileIdsToCheck)
              );

              followRequestNotifications.forEach((notification) => {
                const followerProfileId =
                  notification.additional_data?.follower_profile_id;
                const followingProfileId =
                  notification.additional_data?.following_profile_id;

                if (followerProfileId && followingProfileId) {
                  let status:
                    | "none"
                    | "pending"
                    | "following"
                    | "friends"
                    | undefined;

                  if (viewerProfileId === followingProfileId) {
                    status = followStatuses[followerProfileId];
                  } else if (viewerProfileId === followerProfileId) {
                    status = followStatuses[followingProfileId];
                  }

                  if (status) {
                    statusMap[notification.id] = status;
                  }
                }
              });
            }
          }
        } catch (error) {
          console.warn(
            "[NotificationList] Failed to batch load follow statuses:",
            error
          );
        }
      }

      if (append) {
        setNotifications((prev) => [...prev, ...data]);
        setBatchedFollowStatuses((prev) => ({ ...prev, ...statusMap }));
      } else {
        setNotifications(data);
        setBatchedFollowStatuses(statusMap);
        lastLoadedAtRef.current = Date.now();
      }

      setHasMore(data.length === 20);
    } catch (err: any) {
      console.error("Failed to load notifications:", err);
      setError(err.message || "Failed to load notifications");
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      if (offset === 0) {
        initialLoadInFlightRef.current = false;
      }
    }
  };

  const loadNotificationsRef = useRef(loadNotifications);
  loadNotificationsRef.current = loadNotifications;

  useEffect(() => {
    const onTabRefresh = () => {
      if (!isVisible) return;
      lastLoadedAtRef.current = 0;
      initialLoadInFlightRef.current = false;
      setError(null);
      if (import.meta.env.DEV) {
        console.debug("[notifications-tab-refresh] refetch");
      }
      loadNotificationsRef.current(0, false);
    };
    window.addEventListener(NOTIFICATIONS_TAB_REFRESH_EVENT, onTabRefresh);
    return () =>
      window.removeEventListener(NOTIFICATIONS_TAB_REFRESH_EVENT, onTabRefresh);
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) {
      initialLoadInFlightRef.current = false;
      setLoading(false);
      return;
    }
    if (initialLoadInFlightRef.current) return;
    // [Stale Window] Skip refetch if we have cached data and it's fresh (< 15s)
    if (
      notifications.length > 0 &&
      Date.now() - lastLoadedAtRef.current < NOTIF_STALE_MS
    ) {
      return;
    }
    initialLoadInFlightRef.current = true;
    loadNotifications(0, false);
    // Note: Do NOT clear ref in cleanup - that would let StrictMode's second mount
    // trigger a duplicate load. Ref is cleared in loadNotifications finally when offset===0.
  }, [isVisible]);

  // Notify other components when notifications are loaded/updated
  useEffect(() => {
    // Dispatch custom event to update notification badge count
    const event = new CustomEvent("notifications:updated");
    window.dispatchEvent(event);
  }, [notifications]);

  const handleMarkAsRead = (notificationId: string) => {
    lastLoadedAtRef.current = 0;
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification
      )
    );
  };

  const handleInviteAccepted = (postId: string) => {
    // Dispatch custom event to refresh interacted posts
    const event = new CustomEvent("invite:accepted", { detail: { postId } });
    window.dispatchEvent(event);
  };

  const handleMarkAllAsRead = async () => {
    if (notifications.some((n) => !n.is_read)) {
      try {
        await markAllNotificationsAsRead();
        lastLoadedAtRef.current = 0;
        setNotifications((prev) =>
          prev.map((notification) => ({ ...notification, is_read: true }))
        );
        toast.success("All notifications marked as read");
      } catch (err: any) {
        console.error("Failed to mark all as read:", err);
        toast.error("Failed to mark all as read");
      }
    }
  };

  const loadMore = () => {
    if (hasMore && !loadingMore) {
      loadNotifications(notifications.length, true);
    }
  };

  // Filter notifications based on selected filter
  const filteredNotifications = (() => {
    if (selectedFilter === "all") {
      return notifications;
    } else {
      return notifications.filter((n) => n.type === selectedFilter);
    }
  })();

  // Exclude declined follow requests from unread count
  const unreadCount = notifications.filter((n) => {
    if (!n.is_read) {
      // Don't count declined follow requests as unread
      if (
        n.type === "follow" &&
        n.additional_data?.follow_request_status === "declined"
      ) {
        return false;
      }
      return true;
    }
    return false;
  }).length;

  if (loading) {
    return (
      <div className={`w-full safe-area-inset-top ${className}`}>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-full rounded-lg p-3 gap-3 flex bg-[var(--surface-2)] animate-pulse"
            >
              <div className="w-14 h-14 rounded-lg bg-[var(--text)]/10 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-[var(--text)]/10 rounded w-3/4" />
                <div className="h-3 bg-[var(--text)]/10 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`w-full ${className}`}>
        <div className="text-center py-8 text-[var(--text)]/70">
          <p className="text-sm mb-4">Failed to load notifications</p>
          <button
            onClick={() => loadNotifications()}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (notifications.length === 0 && !loading) {
    return (
      <div className={`w-full ${className}`}>
        <NotificationFilter
          selectedFilter={selectedFilter}
          onFilterChange={setSelectedFilter}
        />
        <div className="text-center py-8 text-[var(--text)]/70">
          <p className="text-sm">No notifications yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Filter Bar */}
      <NotificationFilter
        selectedFilter={selectedFilter}
        onFilterChange={setSelectedFilter}
      />

      {/* Permission Banner */}
      <NotificationPermissionBanner />

      {/* Header with mark all as read button */}
      {unreadCount > 0 && (
        <div className="flex justify-between items-center px-3 py-2 border-b border-[var(--border)]">
          <span className="text-xs text-[var(--text)]/70">
            {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </span>
          <button
            onClick={handleMarkAllAsRead}
            className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
          >
            Mark all as read
          </button>
        </div>
      )}

      {/* Notification content - simplified single stream */}
      <div className="flex flex-col gap-3 px-3 py-3">
        {filteredNotifications.length > 0 ? (
          <div className="space-y-2">
            {filteredNotifications.map((notification) => {
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

              return (
                <div
                  key={notification.id}
                  className={`ui-card border-l-3 ${getBorderColor()}`}
                >
                  <NotificationItem
                    notification={notification}
                    onMarkAsRead={handleMarkAsRead}
                    showGoToPostButton={true}
                    onInviteAccepted={handleInviteAccepted}
                    batchedFollowStatus={
                      notification.type === "follow" &&
                      notification.additional_data?.follow_request_status
                        ? batchedFollowStatuses[notification.id]
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-[var(--text)]/70">
            <p className="text-sm">
              No {selectedFilter === "all" ? "" : selectedFilter} notifications
              yet
            </p>
          </div>
        )}
      </div>

      {/* Load more button */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 text-sm text-[var(--text)]/70 hover:text-[var(--text)] transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
