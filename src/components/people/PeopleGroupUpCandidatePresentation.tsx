/**
 * Groups candidate presentation — same outer People footprint as canonical Mine,
 * with source/group-centric interior (media contain, host notch, group title).
 */
import type { PublishedMediaItem } from "../../lib/publishedMedia";
import type { PostScheduleLabelKind } from "../../lib/postScheduleLabel";
import {
  PEOPLE_DUO_STACK_PAD_X,
  PEOPLE_DUO_STACK_PAD_Y,
  PEOPLE_MINE_SOURCE_CHROME_H_PX,
  PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX,
  PEOPLE_MINE_STACK_PAD_Y_TOP,
  PEOPLE_MINE_TOP_GAP_PX,
} from "../../lib/people/peopleCandidateMediaPresentation";
import {
  PEOPLE_BACK_EDGE_INSET_PX,
  PEOPLE_BACK_SIZE_PX,
} from "../../pages/people/peopleShellLayout";
import { peopleUiCopy } from "../../pages/people/peopleUiCopy";
import type { PeopleMineAtmosphereReport } from "./PeopleCandidateMedia";
import PeopleGroupHostNotch from "./PeopleGroupHostNotch";
import PeopleGroupNote from "./PeopleGroupNote";
import PeopleGroupSourceMedia from "./PeopleGroupSourceMedia";
import PeopleSeePostControl from "./PeopleSeePostControl";

const SOURCE_EDGE_INSET_PX = PEOPLE_BACK_EDGE_INSET_PX;
const SOURCE_BACK_CLEARANCE_PX = 32;
const SOURCE_PAD_LEFT_PX =
  PEOPLE_BACK_EDGE_INSET_PX + PEOPLE_BACK_SIZE_PX + SOURCE_BACK_CLEARANCE_PX;
const SOURCE_CAPTION_OPTICAL_PAD_TOP_PX = 2;

const CAPTION_CLASS =
  `line-clamp-3 w-full max-w-[min(18rem,calc(100%-${SOURCE_PAD_LEFT_PX}px))] text-right text-[13px] leading-tight text-[var(--text)]/82 app-light:text-[var(--text)]`;

const DATE_PILL_BASE =
  "inline-flex h-7 max-w-full items-center truncate rounded-full px-2.5 text-[12px] font-semibold leading-none tracking-tight";

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

export default function PeopleGroupUpCandidatePresentation({
  mediaItems,
  mediaIndex,
  onMediaIndexChange,
  isCurrent,
  withPhoto,
  caption,
  scheduleLabel,
  scheduleLabelKind = null,
  onSeePost,
  groupTitle,
  groupDescription,
  noteResetKey,
  hostDisplayName,
  hostAvatarUrl,
  onOpenHostProfile,
  onAtmosphereChange,
}: {
  mediaItems: readonly PublishedMediaItem[];
  mediaIndex: number;
  onMediaIndexChange: (index: number) => void;
  isCurrent: boolean;
  withPhoto: boolean;
  caption: string | null;
  scheduleLabel: string | null;
  scheduleLabelKind?: PostScheduleLabelKind | null;
  onSeePost?: () => void;
  groupTitle: string;
  groupDescription: string | null;
  noteResetKey: string;
  hostDisplayName: string;
  hostAvatarUrl: string | null;
  onOpenHostProfile?: () => void;
  onAtmosphereChange?: (report: PeopleMineAtmosphereReport) => void;
}) {
  const captionText = caption?.trim() || "";
  const dateText = scheduleLabel?.trim() || "";
  const captionInteractive = Boolean(onSeePost && captionText && isCurrent);
  const showSeePost = Boolean(onSeePost);
  const datePillClass = schedulePillClass(scheduleLabelKind ?? null);
  const title = groupTitle.trim() || peopleUiCopy.groupUpFallbackTitle;

  const dateRow = (
    <div
      className="relative z-[1] flex max-w-full items-center justify-end gap-1.5"
      data-people-group-source-date-row="true"
      data-people-source-date-row="true"
    >
      {showSeePost ? <PeopleSeePostControl onClick={() => onSeePost?.()} /> : null}
      {dateText ? (
        <span className={`${datePillClass} relative`}>{dateText}</span>
      ) : showSeePost ? null : (
        <span className="h-7" aria-hidden />
      )}
    </div>
  );

  const sourceCaption = (
    <div
      className="absolute top-0 right-0 z-[2] flex w-full flex-col items-end justify-start text-right"
      style={{
        paddingTop: SOURCE_CAPTION_OPTICAL_PAD_TOP_PX,
        paddingRight: SOURCE_EDGE_INSET_PX,
        paddingLeft: SOURCE_PAD_LEFT_PX,
        gap: PEOPLE_MINE_SOURCE_DATE_CAPTION_GAP_PX,
      }}
      data-people-duo-source-caption="true"
      data-people-group-source-caption="true"
    >
      {captionInteractive ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSeePost?.();
          }}
          className={`${CAPTION_CLASS} relative z-[1] bg-transparent p-0 text-right transition hover:brightness-[1.03] active:scale-[0.99]`}
          aria-label={`${peopleUiCopy.deckSeePost}: ${captionText}`}
          data-people-duo-source-hit="true"
          data-people-group-source-caption-hit="true"
        >
          {captionText}
        </button>
      ) : (
        <span
          className={`${CAPTION_CLASS} relative ${captionText ? "" : "min-h-[2.4em]"}`}
          aria-hidden={!captionText}
        >
          {captionText}
        </span>
      )}
      {dateRow}
    </div>
  );

  const sourceReserve = (
    <div
      className="relative w-full shrink-0"
      style={{
        minHeight: PEOPLE_MINE_SOURCE_CHROME_H_PX,
        paddingBottom: PEOPLE_MINE_TOP_GAP_PX,
        boxSizing: "content-box",
      }}
      aria-hidden
      data-people-duo-source-reserve="true"
    />
  );

  const portrait = (
    <div
      className="relative mx-auto min-h-0 shrink-0 overflow-visible"
      style={{
        width: "var(--people-mine-portrait-w, 100%)",
        height: "var(--people-mine-portrait-h, auto)",
        paddingTop: PEOPLE_MINE_STACK_PAD_Y_TOP,
        paddingBottom: PEOPLE_DUO_STACK_PAD_Y,
        paddingLeft: PEOPLE_DUO_STACK_PAD_X,
        paddingRight: PEOPLE_DUO_STACK_PAD_X,
        boxSizing: "border-box",
      }}
      data-people-duo-portrait="true"
      data-people-group-portrait="true"
    >
      <div
        className="relative z-[1] h-full w-full"
        data-people-mine-nav-portrait="true"
        style={{ visibility: withPhoto ? "visible" : "visible" }}
      >
        <PeopleGroupSourceMedia
          items={mediaItems}
          activeIndex={mediaIndex}
          onActiveIndexChange={onMediaIndexChange}
          isCurrent={isCurrent}
          enableTapCycle={isCurrent}
          identityKey={noteResetKey}
          onAtmosphereChange={isCurrent ? onAtmosphereChange : undefined}
          hostNotch={
            <PeopleGroupHostNotch
              displayName={hostDisplayName}
              avatarUrl={hostAvatarUrl}
              onOpenProfile={
                isCurrent && onOpenHostProfile ? onOpenHostProfile : undefined
              }
            />
          }
          groupTitle={title}
          onOpenSourcePost={isCurrent ? onSeePost : undefined}
        />
      </div>
    </div>
  );

  return (
    <div
      className="relative box-border flex h-full w-full flex-col overflow-visible"
      data-people-group-candidate="true"
      data-people-canonical-candidate="group"
    >
      <div
        className="relative flex h-full w-full flex-col overflow-visible"
        data-people-mine-nav-motion="true"
      >
        {sourceCaption}
        {sourceReserve}
        <div
          className="w-full shrink-0"
          style={{ height: "var(--people-mine-surplus-pad-top, 0px)" }}
          aria-hidden
          data-people-mine-surplus-pad-top="true"
        />
        {portrait}
        <PeopleGroupNote
          note={groupDescription}
          resetKey={noteResetKey}
          interactive={isCurrent}
          groupDisplayName={title}
          hostAvatarUrl={hostAvatarUrl}
        />
      </div>
    </div>
  );
}
