/**
 * Single People feed row — Home Post geometry, People media + rail.
 * Does not import Home ProgressiveFeed / Post.
 */
import type { RefCallback } from "react";
import { PostTypeMetaChip } from "../ui/PostFeedSurfaceMeta";
import type { ProfileIdentityMediaSource } from "../../lib/profileIdentityMedia";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import {
  PEOPLE_FEED_CAPTION_CLAMP_CLASS,
  PEOPLE_FEED_CAPTION_TEXT_CLASS,
} from "../../lib/people/peopleFeedLayout";
import PeopleCandidateMedia from "./PeopleCandidateMedia";
import MinePortraitIdentityOverlay from "./MinePortraitIdentityOverlay";
import MineOpportunityNote from "./MineOpportunityNote";
import PeopleSeePostControl from "./PeopleSeePostControl";
import PeopleFeedActionRail, {
  type PeopleFeedHeartState,
} from "./PeopleFeedActionRail";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";

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

export type PeopleFeedRowPostType = "hangout" | "experience" | null;

export type PeopleFeedRowProps = {
  opportunityId: string;
  identitySource: ProfileIdentityMediaSource;
  photoIndex: number;
  onPhotoIndexChange: (index: number) => void;
  isCurrent: boolean;
  withPhoto?: boolean;
  displayName: string;
  personKey: string;
  identityVisible?: boolean;
  onOpenProfile?: () => void;
  caption: string | null;
  scheduleLabel: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  postType?: PeopleFeedRowPostType;
  onSeePost?: () => void;
  note: string | null;
  isUnseen?: boolean;
  heartLabel: string;
  heartState: PeopleFeedHeartState;
  onHeart: () => void;
  messageLabel?: string | null;
  messageBusy?: boolean;
  messageDisabled?: boolean;
  onMessage?: (() => void) | null;
};

export default function PeopleFeedRow({
  opportunityId,
  identitySource,
  photoIndex,
  onPhotoIndexChange,
  isCurrent,
  withPhoto = true,
  displayName,
  personKey,
  identityVisible = true,
  onOpenProfile,
  caption,
  scheduleLabel,
  scheduleLabelKind = null,
  postType = null,
  onSeePost,
  note,
  isUnseen = false,
  heartLabel,
  heartState,
  onHeart,
  messageLabel = null,
  messageBusy = false,
  messageDisabled = false,
  onMessage = null,
}: PeopleFeedRowProps) {
  const captionText = caption?.trim() || "";
  const dateText = scheduleLabel?.trim() || "";
  const noteText = note?.trim() || null;
  const showIdentity = identityVisible !== false;

  const identityOverlay = showIdentity ? (
    <MinePortraitIdentityOverlay
      name={displayName}
      bio={null}
      resetKey={`${personKey}:${photoIndex}`}
      interactive={isCurrent}
      onOpenProfile={isCurrent ? onOpenProfile : undefined}
      feedLayout
    />
  ) : null;

  return (
    <article
      className="w-full border-t border-[var(--border)] px-0"
      style={{
        paddingTop: "var(--people-feed-row-pad-y, 12px)",
        paddingBottom: "var(--people-feed-row-pad-y, 12px)",
      }}
      data-people-feed-row="true"
      data-people-feed-opportunity={opportunityId}
      data-people-feed-current={isCurrent ? "true" : "false"}
    >
      {/*
        Main content column (source + media + note) shares one width.
        Action rail is a sibling, bottom-aligned to note or photo.
      */}
      <div
        className="flex min-w-0 items-end overflow-x-hidden"
        style={{ gap: "var(--people-feed-rail-gap, 8px)" }}
        data-people-feed-columns="true"
      >
        <div
          className="relative min-w-0 flex-1"
          data-people-feed-main-col="true"
        >
          <div
            className="flex min-w-0 items-start gap-1.5"
            style={{ marginBottom: "var(--people-feed-source-gap, 12px)" }}
            data-people-feed-source-header="true"
            data-people-feed-source-narrow="320"
          >
            {postType ? (
              <PostTypeMetaChip type={postType} className="mt-0.5 shrink-0" />
            ) : null}
            <div className="min-w-0 flex-1 overflow-hidden">
              {captionText ? (
                onSeePost && isCurrent ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeePost();
                    }}
                    className={`w-full min-w-0 bg-transparent p-0 text-left transition hover:brightness-[1.03] ${PEOPLE_FEED_CAPTION_TEXT_CLASS}`}
                    aria-label={`${peopleUiCopy.deckSeePost}: ${captionText}`}
                  >
                    <span
                      className={PEOPLE_FEED_CAPTION_CLAMP_CLASS}
                      data-people-feed-caption-clamp="true"
                    >
                      {captionText}
                    </span>
                  </button>
                ) : (
                  <p
                    className={`${PEOPLE_FEED_CAPTION_TEXT_CLASS} ${PEOPLE_FEED_CAPTION_CLAMP_CLASS}`}
                    data-people-feed-caption-clamp="true"
                  >
                    {captionText}
                  </p>
                )
              ) : null}
              <div className="mt-1 flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                {dateText ? (
                  <span className={schedulePillClass(scheduleLabelKind)}>
                    {dateText}
                  </span>
                ) : null}
                {onSeePost ? (
                  <PeopleSeePostControl onClick={() => onSeePost()} />
                ) : null}
              </div>
            </div>
          </div>

          <div
            className="relative w-full overflow-hidden"
            style={{
              maxHeight: "var(--people-feed-media-max-h, 40vh)",
              borderRadius: "var(--people-feed-media-radius, 1rem)",
            }}
            data-people-feed-portrait="true"
          >
            <div
              className="relative w-full overflow-hidden"
              style={{
                aspectRatio: "3 / 4",
                maxHeight: "var(--people-feed-media-max-h, 40vh)",
                borderRadius: "var(--people-feed-media-radius, 1rem)",
              }}
            >
              <PeopleCandidateMedia
                source={identitySource}
                activeIndex={photoIndex}
                onActiveIndexChange={onPhotoIndexChange}
                withPhoto={withPhoto}
                isCurrent={isCurrent}
                enableTapCycle={isCurrent}
                presentation="mine"
                peekDirection="up"
                identityOverlay={identityOverlay}
                tapIdentityKey={`${opportunityId}:${personKey}`}
                isUnseen={isUnseen}
                feedLayout
                feedNeutralEchoSeed={opportunityId}
              />
            </div>
          </div>

          {noteText ? (
            <div
              className="min-w-0"
              style={{ marginTop: "var(--people-feed-note-gap, 8px)" }}
              data-people-feed-note="true"
            >
              <MineOpportunityNote
                note={noteText}
                resetKey={opportunityId}
                interactive={isCurrent}
                personDisplayName={displayName}
                personAvatarUrl={null}
                personUserId={showIdentity ? personKey : null}
                anonymousIdentity={!showIdentity}
              />
            </div>
          ) : null}
        </div>

        <PeopleFeedActionRail
          heartLabel={heartLabel}
          heartState={heartState}
          onHeart={onHeart}
          messageLabel={messageLabel}
          messageBusy={messageBusy}
          messageDisabled={messageDisabled}
          onMessage={onMessage}
        />
      </div>
    </article>
  );
}

/** Optional ref attach helper for IntersectionObserver parents. */
export type PeopleFeedRowRef = RefCallback<HTMLElement>;
