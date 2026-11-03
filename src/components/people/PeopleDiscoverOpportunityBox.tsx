/**
 * Discover opportunity box — Event/Post metadata, caption, optional note,
 * Heart above Message top-right. Presentation-only.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { PiArrowSquareOutBold } from "react-icons/pi";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import { postTypeCompactLabel } from "../../lib/postTypeLabels";
import {
  PEOPLE_FEED_CAPTION_TEXT_CLASS,
  PEOPLE_PERSONAL_NOTE_ACCENT_CLASS,
  PEOPLE_PERSONAL_NOTE_TEXT_CLASS,
} from "../../lib/people/peopleFeedLayout";
import type { PeopleFeedHeartState } from "./PeopleFeedActionRail";
import PeopleActionStateButton, {
  type PeopleActionConfirmedState,
} from "./PeopleActionStateButton";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import {
  applyDuoCommentListFlags,
  duoCommentStateKey,
  duoCommentVisual,
  getDuoCommentSnapshot,
  getDuoCommentRevision,
  getDuoCommentViewerId,
  subscribeDuoCommentState,
} from "../../lib/people/duoCommentState";
import { reopenSentDuoComment } from "../../lib/people/duoCommentActions";
import toast from "react-hot-toast";

const CAPTION_BASE =
  "min-h-0 overflow-hidden whitespace-pre-wrap break-words [overflow-wrap:anywhere]";

/** Discover-only: three lines when no opportunity note. */
export const PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS = `${CAPTION_BASE} line-clamp-3`;

/** Discover-only: two lines when a nonempty note follows. */
export const PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS = `${CAPTION_BASE} line-clamp-2`;

/** @deprecated Prefer clamp-2 / clamp-3 helpers — default max without note. */
export const PEOPLE_DISCOVER_CAPTION_CLAMP_CLASS =
  PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS;

const DATE_PILL_BASE =
  "inline-flex h-5 max-w-full items-center truncate rounded-md px-1.5 text-[10px] font-semibold leading-none tracking-tight";

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

const DISCOVER_SEE_POST_CLASS = [
  "inline-flex h-5 max-w-full shrink-0 items-center gap-1 rounded-md border",
  "border-[var(--text)]/15 bg-[color-mix(in_oklab,var(--surface)_72%,transparent)]",
  "px-1.5 text-[10px] font-semibold leading-none tracking-tight text-[var(--text)]/70",
  "touch-manipulation",
].join(" ");

function discoverHeartPressAllowed(heartState: PeopleFeedHeartState): boolean {
  return heartState !== "disabled" && heartState !== "busy";
}

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

export type PeopleDiscoverOpportunityBoxProps = {
  opportunityId: string;
  postType: "hangout" | "experience" | null;
  caption: string | null;
  scheduleLabel: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  note: string | null;
  displayName: string;
  personKey: string;
  isUnseen?: boolean;
  onSeePost?: () => void;
  heartLabel: string;
  heartState: PeopleFeedHeartState;
  onHeart: () => void;
  messageLabel?: string | null;
  messageBusy?: boolean;
  messageDisabled?: boolean;
  onMessage?: (() => void) | null;
  sourcePostId?: string | null;
  recipientUserId?: string | null;
  duoCommentedByMe?: boolean | null;
  viewerHasActivePairUp?: boolean | null;
  identitySource?: ProfileIdentityMediaSource | null;
  onCommentPoolJoined?: () => void;
};

export default function PeopleDiscoverOpportunityBox({
  opportunityId,
  postType,
  caption,
  scheduleLabel,
  scheduleLabelKind = null,
  note,
  displayName: _displayName,
  personKey: _personKey,
  isUnseen = false,
  onSeePost,
  heartLabel,
  heartState,
  onHeart,
  messageLabel = null,
  messageBusy = false,
  messageDisabled = false,
  onMessage = null,
  sourcePostId = null,
  recipientUserId = null,
  duoCommentedByMe = null,
  viewerHasActivePairUp = null,
  identitySource = null,
  onCommentPoolJoined,
}: PeopleDiscoverOpportunityBoxProps) {
  void _personKey;
  const commentRevision = useSyncExternalStore(
    subscribeDuoCommentState,
    getDuoCommentRevision,
    getDuoCommentRevision
  );
  const viewerForComment = getDuoCommentViewerId();
  const commentKey =
    viewerForComment && sourcePostId && recipientUserId
      ? duoCommentStateKey(viewerForComment, sourcePostId, recipientUserId)
      : "";
  const commentSnapshot = getDuoCommentSnapshot(commentKey);
  void commentRevision;
  useEffect(() => {
    if (!viewerForComment || !sourcePostId || !recipientUserId) return;
    applyDuoCommentListFlags({
      viewerId: viewerForComment,
      sourcePostId,
      recipientUserId,
      commented: duoCommentedByMe ?? null,
      viewerHasActivePairUp: viewerHasActivePairUp ?? null,
    });
  }, [
    viewerForComment,
    sourcePostId,
    recipientUserId,
    duoCommentedByMe,
    viewerHasActivePairUp,
  ]);
  const heartConfirmedRef = useRef<PeopleActionConfirmedState>("idle");
  if (heartState === "active" || heartState === "pending") {
    heartConfirmedRef.current = "active";
  } else if (heartState === "idle" || heartState === "disabled") {
    heartConfirmedRef.current = "idle";
  }
  const captionText = caption?.trim() || "";
  const dateText = scheduleLabel?.trim() || "";
  const noteText = note?.trim() || null;
  const typeLabel = postType ? postTypeCompactLabel(postType) : null;
  const captionClampClass = noteText
    ? PEOPLE_DISCOVER_CAPTION_CLAMP_2_CLASS
    : PEOPLE_DISCOVER_CAPTION_CLAMP_3_CLASS;
  const heartDisabled = !discoverHeartPressAllowed(heartState);
  const heartButtonState =
    heartState === "busy"
      ? "pending"
      : heartState === "disabled"
        ? "disabled"
        : heartState === "active" || heartState === "pending"
          ? "active"
          : "idle";
  const showMessage = typeof onMessage === "function" && Boolean(messageLabel);
  const messageBlocked = Boolean(messageDisabled || messageBusy);
  const commentVisual = duoCommentVisual({
    snapshot: commentSnapshot,
    listCommented: duoCommentedByMe ?? null,
  });
  const commentButtonState = messageBusy ? "pending" : commentVisual.state;
  const commentPressBlocked =
    messageBlocked || commentButtonState === "pending" || commentVisual.disabled;
  const captionClass = `mt-1.5 w-full text-left ${PEOPLE_FEED_CAPTION_TEXT_CLASS} ${captionClampClass}`;

  return (
    <div
      className="flex min-w-0 items-start gap-1.5 rounded-xl border border-[var(--border)]/70 bg-[var(--surface)]/40 py-2.5 pl-3 pr-2"
      data-people-discover-opp-box="true"
      data-people-discover-opp-pad="px-3"
      data-people-feed-opportunity={opportunityId}
      data-people-discover-opp-unseen={isUnseen ? "true" : "false"}
    >
      <div className="min-w-0 flex-1">
        <div
          className="flex min-w-0 flex-wrap items-center gap-1.5"
          data-people-discover-opp-meta="true"
        >
          {postType && typeLabel ? (
            <span
              className={typeLabelClass(postType)}
              data-people-discover-opp-type="true"
              data-people-discover-opp-type-kind={postType}
            >
              {typeLabel}
            </span>
          ) : null}
          {dateText ? (
            <span
              className={schedulePillClass(scheduleLabelKind)}
              data-people-discover-opp-date="true"
            >
              {dateText}
            </span>
          ) : null}
          {onSeePost ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeePost();
              }}
              className={DISCOVER_SEE_POST_CLASS}
              aria-label={peopleUiCopy.deckSeePost}
              data-people-discover-see-post="true"
            >
              <PiArrowSquareOutBold className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{peopleUiCopy.deckSeePost}</span>
            </button>
          ) : null}
        </div>

        {captionText ? (
          onSeePost ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSeePost();
              }}
              className={`${captionClass} bg-transparent p-0`}
              data-people-discover-opp-caption="true"
              data-people-discover-opp-caption-lines={noteText ? "2" : "3"}
              data-people-discover-opp-caption-action="see-post"
            >
              {captionText}
            </button>
          ) : (
            <p
              className={captionClass}
              data-people-discover-opp-caption="true"
              data-people-discover-opp-caption-lines={noteText ? "2" : "3"}
            >
              {captionText}
            </p>
          )
        ) : null}

        {noteText ? (
          <p
            className={`${PEOPLE_PERSONAL_NOTE_ACCENT_CLASS} ${PEOPLE_PERSONAL_NOTE_TEXT_CLASS}`}
            data-people-discover-opp-note="true"
            data-people-personal-note-accent="true"
          >
            {noteText}
          </p>
        ) : null}
      </div>

      <div
        className="pointer-events-auto flex w-11 shrink-0 flex-col items-center gap-2 self-start pt-0.5"
        data-people-discover-opp-actions="true"
        data-people-discover-opp-actions-align="top-right"
      >
        <PeopleActionStateButton
          kind="heart"
          size={44}
          state={heartButtonState}
          confirmedState={heartConfirmedRef.current}
          disabled={heartDisabled && heartButtonState !== "pending"}
          ariaLabel={heartLabel}
          onClick={() => {
            if (!discoverHeartPressAllowed(heartState)) return;
            onHeart();
          }}
        />
        {showMessage ? (
          <PeopleActionStateButton
            kind="comment"
            size={44}
            state={commentButtonState}
            confirmedState={
              commentButtonState === "pending"
                ? commentVisual.confirmedState
                : commentVisual.confirmedState
            }
            disabled={commentPressBlocked && commentButtonState !== "pending"}
            ariaLabel={messageLabel ?? "Comment"}
            onClick={() => {
              if (commentPressBlocked) return;
              if (
                commentVisual.domain === "sent" &&
                sourcePostId &&
                recipientUserId
              ) {
                void reopenSentDuoComment({
                  identity: {
                    surface: "discover",
                    opportunityId,
                    sourcePostId,
                    recipientUserId,
                    displayName: _displayName,
                    identitySource: identitySource ?? {
                      display_name: _displayName,
                    },
                    caption,
                    scheduleLabel,
                    scheduleLabelKind: scheduleLabelKind ?? null,
                    sourceType: postType,
                  },
                  onJoined: onCommentPoolJoined,
                }).then((outcome) => {
                  if (outcome === "compose") onMessage?.();
                  if (outcome === "unavailable") {
                    toast.error(peopleUiCopy.commentComposerUnavailable);
                  }
                  if (outcome === "opened") {
                    const pool = getDuoCommentSnapshot(commentKey)
                      .viewerHasActivePairUp;
                    if (pool === false) {
                      toast.error(peopleUiCopy.commentComposerSentInterestFailed);
                    }
                  }
                });
                return;
              }
              onMessage?.();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
