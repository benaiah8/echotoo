import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { PiArrowSquareOut, PiMegaphone, PiUsers } from "react-icons/pi";
import { type NotificationWithActor } from "../../types/notification";
import { markNotificationAsRead } from "../../api/services/notifications";
import { getInviteById } from "../../api/services/invites";
import { toggleInviteInterest } from "../../api/services/inviteThreads";
import { formatDistanceToNow } from "date-fns";
import Avatar from "../ui/Avatar";
import BottomDrawer from "../ui/BottomDrawer";
import { PostTypeMetaChip } from "../ui/PostFeedSurfaceMeta";
import { Paths } from "../../router/Paths";
import { getViewerAuthUserId } from "../../api/services/follows";
import PersonalInviteThreadOverlay from "./PersonalInviteThreadOverlay";
import GroupInviteThreadOverlay from "./GroupInviteThreadOverlay";
import InviteExpiryPill, { inviteExpiryActive } from "./InviteExpiryPill";

function parseInterestCount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  return 0;
}

function parseInterestUi(ad: Record<string, unknown> | undefined): {
  viewerInterested: boolean;
  interestCount: number;
} {
  return {
    viewerInterested: ad?.viewer_interested === true,
    interestCount: parseInterestCount(ad?.interest_count),
  };
}

function formatInterestedRecipientLabel(interested: boolean): string {
  return interested ? "Interested" : "I'm interested";
}

function formatSenderInterestedLine(count: number): string {
  if (count === 0) return "0 interested";
  if (count === 1) return "1 interested";
  return `${count} interested`;
}

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
  /** Brief highlight from push deep-link */
  highlighted?: boolean;
}

export default function InviteNotificationItem({
  notification,
  onMarkAsRead,
  compact = false,
  showGoToPostButton = true,
  highlighted = false,
}: Props) {
  const location = useLocation();
  const inviteId = notification.additional_data?.invite_id;
  const rawThreadId = notification.additional_data?.thread_id;
  const personalThreadId =
    typeof rawThreadId === "string" && rawThreadId.length > 0
      ? rawThreadId
      : null;
  const threadKind = notification.additional_data?.thread_kind;
  const isAnnouncementRow = threadKind === "announcement";
  const isGroupThreadRow = threadKind === "group";
  const showOpenPersonalThread =
    personalThreadId != null &&
    threadKind === "personal";
  const showOpenGroupThread = personalThreadId != null && threadKind === "group";
  const showOpenThread = showOpenPersonalThread || showOpenGroupThread;

  const [inviteDirection, setInviteDirection] = useState<
    "sent" | "received" | null
  >(null);
  const [personalThreadDrawerOpen, setPersonalThreadDrawerOpen] =
    useState(false);
  const [groupThreadDrawerOpen, setGroupThreadDrawerOpen] = useState(false);
  const [announcementDrawerOpen, setAnnouncementDrawerOpen] = useState(false);
  const [announcementInterestUi, setAnnouncementInterestUi] = useState(() =>
    parseInterestUi(notification.additional_data)
  );
  const [interestTogglePending, setInterestTogglePending] = useState(false);

  /** Sync interest fields when this drawer opens or the row targets a different notification. */
  useEffect(() => {
    if (!announcementDrawerOpen || threadKind !== "announcement") return;
    setAnnouncementInterestUi(parseInterestUi(notification.additional_data));
    /* Omit notification.additional_data from deps so parent re-renders do not reset optimistic interest UI. */
  }, [announcementDrawerOpen, notification.id, threadKind]); // eslint-disable-line react-hooks/exhaustive-deps -- seed on open / id change only

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
    if (showOpenGroupThread) {
      setGroupThreadDrawerOpen(true);
      return;
    }
    setPersonalThreadDrawerOpen(true);
  };

  const openAnnouncementFromRow = () => {
    void handleClick();
    setAnnouncementDrawerOpen(true);
  };

  const handleAnnouncementInterestToggle = async () => {
    if (
      !personalThreadId ||
      inviteDirection !== "received" ||
      interestTogglePending
    ) {
      return;
    }
    const prev = announcementInterestUi;
    const nextInterested = !prev.viewerInterested;
    const delta = nextInterested ? 1 : -1;
    setInterestTogglePending(true);
    setAnnouncementInterestUi({
      viewerInterested: nextInterested,
      interestCount: Math.max(0, prev.interestCount + delta),
    });
    const { data, error } = await toggleInviteInterest(
      personalThreadId,
      nextInterested
    );
    setInterestTogglePending(false);
    if (error || !data) {
      setAnnouncementInterestUi(prev);
      return;
    }
    setAnnouncementInterestUi({
      viewerInterested: data.viewer_interested,
      interestCount: data.interest_count,
    });
  };

  const handleRowClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("a[href], button")) return;
    if (isAnnouncementRow) {
      openAnnouncementFromRow();
      return;
    }
    if (!showOpenThread) return;
    openThreadFromRow();
  };

  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (isAnnouncementRow) {
      e.preventDefault();
      openAnnouncementFromRow();
      return;
    }
    if (!showOpenThread) return;
    e.preventDefault();
    openThreadFromRow();
  };

  const actorName =
    notification.actor?.display_name ||
    notification.actor?.username ||
    "Someone";
  const actorUsernameRaw = notification.actor?.username;
  const actorProfileHref =
    typeof actorUsernameRaw === "string" && actorUsernameRaw.trim().length > 0
      ? `/u/${encodeURIComponent(actorUsernameRaw.trim())}`
      : null;

  const rawPostType = notification.additional_data?.post_type || "hangout";
  const metaPostType: "hangout" | "experience" =
    rawPostType === "experience" ? "experience" : "hangout";
  const avatarSize = compact ? 36 : 42;
  const rowPad = compact ? "py-2 pl-1 pr-0.5" : "py-2.5 pl-1 pr-1";

  const announcementTitleText =
    inviteDirection === "sent"
      ? "You sent an announcement"
      : inviteDirection === "received"
        ? `${actorName} sent an announcement`
        : "Announcement invite";

  const titleParts: {
    prefix: string;
    actor: string | null;
    suffix: string;
  } =
    threadKind === "personal"
      ? inviteDirection === "sent"
        ? { prefix: "You invited", actor: actorName, suffix: "" }
        : inviteDirection === "received"
          ? { prefix: "", actor: actorName, suffix: "invited you" }
          : { prefix: "Invite ·", actor: actorName, suffix: "" }
      : threadKind === "group"
        ? inviteDirection === "sent"
          ? { prefix: "You invited", actor: "a group", suffix: "" }
          : inviteDirection === "received"
            ? {
                prefix: "",
                actor: actorName,
                suffix: "invited you to a group",
              }
            : { prefix: "Invite ·", actor: actorName, suffix: "" }
        : { prefix: "Invite ·", actor: actorName, suffix: "" };

  const titleHasPrefix = titleParts.prefix.trim().length > 0;
  const titleHasActor = !!titleParts.actor && titleParts.actor.trim().length > 0;
  const titleHasSuffix = titleParts.suffix.trim().length > 0;

  const actorLabel =
    notification.actor?.display_name || notification.actor?.username || "user";

  const rowAnnouncementIcon = (
    <span
      className="inline-flex items-center justify-center rounded-full border border-neutral-900/22 bg-[color-mix(in_oklab,var(--surface-2)_42%,transparent)] text-[var(--text)]/72 shadow-[inset_0_0_0_0.5px_rgba(23,23,23,0.12)] app-dark:border-white/26 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_28%,transparent)] app-dark:text-amber-200/85"
      style={{ width: avatarSize, height: avatarSize }}
      aria-label="Announcement invite"
    >
      <PiMegaphone className="h-[52%] w-[52%]" aria-hidden />
    </span>
  );

  const rowGroupIcon = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (showOpenGroupThread) {
          openThreadFromRow();
        }
      }}
      disabled={!showOpenGroupThread}
      className={[
        "group -m-px inline-flex rounded-full outline-none ring-offset-2 ring-offset-[var(--bg)] focus-visible:ring-2 focus-visible:ring-amber-400/40",
        showOpenGroupThread ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
      aria-label={showOpenGroupThread ? "Open group invite chat" : "Group invite"}
    >
      <span
        className="inline-flex items-center justify-center rounded-full border border-neutral-900/38 bg-transparent text-neutral-900 shadow-[inset_0_0_0_0.5px_rgba(23,23,23,0.18)] ring-1 ring-black/5 app-dark:border-amber-300/40 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_68%,#050507)] app-dark:text-amber-300"
        style={{ width: avatarSize, height: avatarSize }}
      >
        <PiUsers className="h-[58%] w-[58%]" aria-hidden />
      </span>
    </button>
  );

  const rowActorAvatar =
    actorProfileHref != null ? (
      <Link
        to={actorProfileHref}
        onClick={(e) => e.stopPropagation()}
        className="-m-px rounded-full outline-none ring-offset-2 ring-offset-[var(--bg)] focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={`Profile: ${actorLabel}`}
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
    );

  const latestPreview =
    typeof notification.additional_data?.latest_preview_text === "string"
      ? notification.additional_data.latest_preview_text.trim()
      : "";

  const inviteNote =
    typeof notification.additional_data?.invite_note === "string"
      ? notification.additional_data.invite_note.trim()
      : "";

  const captionRaw =
    typeof notification.additional_data?.post_caption === "string"
      ? notification.additional_data.post_caption.trim()
      : "";

  const previewText =
    latestPreview.length > 0
      ? latestPreview
      : inviteNote.length > 0
        ? inviteNote
        : captionRaw.length > 0
          ? captionRaw
          : null;

  const linkTo = notification.additional_data?.post_id
    ? `${Paths.experience}/${notification.additional_data.post_id}`
    : "#";

  const timeAgoRelative = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  const seePostLinkClass =
    "inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-[var(--text)]/65 underline decoration-transparent underline-offset-2 transition-colors hover:text-primary/85 hover:decoration-primary/45 hover:underline sm:text-[11px]";

  /** latest_preview_text from additional_data is set by backend (message/reaction activity); no per-row thread fetch. */

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

  const rowInteractive = showOpenThread || isAnnouncementRow;

  const drawerInviteNoteFull =
    typeof notification.additional_data?.invite_note === "string"
      ? notification.additional_data.invite_note.trim()
      : "";
  const drawerPostCaptionFull =
    typeof notification.additional_data?.post_caption === "string"
      ? notification.additional_data.post_caption.trim()
      : "";

  const announcementDrawerFooter =
    showGoToPostButton && linkTo !== "#" ? (
      <div className="border-t border-[var(--border)]/55 bg-[color-mix(in_oklab,var(--surface-2)_35%,transparent)] px-4 pt-3 pb-1">
        <Link
          to={linkTo}
          state={{ backgroundLocation: location }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-[var(--brand-ink)] shadow-sm transition-opacity hover:opacity-95"
          aria-label="See post"
        >
          See post
          <PiArrowSquareOut className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
        </Link>
      </div>
    ) : null;

  const announcementRowBody = (
    <>
      <div className="flex w-11 shrink-0 items-center justify-center self-start pt-0.5 sm:w-12">
        {rowAnnouncementIcon}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
        {/* Title row */}
        <div className="flex min-w-0 items-center gap-1.5">
          <PostTypeMetaChip type={metaPostType} className="shrink-0" />
          <span
            className={`min-w-0 flex-1 truncate text-[13px] leading-snug sm:text-sm ${
              notification.is_read
                ? "text-[var(--text)]/68"
                : "text-[var(--text)]/92"
            }`}
          >
            {announcementTitleText}
          </span>
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              notification.is_read
                ? "invisible"
                : "bg-amber-400 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] ring-1 ring-amber-400/35 app-dark:bg-amber-400 app-dark:ring-amber-400/25"
            }`}
            aria-hidden={notification.is_read}
            aria-label={notification.is_read ? undefined : "Unread"}
          />
        </div>
        {/* Preview */}
        {previewText ? (
          <p
            className={`line-clamp-2 break-words text-[11px] leading-snug sm:text-xs ${
              notification.is_read
                ? "font-normal text-[var(--text)]/52"
                : "font-semibold text-[var(--text)]/88 app-dark:text-[var(--text)]/90"
            }`}
          >
            {previewText}
          </p>
        ) : null}
        {/* Footer: See post + time */}
        <div className="flex min-w-0 items-center justify-between gap-2 pt-0.5">
          {showGoToPostButton && linkTo !== "#" ? (
            <Link
              to={linkTo}
              state={{ backgroundLocation: location }}
              onClick={(e) => e.stopPropagation()}
              className={seePostLinkClass}
              aria-label="See post"
            >
              See post
              <PiArrowSquareOut className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden />
            </Link>
          ) : (
            <span />
          )}
          <span className="shrink-0 text-right text-[10px] tabular-nums leading-snug text-[var(--text)]/38 sm:text-[11px]">
            {timeAgoRelative}
          </span>
        </div>
      </div>
    </>
  );

  const rowBody = (
    <>
      <div className="flex w-11 shrink-0 items-center justify-center self-center sm:w-12">
        {isGroupThreadRow ? rowGroupIcon : rowActorAvatar}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-x-1.5 gap-y-1 sm:gap-x-2">
          <PostTypeMetaChip type={metaPostType} className="mt-0.5 shrink-0" />
          <div className="flex min-w-0 flex-[1_1_0] items-baseline gap-x-1.5">
            <span
              className={`inline-flex min-w-0 items-baseline whitespace-nowrap text-[13px] leading-snug sm:text-sm ${
                notification.is_read
                  ? "text-[var(--text)]/68"
                  : "text-[var(--text)]/92"
              }`}
            >
              {titleHasPrefix ? <span>{titleParts.prefix}</span> : null}
              {titleHasActor ? (
                <>
                  {titleHasPrefix ? <span>&nbsp;</span> : null}
                  <span className="inline-block max-w-[9.5rem] truncate align-bottom sm:max-w-[14rem]">
                    {titleParts.actor}
                  </span>
                </>
              ) : null}
              {titleHasSuffix ? (
                <>
                  {titleHasPrefix || titleHasActor ? <span>&nbsp;</span> : null}
                  <span>{titleParts.suffix}</span>
                </>
              ) : null}
            </span>
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full align-[0.15em] ${
                notification.is_read
                  ? "invisible"
                  : "bg-amber-400 shadow-[0_0_0_1px_rgba(0,0,0,0.06)] ring-1 ring-amber-400/35 app-dark:bg-amber-400 app-dark:ring-amber-400/25"
              }`}
              aria-hidden={notification.is_read}
              aria-label={notification.is_read ? undefined : "Unread"}
            />
          </div>
        </div>

        {previewText ? (
          <p
            className={`mt-1.5 line-clamp-2 break-words text-[11px] leading-snug sm:mt-2 sm:text-xs ${
              notification.is_read
                ? "font-normal text-[var(--text)]/52"
                : "font-semibold text-[var(--text)]/88 app-dark:text-[var(--text)]/90"
            }`}
          >
            {previewText}
          </p>
        ) : null}
      </div>

      <div className="flex max-w-[4.875rem] shrink-0 flex-col items-end gap-1 self-start pt-0.5 pl-0.5 text-right sm:max-w-[5.125rem]">
        {showGoToPostButton && linkTo !== "#" ? (
          <Link
            to={linkTo}
            state={{ backgroundLocation: location }}
            onClick={(e) => e.stopPropagation()}
            className={seePostLinkClass}
            aria-label="See post"
          >
            See post
            <PiArrowSquareOut className="h-2.5 w-2.5 shrink-0 sm:h-3 sm:w-3" aria-hidden />
          </Link>
        ) : null}
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
      </div>
    </>
  );

  return (
    <>
      <div
        tabIndex={rowInteractive ? 0 : undefined}
        aria-label={
          isAnnouncementRow
            ? "Open announcement details"
            : showOpenThread
              ? "Open invite chat"
              : undefined
        }
        onClick={rowInteractive ? handleRowClick : undefined}
        onKeyDown={rowInteractive ? handleRowKeyDown : undefined}
        className={[
          "flex min-h-[4rem] w-full items-start gap-2 text-left transition-colors sm:min-h-[4.25rem] sm:gap-3",
          rowPad,
          expired48hInviteDisplay ? "opacity-[0.93]" : "",
          rowInteractive
            ? "cursor-pointer hover:bg-[color-mix(in_oklab,var(--text)_4%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            : "",
          highlighted
            ? "rounded-xl border border-amber-400/18 app-dark:border-amber-400/22 bg-amber-400/[0.06] app-dark:bg-amber-400/[0.08] shadow-[0_2px_20px_rgba(251,191,36,0.14),0_0_1px_rgba(251,191,36,0.12)] app-dark:shadow-[0_2px_24px_rgba(251,191,36,0.12),0_0_1px_rgba(251,191,36,0.1)] transition-[box-shadow,background-color,border-color] duration-300"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {isAnnouncementRow ? announcementRowBody : rowBody}
      </div>
      <BottomDrawer
        open={announcementDrawerOpen && isAnnouncementRow}
        onClose={() => setAnnouncementDrawerOpen(false)}
        title="Invite announcement"
        maxHeight="85vh"
        shrinkSheetToContent
        footer={announcementDrawerFooter ?? undefined}
        contentClassName="px-4 pb-4 pt-2"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {inviteDirection === "sent" ? (
              <>
                <span
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-900/22 bg-[color-mix(in_oklab,var(--surface-2)_42%,transparent)] text-[var(--text)]/72 app-dark:border-white/26 app-dark:bg-[color-mix(in_oklab,var(--surface-2)_28%,transparent)] app-dark:text-amber-200/85"
                  aria-hidden
                >
                  <PiMegaphone className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-snug text-[var(--text)]">
                    You
                  </div>
                  <div className="text-xs leading-snug text-[var(--text)]/52">
                    Sent this announcement
                  </div>
                </div>
              </>
            ) : notification.actor ? (
              <>
                <Avatar
                  variant="default"
                  url={notification.actor.avatar_url || undefined}
                  name={
                    notification.actor.display_name ||
                    notification.actor.username ||
                    undefined
                  }
                  size={44}
                  tightLineBox
                />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold leading-snug text-[var(--text)]">
                    {actorName}
                  </div>
                  {actorUsernameRaw != null &&
                  String(actorUsernameRaw).trim().length > 0 ? (
                    <div className="truncate text-xs leading-snug text-[var(--text)]/52">
                      @{String(actorUsernameRaw).trim()}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <span
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-900/22 bg-[color-mix(in_oklab,var(--surface-2)_42%,transparent)] text-[var(--text)]/72"
                  aria-hidden
                >
                  <PiMegaphone className="h-5 w-5" />
                </span>
                <div className="text-[15px] font-semibold text-[var(--text)]">
                  Someone
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PostTypeMetaChip type={metaPostType} />
          </div>

          {drawerInviteNoteFull.length > 0 ? (
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text)]/45">
                Announcement
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text)]/88">
                {drawerInviteNoteFull}
              </p>
            </div>
          ) : null}

          {drawerPostCaptionFull.length > 0 ? (
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text)]/45">
                Post caption
              </div>
              <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text)]/72">
                {drawerPostCaptionFull}
              </p>
            </div>
          ) : null}

          {inviteDirection === "received" && personalThreadId ? (
            <button
              type="button"
              onClick={() => void handleAnnouncementInterestToggle()}
              disabled={interestTogglePending}
              className="w-full rounded-xl border border-primary/40 bg-primary/12 px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition-colors hover:bg-primary/18 disabled:pointer-events-none disabled:opacity-55"
            >
              {formatInterestedRecipientLabel(
                announcementInterestUi.viewerInterested
              )}
            </button>
          ) : inviteDirection === "sent" ? (
            <p className="text-sm font-medium text-[var(--text)]/72">
              {formatSenderInterestedLine(announcementInterestUi.interestCount)}
            </p>
          ) : null}

          <p className="text-[11px] tabular-nums leading-snug text-[var(--text)]/42">
            {timeAgoRelative}
          </p>
        </div>
      </BottomDrawer>
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
      <GroupInviteThreadOverlay
        open={groupThreadDrawerOpen}
        onClose={() => setGroupThreadDrawerOpen(false)}
        threadId={personalThreadId}
        windowStartAt={notification.created_at}
        windowMs={INVITE_ROW_WINDOW_MS}
      />
    </>
  );
}
