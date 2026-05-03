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
  /**
   * `pill` = full-width stadium row, tighter padding, avatar inset (invite-style).
   * `default` = rounded card (`rounded-xl`).
   */
  rowShape?: "default" | "pill";
}

/**
 * Reusable profile row for drawers — frosted glass shell.
 * `rowShape="pill"` → stadium row, tighter padding, invite list.
 * `default` → rounded-xl card (Follow list, RSVP, etc.).
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
  rowShape = "default",
}: DrawerProfileCardProps) {
  const isPill = rowShape === "pill";

  return (
    <div
      className={`flex min-h-0 items-center ${
        isPill
          ? "gap-2.5 rounded-full py-1.5 pl-1.5 pr-2.5"
          : "gap-3 rounded-xl py-2 pl-1.5 pr-2"
      } ${
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
      <div
        className={
          isPill
            ? "flex shrink-0 items-center self-center"
            : "shrink-0 self-center"
        }
      >
        <Avatar
          url={avatar_url || undefined}
          name={display_name || "User"}
          size={avatarSize}
          variant={avatarVariant}
          userId={id} // Pass profile ID for caching
          tightLineBox={isPill}
        />
      </div>
      <div
        className={`min-w-0 flex-1 self-center ${
          isPill ? "" : "py-0.5"
        }`}
      >
        <div
          className={`flex min-h-0 min-w-0 flex-col justify-center ${
            isPill ? "gap-0" : "gap-0.5"
          }`}
        >
          <div
            className={`truncate text-sm font-medium text-[var(--text)] ${
              isPill ? "leading-snug" : "leading-tight"
            }`}
          >
            {display_name || "Unnamed"}
          </div>
          <div
            className={`truncate text-xs text-[var(--text)]/60 ${
              isPill ? "leading-none" : "leading-tight"
            }`}
          >
            @{username || "user"}
          </div>
        </div>
      </div>
      <div
        className="flex shrink-0 items-center justify-end gap-2 self-center"
        onClick={(e) => e.stopPropagation()}
      >
        {showCustomBadge ? (
          showCustomBadge
        ) : showFollowButton ? (
          <FollowButton
            targetId={id}
            className="shrink-0"
            onChange={onFollowChange}
            followStatus={followStatus}
          />
        ) : null}
        {customActions}
      </div>
    </div>
  );
}
