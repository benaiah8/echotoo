import React, { useState, useMemo } from "react";
import { IoChevronDown, IoChevronUp } from "react-icons/io5";
import { type NotificationWithActor } from "../../types/notification";
import NotificationItem from "./NotificationItem";
import Avatar from "../ui/Avatar";
import { Link } from "react-router-dom";
import { Paths } from "../../router/Paths";
import { markNotificationAsRead } from "../../api/services/notifications";

interface Props {
  notifications: NotificationWithActor[];
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  borderColor?: string;
  buttonColor?: string;
  onMarkAsRead: (id: string) => void;
  onFilterChange?: (filter: string) => void;
  showGoToPostButton?: boolean;
}

export default function LikeNotificationGroup({
  notifications,
  label,
  icon: Icon,
  color,
  borderColor,
  buttonColor,
  onMarkAsRead,
  onFilterChange,
  showGoToPostButton = true,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  // Exclude declined follow requests from unread count
  const unreadCount = notifications.filter((n) => {
    if (!n.is_read) {
      // Don't count declined follow requests as unread
      if (n.type === "follow" && n.additional_data?.follow_request_status === "declined") {
        return false;
      }
      return true;
    }
    return false;
  }).length;

  // Group notifications by post (entity_id)
  const notificationsByPost = useMemo(() => {
    const grouped = notifications.reduce((acc, notification) => {
      const entityId = notification.entity_id || "unknown";
      if (!acc[entityId]) {
        acc[entityId] = [];
      }
      acc[entityId].push(notification);
      return acc;
    }, {} as Record<string, NotificationWithActor[]>);

    return grouped;
  }, [notifications]);

  const displayPostGroups = isExpanded
    ? Object.entries(notificationsByPost)
    : Object.entries(notificationsByPost).slice(0, 2);

  const hasMoreGroups = Object.keys(notificationsByPost).length > 2;

  // Always show the group, even with 0 notifications

  const handleHeaderClick = () => {
    // If not expanded, switch to the like filter tab
    if (!isExpanded && onFilterChange) {
      onFilterChange("like");
    }
    setIsExpanded(!isExpanded);
  };

  // Use the border color from config, fallback to red for likes
  const borderColorClass = borderColor || "border-red-500";
  const buttonColorClass = buttonColor || "bg-red-500 hover:bg-red-600";

  // Get the border color for the thin border (low opacity) - for likes it's red
  const getThinBorderClass = () => "border-red-500/30";

  const getNotificationLink = (notification: NotificationWithActor): string => {
    if (notification.entity_id) {
      switch (notification.entity_type) {
        case "hangout":
          return `${Paths.experience}/${notification.entity_id}`;
        case "experience":
          return `${Paths.experience}/${notification.entity_id}`;
        case "post":
          return `${Paths.experience}/${notification.entity_id}`;
        default:
          return `${Paths.experience}/${notification.entity_id}`;
      }
    }
    return "#";
  };

  return (
    <div className="space-y-6">
      {/* Increased gap between main notification groups */}
      <div className="ui-card overflow-hidden">
        {/* Group Header */}
        <button
          onClick={handleHeaderClick}
          className={`w-full flex items-center justify-between p-3 bg-[var(--surface-2)]/40 hover:bg-[var(--surface-2)]/60 transition-colors ${
            unreadCount > 0 ? `border-l-4 ${borderColorClass}` : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${color
                .replace("text-", "bg-")
                .replace("-500", "-500/20")}`}
            >
              <Icon size={18} className={color} />
            </div>
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-[var(--text)]">
                  {label}
                </span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <span className="text-xs text-[var(--text)]/50">
                {notifications.length} notification
                {notifications.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {notifications.length > 0 && (
            <div className="text-[var(--text)]/50">
              {isExpanded ? (
                <IoChevronUp size={20} />
              ) : (
                <IoChevronDown size={20} />
              )}
            </div>
          )}
        </button>

        {/* Overlapping individual notification cards */}
        {!isExpanded && notifications.length > 0 && (
          <div className="px-4 py-2 -mt-1">
            {/* Pull closer to title with negative margin */}
            <div className="flex flex-col items-center">
              {notifications
                .slice(0, Math.min(4, notifications.length))
                .reverse() // Show latest notifications on top, using top cards
                .map((notification, index) => {
                  // Calculate overlap - 30% of card height
                  const cardHeight = 48;
                  const overlapAmount = Math.floor(cardHeight * 0.3); // 30% overlap

                  // Calculate width - pyramid effect (top cards get full width, bottom cards get smaller)
                  const totalCards = Math.min(4, notifications.length);
                  const reverseIndex = totalCards - 1 - index; // Reverse index for proper sizing
                  const widthPercentage = Math.max(70, 100 - reverseIndex * 10); // Start from 100% and go down
                  const maxWidth = `${widthPercentage}%`;

                  return (
                    <div
                      key={notification.id}
                      className={`relative ui-card p-2 border-l-4 ${borderColorClass} transition-transform`}
                      style={{
                        zIndex: index + 1,
                        marginTop: index > 0 ? `-${overlapAmount}px` : "0px",
                        width: maxWidth,
                        // Darker, more dominant drop shadow
                        boxShadow:
                          index > 0
                            ? `0 -4px 8px rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.2)`
                            : "0 2px 4px rgba(0, 0, 0, 0.2)",
                      }}
                    >
                      <Link
                        to={getNotificationLink(notification)}
                        onClick={async () => {
                          if (!notification.is_read) {
                            try {
                              await markNotificationAsRead(notification.id);
                              onMarkAsRead(notification.id);
                            } catch (error) {
                              console.error(
                                "Failed to mark notification as read:",
                                error
                              );
                            }
                          }
                        }}
                        className="block"
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
                            size={28} // Slightly smaller avatar
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[var(--text)] font-medium">
                              {notification.actor?.display_name ||
                                notification.actor?.username ||
                                "Someone"}{" "}
                              liked your post
                            </p>
                          </div>
                          {/* No "Go to post" button on all page */}
                        </div>
                      </Link>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Expanded view - show all notifications */}
        {isExpanded && notifications.length > 0 && (
          <div className="px-4 py-2">
            <div className="ml-3 space-y-2">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`ui-card ${
                    notification.is_read ? "" : `border-l-4 ${borderColorClass}`
                  }`}
                >
                  <NotificationItem
                    notification={notification}
                    onMarkAsRead={onMarkAsRead}
                    compact={true}
                    showGoToPostButton={showGoToPostButton}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {hasMoreGroups && !isExpanded && (
          <div className="px-3 py-2 text-center border-t border-[var(--border)]">
            <button
              onClick={(e) => {
                e.preventDefault();
                setIsExpanded(true);
              }}
              className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
            >
              +{Object.keys(notificationsByPost).length - 2} more posts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
