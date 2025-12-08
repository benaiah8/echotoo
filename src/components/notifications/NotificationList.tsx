import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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

interface Props {
  className?: string;
}

export default function NotificationList({ className = "" }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [notifications, setNotifications] = useState<NotificationWithActor[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<
    NotificationType | "all"
  >(() => {
    const filterParam = searchParams.get("filter");
    return (filterParam as NotificationType | "all") || "all";
  });

  const loadNotifications = async (offset = 0, append = false) => {
    try {
      if (offset === 0) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const data = await getNotifications(20, offset);

      if (append) {
        setNotifications((prev) => [...prev, ...data]);
      } else {
        setNotifications(data);
      }

      setHasMore(data.length === 20);
    } catch (err: any) {
      console.error("Failed to load notifications:", err);
      setError(err.message || "Failed to load notifications");
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  // Listen for filter reset events from bottom tab
  useEffect(() => {
    const handleResetFilter = (event: CustomEvent) => {
      const { filter } = event.detail;
      setSelectedFilter(filter);
      // Clear URL params when resetting to "all"
      if (filter === "all") {
        setSearchParams({});
      }
    };

    window.addEventListener(
      "notification:resetFilter",
      handleResetFilter as EventListener
    );
    return () => {
      window.removeEventListener(
        "notification:resetFilter",
        handleResetFilter as EventListener
      );
    };
  }, [setSearchParams]);

  // Notify other components when notifications are loaded/updated
  useEffect(() => {
    // Dispatch custom event to update notification badge count
    const event = new CustomEvent("notifications:updated");
    window.dispatchEvent(event);
  }, [notifications]);

  const handleMarkAsRead = (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, is_read: true }
          : notification
      )
    );
  };

  const handleMarkAllAsRead = async () => {
    if (notifications.some((n) => !n.is_read)) {
      try {
        await markAllNotificationsAsRead();
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

  // Wrapper function to handle type conversion for onFilterChange
  const handleFilterChange = (filter: string) => {
    const newFilter = filter as NotificationType | "all";
    setSelectedFilter(newFilter);
    // Update URL to reflect the current filter
    if (newFilter === "all") {
      setSearchParams({});
    } else {
      setSearchParams({ filter: newFilter });
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

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) {
    return (
      <div className={`w-full ${className}`}>
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
