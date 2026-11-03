/**
 * Group Up vertical card — one rounded shell with creator, group identity,
 * source context, and actions. Presentation only. Parent owns handlers.
 */
import { PiArrowSquareOutBold } from "react-icons/pi";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import { postTypeCompactLabel } from "../../lib/postTypeLabels";
import {
  PEOPLE_FEED_CAPTION_TEXT_CLASS,
  PEOPLE_PERSONAL_NOTE_ACCENT_CLASS,
} from "../../lib/people/peopleFeedLayout";
import Avatar from "../ui/Avatar";
import PeopleFeedActionRail, {
  type PeopleFeedHeartState,
} from "./PeopleFeedActionRail";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

/** Vertical gap between consecutive Group Up cards (no hairline dividers). */
export const PEOPLE_GROUP_UP_CARD_GAP_CLASS = "mb-3 last:mb-0";

const CAPTION_CLAMP =
  "min-h-0 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-3";

const DESCRIPTION_CLAMP =
  "min-h-0 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-4";

const DATE_PILL_BASE =
  "inline-flex h-5 min-w-0 max-w-full items-center truncate rounded-md px-1.5 text-[10px] font-semibold leading-none tracking-tight";

const DATE_KIND_CLASSES: Record<PostScheduleLabelKind, string> = {
  today:
    "bg-green-100 text-green-900 border-green-800/35 app-dark:bg-green-500/20 app-dark:text-green-600 app-dark:border-green-500/30",
  tomorrow:
    "bg-sky-100 text-sky-950 border-sky-800/35 app-dark:bg-[var(--blue-bg)] app-dark:text-[var(--blue-text)] app-dark:border-[var(--blue-border)]",
  next_weekday:
    "bg-violet-100 text-violet-950 border-violet-800/35 app-dark:bg-violet-400/15 app-dark:text-violet-300 app-dark:border-violet-400/35",
  in_days:
    "bg-white/92 text-[var(--text)] border-black/12 app-dark:bg-[var(--text)]/8 app-dark:text-[var(--text)]/65 app-dark:border-[var(--border)]",
  passed:
    "bg-gray-100 text-gray-800 border-gray-500/40 italic app-dark:bg-gray-500/10 app-dark:text-[var(--text)]/40 app-dark:border-gray-500/25",
  posted_ago: "border-transparent bg-transparent text-[var(--text)]/55 font-normal",
};

function schedulePillClass(kind: PostScheduleLabelKind | null): string {
  if (!kind) {
    return [
      DATE_PILL_BASE,
      "border border-black/12 bg-white/92 text-[var(--text)]",
      "app-dark:border-[var(--brand-glass-border)] app-dark:bg-[var(--brand-glass-bg)]",
    ].join(" ");
  }
  return `${DATE_PILL_BASE} border ${DATE_KIND_CLASSES[kind]}`;
}

const TYPE_LABEL_CLASS =
  "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[10px] font-semibold leading-none tracking-tight";

function typeLabelClass(type: "hangout" | "experience"): string {
  return type === "hangout"
    ? [
        TYPE_LABEL_CLASS,
        "border-emerald-600/18 bg-emerald-500/[0.07] text-emerald-900/85",
        "app-dark:border-emerald-400/22 app-dark:bg-emerald-400/[0.08] app-dark:text-emerald-200/80",
      ].join(" ")
    : [
        TYPE_LABEL_CLASS,
        "border-orange-600/18 bg-orange-500/[0.07] text-orange-900/85",
        "app-dark:border-orange-400/22 app-dark:bg-orange-400/[0.08] app-dark:text-orange-200/80",
      ].join(" ");
}

const SEE_POST_CLASS = [
  "inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded-md border",
  "border-[var(--text)]/15 bg-[color-mix(in_oklab,var(--surface)_72%,transparent)]",
  "px-1.5 text-[10px] font-semibold leading-none tracking-tight text-[var(--text)]/70",
  "touch-manipulation",
].join(" ");

const YOURS_PILL_CLASS = [
  "inline-flex h-5 shrink-0 items-center rounded-md border px-1.5",
  "text-[10px] font-semibold leading-none tracking-tight",
  "border-[var(--brand-glass-border)] bg-[var(--brand-glass-bg)] text-[var(--brand-glass-text)]",
].join(" ");

const OUTER_CARD_CLASS = [
  "flex min-w-0 items-start gap-1.5 rounded-xl border",
  "border-[var(--border)]/70 bg-[var(--surface)]/40 py-2.5 pl-3 pr-2",
].join(" ");

export type PeopleGroupUpFeedCardProps = {
  opportunityId: string;
  isCurrent: boolean;
  /** Creator display name or username when authorized; null when unknown. */
  creatorName: string | null;
  creatorAvatarUrl: string | null;
  creatorUserId: string | null;
  onOpenCreatorProfile?: (() => void) | null;
  groupTitle: string | null;
  groupDescription: string | null;
  sourceCaption: string | null;
  postType: "hangout" | "experience" | null;
  scheduleLabel: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  onSeePost?: (() => void) | null;
  /** Accurate owner indicator only (viewer_state === owner). */
  showYoursBadge?: boolean;
  isUnseen?: boolean;
  heartLabel: string;
  heartState: PeopleFeedHeartState;
  onHeart: () => void;
  messageLabel?: string | null;
  messageBusy?: boolean;
  messageDisabled?: boolean;
  onMessage?: (() => void) | null;
};

export default function PeopleGroupUpFeedCard({
  opportunityId,
  isCurrent,
  creatorName,
  creatorAvatarUrl,
  creatorUserId,
  onOpenCreatorProfile = null,
  groupTitle,
  groupDescription,
  sourceCaption,
  postType,
  scheduleLabel,
  scheduleLabelKind = null,
  onSeePost = null,
  showYoursBadge = false,
  isUnseen = false,
  heartLabel,
  heartState,
  onHeart,
  messageLabel = null,
  messageBusy = false,
  messageDisabled = false,
  onMessage = null,
}: PeopleGroupUpFeedCardProps) {
  const nameText = creatorName?.trim() || null;
  const titleText = groupTitle?.trim() || null;
  const descriptionText = groupDescription?.trim() || null;
  const captionText = sourceCaption?.trim() || null;
  const dateText = scheduleLabel?.trim() || null;
  const typeLabel = postType ? postTypeCompactLabel(postType) : null;
  const avatarName = nameText || peopleUiCopy.groupUpIncomingSomeone;
  const canOpenProfile =
    typeof onOpenCreatorProfile === "function" && Boolean(creatorUserId);
  const seePost = typeof onSeePost === "function" ? onSeePost : null;
  const captionClass = [
    PEOPLE_PERSONAL_NOTE_ACCENT_CLASS,
    "w-full text-left",
    PEOPLE_FEED_CAPTION_TEXT_CLASS,
    CAPTION_CLAMP,
  ].join(" ");

  return (
    <article
      className={`w-full ${PEOPLE_GROUP_UP_CARD_GAP_CLASS}`}
      data-people-group-up-feed-card="true"
      data-people-feed-opportunity={opportunityId}
      data-people-feed-current={isCurrent ? "true" : "false"}
      data-people-group-up-unseen={isUnseen ? "true" : "false"}
      data-people-group-up-yours={showYoursBadge ? "true" : "false"}
      data-people-group-up-list-gap="12"
    >
      <div
        className={OUTER_CARD_CLASS}
        data-people-group-up-card="true"
        data-people-group-up-info-card="true"
        data-people-discover-opp-pad="px-3"
      >
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            className="flex min-w-0 items-center gap-2.5"
            data-people-group-up-creator="true"
          >
            {canOpenProfile ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCreatorProfile?.();
                }}
                className="shrink-0 rounded-full touch-manipulation"
                aria-label={avatarName}
                data-people-group-up-creator-avatar-btn="true"
              >
                <Avatar
                  url={creatorAvatarUrl}
                  name={avatarName}
                  userId={creatorUserId}
                  size={32}
                  tightLineBox
                  disableInnerPointer
                  className="shrink-0"
                />
              </button>
            ) : (
              <div
                className="shrink-0"
                data-people-group-up-creator-avatar="true"
                aria-hidden={!nameText}
              >
                <Avatar
                  url={creatorAvatarUrl}
                  name={avatarName}
                  userId={creatorUserId}
                  size={32}
                  tightLineBox
                  disableInnerPointer
                  className="shrink-0"
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-[13px] font-semibold leading-snug text-[var(--text)]/90"
                data-people-group-up-creator-name="true"
              >
                {nameText || peopleUiCopy.groupUpIncomingSomeone}
              </p>
            </div>
            {showYoursBadge ? (
              <span
                className={YOURS_PILL_CLASS}
                data-people-group-up-yours-badge="true"
              >
                {peopleUiCopy.groupUpBrowseTabYours}
              </span>
            ) : null}
          </div>

          {titleText ? (
            <h3
              className="mt-2.5 min-w-0 whitespace-pre-wrap break-words text-[15px] font-semibold leading-snug text-[var(--text)] [overflow-wrap:anywhere]"
              data-people-group-up-title="true"
            >
              {titleText}
            </h3>
          ) : null}

          {descriptionText ? (
            <p
              className={`mt-1 text-[13px] leading-snug text-[var(--text)]/75 ${DESCRIPTION_CLAMP}`}
              data-people-group-up-description="true"
            >
              {descriptionText}
            </p>
          ) : null}

          {(typeLabel && postType) || dateText || seePost ? (
            <div
              className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5"
              data-people-group-up-meta="true"
            >
              {postType && typeLabel ? (
                <span
                  className={typeLabelClass(postType)}
                  data-people-group-up-type="true"
                  data-people-group-up-type-kind={postType}
                >
                  {typeLabel}
                </span>
              ) : null}
              {dateText ? (
                <span
                  className={schedulePillClass(scheduleLabelKind)}
                  data-people-group-up-date="true"
                >
                  {dateText}
                </span>
              ) : null}
              {seePost ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    seePost();
                  }}
                  className={SEE_POST_CLASS}
                  aria-label={peopleUiCopy.deckSeePost}
                  data-people-group-up-see-post="true"
                  data-people-discover-see-post="true"
                >
                  <PiArrowSquareOutBold
                    className="h-3 w-3 shrink-0"
                    aria-hidden
                  />
                  <span className="truncate">{peopleUiCopy.deckSeePost}</span>
                </button>
              ) : null}
            </div>
          ) : null}

          {captionText ? (
            seePost ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  seePost();
                }}
                className={`${captionClass} bg-transparent`}
                data-people-group-up-caption="true"
                data-people-group-up-caption-lines="3"
                data-people-group-up-caption-action="see-post"
                data-people-group-up-source-caption-accent="true"
              >
                {captionText}
              </button>
            ) : (
              <p
                className={captionClass}
                data-people-group-up-caption="true"
                data-people-group-up-caption-lines="3"
                data-people-group-up-source-caption-accent="true"
              >
                {captionText}
              </p>
            )
          ) : null}
        </div>

        <div
          className="pointer-events-auto flex w-11 shrink-0 flex-col items-center gap-2 self-start pt-0.5 [&_[data-people-feed-action-rail]]:!self-start [&_[data-people-feed-action-rail]]:!justify-start [&_[data-people-feed-action-rail]]:!pb-0"
          data-people-group-up-actions="true"
          data-people-discover-opp-actions-align="top-right"
        >
          <PeopleFeedActionRail
            heartLabel={heartLabel}
            heartState={heartState}
            onHeart={onHeart}
            messageLabel={messageLabel}
            messageBusy={messageBusy}
            messageDisabled={messageDisabled}
            onMessage={onMessage}
            discoverNeutralChrome
          />
        </div>
      </div>
    </article>
  );
}
