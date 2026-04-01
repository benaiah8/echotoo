import React from "react";
import Avatar from "./Avatar";
import FollowButton from "./FollowButton";

interface DrawerProfileCardProps {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  onClick?: (e?: React.MouseEvent) => void;
  showFollowButton?: boolean;
  onFollowChange?: (nowFollowing: boolean) => void; // Callback for follow status changes
  /** Pre-loaded follow status from parent (e.g. RPC viewer_follow_status) to avoid per-row getFollowStatus */
  followStatus?: "none" | "pending" | "following" | "friends" | "self";
  showCustomBadge?: React.ReactNode;
  customActions?: React.ReactNode; // For additional actions like three-dot menu
  className?: string;
  avatarVariant?: "default" | "anon";
  avatarSize?: number;
}

/**
 * Reusable Profile Card Component for Drawers
 *
 * Features:
 * - Frosted glass styling matching bottom tab active state
 * - Theme-aware (light/dark mode)
 * - Consistent styling across all drawers
 * - Optional follow button or custom badge
 */
export default function DrawerProfileCard({
  id,
  username,
  display_name,
  avatar_url,
  onClick,
  showFollowButton = false,
  onFollowChange,
  followStatus,
  showCustomBadge,
  customActions,
  className = "",
  avatarVariant = "default",
  avatarSize = 36,
}: DrawerProfileCardProps) {
  return (
    <div
      className={`flex items-center gap-3 p-2 rounded-xl transition-colors ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
      style={{
        backgroundColor: "var(--glass-active-bg)",
        backdropFilter: "blur(var(--glass-blur))",
        WebkitBackdropFilter: "blur(var(--glass-blur))",
        boxShadow: "var(--glass-active-shadow)",
        border: "1px solid var(--glass-active-border)",
      }}
      onClick={onClick}
    >
      <Avatar
        url={avatar_url || undefined}
        name={display_name || "User"}
        size={avatarSize}
        variant={avatarVariant}
        userId={id} // Pass profile ID for caching
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-tight truncate text-[var(--text)]">
          {display_name || "Unnamed"}
        </div>
        <div className="text-xs text-[var(--text)]/60 truncate">
          @{username || "user"}
        </div>
      </div>
      <div
        className="flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {showCustomBadge ? (
          showCustomBadge
        ) : showFollowButton ? (
          <FollowButton
            targetId={id}
            className="ml-2"
            onChange={onFollowChange}
            followStatus={followStatus}
          />
        ) : null}
        {customActions}
      </div>
    </div>
  );
}
