/**
 * Inset Mute / Unmute action panel (GroupPeopleSheet geometry).
 * Direct: Mute + Delete chat.
 * Groups: Mute + Delete chat + Leave group (+ Delete group for admin).
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { PiBell, PiBellSlash, PiSignOut, PiTrash, PiX } from "react-icons/pi";
import {
  glassActionSheetIconWrapClass,
  glassActionSheetRowClass,
  glassPeoplePanelClass,
} from "../../lib/glassActionSheetStyles";
import { syncAppSafeAreaBottom } from "../../lib/appSafeAreaBottom";
import { useOverlayBackgroundScrollLock } from "../../hooks/useOverlayBackgroundScrollLock";

type Props = {
  open: boolean;
  onClose: () => void;
  muted: boolean;
  busy?: boolean;
  onToggleMute: () => void;
  title?: string;
  /** When true, show Leave group under Delete chat. */
  isGroup?: boolean;
  onLeaveGroup?: () => void;
  /** Viewer-local Delete chat (direct + group). */
  onDeleteChat?: () => void;
  /** Active group admin only: soft-dissolve group for everyone. */
  onDeleteGroup?: () => void;
};

const safeHorizontalPad =
  "pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]";

const destructiveRowClass = [
  glassActionSheetRowClass,
  "w-full justify-between border-rose-400/28 text-[color-mix(in_oklab,#e11d48_55%,var(--text))] hover:bg-[color-mix(in_oklab,#fb7185_10%,transparent)] app-dark:border-rose-400/25 app-dark:text-rose-300/95 disabled:opacity-45",
].join(" ");

const destructiveIconWrapClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-400/35 bg-[color-mix(in_oklab,#fb7185_10%,transparent)]";

/** Inbox long-press Delete group: active group admin only (`viewer_role === "admin"`). */
export function inboxLongPressShowsDeleteGroup(
  kind: string | null | undefined,
  viewerRole: string | null | undefined
): boolean {
  return kind === "group" && viewerRole === "admin";
}

/** Ordered destructive labels after Mute (for tests / matrix docs). */
export function inboxLongPressDestructiveLabels(opts: {
  isGroup: boolean;
  showDeleteChat: boolean;
  showLeaveGroup: boolean;
  showDeleteGroup: boolean;
}): string[] {
  const labels: string[] = [];
  if (opts.showDeleteChat) labels.push("Delete chat");
  if (opts.isGroup && opts.showLeaveGroup) labels.push("Leave group");
  if (opts.isGroup && opts.showDeleteGroup) labels.push("Delete group");
  return labels;
}

export default function ConversationMuteActionsDrawer({
  open,
  onClose,
  muted,
  busy = false,
  onToggleMute,
  title,
  isGroup = false,
  onLeaveGroup,
  onDeleteChat,
  onDeleteGroup,
}: Props) {
  useOverlayBackgroundScrollLock(open);

  useEffect(() => {
    if (!open) return;
    syncAppSafeAreaBottom();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const label = muted ? "Unmute notifications" : "Mute notifications";
  const Icon = muted ? PiBell : PiBellSlash;
  const showLeave = isGroup && typeof onLeaveGroup === "function";
  const showDelete = typeof onDeleteChat === "function";
  const showDeleteGroup = isGroup && typeof onDeleteGroup === "function";
  const hasDestructive = showLeave || showDelete || showDeleteGroup;

  const panelSubtitle = isGroup
    ? "Group options"
    : showDelete
      ? "Chat options"
      : "Conversation alerts";

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] flex flex-col justify-end ${safeHorizontalPad}`}
      style={{
        paddingTop: "max(0.5rem, var(--safe-area-top-layout, env(safe-area-inset-top, 0px)))",
        paddingBottom: "max(0.75rem, var(--safe-area-bottom-layout, 0px))",
      }}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_22%,transparent)] backdrop-blur-[18px] app-dark:bg-black/28 app-dark:backdrop-blur-[22px]"
        aria-label="Close conversation actions"
        onClick={onClose}
      />
      <div
        className={`relative z-10 mx-auto mb-0 w-full max-w-lg ${glassPeoplePanelClass}`}
        role="dialog"
        aria-label={
          title?.trim()
            ? hasDestructive
              ? `Actions for ${title.trim()}`
              : `Notification settings for ${title.trim()}`
            : hasDestructive
              ? "Conversation actions"
              : "Notification settings"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)]/40 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text)]">
              {title?.trim() ||
                (isGroup ? "Group" : showDelete ? "Chat" : "Notifications")}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text)]/55">
              {panelSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/50 bg-[color-mix(in_oklab,var(--surface-2)_40%,transparent)] text-[var(--text)]/70 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-amber-400/40"
            aria-label="Close"
          >
            <PiX className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-1.5 px-2 py-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (busy) return;
              onToggleMute();
            }}
            className={`${glassActionSheetRowClass} w-full justify-between disabled:opacity-45`}
          >
            <span className="text-sm font-medium text-[var(--text)]">{label}</span>
            <span className={glassActionSheetIconWrapClass} aria-hidden>
              <Icon size={14} />
            </span>
          </button>
          {showDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                onDeleteChat();
              }}
              className={destructiveRowClass}
            >
              <span className="text-sm font-medium">Delete chat</span>
              <span className={destructiveIconWrapClass} aria-hidden>
                <PiTrash size={14} />
              </span>
            </button>
          ) : null}
          {showLeave ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                onLeaveGroup();
              }}
              className={destructiveRowClass}
            >
              <span className="text-sm font-medium">Leave group</span>
              <span className={destructiveIconWrapClass} aria-hidden>
                <PiSignOut size={14} />
              </span>
            </button>
          ) : null}
          {showDeleteGroup ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                onDeleteGroup();
              }}
              className={destructiveRowClass}
            >
              <span className="text-sm font-medium">Delete group</span>
              <span className={destructiveIconWrapClass} aria-hidden>
                <PiTrash size={14} />
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
