import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { PiArrowSquareOut } from "react-icons/pi";
import { type NotificationWithActor } from "../../types/notification";
import { markNotificationAsRead } from "../../api/services/notifications";
import { getInviteById } from "../../api/services/invites";
import { formatDistanceToNow } from "date-fns";
import Avatar from "../ui/Avatar";
import { PostTypeMetaChip } from "../ui/PostFeedSurfaceMeta";
import { Paths } from "../../router/Paths";
import { getViewerAuthUserId } from "../../api/services/follows";
import PersonalInviteThreadOverlay from "./PersonalInviteThreadOverlay";
import InviteExpiryPill, { inviteExpiryActive } from "./InviteExpiryPill";

/** Module-level cache for getInviteById results to avoid duplicate fetches per invite row. TTL 3 min. */
const INVITE_BY_ID_TTL_MS = 3 * 60 * 1000;
const inviteByIdCache = new Map<string, { data: any; ts: number }>();

function getCachedInviteById(inviteId: string): any | null {
  const entry = inviteByIdCache.get(inviteId);
  if (!entry || Date.now() - entry.ts > INVITE_BY_ID_TTL_MS) {
    if (entry) inviteByIdCache.delete(inviteId);
    return null;
  }
  return entry.data;
}

function setCachedInviteById(inviteId: string, data: any): void {
  inviteByIdCache.set(inviteId, { data, ts: Date.now() });
}

/** Display-only: invite thread row shows a 48h window from notification delivery. Backend remains source of truth. */
const INVITE_ROW_WINDOW_MS = 48 * 60 * 60 * 1000;

type ThreadKindForCountdown = "personal" | "group";

/** True when this invite row carries a counted thread kind (still display-only countdown). */
function isPersonalOrGroupThreadRow(
  kind: unknown
): kind is ThreadKindForCountdown {
  return kind === "personal" || kind === "group";
}

interface Props {
  notification: NotificationWithActor;
  onMarkAsRead: (id: string) => void;
  compact?: boolean;
  showGoToPostButton?: boolean;
}

export default function InviteNotificationItem({
  notification,
  onMarkAsRead,
  compact = false,
  showGoToPostButton = true,
}: Props) {
  const location = useLocation();
  const inviteId = notification.additional_data?.invite_id;
  const rawThreadId = notification.additional_data?.thread_id;
  const personalThreadId =
    typeof rawThreadId === "string" && rawThreadId.length > 0
      ? rawThreadId
      : null;
  const showOpenPersonalThread =
    personalThreadId != null &&
    notification.additional_data?.thread_kind === "personal";

  const threadKind = notification.additional_data?.thread_kind;

  const [inviteDirection, setInviteDirection] = useState<
    "sent" | "received" | null
  >(null);
  const [personalThreadDrawerOpen, setPersonalThreadDrawerOpen] =
    useState(false);

  useEffect(() => {
    const additionalData = notification.additional_data;
    const directionFromData = additionalData?.invite_direction;

    if (directionFromData === "sent" || directionFromData === "received") {
      setInviteDirection(directionFromData);
      return;
    }

    if (!inviteId) return;

    let invite: any = getCachedInviteById(inviteId);
    if (!invite) {
      getInviteById(inviteId)
        .then(({ data, error }) => {
          if (error || !data) return;
          setCachedInviteById(inviteId, data);
          const userId = getViewerAuthUserId();
          return userId.then((uid) => {
            const dir: "sent" | "received" =
              data.inviter_id === uid ? "sent" : "received";
            setInviteDirection(dir);
          });
        })
        .catch((err) => console.error("Error fetching invite:", err));
      return;
    }

    getViewerAuthUserId().then((userId) => {
      const dir: "sent" | "received" =
        userId && invite.inviter_id === userId ? "sent" : "received";
      setInviteDirection(dir);
    });
  }, [inviteId]); // inviteId only — aligns with upstream fetch/cache; avoids extra runs when notification object identity changes.

  const handleClick = async () => {
    if (!notification.is_read) {
      try {
        await markNotificationAsRead(notification.id);
        onMarkAsRead(notification.id);
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }
  };

  const openThreadFromRow = () => {
    void handleClick();
    setPersonalThreadDrawerOpen(true);
  };

  const handleRowClick = (e: React.MouseEvent) => {
    if (!showOpenPersonalThread) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("a[href], button")) return;
    openThreadFromRow();
  };

  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (!showOpenPersonalThread) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openThreadFromRow();
    }
  };

  const actorName =
    notification.actor?.display_name ||
    notification.actor?.username ||
    "Someone";

  const rawPostType = notification.additional_data?.post_type || "hangout";
  const metaPostType: "hangout" | "experience" =
    rawPostType === "experience" ? "experience" : "hangout";

  const titleLine =
    inviteDirection === "sent"
      ? `You invited ${actorName}`
      : inviteDirection === "received"
        ? `${actorName} invited you`
        : `Invite · ${actorName}`;

  const inviteNote =
    typeof notification.additional_data?.invite_note === "string"
      ? notification.additional_data.invite_note.trim()
      : "";

  const captionRaw =
    typeof notification.additional_data?.post_caption === "string"
      ? notification.additional_data.post_caption.trim()
      : "";

  const previewText =
    inviteNote.length > 0 ? inviteNote : captionRaw.length > 0 ? captionRaw : null;

  const linkTo = notification.additional_data?.post_id
    ? `${Paths.experience}/${notification.additional_data.post_id}`
    : "#";

  const timeAgoRelative = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  /** Message-left quota bar belongs here once batched preview data exists — avoid per-row thread fetch (see backlog). */

  const nowMs = Date.now();
  const createdMsParsed = Date.parse(notification.created_at);
  const hasValidCreatedAt = Number.isFinite(createdMsParsed);
  const show48hInviteCountdownRow = isPersonalOrGroupThreadRow(threadKind);
  const activeExpiry =
    show48hInviteCountdownRow
      ? inviteExpiryActive(
          notification.created_at,
          nowMs,
          INVITE_ROW_WINDOW_MS
        )
      : null;

  /** Personal/group invites past the display-only 48h window from notification created_at */
  const expired48hInviteDisplay =
    show48hInviteCountdownRow &&
    hasValidCreatedAt &&
    createdMsParsed + INVITE_ROW_WINDOW_MS <= nowMs;

  /** Actor corresponds to counterpart: received → inviter, sent → invitee */
  const actorUsernameRaw = notification.actor?.username;
  const actorProfileHref =
    typeof actorUsernameRaw === "string" && actorUsernameRaw.trim().length > 0
      ? `/u/${encodeURIComponent(actorUsernameRaw.trim())}`
      : null;

  const avatarSize = compact ? 36 : 42;
  const rowPad = compact ? "py-2 pl-1 pr-0.5" : "py-2.5 pl-1 pr-1";

  const rowBody = (
    <>
      <div className="flex w-11 shrink-0 items-center justify-center self-center sm:w-12">
        {actorProfileHref != null ? (
          <Link
            to={actorProfileHref}
            onClick={(e) => e.stopPropagation()}
            className="-m-px rounded-full outline-none ring-offset-2 ring-offset-[var(--bg)] focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={`Profile: ${
              notification.actor?.display_name ||
              actorUsernameRaw ||
              "user"
            }`}
          >
            <Avatar
              variant="default"
              url={notification.actor?.avatar_url || undefined}
              name={
                notification.actor?.display_name ||
                notification.actor?.username ||
                undefined
              }
              size={avatarSize}
              tightLineBox
            />
          </Link>
        ) : (
          <Avatar
            variant="default"
            url={notification.actor?.avatar_url || undefined}
            name={
              notification.actor?.display_name ||
              notification.actor?.username ||
              undefined
            }
            size={avatarSize}
            tightLineBox
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-x-1.5 gap-y-1 sm:gap-x-2">
          <PostTypeMetaChip type={metaPostType} className="mt-0.5 shrink-0" />
          <div className="flex min-w-0 flex-[1_1_0] flex-wrap items-baseline gap-x-1 gap-y-0.5">
            <span
              className={`break-words text-[13px] leading-snug sm:text-sm ${
                notification.is_read
                  ? "text-[var(--text)]/68"
                  : "text-[var(--text)]/92"
              }`}
            >
              {titleLine}
            </span>
            {showGoToPostButton && linkTo !== "#" ? (
              <>
                <span className="text-[var(--text)]/35" aria-hidden>
                  ·
                </span>
                <Link
                  to={linkTo}
                  state={{ backgroundLocation: location }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleClick();
                  }}
                  className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-normal text-[var(--text)]/55 underline decoration-transparent underline-offset-2 transition-colors hover:text-primary/85 hover:decoration-primary/45 hover:underline sm:text-[11px]"
                  aria-label="See post"
                >
                  See post
                  <PiArrowSquareOut className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden />
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {previewText ? (
          <p className="mt-1.5 line-clamp-2 break-words text-[11px] leading-snug text-[var(--text)]/52 sm:mt-2 sm:text-xs">
            {previewText}
          </p>
        ) : null}
      </div>

      <div className="flex max-w-[4.875rem] shrink-0 flex-col items-end gap-1.5 pl-0.5 pt-[2.25rem] text-right sm:max-w-[5.125rem] sm:pt-[2.5rem]">
        {show48hInviteCountdownRow ? (
          expired48hInviteDisplay ? (
            <div className="flex flex-col items-end gap-px">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--text)]/40">
                Expired
              </span>
              <span className="text-[10px] tabular-nums leading-tight text-[var(--text)]/38 sm:text-[11px]">
                {timeAgoRelative}
              </span>
            </div>
          ) : activeExpiry != null ? (
            <InviteExpiryPill
              windowStartAt={notification.created_at}
              windowMs={INVITE_ROW_WINDOW_MS}
            />
          ) : (
            <span className="text-[10px] tabular-nums leading-snug text-[var(--text)]/38 sm:text-[11px]">
              {timeAgoRelative}
            </span>
          )
        ) : (
          <span className="text-[10px] tabular-nums leading-snug text-[var(--text)]/38 sm:text-[11px]">
            {timeAgoRelative}
          </span>
        )}
        {!notification.is_read ? (
          <span
            className="block h-[5px] w-[5px] shrink-0 rounded-full bg-sky-500/60"
            aria-label="Unread"
          />
        ) : null}
      </div>
    </>
  );

  return (
    <>
      <div
        tabIndex={showOpenPersonalThread ? 0 : undefined}
        aria-label={
          showOpenPersonalThread ? "Open invite chat" : undefined
        }
        onClick={
          showOpenPersonalThread ? handleRowClick : undefined
        }
        onKeyDown={
          showOpenPersonalThread ? handleRowKeyDown : undefined
        }
        className={[
          "flex min-h-[4rem] w-full items-start gap-2 text-left transition-colors sm:min-h-[4.25rem] sm:gap-3",
          rowPad,
          expired48hInviteDisplay ? "opacity-[0.93]" : "",
          showOpenPersonalThread
            ? "cursor-pointer hover:bg-[color-mix(in_oklab,var(--text)_4%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {rowBody}
      </div>
      <PersonalInviteThreadOverlay
        open={personalThreadDrawerOpen}
        onClose={() => setPersonalThreadDrawerOpen(false)}
        threadId={personalThreadId}
        windowStartAt={notification.created_at}
        windowMs={INVITE_ROW_WINDOW_MS}
        counterparty={
          notification.actor
            ? {
                avatar_url: notification.actor.avatar_url,
                display_name: notification.actor.display_name,
                username: notification.actor.username,
              }
            : null
        }
      />
    </>
  );
}
