/**
 * Messages → Requests: compact Group Up summary row per conversation.
 * Warms the overlay requester cache (cache-first, never force).
 */

import { useCallback, useSyncExternalStore } from "react";
import { useSelector } from "react-redux";
import { PiArrowSquareOutBold, PiUser, PiUsersThree } from "react-icons/pi";
import type { RootState } from "../../app/store";
import { useEnsureGroupUpRequestersCached } from "../../hooks/useEnsureGroupUpRequestersCached";
import { getCachedAvatar } from "../../lib/avatarCache";
import { formatGroupUpRequestCountLabel } from "../../lib/groupUpRequestCursor";
import { formatSocialOccursSchedule } from "../../lib/openPlanSchedule";
import {
  getCachedGroupUpRequesters,
  subscribeGroupUpRequestersCache,
} from "../../lib/groupUpRequestersCache";
import type {
  GroupUpRequestGroup,
  GroupUpRequester,
} from "../../lib/people/types";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import Avatar from "../ui/Avatar";

type Props = {
  group: GroupUpRequestGroup;
  onOpen: (group: GroupUpRequestGroup) => void;
  onViewPost: (group: GroupUpRequestGroup) => void;
};

export type GroupUpRequestPreviewKind = "self_and_latest" | "latest_two";

export type GroupUpRequestPreviewSlot =
  | { kind: "self" }
  | { kind: "requester"; requester: GroupUpRequester | null };

const EMPTY_REQUESTERS: readonly GroupUpRequester[] = [];
const SQUIRCLE_PX = 48;
const PREVIEW_AVATAR_PX = 34;
const PREVIEW_OVERLAP_PX = 13;
const PREVIEW_CAPSULE_PAD_PX = 3;

export function groupUpRequestPreviewKind(
  pendingCount: number
): GroupUpRequestPreviewKind {
  return Math.max(0, Math.floor(pendingCount)) <= 1
    ? "self_and_latest"
    : "latest_two";
}

/** Newest-first cache: [0] latest, [1] second-latest. Always two visual slots. */
export function groupUpRequestPreviewSlots(
  pendingCount: number,
  cachedRequesters: readonly GroupUpRequester[]
): GroupUpRequestPreviewSlot[] {
  const latest = cachedRequesters[0] ?? null;
  const second = cachedRequesters[1] ?? null;
  if (groupUpRequestPreviewKind(pendingCount) === "self_and_latest") {
    return [{ kind: "self" }, { kind: "requester", requester: latest }];
  }
  return [
    { kind: "requester", requester: latest },
    { kind: "requester", requester: second },
  ];
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function cachedRequesterList(
  userId: string | null,
  conversationId: string
): readonly GroupUpRequester[] {
  if (!userId) return EMPTY_REQUESTERS;
  return (
    getCachedGroupUpRequesters(userId, conversationId)?.requests ??
    EMPTY_REQUESTERS
  );
}

function pendingCountBadgeLabel(pendingCount: number): string {
  return pendingCount > 99 ? "99+" : String(pendingCount);
}

export default function GroupUpRequestGroupCard({
  group,
  onOpen,
  onViewPost,
}: Props) {
  const userId = useSelector((s: RootState) => s.auth?.user?.id ?? null);
  const conversationId = group.conversation_id;
  const getRequesters = useCallback(
    () => cachedRequesterList(userId, conversationId),
    [userId, conversationId]
  );
  const cachedRequesters = useSyncExternalStore(
    subscribeGroupUpRequestersCache,
    getRequesters
  );
  useEnsureGroupUpRequestersCached(conversationId, true);

  const title = group.group_title?.trim() || peopleUiCopy.groupUp;
  const description = group.description?.trim() || null;
  const pendingCount = Math.max(0, Math.floor(group.pending_count));
  const countLabel = formatGroupUpRequestCountLabel({
    pendingCount,
    newCount: group.new_count,
  });
  const canViewPost =
    Boolean(group.source_post_id) &&
    (group.source_type === "hangout" || group.source_type === "experience");
  const occursIso = group.occurs_at?.trim() || "";
  const occursLabel = occursIso
    ? formatSocialOccursSchedule(
        occursIso,
        group.occurs_time_explicit !== false
      ).trim() || null
    : null;
  const slots = groupUpRequestPreviewSlots(pendingCount, cachedRequesters);
  const previewKind = groupUpRequestPreviewKind(pendingCount);
  const openLabel = `${title}. ${countLabel}. ${peopleUiCopy.groupUpRequestGroupOpen}`;
  const selfUrl =
    (userId ? getCachedAvatar(userId) : null) || readLocal("my_avatar_url");
  const selfName = readLocal("my_display_name") || "You";

  return (
    <li className="max-w-full overflow-visible border-b border-[var(--border)]/50 px-1 py-2.5">
      <div className="flex w-full max-w-full items-start gap-3">
        <div
          className="relative shrink-0 pb-2"
          style={{ width: SQUIRCLE_PX }}
        >
          <button
            type="button"
            onClick={() => onOpen(group)}
            className={[
              "flex items-center justify-center overflow-hidden rounded-[16px] border-2 transition active:opacity-90",
              "border-black/30 bg-[color-mix(in_oklab,#1a365d_36%,var(--surface-2))]",
              "text-[var(--text)]/80",
              "app-light:border-black/35 app-light:bg-[color-mix(in_oklab,#1e3a5f_32%,var(--surface-2))]",
              "app-dark:border-white/40 app-dark:bg-[color-mix(in_oklab,#0b1f38_88%,var(--surface-2))] app-dark:text-white/90",
            ].join(" ")}
            style={{ width: SQUIRCLE_PX, height: SQUIRCLE_PX }}
            aria-label={openLabel}
          >
            <PiUsersThree className="h-[26px] w-[26px] shrink-0" aria-hidden />
          </button>
          <span
            className="pointer-events-none absolute bottom-2 left-1/2 z-[1] inline-flex h-[14px] max-w-[calc(100%-6px)] -translate-x-1/2 translate-y-1/2 items-center justify-center truncate rounded-full border border-[var(--text)]/18 bg-[var(--bg)] px-1.5 text-[8px] font-semibold leading-none text-[var(--text)]/70"
            aria-hidden
          >
            {peopleUiCopy.groupUpBrowseTabYours}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <button
              type="button"
              onClick={() => onOpen(group)}
              className="w-full min-w-0 text-left transition active:opacity-90"
              aria-label={openLabel}
            >
              <span className="block truncate text-[15px] font-semibold leading-snug text-[var(--text)]">
                {title}
              </span>
              {description ? (
                <span className="mt-0.5 block line-clamp-2 text-[13px] leading-snug text-[var(--text)]/55">
                  {description}
                </span>
              ) : null}
            </button>
            {occursLabel || canViewPost ? (
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {occursLabel ? (
                  <span
                    data-group-occurs-label
                    className="min-w-0 max-w-full truncate rounded-sm bg-[var(--green-bg)] px-1 py-px text-[12.5px] leading-snug text-[var(--green-text)]"
                  >
                    {occursLabel}
                  </span>
                ) : null}
                {canViewPost ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewPost(group);
                    }}
                    className="inline-flex min-h-8 items-center transition active:scale-[0.98]"
                    aria-label={peopleUiCopy.groupUpRequestGroupViewPost}
                  >
                    <span className="inline-flex items-center gap-0.5 rounded-full border border-[var(--brand-glass-border)] bg-[var(--brand)] px-1 py-0 text-[11px] font-semibold leading-none text-[var(--brand-ink)]">
                      <span>{peopleUiCopy.groupUpRequestGroupViewPost}</span>
                      <PiArrowSquareOutBold
                        className="h-2.5 w-2.5 shrink-0"
                        aria-hidden
                      />
                    </span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => onOpen(group)}
            className="relative shrink-0 self-center overflow-visible transition active:opacity-90"
            aria-label={openLabel}
            data-preview-kind={previewKind}
          >
            <span
              className="relative inline-flex overflow-visible rounded-full border border-[var(--text)]/16 bg-[color-mix(in_oklab,var(--surface-2)_22%,transparent)] app-dark:border-white/18 app-light:border-black/14"
              style={{ padding: PREVIEW_CAPSULE_PAD_PX }}
              data-preview-capsule
            >
              <span className="flex flex-col items-center" aria-hidden>
                {slots.map((slot, i) => (
                  <span
                    key={
                      slot.kind === "self"
                        ? "self"
                        : slot.requester?.request_id ?? `empty-${i}`
                    }
                    className="relative inline-flex rounded-full ring-1 ring-[var(--bg)]"
                    style={{
                      marginTop: i === 0 ? 0 : -PREVIEW_OVERLAP_PX,
                      zIndex: slots.length - i,
                    }}
                  >
                    {slot.kind === "self" ? (
                      <Avatar
                        url={selfUrl}
                        name={selfName}
                        userId={userId}
                        size={PREVIEW_AVATAR_PX}
                        tightLineBox
                        disableInnerPointer
                        className="rounded-full"
                      />
                    ) : slot.requester ? (
                      <Avatar
                        url={slot.requester.avatar_url}
                        name={
                          slot.requester.display_name?.trim() ||
                          slot.requester.username?.trim() ||
                          peopleUiCopy.groupUpIncomingSomeone
                        }
                        userId={slot.requester.requester_user_id}
                        size={PREVIEW_AVATAR_PX}
                        tightLineBox
                        disableInnerPointer
                        className="rounded-full"
                      />
                    ) : (
                      <span
                        className="inline-flex items-center justify-center rounded-full border border-[var(--border)]/45 bg-[color-mix(in_oklab,var(--surface-2)_72%,var(--bg))] app-dark:border-[var(--border)]/55 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_55%,#0a0a0c)]"
                        style={{
                          width: PREVIEW_AVATAR_PX,
                          height: PREVIEW_AVATAR_PX,
                        }}
                      >
                        <PiUser
                          className="h-3.5 w-3.5 text-[var(--text)]/40"
                          aria-hidden
                        />
                      </span>
                    )}
                  </span>
                ))}
              </span>
              <span
                data-request-count-badge
                className="absolute right-0 top-0 z-[5] inline-flex h-5 min-w-5 translate-x-[5px] -translate-y-[5px] items-center justify-center rounded-full bg-[var(--brand)] px-1 text-[10px] font-bold tabular-nums leading-none text-[var(--brand-ink)] shadow-[0_0_0_2px_var(--bg)]"
              >
                {pendingCountBadgeLabel(pendingCount)}
              </span>
            </span>
          </button>
        </div>
      </div>
    </li>
  );
}
