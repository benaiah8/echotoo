/**
 * Frosted People overlay for persistent groups (Invite participants direction).
 * Uses already-loaded members — no refetch on open.
 * Optional manage mode: remove affordances (except viewer).
 */

import { useEffect, useMemo } from "react";
import { PiX } from "react-icons/pi";
import PeopleGrid, { type PeopleGridPerson } from "../people/PeopleGrid";
import { glassPeoplePanelClass } from "../../lib/glassActionSheetStyles";
import { profileByUsername } from "../../router/Paths";
import type { ConversationMemberRow } from "../../api/services/messaging";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  memberCountLabel: string | null;
  members: ConversationMemberRow[];
  createdByUserId: string | null;
  safeHorizontalPadClass: string;
  /** Explicit management mode with remove controls. */
  manageMode?: boolean;
  viewerUserId?: string | null;
  onRemoveMember?: (userId: string) => void;
};

function memberDisplayName(m: ConversationMemberRow): string {
  return m.display_name?.trim() || m.username?.trim() || "Member";
}

export default function GroupPeopleSheet({
  open,
  onClose,
  title,
  memberCountLabel,
  members,
  createdByUserId,
  safeHorizontalPadClass,
  manageMode = false,
  viewerUserId = null,
  onRemoveMember,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const people: PeopleGridPerson[] = useMemo(
    () =>
      members.map((m) => {
        const isCreator =
          !!createdByUserId && m.user_id === createdByUserId;
        return {
          id: m.user_id,
          displayName: memberDisplayName(m),
          avatarUrl: m.avatar_url,
          badge: isCreator ? "Creator" : null,
        };
      }),
    [members, createdByUserId]
  );

  const profileHrefById = useMemo(() => {
    if (manageMode) return {};
    const map: Record<string, string> = {};
    for (const m of members) {
      const u = m.username?.trim();
      if (u) map[m.user_id] = profileByUsername(u);
    }
    return map;
  }, [members, manageMode]);

  const removableIds = useMemo(() => {
    if (!manageMode) return undefined;
    return members
      .map((m) => m.user_id)
      .filter((id) => !viewerUserId || id !== viewerUserId);
  }, [manageMode, members, viewerUserId]);

  if (!open) return null;

  return (
    <div
      className={`pointer-events-auto absolute inset-0 z-40 flex flex-col justify-end ${safeHorizontalPadClass}`}
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg)_22%,transparent)] backdrop-blur-[18px] app-dark:bg-black/28 app-dark:backdrop-blur-[22px]"
        aria-label="Close people"
        onClick={onClose}
      />
      <div
        className={`relative z-10 mx-auto mb-[max(0.75rem,env(safe-area-inset-bottom,0px))] w-full max-w-lg ${glassPeoplePanelClass}`}
        role="dialog"
        aria-label={manageMode ? "Manage people" : "Group people"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)]/40 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text)]">
              {manageMode ? "Manage people" : title}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--text)]/55">
              {manageMode
                ? "Tap × to remove someone"
                : memberCountLabel || "People"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)]/70 text-[var(--text)]/70"
            aria-label="Close"
          >
            <PiX className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="max-h-[min(62vh,28rem)] overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch]">
          <PeopleGrid
            people={people}
            profileHrefById={profileHrefById}
            removableIds={removableIds}
            onRemove={onRemoveMember}
            emptyLabel="Members unavailable."
            onPersonClick={manageMode ? undefined : () => onClose()}
          />
        </div>
      </div>
    </div>
  );
}
