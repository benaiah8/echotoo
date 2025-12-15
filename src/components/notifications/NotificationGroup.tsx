import React, { useState } from "react";
import { IoChevronDown, IoChevronUp } from "react-icons/io5";
import { type NotificationWithActor } from "../../types/notification";
import NotificationItem from "./NotificationItem";
import Avatar from "../ui/Avatar";

interface Props {
  type: string;
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

export default function NotificationGroup({
  type,
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
  const hasMore = notifications.length > 3;

  // Always show the group, even with 0 notifications

  const handleHeaderClick = () => {
    // If not expanded, switch to the specific filter tab
    if (!isExpanded && onFilterChange) {
      onFilterChange(type);
    }
    setIsExpanded(!isExpanded);
  };

  // Use the border color from config, fallback to color-based border
  const borderColorClass =
    borderColor ||
    (color.includes("red")
      ? "border-red-500"
      : color.includes("blue")
      ? "border-blue-500"
      : color.includes("green")
      ? "border-green-500"
      : color.includes("yellow")
      ? "border-yellow-500"
      : color.includes("purple")
      ? "border-purple-500"
      : color.includes("pink")
      ? "border-pink-500"
      : "border-red-500");

  // Get the border color for the thin border (low opacity)
  const getThinBorderClass = () => {
    if (color.includes("red")) return "border-red-500/30";
    if (color.includes("blue")) return "border-blue-500/30";
    if (color.includes("green")) return "border-green-500/30";
    if (color.includes("yellow")) return "border-yellow-500/30";
    if (color.includes("purple")) return "border-purple-500/30";
    if (color.includes("pink")) return "border-pink-500/30";
    return "border-red-500/30";
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
                      <div className="flex items-center gap-2">
                        <Avatar
                          variant="default"
                          url={notification.actor?.avatar_url || undefined}
                          name={
                            notification.actor?.display_name ||
                            notification.actor?.username ||
                            undefined
                          }
                          size={28}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[var(--text)] font-medium">
                            {notification.actor?.display_name ||
                              notification.actor?.username ||
                              "Someone"}
                            {notification.type === "like" && " liked your post"}
                            {notification.type === "follow" &&
                              (notification.additional_data?.follow_request_status
                                ? " requested to follow you"
                                : " started following you")}
                            {notification.type === "comment" &&
                              " commented on your post"}
                            {notification.type === "invite" && " invited you"}
                            {notification.type === "rsvp" &&
                              " RSVP'd to your event"}
                            {notification.type === "saved" &&
                              " saved your post"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Expanded state - individual notifications */}
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
      </div>
    </div>
  );
}
