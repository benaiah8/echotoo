import React from "react";
import { type NotificationType } from "../../types/notification";
import {
  PiArticle,
  PiBookmarkSimple,
  PiCalendar,
  PiChatCircle,
  PiDotsNine,
  PiEnvelopeSimpleOpen,
  PiHeart,
  PiUserPlus,
} from "react-icons/pi";

interface NotificationFilterProps {
  selectedFilter: NotificationType | "all";
  onFilterChange: (filter: NotificationType | "all") => void;
}

const FILTER_OPTIONS = [
  {
    key: "all" as const,
    label: "All",
    icon: PiDotsNine,
    color: "text-gray-600",
  },
  {
    key: "invite" as const,
    label: "Invites",
    icon: PiEnvelopeSimpleOpen,
    color: "text-blue-500",
  },
  {
    key: "rsvp" as const,
    label: "RSVP",
    icon: PiCalendar,
    color: "text-indigo-500",
  },
  {
    key: "follow" as const,
    label: "Follows",
    icon: PiUserPlus,
    color: "text-green-500",
  },
  {
    key: "like" as const,
    label: "Likes",
    icon: PiHeart,
    color: "text-red-500",
  },
  {
    key: "comment" as const,
    label: "Comments",
    icon: PiChatCircle,
    color: "text-yellow-500",
  },
  {
    key: "saved" as const,
    label: "Saved",
    icon: PiBookmarkSimple,
    color: "text-purple-500",
  },
  {
    key: "post" as const,
    label: "Posts",
    icon: PiArticle,
    color: "text-orange-500",
  },
] as const;

export default function NotificationFilter({
  selectedFilter,
  onFilterChange,
}: NotificationFilterProps) {
  return (
    <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md safe-area-inset-top">
      <div className="px-3 py-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {FILTER_OPTIONS.map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                selectedFilter === key
                  ? "bg-yellow-400 text-black shadow-sm"
                  : "bg-[var(--surface-2)] text-[var(--text)]/70 hover:bg-[var(--surface-2)]/80"
              }`}
            >
              <Icon
                size={16}
                className={selectedFilter === key ? "text-black" : color}
              />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
