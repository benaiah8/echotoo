/**
 * Inbox conversation row with short-tap navigate + long-press mute sheet.
 */

import { useCallback, useMemo } from "react";
import { PiBellSlash } from "react-icons/pi";
import Avatar from "../ui/Avatar";
import GroupMemberAvatarStack, {
  groupAvatarStackStatusFromPreview,
  type GroupMemberAvatarStackMember,
} from "./GroupMemberAvatarStack";
import type { InboxConversationRow } from "../../api/services/messaging";
import { useLongPressActions } from "../../hooks/useLongPressActions";
import { hapticImpactLight } from "../../lib/hapticsLight";
import { normalizeMessagesInboxBackground } from "../../lib/messages/dismissConversationNav";

function isGroupConversation(row: InboxConversationRow): boolean {
  return row.kind === "group";
}

function inboxRowTitle(row: InboxConversationRow): string {
  if (isGroupConversation(row)) {
    return row.title?.trim() || "Group";
  }
  return (
    row.display_name?.trim() ||
    row.username?.trim() ||
    row.title?.trim() ||
    "Chat"
  );
}

function formatInboxTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  row: InboxConversationRow;
  onOpen: (row: InboxConversationRow) => void;
  onLongPressActions: (row: InboxConversationRow) => void;
  /** Successful Leave group — compact exit before inbox removal. */
  isLeaving?: boolean;
};

export default function InboxConversationRowItem({
  row,
  onOpen,
  onLongPressActions,
  isLeaving = false,
}: Props) {
  const isGroup = isGroupConversation(row);
  const title = inboxRowTitle(row);
  const preview = row.last_message_preview?.trim() || "No messages yet";
  const unread = row.unread_count > 0;
  const muted = row.notifications_muted === true;

  const groupStackMembers = useMemo((): GroupMemberAvatarStackMember[] => {
    if (!isGroup || !Array.isArray(row.member_preview)) return [];
    return row.member_preview.map((m) => ({
      userId: m.user_id,
      avatarUrl: m.avatar_url,
      displayName: m.display_name,
      username: m.username,
    }));
  }, [isGroup, row.member_preview]);

  const groupStackStatus = isGroup
    ? groupAvatarStackStatusFromPreview(row.member_preview)
    : "empty";

  const handleLongPress = useCallback(() => {
    if (isLeaving) return;
    void hapticImpactLight();
    onLongPressActions(row);
  }, [isLeaving, onLongPressActions, row]);

  const {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu,
    allowClick,
    pressed,
  } = useLongPressActions({ onLongPress: handleLongPress });

  return (
    <li
      className={[
        "overflow-hidden transition-[opacity,transform,max-height] ease-out will-change-[opacity,transform]",
        "duration-[260ms]",
        isLeaving
          ? "pointer-events-none max-h-0 translate-x-3 opacity-0"
          : "max-h-24 translate-x-0 opacity-100",
      ].join(" ")}
      aria-hidden={isLeaving || undefined}
    >
      <button
        type="button"
        disabled={isLeaving}
        onClick={() => {
          if (isLeaving || !allowClick()) return;
          onOpen(row);
        }}
        onPointerDown={isLeaving ? undefined : onPointerDown}
        onPointerMove={isLeaving ? undefined : onPointerMove}
        onPointerUp={isLeaving ? undefined : onPointerUp}
        onPointerCancel={isLeaving ? undefined : onPointerCancel}
        onContextMenu={isLeaving ? undefined : onContextMenu}
        className={[
          "relative flex w-full max-w-full items-center gap-3 border-b border-[var(--border)]/50 px-1 py-3 text-left",
          "transition-[transform] duration-100",
          pressed && !isLeaving ? "scale-[0.99]" : "",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={[
            "pointer-events-none absolute inset-y-0 left-0 right-0 z-0 transition-opacity duration-100",
            pressed ? "opacity-100" : "opacity-0",
          ].join(" ")}
          style={{
            background:
              "linear-gradient(to right, transparent 0%, color-mix(in oklab, var(--text) 8%, var(--bg)) 16%, color-mix(in oklab, var(--text) 8%, var(--bg)) 84%, transparent 100%)",
          }}
        />
        <span className="relative z-[1] inline-flex shrink-0">
          {isGroup ? (
            <GroupMemberAvatarStack
              members={groupStackMembers}
              status={groupStackStatus}
              size={48}
              layout="triangle"
            />
          ) : (
            <Avatar
              url={row.avatar_url}
              name={title}
              userId={row.other_user_id}
              size={48}
              tightLineBox
              className="rounded-full"
            />
          )}
        </span>
        <div className="relative z-[1] min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={`flex min-w-0 items-center gap-1 truncate text-[15px] ${
                unread
                  ? "font-semibold text-[var(--text)]"
                  : "font-medium text-[var(--text)]/90"
              }`}
            >
              <span className="truncate">{title}</span>
              {muted ? (
                <PiBellSlash
                  className="h-3.5 w-3.5 shrink-0 text-[var(--text)]/40"
                  aria-label="Notifications muted"
                />
              ) : null}
            </p>
            <span className="shrink-0 text-[11px] tabular-nums text-[var(--text)]/45">
              {formatInboxTime(row.last_message_at)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <p
              className={`min-w-0 flex-1 truncate text-[13px] ${
                unread
                  ? "font-medium text-[var(--text)]/80"
                  : "text-[var(--text)]/55"
              }`}
            >
              {row.is_last_from_me ? `You: ${preview}` : preview}
            </p>
            {unread ? (
              <span className="inline-flex min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-bold text-neutral-900">
                {row.unread_count > 99 ? "99+" : row.unread_count}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

/** Build navigate state seed from an inbox row (includes mute). */
export function inboxRowNavigateState(
  row: InboxConversationRow,
  backgroundLocation: unknown
): Record<string, unknown> {
  const isGroup = isGroupConversation(row);
  return {
    backgroundLocation: normalizeMessagesInboxBackground(backgroundLocation),
    notificationsMuted: row.notifications_muted === true,
    ...(isGroup
      ? {
          kind: "group" as const,
          ...(typeof row.member_count === "number"
            ? { memberCount: row.member_count }
            : {}),
          ...(row.title?.trim() ? { groupTitle: row.title.trim() } : {}),
          ...(Array.isArray(row.member_preview)
            ? {
                memberPreview: row.member_preview.map((m) => ({
                  userId: m.user_id,
                  avatarUrl: m.avatar_url,
                  displayName: m.display_name,
                  username: m.username,
                })),
              }
            : {}),
        }
      : {
          kind: "direct" as const,
          otherUserId: row.other_user_id || undefined,
          ...(row.display_name?.trim()
            ? { otherDisplayName: row.display_name.trim() }
            : {}),
          ...(row.username?.trim()
            ? { otherUsername: row.username.trim() }
            : {}),
          ...(row.avatar_url ? { otherAvatarUrl: row.avatar_url } : {}),
          ...(row.is_request ? { isRequest: true } : {}),
        }),
  };
}
